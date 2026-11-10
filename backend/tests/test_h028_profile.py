"""Tests para H-028: perfil de usuario (display_name, foto).

RF-H028-001…RF-H028-010: endpoints de perfil y foto.
"""

import pytest
from tests.conftest import SEED_EMAIL
from tests.test_agent_api_key_access import _bearer_client, _guest
from tests.test_agent_api_key_api import create_agent_key
from tests.test_vaults_api import assert_problem


def test_rf_h028_001_get_auth_me_includes_profile_fields_null_by_default(client, auth_cookies):
    """EARS: Given un usuario sin perfil, When GET /auth/me,
    Then devuelve display_name=null, photo_url=null.
    """
    res = client.get("/auth/me")
    assert res.status_code == 200
    body = res.json()

    assert "display_name" in body, "display_name debe existir en la respuesta"
    assert body["display_name"] is None, "display_name debe ser null por defecto"
    assert "photo_url" in body, "photo_url debe existir en la respuesta"
    assert body["photo_url"] is None, "photo_url debe ser null cuando no hay foto"


def test_rf_h028_002_patch_auth_me_update_display_name(client, auth_cookies):
    """EARS: Given un usuario autenticado, When PATCH /auth/me {display_name: "Mi Nombre"},
    Then persiste y devuelve display_name="Mi Nombre".
    """
    res = client.patch("/auth/me", json={"display_name": "Mi Nombre"})
    assert res.status_code == 200
    body = res.json()
    assert body["display_name"] == "Mi Nombre"

    # Verificar persistencia
    res = client.get("/auth/me")
    assert res.status_code == 200
    assert res.json()["display_name"] == "Mi Nombre"


def test_rf_h028_003_patch_auth_me_trims_whitespace(client, auth_cookies):
    """EARS: Given input con espacios, When PATCH /auth/me {display_name: "  Nombre  "},
    Then se recorta a "Nombre".
    """
    res = client.patch("/auth/me", json={"display_name": "  Nombre  "})
    assert res.status_code == 200
    assert res.json()["display_name"] == "Nombre"


def test_rf_h028_004_patch_auth_me_empty_string_becomes_null(client, auth_cookies):
    """EARS: Given input vacío o solo espacios, When PATCH /auth/me {display_name: "   "},
    Then se convierte a null.
    """
    # Primero, poner algo
    client.patch("/auth/me", json={"display_name": "Algo"})

    # Ahora vacío
    res = client.patch("/auth/me", json={"display_name": "   "})
    assert res.status_code == 200
    assert res.json()["display_name"] is None


def test_rf_h028_003b_spaces_do_not_count_toward_the_80_limit(client, auth_cookies):
    """EARS: Given 80 letras rodeadas de espacios, When PATCH /auth/me,
    Then se acepta y se guardan solo las 80 letras (el recorte va antes del tope).
    """
    res = client.patch("/auth/me", json={"display_name": "  " + "x" * 80 + "  "})
    assert res.status_code == 200, res.text
    assert res.json()["display_name"] == "x" * 80


def test_rf_h028_005_patch_auth_me_max_length_80(client, auth_cookies):
    """EARS: Given display_name con >80 caracteres, When PATCH /auth/me,
    Then retorna 422 ValidationFailed.
    """
    long_name = "x" * 81
    res = client.patch("/auth/me", json={"display_name": long_name})
    assert res.status_code == 422
    assert res.json()["type"] == "urn:synapse:problem:validation-error"


def test_rf_h028_006_patch_auth_me_cookie_only(client):
    """EARS: Given una petición con API key (sin cookie), When PATCH /auth/me,
    Then retorna 401 NotAuthenticated.
    """
    # Sin cookies
    res = client.patch("/auth/me", json={"display_name": "Algo"})
    assert res.status_code == 401
    assert res.json()["type"] == "urn:synapse:problem:not-authenticated"


# --- Aislamiento (B8): nadie cambia el nombre de otro usuario ---

def test_rf_h028_b8_patch_by_other_user_does_not_change_display_name(ready_admin, db):
    """EARS B8: Cuando el usuario B hace PATCH /auth/me, el display_name de A no cambia;
    B solo modifica el suyo."""
    ready_admin.patch("/auth/me", json={"display_name": "Ana"})
    guest = _guest(ready_admin, db)

    assert guest.patch("/auth/me", json={"display_name": "Intruso"}).status_code == 200
    assert ready_admin.get("/auth/me").json()["display_name"] == "Ana"
    assert guest.get("/auth/me").json()["display_name"] == "Intruso"


# --- API key (B9): una Bearer key no edita el perfil ---

def test_rf_h028_b9_agent_key_cannot_patch_display_name(ready_admin):
    """EARS B9: Cuando una API key (Bearer, sin cookie) hace PATCH /auth/me, el sistema responde
    401 `not-authenticated` y el nombre del dueño no cambia."""
    ready_admin.patch("/auth/me", json={"display_name": "Ana"})
    raw = create_agent_key(ready_admin, "aira").json()["key"]
    agent = _bearer_client(ready_admin, raw)

    assert_problem(agent.patch("/auth/me", json={"display_name": "Robado"}), 401, "not-authenticated")
    assert ready_admin.get("/auth/me").json()["display_name"] == "Ana"
