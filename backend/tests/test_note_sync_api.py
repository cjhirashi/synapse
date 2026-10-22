"""Notas por `/sync/**` de punta a punta: TestClient + CouchDB real (SPEC-0008 RF-004, RF-006,
RF-016; PLAN-0008 §2.4, §2.5, §5).

Reutiliza los helpers de `test_sync_api.py` (peticiones del replicador, documentos de bóveda y
`UntouchablePort`). Aquí se comprueba lo que queda en CouchDB y lo que ve el cliente.
"""
import asyncio
import json
import uuid

import pytest

from app.main import app
from app.services.vault_service import utc_now
from tests.test_sync_api import (
    UntouchablePort, bulk_docs_bytes, change_ids, child_of, couch_get, couch_override,  # noqa: F401
    json_of_size, owner_of, push, revs_diff_bytes, vault_doc,
)
from tests.test_vaults_api import assert_problem, stored_docs, user_db

# Literales, no las constantes del código: cambiar un límite debe romper la prueba.
CONTENT_LIMIT = 2 * 1024 * 1024
BULK_DOCS_BODY_LIMIT = 16 * 1024 * 1024


# --- Helpers ---

def note_doc(vault_id: str, path: str = "Nota.md", content: str = "# Hola", **fields) -> dict:
    """Revisión nueva (generación 1) de una nota, como la escribe el cliente."""
    rev_hash, now = uuid.uuid4().hex, utc_now()
    return {
        "_id": f"note:{vault_id}:{uuid.uuid4()}", "_rev": f"1-{rev_hash}",
        "_revisions": {"start": 1, "ids": [rev_hash]},
        "type": "note", "vault_id": vault_id, "path": path, "frontmatter": {},
        "content": content, "created_at": now, "updated_at": now, "deleted_at": None,
        **fields,
    }


@pytest.fixture
def vault(ready_admin, db):
    """Una bóveda activa del admin, ya en el servidor (por sync)."""
    doc = vault_doc(owner_of(db), name="Bóveda")
    assert push(ready_admin, [doc]).json() == []
    return {"id": doc["_id"].removeprefix("vault:"), "doc_id": doc["_id"], "db": user_db(db)}


def rejection(doc: dict, reason: str) -> dict:
    return {"id": doc["_id"], "rev": doc["_rev"], "error": "forbidden", "reason": reason}


# --- Lectura (RF-006) ---

def test_rf_006_a_pushed_note_is_stored_and_listed_by_changes(vault, ready_admin):
    note = note_doc(vault["id"])
    res = push(ready_admin, [note])
    assert res.status_code == 201 and res.json() == []
    stored = couch_get(vault["db"], note["_id"]).json()
    assert (stored["_rev"], stored["path"], stored["content"]) == (note["_rev"], "Nota.md", "# Hola")
    ids = change_ids(ready_admin.get("/sync/db/_changes", params={"include_docs": "true"}))
    assert set(ids) == {vault["doc_id"], note["_id"]}


def test_rf_006_the_note_reservation_exists_but_never_travels(vault, ready_admin):
    note = note_doc(vault["id"], path="Carpeta/Nota.md")
    push(ready_admin, [note])
    reservation = f"note-path:{vault['id']}:carpeta/nota.md"
    assert reservation in stored_docs(vault["db"])  # el servidor la tiene...
    # ...y ninguna ruta del canal la nombra ni la deja pedir.
    changes = ready_admin.get("/sync/db/_changes", params={"include_docs": "true"})
    assert reservation not in change_ids(changes)
    all_docs = ready_admin.get("/sync/db/_all_docs", params={"include_docs": "true"}).json()
    assert reservation not in [row["id"] for row in all_docs["rows"]]
    by_key = ready_admin.post("/sync/db/_all_docs", json={"keys": [reservation, note["_id"]]}).json()
    assert [row["id"] for row in by_key["rows"]] == [note["_id"]]
    bulk = ready_admin.post("/sync/db/_bulk_get", json={"docs": [{"id": reservation}]}).json()
    assert bulk["results"][0]["docs"][0]["error"]["error"] == "not_found"
    diff = ready_admin.post("/sync/db/_revs_diff", json={reservation: ["1-abc"]}).json()
    assert diff == {reservation: {"missing": ["1-abc"]}}  # respondido sin preguntar a CouchDB


