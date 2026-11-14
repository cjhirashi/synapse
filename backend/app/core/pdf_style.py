"""Formato del PDF de una plantilla (H-036): valores por omisión, hoja de estilos y campos especiales. Reglas puras, sin E/S.

`estilo.pdf` de la plantilla (validado por `plantilla_rules.check_pdf_style`) trae solo lo que la persona cambió; aquí se completa
con los mismos valores por omisión del formulario (`frontend/src/notes/pdfStyle.ts`). El cliente nunca manda estilos: el CSS sale
siempre de la plantilla.
"""
import html
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.plantilla_rules import PDF_MARGINS

CDMX = ZoneInfo("America/Mexico_City")
MONTHS = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
PAGE_SIZES = {"carta": "Letter", "a4": "A4"}
# Hoja en píxeles a 96 ppp (Carta 8,5 x 11 in; A4 210 x 297 mm). La imagen de fondo del encabezado se imprime con el ancho de la hoja elegida
# y la altura proporcional: una imagen de esas medidas la cubre exacta. El formulario de la plantilla muestra las mismas cifras (`pdfStyle.ts`).
PAGE_PX = {"carta": (816, 1056), "a4": (794, 1123)}

DEFAULTS = {
    "activo": False,
    "incluir_atributos": False,
    "pagina": {"tamano": "carta", "margenes_mm": {"superior": 25, "inferior": 20, "izquierdo": 20, "derecho": 20}},
    "encabezados": {"familia": "DejaVu Sans", "tamano_pt": 18, "color": "#111827"},
    "texto": {"familia": "DejaVu Sans", "tamano_pt": 10.5, "color": "#1f2937"},
    "encabezado": {"imagen": None, "izquierda": "", "centro": "", "derecha": ""},
    "pie": {"imagen": None, "izquierda": "", "centro": "", "derecha": ""},
}

_FIELD_RE = re.compile(r"\{\{([^{}]*)\}\}")


def resolve(raw: object) -> dict:
    """`estilo.pdf` guardado + valores por omisión → formato completo."""
    raw = raw if isinstance(raw, dict) else {}
    out: dict = {}
    for key, default in DEFAULTS.items():
        value = raw.get(key)
        if isinstance(default, dict):
            value = value if isinstance(value, dict) else {}
            merged = {}
            for sub, sub_default in default.items():
                sub_value = value.get(sub)
                if isinstance(sub_default, dict):  # pagina.margenes_mm
                    sub_value = sub_value if isinstance(sub_value, dict) else {}
                    merged[sub] = {m: sub_value.get(m, sub_default[m]) for m in PDF_MARGINS}
                else:
                    merged[sub] = sub_default if sub_value is None else sub_value
            out[key] = merged
        else:
            out[key] = value if isinstance(value, bool) else default
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


def stylesheet(style: dict, *, has_header: bool, has_footer: bool, background: str | None = None) -> str:
    """CSS del PDF a partir del formato resuelto. Todos los valores ya pasaron la validación de la plantilla."""
    page, head, body = style["pagina"], style["encabezados"], style["texto"]
    m = page["margenes_mm"]
    h1 = float(head["tamano_pt"])
    base = float(body["tamano_pt"])
    sizes = {"h1": h1, "h2": round(h1 * 0.82, 1), "h3": round(h1 * 0.68, 1)}
    small = round(max(base, h1 * 0.58), 1)
    boxes = []
    if has_header:
        boxes.append("@top-left { content: element(pdfhead); width: 100%; vertical-align: middle; }")
    if has_footer:
        boxes.append("@bottom-left { content: element(pdffoot); width: 100%; vertical-align: middle; }")
    # H-036: la imagen del encabezado es el fondo de la página: esquina superior izquierda de la HOJA, con el ancho de la hoja (alto proporcional), sin repetir.
    # WeasyPrint posiciona el fondo de @page desde el área de contenido (dentro de los márgenes), por eso se compensa con ellos.
    left, top = m["izquierdo"], m["superior"]
    sheet_width = PAGE_PX[page["tamano"]][0]
    bg = (f'background-image: url("{background}"); background-repeat: no-repeat; background-position: -{left}mm -{top}mm; background-size: {sheet_width}px auto; ' if background else "")
    return f"""
@page {{ {bg}size: {PAGE_SIZES[page['tamano']]}; margin: {m['superior']}mm {m['derecho']}mm {m['inferior']}mm {m['izquierdo']}mm; {' '.join(boxes)} }}
html {{ font-family: "{body['familia']}", sans-serif; font-size: {base}pt; color: {body['color']}; line-height: 1.45; }}
h1, h2, h3, h4, h5, h6 {{ font-family: "{head['familia']}", sans-serif; color: {head['color']}; line-height: 1.2; margin: 1.1em 0 0.4em; break-after: avoid; }}
h1 {{ font-size: {sizes['h1']}pt; }} h2 {{ font-size: {sizes['h2']}pt; }} h3 {{ font-size: {sizes['h3']}pt; }}
h4, h5, h6 {{ font-size: {small}pt; }}
p {{ margin: 0 0 0.7em; }} ul, ol {{ margin: 0 0 0.7em; padding-left: 1.6em; }} li {{ margin: 0.15em 0; }}
a {{ color: {head['color']}; }} img {{ max-width: 100%; height: auto; }}
blockquote {{ margin: 0 0 0.7em; padding: 0.2em 0 0.2em 0.9em; border-left: 3pt solid #cbd5e1; color: #475569; }}
pre {{ font-family: "Liberation Mono", monospace; font-size: {round(base * 0.88, 1)}pt; background: #f1f5f9; padding: 0.6em 0.8em; border-radius: 3pt; white-space: pre-wrap; overflow-wrap: anywhere; break-inside: avoid; }}
code {{ font-family: "Liberation Mono", monospace; font-size: 0.92em; background: #f1f5f9; padding: 0 0.2em; border-radius: 2pt; }}
pre code {{ background: none; padding: 0; }}
table {{ border-collapse: collapse; width: 100%; margin: 0 0 0.8em; font-size: {round(base * 0.95, 1)}pt; }}
th, td {{ border: 0.6pt solid #cbd5e1; padding: 0.3em 0.5em; text-align: left; vertical-align: top; }}
th {{ background: #f1f5f9; font-weight: 700; }}
hr {{ border: 0; border-top: 0.6pt solid #cbd5e1; margin: 1em 0; }}
.pdf-embed {{ border: 0.8pt dashed #94a3b8; border-radius: 3pt; padding: 0.5em 0.8em; margin: 0 0 0.8em; break-inside: avoid; }}
.pdf-attrs {{ margin: 0 0 1em; font-size: {round(base * 0.92, 1)}pt; }}
.pdf-attrs th {{ width: 28%; }}
#pdfhead, #pdffoot {{ display: flex; align-items: center; gap: 4mm; font-family: "{body['familia']}", sans-serif; font-size: {round(base * 0.82, 1)}pt; color: #475569; width: 100%; }}
#pdfhead {{ position: running(pdfhead); {'' if background else 'border-bottom: 0.6pt solid #cbd5e1; padding-bottom: 1.5mm;'} }}
#pdffoot {{ position: running(pdffoot); border-top: 0.6pt solid #cbd5e1; padding-top: 1.5mm; }}
.band-text {{ flex: 1; display: flex; }}
.band-text span {{ flex: 1; }}
.band-text .c {{ text-align: center; }} .band-text .r {{ text-align: right; }}
.pn::after {{ content: counter(page); }} .pt::after {{ content: counter(pages); }}
"""
