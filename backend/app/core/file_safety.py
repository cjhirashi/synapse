"""Verificación de archivos subidos (H-015): tipo por contenido y saneo de SVG.

El tipo NUNCA se decide por el `Content-Type` del cliente (C-6): se husmea de los bytes.
El SVG se verifica con el mismo criterio de RNF-003 que `verifySvg` del editor frontend
(sin `script`, `foreignObject`, atributos `on*` ni `href` navegables); si no pasa, se
rechaza antes de guardarlo (C-5). Todo es función pura sobre los bytes: ni red ni estado.
"""
import re
import xml.etree.ElementTree as ET

# Tipos admitidos (C-1/C-6). El valor es el `Content-Type` canónico que se guarda y se sirve.
PNG = "image/png"
JPEG = "image/jpeg"
GIF = "image/gif"
WEBP = "image/webp"
SVG = "image/svg+xml"

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
