"""H-036: PDF de documentos — formato por omisión y campos especiales (puros), limpieza del HTML, recursos bloqueados y el endpoint.

Las pruebas que dibujan un PDF necesitan WeasyPrint (Pango), que vive en la imagen del backend: fuera de ella se omiten
(`docker run --network host --entrypoint pytest synapse-backend tests/test_h036_pdf.py`).
"""
from datetime import UTC, datetime

import pytest

from app.core import pdf_style
from app.services.note_pdf_service import file_name
from tests.test_h030_api import agent_client, post_note, vault_of

NOW = datetime(2026, 11, 14, 3, 0, tzinfo=UTC)  # 13 nov 2026, 21:00 CDMX
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


# --- Formato (puro) ---

def test_resolve_fills_the_defaults_and_keeps_what_the_template_set():
    style = pdf_style.resolve({"activo": True, "pagina": {"tamano": "a4", "margenes_mm": {"superior": 10}}, "texto": {"tamano_pt": 9}})
    assert style["activo"] is True and style["pagina"]["tamano"] == "a4"
    assert style["pagina"]["margenes_mm"] == {"superior": 10, "inferior": 20, "izquierdo": 20, "derecho": 20}
    assert style["texto"] == {"familia": "DejaVu Sans", "tamano_pt": 9, "color": "#1f2937"}
    assert pdf_style.resolve({})["activo"] is False and pdf_style.resolve(None)["pie"]["derecha"] == ""


def test_special_fields_are_resolved_and_the_rest_is_escaped():
    out = pdf_style.expand_text(
        "{{titulo}} <b>x</b> {{atributo:cliente}} {{atributo:etiquetas}} {{atributo:falta}} {{fecha}} {{pagina}}/{{paginas}}",
        title="A&B", attributes={"cliente": "Acme <script>", "etiquetas": ["a", "b"]}, now=NOW)
    assert out == ('A&amp;B &lt;b&gt;x&lt;/b&gt; Acme &lt;script&gt; a, b  13 nov 2026 <span class="pn"></span>/<span class="pt"></span>')


def test_the_stylesheet_follows_the_template():
    css = pdf_style.stylesheet(pdf_style.resolve({"pagina": {"tamano": "a4"}, "encabezados": {"familia": "Liberation Serif", "tamano_pt": 20, "color": "#ff0000"}}),
                               has_header=True, has_footer=False)
    assert "size: A4" in css and 'h1 {' in css and "font-size: 20" in css and "#ff0000" in css and "@top-left" in css and "@bottom-left" not in css


def test_file_name_is_ascii_and_bounded():
    assert file_name("Acta de reunión: Año 2026 / final") == "Acta-de-reunion-Ano-2026-final.pdf"
    assert file_name("???") == "documento.pdf" and len(file_name("x" * 300)) <= 84


# --- Limpieza del HTML ---

def test_sanitize_drops_everything_active_and_keeps_the_content():
    pytest.importorskip("nh3")
    from app.services.pdf_service import sanitize

    dirty = (
        '<h1 onclick="x()">Título</h1><script>alert(1)</script><iframe src="https://evil.test"></iframe><style>body{display:none}</style>'
        '<a href="javascript:alert(1)">mala</a><a href="https://ok.test">buena</a>'
        f'<img src="https://169.254.169.254/x"><img src="/files/abc-123" alt="a"><img src="{PNG}"><img src="file:///etc/passwd">'
        '<p style="color:red" class="k">texto</p><table><tr><td colspan="2">c</td></tr></table>')
    clean = sanitize(dirty)
    for bad in ("onclick", "<script", "alert(1)", "<iframe", "<style", "javascript:", "169.254", "file:///", 'style="'):
        assert bad not in clean, bad
    for good in ("<h1>Título</h1>", 'href="https://ok.test"', 'src="/files/abc-123"', f'src="{PNG}"', 'class="k"', 'colspan="2"', "buena"):
        assert good in clean, good


# --- Documento y recursos bloqueados ---

