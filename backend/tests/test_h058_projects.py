"""H-058: proyectos de bóveda — agrupan tareas (una raíz en 0 o 1 proyecto; sus subtareas lo heredan)."""
import pytest

from app.core.config import settings
from app.services import agent_access_guard
from tests.test_h030_api import agent_client, register, vault_of
from tests.test_h053_tasks import get, make, patch, sub


@pytest.fixture(autouse=True)
def _fresh_registry_cache():
    agent_access_guard._CACHE.clear()
    yield
    agent_access_guard._CACHE.clear()


def project(client, vault_id, **body):
    body.setdefault("title", "Proyecto")
    res = client.post(f"/vaults/{vault_id}/projects", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def pointer(res) -> str:
    assert res.status_code == 422, res.text
    return res.json()["errors"][0]["pointer"]


def test_crud_with_etag_and_defaults(ready_admin):
    vault = vault_of(ready_admin)
    created = ready_admin.post(f"/vaults/{vault}/projects", json={"title": "Lanzamiento", "description": "Q4"})
    assert created.status_code == 201 and created.headers["ETag"] == '"1"'
    body = created.json()
    assert body["status"] == "active" and body["color"] == "blue" and body["assignee_type"] == "user"
    assert body["tasks_total"] == 0 and body["tasks_done"] == 0 and body["created_by"] == "user"
    assert ready_admin.get(f"/vaults/{vault}/projects/{body['id']}").json()["title"] == "Lanzamiento"
    updated = ready_admin.patch(
        f"/vaults/{vault}/projects/{body['id']}", json={"status": "on_hold", "color": "red", "description": None},
        headers={"If-Match": '"1"'})
    assert updated.status_code == 200 and updated.json()["status"] == "on_hold" and updated.json()["color"] == "red"
    assert updated.json()["description"] is None and updated.headers["ETag"] == '"2"'
    stale = ready_admin.patch(f"/vaults/{vault}/projects/{body['id']}", json={"title": "x"}, headers={"If-Match": '"1"'})
    assert stale.status_code == 412
    assert ready_admin.patch(f"/vaults/{vault}/projects/{body['id']}", json={"color": "morado"}).status_code == 422
    assert ready_admin.patch(f"/vaults/{vault}/projects/{body['id']}", json={"title": None}).status_code == 422
    assert ready_admin.delete(f"/vaults/{vault}/projects/{body['id']}").status_code == 204
    assert ready_admin.get(f"/vaults/{vault}/projects/{body['id']}").status_code == 404


def test_a_project_belongs_to_its_vault_and_lists_across_vaults(ready_admin):
    one, two = vault_of(ready_admin, "Uno"), vault_of(ready_admin, "Dos")
    first, other = project(ready_admin, one, title="A"), project(ready_admin, two, title="B")
    assert ready_admin.get(f"/vaults/{two}/projects/{first['id']}").status_code == 404
    assert [p["title"] for p in ready_admin.get(f"/vaults/{one}/projects").json()["items"]] == ["A"]
    assert sorted(p["title"] for p in ready_admin.get("/projects").json()["items"]) == ["A", "B"]
    assert [p["id"] for p in ready_admin.get(f"/vaults/{two}/projects?status=completed").json()["items"]] == []
    assert other["vault_id"] == two


def test_tasks_join_a_project_and_subtasks_inherit_it(ready_admin):
    vault = vault_of(ready_admin)
    proj = project(ready_admin, vault, title="Plan")
    root = make(ready_admin, vault, title="Raíz", project_id=proj["id"])
    assert root["project_id"] == proj["id"]
    child = sub(ready_admin, vault, root["id"], title="Hija")
    assert child["project_id"] == proj["id"]  # hereda
    assert pointer(ready_admin.post(f"/vaults/{vault}/tasks/{root['id']}/subtasks", json={"title": "X", "project_id": "otro"})) == "/project_id"
    assert pointer(patch(ready_admin, vault, child["id"], project_id="otro")) == "/project_id"
    assert patch(ready_admin, vault, child["id"], project_id=None).status_code == 200  # no hace nada: sigue el de su raíz
    assert get(ready_admin, vault, child["id"])["project_id"] == proj["id"]


def test_moving_a_root_between_projects_moves_its_subtasks(ready_admin):
    vault = vault_of(ready_admin)
    a, b = project(ready_admin, vault, title="A"), project(ready_admin, vault, title="B")
    root = make(ready_admin, vault, title="Raíz", project_id=a["id"])
    child = sub(ready_admin, vault, root["id"])
    assert patch(ready_admin, vault, root["id"], project_id=b["id"]).json()["project_id"] == b["id"]
    assert get(ready_admin, vault, child["id"])["project_id"] == b["id"]
    assert patch(ready_admin, vault, root["id"], project_id=None).json()["project_id"] is None
    assert get(ready_admin, vault, child["id"])["project_id"] is None


def test_a_task_cannot_join_a_project_of_another_vault_or_a_missing_one(ready_admin):
    one, two = vault_of(ready_admin, "Uno"), vault_of(ready_admin, "Dos")
    foreign = project(ready_admin, two)
    task = make(ready_admin, one)
    assert pointer(patch(ready_admin, one, task["id"], project_id=foreign["id"])) == "/project_id"
    assert pointer(ready_admin.post(f"/vaults/{one}/tasks", json={"title": "N", "project_id": foreign["id"]})) == "/project_id"
    assert pointer(patch(ready_admin, one, task["id"], project_id="no-existe")) == "/project_id"


def test_deleting_a_project_leaves_its_tasks_without_project(ready_admin):
    vault = vault_of(ready_admin)
    proj = project(ready_admin, vault)
    root = make(ready_admin, vault, title="Raíz", project_id=proj["id"])
    child = sub(ready_admin, vault, root["id"])
    assert ready_admin.delete(f"/vaults/{vault}/projects/{proj['id']}").status_code == 204
    assert get(ready_admin, vault, root["id"])["project_id"] is None
    assert get(ready_admin, vault, child["id"])["project_id"] is None


def test_progress_counts_root_tasks_and_the_listing_filters_by_project(ready_admin):
    vault = vault_of(ready_admin)
    proj = project(ready_admin, vault)
    done = make(ready_admin, vault, title="Hecha", project_id=proj["id"], status="done")
    open_task = make(ready_admin, vault, title="Abierta", project_id=proj["id"])
    loose = make(ready_admin, vault, title="Suelta")
    sub(ready_admin, vault, open_task["id"], title="no cuenta")
    assert done["status"] == "done"
    counts = ready_admin.get(f"/vaults/{vault}/projects/{proj['id']}").json()
    assert (counts["tasks_total"], counts["tasks_done"]) == (2, 1)
    by_project = ready_admin.get(f"/vaults/{vault}/tasks?project_id={proj['id']}").json()["items"]
    assert sorted(t["title"] for t in by_project) == ["Abierta", "Hecha", "no cuenta"]
    assert [t["id"] for t in ready_admin.get(f"/vaults/{vault}/tasks?project_id=none").json()["items"]] == [loose["id"]]


def test_the_responsible_agent_must_be_registered_and_active(ready_admin):
    vault = vault_of(ready_admin)
    agent_client(ready_admin, "aira")
    res = ready_admin.post(f"/vaults/{vault}/projects", json={"title": "P", "assignee_type": "agent", "assignee_agent_id": "aira"})
    assert pointer(res) == "/assignee_agent_id"
    register(ready_admin, vault, "aira", ["*"])
    ok = ready_admin.post(f"/vaults/{vault}/projects", json={"title": "P", "assignee_type": "agent", "assignee_agent_id": "aira"})
    assert ok.status_code == 201 and ok.json()["assignee_agent_id"] == "aira"
    assert pointer(ready_admin.post(f"/vaults/{vault}/projects", json={"title": "P", "assignee_type": "agent"})) == "/assignee_agent_id"


def test_agent_permissions_on_projects_follow_the_task_rules(ready_admin, monkeypatch):
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    vault = vault_of(ready_admin)
    aira, liza = agent_client(ready_admin, "aira"), agent_client(ready_admin, "liza")
    register(ready_admin, vault, "aira", ["*"])
    register(ready_admin, vault, "liza", ["*"])
    mine = aira.post(f"/vaults/{vault}/projects", json={"title": "De aira"})
    assert mine.status_code == 201 and mine.json()["created_by"] == "agent:aira"
    pid = mine.json()["id"]
    assert liza.get(f"/vaults/{vault}/projects").status_code == 200  # todos leen
    assert liza.patch(f"/vaults/{vault}/projects/{pid}", json={"title": "x"}).status_code == 403
    assert liza.delete(f"/vaults/{vault}/projects/{pid}").status_code == 403
    assert aira.patch(f"/vaults/{vault}/projects/{pid}", json={"title": "renombrado", "color": "green"}).status_code == 200
    assert aira.delete(f"/vaults/{vault}/projects/{pid}").status_code == 204
    ghost = agent_client(ready_admin, "ghost")  # con clave pero sin registro
    assert ghost.post(f"/vaults/{vault}/projects", json={"title": "n"}).status_code == 403
