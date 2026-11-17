"""H-035 TRABAJO 4A: documentos incrustados (Plotly, Archify, YouTube) en páginas públicas.

Funciones puras y extremo a extremo: embed_kind, embed_frames, recogida de recursos con incrustados.
"""

import pytest

from app.services.publication_snapshot import embed_kind, embed_frames
from tests.test_h035_publica import vault_of, _publish_template, _doc
from fastapi.testclient import TestClient
from app.main import app


# --- Pruebas de embed_kind (funciones puras) ---


class TestEmbedKind:
    """Validación de URLs de incrustados: archivo o video."""

    def test_valid_synapse_file_with_uuid(self):
        """Host synapse.cjhirashi.com con UUID válido es 'file'."""
        url = "https://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000"
        assert embed_kind(url) == "file"

    def test_valid_files_synapse_host(self):
        """Host files-synapse.cjhirashi.com con ruta válida es 'file'."""
        url = "https://files-synapse.cjhirashi.com/document.pdf"
        assert embed_kind(url) == "file"

    def test_uuid_with_uppercase(self):
        """UUID en mayúsculas también es válido."""
        url = "https://synapse.cjhirashi.com/files/ABCDEF00-0000-4000-8000-000000000000"
        assert embed_kind(url) == "file"

    def test_malformed_uuid_is_none(self):
        """UUID mal formado (10 caracteres en vez de 8) es None."""
        url = "https://synapse.cjhirashi.com/files/0000000000-0000-4000-8000-000000000000"
        assert embed_kind(url) is None

    def test_url_with_query_string_is_none(self):
        """URL con query string es None (excepto para video)."""
        url = "https://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000?v=1"
        assert embed_kind(url) is None

    def test_url_with_fragment_is_none(self):
        """URL con fragmento es None."""
        url = "https://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000#section"
        assert embed_kind(url) is None

    def test_url_with_port_is_none(self):
        """URL con puerto es None."""
        url = "https://synapse.cjhirashi.com:8080/files/00000000-0000-4000-8000-000000000000"
        assert embed_kind(url) is None

    def test_url_with_username_is_none(self):
        """URL con credenciales es None."""
        url = "https://user:pass@synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000"
        assert embed_kind(url) is None

    def test_http_scheme_is_none(self):
        """Esquema http (sin s) es None."""
        url = "http://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000"
        assert embed_kind(url) is None

    def test_path_with_double_dot_is_none(self):
        """Ruta con .. es None."""
        url = "https://synapse.cjhirashi.com/files/../../../etc/passwd"
        assert embed_kind(url) is None

    def test_similar_host_name_is_none(self):
        """Host parecido como synapse.cjhirashi.com.evil.test es None."""
        url = "https://synapse.cjhirashi.com.evil.test/files/00000000-0000-4000-8000-000000000000"
        assert embed_kind(url) is None

    def test_evil_subdomain_is_none(self):
        """Host evilsynapse.cjhirashi.com es None."""
        url = "https://evilsynapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000"
        assert embed_kind(url) is None

    def test_valid_youtube_video(self):
        """www.youtube-nocookie.com con id de 11 caracteres es 'video'."""
        url = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
        assert embed_kind(url) == "video"

    def test_youtube_with_start_parameter(self):
        """YouTube con ?start=30 es 'video'."""
        url = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30"
        assert embed_kind(url) == "video"

    def test_youtube_with_long_start_parameter(self):
        """YouTube con ?start=123456 (máximo 6 dígitos) es 'video'."""
        url = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=123456"
        assert embed_kind(url) == "video"

    def test_youtube_with_invalid_start_is_none(self):
        """YouTube con ?start=1234567 (7 dígitos) es None."""
        url = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=1234567"
        assert embed_kind(url) is None

    def test_youtube_with_id_of_10_chars_is_none(self):
        """YouTube con id de 10 caracteres es None."""
        url = "https://www.youtube-nocookie.com/embed/dQw4w9WgXc"
        assert embed_kind(url) is None

    def test_regular_youtube_com_is_none(self):
        """youtube.com (sin nocookie) es None."""
        url = "https://www.youtube.com/embed/dQw4w9WgXcQ"
        assert embed_kind(url) is None


# --- Pruebas de embed_frames (funciones puras) ---


