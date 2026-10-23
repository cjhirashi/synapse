"""SPEC-0007 — FastAPI sirve la SPA.

El backend sustituye al nginx del frontend: sirve los estáticos del build (`frontend/dist`),
negocia `/vaults` por `Accept` y hace fallback a `index.html` para las rutas de React Router.
Las rutas de API y su contrato (SPEC-0002/0003/0004/0005) no cambian.
"""
from fastapi import FastAPI

from app.spa import DIST_DIR, install_spa, prefers_html

# Un asset real del build (su nombre lleva huella de Vite); se descubre, no se fija.
ASSET_NAMES = sorted(p.name for p in (DIST_DIR / "assets").iterdir() if p.is_file())
# El bundle JS de entrada: el directorio también trae CSS y fuentes, y el orden alfabético
# no garantiza que el primero sea JS.
JS_ASSET = next(name for name in ASSET_NAMES if name.endswith(".js"))
INDEX_MARKER = '<div id="root">'


# --- RF-003: prefers_html (unidad pura; mirror del `map $http_accept ~text/html`) ---

def test_prefers_html_detecta_navegacion():
    # Un navegador manda `text/html` en `Accept`; un `fetch` manda `*/*` o JSON.
    assert prefers_html("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
    assert prefers_html("TEXT/HTML")  # insensible a mayúsculas
    assert not prefers_html("application/json")
    assert not prefers_html("*/*")
    assert not prefers_html(None)


# --- RF-001: assets del build servidos directo ---

def test_asset_existente_se_sirve(client):
    r = client.get(f"/assets/{JS_ASSET}")
    assert r.status_code == 200
    assert "javascript" in r.headers["content-type"]


# --- RF-002: ruta de la SPA desconocida → index.html ---

def test_ruta_spa_sin_extension_sirve_index_con_html(client):
    r = client.get("/settings/password", headers={"Accept": "text/html"})
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert INDEX_MARKER in r.text


def test_ruta_spa_sin_extension_sirve_index_sin_accept(client):
    # El `try_files $uri /index.html` de nginx no miraba `Accept`: una ruta sin archivo
    # ni API, sin extensión, siempre es la SPA.
    r = client.get("/cualquier/ruta/de/router")
    assert r.status_code == 200
    assert INDEX_MARKER in r.text


def test_raiz_sirve_index(client):
    r = client.get("/", headers={"Accept": "text/html"})
    assert r.status_code == 200
    assert INDEX_MARKER in r.text


# --- RF-003: negociación de `/vaults` (API + ruta de la SPA) ---

def test_vaults_html_sirve_spa(client):
    # Navegación del navegador a /vaults → la app, sin tocar la API (ni requiere sesión).
    r = client.get("/vaults", headers={"Accept": "text/html"})
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert INDEX_MARKER in r.text


def test_vaults_deep_link_html_sirve_spa(client):
    # Deep-link de React Router a una bóveda concreta → también la SPA.
    r = client.get("/vaults/abc123", headers={"Accept": "text/html"})
    assert r.status_code == 200
    assert INDEX_MARKER in r.text


def test_vaults_json_va_a_api(client):
    # Un `fetch` (sin `text/html`) debe llegar al handler real → 401 sin sesión, Problem JSON.
    r = client.get("/vaults", headers={"Accept": "application/json"})
    assert r.status_code == 401
    assert r.headers["content-type"].startswith("application/problem+json")


def test_vaults_deep_link_json_va_a_api(client):
    r = client.get("/vaults/abc123", headers={"Accept": "application/json"})
    assert r.status_code == 401
    assert r.headers["content-type"].startswith("application/problem+json")


# --- RF-004: archivo concreto inexistente → 404 real, nunca index.html ---

def test_asset_inexistente_404(client):
    r = client.get("/assets/no-existe-C0ffee.js")
    assert r.status_code == 404
    assert INDEX_MARKER not in r.text


def test_archivo_raiz_con_extension_inexistente_404(client):
    r = client.get("/no-existe.css")
    assert r.status_code == 404
    assert INDEX_MARKER not in r.text


# --- RF-005: ruta de API desconocida → Problem 404, nunca HTML ---

def test_api_desconocida_devuelve_problem_no_html(client):
    # Aunque el navegador pida HTML, una subruta de API inexistente es un 404 Problem.
    for path in ("/auth/no-existe", "/admin/no-existe"):
        r = client.get(path, headers={"Accept": "text/html"})
        assert r.status_code == 404, path
        assert r.headers["content-type"].startswith("application/problem+json"), path
        assert INDEX_MARKER not in r.text, path


def test_api_existente_con_html_no_sirve_spa(client):
    # `/auth/me` con `Accept: text/html` y sin sesión → su Problem JSON (401), no la SPA.
    r = client.get("/auth/me", headers={"Accept": "text/html"})
    assert r.status_code == 401
    assert r.headers["content-type"].startswith("application/problem+json")
    assert INDEX_MARKER not in r.text


# --- RF-006: sin build, API pura (no monta, no falla el arranque) ---

def test_install_spa_sin_dist_es_api_pura(tmp_path, monkeypatch):
    import app.spa as spa

    monkeypatch.setattr(spa, "DIST_DIR", tmp_path / "no-dist")
    fresh = FastAPI()
    rutas_antes = len(fresh.router.routes)
    install_spa(fresh)  # no debe montar nada ni lanzar
    assert len(fresh.router.routes) == rutas_antes


# --- RF-007: método no-GET a ruta desconocida → 404 Problem, nunca 405 ni HTML ---
# (re-anchor 2026-10-17: el catch-all GET/HEAD no debe hacerse pasar por destinatario de
# métodos que no sirve; ver D-7 en spec.md)

def test_metodo_no_get_a_ruta_desconocida_da_404_problem_no_405(client):
    # Ninguna ruta real (ni la SPA, sólo GET/HEAD) atiende estos métodos sobre una ruta
    # inventada: debe reclasificarse a 404 Problem, nunca el 405 "partial match" del catch-all.
    for method in ("POST", "PUT", "DELETE"):
        r = client.request(method, "/esto-no-existe-en-ningun-lado")
        assert r.status_code == 404, (method, r.status_code, r.text)
        assert r.headers["content-type"].startswith("application/problem+json"), (method, r.text)
        assert INDEX_MARKER not in r.text, (method, r.text)
        body = r.json()
        assert body["type"] == "urn:synapse:problem:spa-resource-not-found", (method, body)


def test_metodo_no_permitido_en_ruta_real_sigue_dando_405(client):
    # La sutileza crítica: /health sólo admite GET. Un POST sobre una ruta REAL de un solo
    # método debe seguir dando su 405 legítimo con `Allow`, no la reclasificación de arriba.
    r = client.post("/health")
    assert r.status_code == 405
    assert "GET" in r.headers["allow"]
