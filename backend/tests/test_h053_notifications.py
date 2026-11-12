"""H-053: avisos para la persona — bandeja, preferencias, eventos de tareas y vencimientos."""
from datetime import datetime, timedelta

import pytest

from app.core.models.notification import Notification
from app.services import agent_access_guard
from app.services.task_jobs import notify_due_tasks
from tests.conftest import TestingSessionLocal
from tests.test_agent_api_key_access import _guest
from tests.test_h030_api import agent_client, register, vault_of
from tests.test_h053_tasks import make, patch, sub


@pytest.fixture(autouse=True)
def _fresh_registry_cache():
    agent_access_guard._CACHE.clear()
    yield
    agent_access_guard._CACHE.clear()


def inbox(client, **params):
    res = client.get("/notifications", params=params)
    assert res.status_code == 200, res.text
    return res.json()


def setup_agent(admin):
    vault = vault_of(admin)
    aira = agent_client(admin, "aira")
    register(admin, vault, "aira", ["*"])
    return vault, aira


# --- Eventos de tareas ---

def test_an_agent_assigning_a_task_to_the_person_creates_one_notice(ready_admin):
    vault, aira = setup_agent(ready_admin)
    task = aira.post(f"/vaults/{vault}/tasks", json={"title": "Revisar el plan"}).json()
    got = inbox(ready_admin)
    assert got["unread"] == 1 and len(got["items"]) == 1
    notice = got["items"][0]
    assert notice["kind"] == "task_assigned" and notice["title"] == "aira te asignó una tarea" and notice["body"] == "Revisar el plan"
    assert notice["url"] == f"/vaults/{vault}?tab=tareas&task={task['id']}" and notice["vault_id"] == vault
    assert notice["resource_type"] == "task" and notice["resource_id"] == task["id"] and notice["created_at"].endswith("Z")
    assert ready_admin.get("/notifications/unread-count").json() == {"count": 1}


def test_reassigning_to_the_person_and_agent_subtasks_also_notify(ready_admin):
    vault, aira = setup_agent(ready_admin)
    root = aira.post(f"/vaults/{vault}/tasks", json={"title": "Para aira", "assignee_type": "agent", "assignee_agent_id": "aira"}).json()
    assert inbox(ready_admin)["unread"] == 0  # asignada a un agente: no es para la persona
    aira.post(f"/vaults/{vault}/tasks/{root['id']}/subtasks", json={"title": "Paso para ti"})
    assert inbox(ready_admin)["unread"] == 1
    assert patch(aira, vault, root["id"], assignee_type="user").status_code == 200
    assert inbox(ready_admin)["unread"] == 2


def test_the_person_is_never_notified_of_their_own_actions(ready_admin):
    vault, _ = setup_agent(ready_admin)
    task = make(ready_admin, vault, title="Mía")
    patch(ready_admin, vault, task["id"], status="done")
    sub(ready_admin, vault, task["id"])
    assert inbox(ready_admin)["items"] == []


def test_an_agent_changing_the_status_of_a_task_the_person_created_notifies(ready_admin):
    vault, aira = setup_agent(ready_admin)
    mine = make(ready_admin, vault, title="Informe", assignee_type="agent", assignee_agent_id="aira")
    assert patch(aira, vault, mine["id"], status="done").status_code == 200
    notice = inbox(ready_admin)["items"][0]
    assert notice["kind"] == "task_status" and notice["title"] == "aira marcó «Informe» como Hecha"
    # Un cambio que no es de estado no avisa; una tarea creada por un agente tampoco.
    patch(aira, vault, mine["id"], notes="nota")
    theirs = aira.post(f"/vaults/{vault}/tasks", json={"title": "Del agente", "assignee_type": "agent", "assignee_agent_id": "aira"}).json()
    patch(aira, vault, theirs["id"], status="in_progress")
    assert inbox(ready_admin)["unread"] == 1


# --- Bandeja y preferencias ---

def test_read_one_read_all_and_unread_filter(ready_admin):
    vault, aira = setup_agent(ready_admin)
    for title in ("a", "b", "c"):
        aira.post(f"/vaults/{vault}/tasks", json={"title": title})
    first = inbox(ready_admin)["items"][0]
    assert ready_admin.post(f"/notifications/{first['id']}/read").json()["read_at"] is not None
    assert inbox(ready_admin)["unread"] == 2 and len(inbox(ready_admin, unread=True)["items"]) == 2
    assert ready_admin.post("/notifications/read-all").json() == {"count": 0}
    assert inbox(ready_admin)["unread"] == 0 and len(inbox(ready_admin)["items"]) == 3
    assert ready_admin.post("/notifications/no-existe/read").status_code == 404


