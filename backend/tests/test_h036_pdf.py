"""H-036: PDF de documentos — formato por omisión y campos especiales (puros), limpieza del HTML, recursos bloqueados y el endpoint.

Las pruebas que dibujan un PDF necesitan WeasyPrint (Pango), que vive en la imagen del backend: fuera de ella se omiten
(`docker run --network host --entrypoint pytest synapse-backend tests/test_h036_pdf.py`).
"""
from datetime import UTC, datetime

import pytest

from app.core import pdf_style
from app.core.plantilla_rules import PDF_FONTS
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


def test_a_template_saved_with_flat_headings_resolves_the_same_four_levels_as_before():
    style = pdf_style.resolve({"encabezados": {"familia": "Liberation Serif", "tamano_pt": 20, "color": "#0c3897"}, "texto": {"tamano_pt": 10.5}})
    heads = style["encabezados"]
    assert heads["h1"] == {"familia": "Liberation Serif", "tamano_pt": 20, "color": "#0c3897"}
    assert [heads[level]["tamano_pt"] for level in ("h2", "h3", "h4")] == [16.4, 13.6, 11.6]  # 0,82 / 0,68 / 0,58 de H1, como el CSS anterior
    assert {heads[level]["familia"] for level in heads} == {"Liberation Serif"} and {heads[level]["color"] for level in heads} == {"#0c3897"}
    small = pdf_style.resolve({"encabezados": {"tamano_pt": 12}, "texto": {"tamano_pt": 10.5}})["encabezados"]
    assert small["h4"]["tamano_pt"] == 10.5  # H4 nunca baja del tamaño del texto


def test_each_heading_level_can_have_its_own_font_size_and_color():
    style = pdf_style.resolve({"encabezados": {"h1": {"familia": "Liberation Serif", "tamano_pt": 24, "color": "#111111"}, "h3": {"familia": "Liberation Mono", "tamano_pt": 13, "color": "#047857"}}})
    heads = style["encabezados"]
    assert heads["h1"]["tamano_pt"] == 24 and heads["h3"] == {"familia": "Liberation Mono", "tamano_pt": 13, "color": "#047857"}
    assert heads["h2"] == {"familia": "Liberation Serif", "tamano_pt": 19.7, "color": "#111111"}  # el que falta se deriva de H1
    css = pdf_style.stylesheet(style, has_header=False, has_footer=False)
    assert 'h3 { font-family: "Liberation Mono", sans-serif; font-size: 13pt; color: #047857; }' in css
    assert "h5, h6 { " + pdf_style._font_css(heads["h4"]) + " }" in css


def test_the_header_and_footer_have_their_own_font_line_and_position():
    style = pdf_style.resolve({"texto": {"familia": "Liberation Serif", "tamano_pt": 10}})
    head, foot = style["encabezado"], style["pie"]
    assert head["fuente"] == {"familia": "Liberation Serif", "tamano_pt": 8.2, "color": "#475569"}  # por omisión: el texto, a 0,82
    assert head["linea"]["activa"] is False and foot["linea"]["activa"] is True  # el pie conserva la línea que ya tenía
    assert (head["distancia_mm"], head["sangria_mm"], foot["distancia_mm"]) == (10, 0, 10)
    custom = pdf_style.resolve({"encabezado": {"fuente": {"tamano_pt": 14, "color": "#b91c1c"}, "linea": {"activa": True, "color": "#b91c1c", "grosor_pt": 2}, "distancia_mm": 6, "sangria_mm": 12},
                                "pie": {"linea": {"activa": False}, "distancia_mm": 0}})
    css = pdf_style.stylesheet(custom, has_header=True, has_footer=True)
    assert "padding-top: 6mm" in css and "padding-bottom: 0mm" in css  # distancia al borde de la hoja, en el cuadro de margen
    header_rule = css.split("#pdfhead {")[1].split("}")[0]
    assert "font-size: 14pt" in header_rule and "color: #b91c1c" in header_rule and "padding-left: 12mm" in header_rule and "border-bottom: 2pt solid #b91c1c" in header_rule
    assert "border-top" not in css.split("#pdffoot {")[1].split("}")[0]  # línea del pie apagada


