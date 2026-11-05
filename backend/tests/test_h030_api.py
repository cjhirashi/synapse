"""H-030 de punta a punta: carpetas reservadas, buzón de mensajes, registro de agentes y modo sombra.

TestClient + CouchDB real. Los agentes son claves con `agent_id` (cliente con `Authorization: Bearer`).
"""
import pytest

from app.core.config import settings
from app.core.models.agent_access_log import AgentAccessLog
from app.services import agent_access_guard
from tests.test_agent_api_key_access import _bearer_client
from tests.test_notes_router import _note, put_note
from tests.test_vaults_api import create, user_db

CAB = "AG - MENSAJES/liza/20261105-0930-revisar/000-cabecera.md"
MSG1 = "AG - MENSAJES/liza/20261105-0930-revisar/001-de-aira.md"
MSG2 = "AG - MENSAJES/liza/20261105-0930-revisar/002-de-liza.md"
HEAD = {"de": "aira", "para": "liza", "estado": "abierta", "titulo": "Revisar", "descripcion": "x", "tags": []}


@pytest.fixture(autouse=True)
def _fresh_registry_cache():
    agent_access_guard._CACHE.clear()
    yield
    agent_access_guard._CACHE.clear()


@pytest.fixture
def seeded(monkeypatch):
    monkeypatch.setattr(settings, "SEED_AG_FOLDERS", True)


def agent_client(admin, agent_id: str, *, admin_flag: bool = False, label: str | None = None):
    res = admin.post("/auth/agent-keys", json={"label": label or f"op-{agent_id}", "agent_id": agent_id, "is_admin": admin_flag})
    assert res.status_code == 201, res.text
    return _bearer_client(admin, res.json()["key"])


def vault_of(admin, name="Notas") -> str:
    res = create(admin, name=name)
    assert res.status_code == 201, res.text
    return res.json()["id"]


def post_note(client, vault_id, path, content="", frontmatter=None):
    body = {"path": path, "content": content}
    if frontmatter is not None:
        body["frontmatter"] = frontmatter
    return client.post(f"/vaults/{vault_id}/notes", json=body)


def find(client, vault_id, path):
    items = client.get(f"/vaults/{vault_id}/notes", params={"limit": 200}).json()["items"]
    return next((i for i in items if i["path"] == path), None)


def patch(client, vault_id, item, **changes):
    return client.patch(f"/vaults/{vault_id}/notes/{item['id']}", json=changes, headers={"If-Match": item["etag"]})


def detail(res) -> str:
    return res.json()["errors"][0]["detail"]


def register(admin, vault_id, agent_id, carpetas, estado="activo"):
    res = admin.put(f"/vaults/{vault_id}/agent-access/{agent_id}", json={"carpetas": carpetas, "estado": estado})
    assert res.status_code == 200, res.text
    return res.json()


# --- Claves con identidad de agente (E5) ---

def test_key_with_agent_identity_is_listed_and_reassigned(ready_admin):
    created = ready_admin.post("/auth/agent-keys", json={"label": "op-aira", "agent_id": "aira"}).json()
    assert (created["agent_id"], created["is_admin"]) == ("aira", False)
    listed = ready_admin.get("/auth/agent-keys").json()
    assert [(k["label"], k["agent_id"], k["is_admin"]) for k in listed] == [("op-aira", "aira", False)]
    res = ready_admin.patch(f"/auth/agent-keys/{created['id']}", json={"agent_id": "liza", "is_admin": True})
    assert res.status_code == 200 and (res.json()["agent_id"], res.json()["is_admin"]) == ("liza", True)


@pytest.mark.parametrize("agent_id", ["Aira", "a b", "-x", "x" * 40, ""])
def test_agent_id_must_be_a_short_slug(ready_admin, agent_id):
    assert ready_admin.post("/auth/agent-keys", json={"label": "k", "agent_id": agent_id}).status_code == 422


def test_a_key_cannot_reassign_keys_nor_the_registry(ready_admin):
    created = ready_admin.post("/auth/agent-keys", json={"label": "op-aira", "agent_id": "aira", "is_admin": True}).json()
    agent = _bearer_client(ready_admin, created["key"])
    vault_id = vault_of(ready_admin)
    assert agent.patch(f"/auth/agent-keys/{created['id']}", json={"agent_id": "aira", "is_admin": True}).status_code == 401
    assert agent.put(f"/vaults/{vault_id}/agent-access/aira", json={"carpetas": ["*"]}).status_code == 401
    assert agent.get(f"/vaults/{vault_id}/agent-access").status_code == 200  # leer sí


