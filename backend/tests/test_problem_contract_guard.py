"""El guardián «emitido ⊆ declarado» detecta lo que debe y respeta RF-009 (SPEC-0004, enmienda 3)."""
import pytest

from app.main import app
from tests.conftest import login
from tests.contract_guard import ContractGuard, undeclared_error


@pytest.fixture
def schema(client):
    return app.openapi()


def test_guard_wraps_the_real_app():
    assert ContractGuard in [middleware.cls for middleware in app.user_middleware]


def test_declared_error_passes(schema):
    assert undeclared_error(schema, "POST", "/auth/login", 401) is None


def test_undeclared_error_is_reported(schema):
    violation = undeclared_error(schema, "POST", "/auth/login", 409)
    assert violation == "POST /auth/login → 409 no declarado en la operación /auth/login"


def test_success_statuses_are_not_checked(schema):
    assert undeclared_error(schema, "POST", "/auth/login", 299) is None


def test_routing_errors_are_excluded(schema):
    # RF-009: 404 de ruta inexistente y 405 de método no declarado no son de una operación.
    assert undeclared_error(schema, "GET", "/no/such/route", 404) is None
    assert undeclared_error(schema, "DELETE", "/auth/login", 405) is None


def test_undeclared_error_fails_the_request_end_to_end(client, monkeypatch):
    # Mutación controlada: se retira el 401 declarado de `/auth/login` en el contrato cacheado.
    responses = app.openapi()["paths"]["/auth/login"]["post"]["responses"]
    monkeypatch.delitem(responses, "401")
    with pytest.raises(AssertionError, match="401 no declarado"):
        login(client, password="wrong-password")
