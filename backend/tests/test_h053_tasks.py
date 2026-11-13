"""H-053 de punta a punta: tareas de bóveda en dos niveles — TestClient + CouchDB real + BD de control de pruebas.

Cubre los dos niveles, el estado derivado de la raíz, la ruta indicativa, la asignación a agentes, `If-Match`,
el aislamiento entre usuarios, los permisos por agente con cumplimiento activo y la retención de tareas cerradas.
"""
from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import settings
from app.core.models.task import VaultTask
from app.services import agent_access_guard
from app.services.task_jobs import purge_closed_tasks
from tests.conftest import TestingSessionLocal
from tests.test_agent_api_key_access import _guest
from tests.test_h030_api import agent_client, register, vault_of


@pytest.fixture(autouse=True)
def _fresh_registry_cache():
    agent_access_guard._CACHE.clear()
    yield
    agent_access_guard._CACHE.clear()


def make(client, vault_id, **body):
    body.setdefault("title", "Tarea")
    res = client.post(f"/vaults/{vault_id}/tasks", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def sub(client, vault_id, parent_id, **body):
    body.setdefault("title", "Subtarea")
    res = client.post(f"/vaults/{vault_id}/tasks/{parent_id}/subtasks", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def patch(client, vault_id, task_id, headers=None, **body):
    return client.patch(f"/vaults/{vault_id}/tasks/{task_id}", json=body, headers=headers or {})


def get(client, vault_id, task_id):
    res = client.get(f"/vaults/{vault_id}/tasks/{task_id}")
    assert res.status_code == 200, res.text
    return res.json()


# --- Dos niveles y estado derivado ---

def test_root_and_subtasks_two_levels_only(ready_admin):
    vault = vault_of(ready_admin)
    root = make(ready_admin, vault, title="Raíz")
    child = sub(ready_admin, vault, root["id"])
    assert child["parent_id"] == root["id"] and child["vault_id"] == vault
    res = ready_admin.post(f"/vaults/{vault}/tasks/{child['id']}/subtasks", json={"title": "Nieta"})
    assert res.status_code == 422
    assert res.json()["errors"][0]["pointer"] == "/parent_id"
    # Ni por `parent_id` directo.
    assert ready_admin.post(f"/vaults/{vault}/tasks", json={"title": "x", "parent_id": child["id"]}).status_code == 422


def test_parent_status_is_derived_from_subtasks(ready_admin):
    vault = vault_of(ready_admin)
    root = make(ready_admin, vault)
    a, b = sub(ready_admin, vault, root["id"]), sub(ready_admin, vault, root["id"])
    assert get(ready_admin, vault, root["id"])["status"] == "pending"
    patch(ready_admin, vault, a["id"], status="in_progress")
    assert get(ready_admin, vault, root["id"])["status"] == "in_progress"
    patch(ready_admin, vault, a["id"], status="done")
    patch(ready_admin, vault, b["id"], status="cancelled")
    closed = get(ready_admin, vault, root["id"])
    assert closed["status"] == "done" and closed["purge_at"] is not None
    # Reabrir una subtarea reabre la raíz y borra su cierre.
    patch(ready_admin, vault, b["id"], status="pending")
    reopened = get(ready_admin, vault, root["id"])
    assert reopened["status"] == "in_progress" and reopened["purge_at"] is None


def test_all_cancelled_subtasks_cancel_the_parent(ready_admin):
    vault = vault_of(ready_admin)
    root = make(ready_admin, vault)
    a = sub(ready_admin, vault, root["id"])
    patch(ready_admin, vault, a["id"], status="cancelled")
    assert get(ready_admin, vault, root["id"])["status"] == "cancelled"


def test_parent_with_subtasks_rejects_a_direct_status_change(ready_admin):
    vault = vault_of(ready_admin)
    root = make(ready_admin, vault)
    sub(ready_admin, vault, root["id"])
    res = patch(ready_admin, vault, root["id"], status="done")
    assert res.status_code == 422 and res.json()["errors"][0]["pointer"] == "/status"
    assert patch(ready_admin, vault, root["id"], status="pending").status_code == 200  # igual al derivado: sin cambio
    assert patch(ready_admin, vault, root["id"], title="Otro título").status_code == 200


def test_deleting_a_root_deletes_its_subtasks_and_deleting_a_subtask_refreshes_the_parent(ready_admin, db):
    vault = vault_of(ready_admin)
    root = make(ready_admin, vault)
    a, b = sub(ready_admin, vault, root["id"]), sub(ready_admin, vault, root["id"])
    patch(ready_admin, vault, a["id"], status="done")
    assert ready_admin.delete(f"/vaults/{vault}/tasks/{b['id']}").status_code == 204
    assert get(ready_admin, vault, root["id"])["status"] == "done"  # solo queda la hecha
    assert ready_admin.delete(f"/vaults/{vault}/tasks/{root['id']}").status_code == 204
    assert db.query(VaultTask).count() == 0
    assert ready_admin.get(f"/vaults/{vault}/tasks/{a['id']}").status_code == 404


# --- Campos: ruta indicativa, fechas, validación ---

def test_path_is_only_indicative_and_normalized(ready_admin):
    vault = vault_of(ready_admin)
    task = make(ready_admin, vault, path="/Proyectos/Synapse/no-existe.md/")
    assert task["path"] == "Proyectos/Synapse/no-existe.md"  # no se comprueba que exista
    assert patch(ready_admin, vault, task["id"], path=None).json()["path"] is None
    for bad in ["a/../b", "a//b", "..", "a\\b"]:
        res = ready_admin.post(f"/vaults/{vault}/tasks", json={"title": "x", "path": bad})
        assert res.status_code == 422 and res.json()["errors"][0]["pointer"] == "/path", bad


def test_due_at_is_stored_utc_and_returned_with_z(ready_admin):
    vault = vault_of(ready_admin)
    task = make(ready_admin, vault, due_at="2026-11-20T09:00:00-06:00")
    assert task["due_at"] == "2026-11-20T15:00:00Z"
    assert task["created_at"].endswith("Z")
    assert patch(ready_admin, vault, task["id"], due_at=None).json()["due_at"] is None


@pytest.mark.parametrize("body", [{"title": ""}, {"title": "x", "status": "failed"}, {"title": "x", "priority": "urgent"}, {"title": "x", "otro": 1}])
def test_invalid_bodies_are_422(ready_admin, body):
    vault = vault_of(ready_admin)
    assert ready_admin.post(f"/vaults/{vault}/tasks", json=body).status_code == 422


# --- Asignación ---

def test_assigning_to_an_agent_requires_it_registered_and_active(ready_admin):
    vault = vault_of(ready_admin)
    agent_client(ready_admin, "aira")
    res = ready_admin.post(f"/vaults/{vault}/tasks", json={"title": "x", "assignee_type": "agent", "assignee_agent_id": "aira"})
    assert res.status_code == 422 and res.json()["errors"][0]["pointer"] == "/assignee_agent_id"
    assert ready_admin.post(f"/vaults/{vault}/tasks", json={"title": "x", "assignee_type": "agent"}).status_code == 422
    register(ready_admin, vault, "aira", ["*"])
    task = make(ready_admin, vault, assignee_type="agent", assignee_agent_id="aira")
    assert task["assignee_type"] == "agent" and task["assignee_agent_id"] == "aira"
    # Volver a la persona limpia el agente.
    back = patch(ready_admin, vault, task["id"], assignee_type="user").json()
    assert back["assignee_type"] == "user" and back["assignee_agent_id"] is None
    register(ready_admin, vault, "aira", ["*"], estado="suspendido")
    agent_access_guard._CACHE.clear()
    assert patch(ready_admin, vault, task["id"], assignee_type="agent", assignee_agent_id="aira").status_code == 422


# --- If-Match y ETag ---

def test_etag_is_the_version_and_if_match_guards_concurrent_changes(ready_admin):
    vault = vault_of(ready_admin)
    created = ready_admin.post(f"/vaults/{vault}/tasks", json={"title": "x"})
    assert created.headers["etag"] == '"1"' and created.json()["version"] == 1
    task_id = created.json()["id"]
    ok = patch(ready_admin, vault, task_id, headers={"If-Match": '"1"'}, title="y")
    assert ok.status_code == 200 and ok.headers["etag"] == '"2"'
    stale = patch(ready_admin, vault, task_id, headers={"If-Match": '"1"'}, title="z")
    assert stale.status_code == 412 and stale.json()["type"].endswith("task-precondition-failed")
    assert patch(ready_admin, vault, task_id, headers={"If-Match": "basura"}, title="z").status_code == 412
    assert patch(ready_admin, vault, task_id, title="sin precondición").status_code == 200


# --- Listados y filtros ---

def test_listings_filter_by_status_assignee_and_span_vaults(ready_admin):
    v1, v2 = vault_of(ready_admin, "Uno"), vault_of(ready_admin, "Dos")
    agent_client(ready_admin, "aira")
    register(ready_admin, v1, "aira", ["*"])
    mine = make(ready_admin, v1, title="Mía")
    theirs = make(ready_admin, v1, title="De aira", assignee_type="agent", assignee_agent_id="aira")
    other = make(ready_admin, v2, title="Otra bóveda")
    patch(ready_admin, v1, mine["id"], status="done")
    ids = lambda res: {t["id"] for t in res.json()["items"]}  # noqa: E731
    assert ids(ready_admin.get(f"/vaults/{v1}/tasks")) == {mine["id"], theirs["id"]}
    assert ids(ready_admin.get(f"/vaults/{v1}/tasks", params={"status": "done"})) == {mine["id"]}
    assert ids(ready_admin.get(f"/vaults/{v1}/tasks", params={"assignee": "aira"})) == {theirs["id"]}
    assert ids(ready_admin.get("/tasks", params={"assignee": "user"})) == {mine["id"], other["id"]}
    assert ready_admin.get("/tasks").json()["total"] == 3
    soon = ready_admin.get("/tasks", params={"due_before": "2030-01-01T00:00:00Z"})
    assert soon.json()["items"] == []


# --- Aislamiento ---

def test_other_users_see_and_touch_nothing(ready_admin, db):
    vault = vault_of(ready_admin)
    task = make(ready_admin, vault)
    guest = _guest(ready_admin, db)
    assert guest.get(f"/vaults/{vault}/tasks").status_code == 404
    assert guest.get(f"/vaults/{vault}/tasks/{task['id']}").status_code == 404
    assert guest.post(f"/vaults/{vault}/tasks", json={"title": "x"}).status_code == 404
    assert guest.get("/tasks").json()["items"] == []
    # Con una bóveda propia, el id de la tarea ajena tampoco resuelve.
    mine = vault_of(guest, "Mía")
    assert guest.get(f"/vaults/{mine}/tasks/{task['id']}").status_code == 404
    assert guest.delete(f"/vaults/{mine}/tasks/{task['id']}").status_code == 404
    assert get(ready_admin, vault, task["id"])["title"] == "Tarea"


def test_a_task_is_not_reachable_through_another_vault_of_the_same_owner(ready_admin):
    v1, v2 = vault_of(ready_admin, "Uno"), vault_of(ready_admin, "Dos")
    task = make(ready_admin, v1)
    assert ready_admin.get(f"/vaults/{v2}/tasks/{task['id']}").status_code == 404


def test_unauthenticated_is_401(ready_admin):
    from fastapi.testclient import TestClient

    from app.main import app
    anon = TestClient(app, base_url=str(ready_admin.base_url))
    assert anon.get("/tasks").status_code == 401


# --- Permisos de los agentes (cumplimiento activo) ---

@pytest.fixture
def enforce(monkeypatch):
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")


def test_agent_permissions_under_enforce(ready_admin, enforce):
    vault = vault_of(ready_admin)
    aira, liza = agent_client(ready_admin, "aira"), agent_client(ready_admin, "liza")
    register(ready_admin, vault, "aira", ["*"])
    register(ready_admin, vault, "liza", ["*"])
    assigned = make(ready_admin, vault, title="Para aira", assignee_type="agent", assignee_agent_id="aira")

    # El asignado cambia estado y notas, pero ni el título ni la asignación, y no la borra.
    assert patch(aira, vault, assigned["id"], status="in_progress", notes="voy").status_code == 200
    assert patch(aira, vault, assigned["id"], title="otro").status_code == 403
    assert patch(aira, vault, assigned["id"], assignee_type="user").status_code == 403
    assert aira.delete(f"/vaults/{vault}/tasks/{assigned['id']}").status_code == 403
    # Quien no es ni autor ni asignado no cambia nada.
    assert patch(liza, vault, assigned["id"], status="done").status_code == 403
    # Cualquier agente registrado crea tareas y subtareas; el autor las gobierna.
    own = liza.post(f"/vaults/{vault}/tasks", json={"title": "de liza", "assignee_type": "agent", "assignee_agent_id": "aira"})
    assert own.status_code == 201 and own.json()["created_by"] == "agent:liza"
    assert patch(liza, vault, own.json()["id"], title="renombrada", assignee_type="user").status_code == 200
    assert liza.delete(f"/vaults/{vault}/tasks/{own.json()['id']}").status_code == 204
    child = aira.post(f"/vaults/{vault}/tasks/{assigned['id']}/subtasks", json={"title": "paso"})
    assert child.status_code == 201
    # Todos leen todo.
    assert liza.get(f"/vaults/{vault}/tasks").status_code == 200
    assert liza.get(f"/vaults/{vault}/tasks/{assigned['id']}").status_code == 200


def test_unregistered_suspended_and_general_keys_only_read_under_enforce(ready_admin, enforce):
    vault = vault_of(ready_admin)
    task = make(ready_admin, vault)
    ghost = agent_client(ready_admin, "ghost")  # con clave pero sin registro
    sleeper = agent_client(ready_admin, "sleeper")
    register(ready_admin, vault, "sleeper", ["*"], estado="suspendido")
    general = ready_admin.post("/auth/agent-keys", json={"label": "general"}).json()["key"]
    from tests.test_agent_api_key_access import _bearer_client
    general_client = _bearer_client(ready_admin, general)
    for who in (ghost, sleeper, general_client):
        assert who.get(f"/vaults/{vault}/tasks").status_code == 200
        assert who.post(f"/vaults/{vault}/tasks", json={"title": "x"}).status_code == 403
        assert patch(who, vault, task["id"], status="done").status_code == 403
        assert who.delete(f"/vaults/{vault}/tasks/{task['id']}").status_code == 403


def test_an_admin_agent_has_no_restrictions(ready_admin, enforce):
    vault = vault_of(ready_admin)
    boss = agent_client(ready_admin, "boss", admin_flag=True)
    task = make(ready_admin, vault)
    assert patch(boss, vault, task["id"], title="cambiada").status_code == 200
    assert boss.delete(f"/vaults/{vault}/tasks/{task['id']}").status_code == 204


def test_shadow_mode_only_logs_agent_writes(ready_admin):
    from app.core.models.agent_access_log import AgentAccessLog
    vault = vault_of(ready_admin)
    ghost = agent_client(ready_admin, "ghost")
    assert ghost.post(f"/vaults/{vault}/tasks", json={"title": "x"}).status_code == 201
    with TestingSessionLocal() as session:
        log = session.query(AgentAccessLog).filter(AgentAccessLog.op == "task-create").one()
    assert (log.agent_id, log.decision, log.mode) == ("ghost", "deny", "shadow")


# --- Retención ---

def _closed_root(db, owner_id, closed_days_ago, with_child=True):
    now = datetime.now(UTC).replace(tzinfo=None)
    closed = now - timedelta(days=closed_days_ago)
    base = dict(owner_id=owner_id, vault_id="v", created_by="user", updated_by="user", version=1, created_at=closed, updated_at=closed)
    root = VaultTask(id=f"root-{closed_days_ago}", title="r", status="done", completed_at=closed, **base)
    db.add(root)
    if with_child:
        db.add(VaultTask(id=f"child-{closed_days_ago}", parent_id=root.id, title="c", status="done", completed_at=closed, **base))
    db.commit()


def test_retention_deletes_roots_closed_more_than_30_days_ago_with_their_subtasks(ready_admin, db):
    from app.core.models.user import User
    owner = db.query(User).first().id
    _closed_root(db, owner, 29)
    _closed_root(db, owner, 31)
    assert purge_closed_tasks(TestingSessionLocal) == 1
    left = {t.id for t in db.query(VaultTask).all()}
    assert left == {"root-29", "child-29"}


def test_retention_ignores_open_roots_and_never_deletes_a_subtask_alone(ready_admin, db):
    from app.core.models.user import User
    owner = db.query(User).first().id
    old = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=90)
    base = dict(owner_id=owner, vault_id="v", created_by="user", updated_by="user", version=1, created_at=old, updated_at=old)
    db.add(VaultTask(id="open", title="abierta", status="in_progress", **base))
    db.add(VaultTask(id="parent", title="p", status="in_progress", **base))
    db.add(VaultTask(id="old-child", parent_id="parent", title="c", status="done", completed_at=old, **base))
    db.commit()
    assert purge_closed_tasks(TestingSessionLocal) == 0
    assert db.query(VaultTask).count() == 3


def test_reopening_a_task_restarts_its_retention_clock(ready_admin, db):
    vault = vault_of(ready_admin)
    task = make(ready_admin, vault)
    patch(ready_admin, vault, task["id"], status="done")
    row = db.query(VaultTask).filter(VaultTask.id == task["id"]).one()
    row.completed_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=40)
    db.commit()
    reopened = patch(ready_admin, vault, task["id"], status="pending").json()
    assert reopened["purge_at"] is None
    assert purge_closed_tasks(TestingSessionLocal) == 0