# --- Tema de color ---

def test_the_color_theme_is_shared_with_the_client_and_follows_the_markdown_rules():
    import json
    from pathlib import Path

    from app.core import color_theme as ct

    spec = json.loads((Path(__file__).parent / "fixtures" / "tema_colores.json").read_text())
    for item in spec["casos"]:
        assert ct.palette(item["primario"], item["texto"]) == item["esperado"], item["primario"]
    # el secundario es el primario girado +30° y el terciario otros +30° (OKLCH: conservan luminosidad e intensidad)
    for primary in ("#0891b2", "#f99a4b", "#7c3aed"):
        lightness, chroma, hue = ct.hex_to_oklch(primary)
        secondary, tertiary = ct.rotate(primary), ct.rotate(ct.rotate(primary))
        assert abs((ct.hex_to_oklch(secondary)[2] - hue - 30 + 180) % 360 - 180) < 1.5
        assert abs((ct.hex_to_oklch(tertiary)[2] - hue - 60 + 180) % 360 - 180) < 1.5
        assert abs(ct.hex_to_oklch(secondary)[0] - lightness) < 0.02
    assert ct.tone600("#0c3897") == "#0c3897"  # un primario ya oscuro es su propio tono 600
    assert ct.hex_to_oklch(ct.tone600("#facc15"))[0] <= 0.63 and ct.hex_to_oklch(ct.tone400("#0c3897"))[0] >= 0.71
    assert ct.mix("#ff0000", "#0000ff", 60) == "#990066" and ct.mix("#000000", "#ffffff", 10) == "#e6e6e6"


def test_a_template_without_theme_keeps_the_flat_colors_and_one_with_theme_colors_each_element():
    plain = pdf_style.resolve({"encabezados": {"familia": "DejaVu Sans", "tamano_pt": 18, "color": "#111827"}})
    assert plain["tema"] == {"primario": None, "colores": None}
    assert {plain["encabezados"][level]["color"] for level in plain["encabezados"]} == {"#111827"}  # como antes: todos como H1
    themed = pdf_style.resolve({"tema": {"primario": "#0c3897"}, "texto": {"color": "#1f2937"}})
    colors = themed["tema"]["colores"]
    assert [themed["encabezados"][level]["color"] for level in ("h1", "h2", "h3", "h4")] == [colors["h1"], colors["h2"], colors["h3"], colors["h4"]]
    assert len({colors["h1"], colors["h2"], colors["h3"], colors["h4"]}) == 4
    pinned = pdf_style.resolve({"tema": {"primario": "#0c3897"}, "encabezados": {"h2": {"color": "#ff0000"}}})
    assert pinned["encabezados"]["h2"]["color"] == "#ff0000" and pinned["encabezados"]["h1"]["color"] == pinned["tema"]["colores"]["h1"]  # lo fijado a mano manda
    # los colores dependen del texto: cambiarlo cambia los mezclados con él
    assert pdf_style.resolve({"tema": {"primario": "#0c3897"}, "texto": {"color": "#000000"}})["tema"]["colores"]["negrita"] != colors["negrita"]


def test_the_stylesheet_paints_every_element_with_the_theme_only_when_there_is_one():
    style = pdf_style.resolve({"tema": {"primario": "#0c3897"}, "texto": {"color": "#1f2937"}})
    c = style["tema"]["colores"]
    css = pdf_style.stylesheet(style, has_header=False, has_footer=False)
    for expected in (
        f"strong, b {{ color: {c['negrita']}; }}", f"em, i {{ color: {c['cursiva']}; }}", f"a {{ color: {c['enlace']}; }}",
        f"code {{ color: {c['codigo']}; background: {c['codigo_fondo']}; }}", f"li::marker {{ color: {c['marcador']}; }}",
        f"th {{ background: {c['tabla_cabecera_fondo']}; color: {c['tabla_cabecera_texto']}; }}", f"border-left-color: {c['cita']}",
        f"tr:nth-child(even) > td, tr:nth-child(even) > th {{ background: {c['tabla_fila_par']}; }}",
    ):
        assert expected in css, expected
    legacy = pdf_style.stylesheet(pdf_style.resolve({}), has_header=False, has_footer=False)
    assert "li::marker" not in legacy and "strong, b {" not in legacy  # sin tema el CSS es el de siempre


