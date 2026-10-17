"""FastAPI sirve la SPA (SPEC-0007).

El backend sustituye al nginx del frontend: entrega los estáticos del build
(`frontend/dist`) y el enrutado de React Router. Es una frontera HTTP de entrada (capa de
rutas); no toca el núcleo de negocio ni los puertos de salida.

Réplica de la tabla de rutas del `nginx.conf` retirado:
- `/assets/*` y archivos del build → directos (404 real si no existen).
- `/vaults` y `/vaults/*` → negociación por `Accept`: navegación del navegador (prefiere
  `text/html`) ve la SPA; un `fetch` cae al handler de API real (SPEC-0003).
- Resto de rutas sin extensión y sin API → `index.html` (`try_files $uri /index.html`).
- Rutas bajo un prefijo de API conocido → su 404 Problem (SPEC-0004), nunca HTML.
"""
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.errors import SpaResourceNotFound
from app.core.problems import CATCH_ALL_ROUTE_NAME

# Prefijos que son API pura: nunca sirven la SPA (RF-005). Una subruta desconocida bajo
# ellos es un 404 Problem, no HTML. `/sync` se enruta entero en su propio router.
API_PREFIXES = ("/auth", "/admin", "/sync", "/vaults", "/health")

# Raíz del build del frontend. Por defecto `frontend/dist` del repo (correr local y tests);
# en la imagen Docker se fija `FRONTEND_DIST` a la copia del build (ver backend/Dockerfile).
_DEFAULT_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
DIST_DIR = Path(os.environ.get("FRONTEND_DIST", _DEFAULT_DIST))
INDEX_HTML = DIST_DIR / "index.html"


def prefers_html(accept: str | None) -> bool:
    """¿El cliente pide HTML? (RF-003, D-4).

    Mirror del `map $http_accept ~text/html` del `nginx.conf` retirado y del `bypass` de
    `vite.config.ts`: una navegación del navegador incluye `text/html` en `Accept`; un
    `fetch` manda `*/*` o `application/json`.
    """
    return accept is not None and "text/html" in accept.lower()


def _is_api_path(path: str) -> bool:
    """La ruta cae bajo un prefijo de API conocido (exacto o como segmento)."""
    return any(path == prefix or path.startswith(prefix + "/") for prefix in API_PREFIXES)


def _safe_file(full_path: str) -> Path | None:
    """Archivo real dentro del build, o `None`. Acota a `DIST_DIR` (sin path traversal)."""
    root = DIST_DIR.resolve()
    candidate = (root / full_path).resolve()
    if candidate.is_file() and root in candidate.parents:
        return candidate
    return None


class VaultsSpaNegotiation:
    """`/vaults` es a la vez API y ruta de la SPA (RF-003).

    Una navegación del navegador (`GET`/`HEAD` con `Accept: text/html`) recibe la app; un
    `fetch` sigue su curso hasta el handler de API. Sólo `GET`/`HEAD`: un `POST /vaults`
    (crear bóveda) nunca debe recibir HTML aunque traiga `Accept: text/html` (D-3).

    Middleware ASGI puro (no `BaseHTTPMiddleware`): sólo intercepta la navegación a
    `/vaults`; el resto pasa intacto, sin bufferizar la respuesta — así no interfiere con el
    streaming de `/sync/_changes` (SPEC-0005).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] in ("GET", "HEAD"):
            path = scope["path"]
            if path == "/vaults" or path.startswith("/vaults/"):
                accept = Headers(scope=scope).get("accept")
                if prefers_html(accept):
                    await FileResponse(INDEX_HTML)(scope, receive, send)
                    return
        await self.app(scope, receive, send)


def install_spa(app: FastAPI) -> None:
    """Monta la SPA sobre la app (SPEC-0007).

    DONDE no hay build (`DIST_DIR` ausente), la app queda como API pura: no monta nada ni
    rompe el arranque (RF-006). Debe llamarse **después** de incluir los routers de API,
    para que las rutas de API ganen al catch-all.
    """
    if not DIST_DIR.is_dir():
        return

    # `/vaults` ambiguo: negociación por `Accept` antes del enrutado (RF-003).
    app.add_middleware(VaultsSpaNegotiation)

    # Assets con huella del build: directos; inexistente → 404 real de `StaticFiles` (RF-004).
    assets = DIST_DIR / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    # Catch-all de React Router: va al final, tras los routers de API (RF-001/002/004/005).
    # `name=CATCH_ALL_ROUTE_NAME` (RF-007/D-7): identifica esta ruta para que
    # `core/problems.py::_framework_error` la excluya al decidir si un 405 es legítimo.
    @app.get("/{full_path:path}", include_in_schema=False, name=CATCH_ALL_ROUTE_NAME)
    def serve_spa(full_path: str) -> FileResponse:
        # Ruta bajo un prefijo de API conocido: subruta inexistente → 404 Problem (RF-005).
        if _is_api_path("/" + full_path):
            raise SpaResourceNotFound()
        # Archivo real del build (favicon, etc.) → directo (RF-001/004).
        candidate = _safe_file(full_path)
        if candidate is not None:
            return FileResponse(candidate)
        # Se pedía un archivo concreto (tiene extensión) y no existe → 404 real (RF-004).
        if "." in full_path.rsplit("/", 1)[-1]:
            raise SpaResourceNotFound()
        # Ruta de la SPA (sin extensión) → index.html (RF-002).
        return FileResponse(INDEX_HTML)