def test_patching_a_revoked_key_is_404(ready_admin):
    created = ready_admin.post("/auth/agent-keys", json={"label": "op-aira", "agent_id": "aira"}).json()
    ready_admin.delete(f"/auth/agent-keys/{created['id']}")
    assert ready_admin.patch(f"/auth/agent-keys/{created['id']}", json={"agent_id": "x"}).status_code == 404


# --- Carpetas reservadas (E3) ---

def test_new_vault_is_born_with_the_reserved_folders(ready_admin, seeded):
    vault_id = vault_of(ready_admin)
    items = ready_admin.get(f"/vaults/{vault_id}/notes", params={"limit": 200}).json()["items"]
    assert {i["path"] for i in items} == {
        "INDICE.md", "AG - SKILLS/INDICE.md", "AG - MENSAJES/INDICE.md", "AG - AGENTES/INDICE.md",
        "BITACORA/INDICE.md", "PLANTILLAS/INDICE.md"}
    skills = next(i for i in items if i["path"] == "AG - SKILLS/INDICE.md")
    assert "Skills para los agentes" in skills["frontmatter"]["descripcion"]


def test_ensure_ag_folders_is_idempotent_and_dry_run_writes_nothing(ready_admin, db):
    from app.routers.vaults import get_vault_port
    from app.services.note_content_service import NoteContentService

    vault_id = vault_of(ready_admin)
    service = NoteContentService(get_vault_port(), user_db(db))
    would = service.ensure_ag_folders(vault_id, dry_run=True)
    assert len(would) == 6 and ready_admin.get(f"/vaults/{vault_id}/notes").json()["items"] == []
    assert sorted(service.ensure_ag_folders(vault_id)) == sorted(would)
    assert service.ensure_ag_folders(vault_id) == []
    assert len(ready_admin.get(f"/vaults/{vault_id}/notes", params={"limit": 200}).json()["items"]) == 6


def test_reserved_index_cannot_be_deleted_or_renamed_and_names_cannot_be_taken(ready_admin, seeded):
    vault_id = vault_of(ready_admin)
    index = find(ready_admin, vault_id, "AG - SKILLS/INDICE.md")
    res = ready_admin.delete(f"/vaults/{vault_id}/notes/{index['id']}", headers={"If-Match": index["etag"]})
    assert res.status_code == 422 and detail(res) == "meta-folder:index-delete"
    assert patch(ready_admin, vault_id, index, path="Otra/INDICE.md").status_code == 422
    res = post_note(ready_admin, vault_id, "AG - SKILLS.md")
    assert res.status_code == 422 and detail(res) == "reserved-name:path"


def test_reserved_folder_cannot_be_renamed_but_content_can_move_into_it(ready_admin, seeded):
    vault_id = vault_of(ready_admin)
    assert post_note(ready_admin, vault_id, "AG - SKILLS/skill-a.md").status_code == 201
    res = ready_admin.post(f"/vaults/{vault_id}/folders/move", json={"from": "AG - SKILLS", "to": "Skills"})
    assert res.status_code == 422 and detail(res) == "meta-folder:rename"
    assert post_note(ready_admin, vault_id, "Viejo/skill-b.md").status_code == 201
    assert ready_admin.post(f"/vaults/{vault_id}/folders/move", json={"from": "Viejo", "to": "AG - SKILLS/viejo"}).status_code == 200


# --- AG - MENSAJES (E4) ---

