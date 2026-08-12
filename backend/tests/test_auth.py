import httpx
import pytest

from app.core.config import settings


def test_health_check(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_register_first_user_success(client):
    res = client.post("/auth/register", json={"email": "admin@test.com", "password": "secret"})
    assert res.status_code == 201
    assert res.json()["role"] == "admin"
    assert "id" in res.json()
    assert res.json()["email"] == "admin@test.com"


def test_register_second_user_rejected(client, admin_user):
    res = client.post("/auth/register", json={"email": "other@test.com", "password": "secret"})
    assert res.status_code == 409


def test_login_success_sets_cookie(client, admin_user):
    res = client.post("/auth/login", json={"email": "admin@test.com", "password": "secret"})
    assert res.status_code == 200
    assert "access_token" in res.cookies


def test_login_invalid_credentials(client, admin_user):
    res = client.post("/auth/login", json={"email": "admin@test.com", "password": "wrong"})
    assert res.status_code == 401


def test_protected_endpoint_without_cookie(client):
    res = client.get("/auth/me")
    assert res.status_code == 401


def test_protected_endpoint_with_valid_cookie(client, admin_user, auth_cookies):
    res = client.get("/auth/me")
    assert res.status_code == 200
    assert res.json()["role"] == "admin"


def test_couchdb_created_on_register(client):
    res = client.post("/auth/register", json={"email": "admin@test.com", "password": "secret"})
    user_id = res.json()["id"]
    couchdb_res = httpx.get(
        f"{settings.COUCHDB_URL}/synapse_user_{user_id}",
        auth=(settings.COUCHDB_USER, settings.COUCHDB_PASSWORD),
    )
    assert couchdb_res.status_code == 200