def test_quotes_and_tables_have_rounded_corners_like_the_markdown():
    css = pdf_style.stylesheet(pdf_style.resolve({}), has_header=False, has_footer=False)
    assert "border-radius: 4.5pt" in css.split("blockquote {")[1].split("}")[0]  # la cita (6 px del editor)
    assert "border-collapse: separate" in css and "border-spacing: 0" in css and "border-collapse: collapse" not in css  # el redondeo no se aplica con collapse
    for corner in ("top-left", "top-right", "bottom-left", "bottom-right"):
        assert f"border-{corner}-radius: 4.5pt" in css, corner
    themed = pdf_style.stylesheet(pdf_style.resolve({"tema": {"primario": "#0c3897"}}), has_header=False, has_footer=False)
    assert "blockquote blockquote { background: transparent; }" in themed


def test_task_items_have_no_bullet_because_their_box_is_text():
    css = pdf_style.stylesheet(pdf_style.resolve({}), has_header=False, has_footer=False)
    assert "li.note-task { list-style: none;" in css


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
    assert 'id="pdfhead"' in doc and 'id="pdffoot"' in doc
    css = doc.split("<style>")[1].split("</style>")[0]
    assert 'background-image: url("data:image/png;base64,' in css and "background-repeat: no-repeat" in css and "background-size: 816px auto" in css
    assert "background-position: -20mm -25mm" in css  # compensa los márgenes: arranca en la esquina de la hoja
    assert "<img" not in doc.split("<article>")[0]  # la imagen no es una miniatura dentro de la banda
    assert "Acta" in doc and "Acme" in doc and "13 nov 2026" in doc and 'class="pn"' in doc
    assert "<h2>Hola</h2>" in doc and "<script" not in doc
    assert "<th>Cliente</th>" in doc and "<th>Etiquetas</th>" in doc and "plantilla" not in doc.split("<article>")[0].split("<body>")[1]
    bare = build_document("<p>x</p>", pdf_style.resolve({"activo": True}), title="T", frontmatter={}, read_image=lambda _: None, now=NOW)
    assert "pdfhead" not in bare.split("<body>")[1] and "@top-left" not in bare


def test_the_header_image_is_the_page_background_as_wide_as_the_sheet_with_proportional_height():
    pytest.importorskip("weasyprint")
    pytest.importorskip("nh3")
    import struct, zlib

    from weasyprint import HTML

    from app.services.pdf_service import INTERNAL_BASE, _fetcher, build_document

    def solid_png(width, height):
        raw = b"".join(b"\x00" + b"\xdc\x26\x26" * width for _ in range(height))
        def chunk(kind, data):
            return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

    # (hoja, px de la imagen, ancho y alto con que se imprime): ancho de la hoja (Carta 816, A4 794), alto proporcional
    for sheet, (width, height), expected in (
        ("carta", (1080, 1350), (816, 1020)), ("carta", (816, 1056), (816, 1056)), ("carta", (408, 100), (816, 200)),
        ("a4", (1080, 1350), (794, 992.5)), ("a4", (794, 1123), (794, 1123)), ("a4", (397, 100), (794, 200)),
    ):
        style = pdf_style.resolve({"activo": True, "pagina": {"tamano": sheet}, "encabezado": {"imagen": "bg"}})
        image = (solid_png(width, height), "image/png")
        doc = build_document("<p>x</p>" * 3, style, title="T", frontmatter={}, read_image=lambda i: image if i == "bg" else None, now=NOW)
        rendered = HTML(string=doc, base_url=INTERNAL_BASE, url_fetcher=_fetcher(lambda _: None)).render()
        layer = rendered.pages[0]._page_box.background.layers[0]
        assert len(rendered.pages) == 1
        assert layer.size == (pytest.approx(expected[0]), pytest.approx(expected[1], abs=1)), (sheet, width, height, layer.size)
    bare = build_document("<p>x</p>", pdf_style.resolve({"activo": True}), title="T", frontmatter={}, read_image=lambda _: None, now=NOW)
    assert "background-image" not in bare


