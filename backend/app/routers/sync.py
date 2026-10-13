"""Canal de sincronización PouchDB ↔ CouchDB (SPEC-0005; PLAN-0005 §2.1).

El cliente abre `new PouchDB(origin + "/sync/db", {skip_setup: true})`: `db` es un nombre
fijo y la base real (`synapse_user_{sub}`) sale sólo del token (RF-001). Sólo existe el
subconjunto del protocolo que usa el replicador; cualquier otra ruta o método bajo `/sync`
cae en la comodín final → `SyncEndpointNotFound` sin llegar a CouchDB (RF-003).

Todas las rutas son `async def`: `ReplicationPort` es async (un `longpoll` de `_changes` no
ocupa un hilo del pool), y lo síncrono (`VaultService` en el push) va en un hilo dentro del
servicio.
"""
from functools import lru_cache
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends, Path, Request, status
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, Field, JsonValue
from sqlalchemy.orm import Session
from starlette.types import Message, Receive

from app.adapters.database import get_db
from app.adapters.replication_repository import ReplicationRepository
from app.core.dependencies import get_current_user, require_password_changed
from app.core.errors import (
    CheckpointNotFound, InvalidSyncRequest, PasswordChangeRequired, PayloadTooLarge,
    StorageUnavailable, SyncEndpointNotFound,
)
from app.core.ports.replication_port import ReplicationPort
from app.core.ports.vault_port import VaultPort
from app.core.problems import problem_responses
from app.core.schemas import TokenPayload
from app.routers.auth import SESSION_ERRORS
from app.routers.vaults import get_vault_port
from app.services import sync_filter
from app.services.sync_push import SyncPushService
from app.services.vault_service import VaultService

# --- Límites de tamaño (PLAN-0005 §2.1) ---

MAX_BULK_DOCS = 200                 # documentos por lote (el cliente envía 50)
MAX_BODY_BYTES = 4 * 1024 * 1024    # cuerpo de `_bulk_docs` y de cualquier otra ruta
MAX_LOCAL_BYTES = 64 * 1024         # documento `_local` (checkpoint del replicador)

LOCAL_PATH = "/sync/db/_local/{local_id}"


async def _read_capped(receive: Receive, limit: int) -> bytes:
    """Lee el cuerpo completo del flujo ASGI cortando en cuanto supera `limit` bytes.

    Cubre los cuerpos sin `Content-Length` (chunked) y los que mienten en la cabecera: el
    exceso nunca llega a memoria entero.
    """
    body = bytearray()
    while True:
        message = await receive()
        if message["type"] == "http.disconnect":
            break
        body += message.get("body", b"")
        if len(body) > limit:
            raise PayloadTooLarge(f"body over {limit} bytes")
        if not message.get("more_body", False):
            break
    return bytes(body)


def _replay(body: bytes, receive: Receive) -> Receive:
    """`receive` que entrega el cuerpo ya leído en un único mensaje y después delega en el
    original: `StreamingResponse` (`_changes` en `longpoll`) sigue escuchando ahí el
    `http.disconnect` del cliente."""
    pending = True

    async def replay() -> Message:
        nonlocal pending
        if pending:
            pending = False
            return {"type": "http.request", "body": body, "more_body": False}
        return await receive()

    return replay


class SyncRoute(APIRoute):
    """Ruta del canal con tope de cuerpo aplicado **antes** de que FastAPI lo lea.

    FastAPI lee y parsea el cuerpo antes de resolver las dependencias, y convierte en 400
    cualquier excepción levantada durante esa lectura. Por eso el tope no puede ser una
    dependencia ni vivir dentro del flujo: el manejador de la ruta lee el cuerpo con el tope
    y entrega a FastAPI un `receive` que lo reproduce. `_local` admite 64 KiB; el resto, 4 MiB.
    """

    def get_route_handler(self):
        handler = super().get_route_handler()
        limit = MAX_LOCAL_BYTES if self.path_format == LOCAL_PATH else MAX_BODY_BYTES

        async def limited(request: Request):
            declared = request.headers.get("content-length", "")
            if declared.isdigit() and int(declared) > limit:
                raise PayloadTooLarge(f"declared body of {declared} bytes over {limit}")
            body = await _read_capped(request.receive, limit)
            return await handler(Request(request.scope, _replay(body, request.receive)))

        return limited


# --- Dependencias ---

