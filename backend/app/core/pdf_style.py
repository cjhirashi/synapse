"""Formato del PDF de una plantilla (H-036): valores por omisión, hoja de estilos y campos especiales. Reglas puras, sin E/S.

`estilo.pdf` de la plantilla (validado por `plantilla_rules.check_pdf_style`) trae solo lo que la persona cambió; aquí se completa
con los mismos valores por omisión del formulario (`frontend/src/notes/pdfStyle.ts`). El cliente nunca manda estilos: el CSS sale
siempre de la plantilla.
"""
import html
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from app.core import color_theme
from app.core.plantilla_rules import PDF_MARGINS

CDMX = ZoneInfo("America/Mexico_City")
MONTHS = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
PAGE_SIZES = {"carta": "Letter", "a4": "A4"}
# Hoja en píxeles a 96 ppp (Carta 8,5 x 11 in; A4 210 x 297 mm). La imagen de fondo del encabezado se imprime con el ancho de la hoja elegida
# y la altura proporcional: una imagen de esas medidas la cubre exacta. El formulario de la plantilla muestra las mismas cifras (`pdfStyle.ts`).
PAGE_PX = {"carta": (816, 1056), "a4": (794, 1123)}

BAND_TEXT_COLOR = "#475569"
# Esquinas redondeadas de citas y tablas, como el Markdown del editor (`--radius-sm`, 6 px = 4,5 pt). `border-radius` no se aplica con `border-collapse: collapse`:
# la tabla usa bordes separados, cada celda dibuja solo su borde derecho e inferior, el superior lo pone la primera fila y el izquierdo la primera columna
# (sin líneas dobles) y el redondeo va en las celdas de las cuatro esquinas. Los selectores cubren tablas con o sin `thead`/`tbody`.
RADIUS = "4.5pt"
_FIRST = "table > :first-child > tr:first-child, table > tr:first-child"
_LAST = "table > :last-child > tr:last-child, table > tr:last-child"
TABLE_ROUNDING = "\n".join((
    f"{', '.join(f'{part} > *' for part in _FIRST.split(', '))} {{ border-top-width: 0.6pt; }}",
    "table tr > *:first-child { border-left-width: 0.6pt; }",
    f"{', '.join(f'{part} > *:first-child' for part in _FIRST.split(', '))} {{ border-top-left-radius: {RADIUS}; }}",
    f"{', '.join(f'{part} > *:last-child' for part in _FIRST.split(', '))} {{ border-top-right-radius: {RADIUS}; }}",
    f"{', '.join(f'{part} > *:first-child' for part in _LAST.split(', '))} {{ border-bottom-left-radius: {RADIUS}; }}",
    f"{', '.join(f'{part} > *:last-child' for part in _LAST.split(', '))} {{ border-bottom-right-radius: {RADIUS}; }}",
))
BAND_LINE = {"color": "#cbd5e1", "grosor_pt": 0.6}
# Tamaños de los encabezados H2 a H4 cuando la plantilla solo trae el estilo plano de H1 (formato anterior): proporción de H1; H4 no baja del texto.
HEADING_SCALE = {"h2": 0.82, "h3": 0.68, "h4": 0.58}

DEFAULTS = {
    "activo": False,
    "incluir_atributos": False,
    "pagina": {"tamano": "carta", "margenes_mm": {"superior": 25, "inferior": 20, "izquierdo": 20, "derecho": 20}},
    "texto": {"familia": "DejaVu Sans", "tamano_pt": 10.5, "color": "#1f2937"},
}
H1_DEFAULT = {"familia": "DejaVu Sans", "tamano_pt": 18, "color": "#111827"}

_FIELD_RE = re.compile(r"\{\{([^{}]*)\}\}")


def _merge(raw: object, default: dict) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    return {key: (raw[key] if raw.get(key) is not None else value) for key, value in default.items()}