def test_the_document_carries_header_footer_attributes_and_sanitized_body():
    pytest.importorskip("nh3")
    from app.services.pdf_service import build_document

    style = pdf_style.resolve({
        "activo": True, "incluir_atributos": True,
        "encabezado": {"imagen": "img-1", "izquierda": "{{titulo}}", "derecha": "{{atributo:cliente}}"},
        "pie": {"izquierda": "{{fecha}}", "derecha": "Página {{pagina}} de {{paginas}}"}})
    doc = build_document(
        "<h2>Hola</h2><script>x</script>", style, title="Acta", frontmatter={"cliente": "Acme", "plantilla": "acta", "tags": ["a"], "estado": ""},
        read_image=lambda file_id: (b"\x89PNG", "image/png") if file_id == "img-1" else None, now=NOW)
    assert 'id="pdfhead"' in doc and 'id="pdffoot"' in doc and "<img src=\"data:image/png;base64," in doc
    assert "Acta" in doc and "Acme" in doc and "13 nov 2026" in doc and 'class="pn"' in doc
    assert "<h2>Hola</h2>" in doc and "<script" not in doc
    assert "<th>Cliente</th>" in doc and "<th>Etiquetas</th>" in doc and "plantilla" not in doc.split("<article>")[0].split("<body>")[1]
    bare = build_document("<p>x</p>", pdf_style.resolve({"activo": True}), title="T", frontmatter={}, read_image=lambda _: None, now=NOW)
    assert "pdfhead" not in bare.split("<body>")[1] and "@top-left" not in bare


def test_the_fetcher_only_serves_images_of_the_person():
    pytest.importorskip("weasyprint")
    from app.services.pdf_service import _fetcher

    fetcher = _fetcher(lambda file_id: (b"bytes", "image/png") if file_id == "mine" else (b"<svg/>", "text/html") if file_id == "html" else None)
    assert fetcher.fetch("https://synapse.invalid/files/mine").read() == b"bytes"
    assert fetcher.fetch(PNG).read().startswith(b"\x89PNG")
    for blocked in (
        "http://169.254.169.254/latest/meta-data", "https://example.com/x.png", "file:///etc/passwd", "ftp://x/y", "https://synapse.invalid/files/other",
        "https://synapse.invalid/files/html", "https://synapse.invalid/etc/passwd", "https://evil.test/files/mine", "http://synapse.invalid/files/mine", "data:text/html;base64,PGI+", "data:image/png,abc",
    ):
        with pytest.raises(ValueError):
            fetcher.fetch(blocked)


# --- Dibujo real ---

def _texts(pdf_doc):
    """Texto de cada página renderizada (cuerpo y áreas de encabezado y pie)."""
    def walk(box, out):
        if getattr(box, "text", None):
            out.append(box.text)
        for child in getattr(box, "children", ()) or ():
            walk(child, out)
        return out
    return [" ".join(" ".join(walk(page._page_box, [])).split()) for page in pdf_doc.pages]


def test_weasyprint_prints_header_footer_and_page_numbers_on_every_page():
    pytest.importorskip("weasyprint")
    pytest.importorskip("nh3")
    from weasyprint import HTML

    from app.services.pdf_service import INTERNAL_BASE, _fetcher, build_document

    style = pdf_style.resolve({"activo": True, "encabezado": {"izquierda": "{{titulo}}"}, "pie": {"derecha": "Página {{pagina}} de {{paginas}}"}})
    body = "".join(f"<p>Párrafo {i} lorem ipsum dolor sit amet</p>" for i in range(160))
    doc = build_document(body, style, title="Acta", frontmatter={}, read_image=lambda _: None, now=NOW)
    pages = _texts(HTML(string=doc, base_url=INTERNAL_BASE, url_fetcher=_fetcher(lambda _: None)).render())
    assert len(pages) >= 3
    assert all("Acta" in text for text in pages)
    assert "Página 1 de %d" % len(pages) in pages[0] and "Página %d de %d" % (len(pages), len(pages)) in pages[-1]


