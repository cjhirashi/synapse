"""Verificación de archivos subidos (H-015 C-5/C-6): tipo por contenido y saneo de SVG.

Sin red: son funciones puras sobre los bytes. El tipo se husmea de los bytes, NUNCA del
`Content-Type` del cliente (C-6). El SVG se verifica con el criterio de RNF-003 (C-5).
"""
import pytest

from app.core.file_safety import GIF, JPEG, PNG, SVG, WEBP, is_safe_svg, sniff_content_type

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 16
GIF_BYTES = b"GIF89a" + b"\x00" * 16
WEBP_BYTES = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 16
SVG_BYTES = b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'


# --- C-6: el tipo se decide por los bytes ---

@pytest.mark.parametrize(
    "data,expected",
    [
        (PNG_BYTES, PNG),
        (JPEG_BYTES, JPEG),
        (GIF_BYTES, GIF),
        (WEBP_BYTES, WEBP),
        (SVG_BYTES, SVG),
        (b"  \n" + SVG_BYTES, SVG),  # SVG con espacios al inicio
        (b'<?xml version="1.0"?>\n' + SVG_BYTES, SVG),  # con declaración XML
    ],
)
def test_sniff_recognises_supported_types(data, expected):
    assert sniff_content_type(data) == expected


@pytest.mark.parametrize(
    "data",
    [
        b"%PDF-1.7\n...",          # PDF
        b"hello world",            # texto plano
        b"\x00\x01\x02\x03",       # binario cualquiera
        b"<html><body>x</body></html>",  # HTML, no es imagen
        b"",                        # vacío
    ],
)
def test_sniff_rejects_unsupported_types(data):
    assert sniff_content_type(data) is None


# --- C-5: saneo de SVG (mismo criterio que verifySvg del editor) ---

def test_safe_svg_accepts_a_plain_drawing():
    assert is_safe_svg(SVG_BYTES) is True


def test_safe_svg_accepts_internal_href():
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><use href="#icon"/></svg>'
    assert is_safe_svg(svg) is True


@pytest.mark.parametrize(
    "svg",
    [
        b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><p>x</p></foreignObject></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x()"/></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
        b'<a xlink:href="https://evil.example">x</a></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)">x</a></svg>',
    ],
)
def test_safe_svg_rejects_hostile_content(svg):
    assert is_safe_svg(svg) is False


def test_safe_svg_rejects_doctype_and_entities():
    # Billion-laughs / XXE: cualquier DOCTYPE o ENTITY se rechaza antes de parsear.
    bomb = (
        b'<?xml version="1.0"?>\n<!DOCTYPE svg [<!ENTITY lol "lol">]>\n'
        b'<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
    )
    assert is_safe_svg(bomb) is False


def test_safe_svg_rejects_non_svg_root_and_malformed():
    assert is_safe_svg(b"<html><body/></html>") is False
    assert is_safe_svg(b"<svg><rect></svg>") is False  # XML mal formado
    assert is_safe_svg(b"not xml at all") is False
