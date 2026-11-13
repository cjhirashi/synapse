"""H-053: Web Push — suscripciones, horas silenciosas y despachador (con un emisor falso: nada sale a la red)."""
from datetime import UTC, datetime, timedelta

import pytest

from app.adapters import web_push
from app.core.config import settings
from app.core.models.notification import Notification, PushSubscription
from app.core.quiet_hours import in_quiet_hours, parse_hhmm
from app.services import agent_access_guard
from app.services.push_dispatcher import dispatch_pending
from tests.conftest import TestingSessionLocal
from tests.test_h030_api import agent_client, register, vault_of

ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123"
SUB = {"endpoint": ENDPOINT, "keys": {"p256dh": "BPk" + "x" * 40, "auth": "authsecret"}}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    agent_access_guard._CACHE.clear()
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "priv")
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "pub-key")
    monkeypatch.setattr(settings, "VAPID_SUBJECT", "mailto:a@b.c")
    yield
    agent_access_guard._CACHE.clear()


class Fake:
    def __init__(self, result="ok"):
        self.result, self.calls = result, []

    def __call__(self, target, payload):
        self.calls.append((target, payload))
        return self.result


def notice_from_agent(admin):
    vault = vault_of(admin)
    aira = agent_client(admin, "aira")
    register(admin, vault, "aira", ["*"])
    assert aira.post(f"/vaults/{vault}/tasks", json={"title": "Revisar el plan"}).status_code == 201
    return vault, aira


def quiet(admin, enabled, start="22:00", end="07:00"):
    return admin.put("/notifications/preferences", json={"quiet": {"enabled": enabled, "start": start, "end": end}})


def run(sender):
    return dispatch_pending(TestingSessionLocal, now=datetime.now(UTC).replace(tzinfo=None), sender=sender)


# --- Reglas puras ---

def test_quiet_hours_cross_midnight_and_use_mexico_city_time():
    # 2026-11-12 04:30 UTC = 22:30 CDMX (UTC-6 sin horario de verano): dentro de 22:00–07:00.
    assert in_quiet_hours(datetime(2026, 11, 12, 4, 30), True, "22:00", "07:00")
    assert in_quiet_hours(datetime(2026, 11, 12, 12, 59), True, "22:00", "07:00")  # 06:59 CDMX
    assert not in_quiet_hours(datetime(2026, 11, 12, 13, 0), True, "22:00", "07:00")  # 07:00 CDMX
    assert not in_quiet_hours(datetime(2026, 11, 12, 18, 0), True, "22:00", "07:00")  # mediodía
    assert in_quiet_hours(datetime(2026, 11, 12, 18, 0), True, "11:00", "13:00")  # ventana sin cruce
    assert not in_quiet_hours(datetime(2026, 11, 12, 4, 30), False, "22:00", "07:00")
    assert not in_quiet_hours(datetime(2026, 11, 12, 4, 30), True, "10:00", "10:00")
    assert parse_hhmm("24:00") is None and parse_hhmm("7:00") is None and parse_hhmm("07:60") is None and parse_hhmm("07:30") == 450


@pytest.mark.parametrize("endpoint,ok", [
    (ENDPOINT, True),
    ("https://updates.push.services.mozilla.com/wpush/v2/x", True),
    ("https://web.push.apple.com/x", True),
    ("http://fcm.googleapis.com/x", False),
    ("https://localhost/x", False),
    ("https://169.254.169.254/latest", False),
    ("https://evil.example.com/fcm.googleapis.com", False),
    ("https://fcm.googleapis.com.evil.com/x", False),
    ("https://user:pw@fcm.googleapis.com/x", False),
    ("https://fcm.googleapis.com:8443/x", False),
])
def test_only_known_push_services_are_accepted(endpoint, ok):
    assert web_push.endpoint_allowed(endpoint) is ok


# --- API ---

