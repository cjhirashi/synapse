"""H-041 E4: el gestor que sale (quitar o suspender), las skills archivadas y su reasignación. REST y `/sync` de punta
a punta (TestClient + CouchDB real)."""
import pytest

from app.core import skill_rules as sr
from app.services import agent_access_guard
from tests.test_h030_api import agent_client, detail, find, patch, post_note, register, vault_of
from tests.test_note_sync_api import note_doc, push, vault  # noqa: F401
from tests.test_sync_api import child_of

SK = "AG - SKILLS"


@pytest.fixture(autouse=True)
def _fresh_registry_cache():
    agent_access_guard._CACHE.clear()
    yield
    agent_access_guard._CACHE.clear()


def _fm(**extra):
    return {"titulo": "una skill", "descripcion": "Al hacer algo.", "tags": ["skill"], "estado": "borrador", **extra}


def make(client, vault_id, name, **extra):
    res = post_note(client, vault_id, f"{SK}/{name}", "# paso", _fm(**extra))
    assert res.status_code == 201, res.text
    return res.json()["id"]


def skills(client, vault_id):
    res = client.get(f"/vaults/{vault_id}/skills")
    assert res.status_code == 200, res.text
    return {s["path"].rsplit("/", 1)[1][:-3]: s for s in res.json()["skills"]}


def leave(client, vault_id, agent, modo="quitar", resolutions=()):
    return client.post(f"/vaults/{vault_id}/agent-access/{agent}/leave", json={"modo": modo, "skills": list(resolutions)})


@pytest.fixture
def team(ready_admin):
    """Una bóveda con tres gestores: aira (propietaria), emma y otro (invitados) y una skill de cada tipo."""
    vault_id = vault_of(ready_admin)
    for agent in ("aira", "emma", "otro"):
        register(ready_admin, vault_id, agent, ["*"])
    aira, emma = agent_client(ready_admin, "aira"), agent_client(ready_admin, "emma")
    ids = {
        "compartida": make(aira, vault_id, "compartida", agentes=["emma", "otro"]),
        "sola": make(aira, vault_id, "sola"),
        "de-emma": make(emma, vault_id, "de-emma", agentes=["aira"]),
    }
    return vault_id, ids


# --- Listado ---

def test_listing_shows_owner_guests_and_state_but_not_system_docs(ready_admin, team):
    vault_id, ids = team
    listed = skills(ready_admin, vault_id)
    assert set(listed) == {"skill-compartida", "skill-sola", "skill-de-emma"}  # ni la skill de sistema ni el INDICE
    assert (listed["skill-compartida"]["propietario"], listed["skill-compartida"]["agentes"]) == ("aira", ["emma", "otro"])
    assert listed["skill-sola"]["agentes"] == [] and listed["skill-compartida"]["note_id"] == ids["compartida"]
    # Un agente puede leer el listado; el usuario es quien lo usa para resolver.
    assert agent_client(ready_admin, "emma", label="op-emma-b").get(f"/vaults/{vault_id}/skills").status_code == 200


# --- El gestor que sale ---

def test_leaving_without_resolving_owned_skills_is_a_409_and_changes_nothing(ready_admin, team):
    vault_id, _ = team
    res = leave(ready_admin, vault_id, "aira")
    assert res.status_code == 409 and res.json()["type"].endswith("agent-owns-skills")
    assert ready_admin.get(f"/vaults/{vault_id}/agent-access").json()["agents"][0]["agent_id"] == "aira"
    assert skills(ready_admin, vault_id)["skill-sola"]["propietario"] == "aira"
    # Resolver solo una de dos tampoco basta.
    partial = [{"note_id": skills(ready_admin, vault_id)["skill-sola"]["note_id"], "accion": "archive"}]
    assert leave(ready_admin, vault_id, "aira", resolutions=partial).status_code == 409
    assert skills(ready_admin, vault_id)["skill-sola"]["estado"] == "borrador"  # no se tocó nada


def test_each_owned_skill_is_assigned_deleted_or_archived_and_the_agent_is_removed(ready_admin, team):
    vault_id, ids = team
    resolutions = [{"note_id": ids["compartida"], "accion": "assign", "a": "emma"},
                   {"note_id": ids["sola"], "accion": "archive"}]
    res = leave(ready_admin, vault_id, "aira", resolutions=resolutions)
    assert res.status_code == 200 and res.json() == {"asignadas": 1, "eliminadas": 0, "archivadas": 1, "invitaciones_quitadas": 1}
    listed = skills(ready_admin, vault_id)
    # Asignada a un invitado: él es el propietario y sale de `agentes`; el otro invitado se queda.
    assert (listed["skill-compartida"]["propietario"], listed["skill-compartida"]["agentes"]) == ("emma", ["otro"])
    # Archivada: en su carpeta, sin propietario ni invitados, inactiva.
    assert listed["skill-sola"]["estado"] == "archivado" and listed["skill-sola"]["propietario"] is None
    assert listed["skill-sola"]["agentes"] == []
    # Era invitada a la de emma: ya no figura.
    assert listed["skill-de-emma"]["agentes"] == []
    assert [a["agent_id"] for a in ready_admin.get(f"/vaults/{vault_id}/agent-access").json()["agents"]] == ["emma", "otro"]
    assert find(ready_admin, vault_id, f"{SK}/skill-sola.md") is not None  # no se borra sola


