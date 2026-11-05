"""H-041 E1: documentos de sistema (la skill global y `plantilla-skill`): reglas, bloqueo por todas las rutas,
publicación a las bóvedas y deriva. REST y `/sync`, TestClient + CouchDB real."""
import json
import re
import uuid
from pathlib import Path

import httpx
import pytest

from app.core import meta_rules, plantilla_rules, system_docs
from app.core.attribute_rules import validate_general
from app.core.config import settings
from app.core.models.change_log import ChangeLog
from app.core.note_dates import stamp_dates, today_cdmx
from app.core.timestamps import utc_now
from app.routers.vaults import get_vault_port
from app.services import agent_access_guard
from app.services.note_service import NoteService
from app.services.system_docs_service import CONFLICT, CREATE, OK, UPDATE, SystemDocsService, sync_all
from tests.test_h030_api import agent_client, detail, find, patch, post_note, vault_of
from tests.test_note_sync_api import note_doc, push, vault  # noqa: F401
from tests.test_sync_api import AUTH, child_of
from tests.test_vaults_api import user_db

SKILL = "AG - SKILLS/skill-bovedas-synapse.md"
TEMPLATE = "PLANTILLAS/plantilla-skill.md"
FIXTURE = Path(__file__).parent / "fixtures" / "sistema_reglas.json"


@pytest.fixture(autouse=True)
def _fresh_registry_cache():
    agent_access_guard._CACHE.clear()
    yield
    agent_access_guard._CACHE.clear()


@pytest.fixture
def seeded(monkeypatch):
    monkeypatch.setattr(settings, "SEED_AG_FOLDERS", True)


def reasons(res) -> list[str]:
    assert res.status_code == 201, res.text
    return [r["reason"] for r in res.json()]


def owner_id(db) -> str:
    from app.core.models.user import User

    return db.query(User).filter(User.email == "cjhirashi@gmail.com").one().id


# --- Reglas puras y manifiesto ---

def test_the_shared_fixture_lists_exactly_the_manifest_paths():
    assert json.loads(FIXTURE.read_text(encoding="utf-8"))["paths"] == [d.path for d in system_docs.DOCS]


def test_changing_a_system_doc_requires_stamping_it_and_bumping_its_version():
    """La huella del manifiesto debe coincidir con el contenido: quien cambia el texto corre `--stamp` y sube `version`."""
    for doc in system_docs.DOCS:
        assert system_docs.content_hash(doc.frontmatter, doc.content) == doc.sha256, f"{doc.path}: corre scripts/sync_system_docs.py --stamp y sube la versión"
        assert re.fullmatch(r"\d+\.\d+\.\d+", doc.frontmatter["version"])


def test_system_docs_are_valid_documents_and_marked():
    for doc in system_docs.DOCS:
        assert doc.frontmatter["sistema"] is True and "sistema" in doc.frontmatter["tags"]
        assert validate_general({k: v for k, v in doc.frontmatter.items() if k != "sistema"}) is None
        assert doc.frontmatter["estado"] == "aprobado" and not doc.content.startswith("---")
        assert len(doc.frontmatter["descripcion"]) <= 160  # la descripción de una skill de OpenClaw
    template = next(d for d in system_docs.DOCS if d.path == TEMPLATE)
    assert plantilla_rules.check_definition(template.frontmatter) is None
    assert plantilla_rules.template_name(TEMPLATE) == "skill"
    # Una plantilla no declara los atributos que el sistema ya da de cajón.
    assert not {a["nombre"] for a in template.frontmatter["atributos"]} & plantilla_rules.NOT_EXTRA


def test_a_user_template_cannot_declare_the_system_attribute():
    fm = {"alcance": ["*"], "atributos": [{"nombre": "sistema", "tipo": "booleano"}], "estilo": {}}
    assert plantilla_rules.check_definition(fm) == "plantilla:atributos"


def test_only_the_publisher_can_write_a_system_path_or_use_the_attribute():
    for path in (SKILL, TEMPLATE):
        assert meta_rules.check_note_write(path=path, prev_path=path, actor_kind="system", frontmatter=next(
            d.frontmatter for d in system_docs.DOCS if d.path == path)) is None
    assert meta_rules.check_note_write(path="Notas/x.md", frontmatter={"sistema": True}, actor_kind="system") is None
    assert meta_rules.check_note_write(path="Notas/x.md", frontmatter={"sistema": True}) == "sistema:reserved"
    assert meta_rules.check_note_write(path="Notas/x.md", frontmatter={"sistema": False}) == "sistema:reserved"
    # Al borrar, lo que ya traía la nota no cuenta (solo importa la ruta).
    assert meta_rules.check_note_write(path="Notas/x.md", frontmatter={"sistema": True}, deleted=True) is None