# --- Recordatorios de vencimiento por tarea ---

def test_reminders_default_to_null_and_round_trip_sorted_without_repeats(ready_admin):
    vault = vault_of(ready_admin)
    plain = make(ready_admin, vault, title="Sin lista")
    assert plain["reminders"] is None  # null = los de siempre (1 día y 1 hora)
    task = make(ready_admin, vault, title="Con lista", due_at="2026-11-20T15:00:00Z", reminders=[30, 1440, 30, 10080])
    assert task["reminders"] == [10080, 1440, 30]  # del más lejano al más cercano, sin repetidos
    assert get(ready_admin, vault, task["id"])["reminders"] == [10080, 1440, 30]


def test_reminders_can_be_changed_emptied_and_reset(ready_admin):
    vault = vault_of(ready_admin)
    task = make(ready_admin, vault, due_at="2026-11-20T15:00:00Z", reminders=[60])
    assert patch(ready_admin, vault, task["id"], reminders=[15, 5]).json()["reminders"] == [15, 5]
    assert patch(ready_admin, vault, task["id"], reminders=[]).json()["reminders"] == []  # ninguno
    assert patch(ready_admin, vault, task["id"], reminders=None).json()["reminders"] is None  # los de siempre
    assert patch(ready_admin, vault, task["id"], title="Otro").json()["reminders"] is None  # no enviarlo no lo toca


