"""H-035 fase 2: ruta pública GET /p/{token}, limitador y verificación de recursos.

TestClient sin sesión para rutas públicas, limitador de peticiones, y comprobación de recursos.
"""

import base64
from datetime import UTC, datetime

import pytest

from tests.test_h030_api import agent_client, post_note, vault_of, patch
from tests.test_h035_publicaciones import _doc, _publish_template

PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


# --- Ruta pública sin sesión ---


def test_get_public_page_returns_200_with_html(ready_admin):
    """Publicar una nota y acceder a /p/{token} sin cookies debe dar 200 con HTML."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar
    html = "<h1>Título Público</h1><p>Contenido importante</p>"
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": html})
    assert res.status_code == 201
    token = res.json()["token"]

    # Acceder sin sesión
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    res = client.get(f"/p/{token}")
    assert res.status_code == 200
    assert res.headers["content-type"] == "text/html; charset=utf-8"
    assert "Título Público" in res.text
    assert "#h-1" in res.text  # enlace del índice
    assert "Contenido importante" in res.text
    assert 'content="noindex, nofollow, noarchive"' in res.text
    assert "default-src 'none'" in res.headers.get("content-security-policy", "")
    assert "unsafe-eval" not in res.headers.get("content-security-policy", "")
    assert res.headers.get("x-robots-tag") == "noindex, nofollow, noarchive"
    assert res.headers.get("referrer-policy") == "no-referrer"
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("cache-control") == "no-store"
    assert "set-cookie" not in res.headers


def test_head_request_to_public_page(ready_admin):
    """HEAD /p/{token} también debe responder 200."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    res = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"})
    token = res.json()["token"]

    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    res = client.head(f"/p/{token}")
    assert res.status_code == 200


def test_nonexistent_token_returns_404_with_unavailable_page(ready_admin):
    """Token inexistente, vacío-parecido y despublicado deben dar 404 con cuerpo idéntico."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    # Token inexistente
    res1 = client.get("/p/token-inexistente")
    assert res1.status_code == 404

    # Token muy corto
    res2 = client.get("/p/x")
    assert res2.status_code == 404

    # Ambos deben tener el mismo cuerpo
    assert res1.text == res2.text
    assert "No disponible" in res1.text or "no está disponible" in res1.text


def test_deleted_note_returns_404_and_removes_publication(ready_admin, db):
    """Si se borra la nota, GET /p/{token} debe dar 404 y la publicación debe desaparecer."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"})
    assert res.status_code == 201
    token = res.json()["token"]

    # Borrar la nota
    ready_admin.delete(f"/vaults/{vault_id}/notes/{doc['id']}", headers={"If-Match": doc["etag"]})

    # GET /p/{token} debe dar 404
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    res = client.get(f"/p/{token}")
    assert res.status_code == 404

    # La fila de la publicación se retiró (se lee de la base, no por la API: la API da 404 también porque la nota ya no existe)
    from app.adapters.publication_repository import PublicationRepository

    db.expire_all()
    assert PublicationRepository(db).get_by_token(token) is None


def test_rate_limiter_returns_429_on_excess(ready_admin):
    """Después de 3 peticiones, la 4.ª debe dar 429 con Retry-After."""
    from fastapi.testclient import TestClient
    from app.main import app
    from app.routers.public_pages import limiter

    # Monkeypatch el limitador
    limiter._limit = 3
    limiter._window = 60
    limiter.reset()

    try:
        client = TestClient(app)

        # 3 peticiones OK (aunque inexistentes, aún así cuentan)
        res1 = client.get("/p/token1")
        assert res1.status_code == 404

        res2 = client.get("/p/token2")
        assert res2.status_code == 404

        res3 = client.get("/p/token3")
        assert res3.status_code == 404

        # 4.ª petición: 429
        res4 = client.get("/p/token4")
        assert res4.status_code == 429
        assert res4.headers.get("retry-after") == "60"
    finally:
        limiter._limit = 120
        limiter._window = 60


