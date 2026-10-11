import importlib.util
import json
from pathlib import Path

import pytest
import yaml

from app.main import app

ROOT = Path(__file__).resolve().parents[2]
SPECS = ROOT / ".harness/specs"
EXPORT_SCRIPT = ROOT / "backend/scripts/export_openapi.py"
PROBLEM_FEATURE = "0004-api-problem-details"


def _load_exporter():
    # El exportador es un script, no un paquete: se carga por ruta.
    spec = importlib.util.spec_from_file_location("export_openapi", EXPORT_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


exporter = _load_exporter()


def _app_spec() -> dict:
    return json.loads(json.dumps(app.openapi()))


def _committed(feature: str) -> dict:
    path = SPECS / feature / "contracts/openapi.yaml"
    assert path.exists(), "ejecuta: python backend/scripts/export_openapi.py"
    return yaml.safe_load(path.read_text())


@pytest.mark.parametrize("feature", sorted(exporter.FEATURES))
def test_contract_is_committed_and_matches_the_running_app(feature):
    current = exporter.contract_for(_app_spec(), feature)
    assert _committed(feature) == current, (
        f"el contrato de {feature} está desactualizado: re-exporta con scripts/export_openapi.py"
    )


def test_every_app_path_belongs_to_exactly_one_feature():
    for path in _app_spec()["paths"]:
        owners = [f for f in exporter.FEATURES if exporter.owns_path(f, path)]
        assert len(owners) == 1, (path, owners)


def test_problem_contract_holds_only_the_problem_schema():
    """El contrato de 0004 es el canon del esquema Problem (PLAN-0004 §4)."""
    contract = _committed(PROBLEM_FEATURE)
    assert "paths" not in contract
    assert set(contract["components"]["schemas"]) == {"Problem", "ProblemError"}


def test_problem_copies_in_feature_contracts_equal_the_canon():
    canon = _committed(PROBLEM_FEATURE)["components"]["schemas"]
    for feature in exporter.FEATURES:
        if feature == PROBLEM_FEATURE:
            continue
        schemas = _committed(feature).get("components", {}).get("schemas", {})
        assert "Problem" in schemas, f"{feature} no declara respuestas de error (RF-009)"
        for name in ("Problem", "ProblemError"):
            assert schemas[name] == canon[name], (feature, name)


def test_contract_documents_every_endpoint_of_the_auth_spec():
    paths = _committed("0002-auth")["paths"]
    expected = {
        ("/auth/login", "post"),
        ("/auth/logout", "post"),
        ("/auth/refresh", "post"),
        ("/auth/me", "get"),
        ("/auth/change-password", "post"),
        ("/admin/users", "post"),
    }
    for path, method in expected:
        assert method in paths[path], (path, method)
    assert "/auth/register" not in paths
