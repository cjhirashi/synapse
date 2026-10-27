"""Tope de profundidad de TODO cuerpo JSON de la API (SPEC-0010, Converge 3 — MEDIUM-1 preexistente).

FastAPI convierte el `RecursionError` de `json.loads` (≥ ~5000 niveles) en un 400 que el contrato no declara. La misma
clase `DeepJsonRequest` que protege `/sync` se aplica a los routers de `/auth`, `/admin` y `/vaults` (`DeepJsonRoute`):
cualquier cuerpo que no se pueda decodificar, o que anide más de `MAX_JSON_DEPTH` niveles, es el 422 `validation-error`.
Los cuerpos se construyen ya serializados (`json.dumps` de 5000 niveles lanzaría `RecursionError` en el propio test).
"""
import pytest

from app.core.json_body import MAX_JSON_DEPTH
from tests.test_vaults_api import assert_problem

HEADERS = {"content-type": "application/json"}


def nested(levels: int) -> str:
    return '{"k":' * (levels - 1) + "{}" + "}" * (levels - 1)


ROUTES = [
    ("POST", "/auth/login", False),
    ("POST", "/auth/change-password", True),
    ("POST", "/admin/users", True),
    ("POST", "/vaults", True),
    ("PATCH", "/vaults/00000000-0000-4000-8000-000000000000", True),
]


@pytest.mark.parametrize(("method", "path", "needs_session"), ROUTES, ids=[r[1] for r in ROUTES])
@pytest.mark.parametrize("levels", [MAX_JSON_DEPTH + 1, 960, 5000, 50_000])
def test_rf_001_a_too_deep_json_body_is_a_422_problem_not_an_undeclared_400(client, ready_admin, method, path, needs_session, levels):
    http = ready_admin if needs_session else client
    res = http.request(method, path, content=nested(levels), headers=HEADERS)
    assert_problem(res, 422, "validation-error")


def test_rf_001_a_body_at_the_cap_is_not_rejected_for_depth(client):
    res = client.post("/auth/login", content=nested(MAX_JSON_DEPTH), headers=HEADERS)
    # Falta `email`/`password`: 422 por la FORMA del cuerpo, no por la profundidad (el detalle lo distingue).
    assert res.status_code == 422
    assert "nested too deeply" not in res.text
