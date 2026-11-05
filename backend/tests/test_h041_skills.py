"""H-041 E3: propietario, invitados y gestores de las skills de bóveda. Reglas puras y REST/`/sync` de punta a punta
(TestClient + CouchDB real), con el interruptor de H-030 en sombra y en `enforce`."""
import json
from pathlib import Path

import pytest

from app.core import skill_rules as sr
from app.core.agent_access import Actor, Registration
from app.core.config import settings
from app.core.models.agent_access_log import AgentAccessLog
from app.services import agent_access_guard
from tests.test_h030_api import agent_client, detail, find, patch, post_note, register, vault_of
from tests.test_note_sync_api import note_doc, push, vault  # noqa: F401
from tests.test_sync_api import child_of

SK = "AG - SKILLS"
REG = {
    "aira": Registration("aira", ("*",), "activo"),
    "emma": Registration("emma", ("*",), "activo"),
    "paused": Registration("paused", ("*",), "suspendido"),
}


@pytest.fixture(autouse=True)
def _fresh_registry_cache():
    agent_access_guard._CACHE.clear()
    yield
    agent_access_guard._CACHE.clear()


# --- Reglas puras ---

SPEC = json.loads((Path(__file__).parent / "fixtures" / "skills_reglas.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", SPEC["paths"], ids=lambda c: c["path"])
def test_is_skill_path_is_flat_non_index_non_system(case):
    assert sr.is_skill_path(case["path"]) is case["expected"]


@pytest.mark.parametrize("case", SPEC["shape"], ids=lambda c: json.dumps(c["frontmatter"])[:60])
def test_shape(case):
    assert sr.check_shape(case["frontmatter"]) == case["expected"]


def test_people_are_only_checked_when_introduced():
    assert sr.check_people({"propietario": "aira", "agentes": ["emma"]}, REG) is None
    assert sr.check_people({"propietario": "nadie"}, REG) == "skill:propietario"
    assert sr.check_people({"propietario": "paused"}, REG) == "skill:propietario"
    assert sr.check_people({"propietario": "aira", "agentes": ["nadie"]}, REG) == "skill:agentes"
    # Lo que ya estaba no se vuelve a exigir al editar otra cosa (el flujo del gestor que sale lo resuelve aparte).
    old = {"propietario": "nadie", "agentes": ["paused"]}
    assert sr.check_people({"propietario": "nadie", "agentes": ["paused"], "titulo": "x"}, REG, old) is None
    assert sr.check_people({"propietario": "nadie", "agentes": ["paused", "otro"]}, REG, old) == "skill:agentes"


def _agent(agent_id):
    return Actor("agent", agent_id, False, f"op-{agent_id}")


@pytest.mark.parametrize("who,op,old,new,allowed,reason", [
    ("aira", "create", None, {"propietario": "aira"}, True, None),
    ("nadie", "create", None, {"propietario": "nadie"}, False, "not-registered"),
    ("paused", "create", None, {"propietario": "paused"}, False, "suspended"),
    ("aira", "create", None, {"propietario": "aira", "agentes": ["emma"]}, True, None),
    ("aira", "create", None, {"propietario": "aira", "agentes": ["nadie"]}, False, sr.INVITEE_NOT_MANAGER),
    ("aira", "update", {"propietario": "aira"}, {"propietario": "aira", "agentes": ["emma"]}, True, None),
    ("aira", "update", {"propietario": "aira", "agentes": ["emma"]}, {"propietario": "aira", "agentes": ["emma", "nadie"]}, False, sr.INVITEE_NOT_MANAGER),
    ("emma", "update", {"propietario": "aira", "agentes": ["emma"]}, {"propietario": "aira", "agentes": []}, False, sr.NOT_OWNER),
    ("emma", "delete", {"propietario": "aira", "agentes": ["emma"]}, None, False, sr.NOT_OWNER),
    ("emma", "restore", {"propietario": "aira"}, {"propietario": "aira"}, False, sr.NOT_OWNER),
    ("emma", "move", {"propietario": "aira"}, None, False, sr.NOT_OWNER),
    ("aira", "update", {"propietario": "aira"}, {"propietario": "emma"}, False, sr.OWNER_IMMUTABLE),
    ("aira", "update", {"estado": "archivado"}, {"propietario": "aira"}, False, sr.NOT_OWNER),  # nadie es dueño de una archivada
    ("aira", "delete", {"propietario": "aira"}, None, True, None),
])
def test_decide_skill(who, op, old, new, allowed, reason):
    verdict = sr.decide_skill(_agent(who), REG, op, old, new, honor_declared=False)
    assert (verdict.allowed, verdict.reason) == (allowed, reason)


def test_human_is_not_evaluated_and_a_general_key_is_an_unregistered_agent():
    assert sr.decide_skill(Actor("human"), REG, "update", {"propietario": "aira"}, {"propietario": "x"}, honor_declared=False).allowed
    general = Actor("general", None, False, "key", "aira")
    assert sr.decide_skill(general, REG, "create", None, {"propietario": "aira"}, honor_declared=False).reason == "general-key"
    assert sr.decide_skill(general, REG, "create", None, {"propietario": "aira"}, honor_declared=True).allowed  # en sombra, el que declara


def test_assign_archive_and_drop_guest():
    fm = {"titulo": "x", "propietario": "aira", "agentes": ["emma", "otro"], "estado": "aprobado"}
    assert sr.archive(fm) == {"titulo": "x", "estado": "archivado"}
    assert sr.check_shape(sr.archive(fm)) is None
    assigned = sr.assign_owner(sr.archive(fm), "emma")
    assert assigned == {"titulo": "x", "propietario": "emma", "agentes": [], "estado": "en revisión"}
    # Asignar a un invitado: sale de `agentes` y el estado se conserva (la skill ya estaba activa).
    assert sr.assign_owner(fm, "emma") == {"titulo": "x", "propietario": "emma", "agentes": ["otro"], "estado": "aprobado"}
    assert sr.drop_guest(fm, "emma")["agentes"] == ["otro"]


# --- REST: el servidor sella el propietario ---

def _fm(**extra):
    return {"titulo": "una skill", "descripcion": "Al hacer algo.", "tags": ["skill"], "estado": "borrador", **extra}


def test_the_server_seals_the_owner_and_ignores_what_the_agent_declares(ready_admin):
    vault_id = vault_of(ready_admin)
    register(ready_admin, vault_id, "aira", ["*"])
    aira = agent_client(ready_admin, "aira")
    created = post_note(aira, vault_id, f"{SK}/Gestión de variables", "# Paso", _fm(propietario="emma", agentes=[]))
    assert created.status_code == 201 and created.json()["frontmatter"]["propietario"] == "aira"
    assert created.json()["frontmatter"]["agentes"] == []
    without = post_note(aira, vault_id, f"{SK}/Otra", "x", _fm())
    assert without.json()["frontmatter"]["propietario"] == "aira" and "agentes" not in without.json()["frontmatter"]


def test_an_agent_keeps_the_owner_when_it_does_not_resend_it_and_cannot_change_it_in_enforce(ready_admin, monkeypatch):
    vault_id = vault_of(ready_admin)
    register(ready_admin, vault_id, "aira", ["*"])
    register(ready_admin, vault_id, "emma", ["*"])
    aira = agent_client(ready_admin, "aira")
    created = post_note(aira, vault_id, f"{SK}/uno", "x", _fm())
    item = {"id": created.json()["id"], "etag": created.headers["ETag"]}
    edited = patch(aira, vault_id, item, frontmatter=_fm(titulo="otro"))  # no reenvía `propietario`
    assert edited.status_code == 200 and edited.json()["frontmatter"]["propietario"] == "aira"
    item["etag"] = edited.headers["ETag"]
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    res = patch(aira, vault_id, item, frontmatter=_fm(propietario="emma"))
    assert res.status_code == 403 and res.json()["detail"] == sr.PUBLIC_DETAIL[sr.OWNER_IMMUTABLE]


def test_only_the_owner_edits_moves_deletes_or_restores_in_enforce_and_shadow_only_logs(ready_admin, db, monkeypatch):
    vault_id = vault_of(ready_admin)
    for agent in ("aira", "emma"):
        register(ready_admin, vault_id, agent, ["*"])
    aira, emma = agent_client(ready_admin, "aira"), agent_client(ready_admin, "emma")
    created = post_note(aira, vault_id, f"{SK}/propia", "x", _fm(agentes=["emma"]))
    item = {"id": created.json()["id"], "etag": created.headers["ETag"]}

    # Sombra: el invitado (que solo puede usarla) edita y queda registrado, sin bloquear.
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "shadow")
    shadow = patch(emma, vault_id, item, content="del invitado")
    assert shadow.status_code == 200
    db.expire_all()
    denied = db.query(AgentAccessLog).filter(AgentAccessLog.op == "skill-update", AgentAccessLog.decision == "deny").all()
    assert [(r.agent_id, r.reason, r.mode) for r in denied] == [("emma", sr.NOT_OWNER, "shadow")]
    item["etag"] = shadow.headers["ETag"]

    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    for res in (patch(emma, vault_id, item, content="otra vez"),
                patch(emma, vault_id, item, path="Notas/robada.md"),
                emma.delete(f"/vaults/{vault_id}/notes/{item['id']}", headers={"If-Match": item["etag"]})):
        assert res.status_code == 403 and res.json()["detail"] == sr.PUBLIC_DETAIL[sr.NOT_OWNER]
    assert patch(aira, vault_id, item, content="del propietario").status_code == 200  # el propietario sí
    assert find(ready_admin, vault_id, f"{SK}/skill-propia.md") is not None


