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
        f'<img src="https://cdn.test/a.png"><img src="https://user:pw@cdn.test/b.png"><img src="/files/abc-123" alt="a"><img src="{PNG}"><img src="file:///etc/passwd"><img src="javascript:alert(1)">'
        '<p style="color:red" class="k">texto</p><table><tr><td colspan="2">c</td></tr></table>')
    clean = sanitize(dirty)
    for bad in ("onclick", "<script", "alert(1)", "<iframe", "<style", "javascript:", "user:pw", "file:///", 'style="'):
        assert bad not in clean, bad
    for good in ("<h1>Título</h1>", 'href="https://ok.test"', 'src="https://cdn.test/a.png"', 'src="/files/abc-123"', f'src="{PNG}"', 'class="k"', 'colspan="2"', "buena"):
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


def test_the_fetcher_serves_own_files_data_images_and_public_web_images_only():
    pytest.importorskip("weasyprint")
    from app.services.pdf_service import _fetcher

    web = {"https://cdn.test/a.png": (b"web-bytes", "image/png")}
    fetcher = _fetcher(
        lambda file_id: (b"bytes", "image/png") if file_id == "mine" else (b"<svg/>", "text/html") if file_id == "html" else None,
        fetch_external=lambda url, allowed: web.get(url))
    assert fetcher.fetch("https://synapse.invalid/files/mine").read() == b"bytes"
    assert fetcher.fetch(PNG).read().startswith(b"\x89PNG")
    assert fetcher.fetch("https://cdn.test/a.png").read() == b"web-bytes"
    for blocked in (
        "https://example.com/otra.png", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "ftp://x/y", "https://synapse.invalid/files/other",
        "https://synapse.invalid/files/html", "https://synapse.invalid/etc/passwd", "data:text/html;base64,PGI+", "data:image/png,abc", "https://u:p@cdn.test/a.png",
    ):
        with pytest.raises(ValueError):
            fetcher.fetch(blocked)


def test_a_link_to_an_own_file_is_read_with_the_session_not_over_the_internet():
    pytest.importorskip("weasyprint")
    pytest.importorskip("nh3")
    from app.services.pdf_service import _fetcher, own_file_path, sanitize

    link = "https://synapse.cjhirashi.com/files/abc-123"
    assert own_file_path(link) == "/files/abc-123" and own_file_path(link + "?v=2#x") == "/files/abc-123"
    assert own_file_path("http://SYNAPSE.cjhirashi.com:443/files/abc-123") == "/files/abc-123"
    assert own_file_path("https://otro.test/files/abc-123") is None and own_file_path("https://synapse.cjhirashi.com.evil.test/files/a") is None
    assert own_file_path("https://synapse.cjhirashi.com/files/a/b") is None and own_file_path("https://u:p@synapse.cjhirashi.com/files/a") is None
    assert f'src="/files/abc-123"' in sanitize(f'<img src="{link}?v=2">')

    web = []
    private = {"abc-123": (b"PRIVATE", "image/png")}
    fetcher = _fetcher(lambda file_id: private.get(file_id), fetch_external=lambda url, allowed: web.append(url) or None)
    assert fetcher.fetch(link).read() == b"PRIVATE" and web == []  # nunca salió a internet
    with pytest.raises(ValueError):
        fetcher.fetch("https://synapse.cjhirashi.com/files/de-otro")  # no es suyo: se intenta como imagen pública de la web
    assert web == ["https://synapse.cjhirashi.com/files/de-otro"]


def test_the_fetcher_caps_how_many_web_images_one_pdf_can_pull():
    pytest.importorskip("weasyprint")
    from app.services import pdf_service

    calls = []
    fetcher = pdf_service._fetcher(lambda _: None, fetch_external=lambda url, allowed: calls.append(url) or (b"x", "image/png"))
    for i in range(pdf_service.MAX_EXTERNAL_IMAGES):
        fetcher.fetch(f"https://cdn.test/{i}.png")
    with pytest.raises(ValueError):
        fetcher.fetch("https://cdn.test/otra.png")
    assert len(calls) == pdf_service.MAX_EXTERNAL_IMAGES