def _headings(raw: object, body: dict, theme: dict | None) -> dict:
    """Los cuatro niveles. Con la forma plana anterior (`familia`, `tamano_pt`, `color`) esos valores son los de H1 y el resto se deriva de él.

    Con un tema de color (`theme`), el color de cada nivel que la plantilla no fija sale del tema (como el Markdown del editor); un color fijado a mano manda."""
    raw = raw if isinstance(raw, dict) else {}
    h1_raw = raw.get("h1") if isinstance(raw.get("h1"), dict) else {k: raw.get(k) for k in H1_DEFAULT}
    h1 = _merge(h1_raw, {**H1_DEFAULT, **({"color": theme["h1"]} if theme else {})})
    out = {"h1": h1}
    for level, scale in HEADING_SCALE.items():
        derived = round(max(float(body["tamano_pt"]), float(h1["tamano_pt"]) * scale) if level == "h4" else float(h1["tamano_pt"]) * scale, 1)
        out[level] = _merge(raw.get(level), {"familia": h1["familia"], "tamano_pt": derived, "color": theme[level] if theme else h1["color"]})
    return out


def _band(raw: object, body: dict, *, line_on: bool, image: bool) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    out = {slot: raw.get(slot) if isinstance(raw.get(slot), str) else "" for slot in ("izquierda", "centro", "derecha")}
    if image:
        out["imagen"] = raw.get("imagen") if isinstance(raw.get("imagen"), str) else None
    out["fuente"] = _merge(raw.get("fuente"), {"familia": body["familia"], "tamano_pt": round(float(body["tamano_pt"]) * 0.82, 1), "color": BAND_TEXT_COLOR})
    out["linea"] = _merge(raw.get("linea"), {"activa": line_on, **BAND_LINE})
    out["distancia_mm"] = raw["distancia_mm"] if isinstance(raw.get("distancia_mm"), (int, float)) and not isinstance(raw.get("distancia_mm"), bool) else 10
    out["sangria_mm"] = raw["sangria_mm"] if isinstance(raw.get("sangria_mm"), (int, float)) and not isinstance(raw.get("sangria_mm"), bool) else 0
    return out


def resolve(raw: object) -> dict:
    """`estilo.pdf` guardado + valores por omisión → formato completo."""
    raw = raw if isinstance(raw, dict) else {}
    out: dict = {key: (raw[key] if isinstance(raw.get(key), bool) else default) for key, default in DEFAULTS.items() if isinstance(default, bool)}
    page = raw.get("pagina") if isinstance(raw.get("pagina"), dict) else {}
    margins = page.get("margenes_mm") if isinstance(page.get("margenes_mm"), dict) else {}
    default_margins = DEFAULTS["pagina"]["margenes_mm"]
    out["pagina"] = {"tamano": page.get("tamano", DEFAULTS["pagina"]["tamano"]), "margenes_mm": {m: margins.get(m, default_margins[m]) for m in PDF_MARGINS}}
    out["texto"] = _merge(raw.get("texto"), DEFAULTS["texto"])
    tema = raw.get("tema") if isinstance(raw.get("tema"), dict) else {}
    primary = tema.get("primario") if isinstance(tema.get("primario"), str) else None
    out["tema"] = {"primario": primary, "colores": color_theme.palette(primary, out["texto"]["color"]) if primary else None}
    out["encabezados"] = _headings(raw.get("encabezados"), out["texto"], out["tema"]["colores"])
    out["encabezado"] = _band(raw.get("encabezado"), out["texto"], line_on=False, image=True)
    out["pie"] = _band(raw.get("pie"), out["texto"], line_on=True, image=False)
    return out


def format_date(moment: datetime) -> str:
    local = moment.astimezone(CDMX)
    return f"{local.day} {MONTHS[local.month - 1]} {local.year}"


def _plain(value: object) -> str:
    """Valor de un atributo como texto: las listas se unen con comas, los booleanos salen «Sí»/«No» y lo demás vacío si no hay."""
    if value is None or isinstance(value, dict):
        return ""
    if isinstance(value, bool):
        return "Sí" if value else "No"
    if isinstance(value, (list, tuple)):
        return ", ".join(str(item) for item in value)
    return str(value)