def test_conversation_lifecycle_stamp_close_reopen_and_immutability(ready_admin):
    vault_id = vault_of(ready_admin)
    aira = agent_client(ready_admin, "aira")
    liza = agent_client(ready_admin, "liza")

    res = post_note(aira, vault_id, CAB, frontmatter={**HEAD, "cerrada_el": "2000-01-01T00:00:00.000000Z"})
    assert res.status_code == 201, res.text
    assert "cerrada_el" not in res.json()["frontmatter"]  # lo sella el servidor, no el cliente
    assert post_note(aira, vault_id, MSG1, "hola").status_code == 201

    # Rutas fuera de formato y remitente que no es la clave
    assert detail(post_note(aira, vault_id, "AG - MENSAJES/nota.md")) == "ag-mensajes:path"
    assert detail(post_note(aira, vault_id, "AG - MENSAJES/liza/20261105-0930-revisar/003-de-liza.md")) == "ag-mensajes:from-mismatch"
    assert detail(post_note(aira, vault_id, "AG - MENSAJES/liza/20261106-1000-nueva/001-de-aira.md")) == "ag-mensajes:no-cabecera"
    assert detail(post_note(aira, vault_id, "AG - MENSAJES/liza/20261106-1000-x/000-cabecera.md",
                            frontmatter={**HEAD, "de": "emma"})) == "ag-mensajes:from-mismatch"

    # Los mensajes no se editan ni se borran
    msg = find(aira, vault_id, MSG1)
    assert detail(patch(aira, vault_id, msg, content="otro")) == "ag-mensajes:immutable"
    assert aira.delete(f"/vaults/{vault_id}/notes/{msg['id']}", headers={"If-Match": msg["etag"]}).status_code == 422

    # Un tercero no cierra; los participantes sí, y se sella cerrada_el
    emma = agent_client(ready_admin, "emma")
    head = find(aira, vault_id, CAB)
    assert detail(patch(emma, vault_id, head, frontmatter={**HEAD, "estado": "cerrada"})) == "ag-mensajes:forbidden"
    closed = patch(aira, vault_id, head, frontmatter={**HEAD, "estado": "cerrada", "cerrada_el": "1999-01-01T00:00:00.000000Z"})
    assert closed.status_code == 200, closed.text
    stamp = closed.json()["frontmatter"]["cerrada_el"]
    assert stamp.startswith("20") and stamp != "1999-01-01T00:00:00.000000Z"
    # Cambiar otra cosa de la cabecera no se permite
    head = find(aira, vault_id, CAB)
    assert detail(patch(aira, vault_id, head, frontmatter={**head["frontmatter"], "titulo": "Otro"})) == "ag-mensajes:immutable"

    # Escribir en la conversación cerrada la reabre sola (Q6)
    assert post_note(liza, vault_id, MSG2, "ya vi").status_code == 201
    reopened = find(aira, vault_id, CAB)["frontmatter"]
    assert reopened["estado"] == "abierta" and "cerrada_el" not in reopened


def test_human_can_edit_messages_but_format_still_applies(ready_admin):
    vault_id = vault_of(ready_admin)
    aira = agent_client(ready_admin, "aira")
    assert post_note(aira, vault_id, CAB, frontmatter=HEAD).status_code == 201
    assert post_note(aira, vault_id, MSG1).status_code == 201
    msg = find(ready_admin, vault_id, MSG1)
    assert patch(ready_admin, vault_id, msg, content="corregido").status_code == 200
    assert patch(ready_admin, vault_id, find(ready_admin, vault_id, MSG1), path="AG - MENSAJES/mal.md").status_code == 422


# --- Registro de agentes (E5) ---

def test_registry_put_get_delete_shows_the_key_name(ready_admin):
    vault_id = vault_of(ready_admin)
    agent_client(ready_admin, "aira")
    agent_client(ready_admin, "emma", label="op-emma")
    entry = register(ready_admin, vault_id, "aira", ["1 - Proyectos AIRA", "00- BITACORA"])
    assert entry["keys"] == [{"label": "op-aira", "is_admin": False}]
    seen = ready_admin.get(f"/vaults/{vault_id}/agent-access").json()
    assert [a["agent_id"] for a in seen["agents"]] == ["aira"] and seen["mode"] == settings.AGENT_ACCESS_MODE
    assert seen["unregistered_agent_ids"] == ["emma"]
    note = find(ready_admin, vault_id, "AG - AGENTES/aira.md")
    assert note["frontmatter"]["clave"] == "op-aira" and note["frontmatter"]["agente"] == "aira"
    register(ready_admin, vault_id, "aira", ["*"], "suspendido")
    assert ready_admin.get(f"/vaults/{vault_id}/agent-access").json()["agents"][0]["estado"] == "suspendido"
    assert ready_admin.delete(f"/vaults/{vault_id}/agent-access/aira").status_code == 204
    assert ready_admin.get(f"/vaults/{vault_id}/agent-access").json()["agents"] == []
    assert ready_admin.delete(f"/vaults/{vault_id}/agent-access/aira").status_code == 404