def test_push_status_and_subscription_lifecycle(ready_admin):
    status = ready_admin.get("/notifications/push").json()
    assert status == {"enabled": True, "public_key": "pub-key", "devices": 0}
    assert ready_admin.put("/notifications/push/subscription", json=SUB).status_code == 204
    assert ready_admin.put("/notifications/push/subscription", json=SUB).status_code == 204  # idempotente por endpoint
    assert ready_admin.get("/notifications/push").json()["devices"] == 1
    assert ready_admin.delete("/notifications/push/subscription", params={"endpoint": ENDPOINT}).status_code == 204
    assert ready_admin.get("/notifications/push").json()["devices"] == 0


def test_push_off_without_keys_and_hostile_endpoints_are_rejected(ready_admin, monkeypatch):
    bad = ready_admin.put("/notifications/push/subscription", json={**SUB, "endpoint": "https://evil.example.com/x"})
    assert bad.status_code == 422
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "")
    assert ready_admin.get("/notifications/push").json() == {"enabled": False, "public_key": None, "devices": 0}
    assert ready_admin.put("/notifications/push/subscription", json=SUB).status_code == 422


def test_agent_keys_cannot_use_push_routes(ready_admin):
    vault_of(ready_admin)
    aira = agent_client(ready_admin, "aira")
    assert aira.get("/notifications/push").status_code == 401
    assert aira.put("/notifications/push/subscription", json=SUB).status_code == 401


def test_quiet_hours_preferences(ready_admin):
    assert ready_admin.get("/notifications/preferences").json()["quiet"] == {"enabled": True, "start": "22:00", "end": "07:00"}
    got = quiet(ready_admin, True, "23:30", "06:15")
    assert got.status_code == 200 and got.json()["quiet"] == {"enabled": True, "start": "23:30", "end": "06:15"}
    # Cambiar solo tipos conserva las horas; las horas inválidas se rechazan sin tocar lo guardado.
    kept = ready_admin.put("/notifications/preferences", json={"kinds": {"task_due": False}}).json()
    assert kept["kinds"]["task_due"] is False and kept["quiet"]["start"] == "23:30"
    assert quiet(ready_admin, True, "25:00", "06:00").status_code == 422
    assert quiet(ready_admin, True, "08:00", "08:00").status_code == 422
    assert ready_admin.get("/notifications/preferences").json()["quiet"]["start"] == "23:30"


def test_test_push_sends_now_even_in_quiet_hours_and_prunes_dead_devices(ready_admin, monkeypatch):
    ready_admin.put("/notifications/push/subscription", json=SUB)
    fake = Fake("ok")
    monkeypatch.setattr(web_push, "send", fake)
    assert ready_admin.post("/notifications/push/test").json() == {"sent": 1, "removed": 0, "failed": 0}
    assert fake.calls[0][1]["url"] == "/avisos"
    with TestingSessionLocal() as s:
        assert s.query(PushSubscription).one().last_success_at is not None  # la prueba también deja constancia del envío
    ready_admin.post("/notifications/push/test")
    assert fake.calls[0][1]["tag"] != fake.calls[1][1]["tag"]  # etiqueta única: con una fija el sistema reemplaza la anterior sin mostrarla
    monkeypatch.setattr(web_push, "send", Fake("gone"))
    assert ready_admin.post("/notifications/push/test").json() == {"sent": 0, "removed": 1, "failed": 0}
    assert ready_admin.get("/notifications/push").json()["devices"] == 0


# --- Despachador ---

def test_dispatcher_sends_a_new_notice_once_with_a_minimal_payload(ready_admin):
    quiet(ready_admin, False)
    ready_admin.put("/notifications/push/subscription", json=SUB)
    vault, _ = notice_from_agent(ready_admin)
    fake = Fake()
    stats = run(fake)
    assert stats["sent"] == 1 and len(fake.calls) == 1
    target, payload = fake.calls[0]
    assert target.endpoint == ENDPOINT
    assert set(payload) == {"title", "body", "url", "tag"}
    assert payload["title"] == "aira te asignó una tarea" and payload["url"].startswith(f"/vaults/{vault}?tab=tareas")
    assert run(fake)["checked"] == 0 and len(fake.calls) == 1  # ya revisado: no se reenvía
    with TestingSessionLocal() as s:
        assert s.query(PushSubscription).one().last_success_at is not None