def test_the_footer_never_carries_an_image():
    pytest.importorskip("nh3")
    from app.services.pdf_service import build_document

    style = pdf_style.resolve({"activo": True, "pie": {"izquierda": "{{fecha}}"}})
    style["pie"]["imagen"] = "algo"  # aunque una plantilla vieja la trajera, no se imprime
    doc = build_document("<p>x</p>", style, title="T", frontmatter={}, read_image=lambda _: (b"\x89PNG", "image/png"), now=NOW)
    assert 'id="pdffoot"' in doc and "<img" not in doc.split("<article>")[0] and "background-image" not in doc


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


def test_the_band_sits_at_the_chosen_distance_from_the_edge_and_is_not_stretched_to_the_margin():
    pytest.importorskip("weasyprint")
    pytest.importorskip("nh3")
    from weasyprint import HTML

    from app.services.pdf_service import INTERNAL_BASE, _fetcher, build_document

    style = pdf_style.resolve({
        "activo": True, "pagina": {"tamano": "a4"},
        "encabezado": {"izquierda": "{{titulo}}", "derecha": "X", "distancia_mm": 6, "sangria_mm": 10, "linea": {"activa": True, "color": "#ff0000", "grosor_pt": 2}},
        "pie": {"izquierda": "{{fecha}}", "derecha": "Página {{pagina}} de {{paginas}}", "distancia_mm": 4, "linea": {"activa": True}}})
    doc = build_document("<p>cuerpo</p>", style, title="T", frontmatter={}, read_image=lambda _: None, now=NOW)
    page = HTML(string=doc, base_url=INTERNAL_BASE, url_fetcher=_fetcher(lambda _: None)).render().pages[0]

    def find(box, wanted):
        if getattr(getattr(box, "element", None), "get", lambda *_: None)("id") == wanted:
            return box
        for child in getattr(box, "children", ()) or ():
            if (hit := find(child, wanted)) is not None:
                return hit
        return None

    px = lambda mm: mm * 96 / 25.4  # noqa: E731
    head, foot = find(page._page_box, "pdfhead"), find(page._page_box, "pdffoot")
    assert head.position_y == pytest.approx(px(6), abs=1) and head.border_height() < px(14)  # a 6 mm del borde y de la altura de su texto, no del margen entero (25 mm)
    assert head.padding_left == pytest.approx(px(10), abs=1)
    assert page.height - (foot.position_y + foot.border_height()) == pytest.approx(px(4), abs=1) and foot.border_height() < px(14)


def test_a_themed_pdf_renders_with_the_derived_colors():
    pytest.importorskip("weasyprint")
    pytest.importorskip("nh3")
    from weasyprint import HTML

    from app.services.pdf_service import INTERNAL_BASE, _fetcher, build_document

    style = pdf_style.resolve({"activo": True, "tema": {"primario": "#0c3897"}})
    body = "<h1>Uno</h1><h2>Dos</h2><p><strong>negrita</strong> <em>cursiva</em> <a href=\"https://x.test\">enlace</a> <code>código</code></p><ul><li>punto</li></ul><table><tr><th>A</th></tr><tr><td>b</td></tr></table>"
    doc = build_document(body, style, title="T", frontmatter={}, read_image=lambda _: None, now=NOW)
    page = HTML(string=doc, base_url=INTERNAL_BASE, url_fetcher=_fetcher(lambda _: None)).render().pages[0]

    def colors(box, out):
        element = getattr(box, "element", None)
        if element is not None and getattr(box, "style", None) is not None and element.tag in ("h1", "h2", "strong", "em", "a", "code", "th"):
            r, g, b, _alpha = tuple(box.style["color"])  # tinycss2 Color: canales 0-1
            out[element.tag] = "#" + "".join(f"{round(v * 255):02x}" for v in (r, g, b))
        for child in getattr(box, "children", ()) or ():
            colors(child, out)
        return out

    got = colors(page._page_box, {})
    expected = style["tema"]["colores"]
    assert got["h1"] == expected["h1"] and got["h2"] == expected["h2"]
    assert got["strong"] == expected["negrita"] and got["em"] == expected["cursiva"] and got["a"] == expected["enlace"] and got["code"] == expected["codigo"]
    assert got["th"] == expected["tabla_cabecera_texto"]