def expand_text(text: str, *, title: str, attributes: dict, now: datetime) -> str:
    """Texto de encabezado o pie → HTML seguro: escapa el literal y resuelve los campos especiales.

    `{{pagina}}` y `{{paginas}}` quedan como `<span class="pn">` y `<span class="pt">`: la hoja de estilos les pone el contador de página.
    Un atributo inexistente o vacío se imprime vacío.
    """
    def field(match: re.Match) -> str:
        name = match.group(1)
        if name == "titulo":
            return html.escape(title)
        if name == "fecha":
            return html.escape(format_date(now))
        if name == "pagina":
            return '<span class="pn"></span>'
        if name == "paginas":
            return '<span class="pt"></span>'
        return html.escape(_plain(attributes.get(name.removeprefix("atributo:"))))

    return _FIELD_RE.sub(field, html.escape(text, quote=False))


def _font_css(font: dict) -> str:
    return f'font-family: "{font["familia"]}", sans-serif; font-size: {font["tamano_pt"]}pt; color: {font["color"]};'


def _band_css(prefix: str, band: dict, *, edge: str) -> str:
    """Estilo del encabezado o del pie: fuente propia, sangría lateral y línea (arriba del pie, debajo del encabezado)."""
    line = band["linea"]
    side = "border-bottom" if edge == "top" else "border-top"
    rule = f"{side}: {line['grosor_pt']}pt solid {line['color']}; padding-{'bottom' if edge == 'top' else 'top'}: 1.5mm;" if line["activa"] else ""
    return (f"#{prefix} {{ position: running({prefix}); display: block; box-sizing: border-box; width: 100%; "
            f"padding-left: {band['sangria_mm']}mm; padding-right: {band['sangria_mm']}mm; {_font_css(band['fuente'])} {rule} }}")


def _theme_css(c: dict) -> str:
    """Colores del tema para los elementos del documento (los mismos que el tema claro del Markdown del editor)."""
    return f"""
strong, b {{ color: {c['negrita']}; }}
em, i {{ color: {c['cursiva']}; }}
strong em, em strong, b i, i b {{ color: {c['negrita_cursiva']}; }}
a {{ text-decoration: underline; text-decoration-thickness: 0.5pt; text-underline-offset: 1.5pt; }}
code {{ color: {c['codigo']}; background: {c['codigo_fondo']}; }}
pre {{ background: {c['codigo_fondo']}; }}
pre code {{ color: {c['codigo']}; background: none; }}
li::marker {{ color: {c['marcador']}; }}
blockquote {{ border-left-color: {c['cita']}; background: {c['cita_fondo']}; }}
blockquote blockquote {{ background: transparent; }}
th {{ background: {c['tabla_cabecera_fondo']}; color: {c['tabla_cabecera_texto']}; }}
tr:nth-child(even) > td, tr:nth-child(even) > th {{ background: {c['tabla_fila_par']}; }}
"""


