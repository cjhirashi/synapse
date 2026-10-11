from app.core.models.user import User
from tests.conftest import SEED_EMAIL, SEED_PASSWORD, login

ADMIN_NEW = "admin-chosen-password"
GUEST_NEW = "guest-chosen-password"


def _change(client, current, new):
    return client.post(
        "/auth/change-password", json={"current_password": current, "new_password": new}
    )


def test_end_to_end_bootstrap_forced_change_and_guest_onboarding(client, db):
    # RF-001: el arranque sembró al admin; RF-019: está obligado a cambiar la clave
    assert login(client).status_code == 200
    assert client.get("/auth/me").json()["must_change_password"] is True
    blocked = client.post("/admin/users", json={"email": "g@test.com", "password": SEED_PASSWORD})
    assert blocked.status_code == 403

    # RF-017: cambia la clave; la sesión de refresh queda revocada, se vuelve a entrar
    assert _change(client, SEED_PASSWORD, ADMIN_NEW).status_code == 204
    client.cookies.clear()
    assert login(client, SEED_EMAIL, SEED_PASSWORD).status_code == 401
    assert login(client, SEED_EMAIL, ADMIN_NEW).status_code == 200
    assert client.get("/auth/me").json()["must_change_password"] is False

    # RF-012: crea un guest con la clave semilla
    created = client.post("/admin/users", json={"email": "g@test.com", "password": SEED_PASSWORD})
    assert created.status_code == 201

    # El guest entra, está obligado a cambiar, y no puede administrar
    client.cookies.clear()
    assert login(client, "g@test.com", SEED_PASSWORD).status_code == 200
    assert client.get("/auth/me").json()["must_change_password"] is True
    assert _change(client, SEED_PASSWORD, GUEST_NEW).status_code == 204

    client.cookies.clear()
    assert login(client, "g@test.com", GUEST_NEW).status_code == 200
    assert client.get("/auth/me").json() == {
        "user_id": created.json()["id"],
        "role": "guest",
        "must_change_password": False,
    }
    again = client.post("/admin/users", json={"email": "x@test.com", "password": SEED_PASSWORD})
    assert again.status_code == 403
    assert db.query(User).count() == 2