def test_make_pdf_returns_a_pdf_and_a_blocked_image_does_not_break_it():
    pytest.importorskip("weasyprint")
    pytest.importorskip("nh3")
    from app.services.pdf_service import build_document, make_pdf

    doc = build_document(f'<h1>Hola</h1><img src="{PNG}"><img src="/files/nope"><p>ok</p>', pdf_style.resolve({"activo": True}), title="T", frontmatter={}, read_image=lambda _: None, now=NOW)
    pdf = make_pdf(doc, lambda _: None)
    assert pdf.startswith(b"%PDF-") and len(pdf) > 1000


# --- Endpoint ---

def _template(admin, vault_id, pdf, name="acta"):
    fm = {"titulo": "Acta", "alcance": ["*"], "atributos": [{"nombre": "cliente", "tipo": "texto"}], "estilo": {"publicar": {}, "pdf": pdf}}
    res = post_note(admin, vault_id, f"PLANTILLAS/plantilla-{name}.md", "# Estructura", fm)
    assert res.status_code == 201, res.text


def _doc(admin, vault_id, **fm):
    res = post_note(admin, vault_id, "Actas/Reunión.md", "# Hola", {"titulo": "Acta de reunión", **fm})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_the_endpoint_returns_the_pdf_of_a_note_whose_template_enables_it(ready_admin):
    pytest.importorskip("weasyprint")
    pytest.importorskip("nh3")
    vault_id = vault_of(ready_admin)
    _template(ready_admin, vault_id, {"activo": True, "encabezado": {"izquierda": "{{titulo}}"}, "pie": {"derecha": "{{pagina}}"}})
    note_id = _doc(ready_admin, vault_id, plantilla="acta", cliente="Acme")
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{note_id}/pdf", json={"html": "<h1>Hola</h1><script>x</script><p>texto</p>"})
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "application/pdf" and res.content.startswith(b"%PDF-")
    assert 'filename="Acta-de-reunion.pdf"' in res.headers["content-disposition"] and res.headers["cache-control"] == "no-store"


def test_the_endpoint_refuses_when_the_template_does_not_enable_the_pdf(ready_admin):
    vault_id = vault_of(ready_admin)
    _template(ready_admin, vault_id, {})
    with_template = _doc(ready_admin, vault_id, plantilla="acta")
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{with_template}/pdf", json={"html": "<p>x</p>"})
    assert res.status_code == 409 and res.json()["type"].endswith("pdf-not-enabled")
    bare = post_note(ready_admin, vault_id, "Suelto.md", "x", {"titulo": "Suelto"}).json()["id"]
    assert ready_admin.post(f"/vaults/{vault_id}/notes/{bare}/pdf", json={"html": "<p>x</p>"}).status_code == 409


def test_the_endpoint_is_for_the_person_only_and_validates_its_input(ready_admin):
    vault_id = vault_of(ready_admin)
    _template(ready_admin, vault_id, {"activo": True})
    note_id = _doc(ready_admin, vault_id, plantilla="acta")
    from tests.test_h030_api import register

    aira = agent_client(ready_admin, "aira")
    register(ready_admin, vault_id, "aira", ["*"])
    assert aira.post(f"/vaults/{vault_id}/notes/{note_id}/pdf", json={"html": "<p>x</p>"}).status_code == 401
    assert ready_admin.post(f"/vaults/{vault_id}/notes/{note_id}/pdf", json={}).status_code == 422
    assert ready_admin.post(f"/vaults/{vault_id}/notes/{note_id}/pdf", json={"html": "x" * 5_000_001}).status_code == 422
    assert ready_admin.post(f"/vaults/{vault_id}/notes/{note_id}/pdf", json={"html": "x", "css": "y"}).status_code == 422
    assert ready_admin.post(f"/vaults/{vault_id}/notes/00000000-0000-4000-8000-000000000000/pdf", json={"html": "x"}).status_code == 404
