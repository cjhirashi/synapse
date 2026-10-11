"""Errores en el contrato OpenAPI (SPEC-0004 RF-009).

Barre todas las operaciones de la app real: cada error declarado es un `Problem` en
`application/problem+json`, y toda operación declara el 500 genérico.
"""
import json

import pytest
from fastapi import FastAPI

from app.core.errors import EmailTaken, InvalidToken, StorageUnavailable
from app.core.problems import (
    PROBLEM_MEDIA_TYPE,
    Problem,
    ProblemError,
    install_problem_openapi,
    problem_responses,
)
from app.main import app

PROBLEM_REF = "#/components/schemas/Problem"
HTTP_METHODS = {"get", "put", "post", "delete", "patch", "options", "head", "trace"}


def _spec() -> dict:
    return json.loads(json.dumps(app.openapi()))


def _operations(spec: dict):
    for path, item in spec["paths"].items():
        for method, operation in item.items():
            if method in HTTP_METHODS:
                yield f"{method.upper()} {path}", operation


def _error_responses(spec: dict):
    for name, operation in _operations(spec):
        for code, response in operation["responses"].items():
            if code[0] in "45":
                yield f"{name} → {code}", response


def test_every_declared_error_is_a_problem():
    offenders = [
        name for name, response in _error_responses(_spec())
        if response.get("content") != {PROBLEM_MEDIA_TYPE: {"schema": {"$ref": PROBLEM_REF}}}
    ]
    assert not offenders, offenders


def test_every_operation_declares_the_generic_500():
    missing = [name for name, op in _operations(_spec()) if "500" not in op["responses"]]
    assert not missing, missing


def test_operations_with_input_declare_the_422_problem():
    # El login recibe un cuerpo: FastAPI declara su 422, ahora como Problem.
    login = _spec()["paths"]["/auth/login"]["post"]["responses"]
    assert login["422"]["content"] == {PROBLEM_MEDIA_TYPE: {"schema": {"$ref": PROBLEM_REF}}}


def test_fastapi_default_validation_schemas_are_gone():
    schemas = _spec()["components"]["schemas"]
    assert "HTTPValidationError" not in schemas
    assert "ValidationError" not in schemas


def test_problem_schemas_are_published_from_the_models():
    schemas = _spec()["components"]["schemas"]
    assert set(schemas["Problem"]["required"]) == {"type", "title", "status", "instance"}
    assert schemas["Problem"]["properties"]["errors"]["items"] == {
        "$ref": "#/components/schemas/ProblemError"
    }
    assert set(schemas["ProblemError"]["properties"]) == set(ProblemError.model_fields)
    assert set(schemas["Problem"]["properties"]) == set(Problem.model_fields)
    # Los opcionales se omiten, nunca valen null: el contrato no los declara anulables.
    published = json.dumps([schemas["Problem"], schemas["ProblemError"]])
    assert "null" not in published and "default" not in published


def test_openapi_is_built_once():
    assert app.openapi() is app.openapi()


# --- problem_responses ---

def test_problem_responses_maps_each_error_class_to_its_status():
    responses = problem_responses(InvalidToken, EmailTaken, StorageUnavailable)
    assert set(responses) == {401, 409, 503}
    assert responses[409]["description"] == EmailTaken.title
    assert responses[409]["content"] == {PROBLEM_MEDIA_TYPE: {"schema": {"$ref": PROBLEM_REF}}}


def test_problem_responses_joins_titles_that_share_a_status():
    from app.core.errors import InvalidCredentials

    responses = problem_responses(InvalidToken, InvalidCredentials)
    assert responses[401]["description"] == f"{InvalidToken.title} / {InvalidCredentials.title}"


@pytest.fixture
def mini_app() -> FastAPI:
    mini = FastAPI()

    @mini.get("/x", responses=problem_responses(InvalidToken))
    def x(q: int):
        return {}

    install_problem_openapi(mini)
    return mini


def test_install_problem_openapi_works_on_any_app(mini_app):
    responses = mini_app.openapi()["paths"]["/x"]["get"]["responses"]
    assert set(responses) == {"200", "401", "422", "500"}
    for code in ("401", "422", "500"):
        assert responses[code]["content"] == {PROBLEM_MEDIA_TYPE: {"schema": {"$ref": PROBLEM_REF}}}
