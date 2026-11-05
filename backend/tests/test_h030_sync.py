"""H-030 por `/sync`: el mismo conjunto de reglas que la REST, aplicado al push del replicador."""
import pytest

from app.core.config import settings
from app.core.models.agent_access_log import AgentAccessLog
from app.services import agent_access_guard
from tests.test_agent_api_key_access import _bearer_client
from tests.test_h030_api import CAB, HEAD, MSG1, MSG2, agent_client, register
from tests.test_note_sync_api import couch_get, note_doc, push, rejection, user_db, vault, vault_doc, owner_of  # noqa: F401
from tests.test_sync_api import child_of

CAB_HEAD = {**HEAD}


@pytest.fixture(autouse=True)
def _fresh_registry_cache():
    agent_access_guard._CACHE.clear()
    yield
    agent_access_guard._CACHE.clear()


def reasons(res) -> list[str]:
    assert res.status_code == 201, res.text
    return [r["reason"] for r in res.json()]


def test_a_vault_pushed_by_sync_is_born_with_the_reserved_folders(ready_admin, db, monkeypatch):
    monkeypatch.setattr(settings, "SEED_AG_FOLDERS", True)
    doc = vault_doc(owner_of(db), name="Nueva")
    assert push(ready_admin, [doc]).json() == []
    vault_id = doc["_id"].removeprefix("vault:")
    paths = {i["path"] for i in ready_admin.get(f"/vaults/{vault_id}/notes", params={"limit": 200}).json()["items"]}
    assert "AG - MENSAJES/INDICE.md" in paths and "INDICE.md" in paths and len(paths) == 6


def test_reserved_names_and_reserved_indexes_are_protected_in_the_push(vault, ready_admin):
    assert reasons(push(ready_admin, [note_doc(vault["id"], path="AG - SKILLS")])) == ["reserved-name:path"]
    index = note_doc(vault["id"], path="AG - SKILLS/INDICE.md", content="")
    assert push(ready_admin, [index]).json() == []
    moved = child_of(index, path="Skills/INDICE.md")
    assert reasons(push(ready_admin, [moved])) == ["meta-folder:rename"]
    gone = child_of(index, deleted_at="2026-11-05T10:00:00.000000Z")
    assert reasons(push(ready_admin, [gone])) == ["meta-folder:index-delete"]


def test_mensajes_format_is_validated_in_the_push(vault, ready_admin):
    assert reasons(push(ready_admin, [note_doc(vault["id"], path="AG - MENSAJES/suelta.md")])) == ["ag-mensajes:path"]
    bad_head = note_doc(vault["id"], path=CAB, frontmatter={**CAB_HEAD, "para": "emma"})
    assert reasons(push(ready_admin, [bad_head])) == ["ag-mensajes:cabecera"]
    assert push(ready_admin, [note_doc(vault["id"], path=CAB, frontmatter=CAB_HEAD)]).json() == []


def test_cerrada_el_is_stamped_by_the_server_and_cannot_be_set_by_the_client(vault, ready_admin):
    head = note_doc(vault["id"], path=CAB, frontmatter=CAB_HEAD)
    assert push(ready_admin, [head]).json() == []
    forged = child_of(head, frontmatter={**CAB_HEAD, "estado": "cerrada", "cerrada_el": "1999-01-01T00:00:00.000000Z"})
    assert reasons(push(ready_admin, [forged])) == ["immutable-field:cerrada_el"]
    closed = child_of(head, frontmatter={**CAB_HEAD, "estado": "cerrada"})
    assert push(ready_admin, [closed]).json() == []
    stored = couch_get(vault["db"], head["_id"]).json()
    assert stored["frontmatter"]["estado"] == "cerrada" and stored["frontmatter"]["cerrada_el"].startswith("20")
    assert stored["_rev"] != closed["_rev"]  # el servidor escribió una revisión posterior con el sello


def test_a_message_pushed_into_a_closed_conversation_reopens_it(vault, ready_admin):
    head = note_doc(vault["id"], path=CAB, frontmatter=CAB_HEAD)
    closed = child_of(head, frontmatter={**CAB_HEAD, "estado": "cerrada"})
    assert push(ready_admin, [head]).json() == [] and push(ready_admin, [closed]).json() == []
    assert push(ready_admin, [note_doc(vault["id"], path=MSG2)]).json() == []
    stored = couch_get(vault["db"], head["_id"]).json()["frontmatter"]
    assert stored["estado"] == "abierta" and "cerrada_el" not in stored


def test_agent_message_immutability_in_the_push(vault, ready_admin):
    aira = agent_client(ready_admin, "aira")
    assert push(aira, [note_doc(vault["id"], path=CAB, frontmatter=CAB_HEAD)]).json() == []
    msg = note_doc(vault["id"], path=MSG1, content="hola")
    assert push(aira, [msg]).json() == []
    assert reasons(push(aira, [child_of(msg, content="editado")])) == ["ag-mensajes:immutable"]
    assert reasons(push(aira, [note_doc(vault["id"], path="AG - MENSAJES/liza/20261105-0930-revisar/003-de-liza.md")])) == [
        "ag-mensajes:from-mismatch"]
    # la sesión humana sí corrige un mensaje
    assert push(ready_admin, [child_of(msg, content="corregido")]).json() == []


def test_registry_notes_must_be_valid_in_the_push(vault, ready_admin):
    bad = note_doc(vault["id"], path="AG - AGENTES/aira.md", frontmatter={"estado": "raro"})
    assert reasons(push(ready_admin, [bad])) == ["ag-agentes:registro"]
    good = note_doc(vault["id"], path="AG - AGENTES/aira.md", frontmatter={"estado": "activo", "carpetas": ["A"]})
    assert push(ready_admin, [good]).json() == []


def test_push_of_an_agent_is_logged_in_shadow_and_rejected_when_enforcing(vault, ready_admin, db, monkeypatch):
    aira = agent_client(ready_admin, "aira")
    register(ready_admin, vault["id"], "aira", ["A"])
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "shadow")
    assert push(aira, [note_doc(vault["id"], path="Ajena/x.md")]).json() == []
    db.expire_all()
    assert [(r.op, r.decision, r.reason) for r in db.query(AgentAccessLog).all()] == [("sync-write", "deny", "folder-not-assigned")]
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    assert reasons(push(aira, [note_doc(vault["id"], path="Ajena/y.md")])) == ["agent-access-denied"]
    assert push(aira, [note_doc(vault["id"], path="A/z.md")]).json() == []
    # la sesión humana no se evalúa
    assert push(ready_admin, [note_doc(vault["id"], path="Ajena/h.md")]).json() == []
