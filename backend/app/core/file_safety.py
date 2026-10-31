"""Verificación de archivos subidos (H-015/H-016): tipo por contenido y saneo de SVG.

El tipo NUNCA se decide por el `Content-Type` del cliente (C-6): se husmea de los bytes.
El SVG se verifica con el mismo criterio de RNF-003 que `verifySvg` del editor frontend
(sin `script`, `foreignObject`, atributos `on*` ni `href` navegables); si no pasa, se
rechaza antes de guardarlo (C-5). Todo es función pura sobre los bytes: ni red ni estado.

H-016 C-2: `resolve_content_type(data, ext)` valida por FIRMA de bytes (no Content-Type
del cliente) para documentos, rechaza ejecutables y verifica coherencia OOXML/ODF (extensión
vs contenido del zip). Lanza `UnsupportedFileType` o `InvalidSignature` si algo falla.
"""
import io
import json
import re
import zipfile
import xml.etree.ElementTree as ET

# Tipos admitidos (C-1/C-6/C-11). El valor es el `Content-Type` canónico que se guarda y se sirve.
# Imágenes (5 MB limit)
PNG = "image/png"
JPEG = "image/jpeg"
GIF = "image/gif"
WEBP = "image/webp"
SVG = "image/svg+xml"

# Documentos (25 MB limit)
PDF = "application/pdf"
HTML = "text/html"
RTF = "application/rtf"
TEXT = "text/plain"
CSV = "text/csv"
JSON = "application/json"
ZIP = "application/zip"
MARKDOWN = "text/markdown"

# OOXML y ODF (ZIP con estructura interna específica)
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
ODT = "application/vnd.oasis.opendocument.text"
ODS = "application/vnd.oasis.opendocument.spreadsheet"
ODP = "application/vnd.oasis.opendocument.presentation"

# OLE (Word 97-2003, Excel 97-2003, PowerPoint 97-2003)
DOC = "application/msword"
XLS = "application/vnd.ms-excel"
PPT = "application/vnd.ms-powerpoint"

# DOCTYPE/ENTITY se rechazan antes de parsear: cierran XXE y la expansión de entidades
# (billion laughs), que no tienen cabida en un dibujo SVG legítimo.
_DOCTYPE_OR_ENTITY = re.compile(rb"<!\s*(?:DOCTYPE|ENTITY)", re.IGNORECASE)


