"""Atributo `style` de los `div`, `span` e `img` del cuerpo de un documento (H-036f): lista cerrada de propiedades y de valores.

Sirve para cajas de color y detalles de maquetación (`<div style="width:120px;height:48px;border-radius:10px;background:#1f9bb8"></div>`). Quedan fuera lo que
carga recursos (`url()`, `image-set`), lo que saca el elemento de su sitio (`position`, `z-index`, negativos), lo que lo oculta (`display:none`) y cualquier función
fuera de la lista. El cliente aplica la misma regla (`frontend/src/editor/htmlStyle.ts`); los dos pasan `tests/fixtures/estilo_html.json`.
"""
import re

PROPERTIES = frozenset({
    "width", "height", "min-width", "min-height", "max-width", "max-height",
    "background", "background-color", "color", "opacity",
    "border", "border-top", "border-right", "border-bottom", "border-left", "border-color", "border-width", "border-style",
    "border-radius", "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "display", "vertical-align", "font-size", "font-weight", "font-style", "text-align", "text-decoration", "line-height",
})
DISPLAYS = frozenset({"block", "inline-block", "inline", "flex"})
FUNCTIONS = frozenset({"rgb", "rgba", "hsl", "hsla", "calc", "min", "max", "clamp", "linear-gradient", "radial-gradient"})
NO_NEGATIVE = re.compile(r"^(width|height|min-|max-|margin|padding)")  # tamaños y espacios: un negativo mueve el elemento sobre otro contenido
MAX_LENGTH = 400
MAX_DECLARATIONS = 20

_VALUE_CHARS = re.compile(r"^[A-Za-z0-9#%.,()+\-*/ ]+$")
_FORBIDDEN = re.compile(r"url\(|image-set|expression|javascript|var\(|attr\(|env\(|/\*", re.IGNORECASE)
_FUNCTION = re.compile(r"([A-Za-z-]+)\(")
_NEGATIVE = re.compile(r"(^|[\s(,])-[\d.]")


def _value_ok(prop: str, value: str) -> bool:
    if not value or not _VALUE_CHARS.match(value) or _FORBIDDEN.search(value):
        return False
    if any(name.lower() not in FUNCTIONS for name in _FUNCTION.findall(value)):
        return False
    if prop == "display":
        return value.lower() in DISPLAYS
    return not (NO_NEGATIVE.match(prop) and _NEGATIVE.search(value))


def clean_style(style: str) -> str:
    """Las declaraciones permitidas de `style`, en su orden y con la forma `propiedad: valor; …`; vacío si no queda ninguna (el atributo se quita)."""
    if len(style) > MAX_LENGTH * 2:
        return ""
    parts = style.split(";")
    if sum(1 for part in parts if part.strip()) > MAX_DECLARATIONS:
        return ""
    kept: list[str] = []
    for part in parts:
        name, sep, raw = part.partition(":")
        prop, value = name.strip().lower(), " ".join(raw.split())
        if sep and prop in PROPERTIES and _value_ok(prop, value):
            kept.append(f"{prop}: {value}")
    result = "; ".join(kept)
    return result if len(result) <= MAX_LENGTH else ""
