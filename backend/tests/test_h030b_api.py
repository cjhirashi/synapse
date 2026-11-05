"""H-030b de punta a punta: registro de cambios y BITACORA automática, plantillas, skill de cajón y nombres
canónicos. REST y `/sync`, TestClient + CouchDB real."""
from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import OperationalError

from app.core import bitacora_rules as bit
from app.core.config import settings
from app.core.models.change_log import ChangeLog
from app.services import agent_access_guard
from app.services.change_log_service import ChangeLogStore
from tests.test_vaults_api import user_db
from tests.test_h030_api import agent_client, detail, find, patch, post_note, vault_of
from tests.test_note_sync_api import note_doc, push, vault  # noqa: F401
from tests.test_sync_api import child_of

TZ = "America/Mexico_City"
TEMPLATE = {"titulo": "Base", "alcance": ["*"], "atributos": [{"nombre": "cliente", "tipo": "texto"}],
            "estilo": {"publicar": {}, "pdf": {}}}


@pytest.fixture(autouse=True)
def _fresh_registry_cache(monkeypatch):
    monkeypatch.setattr(settings, "BITACORA_DOCS", True)
    agent_access_guard._CACHE.clear()
    yield
    agent_access_guard._CACHE.clear()


def today() -> str:
    return bit.local_date(datetime.now(UTC), TZ)


def day_text(client, vault_id) -> str:
    item = find(client, vault_id, bit.day_path(today()))
    assert item is not None, "el documento del día no existe"
    return client.get(f"/vaults/{vault_id}/notes/{item['id']}").json()["content"]


def log_rows(db, vault_id):
    db.expire_all()
    return db.query(ChangeLog).filter(ChangeLog.vault_id == vault_id).order_by(ChangeLog.at).all()


def reasons(res) -> list[str]:
    assert res.status_code == 201, res.text
    return [r["reason"] for r in res.json()]


# --- Registro automático (REST) ---

def test_rest_changes_are_logged_and_the_day_document_is_generated(ready_admin, db):
    vault_id = vault_of(ready_admin)
    created = post_note(ready_admin, vault_id, "Carpeta/Doc.md", "uno", {"titulo": "Mi doc"})
    assert created.status_code == 201
    note = {"id": created.json()["id"], "etag": created.headers["ETag"]}
    edited = patch(ready_admin, vault_id, note, content="dos")
    assert edited.status_code == 200
    note["etag"] = edited.headers["ETag"]
    renamed = patch(ready_admin, vault_id, note, path="Carpeta/Nuevo.md")
    assert renamed.status_code == 200
    note["etag"] = renamed.headers["ETag"]
    moved = patch(ready_admin, vault_id, note, path="Otra/Nuevo.md")
    note["etag"] = moved.headers["ETag"]
    assert ready_admin.delete(f"/vaults/{vault_id}/notes/{note['id']}", headers={"If-Match": note["etag"]}).status_code == 204

    rows = log_rows(db, vault_id)
    assert [r.op for r in rows] == ["create", "edit", "rename", "move", "delete"]
    assert all(r.status == "applied" and r.rev for r in rows)
    assert rows[0].author_kind == "human" and rows[0].author.endswith("@" + rows[0].author.split("@")[1]) and rows[0].title == "Mi doc"
    assert (rows[2].prev_path, rows[2].path) == ("Carpeta/Doc.md", "Carpeta/Nuevo.md")
    text = day_text(ready_admin, vault_id)
    assert "5 cambios." in text and "antes `Carpeta/Nuevo.md`, ahora `Otra/Nuevo.md`" in text
    # La bitácora tiene sus INDICES (mes, carpeta y raíz) y el cuerpo del día no aparece en sí misma.
    paths = {i["path"] for i in ready_admin.get(f"/vaults/{vault_id}/notes", params={"limit": 200}).json()["items"]}
    assert {"BITACORA/INDICE.md", f"BITACORA/{today()[:7]}/INDICE.md"} <= paths


def test_a_save_that_only_changes_the_update_date_is_not_logged(ready_admin, db):
    vault_id = vault_of(ready_admin)
    created = post_note(ready_admin, vault_id, "Doc.md", "uno")
    note = {"id": created.json()["id"], "etag": created.headers["ETag"]}
    again = patch(ready_admin, vault_id, note, content="uno")
    assert again.status_code == 200
    assert [r.op for r in log_rows(db, vault_id)] == ["create"]