# --- Imágenes externas: solo direcciones públicas ---

def test_only_public_addresses_are_resolved(monkeypatch):
    from app.services import external_image as ext

    def resolves_to(*addresses):
        monkeypatch.setattr(ext.socket, "getaddrinfo", lambda *a, **k: [(0, 0, 0, "", (address, 0)) for address in addresses])
        return ext.resolve_public("x.test", 443)

    assert resolves_to("93.184.216.34") == ["93.184.216.34"]
    for private in ("127.0.0.1", "10.0.0.5", "172.24.0.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1"):
        assert resolves_to(private) is None, private
    assert resolves_to("93.184.216.34", "10.0.0.5") is None  # basta una interna para negarla
    monkeypatch.setattr(ext.socket, "getaddrinfo", lambda *a, **k: (_ for _ in ()).throw(OSError("no resuelve")))
    assert ext.resolve_public("nada.test", 443) is None


def _fake_get(responses):
    def get(url, ip, host, timeout):
        get.calls.append((url, ip, host))
        return responses[url]
    get.calls = []
    return get


def test_a_public_web_image_is_downloaded_with_the_checked_ip():
    from app.services import external_image as ext

    get = _fake_get({"https://cdn.test/a.png": (200, {"Content-Type": "image/PNG; charset=x"}, b"IMG")})
    assert ext.fetch("https://cdn.test/a.png", ("image/png",), resolve=lambda h, p: ["93.184.216.34"], get=get) == (b"IMG", "image/png")
    assert get.calls == [("https://cdn.test/a.png", "93.184.216.34", "cdn.test")]


def test_redirects_are_followed_but_each_hop_is_checked():
    from app.services import external_image as ext

    get = _fake_get({
        "https://a.test/x": (302, {"Location": "https://b.test/y"}, b""),
        "https://b.test/y": (301, {"location": "/z.png"}, b""),
        "https://b.test/z.png": (200, {"content-type": "image/png"}, b"OK"),
        "https://evil.test/x": (302, {"Location": "http://internal.test/secret.png"}, b""),
    })
    resolve = lambda host, port: None if host == "internal.test" else ["93.184.216.34"]  # noqa: E731
    assert ext.fetch("https://a.test/x", ("image/png",), resolve=resolve, get=get) == (b"OK", "image/png")
    assert ext.fetch("https://evil.test/x", ("image/png",), resolve=resolve, get=get) is None
    loop = _fake_get({"https://l.test/1": (302, {"Location": "https://l.test/1"}, b"")})
    assert ext.fetch("https://l.test/1", ("image/png",), resolve=resolve, get=loop) is None and len(loop.calls) == ext.MAX_REDIRECTS + 1


def test_web_images_that_are_not_images_too_big_or_failing_are_skipped():
    from app.services import external_image as ext

    ok = lambda host, port: ["93.184.216.34"]  # noqa: E731
    cases = {
        "https://t.test/page": (200, {"Content-Type": "text/html"}, b"<html>"),
        "https://t.test/missing.png": (404, {"Content-Type": "image/png"}, b""),
        "https://t.test/huge.png": (200, {"Content-Type": "image/png"}, None),
    }
    for url in cases:
        assert ext.fetch(url, ("image/png",), resolve=ok, get=_fake_get(cases)) is None, url
    boom = lambda *a: (_ for _ in ()).throw(TimeoutError())  # noqa: E731
    assert ext.fetch("https://t.test/slow.png", ("image/png",), resolve=ok, get=boom) is None
    for bad in ("file:///etc/passwd", "ftp://t.test/a.png", "https://u:p@t.test/a.png", "https:///x.png", "gopher://t.test/"):
        assert ext.fetch(bad, ("image/png",), resolve=ok, get=_fake_get({})) is None, bad


