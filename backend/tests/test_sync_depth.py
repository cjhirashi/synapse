"""Tope de profundidad GENERAL de los cuerpos JSON de `/sync/**` (SPEC-0010, Converge 2).

`json.loads` admite cientos de niveles pero `json.dumps` (el de httpx al reenviar a CouchDB, el de
`check_frontmatter`…) revienta con `RecursionError` cerca de 1000: un cuerpo anidado ~955–999 niveles daba un 500 sin
problem+json. `_DeepJsonRequest` rechaza ahora, al decodificar y de forma iterativa, todo cuerpo de más de
`MAX_JSON_DEPTH` niveles con el 422 `validation-error` de siempre, muy por debajo del límite de recursión.

Los cuerpos se construyen **ya serializados** (texto): serializar un dict de 950 niveles con `json.dumps` en el propio
cliente de pruebas lanzaría `RecursionError` antes de enviar nada (Python 3.11, el de producción).
"""
import pytest

from app.routers.sync import MAX_JSON_DEPTH
from tests.test_sync_api import UntouchablePort, couch_override  # noqa: F401
from tests.test_vaults_api import assert_problem

HEADERS = {"content-type": "application/json"}
OVER = [MAX_JSON_DEPTH + 1, 960]


def nested(levels: int) -> str:
    """JSON de `levels` objetos anidados (`levels >= 1`), sin recursión."""
    return '{"k":' * (levels - 1) + "{}" + "}" * (levels - 1)


def bulk_docs_body(total_depth: int) -> str:
    """`_bulk_docs` cuya profundidad total es `total_depth` (raíz 1, `docs` 2, el documento 3, el resto en `k`)."""
    return '{"new_edits":false,"docs":[{"k":' + nested(total_depth - 3) + "}]}"


def other_body(total_depth: int) -> str:
    """Cuerpo de objeto de `total_depth` niveles (raíz = 1)."""
    return nested(total_depth)


ROUTES = [
    ("PUT", "/sync/db/_local/abc", other_body),
    ("POST", "/sync/db/_bulk_docs", bulk_docs_body),
    ("POST", "/sync/db/_revs_diff", other_body),
    ("POST", "/sync/db/_bulk_get", other_body),
    ("POST", "/sync/db/_all_docs", other_body),
]


def send(client, method: str, path: str, body: str):
    return client.request(method, path, content=body, headers=HEADERS)


@pytest.mark.parametrize(("method", "path", "build"), ROUTES, ids=[r[1].rsplit("/", 1)[-1] for r in ROUTES])
@pytest.mark.parametrize("depth", OVER)
def test_rf_016_a_body_deeper_than_the_cap_is_422_without_reaching_couchdb(ready_admin, couch_override, method, path, build, depth):  # noqa: F811
    couch_override(UntouchablePort())
    assert_problem(send(ready_admin, method, path, build(depth)), 422, "validation-error")


@pytest.mark.parametrize(("method", "path", "build"), ROUTES, ids=[r[1].rsplit("/", 1)[-1] for r in ROUTES])
def test_rf_016_a_body_at_the_cap_is_not_rejected_for_depth(ready_admin, method, path, build):  # noqa: F811
    res = send(ready_admin, method, path, build(MAX_JSON_DEPTH))
    # Puede ser 200/201 o un 422 por la FORMA que espera la ruta, pero nunca un 500 ni el rechazo por profundidad.
    assert res.status_code < 500
    if res.status_code == 422:
        assert "JSON decode error" not in res.text and "json_invalid" not in res.text


def test_rf_016_changes_ignores_the_body_and_a_deep_one_is_not_a_500(ready_admin):  # noqa: F811
    for depth in (MAX_JSON_DEPTH, MAX_JSON_DEPTH + 1, 960):
        assert send(ready_admin, "POST", "/sync/db/_changes", nested(depth)).status_code < 500


def test_rf_005_a_frontmatter_of_the_cap_still_fits_inside_a_note_document():
    # El tope general tiene que dejar sitio al frontmatter de 32 niveles dentro de `docs[i]` (raíz 1, docs 2, doc 3).
    assert MAX_JSON_DEPTH >= 3 + 32