class TestEmbedFrames:
    """Conversión de <a class="pub-embed"> en iframes."""

    def test_valid_file_embed_becomes_iframe(self):
        """Un enlace pub-embed válido para archivo se convierte en div pub-embed-frame con iframe."""
        html = '<a class="pub-embed" href="https://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000">Gráfica</a>'
        result = embed_frames(html)
        assert '<div class="pub-embed-frame">' in result
        assert 'iframe src="https://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000"' in result
        assert 'title="Gráfica"' in result
        assert 'sandbox="allow-scripts"' in result
        assert 'allow-same-origin' not in result
        assert '<a class="pub-embed-open"' in result
        assert "Abrir en una pestaña nueva" in result

    def test_youtube_embed_becomes_iframe_with_youtube_link(self):
        """Un enlace pub-embed para YouTube se convierte en iframe con atributos video."""
        html = '<a class="pub-embed" href="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ">Mi video</a>'
        result = embed_frames(html)
        assert '<div class="pub-embed-frame pub-embed-frame--video">' in result
        assert 'iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"' in result
        assert 'allow-same-origin' in result
        assert 'allow="fullscreen"' in result
        assert '<a class="pub-embed-open" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"' in result
        assert "Abrir en YouTube" in result

    def test_youtube_with_start_becomes_iframe_with_time(self):
        """YouTube con ?start=30 produce un enlace a youtube.com/watch?v=...&t=30."""
        html = '<a class="pub-embed" href="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30">Video</a>'
        result = embed_frames(html)
        assert '<a class="pub-embed-open" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ&amp;t=30"' in result

    def test_invalid_url_remains_link(self):
        """Un enlace pub-embed cuya URL no pasa embed_kind se deja como enlace normal."""
        html = '<a class="pub-embed" href="https://evil.test/x">Malo</a>'
        result = embed_frames(html)
        assert '<a class="pub-embed" href="https://evil.test/x">Malo</a>' in result
        assert 'iframe' not in result

    def test_link_with_other_class_untouched(self):
        """Un <a> con otra clase no se toca."""
        html = '<a class="otra">Link normal</a>'
        result = embed_frames(html)
        assert result == html

    def test_title_with_html_entities_escaped(self):
        """Título con < y & se escapa en el atributo."""
        html = '<a class="pub-embed" href="https://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000">&lt; Gráfica &amp; datos</a>'
        result = embed_frames(html)
        assert 'title="&lt; Gráfica &amp; datos"' in result

    def test_empty_title_uses_default(self):
        """Título vacío usa 'Contenido incrustado'."""
        html = '<a class="pub-embed" href="https://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000"></a>'
        result = embed_frames(html)
        assert 'title="Contenido incrustado"' in result

    def test_multiple_embeds_in_same_html(self):
        """Varios incrustados en el mismo HTML se convierten todos."""
        html = (
            '<a class="pub-embed" href="https://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000">Gráfica1</a>'
            '<p>Contenido</p>'
            '<a class="pub-embed" href="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ">Video</a>'
        )
        result = embed_frames(html)
        assert result.count('<div class="pub-embed-frame">') == 1
        assert result.count('<div class="pub-embed-frame pub-embed-frame--video">') == 1

    def test_class_pub_embed_with_extra_classes_not_converted(self):
        """<a class="pub-embed extra"> con extra clase NO se convierte (class debe ser exactamente 'pub-embed')."""
        html = '<a class="pub-embed extra" href="https://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000">X</a>'
        result = embed_frames(html)
        # Debe quedar tal cual (no se convierte)
        assert '<a class="pub-embed extra" href="https://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000">X</a>' in result
        assert 'iframe' not in result


# --- Pruebas extremo a extremo ---