def test_the_real_http_request_goes_to_the_checked_ip_with_the_original_host():
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    from app.services import external_image as ext

    seen = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            seen["host"], seen["agent"] = self.headers["Host"], self.headers["User-Agent"]
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.end_headers()
            self.wfile.write(b"\x89PNGdata")

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        url = f"http://imagenes.test:{server.server_port}/a.png"
        got = ext.fetch(url, ("image/png",), resolve=lambda host, port: ["127.0.0.1"])  # la comprobación de IP pública se simula; la conexión es real
        assert got == (b"\x89PNGdata", "image/png")
        assert seen["host"] == f"imagenes.test:{server.server_port}" or seen["host"] == "imagenes.test"
        assert seen["agent"] == ext.USER_AGENT
        assert ext.fetch(url, ("image/png",)) is None  # con la comprobación real, 127.0.0.1 nunca se conecta
    finally:
        server.shutdown()


# --- SVG animado: último fotograma ---

def _svg(inner, style=""):
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">'
            + (f"<style>{style}</style>" if style else "") + inner + "</svg>").encode()


def test_smil_animations_end_in_their_last_frame():
    from app.core.svg_freeze import freeze

    out = freeze(_svg(
        '<circle id="a" cx="10" cy="10" r="5" fill="red"><animate attributeName="r" values="5;20;40" dur="2s" repeatCount="indefinite"/>'
        '<animate attributeName="fill" from="red" to="blue" dur="1s"/></circle>'
        '<rect id="b" width="10" height="10" opacity="0"><set attributeName="opacity" to="1" begin="1s"/></rect>'
        '<g id="c"><animateTransform attributeName="transform" type="rotate" values="0 50 50;180 50 50;360 50 50" dur="3s"/><rect width="5" height="5"/></g>'
        '<g id="d" transform="translate(1 1)"><animateTransform attributeName="transform" type="scale" to="2" additive="sum" dur="1s"/></g>'
        '<circle id="e" r="2"><animateMotion path="M0,0 L50,20 l10,10" dur="4s"/></circle>')).decode()
    assert 'r="40"' in out and 'fill="blue"' in out and 'opacity="1"' in out
    assert 'transform="rotate(360 50 50)"' in out and 'transform="translate(1 1) scale(2)"' in out and 'transform="translate(60 30)"' in out
    assert "<animate" not in out and "<set" not in out


def test_motion_path_end_points():
    from app.core.svg_freeze import path_end

    assert path_end("M0,0 L50,20 l10,10") == (60, 30)
    assert path_end("M10 10 H50 V80") == (50, 80)
    assert path_end("M0 0 C10 10 20 20 30 40") == (30, 40)
    assert path_end("M5 5 L20 20 Z") == (5, 5)
    assert path_end("") is None


def test_css_keyframes_end_in_their_last_frame():
    pytest.importorskip("tinycss2")
    pytest.importorskip("cssselect2")
    from app.core.svg_freeze import freeze

    style = (
        "@keyframes draw { from { stroke-dashoffset: 300; opacity: 0 } to { stroke-dashoffset: 0; opacity: 1 } }"
        "@keyframes spin { 0% { transform: rotate(0deg) } 50% { transform: rotate(90deg) } 100% { transform: rotate(180deg) translate(10px, 5px) } }"
        "@keyframes grow { from { r: 5px } to { r: 30px } }"
        ".line { stroke-dasharray: 300; stroke-dashoffset: 300; animation: draw 2s ease-out infinite }"
        "#wheel { animation-name: spin; animation-duration: 3s }"
        ".back { animation: grow 1s reverse }")
    out = freeze(_svg('<path class="line" d="M0 0L50 50"/><g id="wheel"/><circle class="back" r="9"/><circle id="inline" r="1" style="animation: grow 1s"/>', style)).decode()
    assert "stroke-dashoffset:0" in out and "opacity:1" in out and 'transform="rotate(180) translate(10, 5)"' in out
    assert 'r="5px"' in out  # `.back` va en reversa: se queda en el primer fotograma
    assert 'r="30px"' in out  # el de `style=""` termina en `to`