def test_a_skill_can_only_invite_managers_and_a_read_only_agent_cannot_create(ready_admin, monkeypatch):
    vault_id = vault_of(ready_admin)
    register(ready_admin, vault_id, "aira", ["*"])
    register(ready_admin, vault_id, "paused", ["*"], "suspendido")
    aira, reader = agent_client(ready_admin, "aira"), agent_client(ready_admin, "lector")
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    res = post_note(aira, vault_id, f"{SK}/invita", "x", _fm(agentes=["lector"]))
    assert res.status_code == 403 and res.json()["detail"] == sr.PUBLIC_DETAIL[sr.INVITEE_NOT_MANAGER]
    assert post_note(aira, vault_id, f"{SK}/invita", "x", _fm(agentes=["paused"])).status_code == 403
    assert post_note(aira, vault_id, f"{SK}/invita", "x", _fm(agentes=[])).status_code == 201
    # Un agente de solo lectura no crea: en enforce 403; en sombra queda registrado y la skill nace con su propietario.
    assert post_note(reader, vault_id, f"{SK}/lectura", "x", _fm()).status_code == 403
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "shadow")
    assert post_note(reader, vault_id, f"{SK}/lectura", "x", _fm()).status_code == 201


def test_a_general_key_without_identity_cannot_make_an_ownerless_skill_even_in_shadow(ready_admin):
    vault_id = vault_of(ready_admin)
    res = ready_admin.post("/auth/agent-keys", json={"label": "general"})
    from tests.test_agent_api_key_access import _bearer_client

    general = _bearer_client(ready_admin, res.json()["key"])
    refused = post_note(general, vault_id, f"{SK}/sin-dueno", "x", _fm())
    assert refused.status_code == 422 and detail(refused) == "skill:propietario"
    general.headers["X-Agent-Id"] = "aira"  # una clave general que declara el agente (sombra)
    assert post_note(general, vault_id, f"{SK}/con-dueno", "x", _fm()).json()["frontmatter"]["propietario"] == "aira"


