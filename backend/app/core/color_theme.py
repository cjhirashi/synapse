"""Tema de color del documento a partir de un color primario (H-036). Reglas puras, sin E/S.

Replica el tema del Markdown de Synapse en el tema claro (`frontend/src/editor/editor.css`, cambio de Carlos 2026-11-04): el secundario es el primario
girado +30° en OKLCH (conserva luminosidad e intensidad) y el terciario el secundario girado +30°; los encabezados usan los tonos 600 y 400 y el
resto de elementos mezclan el secundario o el terciario con el color del texto (`color-mix(in srgb, …)`).

El editor tiene los tonos 600/400 en una tabla fija de Tailwind para sus 17 colores (su color de bóveda es casi siempre el tono 400); para un color
cualquiera se calculan imitando esa tabla: el 400 lleva la luminosidad a 0,72-0,86 y el 600 la baja 0,16 (entre 0,50 y 0,62; un color ya oscuro se
queda como está) y sube la intensidad hasta el 93 % de la que cabe en sRGB a ese tono (tope: ×1,5 la del color, para no volver vivo un color apagado).
Si un color sale del gamut sRGB se reduce la intensidad hasta que quepa. Hay una copia idéntica en
`frontend/src/notes/colorTheme.ts`; ambas pasan los mismos casos de `tests/fixtures/tema_colores.json`.
"""
import math
import re

HEX_RE = re.compile(r"#[0-9a-fA-F]{6}")
HUE_STEP = 30
L600_DROP = 0.16
L600_RANGE = (0.50, 0.62)
L400_RANGE = (0.72, 0.86)
C600_GAMUT_SHARE = 0.93
C600_BOOST_MAX = 1.5
WHITE = "#ffffff"


def _to_linear(channel: int) -> float:
    value = channel / 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def _from_linear(value: float) -> float:
    value = min(1.0, max(0.0, value))
    return 12.92 * value if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055


def hex_to_oklch(color: str) -> tuple[float, float, float]:
    r, g, b = (_to_linear(int(color[i:i + 2], 16)) for i in (1, 3, 5))
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    lightness = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return lightness, math.hypot(a, bb), math.degrees(math.atan2(bb, a)) % 360


def _oklch_to_linear(lightness: float, chroma: float, hue: float) -> tuple[float, float, float]:
    a, b = chroma * math.cos(math.radians(hue)), chroma * math.sin(math.radians(hue))
    l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)


def oklch_to_hex(lightness: float, chroma: float, hue: float) -> str:
    """OKLCH → `#rrggbb`. Fuera del gamut sRGB baja la intensidad (el matiz y la luminosidad se conservan) hasta que quepa."""
    lightness = min(1.0, max(0.0, lightness))
    inside = lambda c: all(-0.0005 <= v <= 1.0005 for v in _oklch_to_linear(lightness, c, hue))  # noqa: E731
    if not inside(chroma):
        low, high = 0.0, chroma
        for _ in range(24):
            mid = (low + high) / 2
            low, high = (mid, high) if inside(mid) else (low, mid)
        chroma = low
    return "#" + "".join(f"{round(_from_linear(v) * 255):02x}" for v in _oklch_to_linear(lightness, chroma, hue))


def rotate(color: str, degrees: float = HUE_STEP) -> str:
    lightness, chroma, hue = hex_to_oklch(color)
    return oklch_to_hex(lightness, chroma, hue + degrees)


def max_chroma(lightness: float, hue: float) -> float:
    """La mayor intensidad que cabe en sRGB con esa luminosidad y ese matiz."""
    low, high = 0.0, 0.5
    for _ in range(24):
        mid = (low + high) / 2
        low, high = (mid, high) if all(-0.0005 <= v <= 1.0005 for v in _oklch_to_linear(lightness, mid, hue)) else (low, mid)
    return low


def tone600(color: str) -> str:
    lightness, chroma, hue = hex_to_oklch(color)
    target = min(lightness, min(L600_RANGE[1], max(L600_RANGE[0], lightness - L600_DROP)))
    if target >= lightness:  # ya es oscuro: se queda como está
        return oklch_to_hex(lightness, chroma, hue)
    return oklch_to_hex(target, min(C600_GAMUT_SHARE * max_chroma(target, hue), chroma * C600_BOOST_MAX), hue)


def tone400(color: str) -> str:
    lightness, chroma, hue = hex_to_oklch(color)
    return oklch_to_hex(min(L400_RANGE[1], max(L400_RANGE[0], lightness)), chroma, hue)


def mix(first: str, second: str, percent_first: float) -> str:
    """`color-mix(in srgb, first percent%, second)`: interpolación en sRGB codificado."""
    weight = percent_first / 100
    return "#" + "".join(
        f"{round(int(first[i:i + 2], 16) * weight + int(second[i:i + 2], 16) * (1 - weight)):02x}" for i in (1, 3, 5))


def palette(primary: str, text: str, background: str = WHITE) -> dict[str, str]:
    """Primario, secundario y terciario con los colores que el tema claro del Markdown asigna a cada elemento del documento."""
    primary, text = primary.lower(), text.lower()
    secondary = rotate(primary)
    tertiary = rotate(secondary)
    primary600, primary400 = tone600(primary), tone400(primary)
    secondary600, secondary400 = rotate(primary600), rotate(primary400)
    return {
        "primario": primary, "secundario": secondary, "terciario": tertiary,
        "primario_600": primary600, "primario_400": primary400, "secundario_600": secondary600, "secundario_400": secondary400,
        "h1": primary600, "h2": secondary600,
        "h3": mix(primary400, text, 60), "h4": mix(secondary400, text, 60),
        "negrita": mix(secondary, text, 85), "cursiva": mix(secondary, text, 40), "negrita_cursiva": mix(secondary, text, 60),
        "enlace": mix(tertiary, text, 65), "codigo": mix(tertiary, text, 45), "codigo_fondo": mix(text, background, 10),
        "marcador": primary600,
        "cita": secondary600, "cita_fondo": mix(secondary600, background, 8),
        "tabla_cabecera_fondo": mix(primary, background, 15), "tabla_cabecera_texto": primary600, "tabla_fila_par": mix(primary, background, 7),
    }