def test_registry_rejects_bad_folders_and_hand_edited_garbage(ready_admin):
    vault_id = vault_of(ready_admin)
    assert ready_admin.put(f"/vaults/{vault_id}/agent-access/aira", json={"carpetas": ["a//b"]}).status_code == 422
    res = post_note(ready_admin, vault_id, "AG - AGENTES/aira.md", frontmatter={"estado": "raro"})
    assert res.status_code == 422 and detail(res) == "ag-agentes:registro"


# --- Modo sombra y cumplimiento (E6) ---

def _rows(db):
    db.expire_all()
    return db.query(AgentAccessLog).order_by(AgentAccessLog.at).all()


def test_shadow_mode_only_logs_what_it_would_deny(ready_admin, db, monkeypatch):
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "shadow")
    vault_id = vault_of(ready_admin)
    aira = agent_client(ready_admin, "aira")
    register(ready_admin, vault_id, "aira", ["Permitida"])
    assert post_note(aira, vault_id, "Permitida/a.md").status_code == 201
    assert post_note(aira, vault_id, "Ajena/b.md").status_code == 201  # sombra: no bloquea
    rows = _rows(db)
    assert [(r.agent_id, r.decision, r.reason) for r in rows] == [
        ("aira", "allow", None), ("aira", "deny", "folder-not-assigned")]
    assert all(r.mode == "shadow" and r.key_label == "op-aira" for r in rows)
    report = ready_admin.get("/agent-access/shadow-report").json()
    assert report["total"] == 2 and report["recent_denies"][0]["paths"] == ["Ajena/b.md"]


def test_shadow_mode_evaluates_a_general_key_as_the_agent_it_declares(ready_admin, db, monkeypatch):
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "shadow")
    vault_id = vault_of(ready_admin)
    general = _bearer_client(ready_admin, ready_admin.post("/auth/agent-keys", json={"label": "OpenClaw"}).json()["key"])
    register(ready_admin, vault_id, "emma", ["Permitida"])
    general.headers["X-Agent-Id"] = "emma"
    assert post_note(general, vault_id, "Ajena/b.md").status_code == 201
    general.headers["X-Agent-Id"] = "BAD id"
    assert post_note(general, vault_id, "Ajena/c.md").status_code == 201
    first, second = _rows(db)
    assert (first.agent_id, first.declared, first.decision) == ("emma", True, "deny")
    assert (second.agent_id, second.declared, second.decision, second.reason) == (None, False, "deny-general", "general-key")


def test_enforce_mode_rejects_with_403_and_leaves_humans_alone(ready_admin, monkeypatch):
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    vault_id = vault_of(ready_admin)
    aira = agent_client(ready_admin, "aira")
    boss = agent_client(ready_admin, "main", admin_flag=True)
    register(ready_admin, vault_id, "aira", ["Permitida"])
    assert post_note(aira, vault_id, "Permitida/a.md").status_code == 201
    res = post_note(aira, vault_id, "Ajena/b.md")
    assert res.status_code == 403 and res.json()["type"].endswith("agent-access-denied")
    assert post_note(boss, vault_id, "Ajena/c.md").status_code == 201  # el agente administrador escribe donde sea
    assert post_note(ready_admin, vault_id, "Ajena/d.md").status_code == 201  # la sesión humana, siempre
    assert find(ready_admin, vault_id, "Ajena/b.md") is None
    # un agente no registrado solo escribe en AG - MENSAJES; el registro no lo toca ningún agente
    nobody = agent_client(ready_admin, "nadie")
    assert post_note(nobody, vault_id, "Permitida/x.md").status_code == 403
    assert post_note(nobody, vault_id, "AG - MENSAJES/liza/20261105-0930-x/000-cabecera.md",
                     frontmatter={**HEAD, "de": "nadie"}).status_code == 201
    assert post_note(aira, vault_id, "AG - AGENTES/aira.md", frontmatter={"estado": "activo", "carpetas": ["*"]}).status_code == 403