# --- REST: el usuario ---

def test_the_user_must_name_a_manager_owner_or_archive(ready_admin):
    vault_id = vault_of(ready_admin)
    # Sin gestores no hay a quién asignarla: solo se puede crear archivada.
    assert detail(post_note(ready_admin, vault_id, f"{SK}/uno", "x", _fm())) == "skill:propietario"
    assert detail(post_note(ready_admin, vault_id, f"{SK}/uno", "x", _fm(propietario="aira"))) == "skill:propietario"
    archived = post_note(ready_admin, vault_id, f"{SK}/uno", "x", _fm(estado="archivado"))
    assert archived.status_code == 201
    register(ready_admin, vault_id, "aira", ["*"])
    register(ready_admin, vault_id, "emma", ["*"])
    ok = post_note(ready_admin, vault_id, f"{SK}/dos", "x", _fm(propietario="aira", agentes=["emma"]))
    assert ok.status_code == 201
    assert detail(post_note(ready_admin, vault_id, f"{SK}/tres", "x", _fm(propietario="aira", agentes=["nadie"]))) == "skill:agentes"
    assert detail(post_note(ready_admin, vault_id, f"{SK}/cuatro", "x", _fm(propietario="aira", agentes=["aira"]))) == "skill:agentes"
    assert detail(post_note(ready_admin, vault_id, f"{SK}/cinco", "x", _fm(estado="archivado", propietario="aira"))) == "skill:estado"


