"""`/sync/**` de punta a punta: TestClient + CouchDB real (SPEC-0005; PLAN-0005 §2.1, §5).

Que cada error emitido esté declarado en el contrato lo comprueba `ContractGuard` en toda
la suite; aquí se comprueban códigos, cuerpos y lo que queda en CouchDB. Las peticiones
imitan las del replicador de PouchDB. Los helpers los reutiliza `test_sync_isolation.py`.
"""
import json
import uuid

import httpx
import pytest

from app.adapters.replication_repository import ReplicationRepository
from app.adapters.vault_repository import DESIGN_DOC, VaultRepository
from app.core.config import settings
from app.core.models.user import User
from app.core.ports.replication_port import ReplicationPort
from app.main import app
from app.routers.sync import get_replication_port
from app.routers.vaults import get_vault_port
from app.services.vault_service import name_key, utc_now
from tests.conftest import SEED_EMAIL
from tests.test_vaults_api import AUTH, assert_problem, create, stored_docs, user_db

CHECKPOINT = "_local/2f1a9c0d6b7e4c35"  # id de replicación de PouchDB (opaco)
CHECKPOINT_ID = CHECKPOINT.removeprefix("_local/")

# Límites de PLAN-0005 §2.1 con sus valores literales, no con las constantes del router:
# cambiar un límite debe romper la prueba (enmienda 1, VC-6).
BULK_DOCS_LIMIT = 200
BODY_LIMIT = 4 * 1024 * 1024
LOCAL_LIMIT = 64 * 1024


# --- Helpers ---

def owner_of(db, email: str = SEED_EMAIL) -> str:
    return db.query(User).filter(User.email == email).one().id


def vault_doc(owner_id: str, name: str = "Notas", **fields) -> dict:
    """Revisión nueva (generación 1) de una bóveda, como la escribe el replicador."""
    rev_hash, now = uuid.uuid4().hex, utc_now()
    return {
        "_id": f"vault:{uuid.uuid4()}", "_rev": f"1-{rev_hash}",
        "_revisions": {"start": 1, "ids": [rev_hash]},
        "type": "vault", "name": name, "description": None, "tags": [],
        "owner_id": owner_id, "created_at": now, "updated_at": now, "deleted_at": None,
        **fields,
    }


def child_of(doc: dict, **changes) -> dict:
    """Revisión hija de `doc` (misma bóveda, una generación más)."""
    rev_hash, start = uuid.uuid4().hex, doc["_revisions"]["start"] + 1
    return {
        **doc, "_rev": f"{start}-{rev_hash}", "updated_at": utc_now(),
        "_revisions": {"start": start, "ids": [rev_hash, *doc["_revisions"]["ids"]]},
        **changes,
    }


def push(client, docs: list[dict], **extra):
    return client.post("/sync/db/_bulk_docs", json={"docs": docs, "new_edits": False, **extra})


def json_of_size(size: int, **fields) -> bytes:
    """JSON de exactamente `size` bytes: `fields` más un relleno `pad` de ASCII."""
    overhead = len(json.dumps({**fields, "pad": ""}).encode())
    return json.dumps({**fields, "pad": "x" * (size - overhead)}).encode()


def couch_get(db_name: str, doc_id: str, **params) -> httpx.Response:
    return httpx.get(f"{settings.COUCHDB_URL}/{db_name}/{doc_id}", params=params, auth=AUTH)


def ensure_design(db_name: str) -> None:
    """`_design/vaults` en la base, como lo deja la API REST al listar (409 = ya estaba)."""
    res = httpx.put(f"{settings.COUCHDB_URL}/{db_name}/_design/vaults", json=DESIGN_DOC, auth=AUTH)
    assert res.status_code in (201, 202, 409), res.text


def reservation_id(name: str) -> str:
    return f"vault-name:{name_key(name)}"