def test_enforce_mode_general_key_is_an_unregistered_agent(ready_admin, monkeypatch):
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    vault_id = vault_of(ready_admin)
    general = _bearer_client(ready_admin, ready_admin.post("/auth/agent-keys", json={"label": "OpenClaw"}).json()["key"])
    general.headers["X-Agent-Id"] = "main"  # declarar no sirve con cumplimiento activo
    assert post_note(general, vault_id, "Nota.md").status_code == 403


def test_registry_change_takes_effect_immediately(ready_admin, monkeypatch):
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    vault_id = vault_of(ready_admin)
    aira = agent_client(ready_admin, "aira")
    assert post_note(aira, vault_id, "A/a.md").status_code == 403
    register(ready_admin, vault_id, "aira", ["A"])
    assert post_note(aira, vault_id, "A/a.md").status_code == 201
    register(ready_admin, vault_id, "aira", ["A"], "suspendido")
    assert post_note(aira, vault_id, "A/b.md").status_code == 403


def test_enforce_covers_update_move_delete_restore_and_folder_move(ready_admin, monkeypatch):
    vault_id = vault_of(ready_admin)
    aira = agent_client(ready_admin, "aira")
    register(ready_admin, vault_id, "aira", ["A"])
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    assert post_note(aira, vault_id, "A/a.md").status_code == 201
    assert post_note(ready_admin, vault_id, "B/b.md").status_code == 201
    mine, theirs = find(aira, vault_id, "A/a.md"), find(aira, vault_id, "B/b.md")
    assert patch(aira, vault_id, theirs, content="x").status_code == 403
    assert patch(aira, vault_id, mine, path="B/a.md").status_code == 403   # sacarla de su carpeta
    assert patch(aira, vault_id, theirs, path="A/b.md").status_code == 403  # meter la ajena a la suya
    assert aira.delete(f"/vaults/{vault_id}/notes/{theirs['id']}", headers={"If-Match": theirs["etag"]}).status_code == 403
    assert aira.post(f"/vaults/{vault_id}/folders/move", json={"from": "B", "to": "C"}).status_code == 403
    assert aira.post(f"/vaults/{vault_id}/folders/move", json={"from": "A", "to": "A2"}).status_code == 403  # el destino no es suyo
    assert patch(aira, vault_id, mine, content="mio").status_code == 200
    assert aira.delete(f"/vaults/{vault_id}/notes/{mine['id']}", headers={"If-Match": find(aira, vault_id, 'A/a.md')['etag']}).status_code == 204


def test_files_need_an_active_registration_when_enforcing(ready_admin, monkeypatch):
    from app.main import app
    from app.routers.files import get_object_storage
    from tests.fake_object_storage import FakeObjectStorage

    app.dependency_overrides[get_object_storage] = lambda: FakeObjectStorage()
    try:
        vault_id = vault_of(ready_admin)
        aira = agent_client(ready_admin, "aira")
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
        upload = lambda client: client.post(  # noqa: E731
            "/files", data={"vault_id": vault_id}, files={"file": ("f.png", png, "image/png")})
        monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "shadow")
        assert upload(aira).status_code == 201
        monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
        assert upload(aira).status_code == 403
        register(ready_admin, vault_id, "aira", ["A"])
        assert upload(aira).status_code == 201
    finally:
        app.dependency_overrides.pop(get_object_storage, None)


def test_mode_off_does_not_evaluate_or_log(ready_admin, db, monkeypatch):
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "off")
    vault_id = vault_of(ready_admin)
    aira = agent_client(ready_admin, "aira")
    assert post_note(aira, vault_id, "X/a.md").status_code == 201
    assert _rows(db) == []


def test_prefix_listing_for_the_inbox(ready_admin):
    vault_id = vault_of(ready_admin)
    aira = agent_client(ready_admin, "aira")
    assert post_note(aira, vault_id, CAB, frontmatter=HEAD).status_code == 201
    assert post_note(aira, vault_id, MSG1).status_code == 201
    inbox = ready_admin.get(f"/vaults/{vault_id}/notes", params={"prefix": "AG - MENSAJES/liza", "limit": 200}).json()["items"]
    paths = [i["path"] for i in inbox]
    assert CAB in paths and MSG1 in paths and all(p.startswith("AG - MENSAJES/liza/") for p in paths)
    cab = next(i for i in inbox if i["path"] == CAB)
    assert cab["frontmatter"]["estado"] == "abierta"  # la bandeja filtra por estado en el cliente