def test_delete_goes_to_the_trash_and_suspend_keeps_the_registration(ready_admin, team):
    vault_id, ids = team
    resolutions = [{"note_id": ids["compartida"], "accion": "delete"}, {"note_id": ids["sola"], "accion": "delete"}]
    res = leave(ready_admin, vault_id, "aira", "suspender", resolutions)
    assert res.status_code == 200 and res.json()["eliminadas"] == 2
    assert "skill-compartida" not in skills(ready_admin, vault_id)
    trash = ready_admin.get(f"/vaults/{vault_id}/notes", params={"deleted": "true"}).json()["items"]
    assert {i["path"] for i in trash} == {f"{SK}/skill-compartida.md", f"{SK}/skill-sola.md"}
    agents = {a["agent_id"]: a["estado"] for a in ready_admin.get(f"/vaults/{vault_id}/agent-access").json()["agents"]}
    assert agents["aira"] == "suspendido"


@pytest.mark.parametrize("resolution,pointer", [
    ({"accion": "archive"}, "#/skills/0/accion"),      # una con invitados no se archiva: se asigna o se elimina
    ({"accion": "assign", "a": "nadie"}, "#/skills/0/a"),  # solo a uno de sus invitados
    ({"accion": "assign"}, "#/skills/0/a"),
])
def test_resolutions_must_follow_the_options(ready_admin, team, resolution, pointer):
    vault_id, ids = team
    res = leave(ready_admin, vault_id, "aira", resolutions=[{"note_id": ids["compartida"], **resolution}])
    assert res.status_code == 422 and res.json()["errors"][0]["pointer"] == pointer


def test_a_skill_without_guests_cannot_be_assigned_and_unknown_or_repeated_skills_are_rejected(ready_admin, team):
    vault_id, ids = team
    res = leave(ready_admin, vault_id, "aira", resolutions=[{"note_id": ids["sola"], "accion": "assign", "a": "emma"}])
    assert res.status_code == 422 and res.json()["errors"][0]["pointer"] == "#/skills/0/accion"
    res = leave(ready_admin, vault_id, "aira", resolutions=[{"note_id": ids["de-emma"], "accion": "archive"}])  # no es suya
    assert res.status_code == 422 and res.json()["errors"][0]["detail"] == "leave:skill"
    twice = [{"note_id": ids["sola"], "accion": "archive"}, {"note_id": ids["sola"], "accion": "delete"}]
    assert leave(ready_admin, vault_id, "aira", resolutions=twice).status_code == 422


def test_an_agent_with_only_invitations_leaves_and_disappears_from_them(ready_admin, team):
    vault_id, _ = team
    res = leave(ready_admin, vault_id, "otro")
    assert res.status_code == 200 and res.json()["invitaciones_quitadas"] == 1
    assert skills(ready_admin, vault_id)["skill-compartida"]["agentes"] == ["emma"]
    assert leave(ready_admin, vault_id, "otro").status_code == 404  # ya no está registrado


def test_only_the_user_resolves_a_departure_not_an_agent_key(ready_admin, team):
    vault_id, ids = team
    aira = agent_client(ready_admin, "aira", label="op-aira-2")
    assert leave(aira, vault_id, "emma").status_code == 401
    assert aira.post(f"/vaults/{vault_id}/skills/{ids['sola']}/assign", json={"propietario": "emma"}).status_code == 401


# --- La invariante: una skill activa nunca queda sin propietario ---

def test_the_direct_registry_calls_refuse_while_the_agent_owns_active_skills(ready_admin, team):
    vault_id, ids = team
    res = ready_admin.delete(f"/vaults/{vault_id}/agent-access/aira")
    assert res.status_code == 409 and res.json()["type"].endswith("agent-owns-skills")
    assert ready_admin.put(f"/vaults/{vault_id}/agent-access/aira", json={"carpetas": ["*"], "estado": "suspendido"}).status_code == 409
    assert ready_admin.put(f"/vaults/{vault_id}/agent-access/aira", json={"carpetas": ["Otra"], "estado": "activo"}).status_code == 200  # cambiar carpetas sí
    # Editar la ficha a mano o borrarla tampoco salta la regla.
    ficha = find(ready_admin, vault_id, "AG - AGENTES/aira.md")
    res = patch(ready_admin, vault_id, ficha, frontmatter={**ficha["frontmatter"], "estado": "suspendido"})
    assert res.status_code == 409
    assert ready_admin.delete(f"/vaults/{vault_id}/notes/{ficha['id']}", headers={"If-Match": ficha["etag"]}).status_code == 409
    # Archivadas sus skills (no activas), ya puede salir.
    for name in ("compartida", "sola"):
        leave_ok = patch(ready_admin, vault_id, {"id": ids[name], "etag": find(ready_admin, vault_id, f"{SK}/skill-{name}.md")["etag"]},
                         frontmatter={"titulo": "x", "estado": "archivado"})
        assert leave_ok.status_code == 200
    assert ready_admin.delete(f"/vaults/{vault_id}/agent-access/aira").status_code == 204