def test_publish_with_file_embed_and_invalid_link(ready_admin):
    """Publicar HTML con un embed de archivo válido y otro enlace inválido.

    La página pública /p/<token> contiene exactamente un iframe para el archivo válido,
    el enlace inválido queda como enlace normal, y el CSP permite frame-src a los hosts autorizados.
    """
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # HTML con embed válido y uno inválido
    html = (
        '<h1>Documento</h1>'
        '<a class="pub-embed" href="https://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000">Gráfica</a>'
        '<p>Contenido</p>'
        '<a class="pub-embed" href="https://evil.test/x">Malo</a>'
    )
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": html})
    assert res.status_code == 201
    token = res.json()["token"]

    # Acceder a la página pública sin sesión
    client = TestClient(app)
    res = client.get(f"/p/{token}")
    assert res.status_code == 200

    # Verificar que hay exactamente un iframe para archivo
    assert res.text.count('<iframe src="https://synapse.cjhirashi.com/files/') == 1
    assert 'sandbox="allow-scripts"' in res.text
    assert 'allow-same-origin' not in res.text  # Solo para video

    # Enlace inválido queda como enlace
    assert 'href="https://evil.test/x"' in res.text

    # CSP contiene frame-src con los orígenes autorizados
    csp = res.headers.get("content-security-policy", "")
    assert "frame-src https://synapse.cjhirashi.com https://files-synapse.cjhirashi.com https://www.youtube-nocookie.com" in csp
    assert "unsafe-eval" not in csp
    assert "script-src" not in csp


def test_check_publication_with_private_file_resource(ready_admin):
    """POST .../publication/check de un HTML con incrustado de archivo privado propio.

    El archivo privado se lista en resources con visibility='private' y has_private=true.
    """
    from app.adapters.file_repository import FileRepository
    from sqlalchemy.orm import Session
    from app.adapters.database import SessionLocal
    from datetime import datetime, UTC
    import uuid

    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Crear un archivo privado de test
    file_id = str(uuid.uuid4())
    db = SessionLocal()
    try:
        # Obtener el owner_id del admin
        from app.core.models.user import User
        admin = db.query(User).filter(User.email == "cjhirashi@gmail.com").first()
        assert admin is not None

        # Crear archivo privado
        file_repo = FileRepository(db)
        from app.core.models.file import File
        file_obj = File(
            id=file_id,
            owner_id=admin.id,
            vault_id=vault_id,
            name="test.pdf",
            content_type="application/pdf",
            visibility="private",
            size=100,
            object_key=f"vaults/{vault_id}/{file_id}",
            created_at=datetime.now(UTC).replace(tzinfo=None),
        )
        db.add(file_obj)
        db.commit()

        # HTML con enlace a archivo privado
        html = f'<a class="pub-embed" href="https://synapse.cjhirashi.com/files/{file_id}">Documento privado</a>'

        # POST check
        res = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication/check", json={"html": html})
        assert res.status_code == 200

        # Verificar recursos
        result = res.json()
        assert len(result["resources"]) == 1
        assert result["resources"][0]["id"] == file_id
        assert result["resources"][0]["visibility"] == "private"
        assert result["has_private"] is True
    finally:
        db.close()


# --- Casos límite de la validación (revisión de seguridad) ---


@pytest.mark.parametrize("url", [
    "",
    "https:///files/00000000-0000-4000-8000-000000000000",  # sin host: antes lanzaba TypeError
    "https://synapse.cjhirashi.com:99999/files/00000000-0000-4000-8000-000000000000",  # puerto inválido: antes lanzaba ValueError
    "https://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000\n",  # `$` aceptaba un salto de línea final
    "https://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000 ",
    "https://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000#x",
    "https://www.youtube-nocookie.com/embed/abcdefghijk#frag",  # antes se reconstruía y se perdía el fragmento
    "https://www.youtube-nocookie.com/embed/abcdefghijk?start=5#frag",
    "https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1",
    "https://www.youtube-nocookie.com/embed/abcdefghijk?start=5&autoplay=1",
    "https://files-synapse.cjhirashi.com/a/../b.html",
    "https://files-synapse.cjhirashi.com/%2e%2e/b.html",
    "https://files-synapse.cjhirashi.com/%2E%2E/b.html",
    "https://files-synapse.cjhirashi.com/a b.html",
    "HTTPS://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000",  # el esquema se escribe exacto
    "https://SYNAPSE.cjhirashi.com/files/00000000-0000-4000-8000-000000000000",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
])
def test_embed_kind_rejects_everything_outside_the_closed_list(url):
    assert embed_kind(url) is None


def test_a_file_name_with_two_consecutive_dots_is_still_allowed():
    assert embed_kind("https://files-synapse.cjhirashi.com/informe..final.html") == "file"
