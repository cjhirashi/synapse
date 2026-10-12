"""«Emitido ⊆ declarado» para toda petición a la app real (SPEC-0004 RF-009, enmienda 3).

`conftest.py` envuelve la app con `ContractGuard`, así que la comprobación no depende de
qué tests la invoquen: cualquier respuesta de error que la app emita en cualquier test
debe figurar en las respuestas que su operación declara en el contrato.
"""
from starlette.routing import compile_path
from starlette.types import ASGIApp, Message, Receive, Scope, Send


def undeclared_error(schema: dict, method: str, path: str, status: int) -> str | None:
    """Describe la infracción si `status` es un error no declarado; si no, `None`.

    Excluidos por RF-009: rutas que no casan con ninguna plantilla del contrato (404 de
    enrutado) y métodos que la plantilla no declara (405 de enrutado).
    """
    if status < 400:
        return None
    paths = schema["paths"]
    template = next((t for t in paths if compile_path(t)[0].fullmatch(path)), None)
    if template is None:
        return None
    operation = paths[template].get(method.lower())
    if operation is None or str(status) in operation["responses"]:
        return None
    return f"{method} {path} → {status} no declarado en la operación {template}"


class ContractGuard:
    """Middleware ASGI de prueba: falla la petición si su código de error no está declarado."""

    def __init__(self, app: ASGIApp, schema_provider) -> None:
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
                violation = undeclared_error(
                    self.schema_provider(), scope["method"], scope["path"], message["status"]
                )
                assert violation is None, violation
            await send(message)

        await self.app(scope, receive, checked_send)