def test_rf_006_all_docs_lists_notes_before_vaults_and_limit_cuts_across_ranges(vault, ready_admin):
    first, second = note_doc(vault["id"], path="A.md"), note_doc(vault["id"], path="B.md")
    assert push(ready_admin, [first, second]).json() == []
    notes = sorted([first["_id"], second["_id"]])
    everything = ready_admin.get("/sync/db/_all_docs").json()
    assert [row["id"] for row in everything["rows"]] == [*notes, vault["doc_id"]]
    assert everything["total_rows"] == 3
    for limit, expected in ((1, notes[:1]), (2, notes), (3, [*notes, vault["doc_id"]]),
                            (10, [*notes, vault["doc_id"]])):
        rows = ready_admin.get("/sync/db/_all_docs", params={"limit": limit}).json()["rows"]
        assert [row["id"] for row in rows] == expected, limit


def test_rf_006_all_docs_with_docs_and_keys_returns_the_notes(vault, ready_admin):
    note = note_doc(vault["id"], content="texto")
    push(ready_admin, [note])
    with_docs = ready_admin.get("/sync/db/_all_docs", params={"include_docs": "true"}).json()
    contents = {row["id"]: row["doc"].get("content") for row in with_docs["rows"]}
    assert contents[note["_id"]] == "texto"
    by_key = ready_admin.post(
        "/sync/db/_all_docs", params={"include_docs": "true"}, json={"keys": [note["_id"]]}).json()
    assert by_key["rows"][0]["doc"]["path"] == "Nota.md"


def test_rf_006_bulk_get_and_revs_diff_serve_the_note(vault, ready_admin):
    note = note_doc(vault["id"])
    push(ready_admin, [note])
    got = ready_admin.post(
        "/sync/db/_bulk_get", params={"revs": "true"}, json={"docs": [{"id": note["_id"]}]}).json()
    doc = got["results"][0]["docs"][0]["ok"]
    assert (doc["_id"], doc["_rev"], doc["content"]) == (note["_id"], note["_rev"], "# Hola")
    diff = ready_admin.post(
        "/sync/db/_revs_diff", json={note["_id"]: [note["_rev"], "9-ffff"]}).json()
    assert diff[note["_id"]]["missing"] == ["9-ffff"]  # CouchDB añade `possible_ancestors`


# --- Tamaño del contenido (RF-016) ---