def stylesheet(style: dict, *, has_header: bool, has_footer: bool, background: str | None = None) -> str:
    """CSS del PDF a partir del formato resuelto. Todos los valores ya pasaron la validación de la plantilla."""
    page, heads, body = style["pagina"], style["encabezados"], style["texto"]
    head_band, foot_band = style["encabezado"], style["pie"]
    m = page["margenes_mm"]
    base = float(body["tamano_pt"])
    boxes = []
    # La banda arranca a `distancia_mm` del borde de la hoja: el cuadro del margen se alinea al borde y el desplazamiento es su relleno.
    if has_header:
        boxes.append(f"@top-left {{ content: element(pdfhead); width: 100%; vertical-align: top; padding-top: {head_band['distancia_mm']}mm; }}")
    if has_footer:
        boxes.append(f"@bottom-left {{ content: element(pdffoot); width: 100%; vertical-align: bottom; padding-bottom: {foot_band['distancia_mm']}mm; }}")
    # H-036: la imagen del encabezado es el fondo de la página: esquina superior izquierda de la HOJA, con el ancho de la hoja (alto proporcional), sin repetir.
    # WeasyPrint posiciona el fondo de @page desde el área de contenido (dentro de los márgenes), por eso se compensa con ellos.
    left, top = m["izquierdo"], m["superior"]
    sheet_width = PAGE_PX[page["tamano"]][0]
    bg = (f'background-image: url("{background}"); background-repeat: no-repeat; background-position: -{left}mm -{top}mm; background-size: {sheet_width}px auto; ' if background else "")
    quote_color = color_theme.mix(body["color"], "#ffffff", 72)  # el texto de la cita va más claro que el del cuerpo (el `--text-secondary` del editor)
    heading_css = "\n".join(f"{level} {{ {_font_css(heads[level])} }}" for level in ("h1", "h2", "h3", "h4"))
    theme_css = _theme_css(style["tema"]["colores"]) if style["tema"]["colores"] else ""
    link_color = style["tema"]["colores"]["enlace"] if style["tema"]["colores"] else heads["h1"]["color"]
    return f"""
@page {{ {bg}size: {PAGE_SIZES[page['tamano']]}; margin: {m['superior']}mm {m['derecho']}mm {m['inferior']}mm {m['izquierdo']}mm; {' '.join(boxes)} }}
html {{ font-family: "{body['familia']}", sans-serif; font-size: {base}pt; color: {body['color']}; line-height: 1.45; }}
h1, h2, h3, h4, h5, h6 {{ line-height: 1.2; margin: 1.1em 0 0.4em; break-after: avoid; }}
{heading_css}
h5, h6 {{ {_font_css(heads['h4'])} }}
p {{ margin: 0 0 0.7em; }} ul, ol {{ margin: 0 0 0.7em; padding-left: 1.6em; }} li {{ margin: 0.15em 0; }}
li.note-task {{ list-style: none; margin-left: -1.1em; }}
a {{ color: {link_color}; }} img {{ max-width: 100%; height: auto; }}
blockquote {{ margin: 0 0 0.7em; padding: 0.2em 0.9em 0.2em 0.9em; border-left: 3pt solid #cbd5e1; border-radius: {RADIUS}; color: {quote_color}; font-style: italic; }}
pre {{ font-family: "Liberation Mono", monospace; font-size: {round(base * 0.88, 1)}pt; background: #f1f5f9; padding: 0.6em 0.8em; border-radius: 3pt; white-space: pre-wrap; overflow-wrap: anywhere; break-inside: avoid; }}
code {{ font-family: "Liberation Mono", monospace; font-size: 0.92em; background: #f1f5f9; padding: 0 0.2em; border-radius: 2pt; }}
pre code {{ background: none; padding: 0; }}
table {{ border-collapse: separate; border-spacing: 0; width: 100%; margin: 0 0 0.8em; font-size: {round(base * 0.95, 1)}pt; }}
th, td {{ border: 0.6pt solid #cbd5e1; border-top-width: 0; border-left-width: 0; padding: 0.3em 0.5em; text-align: left; vertical-align: top; }}
th {{ background: #f1f5f9; font-weight: 700; }}
{TABLE_ROUNDING}
hr {{ border: 0; border-top: 0.6pt solid #cbd5e1; margin: 1em 0; }}
.pdf-embed {{ border: 0.8pt dashed #94a3b8; border-radius: 3pt; padding: 0.5em 0.8em; margin: 0 0 0.8em; break-inside: avoid; }}
.pdf-attrs {{ margin: 0 0 1em; font-size: {round(base * 0.92, 1)}pt; }}
.pdf-attrs th {{ width: 28%; }}
{_band_css('pdfhead', head_band, edge='top')}
{_band_css('pdffoot', foot_band, edge='bottom')}
{theme_css}
/* Tres columnas con una tabla: un `display: flex` anidado en el cuadro de margen estira la banda en WeasyPrint y aleja la línea del texto. */
.band-text {{ display: table; table-layout: fixed; width: 100%; }}
.band-text > span {{ display: table-cell; width: 33.333%; vertical-align: middle; }}
.band-text > .c {{ text-align: center; }} .band-text > .r {{ text-align: right; }}
.pn::after {{ content: counter(page); }} .pt::after {{ content: counter(pages); }}
"""