def test_indexes_and_the_bitacora_itself_are_not_logged(ready_admin, db):
    vault_id = vault_of(ready_admin)
    post_note(ready_admin, vault_id, "A/Doc.md", "x")  # crea INDICE.md y A/INDICE.md
    assert [r.path for r in log_rows(db, vault_id)] == ["A/Doc.md"]


def test_agent_author_is_recorded(ready_admin, db):
    vault_id = vault_of(ready_admin)
    aira = agent_client(ready_admin, "aira", admin_flag=True)
    assert post_note(aira, vault_id, "Doc.md", "x").status_code == 201
    row = log_rows(db, vault_id)[0]
    assert (row.author_kind, row.author) == ("agent", "aira")
    assert "aira (agente)" in day_text(ready_admin, vault_id)


def test_a_change_is_never_written_without_its_log_entry(ready_admin, db, monkeypatch):
    vault_id = vault_of(ready_admin)

    def broken(self, row):
        raise OperationalError("insert", {}, Exception("postgres caído"))

    monkeypatch.setattr(ChangeLogStore, "insert", broken)
    assert post_note(ready_admin, vault_id, "Doc.md", "x").status_code == 503
    monkeypatch.undo()
    assert find(ready_admin, vault_id, "Doc.md") is None


def test_a_rejected_write_leaves_a_failed_entry(ready_admin, db):
    vault_id = vault_of(ready_admin)
    first = post_note(ready_admin, vault_id, "Doc.md", "x")
    assert first.status_code == 201
    assert post_note(ready_admin, vault_id, "Doc.md", "y").status_code == 409
    rows = log_rows(db, vault_id)
    assert [(r.op, r.status) for r in rows] == [("create", "applied"), ("create", "failed")]
    assert "[no se aplicó]" in day_text(ready_admin, vault_id)


# --- BITACORA de solo lectura ---

def test_bitacora_is_read_only_over_rest(ready_admin):
    vault_id = vault_of(ready_admin)
    post_note(ready_admin, vault_id, "Doc.md", "x")
    day = find(ready_admin, vault_id, bit.day_path(today()))
    assert detail(post_note(ready_admin, vault_id, "BITACORA/2026-01/2026-01-01.md", "x")) == "bitacora:readonly"
    assert detail(patch(ready_admin, vault_id, day, content="falso")) == "bitacora:readonly"
    assert detail(patch(ready_admin, vault_id, day, path="Fuera.md")) == "bitacora:readonly"
    assert ready_admin.delete(f"/vaults/{vault_id}/notes/{day['id']}", headers={"If-Match": day["etag"]}).status_code == 422
    other = post_note(ready_admin, vault_id, "Otra.md", "x")
    moved = patch(ready_admin, vault_id, {"id": other.json()["id"], "etag": other.headers["ETag"]}, path="BITACORA/Otra.md")
    assert detail(moved) == "bitacora:readonly"


def test_bitacora_is_read_only_over_sync(vault, ready_admin):
    assert reasons(push(ready_admin, [note_doc(vault["id"], path="BITACORA/2026-11/2026-11-05.md")])) == ["bitacora:readonly"]
    # Un INDICE de mes sí lo puede crear el cliente (H-031).
    assert push(ready_admin, [note_doc(vault["id"], path="BITACORA/2026-11/INDICE.md", content="")]).json() == []


def test_sync_pushes_are_logged_once_per_revision(vault, ready_admin, db):
    doc = note_doc(vault["id"], path="Doc.md", content="uno")
    assert push(ready_admin, [doc]).json() == []
    assert push(ready_admin, [doc]).json() == []  # reintento del mismo lote
    second = child_of(doc, content="dos")
    assert push(ready_admin, [second]).json() == []
    rows = log_rows(db, vault["id"])
    assert [(r.op, r.rev, r.status, r.via) for r in rows] == [
        ("create", doc["_rev"], "applied", "sync"), ("edit", second["_rev"], "applied", "sync")]
    assert "2 cambios." in day_text(ready_admin, vault["id"])


# --- Nombres canónicos ---

def test_reserved_folder_names_must_be_uppercase(ready_admin, vault):
    vault_id = vault_of(ready_admin)
    assert detail(post_note(ready_admin, vault_id, "Plantillas/x.md", "")) == "meta-folder:case"
    assert reasons(push(ready_admin, [note_doc(vault["id"], path="Plantillas/x.md")])) == ["meta-folder:case"]


# --- Plantillas ---

def make_template(client, vault_id, name="base", **fm):
    return post_note(client, vault_id, f"PLANTILLAS/plantilla-{name}.md", "# Estructura", {**TEMPLATE, **fm})


