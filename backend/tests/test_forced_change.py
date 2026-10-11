from tests.conftest import SEED_PASSWORD, login

NEW = "a-brand-new-password"


def test_rf_019_flagged_user_is_blocked_from_protected_endpoints(client):
    login(client)
    res = client.post("/admin/users", json={"email": "g@test.com", "password": SEED_PASSWORD})
    assert res.status_code == 403
    assert res.json()["type"] == "urn:synapse:problem:password-change-required"


def test_rf_019_flagged_user_can_use_me_change_password_and_logout(client):
    login(client)
    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["must_change_password"] is True
    assert client.post(
        "/auth/change-password",
        json={"current_password": SEED_PASSWORD, "new_password": NEW},
    ).status_code == 204
    assert client.post("/auth/logout").status_code == 204


def test_rf_019_after_change_the_block_is_lifted(client):
    login(client)
    client.post(
        "/auth/change-password",
        json={"current_password": SEED_PASSWORD, "new_password": NEW},
    )
    me = client.get("/auth/me").json()
    assert me["must_change_password"] is False
    res = client.post("/admin/users", json={"email": "g@test.com", "password": SEED_PASSWORD})
    assert res.status_code == 201


def test_rf_019_flagged_user_can_refresh(client):
    login(client)
    assert client.get("/auth/me").json()["must_change_password"] is True
    assert client.post("/auth/refresh").status_code == 200