def test_different_ip_bypasses_rate_limit(ready_admin):
    """Otra IP con cabecera CF-Connecting-IP distinta debe pasar el limitador."""
    from fastapi.testclient import TestClient
    from app.main import app
    from app.routers.public_pages import limiter

    limiter._limit = 2
    limiter._window = 60
    limiter.reset()

    try:
        client = TestClient(app)

        # 2 peticiones desde la IP por defecto
        res1 = client.get("/p/token1")
        assert res1.status_code == 404

        res2 = client.get("/p/token2")
        assert res2.status_code == 404

        # 3.ª desde diferente IP (con cabecera CF-Connecting-IP)
        res3 = client.get("/p/token3", headers={"CF-Connecting-IP": "192.0.2.1"})
        assert res3.status_code == 404
    finally:
        limiter._limit = 120
        limiter._window = 60


def test_subroute_of_p_token_returns_404(ready_admin):
    """GET /p/<token>/otra-cosa debe dar 404 de API, no HTML de SPA."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    res = client.get("/p/token-valido/otra-cosa")
    assert res.status_code == 404
    # Debe ser un 404 de API (no HTML de SPA)
    assert "index.html" not in res.text


# --- Escape y seguridad ---


def test_title_and_description_are_escaped(ready_admin):
    """El título con <script> y la descripción con onerror deben aparecer escapados."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)

    # Crear nota con título peligroso
    res = post_note(
        ready_admin,
        vault_id,
        "Peligroso.md",
        "<p>contenido</p>",
        {
            "titulo": "<script>alert(1)</script>",
            "descripcion": '"><img src=x onerror=alert(1)>',
            "plantilla": "acta",
        },
    )
    doc = res.json()
    doc["etag"] = res.headers.get("ETag", doc.get("etag"))

    # Publicar
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"})
    assert res.status_code == 201
    token = res.json()["token"]

    # Acceder
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    res = client.get(f"/p/{token}")
    assert res.status_code == 200

    # El título debe estar escapado
    assert "&lt;script&gt;" in res.text
    assert "<script>" not in res.text

    # La descripción debe estar escapada (en el contenido de aside, no en CSS)
    assert 'class="doc-desc"' in res.text and "&quot;&gt;" in res.text