def test_only_the_four_corner_cells_of_a_table_are_rounded_and_the_borders_do_not_double():
    pytest.importorskip("weasyprint")
    pytest.importorskip("nh3")
    from weasyprint import HTML

    from app.services.pdf_service import INTERNAL_BASE, _fetcher, build_document

    def cells(box, out):
        element = getattr(box, "element", None)
        if element is not None and element.tag in ("td", "th") and type(box).__name__ == "TableCellBox":  # el texto de la celda comparte el elemento pero no el estilo
            out.append(box)
        for child in getattr(box, "children", ()) or ():
            cells(child, out)
        return out

    def radii(body):
        doc = build_document(body, pdf_style.resolve({"activo": True}), title="T", frontmatter={}, read_image=lambda _: None, now=NOW)
        page = HTML(string=doc, base_url=INTERNAL_BASE, url_fetcher=_fetcher(lambda _: None)).render().pages[0]
        found = {}
        for box in cells(page._page_box, []):
            key = (box.element.text or "").strip()
            style = box.style
            found[key] = (
                [bool(style[f"border_{c}_radius"][0].value) for c in ("top_left", "top_right", "bottom_left", "bottom_right")],
                (style["border_top_width"], style["border_left_width"], style["border_bottom_width"], style["border_right_width"]),
            )
        return found

    plain = radii("<table><tr><th>a1</th><th>a2</th><th>a3</th></tr><tr><td>b1</td><td>b2</td><td>b3</td></tr><tr><td>c1</td><td>c2</td><td>c3</td></tr></table>")
    assert plain["a1"][0] == [True, False, False, False] and plain["a3"][0] == [False, True, False, False]
    assert plain["c1"][0] == [False, False, True, False] and plain["c3"][0] == [False, False, False, True]
    assert plain["b2"][0] == [False, False, False, False] and plain["a2"][0] == [False, False, False, False]
    assert plain["a1"][1][0] > 0 and plain["b1"][1][0] == 0 and plain["b2"][1][1] == 0 and plain["b1"][1][1] > 0  # borde superior solo en la 1.ª fila, izquierdo solo en la 1.ª columna
    # con `thead` y `tbody` (HTML escrito a mano) las esquinas siguen siendo las cuatro del conjunto y no hay línea doble entre ambos
    split = radii("<table><thead><tr><th>h1</th><th>h2</th></tr></thead><tbody><tr><td>x1</td><td>x2</td></tr><tr><td>y1</td><td>y2</td></tr></tbody></table>")
    assert split["h1"][0] == [True, False, False, False] and split["h2"][0] == [False, True, False, False]
    assert split["y1"][0] == [False, False, True, False] and split["y2"][0] == [False, False, False, True] and split["x1"][0] == [False, False, False, False]
    assert split["x1"][1][0] == 0  # la primera fila de tbody no repite el borde superior


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


@pytest.mark.parametrize("family", PDF_FONTS)
def test_every_listed_font_has_a_real_italic_in_the_image(family):
    """Sin la variante cursiva instalada, el PDF imprime el `<em>` en recto (DejaVu Sans y Serif la traen en `fonts-dejavu-extra`)."""
    import shutil
    import subprocess
    if shutil.which("fc-match") is None:
        pytest.skip("fontconfig solo está en la imagen del backend")
    for weight in ("", ":bold"):
        out = subprocess.run(["fc-match", "-f", "%{style}|%{file}", f"{family}:italic{weight}"], capture_output=True, text=True, check=True).stdout
        style = out.split("|")[0].lower()
        assert "italic" in style or "oblique" in style, f"{family}{weight}: sin cursiva real ({out})"
