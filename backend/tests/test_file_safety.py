"""Verificación de archivos subidos (H-015 C-5/C-6; H-016 C-2): tipo por contenido y saneo de SVG.

Sin red: son funciones puras sobre los bytes. El tipo se husmea de los bytes, NUNCA del
`Content-Type` del cliente (C-6). El SVG se verifica con el criterio de RNF-003 (C-5).
H-016 amplía la lista de tipos y verifica la firma por categoría (`resolve_content_type`, C-2).
"""
import io
import zipfile

import pytest

from app.core.file_safety import (
    GIF, JPEG, PNG, SVG, WEBP, is_safe_svg, resolve_content_type, sniff_content_type,
    PDF, HTML, RTF, TEXT, CSV, JSON, ZIP, MARKDOWN,
    DOC, DOCX, XLS, XLSX, PPT, PPTX, ODT, ODS, ODP,
)

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 16
GIF_BYTES = b"GIF89a" + b"\x00" * 16
WEBP_BYTES = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 16
SVG_BYTES = b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'

# H-016 C-2: documentos y ejecutables
PDF_BYTES = b"%PDF-1.7\n%test" + b"\x00" * 16
OLE_BYTES = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 16  # doc, xls, ppt
RTF_BYTES = b"{\\rtf1" + b"\x00" * 16
HTML_BYTES = b'<!DOCTYPE html>\n<html><body>test</body></html>'
TEXT_BYTES = b'hello world\n'
UTF8_BYTES = b'Hola mundo\xc3\xa9\n'  # UTF-8 con acentos
CSV_BYTES = b'name,value\ntest,123\n'
JSON_BYTES = b'{"test": "value"}\n'

EXE_BYTES = b"MZ" + b"\x00" * 16  # ejecutable Windows
ELF_BYTES = b"\x7fELF" + b"\x00" * 16  # ejecutable Linux
MACH_BYTES = b"\xfe\xed\xfa\xce" + b"\x00" * 16  # Mach-O (macOS)
SHEBANG_BYTES = b"#!/bin/bash\necho test\n"


def _make_minimal_zip(entry: str = "") -> bytes:
    """Crea un ZIP mínimo (para docx, xlsx, pptx, etc.) con entrada opcional."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        if entry:
            zf.writestr(entry, b"test")
    return buf.getvalue()


def _make_odf_zip(mime: str) -> bytes:
    """Crea un ZIP ODF con mimetype correcto (para odt, ods, odp)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("mimetype", mime)
    return buf.getvalue()


# ZIP mínimo (sin estructura OOXML/ODF)
ZIP_BYTES = _make_minimal_zip()
# ZIP con estructura OOXML
DOCX_BYTES = _make_minimal_zip("word/document.xml")
XLSX_BYTES = _make_minimal_zip("xl/workbook.xml")
PPTX_BYTES = _make_minimal_zip("ppt/presentation.xml")
# ZIP con mimetype ODF
ODT_BYTES = _make_odf_zip("application/vnd.oasis.opendocument.text")
ODS_BYTES = _make_odf_zip("application/vnd.oasis.opendocument.spreadsheet")
ODP_BYTES = _make_odf_zip("application/vnd.oasis.opendocument.presentation")


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


# --- C-2/C-11: resolve_content_type valida por firma de bytes (H-016) ---

@pytest.mark.parametrize(
    "data,ext,expected",
    [
        # Imágenes (ya soportadas)
        (PNG_BYTES, "png", PNG),
        (JPEG_BYTES, "jpg", JPEG),
        (GIF_BYTES, "gif", GIF),
        (WEBP_BYTES, "webp", WEBP),
        (SVG_BYTES, "svg", SVG),
        # PDF
        (PDF_BYTES, "pdf", PDF),
        # Word (OLE y OOXML)
        (OLE_BYTES, "doc", DOC),
        (DOCX_BYTES, "docx", DOCX),
        # Excel (OLE y OOXML)
        (OLE_BYTES, "xls", XLS),
        (XLSX_BYTES, "xlsx", XLSX),
        # PowerPoint (OLE y OOXML)
        (OLE_BYTES, "ppt", PPT),
        (PPTX_BYTES, "pptx", PPTX),
        # ODF
        (ODT_BYTES, "odt", ODT),
        (ODS_BYTES, "ods", ODS),
        (ODP_BYTES, "odp", ODP),
        # RTF
        (RTF_BYTES, "rtf", RTF),
        # CSV / Texto plano
        (CSV_BYTES, "csv", CSV),
        (TEXT_BYTES, "txt", TEXT),
        (TEXT_BYTES, "md", MARKDOWN),
        (JSON_BYTES, "json", JSON),
        # HTML
        (HTML_BYTES, "html", HTML),
        (HTML_BYTES, "htm", HTML),
        # ZIP
        (ZIP_BYTES, "zip", ZIP),
        # UTF-8
        (UTF8_BYTES, "txt", TEXT),
    ],
)
def test_resolve_content_type_recognises_documents(data, ext, expected):
    """C-2/C-11: resolve_content_type valida por firma de bytes y extensión coherente."""
    assert resolve_content_type(data, ext) == expected


@pytest.mark.parametrize(
    "data,ext",
    [
        (EXE_BYTES, "exe"),          # ejecutable Windows
        (EXE_BYTES, "bin"),          # cambiar a otra extensión no ayuda
        (ELF_BYTES, "elf"),          # ejecutable Linux
        (MACH_BYTES, "app"),         # Mach-O (macOS)
        (SHEBANG_BYTES, "sh"),       # script shell
        (SHEBANG_BYTES, "txt"),      # #! es señal, extensión engañosa
        (b"<?php echo 'pwn';", "php"),  # script PHP (no es imagen, texto UTF-8 decodificable)
        (b"<?xml version='1.0'?><root/>", "xml"),  # XML genérico (no SVG, no HTML)
        (PDF_BYTES, "exe"),          # PDF con extensión falsa
        (OLE_BYTES, "html"),         # OLE con extensión falsa
    ],
)
def test_resolve_content_type_rejects_executables_and_mismatches(data, ext):
    """C-2: rechaza ejecutables (cualquier extensión) y tipos que no coinciden con la firma."""
    assert resolve_content_type(data, ext) is None


def test_resolve_content_type_rejects_zip_without_coherent_content():
    """Un .zip sin la estructura interna coherente es rechazado (OOXML/ODF exigen palabra dentro)."""
    assert resolve_content_type(ZIP_BYTES, "docx") is None  # ZIP sin word/ es rechazado


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
