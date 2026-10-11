"""422 de validación como Problem Details (SPEC-0004 RF-005, RF-011)."""
import pytest
from fastapi import FastAPI, Header, Query
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from app.core.problems import PROBLEM_MEDIA_TYPE, VALIDATION_DETAIL, install_problem_handlers

LEAKED_VALUE = "SuperSecretValue123"


class Item(BaseModel):
    name: str = Field(max_length=5)
    tags: list[int] = []
    scores: dict[str, int] = {}


def _make_app() -> FastAPI:
    app = FastAPI()
    install_problem_handlers(app)

    @app.post("/items")
    def create(item: Item):
        return {}

    @app.get("/items/{item_id}")
    def read(item_id: int, limit: int = Query(50, ge=1, le=200)):
        return {}

    @app.get("/guarded")
    def guarded(x_token: str = Header()):
        return {}

    return app


@pytest.fixture
def client():
    return TestClient(_make_app())


def _errors(response) -> list[dict]:
    assert response.status_code == 422
    assert response.headers["content-type"] == PROBLEM_MEDIA_TYPE
    body = response.json()
    assert body["type"] == "urn:synapse:problem:validation-error"
    assert body["status"] == 422
    assert body["detail"] == VALIDATION_DETAIL
    for entry in body["errors"]:
        locations = {"pointer", "parameter", "header"} & entry.keys()
        assert len(locations) == 1, entry  # exactamente una ubicación
        assert set(entry) == locations | {"detail"}, entry  # sin input/ctx/url/type
    return body["errors"]


def test_body_field_uses_json_pointer(client):
    errors = _errors(client.post("/items", json={"name": "toolong"}))
    assert [e["pointer"] for e in errors] == ["#/name"]


def test_nested_body_field_pointer_includes_list_index(client):
    errors = _errors(client.post("/items", json={"name": "ok", "tags": [1, "x"]}))
    assert [e["pointer"] for e in errors] == ["#/tags/1"]


def test_pointer_escapes_tilde_and_slash(client):
    errors = _errors(client.post("/items", json={"name": "ok", "scores": {"a/b~c": "x"}}))
    assert [e["pointer"] for e in errors] == ["#/scores/a~1b~0c"]


def test_one_entry_per_failure(client):
    errors = _errors(client.post("/items", json={"name": "toolong", "tags": ["x"]}))
    assert sorted(e["pointer"] for e in errors) == ["#/name", "#/tags/0"]


def test_invalid_json_points_to_document_root(client):
    response = client.post("/items", content=b"{", headers={"content-type": "application/json"})
    assert [e["pointer"] for e in _errors(response)] == ["#"]


def test_missing_body_points_to_document_root(client):
    assert [e["pointer"] for e in _errors(client.post("/items"))] == ["#"]


def test_query_parameter_uses_parameter(client):
    errors = _errors(client.get("/items/1?limit=0"))
    assert errors[0] == {"parameter": "limit", "detail": errors[0]["detail"]}


def test_path_parameter_uses_parameter(client):
    errors = _errors(client.get("/items/abc"))
    assert [e["parameter"] for e in errors] == ["item_id"]


def test_header_uses_http_header_name(client):
    errors = _errors(client.get("/guarded"))
    assert [e["header"] for e in errors] == ["x-token"]


def test_submitted_value_is_never_echoed(client):
    response = client.post("/items", json={"name": LEAKED_VALUE, "tags": [LEAKED_VALUE]})
    _errors(response)
    assert LEAKED_VALUE not in response.text
