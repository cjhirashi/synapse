"""SPEC-0011: construye las variantes del logo (opción B, D-15) desde el original de Carlos.

Uso: build_logo.py <directorio-de-salida>

Escribe `<salida>/logo-synapse-<variante>.raw.svg` (sin optimizar; `build.sh` los pasa por svgo).
Lee dos entradas versionadas junto a este archivo:
  - source/logo-synapse.original.svg  el original de Carlos (nunca se modifica, P-7)
  - palettes.json                     el canon de colores, el mismo que leen los tests (Art. 12)

Estructura del original (rellenos planos, dos capas de tubos):
  - capa TRASERA  #0f3ab5: los tubos de atrás.
  - capa DELANTERA #2643d4: el anillo y los tubos de delante (el primero va dentro de un clipPath).
  - punto terminal #001430 OPACO (alfa 1): se pinta POR ENCIMA del anillo, así que se conserva
    y toma el degradado de la capa trasera.
Se DESCARTAN por redundantes una vez que cada capa es un único degradado continuo:
  - los rectángulos #00e3f8 recortados a los tubos: sólo recoloreaban zonas de la capa delantera;
  - el sombreado #001430 al 35 % de opacidad: el mismo degradado sobre sí mismo no se ve.
Ningún relleno navy ni azul del original sobrevive (RF-013). La geometría (los `d` de cada
path) no se toca: la prueba A-1 mide que la silueta sigue siendo la del original (RF-015).

Variantes:
  dark, light   cabecera y login (una por tema de la app, P-2)
  favicon       UN SVG con las paletas `light` (por defecto) y `favicon-dark` (regla
                `@media (prefers-color-scheme: dark)`), P-3 y R-2
  neutral       sólo para rasterizar los iconos transparentes (ICO y PNG `any`), P-4
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
src = (HERE / "source" / "logo-synapse.original.svg").read_text()
PALETTES = json.loads((HERE / "palettes.json").read_text())

body = src[src.index("</defs>") + 7:]
defs = src[src.index("<defs>") + 6:src.index("</defs>")]


def paths(fill, opacity="1"):
    return re.findall(rf'<path fill="{fill}" d="([^"]*)" fill-opacity="{opacity}"', body)


back = paths("#0f3ab5")      # tubos de atrás
dot = paths("#001430")       # punto terminal opaco: se pinta ENCIMA del anillo delantero
front = paths("#2643d4")
# El primer path delantero va envuelto en el clipPath 1c0233fb92 (un rectángulo): se conserva ese recorte.
clip = re.search(r'<clipPath id="1c0233fb92">(.*?)</clipPath>', defs).group(1)
clipped_front = re.search(r'<g clip-path="url\(#1c0233fb92\)"><path fill="#2643d4" d="([^"]*)"', body).group(1)
front = [d for d in front if d != clipped_front]

# Recorte del viewBox a la silueta medida, x 147..1350 e y 214..1285 (+1 px de holgura): D-7 y RF-011.
X0, Y0, X1, Y1 = 146, 213, 1351, 1286
VB = f"{X0} {Y0} {X1 - X0} {Y1 - Y0}"


def grad(gid, a, b, cls=("", "")):
    """Degradado lineal continuo de la esquina superior izquierda a la inferior derecha (D-15).
    `cls` pone una clase a cada parada para que una regla CSS (favicon oscuro) pueda recolorearlas."""
    stop = lambda off, color, c: f'<stop offset="{off}"{f" class={chr(34)}{c}{chr(34)}" if c else ""} stop-color="{color}"/>'
    return (f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{X0}" y1="{Y0}" '
            f'x2="{X1}" y2="{Y1}">{stop(0, a, cls[0])}{stop(1, b, cls[1])}</linearGradient>')


def logo(defs_gradients, style=""):
    """Mismo dibujo para todas las variantes: sólo cambian los degradados (`#f` delantero, `#b` trasero)."""
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB}">',
           "<defs>", style, *defs_gradients,
           f'<clipPath id="c">{clip.replace(" clip-rule=" + chr(34) + "nonzero" + chr(34), "")}</clipPath>', "</defs>",
           '<g fill="url(#b)">', *[f'<path d="{d}"/>' for d in back], "</g>",
           '<g fill="url(#f)">', f'<path clip-path="url(#c)" d="{clipped_front}"/>',
           *[f'<path d="{d}"/>' for d in front], "</g>",
           *[f'<path fill="url(#b)" d="{d}"/>' for d in dot], "</svg>"]
    return "".join(out)


def solid(name):
    p = PALETTES[name]
    return logo([grad("f", *p["front"]), grad("b", *p["back"])])


def favicon():
    # Paleta clara por defecto (navegadores sin la consulta: barras claras mayoritarias). Las clases
    # `f0 f1 b0 b1` nombran las cuatro paradas; la regla oscura las redefine con `favicon-dark`.
    light, dark = PALETTES["light"], PALETTES["favicon-dark"]
    rule = (f"<style>@media (prefers-color-scheme: dark){{.f0{{stop-color:{dark['front'][0]}}}"
            f".f1{{stop-color:{dark['front'][1]}}}.b0{{stop-color:{dark['back'][0]}}}"
            f".b1{{stop-color:{dark['back'][1]}}}}}</style>")
    return logo([grad("f", *light["front"], cls=("f0", "f1")), grad("b", *light["back"], cls=("b0", "b1"))], style=rule)


VARIANTS = {"dark": lambda: solid("dark"), "light": lambda: solid("light"),
            "favicon": favicon, "neutral": lambda: solid("neutral")}

if __name__ == "__main__":
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, make in VARIANTS.items():
        (out_dir / f"logo-synapse-{name}.raw.svg").write_text(make())