def get_sync_user(
    request: Request,
    # `scope="function"`: la sesión SQL se cierra al volver el endpoint, antes de enviar la
    # respuesta. Con el ámbito por defecto, cada `longpoll` de `_changes` retendría una
    # conexión del pool hasta 60 s.
    db: Annotated[Session, Depends(get_db, scope="function")],
) -> TokenPayload:
    """Las mismas comprobaciones que el resto de la API: 401 sin sesión, 403 con cambio de
    contraseña pendiente (RF-002), en toda ruta del canal, también la comodín."""
    return require_password_changed(get_current_user(request, db), db)


@lru_cache
def get_replication_port() -> ReplicationPort:
    return ReplicationRepository()


def get_sync_db(current_user: TokenPayload = Depends(get_sync_user)) -> str:
    # La base sale sólo del token (RF-001): ningún dato de la petición la elige.
    return f"synapse_user_{current_user.sub}"


def get_push_service(
    current_user: TokenPayload = Depends(get_sync_user),
    db: str = Depends(get_sync_db),
    vault_port: VaultPort = Depends(get_vault_port),
    replication: ReplicationPort = Depends(get_replication_port),
) -> SyncPushService:
    return SyncPushService(VaultService(vault_port, db), vault_port, replication, db, current_user.sub)


Db = Annotated[str, Depends(get_sync_db)]
Port = Annotated[ReplicationPort, Depends(get_replication_port)]

router = APIRouter(
    prefix="/sync",
    tags=["sync"],
    route_class=SyncRoute,
    dependencies=[Depends(get_sync_user)],
    # Toda ruta del canal: sesión (RF-002) y tope de cuerpo de `SyncRoute` (413).
    responses=problem_responses(*SESSION_ERRORS, PasswordChangeRequired, PayloadTooLarge),
)


# --- Esquemas del contrato (PLAN-0005 §4) ---
# Los cuerpos que define CouchDB se documentan abiertos; se cierran los que fija el plan.

_OPEN_OBJECT = {"type": "object", "additionalProperties": True}


def _json(description: str) -> dict:
    return {"description": description, "content": {"application/json": {"schema": _OPEN_OBJECT}}}


class BulkDocsRequest(BaseModel):
    """Lote del replicador. `new_edits` debe ser `false`: el canal sólo replica revisiones."""

    model_config = ConfigDict(extra="forbid")

    docs: list[dict[str, Any]]
    new_edits: Literal[False]


# Códigos de rechazo del push (PLAN-0005 §2.3).
REJECTION_REASON = (
    r"^(invalid-id|owner-mismatch|immutable-field:created_at|vault-name-taken"
    r"|delete-not-allowed|validation-error:.+|not-normalized:.+)$"
)


class BulkDocsRejection(BaseModel):
    """Revisión rechazada; PouchDB trata `forbidden` como *denied* y sigue con el lote."""

    model_config = ConfigDict(extra="forbid")

    id: JsonValue = Field(description="`_id` tal como lo envió el cliente.")
    rev: JsonValue = Field(description="`_rev` tal como lo envió el cliente.")
    error: Literal["forbidden"]
    reason: str = Field(pattern=REJECTION_REASON)


# --- Raíz e información de la base ---

@router.get("/", responses={200: _json("Raíz del servidor, sin `uuid` ni versión.")})
async def server_root():
    return {"couchdb": "Welcome"}


@router.get(
    "/db/",
    responses={200: _json("`db_name`, `update_seq` e `instance_start_time`; sin recuentos.")}
    | problem_responses(StorageUnavailable),
)
async def db_info(db: Db, port: Port):
    return sync_filter.sanitize_db_info(await port.db_info(db))


# --- Lectura (pull) ---

_CHANGES_RESPONSES = (
    {200: _json("Feed `normal` o `longpoll` de CouchDB, sólo bóvedas, en streaming.")}
    | problem_responses(InvalidSyncRequest, StorageUnavailable)
)


@router.get("/db/_changes", response_class=StreamingResponse, responses=_CHANGES_RESPONSES)
async def changes(request: Request, db: Db, port: Port):
    return await _changes(request, db, port)


@router.post(
    "/db/_changes",
    response_class=StreamingResponse,
    responses=_CHANGES_RESPONSES,
)
async def changes_post(request: Request, db: Db, port: Port):
    # El cuerpo del cliente (`doc_ids`, `selector`) no se lee: el selector es fijo (RF-004).
    return await _changes(request, db, port)


async def _changes(request: Request, db: str, port: ReplicationPort) -> StreamingResponse:
    query, body = sync_filter.changes_query(request.query_params)
    # Un fallo al abrir el flujo sale aquí como 503, antes de empezar la respuesta.
    stream = await port.changes(db, query, body)
    return StreamingResponse(stream, media_type="application/json")


