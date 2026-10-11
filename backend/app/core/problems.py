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
from pydantic import BaseModel, ConfigDict, Field
from pydantic.json_schema import SkipJsonSchema
from pydantic_core import PydanticKnownError
from starlette.exceptions import HTTPException

from app.core.errors import DomainError, PasswordPolicyViolation

logger = logging.getLogger(__name__)

PROBLEM_MEDIA_TYPE = "application/problem+json"
GENERIC_TYPE = "about:blank"
UNEXPECTED_DETAIL = "An unexpected error occurred."
# Los 422 de pydantic comparten la entrada `validation-error` del catálogo (RF-005).
VALIDATION_ERROR = PasswordPolicyViolation
VALIDATION_DETAIL = VALIDATION_ERROR.detail
# Texto de una entrada de `errors` cuando su mensaje podría llevar el valor recibido (RF-011).
GENERIC_FIELD_DETAIL = "Invalid value."
# Claves de `ctx` de pydantic que sólo llevan restricciones del esquema (límites, valores
# permitidos), nunca datos del cliente; las demás (`error`, `input`, …) no se usan.
SAFE_CTX_KEYS = frozenset({
    "gt", "ge", "lt", "le", "multiple_of",
    "min_length", "max_length", "max_digits", "decimal_places", "whole_digits",
    "expected", "expected_schemes", "pattern",
})


# --- Esquema publicado en el contrato (canon: contrato de SPEC-0004) ---
# Los docstrings de estos modelos son la `description` pública del contrato: van en inglés.

def _omittable():
    """Campo opcional que se omite de la respuesta (`exclude_none`) y nunca vale `null`.

    `SkipJsonSchema[None]` quita `null` de los tipos publicados y esto quita el `default`,
    así el contrato lo declara opcional, no anulable.
    """
    return Field(default=None, json_schema_extra=lambda schema: schema.pop("default", None))


class ProblemError(BaseModel):
    """A single validation failure. Carries exactly one location: pointer, parameter or header."""

    model_config = ConfigDict(extra="forbid")

    detail: str
    pointer: str | SkipJsonSchema[None] = _omittable()
    parameter: str | SkipJsonSchema[None] = _omittable()
    header: str | SkipJsonSchema[None] = _omittable()


class Problem(BaseModel):
    """RFC 9457 Problem Details: body of every API error response."""

    model_config = ConfigDict(extra="forbid")

    type: str
    title: str
    status: int
    detail: str | SkipJsonSchema[None] = _omittable()
    instance: str
    errors: list[ProblemError] | SkipJsonSchema[None] = _omittable()


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


# RF-013: campos fijos del 500 de fallback, calculados al importar. Se serializan con
# `json.dumps` (sin el modelo ni `_problem_body`) para poder contestar aunque el traductor
# falle; sólo se añade `instance`, que el esquema `Problem` exige.
FALLBACK_500 = {
    "type": GENERIC_TYPE,
    "title": HTTPStatus.INTERNAL_SERVER_ERROR.phrase,
    "status": 500,
    "detail": UNEXPECTED_DETAIL,
}


def _safely(request: Request, build) -> Response:
    """Ejecuta `build()`; si el propio traductor falla, responde el 500 de fallback."""
    try:
        return build()
    except Exception:
        path = request.url.path
        logger.exception("Problem translator failed on %s %s", request.method, path)
        body = json.dumps({**FALLBACK_500, "instance": path}, separators=(",", ":")).encode()
        return _respond(body, 500)


# --- Manejadores ---

async def _domain_error(request: Request, exc: DomainError) -> Response:
    # El mensaje interno no va al cliente, pero sí al log: en un 5xx es la única pista de
    # la causa (p. ej. por qué CouchDB no respondió), así que va con traza y causa encadenada.
    server_side = exc.status >= 500
    logger.log(
        logging.ERROR if server_side else logging.INFO,
        "%s on %s %s: %s",
        type(exc).__name__, request.method, request.url.path, exc,
        exc_info=exc if server_side else None,
    )
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


def _status_phrase(status: int) -> str:
    """Frase estándar del código; sin ella (p. ej. 499), la de su clase: 400 o 500."""
    try:
        return HTTPStatus(status).phrase
    except ValueError:
        return HTTPStatus(400 if 400 <= status < 500 else 500).phrase


