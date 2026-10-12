"""422 de validación como Problem Details (SPEC-0004 RF-005, RF-011)."""
from uuid import UUID

import pytest
from fastapi import FastAPI, Header, Query
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field, field_validator
from pydantic_core import PydanticCustomError

from app.core.problems import (
    GENERIC_FIELD_DETAIL,
    PROBLEM_MEDIA_TYPE,
    VALIDATION_DETAIL,
    install_problem_handlers,
)

LEAKED_VALUE = "SuperSecretValue123"


class Item(BaseModel):
    name: str = Field(max_length=5)
    tags: list[int] = Field(default=[], max_length=2)
    scores: dict[str, int] = {}


class Coded(BaseModel):
    """Validadores que meten el valor recibido en su mensaje (RF-011)."""

    code: str = ""
    label: str = ""
    slug: str = ""

    @field_validator("code")
    @classmethod
    def _plain_value_error(cls, v: str) -> str:
        if v:
            raise ValueError(f"code {v!r} is not allowed")
        return v

    @field_validator("label")
    @classmethod
    def _custom_error_with_ctx(cls, v: str) -> str:
        if v:
            raise PydanticCustomError("bad_label", "label {label} is taken", {"label": v})
        return v

    @field_validator("slug")
    @classmethod
    def _custom_error_constant(cls, v: str) -> str:
        if v:
            raise PydanticCustomError("bad_slug", "Slug is reserved")
        return v


def _make_app() -> FastAPI:
    app = FastAPI()
    install_problem_handlers(app)

    @app.post("/items")
    def create(item: Item):
        return {}

    @app.get("/items/{item_id}")
    def read(item_id: int, limit: int = Query(50, ge=1, le=200)):
        return {}

    @app.post("/coded")
    def coded(body: Coded):
        return {}

    @app.get("/vaults/{vault_id}")
    def vault(vault_id: UUID):
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


# --- RF-011: el texto de cada entrada sale de plantillas, nunca del valor recibido ---

@pytest.mark.parametrize("field", ["code", "label"])
def test_validator_message_carrying_the_value_becomes_generic(client, field):
    response = client.post("/coded", json={field: LEAKED_VALUE})
    assert _errors(response) == [{"pointer": f"#/{field}", "detail": GENERIC_FIELD_DETAIL}]
    assert LEAKED_VALUE not in response.text


def test_uuid_parsing_detail_does_not_quote_the_value(client):
    # El valor de un parámetro de ruta ya forma parte de `instance`; lo que no debe repetir
    # es la entrada de `errors` (pydantic cita el carácter inválido en su `msg`).
    response = client.get("/vaults/SECRETxx-0000-0000-0000-000000000000")
    assert _errors(response) == [{"parameter": "vault_id", "detail": GENERIC_FIELD_DETAIL}]


def test_constant_custom_message_is_kept(client):
    errors = _errors(client.post("/coded", json={"slug": "admin"}))
    assert errors == [{"pointer": "#/slug", "detail": "Slug is reserved"}]


def test_schema_limits_are_kept_in_the_detail(client):
    errors = _errors(client.get("/items/1?limit=500"))
    assert errors == [{"parameter": "limit", "detail": "Input should be less than or equal to 200"}]
    errors = _errors(client.post("/items", json={"name": "toolong"}))
    assert errors == [{"pointer": "#/name", "detail": "String should have at most 5 characters"}]


def test_collection_limits_are_kept_without_the_items(client):
    # `too_long` necesita `field_type` y `actual_length`: salen del esquema y de un recuento,
    # nunca del contenido, así que el texto se conserva sin los elementos (enmienda 2, W-2).
    response = client.post("/items", json={"name": "ok", "tags": [9001, 9002, 9003]})
    assert _errors(response) == [
        {"pointer": "#/tags", "detail": "List should have at most 2 items after validation, not 3"}
    ]
    assert "9001" not in response.text