# --- Publicación a bóvedas nuevas ---

def test_a_new_vault_gets_both_system_docs_marked_and_readable(ready_admin, seeded):
    vault_id = vault_of(ready_admin)
    for path in (SKILL, TEMPLATE):
        item = find(ready_admin, vault_id, path)
        assert item is not None
        fm = item["frontmatter"]
        assert fm["sistema"] is True and "sistema" in fm["tags"]
        assert fm["version"] == next(d.frontmatter["version"] for d in system_docs.DOCS if d.path == path)
        assert "agentes" not in fm or path == TEMPLATE  # la convención antigua `agentes: ["todos"]` ya no existe
        assert "skill" not in fm
        body = ready_admin.get(f"/vaults/{vault_id}/notes/{item['id']}").json()["content"]
        assert body == next(d.content for d in system_docs.DOCS if d.path == path)
    index = find(ready_admin, vault_id, "AG - SKILLS/INDICE.md")
    listed = ready_admin.get(f"/vaults/{vault_id}/notes/{index['id']}").json()["content"]
    assert "skill-bovedas-synapse" in listed and "sistema" in listed  # el ÍNDICE lo lista con su etiqueta


# --- El bloqueo por todas las rutas ---

def _doc(client, vault_id, path):
    item = find(client, vault_id, path)
    assert item is not None
    return item


@pytest.mark.parametrize("mode", ["off", "shadow", "enforce"])
@pytest.mark.parametrize("path", [SKILL, TEMPLATE])
def test_no_actor_can_edit_move_rename_or_delete_a_system_doc(ready_admin, seeded, monkeypatch, mode, path):
    """Independiente de shadow/enforce: humano, agente con y sin bandera de administrador, rutas REST."""
    vault_id = vault_of(ready_admin)
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", mode)
    clients = {
        "humano": ready_admin,
        "aira": agent_client(ready_admin, "aira", admin_flag=True),
        "main": agent_client(ready_admin, "main"),
        "lector": agent_client(ready_admin, "lector"),
    }
    for who, client in clients.items():
        item = _doc(ready_admin, vault_id, path)
        for changes in ({"content": "otro texto"}, {"frontmatter": {"titulo": "x"}}, {"frontmatter": None},
                        {"path": "Otra/ruta.md"}, {"path": path.replace("skill", "skill2")}):
            res = patch(client, vault_id, item, **changes)
            assert res.status_code == 422 and detail(res) == "sistema:readonly", (who, changes, res.text)
        res = client.delete(f"/vaults/{vault_id}/notes/{item['id']}", headers={"If-Match": item["etag"]})
        assert res.status_code == 422 and detail(res) == "sistema:readonly", who
        res = post_note(client, vault_id, path, "copia")
        assert res.status_code == 422 and detail(res) == "sistema:readonly", who
    # Nada cambió: sigue igual al repositorio y conserva su id.
    again = _doc(ready_admin, vault_id, path)
    assert again["id"] == item["id"] and again["etag"] == item["etag"]


def test_a_note_cannot_be_moved_onto_a_system_path_nor_a_folder_move_touch_one(ready_admin, seeded):
    vault_id = vault_of(ready_admin)
    other = post_note(ready_admin, vault_id, "Notas/otra.md", "x")
    note = {"id": other.json()["id"], "etag": other.headers["ETag"]}
    assert detail(patch(ready_admin, vault_id, note, path=SKILL)) == "sistema:readonly"
    # Las carpetas reservadas no se mueven (meta-folder:rename) y ninguna carpeta puede fusionarse hasta pisar la ruta.
    for folder in ("AG - SKILLS", "PLANTILLAS"):
        res = ready_admin.post(f"/vaults/{vault_id}/folders/move", json={"from": folder, "to": "Otra"})
        assert res.status_code == 422 and detail(res) == "meta-folder:rename"
    assert post_note(ready_admin, vault_id, "Pendiente/skill-bovedas-synapse.md", "x").status_code == 201
    res = ready_admin.post(f"/vaults/{vault_id}/folders/move", json={"from": "Pendiente", "to": "AG - SKILLS"})
    assert res.status_code == 422 and detail(res) in ("sistema:readonly", "note-path-taken")


def test_a_trashed_copy_of_a_system_doc_cannot_be_restored(ready_admin):
    """Quedó una copia en la papelera de antes del bloqueo: nadie puede restaurarla."""
    vault_id = vault_of(ready_admin)
    db_name = user_db_of(ready_admin)
    note_id = str(uuid.uuid4())
    now = utc_now()
    get_vault_port().put(db_name, {
        "_id": f"note:{vault_id}:{note_id}", "type": "note", "vault_id": vault_id, "path": SKILL, "content": "vieja",
        "frontmatter": stamp_dates({}, today_cdmx(), now), "created_at": now, "updated_at": now, "deleted_at": now})
    trash = ready_admin.get(f"/vaults/{vault_id}/notes", params={"deleted": "true"}).json()["items"]
    assert [i["path"] for i in trash] == [SKILL]
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{note_id}/restore", headers={"If-Match": trash[0]["etag"]})
    assert res.status_code == 422 and detail(res) == "sistema:readonly"