def test_a_registry_edit_over_sync_is_rejected_while_the_agent_owns_skills(vault, ready_admin):
    vault_id = vault["id"]
    register(ready_admin, vault_id, "aira", ["*"])
    aira = agent_client(ready_admin, "aira")
    make(aira, vault_id, "uno")
    ficha = find(ready_admin, vault_id, "AG - AGENTES/aira.md")
    import httpx
    from app.core.config import settings
    from tests.test_sync_api import AUTH

    stored = httpx.get(f"{settings.COUCHDB_URL}/{vault['db']}/note:{vault_id}:{ficha['id']}", params={"revs": "true"}, auth=AUTH).json()
    res = push(ready_admin, [child_of(stored, frontmatter={**stored["frontmatter"], "estado": "suspendido"})])
    assert res.status_code == 201 and [r["reason"] for r in res.json()] == ["ag-agentes:owns-skills"]
    gone = push(ready_admin, [child_of(stored, deleted_at="2026-11-05T10:00:00.000000Z")])
    assert [r["reason"] for r in gone.json()] == ["ag-agentes:owns-skills"]


def test_an_agent_that_stops_being_a_manager_by_any_path_leaves_the_guest_lists(ready_admin, team):
    vault_id, ids = team
    # `emma` sale editando su ficha a mano (ya no posee: se archivó su skill) y desaparece de las invitaciones de aira.
    emma_skill = find(ready_admin, vault_id, f"{SK}/skill-de-emma.md")
    assert patch(ready_admin, vault_id, emma_skill, frontmatter={"titulo": "x", "estado": "archivado"}).status_code == 200
    ficha = find(ready_admin, vault_id, "AG - AGENTES/emma.md")
    assert patch(ready_admin, vault_id, ficha, frontmatter={**ficha["frontmatter"], "estado": "suspendido"}).status_code == 200
    assert skills(ready_admin, vault_id)["skill-compartida"]["agentes"] == ["otro"]


# --- Reasignar ---

def test_the_user_assigns_an_archived_skill_to_a_manager_and_it_comes_back_to_review(ready_admin, team):
    vault_id, ids = team
    leave(ready_admin, vault_id, "aira", resolutions=[
        {"note_id": ids["compartida"], "accion": "assign", "a": "emma"}, {"note_id": ids["sola"], "accion": "archive"}])
    res = ready_admin.post(f"/vaults/{vault_id}/skills/{ids['sola']}/assign", json={"propietario": "otro"})
    assert res.status_code == 200 and (res.json()["propietario"], res.json()["estado"]) == ("otro", sr.REACTIVATED)
    assert skills(ready_admin, vault_id)["skill-sola"]["agentes"] == []
    # Solo a un gestor activo; ni a quien salió ni a quien nunca estuvo.
    for who in ("aira", "nadie"):
        refused = ready_admin.post(f"/vaults/{vault_id}/skills/{ids['sola']}/assign", json={"propietario": who})
        assert refused.status_code == 422 and detail(refused) == "skill:propietario"
    assert ready_admin.post(f"/vaults/{vault_id}/skills/{ids['sola']}/assign", json={"propietario": "Mal Id"}).status_code == 422
    assert ready_admin.post(f"/vaults/{vault_id}/skills/00000000-0000-4000-8000-000000000000/assign", json={"propietario": "otro"}).status_code == 404


def test_assigning_an_active_skill_to_one_of_its_guests_removes_him_from_the_guests(ready_admin, team):
    vault_id, ids = team
    res = ready_admin.post(f"/vaults/{vault_id}/skills/{ids['compartida']}/assign", json={"propietario": "emma"})
    assert res.status_code == 200 and (res.json()["propietario"], res.json()["agentes"], res.json()["estado"]) == ("emma", ["otro"], "borrador")


def test_system_docs_and_non_skills_cannot_be_assigned(ready_admin, team):
    vault_id, _ = team
    system = find(ready_admin, vault_id, f"{SK}/skill-bovedas-synapse.md")
    index = find(ready_admin, vault_id, f"{SK}/INDICE.md")
    for item in (system, index):
        if item is not None:
            assert ready_admin.post(f"/vaults/{vault_id}/skills/{item['id']}/assign", json={"propietario": "emma"}).status_code == 404


def test_departures_are_logged_in_the_bitacora_under_the_user(ready_admin, team, db):
    from app.core.models.change_log import ChangeLog

    vault_id, ids = team
    leave(ready_admin, vault_id, "aira", resolutions=[
        {"note_id": ids["compartida"], "accion": "delete"}, {"note_id": ids["sola"], "accion": "archive"}])
    db.expire_all()
    rows = db.query(ChangeLog).filter(ChangeLog.vault_id == vault_id).order_by(ChangeLog.at).all()
    paths = [(r.op, r.path) for r in rows if r.path.startswith(SK) and r.author_kind == "human"]
    assert ("delete", f"{SK}/skill-compartida.md") in paths and ("edit", f"{SK}/skill-sola.md") in paths
