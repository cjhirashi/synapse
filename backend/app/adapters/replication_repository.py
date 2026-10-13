from collections.abc import AsyncIterator
from urllib.parse import quote

import httpx

from app.core.config import settings
from app.core.errors import StorageUnavailable
from app.core.ports.replication_port import ReplicationPort
from app.services.sync_filter import MAX_WAIT_MS

# Espera fija de conexión y de lectura de las operaciones normales (s), como `VaultRepository`.
_TIMEOUT = 10
# Margen sobre la espera pedida de un `longpoll` antes de dar el flujo por perdido (s).
_STREAM_MARGIN = 10


class ReplicationRepository(ReplicationPort):
    """`ReplicationPort` sobre la API HTTP de CouchDB, con la credencial admin.

    Cada operación abre su propio `httpx.AsyncClient`: el pool no queda atado al event loop
    de otra petición (uvicorn y TestClient usan loops distintos). En `changes` el cliente
    vive hasta que se agota o abandona el flujo.
    `transport` sólo existe para inyectar respuestas en tests (5xx, cortes a mitad de flujo).
    """

    def __init__(
        self,
        url: str | None = None,
        user: str | None = None,
        password: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self._url = url or settings.COUCHDB_URL
        self._auth = (user or settings.COUCHDB_USER, password or settings.COUCHDB_PASSWORD)
        self._transport = transport

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self._url, auth=self._auth, timeout=_TIMEOUT, transport=self._transport
        )

    async def _request(
        self, method: str, path: str, expected: tuple[int, ...], **kwargs
    ) -> httpx.Response:
        """Hace la petición; red caída o un estado fuera de `expected` → `StorageUnavailable`."""
        async with self._client() as client:
            try:
                response = await client.request(method, path, **kwargs)
            except httpx.HTTPError as exc:
                raise StorageUnavailable(f"CouchDB inaccesible: {exc}") from exc
        _check_status(response, expected, method, path)
        return response

    @staticmethod
    def _local_path(db: str, local_id: str) -> str:
        return f"/{db}/_local/{quote(local_id, safe='')}"

    # --- Lecturas del replicador ---

    async def db_info(self, db: str) -> dict:
        return (await self._request("GET", f"/{db}", (200,))).json()

    async def revs_diff(self, db: str, body: dict[str, list[str]]) -> dict:
        return (await self._request("POST", f"/{db}/_revs_diff", (200,), json=body)).json()

    async def bulk_get(self, db: str, query: dict[str, str], body: dict) -> dict:
        return (await self._request("POST", f"/{db}/_bulk_get", (200,), params=query, json=body)).json()

    async def all_docs(self, db: str, query: dict[str, str], body: dict | None) -> dict:
        if body is None:
            response = await self._request("GET", f"/{db}/_all_docs", (200,), params=query)
        else:
            response = await self._request("POST", f"/{db}/_all_docs", (200,), params=query, json=body)
        return response.json()

    # --- `_changes` en streaming ---

    async def changes(self, db: str, query: dict[str, str], body: dict) -> AsyncIterator[bytes]:
        client = self._client()
        request = client.build_request(
            "POST", f"/{db}/_changes", params=query, json=body,
            timeout=httpx.Timeout(_TIMEOUT, read=_read_timeout(query)),
        )
        try:
            response = await client.send(request, stream=True)
            _check_status(response, (200,), "POST", f"/{db}/_changes")
        except (httpx.HTTPError, StorageUnavailable) as exc:
            await client.aclose()
            if isinstance(exc, StorageUnavailable):
                raise
            raise StorageUnavailable(f"CouchDB inaccesible: {exc}") from exc
        return _stream(client, response)

    # --- Escrituras ---

    async def bulk_docs_replicated(self, db: str, docs: list[dict]) -> list[dict]:
        response = await self._request(
            "POST", f"/{db}/_bulk_docs", (201, 202), json={"docs": docs, "new_edits": False}
        )
        return response.json()

    async def get_local(self, db: str, local_id: str) -> dict | None:
        response = await self._request("GET", self._local_path(db, local_id), (200, 404))
        return response.json() if response.status_code == 200 else None

    async def put_local(self, db: str, local_id: str, doc: dict) -> dict:
        return (await self._request("PUT", self._local_path(db, local_id), (201, 202), json=doc)).json()


def _check_status(response: httpx.Response, expected: tuple[int, ...], method: str, path: str) -> None:
    # `expected` incluye los estados que el llamador interpreta (404, 409): el resto (5xx,
    # 401…) significa que el almacén no está disponible para esta operación.
    if response.status_code not in expected:
        raise StorageUnavailable(f"CouchDB respondió {response.status_code} a {method} {path}")


def _read_timeout(query: dict[str, str]) -> float:
    """Espera de lectura del flujo: la mayor espera pedida (ya acotada) más un margen.

    Un `longpoll` sin `timeout` espera el valor por defecto de CouchDB (60 s = el tope);
    un `heartbeat` hace que CouchDB escriba antes, pero nunca alarga la espera total.
    """
    if query.get("feed") != "longpoll":
        return _TIMEOUT
    wait_ms = int(query.get("timeout", MAX_WAIT_MS))
    return wait_ms / 1000 + _STREAM_MARGIN


async def _stream(client: httpx.AsyncClient, response: httpx.Response) -> AsyncIterator[bytes]:
    """Reenvía el cuerpo tal cual; un corte a mitad → `StorageUnavailable`. Siempre cierra."""
    try:
        async for chunk in response.aiter_raw():
            yield chunk
    except httpx.HTTPError as exc:
        raise StorageUnavailable(f"CouchDB cortó el flujo de _changes: {exc}") from exc
    finally:
        await response.aclose()
        await client.aclose()
