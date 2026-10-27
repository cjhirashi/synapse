"""SPEC-0011: empaqueta los PNG sin pérdida de `rasterize.mjs` en los iconos de `public/`.

Uso: pack_icons.py <directorio-con-los-PNG> <public/>

  - 180 / 192 / 512 se cuantizan a paleta de 256 colores (FASTOCTREE, sin dithering: determinista).
    Sin pérdida pesarían 20-80 KB y superarían los topes de RNF-001 (P-5). Los opacos (apple-touch
    y maskable) quedan sin canal alfa ni `tRNS` (RF-003, RF-006); los `any` conservan el alfa.
  - `favicon.ico` lleva las tres entradas EXACTAS de 16/32/48 px como PNG, sin cuantizar y sin
    reescalar entre sí (6 KB en total).
"""
import sys
from pathlib import Path

from PIL import Image

src, public = Path(sys.argv[1]), Path(sys.argv[2])
(public / "icons").mkdir(parents=True, exist_ok=True)


def quantized(name: str, opaque: bool) -> Image.Image:
    img = Image.open(src / f"{name}.png")
    if opaque:
        return img.convert("RGB").quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    return img.convert("RGBA").quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)


OUTPUTS = {
    "apple-180": ("apple-touch-icon.png", True),
    "any-192": ("icons/icon-192.png", False),
    "any-512": ("icons/icon-512.png", False),
    "maskable-512": ("icons/icon-maskable-512.png", True),
}
for name, (target, opaque) in OUTPUTS.items():
    quantized(name, opaque).save(public / target, format="PNG", optimize=True)

# ICO: la imagen principal es la de 48 px y las otras dos entran por `append_images` tal cual.
frames = {size: Image.open(src / f"ico-{size}.png").convert("RGBA") for size in (16, 32, 48)}
frames[48].save(
    public / "favicon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
    append_images=[frames[16], frames[32]],
)