def test_rf_016_two_mib_of_emoji_are_stored_and_read_back_identical(vault, ready_admin):
    content = "😀" * (CONTENT_LIMIT // 4)  # 2 MiB exactos en UTF-8
    note = note_doc(vault["id"], content=content)
    res = push(ready_admin, [note])
    assert res.status_code == 201 and res.json() == []
    assert couch_get(vault["db"], note["_id"]).json()["content"] == content
    got = ready_admin.post("/sync/db/_bulk_get", json={"docs": [{"id": note["_id"]}]}).json()
    assert got["results"][0]["docs"][0]["ok"]["content"] == content


def test_rf_016_two_mib_of_control_characters_travel_as_a_12_mib_body(vault, ready_admin):
    # Cada carácter de control va escapado como `\u00XX` (6 bytes en el cuerpo): el peor
    # documento válido pesa ~12 MiB y no puede dar 413 (tope de `_bulk_docs`, P-6).
    content = "\u0007" * CONTENT_LIMIT
    note = note_doc(vault["id"], content=content)
    res = push(ready_admin, [note])
    assert int(res.request.headers["content-length"]) > 11 * 1024 * 1024
    assert res.status_code == 201 and res.json() == []
    assert couch_get(vault["db"], note["_id"]).json()["content"] == content
    got = ready_admin.post("/sync/db/_bulk_get", json={"docs": [{"id": note["_id"]}]}).json()
    assert got["results"][0]["docs"][0]["ok"]["content"] == content


def test_rf_016_one_byte_over_the_limit_is_rejected_and_the_previous_revision_stays(vault, ready_admin):
    note = note_doc(vault["id"], content="v1")
    push(ready_admin, [note])
    too_big = child_of(note, content="a" * (CONTENT_LIMIT + 1))
    res = push(ready_admin, [too_big])
    assert res.status_code == 201
    assert res.json() == [rejection(too_big, "validation-error:content")]
    stored = couch_get(vault["db"], note["_id"]).json()
    assert (stored["_rev"], stored["content"]) == (note["_rev"], "v1")


# --- Tope del cuerpo de `_bulk_docs` (RF-016, P-6) ---

def test_rf_016_bulk_docs_body_over_16_mib_is_413(ready_admin, couch_override):  # noqa: F811
    couch_override(UntouchablePort())
    body = json_of_size(BULK_DOCS_BODY_LIMIT + 1, docs=[], new_edits=False)
    assert_problem(bulk_docs_bytes(ready_admin, body), 413, "payload-too-large")


def test_rf_016_bulk_docs_body_of_exactly_16_mib_passes_the_cap(ready_admin, couch_override):  # noqa: F811
    """Dentro del tope el cuerpo llega a la validación: el campo `pad` sobra (422, no 413)."""
    couch_override(UntouchablePort())
    body = json_of_size(BULK_DOCS_BODY_LIMIT, docs=[], new_edits=False)
    assert_problem(bulk_docs_bytes(ready_admin, body), 422, "validation-error")


def test_rf_016_other_routes_keep_the_4_mib_cap(ready_admin, couch_override):  # noqa: F811
    couch_override(UntouchablePort())
    body = json_of_size(4 * 1024 * 1024 + 1)
    assert_problem(revs_diff_bytes(ready_admin, body), 413, "payload-too-large")


# --- Números no finitos en `frontmatter` (VB-1) ---

@pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity", "1e999"])
def test_rf_005_frontmatter_with_a_non_finite_number_is_rejected_not_a_500(vault, ready_admin, token):
    # El JSON estándar no los admite, pero el decodificador de Python sí (`NaN`, `Infinity`, y
    # `1e999` desborda a infinito) y CouchDB los rechazaría al reenviar: el lote quedaría
    # atascado con un 500. Se escriben a mano en el cuerpo, porque el cliente HTTP no los emite.
    note = note_doc(vault["id"], frontmatter={"outer": {"k": "@@"}})
    body = json.dumps({"docs": [note], "new_edits": False}).replace('"@@"', token)
    res = bulk_docs_bytes(ready_admin, body.encode())
    assert res.status_code == 201, res.text
    assert res.json() == [rejection(note, "validation-error:frontmatter")]
    assert couch_get(vault["db"], note["_id"]).status_code == 404


# --- Sesión antes de leer el cuerpo (VB-2) ---

def _asgi_post(path: str, body: bytes) -> tuple[int, int]:
    """POST sin sesión directo al ASGI; devuelve el estado y cuántas veces se leyó el cuerpo."""
    reads = 0
    sent: list[dict] = []

    async def receive():
        nonlocal reads
        reads += 1
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
        "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"",
        "root_path": "", "server": ("testserver", 80), "client": ("127.0.0.1", 1),
        "headers": [(b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()), (b"host", b"testserver")],
    }
    asyncio.run(app(scope, receive, send))
    status = next(m["status"] for m in sent if m["type"] == "http.response.start")
    return status, reads


@pytest.mark.parametrize("path", ["/sync/db/_bulk_docs", "/sync/db/_revs_diff", "/sync/db/_local/abc"])
def test_rf_006_unauthenticated_sync_request_is_401_without_reading_the_body(path):
    # Sin sesión un cuerpo de hasta 16 MiB no debe llegar a memoria: la sesión se valida antes.
    status, reads = _asgi_post(path, b'{"pad": "' + b"x" * (1024 * 1024) + b'"}')
    assert (status, reads) == (401, 0)


# --- Anidamiento extremo (VB-3) ---

@pytest.mark.parametrize("path", ["/sync/db/_bulk_docs", "/sync/db/_revs_diff", "/sync/db/_bulk_get"])
def test_rf_005_extremely_nested_json_is_answered_like_any_invalid_json(ready_admin, path):
    # `json.loads` lanza `RecursionError` con cientos de niveles: debe dar la misma respuesta
    # declarada (422 `validation-error`) que un JSON truncado, no un 400 fuera del contrato.
    headers = {"content-type": "application/json"}
    truncated = ready_admin.post(path, content=b"{", headers=headers)
    nested = ready_admin.post(path, content=b"[" * 100_000, headers=headers)
    assert_problem(truncated, 422, "validation-error")
    assert_problem(nested, 422, "validation-error")
    assert nested.json()["errors"] == truncated.json()["errors"]