def test_html_content_is_already_clean_from_snapshot(ready_admin):
    """El HTML publicado ya viene limpio de publication_snapshot."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Intentar publicar con <script>
    res = ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<h1>Título</h1><script>alert(1)</script><p>x</p>"},
    )
    assert res.status_code == 201
    token = res.json()["token"]

    # Acceder
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    res = client.get(f"/p/{token}")
    assert res.status_code == 200

    # <script> no debe aparecer (fue limpiado en la publicación)
    assert "<script>" not in res.text
    assert "alert(1)" not in res.text


# --- Endpoint de comprobación de recursos (C3) ---


def test_check_publication_with_mixed_resources(ready_admin):
    """POST /check con una imagen pública, una privada, una inexistente y una URL externa."""
    from app.main import app
    from app.routers.files import get_object_storage
    from tests.fake_object_storage import FakeObjectStorage

    fake = FakeObjectStorage()
    app.dependency_overrides[get_object_storage] = lambda: fake

    try:
        vault_id = vault_of(ready_admin)
        _publish_template(ready_admin, vault_id)
        doc = _doc(ready_admin, vault_id, plantilla="acta")

        # Subir archivo público
        png = base64.b64decode(PNG.split(",", 1)[1])
        public_res = ready_admin.post(
            "/files",
            data={"vault_id": vault_id, "visibility": "public"},
            files={"file": ("public.png", png, "image/png")},
        )
        assert public_res.status_code == 201
        public_file_id = public_res.json()["id"]

        # Subir archivo privado
        private_res = ready_admin.post(
            "/files",
            data={"vault_id": vault_id, "visibility": "private"},
            files={"file": ("private.png", png, "image/png")},
        )
        assert private_res.status_code == 201
        private_file_id = private_res.json()["id"]

        # HTML con recursos
        html = f"""
        <h1>Test</h1>
        <img src="/files/{public_file_id}" alt="público">
        <img src="/files/{private_file_id}" alt="privado">
        <img src="/files/nonexistent" alt="inexistente">
        <img src="https://cdn.test/external.png" alt="externa">
        <a href="/files/{public_file_id}">enlace a archivo</a>
        <a href="https://example.com">enlace externo</a>
        """

        res = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication/check", json={"html": html})
        assert res.status_code == 200

        result = res.json()
        assert len(result["resources"]) == 3

        # Buscar cada recurso
        resources_by_id = {r["id"]: r for r in result["resources"]}

        assert resources_by_id[public_file_id]["visibility"] == "public"
        assert resources_by_id[private_file_id]["visibility"] == "private"
        assert resources_by_id["nonexistent"]["visibility"] == "missing"

        # URLs externas
        assert "https://cdn.test/external.png" in result["external"]

        # has_private debe ser True (hay privada y missing)
        assert result["has_private"] is True

    finally:
        app.dependency_overrides.pop(get_object_storage, None)


def test_check_publication_with_only_public_resources(ready_admin):
    """Si todos los recursos son públicos, has_private debe ser False."""
    from app.main import app
    from app.routers.files import get_object_storage
    from tests.fake_object_storage import FakeObjectStorage

    fake = FakeObjectStorage()
    app.dependency_overrides[get_object_storage] = lambda: fake

    try:
        vault_id = vault_of(ready_admin)
        _publish_template(ready_admin, vault_id)
        doc = _doc(ready_admin, vault_id, plantilla="acta")

        # Subir archivo público
        png = base64.b64decode(PNG.split(",", 1)[1])
        public_res = ready_admin.post(
            "/files",
            data={"vault_id": vault_id, "visibility": "public"},
            files={"file": ("public.png", png, "image/png")},
        )
        assert public_res.status_code == 201
        public_file_id = public_res.json()["id"]

        html = f'<img src="/files/{public_file_id}" alt="x">'

        res = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication/check", json={"html": html})
        assert res.status_code == 200

        result = res.json()
        assert result["has_private"] is False

    finally:
        app.dependency_overrides.pop(get_object_storage, None)


def test_check_publication_requires_session(ready_admin):
    """POST /check sin sesión debe dar 401."""
    from fastapi.testclient import TestClient
    from app.main import app

    vault_id = vault_of(ready_admin)

    client = TestClient(app)
    res = client.post(
        f"/vaults/{vault_id}/notes/dummy/publication/check",
        json={"html": "<p>x</p>"},
    )
    assert res.status_code == 401


def test_check_publication_nonexistent_note(ready_admin):
    """POST /check con nota inexistente debe dar 404."""
    vault_id = vault_of(ready_admin)

    res = ready_admin.post(
        f"/vaults/{vault_id}/notes/00000000-0000-0000-0000-000000000000/publication/check",
        json={"html": "<p>x</p>"},
    )
    assert res.status_code == 404


def test_check_publication_invalid_body(ready_admin):
    """POST /check con cuerpo inválido (sin html) debe dar 422."""
    vault_id = vault_of(ready_admin)

    res = ready_admin.post(
        f"/vaults/{vault_id}/notes/dummy/publication/check",
        json={},
    )
    assert res.status_code == 422


# --- RateLimiter tests (unitarias) ---


def test_rate_limiter_allows_within_limit():
    """RateLimiter.allow debe permitir hasta 'limit' peticiones en la ventana."""
    from app.core.rate_limit import RateLimiter
    import time

    limiter = RateLimiter(limit=2, window_seconds=1)

    assert limiter.allow("test-key") is True
    assert limiter.allow("test-key") is True
    assert limiter.allow("test-key") is False


def test_rate_limiter_window_slides():
    """RateLimiter debe deslizar la ventana de tiempo."""
    from app.core.rate_limit import RateLimiter

    times = [0.0, 0.1, 0.5, 1.5]
    time_index = [0]

    def fake_clock():
        val = times[time_index[0]]
        return val

    limiter = RateLimiter(limit=2, window_seconds=1, clock=fake_clock)

    # Tiempo 0.0: 1.ª petición OK
    assert limiter.allow("key") is True

    # Tiempo 0.1: 2.ª petición OK
    time_index[0] = 1
    assert limiter.allow("key") is True

    # Tiempo 0.5: 3.ª petición NOT OK (aún dentro de la ventana)
    time_index[0] = 2
    assert limiter.allow("key") is False

    # Tiempo 1.5: 1.ª petición en la nueva ventana OK (la de 0.0 está fuera)
    time_index[0] = 3
    assert limiter.allow("key") is True


def test_rate_limiter_reset():
    """RateLimiter.reset debe limpiar todos los registros."""
    from app.core.rate_limit import RateLimiter

    limiter = RateLimiter(limit=1, window_seconds=1)

    limiter.allow("key1")
    limiter.allow("key2")

    limiter.reset()

    assert limiter.allow("key1") is True
    assert limiter.allow("key2") is True


def test_rate_limiter_respects_max_keys():
    """RateLimiter no debe superar max_keys."""
    from app.core.rate_limit import RateLimiter

    limiter = RateLimiter(limit=1, window_seconds=10, max_keys=5)

    for i in range(10):
        limiter.allow(f"key{i}")

    # Nunca debe superar max_keys; las antiguas se descartan
    assert len(limiter._records) <= 5


def test_collect_resources_keeps_external_images_whose_url_has_an_ampersand():
    from app.services.publication_snapshot import clean_html, collect_resources

    clean = clean_html('<p><img src="https://cdn.test/a.png?x=1&y=2"><img src="/files/abc-1"><a href="https://otro.test/b?c=1&d=2">enlace</a></p>')
    own, external = collect_resources(clean)
    assert own == ["abc-1"] and external == ["https://cdn.test/a.png?x=1&y=2"]  # el enlace no cuenta como imagen


def test_render_page_survives_json_of_the_wrong_type():
    from datetime import datetime

    from app.core.models.publication import Publication
    from app.services.publication_page import render_page

    pub = Publication(
        id="1", owner_id="o", vault_id="v", note_id="n", token="t", title="T", html="<p>x</p>", meta='["no es un dict"]', toc='["tampoco", 3, {"id": "h-1", "text": "Uno"}]',
        note_rev="r", published_at=datetime(2026, 11, 17),
    )
    page = render_page(pub)
    assert 'href="#h-1"' in page and "<p>x</p>" in page and 'class="doc-meta"' not in page and 'class="doc-desc"' not in page


def test_unpublished_nonexistent_and_deleted_give_the_same_404_page_and_headers(ready_admin):
    """Quien mira desde fuera no distingue un token inexistente de uno despublicado: mismo cuerpo, mismo código y mismas cabeceras."""
    from fastapi.testclient import TestClient

    from app.main import app

    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")
    token = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"}).json()["token"]
    assert ready_admin.delete(f"/vaults/{vault_id}/notes/{doc['id']}/publication").status_code == 204
    client = TestClient(app)
    gone, never = client.get(f"/p/{token}"), client.get("/p/nunca-existio-este-token")
    assert gone.status_code == never.status_code == 404
    assert gone.text == never.text
    for header in ("content-security-policy", "x-robots-tag", "referrer-policy", "cache-control", "content-type"):
        assert gone.headers.get(header) == never.headers.get(header) is not None
    assert "set-cookie" not in gone.headers


def test_storage_unavailable_gives_503_and_keeps_the_publication(ready_admin, db, monkeypatch):
    from fastapi.testclient import TestClient

    from app.adapters.publication_repository import PublicationRepository
    from app.core.errors import StorageUnavailable
    from app.main import app
    from app.services.note_content_service import NoteContentService

    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")
    token = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"}).json()["token"]

    def down(self, *args, **kwargs):
        raise StorageUnavailable()

    monkeypatch.setattr(NoteContentService, "get", down)
    res = TestClient(app).get(f"/p/{token}")
    assert res.status_code == 503 and "set-cookie" not in res.headers
    monkeypatch.undo()
    db.expire_all()
    assert PublicationRepository(db).get_by_token(token) is not None  # un fallo pasajero no retira la copia
    assert TestClient(app).get(f"/p/{token}").status_code == 200


def test_check_reports_a_file_of_another_person_as_missing(ready_admin, db):
    from app.core.models.file import File

    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")
    db.add(File(id="ajeno-1", owner_id="otra-persona", vault_id=vault_id, name="secreto.png", content_type="image/png", size=1,
                visibility="public", object_key="k", created_at=datetime.now(UTC)))
    db.commit()
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication/check", json={"html": '<img src="/files/ajeno-1">'})
    assert res.status_code == 200
    assert res.json()["resources"] == [{"id": "ajeno-1", "name": None, "content_type": None, "visibility": "missing"}]  # sin revelar nombre ni tipo
    assert res.json()["has_private"] is True


# --- Estilo del PDF en la página pública ---

PDF_STYLE = {
    "texto": {"familia": "Liberation Serif", "tamano_pt": 12, "color": "#222222"},
    "encabezados": {
        "h1": {"familia": "Liberation Sans", "tamano_pt": 24, "color": "#111111"},
        "h2": {"familia": "Liberation Sans", "tamano_pt": 19.7, "color": "#123456"},
        "h3": {"familia": "Liberation Sans", "tamano_pt": 16.3, "color": "#234567"},
        "h4": {"familia": "Liberation Sans", "tamano_pt": 13.9, "color": "#345678"},
    },
}


def test_pdf_style_css_carries_font_size_and_color_of_text_and_headings():
    from app.services.publication_css import pdf_style_css

    css = pdf_style_css(PDF_STYLE)
    assert '.content { font-family: "Liberation Serif", "Times New Roman", Times, serif; font-size: 12pt; }' in css
    assert ".content h1 { font-family: \"Liberation Sans\", Arial, Helvetica, sans-serif; font-size: 24pt; }" in css
    assert ".content h2 { font-family: " in css and "font-size: 19.7pt" in css
    assert ".content h4, .content h5, .content h6 { font-family:" in css
    # el color solo con el esquema claro (el PDF es sobre papel blanco)
    light = css.split("@media (prefers-color-scheme: light) {")[1]
    assert ".content { color: #222222; }" in light and ".content h1 { color: #111111; }" in light and ".content h3 { color: #234567; }" in light
    assert "color: #222222" not in css.split("@media")[0]


def test_pdf_style_css_empty_or_invalid_keeps_the_standard_style():
    from app.services.publication_css import pdf_style_css

    assert pdf_style_css({}) == "" and pdf_style_css([]) == "" and pdf_style_css(None) == ""
    bad = {"texto": {"familia": "Comic; } body { display:none", "tamano_pt": 12, "color": "#222222"},
           "encabezados": {"h1": {"familia": "DejaVu Sans", "tamano_pt": 18, "color": "red; } x {"}, "h2": {"familia": "DejaVu Sans", "tamano_pt": 999, "color": "#111111"}}}
    assert pdf_style_css(bad) == ""


def test_style_of_uses_pdf_defaults_and_is_empty_without_pdf_format():
    from app.services.publication_snapshot import style_of

    assert style_of(None) == {} and style_of({"estilo": {"pdf": {}}}) == {} and style_of({"estilo": {}}) == {}
    style = style_of({"estilo": {"pdf": {"texto": {"tamano_pt": 12}, "encabezados": {"h1": {"color": "#aa0000"}}}}})
    assert style["texto"] == {"familia": "DejaVu Sans", "tamano_pt": 12, "color": "#1f2937"}
    assert style["encabezados"]["h1"]["color"] == "#aa0000" and style["encabezados"]["h1"]["tamano_pt"] == 18
    assert set(style["encabezados"]) == {"h1", "h2", "h3", "h4"}


def test_public_page_uses_the_pdf_style_of_the_template(ready_admin):
    vault_id = vault_of(ready_admin)
    fm = {"titulo": "Acta", "alcance": ["*"], "atributos": [], "estilo": {"publicar": {"activo": True}, "pdf": {"texto": {"familia": "Liberation Serif", "tamano_pt": 12, "color": "#222222"}}}, "estados": [{"nombre": "borrador", "color": "azul"}]}
    assert post_note(ready_admin, vault_id, "PLANTILLAS/plantilla-acta.md", "# Estructura", fm).status_code == 201
    doc = _doc(ready_admin, vault_id, plantilla="acta")
    token = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<h1>Hola</h1><p>texto</p>"}).json()["token"]

    from fastapi.testclient import TestClient
    from app.main import app

    page = TestClient(app).get(f"/p/{token}").text
    assert "font-size: 12pt" in page and '"Liberation Serif"' in page and ".content { color: #222222; }" in page


def test_public_page_without_pdf_format_keeps_the_standard_style(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")
    token = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<h1>Hola</h1>"}).json()["token"]

    from fastapi.testclient import TestClient
    from app.main import app

    assert "Liberation" not in TestClient(app).get(f"/p/{token}").text