def test_the_user_edits_any_skill_and_reassigns_without_the_agent_being_asked(ready_admin):
    vault_id = vault_of(ready_admin)
    for agent in ("aira", "emma"):
        register(ready_admin, vault_id, agent, ["*"])
    aira = agent_client(ready_admin, "aira")
    created = post_note(aira, vault_id, f"{SK}/propia", "x", _fm())
    item = {"id": created.json()["id"], "etag": created.headers["ETag"]}
    edited = patch(ready_admin, vault_id, item, content="el usuario edita lo del agente")
    assert edited.status_code == 200 and edited.json()["frontmatter"]["propietario"] == "aira"  # el usuario no sella nada
    item["etag"] = edited.headers["ETag"]
    moved = patch(ready_admin, vault_id, item, frontmatter=_fm(propietario="emma"))
    assert moved.status_code == 200 and moved.json()["frontmatter"]["propietario"] == "emma"
    item["etag"] = moved.headers["ETag"]
    assert detail(patch(ready_admin, vault_id, item, frontmatter=_fm(propietario="nadie"))) == "skill:propietario"


def test_a_note_moved_into_skills_needs_an_owner_and_an_agent_that_moves_it_in_becomes_the_owner(ready_admin):
    vault_id = vault_of(ready_admin)
    register(ready_admin, vault_id, "aira", ["*"])
    aira = agent_client(ready_admin, "aira")
    note = post_note(aira, vault_id, "Notas/borrador.md", "x", _fm())
    item = {"id": note.json()["id"], "etag": note.headers["ETag"]}
    moved = patch(aira, vault_id, item, path=f"{SK}/Borrador")
    assert moved.status_code == 200 and moved.json()["path"] == f"{SK}/skill-borrador.md"
    assert moved.json()["frontmatter"]["propietario"] == "aira"
    plain = post_note(ready_admin, vault_id, "Notas/otro.md", "x", _fm())
    item2 = {"id": plain.json()["id"], "etag": plain.headers["ETag"]}
    assert detail(patch(ready_admin, vault_id, item2, path=f"{SK}/Otro")) == "skill:propietario"


def test_anterior_skills_in_subfolders_are_tolerated_until_renamed(ready_admin):
    vault_id = vault_of(ready_admin)
    # Lo anterior a H-041 (skills en subcarpetas) no exige propietario mientras no se renombre.
    from tests.test_h041_system import _legacy
    from app.routers.vaults import get_vault_port
    from tests.test_vaults_api import user_db
    from tests.conftest import TestingSessionLocal

    session = TestingSessionLocal()
    try:
        name = user_db(session)
    finally:
        session.close()
    _legacy(get_vault_port(), name, vault_id, f"{SK}/aira/vieja.md", "uno", {"titulo": "vieja"})
    item = find(ready_admin, vault_id, f"{SK}/aira/vieja.md")
    assert patch(ready_admin, vault_id, item, content="dos").status_code == 200


# --- /sync ---

def test_sync_requires_a_shaped_skill_and_a_manager_owner_from_the_user(vault, ready_admin, monkeypatch):
    vault_id = vault["id"]

    def reasons(res):
        assert res.status_code == 201, res.text
        return [r["reason"] for r in res.json()]

    assert reasons(push(ready_admin, [note_doc(vault_id, path=f"{SK}/skill-a.md", frontmatter={})])) == ["skill:propietario"]
    assert reasons(push(ready_admin, [note_doc(vault_id, path=f"{SK}/skill-a.md", frontmatter={"propietario": "aira"})])) == ["skill:propietario"]
    assert push(ready_admin, [note_doc(vault_id, path=f"{SK}/skill-a.md", frontmatter={"estado": "archivado"})]).json() == []
    # Registrar gestores por la REST y volver a probar.
    from tests.test_h030_api import register as reg

    reg(ready_admin, vault_id, "aira", ["*"])
    reg(ready_admin, vault_id, "emma", ["*"])
    good = note_doc(vault_id, path=f"{SK}/skill-b.md", frontmatter={"propietario": "aira", "agentes": ["emma"]})
    assert push(ready_admin, [good]).json() == []
    assert reasons(push(ready_admin, [child_of(good, frontmatter={"propietario": "aira", "agentes": ["nadie"]})])) == ["skill:agentes"]
    assert reasons(push(ready_admin, [child_of(good, frontmatter={"propietario": "aira", "agentes": ["aira"]})])) == ["skill:agentes"]
    # Archivar es una revisión válida; borrar lógicamente también.
    assert push(ready_admin, [child_of(good, frontmatter={"estado": "archivado"})]).json() == []