def test_svg_freeze_leaves_static_or_broken_svg_untouched():
    from app.core.svg_freeze import freeze

    plain = _svg('<circle r="5"/>')
    assert freeze(plain) == plain
    assert freeze(b"<svg><not closed") == b"<svg><not closed"
    evil = b'<!DOCTYPE svg [<!ENTITY a "x">]><svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="r" to="1"/></svg>'
    assert freeze(evil) == evil
    assert freeze(b"<html><animate/></html>") == b"<html><animate/></html>"


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


def test_a_pdf_with_an_animated_svg_and_a_web_image_renders_the_final_frame():
    pytest.importorskip("weasyprint")
    pytest.importorskip("nh3")
    import base64

    from weasyprint import HTML

    from app.services.pdf_service import INTERNAL_BASE, _fetcher, build_document

    svg = _svg('<rect width="100" height="100" fill="red"><animate attributeName="fill" values="red;green;blue" dur="2s"/></rect>')
    served = []
    web = {"https://cdn.test/foto.png": (base64.b64decode(PNG.split(",", 1)[1]), "image/png")}
    fetcher = _fetcher(lambda _: None, fetch_external=lambda url, allowed: served.append(url) or web.get(url))
    uri = "data:image/svg+xml;base64," + base64.b64encode(svg).decode()
    assert b'fill="blue"' in fetcher.fetch(uri).read()
    doc = build_document(f'<p>a</p><img src="{uri}"><img src="https://cdn.test/foto.png"><img src="https://cdn.test/falta.png">', pdf_style.resolve({"activo": True}),
                         title="T", frontmatter={}, read_image=lambda _: None, now=NOW)
    pages = HTML(string=doc, base_url=INTERNAL_BASE, url_fetcher=fetcher).render().pages
    assert pages and sorted(set(served)) == ["https://cdn.test/falta.png", "https://cdn.test/foto.png"]


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


def test_the_copy_link_of_a_private_file_prints_through_the_endpoint(ready_admin, monkeypatch):
    pytest.importorskip("nh3")
    import base64

    from app.main import app
    from app.routers.files import get_object_storage
    from app.services import external_image, pdf_service
    from tests.fake_object_storage import FakeObjectStorage

    fake = FakeObjectStorage()
    app.dependency_overrides[get_object_storage] = lambda: fake
    try:
        vault_id = vault_of(ready_admin)
        png = base64.b64decode(PNG.split(",", 1)[1])
        uploaded = ready_admin.post("/files", data={"vault_id": vault_id}, files={"file": ("foto.png", png, "image/png")})
        assert uploaded.status_code == 201, uploaded.text
        file_id = uploaded.json()["id"]
        _template(ready_admin, vault_id, {"activo": True})
        note_id = _doc(ready_admin, vault_id, plantilla="acta")
        monkeypatch.setattr(external_image, "fetch", lambda *a, **k: pytest.fail("un archivo propio no debe salir a internet"))
        seen = {}

        def fake_make_pdf(document, read_image):
            seen["document"], seen["bytes"] = document, read_image(file_id)
            return b"%PDF-fake"

        monkeypatch.setattr(pdf_service, "make_pdf", fake_make_pdf)
        res = ready_admin.post(f"/vaults/{vault_id}/notes/{note_id}/pdf", json={"html": f'<p>x</p><img src="https://synapse.cjhirashi.com/files/{file_id}">'})
        assert res.status_code == 200, res.text
        assert f'src="/files/{file_id}"' in seen["document"] and seen["bytes"] == (png, "image/png")
    finally:
        app.dependency_overrides.pop(get_object_storage, None)
