"""Traductor único de errores a Problem Details (RFC 9457, SPEC-0004).

Es la única pieza que conoce el formato HTTP de los errores (RF-008): los errores de
dominio (`core/errors.py`), los de validación, los genéricos del framework (404, 405, …)
y los no controlados salen todos como `application/problem+json`.
"""
import json
import logging
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict
from starlette.exceptions import HTTPException

from app.core.errors import DomainError, PasswordPolicyViolation

logger = logging.getLogger(__name__)

PROBLEM_MEDIA_TYPE = "application/problem+json"
GENERIC_TYPE = "about:blank"
UNEXPECTED_DETAIL = "An unexpected error occurred."
# Los 422 de pydantic comparten la entrada `validation-error` del catálogo (RF-005).
VALIDATION_ERROR = PasswordPolicyViolation
VALIDATION_DETAIL = VALIDATION_ERROR.detail


# --- Esquema publicado en el contrato (canon: contrato de SPEC-0004) ---

class ProblemError(BaseModel):
    """Un fallo de validación. Lleva exactamente una ubicación (RF-005)."""

    model_config = ConfigDict(extra="forbid")

    detail: str
    pointer: str | None = None
    parameter: str | None = None
    header: str | None = None


class Problem(BaseModel):
    """Cuerpo de toda respuesta de error de la API."""

    model_config = ConfigDict(extra="forbid")

    type: str
    title: str
    status: int
    detail: str | None = None
    instance: str
    errors: list[ProblemError] | None = None


# --- Construcción de la respuesta ---

def _problem_body(
    *,
    status: int,
    type_: str,
    title: str,
    detail: str | None,
    instance: str,
    errors: list[dict[str, str]] | None = None,
) -> bytes:
    problem = Problem(
        type=type_, title=title, status=status, detail=detail, instance=instance, errors=errors
    )
    return problem.model_dump_json(exclude_none=True).encode()


def _respond(body: bytes, status: int, headers: dict[str, str] | None = None) -> Response:
    return Response(content=body, status_code=status, media_type=PROBLEM_MEDIA_TYPE, headers=headers)


# RF-013: respuesta constante, calculada al importar y sin pasar por `_problem_body`, para
# poder contestar incluso si el traductor falla.
FALLBACK_500_BODY = json.dumps(
    {
        "type": GENERIC_TYPE,
        "title": HTTPStatus.INTERNAL_SERVER_ERROR.phrase,
        "status": 500,
        "detail": UNEXPECTED_DETAIL,
    },
    separators=(",", ":"),
).encode()


def _safely(request: Request, build) -> Response:
    """Ejecuta `build()`; si el propio traductor falla, responde el 500 constante."""
    try:
        return build()
    except Exception:
        logger.exception("Problem translator failed on %s %s", request.method, request.url.path)
        return _respond(FALLBACK_500_BODY, 500)


# --- Manejadores ---

async def _domain_error(request: Request, exc: DomainError) -> Response:
    return _safely(request, lambda: _respond(
        _problem_body(
            status=exc.status,
            type_=exc.type_uri(),
            title=exc.title,
            detail=exc.public_detail,
            instance=request.url.path,
            errors=exc.errors,
        ),
        exc.status,
    ))


async def _framework_error(request: Request, exc: HTTPException) -> Response:
    phrase = HTTPStatus(exc.status_code).phrase
    detail = exc.detail if isinstance(exc.detail, str) else phrase
    return _safely(request, lambda: _respond(
        _problem_body(
            status=exc.status_code,
            type_=GENERIC_TYPE,
            title=phrase,
            detail=detail,
            instance=request.url.path,
        ),
        exc.status_code,
        headers=exc.headers,  # p. ej. `Allow` en un 405
    ))


# --- De un error de pydantic a una ubicación (RF-005) ---

def _escape_pointer_segment(segment: str | int) -> str:
    # RFC 6901: `~` se escapa antes que `/` para no reinterpretar el `~1` recién creado.
    return str(segment).replace("~", "~0").replace("/", "~1")


def _location(error: dict) -> dict[str, str]:
    source, *path = error["loc"]
    if source == "body":
        # JSON inválido: su `loc` lleva una posición en el texto, no un campo → raíz.
        if error["type"] == "json_invalid":
            path = []
        return {"pointer": "#" + "".join("/" + _escape_pointer_segment(s) for s in path)}
    if source == "header":
        return {"header": str(path[0]).replace("_", "-")}
    # query, path y (si apareciera) cookie.
    return {"parameter": str(path[0])}


async def _validation_error(request: Request, exc: RequestValidationError) -> Response:
    # RF-011: de cada error sólo se usa `msg`; nunca `input`, `ctx` ni `url`.
    def build() -> Response:
        errors = [{**_location(e), "detail": e["msg"]} for e in exc.errors()]
        return _respond(
            _problem_body(
                status=VALIDATION_ERROR.status,
                type_=VALIDATION_ERROR.type_uri(),
                title=VALIDATION_ERROR.title,
                detail=VALIDATION_DETAIL,
                instance=request.url.path,
                errors=errors,
            ),
            VALIDATION_ERROR.status,
        )

    return _safely(request, build)


async def _unhandled_error(request: Request, exc: Exception) -> Response:
    # RF-012: la traza va al log; la respuesta es genérica (RF-004).
    logger.error("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return _safely(request, lambda: _respond(
        _problem_body(
            status=500,
            type_=GENERIC_TYPE,
            title=HTTPStatus.INTERNAL_SERVER_ERROR.phrase,
            detail=UNEXPECTED_DETAIL,
            instance=request.url.path,
        ),
        500,
    ))


def install_problem_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, _domain_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(HTTPException, _framework_error)
    app.add_exception_handler(Exception, _unhandled_error)