def sniff_content_type(data: bytes) -> str | None:
    """El `Content-Type` canónico según los bytes, o `None` si el tipo no está admitido."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return PNG
    if data.startswith(b"\xff\xd8\xff"):
        return JPEG
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return GIF
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return WEBP
    if _looks_like_svg(data):
        return SVG
    return None


def _looks_like_svg(data: bytes) -> bool:
    """Husmeo barato: texto UTF-8 que, tras BOM/espacios y una posible declaración XML o
    comentarios, abre un elemento `<svg`. La validez real la decide `is_safe_svg`."""
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return False
    head = text.lstrip("﻿ \t\r\n")
    if not head.startswith("<"):
        return False
    return bool(re.search(r"<svg[\s/>]", head[:4096], re.IGNORECASE))


def is_safe_svg(data: bytes) -> bool:
    """¿El SVG pasa el saneo de RNF-003? (sin `script`, `foreignObject`, `on*`, `href`
    navegable). Un DOCTYPE/ENTITY, un XML mal formado o una raíz que no es `<svg>` → falso."""
    if _DOCTYPE_OR_ENTITY.search(data):
        return False
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        return False
    if _localname(root.tag) != "svg":
        return False
    for element in root.iter():
        if _localname(element.tag) in ("script", "foreignobject"):
            return False
        for name, value in element.attrib.items():
            local = _localname(name)
            if local.startswith("on"):
                return False
            # `href`/`xlink:href` sólo puede apuntar a una referencia interna (`#id`): nada
            # que navegue o cargue de fuera (mismo criterio que `verifySvg`).
            if local == "href" and not value.strip().startswith("#"):
                return False
    return True


def _localname(tag: object) -> str:
    """Nombre local en minúsculas de un `{ns}local` de ElementTree (tags y atributos)."""
    if not isinstance(tag, str):
        return ""
    return tag.rsplit("}", 1)[-1].lower()


# --- H-016 C-2: Validación de documentos por firma de bytes (no Content-Type del cliente) ---

# Ejecutables bloqueados por FIRMA (cualquier extensión): MZ, ELF, Mach-O, #!
_EXECUTABLE_SIGNATURES = [
    b"MZ",              # PE (Windows)
    b"\x7fELF",         # ELF (Linux)
    b"\xfe\xed\xfa\xce", # Mach-O (macOS big-endian)
    b"\xfe\xed\xfa\xcf", # Mach-O (macOS little-endian)
    b"\xce\xfa\xed\xfe", # Mach-O (macOS reverse)
    b"\xcf\xfa\xed\xfe", # Mach-O (macOS reverse little)
    b"#!",              # Script shell / shebang
]

# Extensiones ejecutables bloqueadas (control adicional)
_EXECUTABLE_EXTENSIONS = {
    "exe", "dll", "msi", "bat", "cmd", "com", "scr",
    "sh", "js", "mjs", "jar", "apk", "app", "vbs", "ps1",
}


def resolve_content_type(data: bytes, ext: str) -> str | None:
    """Resuelve el Content-Type por FIRMA de bytes (no Content-Type del cliente).

    Valida que la firma coincida con la extensión (C-2/C-11):
    - Rechaza ejecutables por firma (MZ, ELF, Mach-O, #!) sin importar extensión.
    - Rechaza extensiones ejecutables (exe, dll, ...).
    - Para OOXML/ODF (ZIP), verifica que el contenido interno sea coherente.
    - Para archivos de texto (csv, txt, md, json), verifica que sean UTF-8 decodificables.

    Retorna el Content-Type canónico o None si hay mismatch o tipo no permitido.
    """
    ext_lower = ext.lower().lstrip(".")

    # Rechazar ejecutables por extensión
    if ext_lower in _EXECUTABLE_EXTENSIONS:
        return None

    # Rechazar ejecutables por firma
    for sig in _EXECUTABLE_SIGNATURES:
        if data.startswith(sig):
            return None

    # Imágenes (ya existentes en sniff_content_type)
    if ext_lower in ("png",):
        if data.startswith(b"\x89PNG\r\n\x1a\n"):
            return PNG
        return None
    if ext_lower in ("jpg", "jpeg"):
        if data.startswith(b"\xff\xd8\xff"):
            return JPEG
        return None
    if ext_lower == "gif":
        if data[:6] in (b"GIF87a", b"GIF89a"):
            return GIF
        return None
    if ext_lower == "webp":
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return WEBP
        return None
    if ext_lower == "svg":
        if _looks_like_svg(data):
            return SVG
        return None

    # PDF
    if ext_lower == "pdf":
        if data.startswith(b"%PDF-"):
            return PDF
        return None

    # OLE (doc, xls, ppt)
    if ext_lower == "doc":
        if data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
            return DOC
        return None
    if ext_lower == "xls":
        if data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
            return XLS
        return None
    if ext_lower == "ppt":
        if data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
            return PPT
        return None

    # RTF
    if ext_lower == "rtf":
        if data.startswith(b"{\\rtf"):
            return RTF
        return None

    # HTML
    if ext_lower in ("html", "htm"):
        if _is_valid_text(data):
            return HTML
        return None

    # ZIP (genérico y OOXML/ODF)
    if ext_lower == "zip":
        if data.startswith(b"PK\x03\x04") or data.startswith(b"PK\x05\x06"):
            return ZIP
        return None

    # OOXML (docx, xlsx, pptx): ZIP con estructura interna específica
    if ext_lower == "docx":
        if _is_valid_ooxml_odf(data, "word"):
            return DOCX
        return None
    if ext_lower == "xlsx":
        if _is_valid_ooxml_odf(data, "xl"):
            return XLSX
        return None
    if ext_lower == "pptx":
        if _is_valid_ooxml_odf(data, "ppt"):
            return PPTX
        return None

    # ODF (odt, ods, odp): ZIP con mimetype específico
    if ext_lower == "odt":
        if _is_valid_ooxml_odf(data, "mimetype", expected_mime="application/vnd.oasis.opendocument.text"):
            return ODT
        return None
    if ext_lower == "ods":
        if _is_valid_ooxml_odf(data, "mimetype", expected_mime="application/vnd.oasis.opendocument.spreadsheet"):
            return ODS
        return None
    if ext_lower == "odp":
        if _is_valid_ooxml_odf(data, "mimetype", expected_mime="application/vnd.oasis.opendocument.presentation"):
            return ODP
        return None

    # CSV
    if ext_lower == "csv":
        if _is_valid_text(data):
            return CSV
        return None

    # Texto plano
    if ext_lower == "txt":
        if _is_valid_text(data):
            return TEXT
        return None

    # Markdown
    if ext_lower == "md":
        if _is_valid_text(data):
            return MARKDOWN
        return None

    # JSON
    if ext_lower == "json":
        if _is_valid_json(data):
            return JSON
        return None

    # Extensión no reconocida
    return None


def _is_valid_text(data: bytes) -> bool:
    """¿Los bytes son texto UTF-8 decodificable sin NUL?"""
    try:
        text = data.decode("utf-8")
        # Rechazo bytes NUL (marca de binario, aunque sea válido UTF-8)
        return "\x00" not in text
    except UnicodeDecodeError:
        return False


def _is_valid_json(data: bytes) -> bool:
    """¿Los bytes son JSON válido (UTF-8 decodificable y parseable)?"""
    if not _is_valid_text(data):
        return False
    try:
        json.loads(data.decode("utf-8"))
        return True
    except (json.JSONDecodeError, ValueError):
        return False


def _is_valid_ooxml_odf(data: bytes, required_entry: str, expected_mime: str | None = None) -> bool:
    """¿El ZIP es OOXML/ODF válido?

    - Si required_entry es "word", "xl", "ppt": verifica que el ZIP tenga ese directorio.
    - Si required_entry es "mimetype": lee el archivo y verifica que coincida con expected_mime.
    """
    if not data.startswith(b"PK\x03\x04"):
        return False

    try:
        with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
            files = zf.namelist()

            # ODF usa mimetype como primer archivo (sin compresión, por spec)
            if required_entry == "mimetype":
                if "mimetype" not in files:
                    return False
                mime_data = zf.read("mimetype").decode("utf-8").strip()
                if expected_mime and mime_data != expected_mime:
                    return False
                return True

            # OOXML verifica directorio específico (word/, xl/, ppt/)
            return any(f.startswith(required_entry + "/") for f in files)
    except (zipfile.BadZipFile, KeyError, UnicodeDecodeError):
        return False