@pytest.mark.parametrize("bad", [[0], [-5], [40321], [1, 2, 3, 4, 5, 6], ["x"], 30])
def test_invalid_reminders_are_rejected(ready_admin, bad):
    vault = vault_of(ready_admin)
    res = ready_admin.post(f"/vaults/{vault}/tasks", json={"title": "X", "reminders": bad})
    assert res.status_code == 422, res.text


def test_limits_of_reminders_are_accepted(ready_admin):
    vault = vault_of(ready_admin)
    assert make(ready_admin, vault, reminders=[1, 40320])["reminders"] == [40320, 1]
    assert make(ready_admin, vault, reminders=[1, 2, 3, 4, 5])["reminders"] == [5, 4, 3, 2, 1]


def test_an_agent_assignee_cannot_change_reminders_of_a_task_it_did_not_create(ready_admin, enforce):
    vault = vault_of(ready_admin)
    aira = agent_client(ready_admin, "aira")
    register(ready_admin, vault, "aira", ["*"])
    mine = make(ready_admin, vault, title="De aira", assignee_type="agent", assignee_agent_id="aira")
    assert patch(aira, vault, mine["id"], reminders=[10]).status_code == 403  # solo estado y notas
    assert patch(aira, vault, mine["id"], status="in_progress").status_code == 200
    created = aira.post(f"/vaults/{vault}/tasks", json={"title": "Suya", "reminders": [10]})
    assert created.status_code == 201 and created.json()["reminders"] == [10]  # lo que crea, lo edita
