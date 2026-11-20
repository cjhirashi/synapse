"""Canal de lectura para bóvedas compartidas (H-064 F7a).

`/sync/shared/{vault_id}` replica para miembros invitados, lectura pura sobre la base del propietario.
"""
import json
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Path, Request, status
from fastapi.responses import JSONResponse, StreamingResponse

from app.adapters.database import SessionLocal
from app.adapters.vault_member_repository import VaultMemberRepository
from app.core.errors import (
    CheckpointNotFound, InvalidSyncRequest, PasswordChangeRequired, PayloadTooLarge, StorageUnavailable, SyncEndpointNotFound,
)
from app.core.problems import problem_responses
from app.core.ports.replication_port import ReplicationPort
from app.core.shared_sync_rules import (
    ALL_DOCS_BATCH, all_docs_plan, changes_query, filter_all_docs_rows, filter_bulk_get_request, filter_bulk_get_response,
    filter_changes, filter_revs_diff_request, note_range,
)
from app.core.vault_context import user_db_name
from app.routers.auth import SESSION_ERRORS
from app.routers.sync import MAX_LOCAL_BYTES, SyncRoute, get_replication_port, get_sync_user
from app.services import sync_filter

# Para estos endpoints solo se permite lectura; puertos y límites de /sync/db.
_SHARED_RESPONSES = problem_responses(*SESSION_ERRORS, PasswordChangeRequired, PayloadTooLarge, SyncEndpointNotFound)


def get_shared(
    vault_id: Annotated[str, Path()],
    request: Request,
) -> dict:
    """Resuelve acceso a una bóveda compartida.

    (a) `vault_id` no UUID → 404.
    (b) Usuario sin sesión → 401 (get_sync_user).
    (c) Clave de API → 404 (solo sesión).
    (d) No miembro, pendiente, revocado o propietario inactivo → 404.
    Devuelve {owner_db, guest_db, access, vault_id} o levanta SyncEndpointNotFound.
    """
    # Valida UUID canónico.
    if not sync_filter.is_replicable_id(f"vault:{vault_id}"):
        raise SyncEndpointNotFound()

    user = get_sync_user(request)

    # Solo sesión humana (no clave de API).
    if user.via_key:
        raise SyncEndpointNotFound()

    # Sesión SQL de vida corta.
    db = SessionLocal()
    try:
        result = VaultMemberRepository(db).active_access(user.sub, vault_id)
        if result is None:
            raise SyncEndpointNotFound()
        owner_id, access = result
        return {
            "owner_db": user_db_name(owner_id),
            "guest_db": user_db_name(user.sub),
            "access": access,
            "vault_id": vault_id,
        }
    finally:
        db.close()


SharedParams = Annotated[dict, Depends(get_shared)]

shared_router = APIRouter(
    prefix="/sync/shared/{vault_id}",
    tags=["sync-shared"],
    route_class=SyncRoute,
    dependencies=[Depends(get_sync_user)],
    responses=_SHARED_RESPONSES,
)


# --- Raíz e información de la base ---

@shared_router.get(
    "/db/",
    responses={200: {"description": "`db_name`, `update_seq` e `instance_start_time`; sin recuentos."}}
    | problem_responses(StorageUnavailable),
)
async def db_info(shared: SharedParams, port: Annotated[ReplicationPort, Depends(get_replication_port)]):
    return sync_filter.sanitize_db_info(await port.db_info(shared["owner_db"]))


# --- Lectura (pull) ---

_CHANGES_RESPONSES = {
    200: {"description": "Feed de CouchDB, solo documentos legibles, en streaming."}
} | problem_responses(InvalidSyncRequest, StorageUnavailable)


@shared_router.get("/db/_changes", response_class=StreamingResponse, responses=_CHANGES_RESPONSES)
async def changes(request: Request, shared: SharedParams, port: Annotated[ReplicationPort, Depends(get_replication_port)]):
    return await _changes(request, shared, port)


@shared_router.post("/db/_changes", response_class=StreamingResponse, responses=_CHANGES_RESPONSES)
async def changes_post(request: Request, shared: SharedParams, port: Annotated[ReplicationPort, Depends(get_replication_port)]):
    return await _changes(request, shared, port)


async def _changes(request: Request, shared: dict, port: ReplicationPort) -> JSONResponse:
    query, body, wants_docs = changes_query(request.query_params, shared["vault_id"])
    stream = await port.changes(shared["owner_db"], query, body)

    try:
        couch = json.loads(b"".join([chunk async for chunk in stream]))
    except ValueError:
        raise StorageUnavailable("invalid JSON from storage") from None
    return JSONResponse(filter_changes(shared["access"], shared["vault_id"], couch, wants_docs))


@shared_router.post(
    "/db/_revs_diff",
    responses={200: {"description": "Revisiones que faltan, por id."}}
    | problem_responses(InvalidSyncRequest, StorageUnavailable),
)
async def revs_diff(
    body: Annotated[dict[str, Any], Body()],
    shared: SharedParams,
    port: Annotated[ReplicationPort, Depends(get_replication_port)],
):
    forward, local = filter_revs_diff_request(body, shared["vault_id"])
    answered = await port.revs_diff(shared["owner_db"], forward) if forward else {}
    return {**answered, **local}