def user_db_of(client) -> str:
    from tests.conftest import TestingSessionLocal

    session = TestingSessionLocal()
    try:
        return user_db(session)
    finally:
        session.close()


def test_the_attribute_is_reserved_on_ordinary_notes(ready_admin, seeded):
    vault_id = vault_of(ready_admin)
    assert detail(post_note(ready_admin, vault_id, "Notas/a.md", "x", {"sistema": True})) == "sistema:reserved"
    created = post_note(ready_admin, vault_id, "Notas/a.md", "x", {"titulo": "A"})
    note = {"id": created.json()["id"], "etag": created.headers["ETag"]}
    assert detail(patch(ready_admin, vault_id, note, frontmatter={"titulo": "A", "sistema": True})) == "sistema:reserved"
    aira = agent_client(ready_admin, "aira")
    assert detail(post_note(aira, vault_id, "Notas/b.md", "x", {"sistema": True})) == "sistema:reserved"


# --- Sincronización (PouchDB / clientes) ---

def test_system_docs_are_read_only_over_sync(vault, ready_admin):
    vault_id = vault["id"]
    for path, frontmatter in ((SKILL, {"titulo": "copia"}), (TEMPLATE, {"alcance": ["*"]})):
        assert reasons(push(ready_admin, [note_doc(vault_id, path=path, frontmatter=frontmatter)])) == ["sistema:readonly"]
    assert reasons(push(ready_admin, [note_doc(vault_id, path="Notas/x.md", frontmatter={"sistema": True})])) == ["sistema:reserved"]
    # Una revisión nueva de la copia que sí existe (editar, mover o borrar lógicamente) tampoco pasa.
    service = SystemDocsService(get_vault_port(), vault["db"])
    created = service.apply(vault_id)
    assert [a.action for a in created] == [CREATE, CREATE]
    stored = httpx.get(
        f"{settings.COUCHDB_URL}/{vault['db']}/note:{vault_id}:{created[0].note_id}", params={"revs": "true"}, auth=AUTH).json()
    for change in ({"content": "otro"}, {"path": "Otra/x.md"}, {"deleted_at": "2026-11-05T10:00:00.000000Z"}):
        assert reasons(push(ready_admin, [child_of(stored, **change)])) == ["sistema:readonly"], change


# --- Publicador ---

def _legacy(port, db, vault_id, path, content, frontmatter, deleted=False):
    """Una copia anterior al bloqueo, escrita directamente (la REST ya no la dejaría)."""
    note_id = f"note:{vault_id}:{uuid.uuid4()}"
    if not deleted:
        NoteService(port, db).reserve_path(note_id, path)
    now = utc_now()
    port.put(db, {"_id": note_id, "type": "note", "vault_id": vault_id, "path": path, "content": content,
                  "frontmatter": stamp_dates(frontmatter, today_cdmx(), now), "created_at": now, "updated_at": now,
                  "deleted_at": now if deleted else None})
    return note_id.split(":")[2]


def test_publisher_creates_then_is_idempotent(ready_admin, db):
    vault_id = vault_of(ready_admin)
    service = SystemDocsService(get_vault_port(), user_db(db))
    assert [(a.path, a.action) for a in service.plan(vault_id)] == [(SKILL, CREATE), (TEMPLATE, CREATE)]
    assert ready_admin.get(f"/vaults/{vault_id}/notes").json()["items"] == []  # el plan no escribe
    done = service.apply(vault_id)
    assert [a.action for a in done] == [CREATE, CREATE]
    ids = [a.note_id for a in done]
    assert [a.action for a in service.apply(vault_id)] == [OK, OK]
    assert [a.note_id for a in service.plan(vault_id)] == ids
    # Una nota de la PLANTILLAS/ y su INDICE nacen solos.
    assert find(ready_admin, vault_id, "PLANTILLAS/INDICE.md") is not None