async def _framework_error(request: Request, exc: HTTPException) -> Response:
    # Todo el cálculo, frase incluida, va dentro de `_safely` (RF-013).
    def build() -> Response:
        phrase = _status_phrase(exc.status_code)
        detail = exc.detail if isinstance(exc.detail, str) else phrase
        return _respond(
            _problem_body(
                status=exc.status_code,
                type_=GENERIC_TYPE,
                title=phrase,
                detail=detail,
                instance=request.url.path,
            ),
            exc.status_code,
            headers=exc.headers,  # p. ej. `Allow` en un 405
        )

    return _safely(request, build)


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


def _field_detail(error: dict) -> str:
    """Texto de una entrada de `errors` sin el valor recibido (RF-011).

    No se copia `msg`: para los tipos de pydantic se vuelve a generar desde su plantilla
    con sólo las claves seguras de `ctx`; si la plantilla exige otra (p. ej. `error`, que
    trae el texto de un `ValueError` o el fragmento de un UUID inválido), texto genérico.
    """
    ctx = error.get("ctx") or {}
    safe_ctx = {key: value for key, value in ctx.items() if key in SAFE_CTX_KEYS}
    try:
        return PydanticKnownError(error["type"], safe_ctx).message()
    except KeyError:
        # Tipo propio (`PydanticCustomError`): sin `ctx`, su `msg` es la plantilla constante.
        return GENERIC_FIELD_DETAIL if ctx else error["msg"]
    except TypeError:
        # La plantilla pide una clave de `ctx` que no es segura.
        return GENERIC_FIELD_DETAIL


async def _validation_error(request: Request, exc: RequestValidationError) -> Response:
    # RF-011: nunca se usan `input`, `ctx` (salvo restricciones del esquema) ni `url`.
    def build() -> Response:
        errors = [{**_location(e), "detail": _field_detail(e)} for e in exc.errors()]
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


# --- Contrato OpenAPI (RF-009) ---

PROBLEM_SCHEMA_REF = "#/components/schemas/Problem"
# Esquemas del 422 por defecto de FastAPI; tras sustituirlo nadie los referencia.
FASTAPI_VALIDATION_SCHEMAS = ("HTTPValidationError", "ValidationError")


def _problem_content() -> dict:
    return {PROBLEM_MEDIA_TYPE: {"schema": {"$ref": PROBLEM_SCHEMA_REF}}}


def problem_responses(*errors: type[DomainError]) -> dict[int, dict]:
    """`responses=` de una ruta a partir de los errores de dominio que puede lanzar.

    Si varios comparten código, la descripción une sus títulos (sin repetir).
    """
    titles: dict[int, list[str]] = {}
    for error in errors:
        status_titles = titles.setdefault(error.status, [])
        if error.title not in status_titles:
            status_titles.append(error.title)
    return {
        status: {"description": " / ".join(status_titles), "content": _problem_content()}
        for status, status_titles in titles.items()
    }


def _with_problems(schema: dict) -> dict:
    schemas = schema.setdefault("components", {}).setdefault("schemas", {})
    for name in FASTAPI_VALIDATION_SCHEMAS:
        schemas.pop(name, None)
    problem = Problem.model_json_schema(ref_template="#/components/schemas/{model}")
    schemas.update(problem.pop("$defs"))  # ProblemError
    schemas["Problem"] = problem

    for path_item in schema.get("paths", {}).values():
        for operation in path_item.values():
            responses = operation.setdefault("responses", {})
            # FastAPI declara el 422 en toda operación con entrada; se conserva dónde, no cómo.
            if "422" in responses:
                responses["422"] = {"description": VALIDATION_ERROR.title, "content": _problem_content()}
            responses["500"] = {
                "description": HTTPStatus.INTERNAL_SERVER_ERROR.phrase,
                "content": _problem_content(),
            }
    return schema


def install_problem_openapi(app: FastAPI) -> None:
    """Publica los errores como `Problem` en el OpenAPI de la app (se construye una vez)."""
    build_default = app.openapi

    def openapi() -> dict:
        if app.openapi_schema is None:
            # `build_default` guarda en `app.openapi_schema` la versión sin procesar; se reemplaza.
            app.openapi_schema = _with_problems(build_default())
        return app.openapi_schema

    app.openapi = openapi


def install_problem_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, _domain_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(HTTPException, _framework_error)
    app.add_exception_handler(Exception, _unhandled_error)