def test_template_format_is_validated(ready_admin):
    vault_id = vault_of(ready_admin)
    # H-041 E2: un nombre sin el prefijo `plantilla-` ya no se rechaza: el servidor lo estructura.
    structured = post_note(ready_admin, vault_id, "PLANTILLAS/base.md", "", TEMPLATE)
    assert structured.status_code == 201 and structured.json()["path"] == "PLANTILLAS/plantilla-base.md"
    ready_admin.delete(f"/vaults/{vault_id}/notes/{structured.json()['id']}", headers={"If-Match": structured.headers["ETag"]})
    assert detail(post_note(ready_admin, vault_id, "PLANTILLAS/sub/plantilla-a.md", "", TEMPLATE)) == "plantilla:path"
    assert detail(make_template(ready_admin, vault_id, alcance=[])) == "plantilla:alcance"
    assert detail(make_template(ready_admin, vault_id, estilo={"pdf": {"x": 1}})) == "plantilla:estilo"
    assert make_template(ready_admin, vault_id).status_code == 201


def test_a_note_can_only_cite_an_existing_template(ready_admin):
    vault_id = vault_of(ready_admin)
    assert detail(post_note(ready_admin, vault_id, "Doc.md", "", {"plantilla": "base"})) == "plantilla:unknown"
    assert make_template(ready_admin, vault_id).status_code == 201
    assert post_note(ready_admin, vault_id, "Doc.md", "", {"plantilla": "base"}).status_code == 201


def test_a_template_in_use_cannot_be_deleted_or_renamed_until_the_relation_disappears(ready_admin):
    vault_id = vault_of(ready_admin)
    template = make_template(ready_admin, vault_id)
    t = {"id": template.json()["id"], "etag": template.headers["ETag"]}
    doc = post_note(ready_admin, vault_id, "Doc.md", "", {"plantilla": "base"})
    d = {"id": doc.json()["id"], "etag": doc.headers["ETag"]}
    assert ready_admin.delete(f"/vaults/{vault_id}/notes/{t['id']}", headers={"If-Match": t["etag"]}).status_code == 422
    res = patch(ready_admin, vault_id, t, path="PLANTILLAS/plantilla-otra.md")
    assert detail(res) == "plantilla:in-use"
    assert patch(ready_admin, vault_id, t, content="# Nueva estructura").status_code == 200  # editar sí (P3)
    t["etag"] = find(ready_admin, vault_id, "PLANTILLAS/plantilla-base.md")["etag"]
    # La relación desaparece cuando el documento deja de citarla.
    assert patch(ready_admin, vault_id, d, frontmatter={"titulo": "x"}).status_code == 200
    assert ready_admin.delete(f"/vaults/{vault_id}/notes/{t['id']}", headers={"If-Match": t["etag"]}).status_code == 204


def test_a_template_in_use_cannot_be_deleted_over_sync(vault, ready_admin):
    vault_id = vault["id"]
    template = note_doc(vault_id, path="PLANTILLAS/plantilla-base.md", frontmatter=TEMPLATE)
    assert push(ready_admin, [template]).json() == []
    doc = note_doc(vault_id, path="Doc.md", frontmatter={"plantilla": "base"})
    assert push(ready_admin, [doc]).json() == []
    gone = child_of(template, deleted_at="2026-11-05T10:00:00.000000Z")
    assert reasons(push(ready_admin, [gone])) == ["plantilla:in-use"]
    assert push(ready_admin, [child_of(doc, frontmatter={})]).json() == []
    assert push(ready_admin, [gone]).json() == []


def test_a_malformed_template_is_rejected_over_sync(vault, ready_admin):
    assert reasons(push(ready_admin, [note_doc(vault["id"], path="PLANTILLAS/plantilla-x.md", frontmatter={})])) == ["plantilla:alcance"]
    assert reasons(push(ready_admin, [note_doc(vault["id"], path="PLANTILLAS/x.md", frontmatter=TEMPLATE)])) == ["plantilla:path"]


# --- Skill de cajón ---

def test_a_system_doc_path_cannot_be_written_by_anyone(ready_admin):
    vault_id = vault_of(ready_admin)
    path = "AG - SKILLS/skill-bovedas-synapse.md"
    assert detail(post_note(ready_admin, vault_id, path, "v1")) == "sistema:readonly"
    aira = agent_client(ready_admin, "aira", admin_flag=True)
    assert detail(post_note(aira, vault_id, path, "v1")) == "sistema:readonly"
    assert post_note(aira, vault_id, "AG - SKILLS/skill-propia.md", "ok").status_code == 201  # las demás skills, libres


