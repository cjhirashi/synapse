#!/usr/bin/env bash
# Genera los assets de marca de `frontend/public/` desde el original de Carlos (SPEC-0011; PLAN-0011 §2.5).
# Se ejecuta a mano cuando cambia el logo o las paletas; los resultados se versionan.
#
# Pasos:  1 build_logo.py (SVG sin optimizar)  ->  2 svgo (SVG finales)
#
# Requisitos: python3, `npm ci --prefix frontend/scripts/brand` (svgo 4.0.0).
# Opciones:   --svg-only   sólo los pasos 1-2
set -euo pipefail

BRAND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_DIR="$BRAND_DIR/../../public"
SVGO="$BRAND_DIR/node_modules/.bin/svgo"
SVGO_VERSION="4.0.0"

SVG_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --svg-only) SVG_ONLY=1 ;;
    *) echo "opción desconocida: $arg" >&2; exit 2 ;;
  esac
done

# Versiones fijadas: otra versión de svgo cambia los bytes de los SVG y rompería la reproducibilidad.
[[ -x "$SVGO" ]] || { echo "falta svgo: ejecuta 'npm ci --prefix frontend/scripts/brand'" >&2; exit 1; }
[[ "$("$SVGO" --version)" == "$SVGO_VERSION" ]] || { echo "se necesita svgo $SVGO_VERSION" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 1 · SVG sin optimizar.
python3 "$BRAND_DIR/build_logo.py" "$WORK/raw"

# 2 · svgo -> public/. `neutral` sólo sirve para rasterizar: no se publica.
mkdir -p "$PUBLIC_DIR"
for name in dark light; do
  "$SVGO" --config "$BRAND_DIR/svgo.config.mjs" -i "$WORK/raw/logo-synapse-$name.raw.svg" \
    -o "$PUBLIC_DIR/logo-synapse-$name.svg" >/dev/null
done

[[ "$SVG_ONLY" == "1" ]] && exit 0