def test_dispatcher_respects_quiet_hours_but_the_notice_stays_in_the_inbox(ready_admin):
    ready_admin.put("/notifications/push/subscription", json=SUB)
    notice_from_agent(ready_admin)
    quiet(ready_admin, True, "00:00", "23:59")
    fake = Fake()
    stats = run(fake)
    assert stats["quiet"] == 1 and fake.calls == []
    assert ready_admin.get("/notifications").json()["unread"] == 1


def test_a_notice_created_in_quiet_hours_is_pushed_when_the_window_ends(ready_admin):
    ready_admin.put("/notifications/push/subscription", json=SUB)
    notice_from_agent(ready_admin)
    quiet(ready_admin, True, "00:00", "23:59")
    fake = Fake()
    assert run(fake)["quiet"] == 1 and fake.calls == []
    with TestingSessionLocal() as s:
        assert s.query(Notification).one().pushed_at is None  # sigue pendiente, no se da por enviado
    quiet(ready_admin, False)  # termina la ventana
    stats = run(fake)
    assert stats["sent"] == 1 and len(fake.calls) == 1
    assert run(fake)["checked"] == 0  # y solo sale una vez


def test_push_goes_out_with_high_urgency_and_failures_are_logged(monkeypatch, caplog):
    import sys
    import types

    seen = {}

    class WebPushException(Exception):
        response = None

    def ok(**kwargs):
        seen.update(kwargs)

    fake = types.SimpleNamespace(webpush=ok, WebPushException=WebPushException)
    monkeypatch.setitem(sys.modules, "pywebpush", fake)
    assert web_push.send(web_push.Target(ENDPOINT, "k", "a"), {"title": "t"}) == "ok"
    assert seen["headers"] == {"Urgency": "high"}

    def boom(**kwargs):
        raise RuntimeError("sin red")

    fake.webpush = boom
    with caplog.at_level("WARNING", logger="synapse.push"):
        assert web_push.send(web_push.Target(ENDPOINT, "k", "a"), {"title": "t"}) == "error"
    assert "fcm.googleapis.com" in caplog.text and "RuntimeError" in caplog.text
    assert "abc123" not in caplog.text  # el resto del endpoint es un secreto de la suscripción


def test_dispatcher_without_devices_or_with_old_notices_sends_nothing(ready_admin):
    quiet(ready_admin, False)
    notice_from_agent(ready_admin)
    fake = Fake()
    assert run(fake)["sent"] == 0  # sin dispositivos
    ready_admin.put("/notifications/push/subscription", json=SUB)
    with TestingSessionLocal() as s:
        old = Notification(id="old1", owner_id=s.query(PushSubscription).one().owner_id, kind="task_due", title="Viejo",
                           created_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=30))
        s.add(old)
        s.commit()
    assert run(fake)["sent"] == 0 and fake.calls == []


def test_dispatcher_removes_gone_subscriptions_and_keeps_failing_ones(ready_admin):
    quiet(ready_admin, False)
    ready_admin.put("/notifications/push/subscription", json=SUB)
    vault, aira = notice_from_agent(ready_admin)
    assert run(Fake("error"))["failed"] == 1
    assert ready_admin.get("/notifications/push").json()["devices"] == 1
    # Un segundo aviso: ahora el servicio dice que la suscripción ya no existe.
    aira.post(f"/vaults/{vault}/tasks", json={"title": "Otra"})
    assert run(Fake("gone"))["removed"] == 1
    assert ready_admin.get("/notifications/push").json()["devices"] == 0
