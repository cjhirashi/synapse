"""Traductor de errores a Problem Details (SPEC-0004 RF-001…RF-004, RF-012, RF-013).

Usa una app mínima para probar el traductor aislado de las rutas reales.
"""
import json
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import problems
from app.core.errors import InvalidToken, PasswordPolicyViolation
from app.core.problems import PROBLEM_MEDIA_TYPE, install_problem_handlers

SECRET = "internal-secret-xyz"


def _make_app() -> FastAPI:
    app = FastAPI()
    install_problem_handlers(app)

    @app.get("/domain")
    def domain():
        raise InvalidToken(f"token rejected: {SECRET}")

    @app.get("/domain-with-errors")
    def domain_with_errors():
        raise PasswordPolicyViolation(errors=[{"pointer": "#/new_password", "detail": "Too short"}])

    @app.get("/boom")
    def boom():
        raise RuntimeError(SECRET)

    @app.post("/only-post")
    def only_post():
        return {}

    return app


@pytest.fixture
def client():
    # Starlette re-lanza los 500 al servidor después de responder; aquí sólo interesa la respuesta.
    return TestClient(_make_app(), raise_server_exceptions=False)


def _assert_problem(response, status: int) -> dict:
    assert response.status_code == status
    assert response.headers["content-type"] == PROBLEM_MEDIA_TYPE
    body = response.json()
    assert body["status"] == status  # RF-002
    for field in ("type", "title", "status", "instance"):
        assert field in body, field
    return body


# --- RF-001 / RF-002 / RF-003 / RF-004: errores de dominio ---

def test_domain_error_becomes_problem_with_catalog_type(client):
    body = _assert_problem(client.get("/domain?x=1"), 401)
    assert body["type"] == "urn:synapse:problem:invalid-token"
    assert body["title"] == InvalidToken.title
    assert body["detail"] == InvalidToken.detail
    assert body["instance"] == "/domain"  # sin query
    assert "errors" not in body


def test_domain_error_internal_message_never_reaches_the_client(client):
    assert SECRET not in client.get("/domain").text


def test_domain_error_carries_errors_when_present(client):
    body = _assert_problem(client.get("/domain-with-errors"), 422)
    assert body["type"] == "urn:synapse:problem:validation-error"
    assert body["errors"] == [{"pointer": "#/new_password", "detail": "Too short"}]


# --- RF-001 / RF-003: errores genéricos del framework ---

def test_unknown_route_is_about_blank_404(client):
    body = _assert_problem(client.get("/nope"), 404)
    assert body["type"] == "about:blank"
    assert body["title"] == "Not Found"
    assert body["instance"] == "/nope"


def test_wrong_method_is_about_blank_405_and_keeps_allow(client):
    response = client.get("/only-post")
    body = _assert_problem(response, 405)
    assert body["type"] == "about:blank"
    assert body["title"] == "Method Not Allowed"
    assert response.headers["allow"] == "POST"


# --- RF-004 / RF-012: errores no controlados ---

def test_unhandled_error_is_generic_500_without_internals(client):
    response = client.get("/boom")
    body = _assert_problem(response, 500)
    assert body["type"] == "about:blank"
    assert body["title"] == "Internal Server Error"
    assert body["detail"] == problems.UNEXPECTED_DETAIL
    assert SECRET not in response.text
    assert "Traceback" not in response.text


def test_unhandled_error_is_logged_with_traceback(client, caplog):
    with caplog.at_level(logging.ERROR, logger=problems.logger.name):
        client.get("/boom")
    record = next(r for r in caplog.records if r.name == problems.logger.name)
    assert record.exc_info is not None and record.exc_info[0] is RuntimeError
    assert "GET /boom" in record.getMessage()


# --- RF-013: fallo del propio traductor ---

def test_translator_failure_returns_constant_minimal_500(client, monkeypatch, caplog):
    def broken(*args, **kwargs):
        raise ValueError("translator bug")

    monkeypatch.setattr(problems, "_problem_body", broken)
    with caplog.at_level(logging.ERROR, logger=problems.logger.name):
        response = client.get("/domain")
    assert response.status_code == 500
    assert response.headers["content-type"] == PROBLEM_MEDIA_TYPE
    assert response.content == problems.FALLBACK_500_BODY
    assert json.loads(response.content)["status"] == 500
    assert any(r.exc_info and r.exc_info[0] is ValueError for r in caplog.records)