@router.post(
    "/db/_revs_diff",
    responses={200: _json("Revisiones que faltan, por id.")}
    | problem_responses(InvalidSyncRequest, StorageUnavailable),
)
async def revs_diff(body: Annotated[dict[str, Any], Body()], db: Db, port: Port):
    forward, local = sync_filter.filter_revs_diff_request(body)
    # Sin ids replicables no se pregunta a CouchDB.
    answered = await port.revs_diff(db, forward) if forward else {}
    return {**answered, **local}


@router.post(
    "/db/_bulk_get",
    responses={200: _json("Un resultado por pedido, en el orden del cliente.")}
    | problem_responses(InvalidSyncRequest, StorageUnavailable),
)
async def bulk_get(request: Request, body: Annotated[dict[str, Any], Body()], db: Db, port: Port):
    query = sync_filter.bulk_get_query(request.query_params)
    plan = sync_filter.filter_bulk_get_request(body)
    couch = await port.bulk_get(db, query, plan.forward) if plan.forward["docs"] else {"results": []}
    return sync_filter.merge_bulk_get_response(plan, couch)


@router.get(
    "/db/_all_docs",
    responses={200: _json("Filas de bóvedas; `total_rows` cuenta sólo esas.")}
    | problem_responses(InvalidSyncRequest, StorageUnavailable),
)
async def all_docs(request: Request, db: Db, port: Port):
    return await _all_docs(request, None, db, port)


@router.post(
    "/db/_all_docs",
    responses={200: _json("Filas de bóvedas; `total_rows` cuenta sólo esas.")}
    | problem_responses(InvalidSyncRequest, StorageUnavailable),
)
async def all_docs_with_keys(
    request: Request, db: Db, port: Port, body: Annotated[dict[str, Any] | None, Body()] = None,
):
    return await _all_docs(request, body, db, port)


async def _all_docs(request: Request, body: dict | None, db: str, port: ReplicationPort) -> dict:
    query, forward = sync_filter.all_docs_query(request.query_params, body)
    if forward is not None and not forward["keys"]:
        return sync_filter.sanitize_all_docs_response({"rows": []})  # sólo había ids internos
    return sync_filter.sanitize_all_docs_response(await port.all_docs(db, query, forward))


# --- Escritura (push) ---

@router.post(
    "/db/_bulk_docs",
    status_code=status.HTTP_201_CREATED,
    response_model=list[BulkDocsRejection],
    responses=problem_responses(InvalidSyncRequest, StorageUnavailable),
)
async def bulk_docs(body: BulkDocsRequest, service: Annotated[SyncPushService, Depends(get_push_service)]):
    """Push validado (§2.3): responde sólo los rechazos; `[]` si se aceptó todo."""
    if len(body.docs) > MAX_BULK_DOCS:
        raise PayloadTooLarge(f"{len(body.docs)} documents over {MAX_BULK_DOCS}")
    return await service.push(body.docs)


# --- Checkpoints del replicador ---

LocalId = Annotated[str, Path(description="Id del checkpoint, sin el prefijo `_local/`.")]


@router.get(
    "/db/_local/{local_id}",
    responses={200: _json("Documento `_local` guardado.")}
    | problem_responses(CheckpointNotFound, StorageUnavailable),
)
async def get_checkpoint(local_id: LocalId, db: Db, port: Port):
    doc = await port.get_local(db, local_id)
    if doc is None:
        raise CheckpointNotFound()  # el replicador lo lee como "sin checkpoint"
    return doc


@router.put(
    "/db/_local/{local_id}",
    status_code=status.HTTP_201_CREATED,
    responses={201: _json("`{ok, id, rev}` de CouchDB.")}
    | problem_responses(InvalidSyncRequest, StorageUnavailable),
)
async def put_checkpoint(local_id: LocalId, doc: Annotated[dict[str, Any], Body()], db: Db, port: Port):
    return await port.put_local(db, local_id, doc)


# --- Comodín final (RF-003) ---
# Declarada la última: Starlette elige la primera ruta que casa ruta **y** método, así que
# un método no previsto en una ruta conocida (`DELETE _local/x`) también cae aquí, en lugar
# de un 405 que delataría que la ruta existe. Fuera del contrato (`include_in_schema`).

_ALL_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "COPY"]


@router.api_route("", methods=_ALL_METHODS, include_in_schema=False)
@router.api_route("/{rest:path}", methods=_ALL_METHODS, include_in_schema=False)
async def sync_endpoint_not_found():
    raise SyncEndpointNotFound()