def test_publisher_updates_an_old_copy_in_place_keeping_its_id_and_can_revert(ready_admin, db):
    vault_id = vault_of(ready_admin)
    port, name = get_vault_port(), user_db(db)
    old_fm = {"titulo": "skill-bovedas-synapse", "tags": ["skill"], "estado": "en revisión", "skill": "skill-bovedas-synapse",
              "agentes": ["todos"], "version": "0.0.2", "descripcion": "vieja"}
    legacy_id = _legacy(port, name, vault_id, SKILL, "texto viejo", old_fm)
    service = SystemDocsService(port, name)
    assert [a.action for a in service.plan(vault_id)] == [UPDATE, CREATE]
    done = service.apply(vault_id)
    assert done[0].note_id == legacy_id and done[0].before["content"] == "texto viejo"
    assert done[0].before["frontmatter"]["agentes"] == ["todos"]
    updated = ready_admin.get(f"/vaults/{vault_id}/notes/{legacy_id}").json()
    assert updated["content"] == system_docs.DOCS[0].content
    fm = updated["frontmatter"]
    assert fm["sistema"] is True and fm["version"] == system_docs.DOCS[0].frontmatter["version"]
    assert "skill" not in fm and "agentes" not in fm
    assert fm["fecha_creacion"] == done[0].before["frontmatter"]["fecha_creacion"]  # conserva la de la copia anterior
    assert [a.action for a in service.plan(vault_id)] == [OK, OK]
    # Revertir con el informe: texto y metadatos anteriores, y retira lo creado.
    report = [{"action": a.action, "path": a.path, "note_id": a.note_id, "before": a.before} for a in done]
    assert sorted(service.revert(vault_id, report)) == sorted([SKILL, TEMPLATE])
    back = ready_admin.get(f"/vaults/{vault_id}/notes/{legacy_id}").json()
    assert back["content"] == "texto viejo" and back["frontmatter"]["agentes"] == ["todos"]
    assert find(ready_admin, vault_id, TEMPLATE) is None


def test_publisher_reports_a_case_conflict_and_ignores_a_trashed_copy(ready_admin, db):
    vault_id = vault_of(ready_admin)
    port, name = get_vault_port(), user_db(db)
    _legacy(port, name, vault_id, "AG - SKILLS/Skill-Bovedas-Synapse.md", "otra", {"titulo": "x"})
    _legacy(port, name, vault_id, TEMPLATE, "borrada", {"titulo": "x"}, deleted=True)
    plan = SystemDocsService(port, name).plan(vault_id)
    assert [(a.action, a.detail is not None) for a in plan] == [(CONFLICT, True), (CREATE, False)]
    done = SystemDocsService(port, name).apply(vault_id)
    assert [a.action for a in done] == [CONFLICT, CREATE]  # lo ajeno no se toca; la copia en la papelera no estorba
    assert find(ready_admin, vault_id, TEMPLATE) is not None
    other = find(ready_admin, vault_id, "AG - SKILLS/Skill-Bovedas-Synapse.md")
    assert ready_admin.get(f"/vaults/{vault_id}/notes/{other['id']}").json()["content"] == "otra"  # sin tocar


def test_publication_by_owner_is_logged_in_the_bitacora_as_the_system(ready_admin, db):
    vault_id = vault_of(ready_admin)
    SystemDocsService(get_vault_port(), user_db(db), owner_id(db)).apply(vault_id)
    db.expire_all()
    rows = db.query(ChangeLog).filter(ChangeLog.vault_id == vault_id).all()
    assert sorted(r.path for r in rows) == [SKILL, TEMPLATE]
    assert {(r.op, r.author_kind, r.author) for r in rows} == {("create", "system", "sistema")}


def test_sync_all_reports_drift_without_writing_and_then_applies(ready_admin, db):
    first, second = vault_of(ready_admin, "Uno"), vault_of(ready_admin, "Dos")
    port = get_vault_port()
    report = sync_all(port, apply=False)
    assert {e["vault_id"] for e in report} == {first, second}
    assert all([a["action"] for a in e["actions"]] == [CREATE, CREATE] for e in report)
    assert ready_admin.get(f"/vaults/{first}/notes").json()["items"] == []
    applied = sync_all(port, apply=True)
    assert all([a["action"] for a in e["actions"]] == [CREATE, CREATE] for e in applied)
    assert all(a["action"] == OK for e in sync_all(port, apply=False) for a in e["actions"])
    assert [e["vault_id"] for e in sync_all(port, apply=False, only_vault=first)] == [first]


def test_the_message_purge_never_reaches_system_docs(ready_admin, db):
    from datetime import UTC, datetime, timedelta

    from app.services import mensajes_purge

    vault_id = vault_of(ready_admin)
    port, name = get_vault_port(), user_db(db)
    SystemDocsService(port, name).apply(vault_id)
    plan = mensajes_purge.plan(port, name, vault_id, datetime.now(UTC) + timedelta(days=400))
    assert plan.candidates == [] and plan.alerts == []
    assert [a.action for a in SystemDocsService(port, name).plan(vault_id)] == [OK, OK]