def test_a_disabled_kind_stops_generating_notices(ready_admin):
    vault, aira = setup_agent(ready_admin)
    assert ready_admin.get("/notifications/preferences").json()["kinds"] == {"task_assigned": True, "task_status": True, "task_due": True}
    res = ready_admin.put("/notifications/preferences", json={"kinds": {"task_assigned": False}})
    assert res.json()["kinds"] == {"task_assigned": False, "task_status": True, "task_due": True}
    aira.post(f"/vaults/{vault}/tasks", json={"title": "x"})
    assert inbox(ready_admin)["items"] == []
    ready_admin.put("/notifications/preferences", json={"kinds": {"task_assigned": True}})
    aira.post(f"/vaults/{vault}/tasks", json={"title": "y"})
    assert inbox(ready_admin)["unread"] == 1
    assert ready_admin.put("/notifications/preferences", json={"kinds": {"otro": True}}).status_code == 422


def test_notices_are_private_to_their_owner_and_closed_to_agent_keys(ready_admin, db):
    vault, aira = setup_agent(ready_admin)
    aira.post(f"/vaults/{vault}/tasks", json={"title": "x"})
    notice = inbox(ready_admin)["items"][0]
    guest = _guest(ready_admin, db)
    assert inbox(guest)["items"] == [] and guest.post(f"/notifications/{notice['id']}/read").status_code == 404
    assert aira.get("/notifications").status_code == 401
    assert aira.post("/notifications/read-all").status_code == 401
    assert inbox(ready_admin)["unread"] == 1


# --- Vencimientos ---

DUE = "2026-11-20T15:00:00Z"
DUE_AT = datetime(2026, 11, 20, 15, 0)


def due_notices(client):
    return [n for n in inbox(client)["items"] if n["kind"] == "task_due"]


def test_due_windows_notify_once_each_and_never_retroactively(ready_admin):
    vault = vault_of(ready_admin)
    task = make(ready_admin, vault, title="Entrega", due_at=DUE)
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(hours=30)) == 0  # aún falta más de 24 h
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(hours=20)) == 1
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(hours=19)) == 0  # repetir no duplica
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(minutes=30)) == 1
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT + timedelta(minutes=5)) == 1
    titles = [n["title"] for n in reversed(due_notices(ready_admin))]
    assert titles == ["«Entrega» vence en 24 h", "«Entrega» vence en 1 h", "«Entrega» venció"]
    first = due_notices(ready_admin)[-1]
    assert first["body"] == "Vence el 20 nov 2026, 09:00 (hora de la Ciudad de México)." and first["resource_id"] == task["id"]
    assert first["url"] == f"/vaults/{vault}?tab=tareas&task={task['id']}"


def test_a_task_created_inside_the_last_hour_only_gets_the_current_window(ready_admin):
    vault = vault_of(ready_admin)
    make(ready_admin, vault, title="Urgente", due_at=DUE)
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(minutes=20)) == 1
    assert [n["title"] for n in due_notices(ready_admin)] == ["«Urgente» vence en 1 h"]


def test_due_notices_skip_closed_agent_owned_and_ancient_tasks_and_restart_on_a_new_date(ready_admin):
    vault, _ = setup_agent(ready_admin)
    closed = make(ready_admin, vault, title="Cerrada", due_at=DUE)
    patch(ready_admin, vault, closed["id"], status="done")
    make(ready_admin, vault, title="De aira", due_at=DUE, assignee_type="agent", assignee_agent_id="aira")
    make(ready_admin, vault, title="Antigua", due_at="2026-11-01T15:00:00Z")
    moved = make(ready_admin, vault, title="Movible", due_at=DUE)
    now = DUE_AT - timedelta(hours=10)
    assert notify_due_tasks(TestingSessionLocal, now=now) == 1  # solo «Movible»
    assert notify_due_tasks(TestingSessionLocal, now=now) == 0
    patch(ready_admin, vault, moved["id"], due_at="2026-11-20T16:00:00Z")  # otra fecha: se reinician los avisos
    assert notify_due_tasks(TestingSessionLocal, now=now) == 1


def test_a_disabled_due_kind_creates_nothing(ready_admin):
    vault = vault_of(ready_admin)
    make(ready_admin, vault, due_at=DUE)
    ready_admin.put("/notifications/preferences", json={"kinds": {"task_due": False}})
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(hours=2)) == 0
    assert TestingSessionLocal().query(Notification).count() == 0
