"""H-053: avisos para la persona — bandeja, preferencias, eventos de tareas y vencimientos."""
from datetime import datetime, timedelta

import pytest

from app.core.models.notification import Notification
from app.services import agent_access_guard
from app.services.task_jobs import _label, notify_due_tasks, reminders_of
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
    assert ready_admin.get("/notifications/preferences").json()["kinds"] == {"task_assigned": True, "task_status": True, "task_due": True, "publication_expired": True, "limit_grace": True, "vault_share": True}
    res = ready_admin.put("/notifications/preferences", json={"kinds": {"task_assigned": False}})
    assert res.json()["kinds"] == {"task_assigned": False, "task_status": True, "task_due": True, "publication_expired": True, "limit_grace": True, "vault_share": True}
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


def test_due_notices_skip_closed_and_ancient_tasks_include_agent_tasks_and_restart_on_a_new_date(ready_admin):
    vault, _ = setup_agent(ready_admin)
    closed = make(ready_admin, vault, title="Cerrada", due_at=DUE)
    patch(ready_admin, vault, closed["id"], status="done")
    make(ready_admin, vault, title="De aira", due_at=DUE, assignee_type="agent", assignee_agent_id="aira")
    make(ready_admin, vault, title="Antigua", due_at="2026-11-01T15:00:00Z")
    moved = make(ready_admin, vault, title="Movible", due_at=DUE)
    now = DUE_AT - timedelta(hours=10)
    assert notify_due_tasks(TestingSessionLocal, now=now) == 2  # «Movible» y la de aira (la persona supervisa lo de sus agentes)
    assert notify_due_tasks(TestingSessionLocal, now=now) == 0
    patch(ready_admin, vault, moved["id"], due_at="2026-11-20T16:00:00Z")  # otra fecha: se reinician los avisos
    assert notify_due_tasks(TestingSessionLocal, now=now) == 1


def test_a_task_of_an_agent_notifies_the_person_and_names_the_agent(ready_admin):
    vault, _ = setup_agent(ready_admin)
    make(ready_admin, vault, title="Informe", due_at=DUE, assignee_type="agent", assignee_agent_id="aira")
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(hours=20)) == 1
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT + timedelta(minutes=2)) == 1
    assert [n["title"] for n in reversed(due_notices(ready_admin))] == ["«Informe» (de aira) vence en 24 h", "«Informe» (de aira) venció"]


def test_a_disabled_due_kind_creates_nothing(ready_admin):
    vault = vault_of(ready_admin)
    make(ready_admin, vault, due_at=DUE)
    ready_admin.put("/notifications/preferences", json={"kinds": {"task_due": False}})
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(hours=2)) == 0
    assert TestingSessionLocal().query(Notification).count() == 0


# --- Recordatorios propios de cada tarea ---

def titles(client):
    return [n["title"] for n in reversed(due_notices(client))]


def test_custom_reminders_each_fire_once_at_their_own_time(ready_admin):
    vault = vault_of(ready_admin)
    make(ready_admin, vault, title="Informe", due_at=DUE, reminders=[2880, 120, 30])
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(days=3)) == 0  # aún falta más de 2 días
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(days=2) + timedelta(minutes=1)) == 1  # 2 días antes
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(hours=10)) == 0  # sigue en la misma ventana: no repite
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(minutes=100)) == 1  # 2 h antes
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(minutes=25)) == 1  # 30 min antes
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT + timedelta(minutes=1)) == 1  # venció
    assert titles(ready_admin) == ["«Informe» vence en 2 días", "«Informe» vence en 2 h", "«Informe» vence en 30 min", "«Informe» venció"]


def test_an_empty_list_sends_no_reminders_but_the_overdue_notice_remains(ready_admin):
    vault = vault_of(ready_admin)
    make(ready_admin, vault, title="Sin avisos", due_at=DUE, reminders=[])
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(hours=20)) == 0
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(minutes=30)) == 0
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT + timedelta(minutes=5)) == 1
    assert titles(ready_admin) == ["«Sin avisos» venció"]


def test_a_task_without_its_own_list_keeps_the_old_windows_and_their_keys(ready_admin):
    vault = vault_of(ready_admin)
    make(ready_admin, vault, title="Clásica", due_at=DUE)
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(hours=20)) == 1
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(minutes=30)) == 1
    keys = sorted(n.dedupe_key.rsplit(":", 1)[1] for n in TestingSessionLocal().query(Notification).all())
    assert keys == ["1h", "24h"]  # los nombres de siempre: un despliegue no repite avisos ya enviados
    assert titles(ready_admin) == ["«Clásica» vence en 24 h", "«Clásica» vence en 1 h"]


def test_reminders_longer_than_a_day_are_found_by_the_job(ready_admin):
    vault = vault_of(ready_admin)
    make(ready_admin, vault, title="Lejana", due_at=DUE, reminders=[20160])  # 2 semanas
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(days=15)) == 0
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(days=13)) == 1
    assert titles(ready_admin) == ["«Lejana» vence en 2 semanas"]


def test_changing_the_reminders_adds_the_new_window_without_resending_the_old_one(ready_admin):
    vault = vault_of(ready_admin)
    task = make(ready_admin, vault, title="Ajustada", due_at=DUE, reminders=[120])
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(minutes=100)) == 1
    patch(ready_admin, vault, task["id"], reminders=[120, 15])
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(minutes=90)) == 0  # la de 2 h ya salió
    assert notify_due_tasks(TestingSessionLocal, now=DUE_AT - timedelta(minutes=10)) == 1  # la nueva
    assert titles(ready_admin) == ["«Ajustada» vence en 2 h", "«Ajustada» vence en 15 min"]


def test_reminder_labels_and_defaults():
    assert [_label(m) for m in (1, 30, 60, 90, 120, 1440, 2880, 4320, 10080, 20160)] == [
        "1 min", "30 min", "1 h", "90 min", "2 h", "24 h", "2 días", "3 días", "1 semana", "2 semanas"]

    class T:
        reminders = None

    assert reminders_of(T()) == [60, 1440]
    T.reminders = "[]"
    assert reminders_of(T()) == []
    T.reminders = "[1440, 30]"
    assert reminders_of(T()) == [30, 1440]


def test_the_list_carries_the_current_state_of_the_task_of_each_notice(ready_admin):
    vault, aira = setup_agent(ready_admin)
    task = aira.post(f"/vaults/{vault}/tasks", json={"title": "Revisar el plan", "description": "Con los números de octubre"}).json()
    item = inbox(ready_admin)["items"][0]
    assert item["task"]["title"] == "Revisar el plan" and item["task"]["description"] == "Con los números de octubre"
    assert item["task"]["status"] == "pending" and item["task"]["assignee_type"] == "user"
    assert patch(ready_admin, vault, task["id"], status="in_progress").status_code == 200
    assert inbox(ready_admin)["items"][0]["task"]["status"] == "in_progress"
    assert ready_admin.delete(f"/vaults/{vault}/tasks/{task['id']}").status_code in (200, 204)
    assert inbox(ready_admin)["items"][0]["task"] is None