@shared_router.post(
    "/db/_bulk_get",
    responses={200: {"description": "Un resultado por pedido, en el orden del cliente."}}
    | problem_responses(InvalidSyncRequest, StorageUnavailable),
)
async def bulk_get(
    request: Request,
    body: Annotated[dict[str, Any], Body()],
    shared: SharedParams,
    port: Annotated[ReplicationPort, Depends(get_replication_port)],
):
    query = sync_filter.bulk_get_query(request.query_params)
    plan = filter_bulk_get_request(body, shared["vault_id"])
    couch = await port.bulk_get(shared["owner_db"], query, plan.forward) if plan.forward["docs"] else {"results": []}
    return filter_bulk_get_response(shared["access"], shared["vault_id"], plan, couch)


@shared_router.get(
    "/db/_all_docs",
    responses={200: {"description": "Filas legibles; `total_rows` cuenta solo esas."}}
    | problem_responses(InvalidSyncRequest, StorageUnavailable),
)
async def all_docs(request: Request, shared: SharedParams, port: Annotated[ReplicationPort, Depends(get_replication_port)]):
    return await _all_docs(request, None, shared, port)


@shared_router.post(
    "/db/_all_docs",
    responses={200: {"description": "Filas legibles; `total_rows` cuenta solo esas."}}
    | problem_responses(InvalidSyncRequest, StorageUnavailable),
)
async def all_docs_with_keys(
    request: Request,
    shared: SharedParams,
    port: Annotated[ReplicationPort, Depends(get_replication_port)],
    body: Annotated[dict[str, Any] | None, Body()] = None,
):
    return await _all_docs(request, body, shared, port)


async def _all_docs(request: Request, body: dict | None, shared: dict, port: ReplicationPort) -> dict:
    """Siempre se piden los documentos (hace falta la ruta para decidir) y por lotes: una bóveda puede pesar GiB."""
    vault_id, db, access = shared["vault_id"], shared["owner_db"], shared["access"]
    plan = all_docs_plan(request.query_params, body, vault_id)
    wanted = {"include_docs": "true"}

    async def keyed(keys: list[str]) -> list[dict]:
        rows = (await port.all_docs(db, wanted, {"keys": keys}))["rows"] if keys else []
        return filter_all_docs_rows(access, vault_id, rows, plan.wants_docs)

    rows: list[dict] = []
    if plan.keys is not None:
        rows = await keyed(plan.keys)
    else:
        query = {**note_range(vault_id), **wanted, "limit": str(ALL_DOCS_BATCH)}
        while plan.limit is None or len(rows) < plan.limit:
            page = (await port.all_docs(db, query, None))["rows"]
            rows += filter_all_docs_rows(access, vault_id, page, plan.wants_docs)
            if len(page) < ALL_DOCS_BATCH:
                break
            query = {**query, "startkey": json.dumps(page[-1]["id"]), "skip": "1"}
        rows += await keyed([f"vault:{vault_id}"])
    if plan.limit is not None:
        rows = rows[:plan.limit]
    return {"total_rows": len(rows), "offset": 0, "rows": rows}


# --- Checkpoints del replicador ---

def get_checkpoint_id(local_id: Annotated[str, Path()]) -> str:
    return sync_filter.checkpoint_id(local_id)


LocalId = Annotated[str, Depends(get_checkpoint_id)]


@shared_router.get(
    "/db/_local/{local_id}",
    responses={200: {"description": "Documento `_local` guardado."}}
    | problem_responses(SyncEndpointNotFound, InvalidSyncRequest, StorageUnavailable),
)
async def get_checkpoint(
    local_id: LocalId,
    shared: SharedParams,
    port: Annotated[ReplicationPort, Depends(get_replication_port)],
):
    # Lee de la base del INVITADO con prefijo.
    full_id = f"shared-{shared['vault_id']}-{local_id}"
    if len(full_id) > 128:
        raise SyncEndpointNotFound()

    doc = await port.get_local(shared["guest_db"], full_id)
    if doc is None:
        raise CheckpointNotFound()

    # Reescribe el id al que espera el cliente.
    doc["_id"] = f"_local/{local_id}"
    return doc


@shared_router.put(
    "/db/_local/{local_id}",
    status_code=status.HTTP_201_CREATED,
    responses={201: {"description": "`{ok, id, rev}` de CouchDB."}}
    | problem_responses(SyncEndpointNotFound, InvalidSyncRequest, StorageUnavailable),
)
async def put_checkpoint(
    local_id: LocalId,
    doc: Annotated[dict[str, Any], Body()],
    shared: SharedParams,
    port: Annotated[ReplicationPort, Depends(get_replication_port)],
):
    sync_filter.check_checkpoint_doc(local_id, doc)
    if len(json.dumps(doc)) > MAX_LOCAL_BYTES:
        raise PayloadTooLarge(f"checkpoint over {MAX_LOCAL_BYTES} bytes")

    # Reescribe el id al formato con prefijo para guardar en la base del invitado.
    full_id = f"shared-{shared['vault_id']}-{local_id}"
    if len(full_id) > 128:
        raise SyncEndpointNotFound()

    doc_to_save = {**doc, "_id": full_id}
    return await port.put_local(shared["guest_db"], full_id, doc_to_save)


# --- Comodín final (como /sync/db) ---

_ALL_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "COPY"]


@shared_router.api_route("", methods=_ALL_METHODS, include_in_schema=False)
@shared_router.api_route("/{rest:path}", methods=_ALL_METHODS, include_in_schema=False)
async def shared_endpoint_not_found():
    raise SyncEndpointNotFound()
