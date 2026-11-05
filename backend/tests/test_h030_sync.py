"""H-030 por `/sync`: el mismo conjunto de reglas que la REST, aplicado al push del replicador."""
import pytest

from app.core.config import settings
from app.core.models.agent_access_log import AgentAccessLog
from app.services import agent_access_guard
from tests.test_agent_api_key_access import _bearer_client
from tests.test_h030_api import CAB, CONV, MSG1, MSG2, agent_client, find, register
from tests.test_note_sync_api import couch_get, note_doc, push, rejection, user_db, vault, vault_doc, owner_of  # noqa: F401
from tests.test_sync_api import child_of



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
    assert "AG - MENSAJES/INDICE.md" in paths and "INDICE.md" in paths and len(paths) == 8


def test_reserved_names_and_reserved_indexes_are_protected_in_the_push(vault, ready_admin):
    assert reasons(push(ready_admin, [note_doc(vault["id"], path="AG - SKILLS")])) == ["reserved-name:path"]
    index = note_doc(vault["id"], path="AG - SKILLS/INDICE.md", content="")
    assert push(ready_admin, [index]).json() == []
    moved = child_of(index, path="Skills/INDICE.md")
    assert reasons(push(ready_admin, [moved])) == ["meta-folder:rename"]
    gone = child_of(index, deleted_at="2026-11-05T10:00:00.000000Z")
    assert reasons(push(ready_admin, [gone])) == ["meta-folder:index-delete"]


def server_header(vault, ready_admin) -> dict:
    """La cabecera que el servidor creó con el primer mensaje, con su historia de revisiones (para empujar una hija)."""
    note_id = find(ready_admin, vault["id"], CAB)["id"]
    return couch_get(vault["db"], f"note:{vault['id']}:{note_id}", revs="true").json()


def test_cerrada_el_is_stamped_by_the_server_and_cannot_be_set_by_the_client(vault, ready_admin):
    aira = agent_client(ready_admin, "aira")
    assert push(aira, [note_doc(vault["id"], path=MSG1, content="hola")]).json() == []
    head = server_header(vault, ready_admin)
    forged = child_of(head, frontmatter={**head["frontmatter"], "estado": "cerrada", "cerrada_el": "1999-01-01T00:00:00.000000Z"})
    assert reasons(push(aira, [forged])) == ["immutable-field:cerrada_el"]
    closed = child_of(head, frontmatter={**head["frontmatter"], "estado": "cerrada"})
    assert push(aira, [closed]).json() == []
    stored = couch_get(vault["db"], head["_id"]).json()
    assert stored["frontmatter"]["estado"] == "cerrada" and stored["frontmatter"]["cerrada_el"].startswith("20")
    assert stored["_rev"] != closed["_rev"]  # el servidor escribió una revisión posterior con el sello
    # el cuerpo y los demás metadatos de la cabecera no se tocan (sobre la revisión vigente)
    head = server_header(vault, ready_admin)
    assert reasons(push(aira, [child_of(head, frontmatter={**head["frontmatter"], "titulo": "Otro"})])) == ["ag-mensajes:immutable"]
    assert reasons(push(aira, [child_of(head, frontmatter={**head["frontmatter"], "para": "emma"})])) == ["ag-mensajes:cabecera"]
    assert reasons(push(aira, [child_of(head, content="otro")])) == ["ag-mensajes:immutable"]


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