def change_ids(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [row["id"] for row in response.json()["results"]]


def without_instance(body: dict) -> dict:
    return {k: v for k, v in body.items() if k != "instance"}


@pytest.fixture
def seeded(ready_admin, db):
    """Base del admin con una bóveda (REST), su reserva y `_design/vaults`."""
    vault = create(ready_admin, name="Notas").json()
    db_name = user_db(db)
    ensure_design(db_name)
    stored = set(stored_docs(db_name)) | {"_design/vaults"}
    assert {f"vault:{vault['id']}", reservation_id("Notas"), "_design/vaults"} <= stored
    return {"db": db_name, "vault_id": f"vault:{vault['id']}", "owner": owner_of(db)}


@pytest.fixture
def couch_override():
    """Sustituye los puertos de las rutas de `/sync` durante un test."""
    def install(replication: ReplicationPort, vaults=None):
        app.dependency_overrides[get_replication_port] = lambda: replication
        if vaults is not None:
            app.dependency_overrides[get_vault_port] = lambda: vaults

    yield install
    app.dependency_overrides.pop(get_replication_port, None)
    app.dependency_overrides.pop(get_vault_port, None)


class UntouchablePort(ReplicationPort):
    """Puerto que falla el test si una petición llega a CouchDB."""

    @staticmethod
    def _reached(operation: str):
        raise AssertionError(f"la petición llegó a CouchDB ({operation})")

    async def db_info(self, db):
        self._reached("db_info")

    async def changes(self, db, query, body):
        self._reached("changes")

    async def revs_diff(self, db, body):
        self._reached("revs_diff")

    async def bulk_get(self, db, query, body):
        self._reached("bulk_get")

    async def all_docs(self, db, query, body):
        self._reached("all_docs")

    async def bulk_docs_replicated(self, db, docs):
        self._reached("bulk_docs_replicated")

    async def get_local(self, db, local_id):
        self._reached("get_local")

    async def put_local(self, db, local_id, doc):
        self._reached("put_local")


# Una petición a cada operación del contrato (PLAN-0005 §2.1).
CHANNEL_REQUESTS = [
    ("GET", "/sync/", {}),
    ("GET", "/sync/db/", {}),
    ("GET", "/sync/db/_changes", {}),
    ("POST", "/sync/db/_changes", {"json": {}}),
    ("POST", "/sync/db/_revs_diff", {"json": {}}),
    ("POST", "/sync/db/_bulk_get", {"json": {"docs": []}}),
    ("GET", "/sync/db/_all_docs", {}),
    ("POST", "/sync/db/_all_docs", {"json": {"keys": []}}),
    ("POST", "/sync/db/_bulk_docs", {"json": {"docs": [], "new_edits": False}}),
    ("GET", f"/sync/db/{CHECKPOINT}", {}),
    ("PUT", f"/sync/db/{CHECKPOINT}", {"json": {"last_seq": "0"}}),
]

# Fuera del subconjunto: comodín final, sin llegar a CouchDB (RF-003).
OUT_OF_SUBSET = [
    ("PUT", "/sync/db/x", {"json": {}}),
    ("GET", "/sync/db/x", {}),
    ("DELETE", "/sync/db/_local/x", {}),
    ("POST", "/sync/db/_find", {"json": {"selector": {}}}),
    ("POST", "/sync/db/_purge", {"json": {}}),
    ("GET", "/sync/db/_security", {}),
    ("PUT", "/sync/db/_security", {"json": {}}),
    ("GET", "/sync/db/_design/vaults", {}),
    ("GET", "/sync/db/_design/vaults/_view/by_created", {}),
    ("PUT", "/sync/db/_bulk_docs", {"json": {}}),
    ("DELETE", "/sync/db/", {}),
    ("PUT", "/sync/db/", {}),
    ("POST", "/sync/", {}),
    ("GET", "/sync", {}),
    ("GET", "/sync/db", {}),
    ("GET", "/sync/_all_dbs", {}),
    ("GET", "/sync/synapse_user_x/_all_docs", {}),
    ("GET", "/sync/db/_local/a/b", {}),
    # Ids de checkpoint fuera del formato de PouchDB (enmienda 1, VC-1). Codificados porque
    # `httpx` normaliza `..` en claro antes de enviar; Starlette los decodifica al casar la
    # ruta, así que llegan como `..` y `.`, igual que un `..` en claro desde otro cliente.
    ("GET", "/sync/db/_local/%2E%2E", {}),
    ("PUT", "/sync/db/_local/%2E%2E", {"json": {}}),
    ("GET", "/sync/db/_local/%2E", {}),
    ("PUT", "/sync/db/_local/%2E", {"json": {}}),
    ("GET", "/sync/db/_local/a%20b", {}),
    ("GET", "/sync/db/_local/a%2Fb", {}),
    ("GET", f"/sync/db/_local/{'a' * 129}", {}),
]


def send(client, method: str, path: str, kwargs: dict):
    return client.request(method, path, **kwargs)


# --- T-024: sesión en todo el canal y comodín (RF-002, RF-003) ---

def test_rf_002_every_sync_route_requires_a_session(client):
    for method, path, kwargs in CHANNEL_REQUESTS + OUT_OF_SUBSET:
        assert_problem(send(client, method, path, kwargs), 401, "not-authenticated")


def test_rf_002_pending_password_change_blocks_every_sync_route(client, auth_cookies):
    for method, path, kwargs in CHANNEL_REQUESTS + OUT_OF_SUBSET:
        assert_problem(send(client, method, path, kwargs), 403, "password-change-required")


def test_rf_003_out_of_subset_is_404_without_reaching_couchdb(ready_admin, couch_override):
    couch_override(UntouchablePort())
    bodies = []
    for method, path, kwargs in OUT_OF_SUBSET:
        res = send(ready_admin, method, path, kwargs)
        bodies.append(without_instance(assert_problem(res, 404, "sync-endpoint-not-found")))
    # Mismo cuerpo para toda ruta, método o base nombrada: nada se distingue.
    assert all(body == bodies[0] for body in bodies)


def test_rf_003_head_is_out_of_subset(ready_admin, couch_override):
    couch_override(UntouchablePort())
    for path in ("/sync/", "/sync/db/", "/sync/db/_changes"):
        res = ready_admin.head(path)
        assert res.status_code == 404, path


# --- T-025: sólo bóvedas salen del servidor (RF-004) ---

def test_rf_004_root_answers_without_server_identity(ready_admin):
    res = ready_admin.get("/sync/")
    assert (res.status_code, res.json()) == (200, {"couchdb": "Welcome"})


def test_rf_004_db_info_has_no_counts_nor_real_name(seeded, ready_admin):
    res = ready_admin.get("/sync/db/")
    assert res.status_code == 200, res.text
    info = res.json()
    assert set(info) == {"db_name", "update_seq", "instance_start_time"}
    assert info["db_name"] == "db"


@pytest.mark.parametrize("params", [
    {},
    {"include_docs": "true", "style": "all_docs"},
    {"feed": "longpoll", "since": "0", "timeout": "1000"},
    # Filtros del cliente: se descartan y el selector sigue siendo el de bóvedas.
    {"filter": "_doc_ids", "doc_ids": '["vault-name:notas", "_design/vaults"]'},
    {"filter": "_view", "view": "vaults/by_created"},
])
def test_rf_004_changes_only_lists_vaults(seeded, ready_admin, params):
    assert change_ids(ready_admin.get("/sync/db/_changes", params=params)) == [seeded["vault_id"]]


def test_rf_004_changes_post_ignores_the_client_selector(seeded, ready_admin):
    body = {"selector": {"_id": {"$regex": "^vault-name"}}, "doc_ids": [reservation_id("Notas")]}
    res = ready_admin.post("/sync/db/_changes", params={"filter": "_selector"}, json=body)
    assert change_ids(res) == [seeded["vault_id"]]


def test_rf_004_longpoll_waits_and_delivers_only_a_vault_change(seeded, ready_admin):
    since = ready_admin.get("/sync/db/_changes").json()["last_seq"]
    # Una reserva nueva (otra bóveda por REST) cambia la base, pero sólo la bóveda sale.
    created = create(ready_admin, name="Diario").json()
    res = ready_admin.get("/sync/db/_changes", params={"feed": "longpoll", "since": since, "timeout": "5000"})
    assert change_ids(res) == [f"vault:{created['id']}"]


def test_rf_004_longpoll_without_changes_ends_with_the_timeout(seeded, ready_admin):
    since = ready_admin.get("/sync/db/_changes").json()["last_seq"]
    res = ready_admin.get("/sync/db/_changes", params={"feed": "longpoll", "since": since, "timeout": "200"})
    assert change_ids(res) == []


def test_rf_004_continuous_feed_is_a_validation_error(ready_admin):
    res = ready_admin.get("/sync/db/_changes", params={"feed": "continuous"})
    assert_problem(res, 422, "validation-error")


def test_rf_004_all_docs_only_lists_vaults(seeded, ready_admin):
    for res in (
        ready_admin.get("/sync/db/_all_docs", params={"include_docs": "true"}),
        ready_admin.get("/sync/db/_all_docs", params={"startkey": '"_design/"', "endkey": '"vault-name:￿"'}),
        ready_admin.post("/sync/db/_all_docs", json={
            "keys": [seeded["vault_id"], reservation_id("Notas"), "_design/vaults"],
        }),
    ):
        assert res.status_code == 200, res.text
        body = res.json()
        assert [row["id"] for row in body["rows"]] == [seeded["vault_id"]]
        assert body["total_rows"] == 1


def test_rf_004_all_docs_with_only_internal_keys_is_empty(seeded, ready_admin, couch_override):
    couch_override(UntouchablePort())
    res = ready_admin.post("/sync/db/_all_docs", json={"keys": [reservation_id("Notas"), "_design/vaults"]})
    assert (res.status_code, res.json()["rows"]) == (200, [])


def test_rf_004_bulk_get_hides_reservations_and_design(seeded, ready_admin):
    asked = [seeded["vault_id"], reservation_id("Notas"), "_design/vaults"]
    res = ready_admin.post("/sync/db/_bulk_get", params={"revs": "true"},
                           json={"docs": [{"id": doc_id} for doc_id in asked]})
    assert res.status_code == 200, res.text
    results = res.json()["results"]
    assert [r["id"] for r in results] == asked
    assert results[0]["docs"][0]["ok"]["_id"] == seeded["vault_id"]
    assert "_revisions" in results[0]["docs"][0]["ok"]
    for hidden in results[1:]:
        assert hidden["docs"][0]["error"]["error"] == "not_found"


def test_rf_004_revs_diff_reports_internal_ids_as_missing(seeded, ready_admin, couch_override):
    reservation = couch_get(seeded["db"], reservation_id("Notas")).json()
    couch_override(UntouchablePort())
    res = ready_admin.post("/sync/db/_revs_diff", json={reservation["_id"]: [reservation["_rev"]]})
    assert res.json() == {reservation["_id"]: {"missing": [reservation["_rev"]]}}


# --- T-026: push validado y límites (RF-005, RF-006, RF-007) ---

def test_rf_005_valid_push_is_stored_with_its_rev_and_reserves_the_name(ready_admin, db):
    doc = vault_doc(owner_of(db), name="Proyectos")
    res = push(ready_admin, [doc])
    assert (res.status_code, res.json()) == (201, [])
    stored = couch_get(user_db(db), doc["_id"]).json()
    assert stored["_rev"] == doc["_rev"] and stored["name"] == "Proyectos"
    assert couch_get(user_db(db), reservation_id("Proyectos")).status_code == 200
    # La API REST la ve como cualquier otra bóveda.
    names = [v["name"] for v in ready_admin.get("/vaults").json()["items"]]
    assert names == ["Proyectos"]


def test_rf_006_invalid_documents_are_rejected_one_by_one(ready_admin, db):
    owner = owner_of(db)
    good = vault_doc(owner, name="Buena")
    unnormalized = vault_doc(owner, name="  Mala ")
    foreign = vault_doc(str(uuid.uuid4()), name="Ajena")
    reservation = {**vault_doc(owner), "_id": reservation_id("Otra")}
    res = push(ready_admin, [unnormalized, good, foreign, reservation])
    assert res.status_code == 201, res.text
    assert res.json() == [
        {"id": unnormalized["_id"], "rev": unnormalized["_rev"], "error": "forbidden", "reason": "not-normalized:name"},
        {"id": foreign["_id"], "rev": foreign["_rev"], "error": "forbidden", "reason": "owner-mismatch"},
        {"id": reservation["_id"], "rev": reservation["_rev"], "error": "forbidden", "reason": "invalid-id"},
    ]
    stored = stored_docs(user_db(db))
    assert good["_id"] in stored
    assert not {unnormalized["_id"], foreign["_id"]} & set(stored)
    assert reservation_id("Otra") not in stored


def test_rf_008_name_taken_through_rest_is_rejected(ready_admin, db):
    create(ready_admin, name="Notas")
    doc = vault_doc(owner_of(db), name="notas")
    assert push(ready_admin, [doc]).json()[0]["reason"] == "vault-name-taken"


def test_rf_007_rejection_echoes_ids_that_are_not_strings(ready_admin, db):
    doc = {**vault_doc(owner_of(db)), "_id": 42}
    res = push(ready_admin, [doc])
    assert (res.status_code, res.json()[0]["id"], res.json()[0]["reason"]) == (201, 42, "invalid-id")


@pytest.mark.parametrize("body", [
    {"docs": [], "new_edits": True},
    {"docs": []},                                   # CouchDB asume `new_edits: true`
    {"docs": [], "new_edits": False, "all_or_nothing": True},
    {"docs": {}, "new_edits": False},
    {"docs": [1], "new_edits": False},
])
def test_rf_005_bulk_docs_body_outside_the_protocol_is_422(ready_admin, body):
    assert_problem(ready_admin.post("/sync/db/_bulk_docs", json=body), 422, "validation-error")


def test_rf_005_more_than_200_documents_is_413(ready_admin, db, couch_override):
    couch_override(UntouchablePort())
    docs = [vault_doc(owner_of(db), name=f"V{i}") for i in range(BULK_DOCS_LIMIT + 1)]
    assert_problem(push(ready_admin, docs), 413, "payload-too-large")


def test_rf_005_exactly_200_documents_are_stored(ready_admin, db):
    docs = [vault_doc(owner_of(db), name=f"V{i}") for i in range(BULK_DOCS_LIMIT)]
    res = push(ready_admin, docs)
    assert res.status_code == 201 and res.json() == []


def bulk_docs_bytes(client, body: bytes):
    return client.post("/sync/db/_bulk_docs", content=body, headers={"content-type": "application/json"})


def test_rf_005_body_over_4_mib_is_413(ready_admin, couch_override):
    couch_override(UntouchablePort())
    body = json_of_size(BODY_LIMIT + 1, docs=[], new_edits=False)
    assert_problem(bulk_docs_bytes(ready_admin, body), 413, "payload-too-large")


def test_rf_005_body_of_exactly_4_mib_passes_the_cap(ready_admin, couch_override):
    """Dentro del tope el cuerpo llega a la validación: el campo `pad` sobra (422, no 413)."""
    couch_override(UntouchablePort())
    body = json_of_size(BODY_LIMIT, docs=[], new_edits=False)
    assert_problem(bulk_docs_bytes(ready_admin, body), 422, "validation-error")


def test_rf_005_chunked_body_over_the_limit_is_413(ready_admin, couch_override):
    """Sin `Content-Length` el tope se aplica al leer el flujo, no a la cabecera."""
    couch_override(UntouchablePort())
    chunk = b" " * (1024 * 1024)
    chunks = iter([b'{"new_edits": false, "docs": []', *[chunk] * 5, b"}"])
    res = ready_admin.post("/sync/db/_bulk_docs", content=chunks, headers={"content-type": "application/json"})
    assert "content-length" not in res.request.headers
    assert_problem(res, 413, "payload-too-large")


def put_checkpoint_bytes(client, body: bytes):
    return client.put(f"/sync/db/{CHECKPOINT}", content=body, headers={"content-type": "application/json"})


def test_rf_005_local_over_64_kib_is_413(ready_admin, couch_override):
    couch_override(UntouchablePort())
    res = put_checkpoint_bytes(ready_admin, json_of_size(LOCAL_LIMIT + 1, session_id="s"))
    assert_problem(res, 413, "payload-too-large")


def test_rf_005_local_of_exactly_64_kib_is_stored(ready_admin):
    res = put_checkpoint_bytes(ready_admin, json_of_size(LOCAL_LIMIT, session_id="s"))
    assert res.status_code == 201


# --- T-090: cuerpo de un checkpoint (RF-010, enmienda 1 · VC-5) ---

@pytest.mark.parametrize("doc", [
    {"last_seq": "1", "_deleted": True},          # CouchDB respondería 200 y lo borraría
    {"last_seq": "1", "_foo": 1},                 # CouchDB: 400 "Bad special document member"
    {"last_seq": "1", "_id": "_local/otro"},      # otro checkpoint distinto del de la ruta
    {"last_seq": "1", "_id": CHECKPOINT_ID},      # sin el prefijo `_local/`
    {"last_seq": "1", "_rev": "zz"},              # CouchDB: 400 "Invalid rev format"
    {"last_seq": "1", "_rev": "1-abc"},           # CouchDB: 500 (sólo admite `0-N`)
    {"last_seq": "1", "_rev": 3},
])
def test_rf_010_malformed_checkpoint_is_422_without_reaching_couchdb(ready_admin, couch_override, doc):
    couch_override(UntouchablePort())
    assert_problem(ready_admin.put(f"/sync/db/{CHECKPOINT}", json=doc), 422, "validation-error")


def test_rf_010_checkpoint_as_pouchdb_writes_it_is_stored(ready_admin):
    """Como lo reescribe el replicador: con su `_id` y el `_rev` que devolvió la lectura."""
    first = ready_admin.put(f"/sync/db/{CHECKPOINT}", json={"_id": CHECKPOINT, "last_seq": "1"})
    assert first.status_code == 201
    again = {"_id": CHECKPOINT, "_rev": first.json()["rev"], "last_seq": "2"}
    assert ready_admin.put(f"/sync/db/{CHECKPOINT}", json=again).status_code == 201
    assert ready_admin.get(f"/sync/db/{CHECKPOINT}").json()["last_seq"] == "2"


# --- T-027: protocolo completo de PouchDB, reanudable e idempotente (RF-010, RF-019) ---

def test_rf_010_pouchdb_replication_sequence_is_resumable_and_idempotent(ready_admin, db):
    owner, db_name = owner_of(db), user_db(db)

    # Arranque: raíz, información y checkpoint (aún no existe).
    assert ready_admin.get("/sync/").status_code == 200
    assert ready_admin.get("/sync/db/").status_code == 200
    assert_problem(ready_admin.get(f"/sync/db/{CHECKPOINT}"), 404, "checkpoint-not-found")

    # Push: `_revs_diff` → `_bulk_docs` → checkpoint.
    batch = [vault_doc(owner, name="Uno"), vault_doc(owner, name="Dos")]
    diff = ready_admin.post("/sync/db/_revs_diff", json={d["_id"]: [d["_rev"]] for d in batch}).json()
    assert diff == {d["_id"]: {"missing": [d["_rev"]]} for d in batch}
    assert push(ready_admin, batch).json() == []
    put = ready_admin.put(f"/sync/db/{CHECKPOINT}", json={"session_id": "s1", "last_seq": "2"})
    assert put.status_code == 201 and put.json()["ok"] is True
    checkpoint = ready_admin.get(f"/sync/db/{CHECKPOINT}").json()
    assert (checkpoint["last_seq"], checkpoint["_id"]) == ("2", CHECKPOINT)

    # Pull: `_changes` → `_bulk_get` con `revs`.
    feed = ready_admin.get("/sync/db/_changes", params={"style": "all_docs", "since": "0", "limit": "100"}).json()
    assert {row["id"] for row in feed["results"]} == {d["_id"] for d in batch}
    got = ready_admin.post("/sync/db/_bulk_get", params={"revs": "true", "latest": "true"}, json={
        "docs": [{"id": row["id"], "rev": row["changes"][0]["rev"]} for row in feed["results"]],
    }).json()
    assert {r["docs"][0]["ok"]["_rev"] for r in got["results"]} == {d["_rev"] for d in batch}

    # Reanudar desde el checkpoint: sólo lo nuevo.
    since = feed["last_seq"]
    assert change_ids(ready_admin.get("/sync/db/_changes", params={"since": since})) == []
    newer = child_of(batch[0], name="Uno editada")
    assert push(ready_admin, [newer]).json() == []
    assert change_ids(ready_admin.get("/sync/db/_changes", params={"since": since})) == [newer["_id"]]

    # Reenvío del mismo lote (corte a mitad): aceptado sin duplicar ni abrir conflictos.
    assert push(ready_admin, [*batch, newer]).json() == []
    for doc in batch:
        stored = couch_get(db_name, doc["_id"], conflicts="true").json()
        assert "_conflicts" not in stored
    assert ready_admin.post("/sync/db/_revs_diff", json={newer["_id"]: [newer["_rev"]]}).json() == {}
    reservations = [i for i in stored_docs(db_name) if i.startswith("vault-name:")]
    assert sorted(reservations) == sorted(reservation_id(n) for n in ("Uno editada", "Dos"))


def test_rf_019_unreachable_couchdb_is_503_on_every_storage_route(ready_admin, db, couch_override):
    down = "http://127.0.0.1:1"
    couch_override(ReplicationRepository(url=down), VaultRepository(url=down))
    for res in (
        ready_admin.get("/sync/db/"),
        ready_admin.get("/sync/db/_changes"),
        ready_admin.post("/sync/db/_revs_diff", json={f"vault:{uuid.uuid4()}": ["1-a"]}),
        ready_admin.post("/sync/db/_bulk_get", json={"docs": [{"id": f"vault:{uuid.uuid4()}"}]}),
        ready_admin.get("/sync/db/_all_docs"),
        push(ready_admin, [vault_doc(owner_of(db))]),
        ready_admin.get(f"/sync/db/{CHECKPOINT}"),
        ready_admin.put(f"/sync/db/{CHECKPOINT}", json={"last_seq": "1"}),
    ):
        assert_problem(res, 503, "storage-unavailable")


# --- T-030: un `longpoll` no retiene la sesión SQL ---

class RecordingPort(UntouchablePort):
    """Sólo `changes`: anota cuándo se empieza a enviar el flujo."""

    def __init__(self, events: list[str]):
        self.events = events

    async def changes(self, db, query, body):
        async def stream():
            self.events.append("stream")
            yield b'{"results":[],"last_seq":"0"}'

        return stream()


def test_rf_010_changes_releases_the_sql_session_before_streaming(ready_admin, couch_override):
    from app.adapters.database import get_db
    from tests.conftest import override_get_db

    events: list[str] = []

    def recording_get_db():
        yield from override_get_db()
        events.append("db closed")

    couch_override(RecordingPort(events))
    app.dependency_overrides[get_db] = recording_get_db
    try:
        assert ready_admin.get("/sync/db/_changes").status_code == 200
    finally:
        app.dependency_overrides[get_db] = override_get_db
    assert events == ["db closed", "stream"]
