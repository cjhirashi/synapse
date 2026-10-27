#!/usr/bin/env bash
# Genera los assets de marca de `frontend/public/` desde el original de Carlos (SPEC-0011; PLAN-0011 §2.5).
# Se ejecuta a mano cuando cambia el logo o las paletas; los resultados se versionan.
#
# Pasos:  1 build_logo.py (SVG sin optimizar)  ->  2 svgo (SVG finales)
#         3 rasterize.mjs (PNG sin pérdida, Chromium en Docker)  ->  4 pack_icons.py (cuantiza y escribe ICO/PNG)
#
# Requisitos: python3 con Pillow 12.3.0 (`pip install -r frontend/scripts/brand/requirements.txt`), `npm ci --prefix frontend/scripts/brand` (svgo 4.0.0, playwright-core 1.56.0),
#             Docker con la imagen mcr.microsoft.com/playwright:v1.56.0-jammy.
# Opciones:   --svg-only          sólo los pasos 1-2
#             --raster-only       sólo los pasos 1 y 3 (no toca public/)
#             --keep-tmp <dir>    deja los PNG sin pérdida en <dir> en lugar de borrarlos
set -euo pipefail

BRAND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_DIR="$BRAND_DIR/../../public"
SVGO="$BRAND_DIR/node_modules/.bin/svgo"
SVGO_VERSION="4.0.0"
PILLOW_VERSION="12.3.0"

IMAGE="mcr.microsoft.com/playwright:v1.56.0-jammy"
SVG_ONLY=0
RASTER_ONLY=0
KEEP_TMP=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --svg-only) SVG_ONLY=1 ;;
    --raster-only) RASTER_ONLY=1 ;;
    --keep-tmp) KEEP_TMP="$2"; shift ;;
    *) echo "opción desconocida: $1" >&2; exit 2 ;;
  esac
  shift
done

# Versiones fijadas: otra versión de svgo cambia los bytes de los SVG y rompería la reproducibilidad.
[[ -x "$SVGO" ]] || { echo "falta svgo: ejecuta 'npm ci --prefix frontend/scripts/brand'" >&2; exit 1; }
[[ "$("$SVGO" --version)" == "$SVGO_VERSION" ]] || { echo "se necesita svgo $SVGO_VERSION" >&2; exit 1; }

[[ "$(python3 -c 'import PIL; print(PIL.__version__)')" == "$PILLOW_VERSION" ]] \
  || { echo "se necesita Pillow $PILLOW_VERSION: pip install -r frontend/scripts/brand/requirements.txt" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 1 · SVG sin optimizar.
python3 "$BRAND_DIR/build_logo.py" "$WORK/raw"

if [[ "$RASTER_ONLY" != "1" ]]; then
  # 2 · svgo -> public/. `neutral` sólo sirve para rasterizar: no se publica.
  #     La regla @media del favicon debe sobrevivir a la minificación (R-4): la vigila brandAssets.test.ts.
  mkdir -p "$PUBLIC_DIR"
  optimize() { "$SVGO" --config "$BRAND_DIR/svgo.config.mjs" -i "$1" -o "$2" >/dev/null; }
  for name in dark light; do
    optimize "$WORK/raw/logo-synapse-$name.raw.svg" "$PUBLIC_DIR/logo-synapse-$name.svg"
  done
  optimize "$WORK/raw/logo-synapse-favicon.raw.svg" "$PUBLIC_DIR/favicon.svg"
fi

[[ "$SVG_ONLY" == "1" ]] && exit 0

# 3 · PNG sin pérdida con Chromium (contenedor Playwright 1.56.0, mismo que `test:visual`). Corre con el
#     usuario del host para que los archivos no queden de root; el directorio de trabajo es el de la
#     herramienta, donde vive `node_modules/playwright-core`.
RASTER_DIR="${KEEP_TMP:-$WORK/raster}"
mkdir -p "$RASTER_DIR"
docker run --rm --network host --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$BRAND_DIR:/brand" -v "$WORK/raw:/raw:ro" -v "$RASTER_DIR:/out" -w /brand \
  "$IMAGE" node rasterize.mjs /raw /out

# 4 · Cuantización y empaquetado en public/ (no corre con --raster-only).
[[ "$RASTER_ONLY" == "1" ]] && exit 0
python3 "$BRAND_DIR/pack_icons.py" "$RASTER_DIR" "$PUBLIC_DIR"
