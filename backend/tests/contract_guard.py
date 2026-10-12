"""«Emitido ⊆ declarado» para toda petición a la app real (SPEC-0004 RF-009, enmiendas 3 y 4).

`conftest.py` envuelve la app con `ContractGuard`, así que la comprobación no depende de
qué tests la invoquen: cualquier respuesta de error que la app emita en cualquier test
debe figurar en las respuestas que su operación declara en el contrato.

Cuando el guardián falla, la excepción sale antes de empezar la respuesta, así que
`ServerErrorMiddleware` (exterior al guardián) la registra como «Unhandled error» y emite un
500 que el guardián ya no ve. Ese registro es efecto de la infracción, no otro fallo: el
test cae igualmente por la `AssertionError` (`raise_server_exceptions=True`).
"""
from collections.abc import Callable

from starlette.types import ASGIApp, Message, Receive, Scope, Send


def undeclared_error(
    schema: dict, method: str, path: str, template: str | None, status: int
) -> str | None:
    """Describe la infracción si `status` es un error no declarado; si no, `None`.

    `template` es la plantilla de la ruta que atendió la petición (`None` si ninguna).
    Excluidos por RF-009: peticiones que ninguna ruta del contrato atiende (404 de
    enrutado, rutas fuera del esquema) y métodos que la plantilla no declara (405).
    """
    if status < 400 or template not in schema["paths"]:
        return None
    operation = schema["paths"][template].get(method.lower())
    if operation is None or str(status) in operation["responses"]:
        return None
    return f"{method} {path} → {status} no declarado en la operación {template}"


class ContractGuard:
    """Middleware ASGI de prueba: falla la petición si su código de error no está declarado."""

    def __init__(self, app: ASGIApp, schema_provider: Callable[[], dict]) -> None:
        self.app = app
        self.schema_provider = schema_provider

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def checked_send(message: Message) -> None:
            # Se comprueba al empezar la respuesta, antes de enviar nada: la excepción sube
            # hasta el TestClient (`raise_server_exceptions=True`) y tumba el test.
            if message["type"] == "http.response.start":
                # `APIRoute.matches` (FastAPI) pone en `scope["route"]` la ruta que el router
                # eligió, también en un 405 por coincidencia parcial. Se usa ésa y no la
                # primera plantilla del contrato que casa la ruta: con plantillas solapadas
                # pueden diferir. Una `Route` o un `Mount` de Starlette puros no la fijan y
                # quedan fuera, igual que lo están del contrato.
                route = scope.get("route")
                violation = undeclared_error(
                    self.schema_provider(),
                    scope["method"],
                    scope["path"],
                    getattr(route, "path_format", None),
                    message["status"],
                )
                if violation is not None:
                    raise AssertionError(violation)
            await send(message)

        await self.app(scope, receive, checked_send)
