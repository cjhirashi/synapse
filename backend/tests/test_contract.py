import json
from pathlib import Path

import yaml

from app.main import app

CONTRACT = (
    Path(__file__).resolve().parents[2]
    / ".harness/specs/0002-auth/contracts/openapi.yaml"
)


def test_contract_is_committed_and_matches_the_running_app():
    assert CONTRACT.exists(), "ejecuta: python backend/scripts/export_openapi.py"
    committed = yaml.safe_load(CONTRACT.read_text())
    current = json.loads(json.dumps(app.openapi()))
    assert committed == current, "el contrato está desactualizado: re-exporta con scripts/export_openapi.py"


def test_contract_documents_every_endpoint_of_the_spec():
    paths = yaml.safe_load(CONTRACT.read_text())["paths"]
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
