"""El guardián «emitido ⊆ declarado» detecta lo que debe y respeta RF-009 (SPEC-0004, enmiendas 3 y 4)."""
import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import login
from tests.contract_guard import ContractGuard, undeclared_error


@pytest.fixture
def schema():
    return app.openapi()


def test_guard_wraps_the_real_app():
    assert ContractGuard in [middleware.cls for middleware in app.user_middleware]


def test_declared_error_passes(schema):
    assert undeclared_error(schema, "POST", "/auth/login", "/auth/login", 401) is None


def test_undeclared_error_is_reported(schema):
    violation = undeclared_error(schema, "POST", "/auth/login", "/auth/login", 409)
    assert violation == "POST /auth/login → 409 no declarado en la operación /auth/login"


def test_success_statuses_are_not_checked(schema):
    assert undeclared_error(schema, "POST", "/auth/login", "/auth/login", 299) is None


def test_routing_errors_are_excluded(schema):
    # RF-009: 404 de ruta inexistente (ninguna ruta la atiende) y 405 de método no declarado
    # no son de una operación.
    assert undeclared_error(schema, "GET", "/no/such/route", None, 404) is None
    assert undeclared_error(schema, "DELETE", "/auth/login", "/auth/login", 405) is None


def test_undeclared_error_fails_the_request_end_to_end(client, monkeypatch):
    # Mutación controlada: se retira el 401 declarado de `/auth/login` en el contrato cacheado.
    responses = app.openapi()["paths"]["/auth/login"]["post"]["responses"]
    monkeypatch.delitem(responses, "401")
    with pytest.raises(AssertionError, match="401 no declarado"):
        login(client, password="wrong-password")


def _overlapping_app() -> FastAPI:
    """App mínima con plantillas solapadas: `/vaults/{vault_id}` (GET) casa antes la ruta
    `/vaults/search`, pero Starlette atiende el POST con la segunda (SPEC-0003)."""
    overlapping = FastAPI()

    @overlapping.get("/vaults/{vault_id}", responses={404: {"description": "Not Found"}})
    def read_vault(vault_id: str):
        return JSONResponse({}, status_code=404)

    @overlapping.post("/vaults/search", responses={400: {"description": "Bad Request"}})
    def search(status: int):
        return JSONResponse({}, status_code=status)

    overlapping.add_middleware(ContractGuard, schema_provider=overlapping.openapi)
    return overlapping


def test_guard_checks_the_operation_that_served_the_request():
    client = TestClient(_overlapping_app())
    assert client.post("/vaults/search", params={"status": 400}).status_code == 400
    with pytest.raises(AssertionError, match="409 no declarado en la operación /vaults/search"):
        client.post("/vaults/search", params={"status": 409})
