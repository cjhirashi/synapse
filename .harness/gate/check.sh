#!/usr/bin/env bash
# =============================================================================
#  .harness/gate/check.sh — compuerta del arnés SDD Anchored (simplificado)
#  Plantilla genérica. Ver .harness/method.md §6.
#
#  Los servicios y su stack se declaran en  .harness/gate/services.txt
#  (una línea por servicio:  <ruta relativa>:<python|node|mcp>).
#
#  Uso (desde la raíz del repo):
#    .harness/gate/check.sh            Verificación rápida.
#    .harness/gate/check.sh --full     Rápida + suites completas de servicios con cambios.
#    .harness/gate/check.sh --help
#
#  Salida:  0 = compuerta abierta   ·   1 = algún ❌, compuerta cerrada.
# =============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"
H=".harness"

if [ -t 1 ]; then
  RED=$'\033[0;31m'; GRN=$'\033[0;32m'; YLW=$'\033[1;33m'; BLU=$'\033[0;34m'; BLD=$'\033[1m'; NC=$'\033[0m'
else RED=""; GRN=""; YLW=""; BLU=""; BLD=""; NC=""; fi

ERRORS=0; WARNS=0; PASSES=0
ok()   { echo "  ${GRN}✅${NC} $1"; PASSES=$((PASSES+1)); }
warn() { echo "  ${YLW}⚠️ ${NC} $1"; WARNS=$((WARNS+1)); }
err()  { echo "  ${RED}❌${NC} $1"; ERRORS=$((ERRORS+1)); }
skip() { echo "  ${BLU}⏭️ ${NC} $1"; }
sec()  { echo; echo "${BLD}$1${NC}"; }

MODE="fast"
case "${1:-}" in
  --full) MODE="full" ;;
  --help|-h) sed -n '3,17p' "$0" | sed 's/^#\{0,1\} \{0,1\}//'; exit 0 ;;
  "" ) ;;
  * ) echo "Opción desconocida: $1"; exit 2 ;;
esac

echo "${BLD}🔍 Arnés — compuerta (${MODE})${NC}"

fm_value() {  # $1=archivo  $2=clave  →  valor escalar del front-matter
  awk -v k="$2" '
    /^---[[:space:]]*$/ { n++; next }
    n==1 && $0 ~ "^"k":" { sub("^"k":[[:space:]]*",""); sub(/[[:space:]]*#.*$/,""); gsub(/["'\''[:space:]]/,""); print; exit }
  ' "$1"
}
fm_list() {  # $1=archivo  $2=clave de lista  →  ítems (uno por línea)
  awk -v k="$2" '
    /^---[[:space:]]*$/ { n++; next }
    n!=1 { next }
    # La clave puede llevar un comentario YAML detrás (como en la plantilla de spec).
    $0 ~ "^"k":[[:space:]]*(#.*)?$" { inlist=1; next }
    inlist && /^[[:space:]]*-[[:space:]]/ { sub(/^[[:space:]]*-[[:space:]]*/,""); sub(/[[:space:]]+#.*$/,""); gsub(/["'\'']/,""); print; next }
    inlist && /^[^[:space:]-]/ { inlist=0 }
  ' "$1"
}

# =============================================================================
sec "1· Integridad"
for f in "$H/constitution.md" "$H/method.md" "$H/gate/check.sh" "$H/memory/state.md"; do
  [ -f "$f" ] && ok "$f" || err "falta $f"
done
[ -d "$H/specs" ] && ok "$H/specs/" || err "falta $H/specs/"
for t in git python3 node; do
  command -v "$t" >/dev/null 2>&1 && ok "$t $($t --version 2>&1 | head -1)" || warn "no está: $t"
done
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && ok "git — rama $(git rev-parse --abbrev-ref HEAD)" || err "no es repo git"

# =============================================================================
sec "2· Trazabilidad (specs implemented/verified)"
SPECS=$(find "$H/specs" -mindepth 2 -maxdepth 2 -name spec.md 2>/dev/null | grep -v '/_' | sort)
if [ -z "$SPECS" ]; then skip "sin specs todavía"; else
  while IFS= read -r sp; do
    d="$(dirname "$sp")"; name="$(basename "$d")"; st="$(fm_value "$sp" estado)"
    case "$st" in implemented|verified) ;; *) ok "$name ($st) — no exige trazabilidad aún"; continue ;; esac
    tk="$d/tasks.md"; [ -f "$tk" ] || { err "$name en $st sin tasks.md"; continue; }
    # Sólo los RF que la spec define (`- **RF-NNN**`, formato de la plantilla); las
    # referencias a requisitos de otras specs (p. ej. "RF-021 de 0003") no son suyos.
    rf_defs=$(grep -oE '^- \*\*RF-[0-9]+' "$sp" | grep -oE 'RF-[0-9]+' | sort -u)
    rf_spec=$(printf '%s' "$rf_defs" | grep -c . || true)
    # Cubiertos = los RF que la spec define y tienen fila propia en la tabla (primera
    # columna). Un RF ajeno a la spec no tapa uno propio sin cubrir (VD-5).
    rf_cov=$(comm -12 <(printf '%s\n' "$rf_defs") \
      <(grep -oE '^\| *RF-[0-9]+' "$tk" | grep -oE 'RF-[0-9]+' | sort -u) | grep -c . || true)
    pend=$(grep -E '^\| *RF-[0-9]+' "$tk" | grep -Eiv '\| *(Pass|hecho) *\|? *$' | grep -c . || true)
    # Una spec implementada sin ningún RF reconocible no prueba nada: o no define requisitos
    # o no sigue el formato de la plantilla, y en ambos casos la cobertura sería vacía (VC-8).
    if [ "$rf_spec" -eq 0 ]; then err "$name en $st sin ningún RF (\`- **RF-NNN**\`) en spec.md"
    elif [ "$rf_cov" -lt "$rf_spec" ]; then err "$name: $rf_cov/$rf_spec RF en la tabla de cobertura"
    elif [ "$pend" -gt 0 ]; then err "$name: $pend fila(s) de cobertura sin 'Pass'/'hecho'"
    else ok "$name: cobertura completa ($rf_cov RF, 0 pendientes)"; fi
  done <<< "$SPECS"
fi

# =============================================================================
sec "3· Anclaje (drift), documentación y regla de raíz"
if [ -z "$SPECS" ]; then skip "sin specs — nada que anclar"; else
  while IFS= read -r sp; do
    d="$(dirname "$sp")"; name="$(basename "$d")"
    ac="$(fm_value "$sp" anchor_commit)"; am="$(fm_value "$sp" anchor_mode)"; am="${am:-advisory}"
    mapfile -t COV < <(fm_list "$sp" covers)
    [ -n "$ac" ] || { warn "$name: sin anchor_commit"; continue; }
    [ "${#COV[@]}" -gt 0 ] || { warn "$name: sin covers[]"; continue; }
    git cat-file -e "${ac}^{commit}" 2>/dev/null || { warn "$name: anchor_commit '$ac' no existe (¿rebase?) — re-anchora"; continue; }
    spec_touched="$(git diff --name-only "$ac" -- "$d" 2>/dev/null | head -1)"
    changed="$(git diff --name-only "$ac" -- "${COV[@]}" 2>/dev/null)"
    if [ -z "$changed" ]; then ok "$name ($am): sin cambios en covers desde $ac"
    elif [ -n "$spec_touched" ]; then ok "$name ($am): covers y spec cambiaron — ok"
    else
      n=$(echo "$changed" | grep -c .)
      msg="$name: DRIFT — $n archivo(s) de covers cambiaron desde $ac sin tocar la spec → re-anchor"
      [ "$am" = "strict" ] && err "$msg" || warn "$msg"
    fi
  done <<< "$SPECS"
fi
DIFF_ADD="$(git diff -U0 -- . ':(exclude).harness/gate/' 2>/dev/null | grep -E '^\+[^+]' | grep -E '\b(TODO|FIXME|XXX|HACK)\b' | grep -Ev 'RF-[0-9]+|RNF-[0-9]+|ADR-[0-9]+' || true)"
[ -n "$DIFF_ADD" ] && { err "TODO/FIXME sin ticket en los cambios — Art. 10"; echo "$DIFF_ADD" | sed 's/^/      /' | head -6; } \
                   || ok "sin TODO/FIXME sin ticket en los cambios"
SURF="$(git diff --name-only 2>/dev/null | grep -E 'routes/|/api/|openapi|asyncapi|docker-compose|Caddyfile|caddy.json|\.env' || true)"
DOCS_T="$(git diff --name-only 2>/dev/null | grep -E '^docs/|README' || true)"
[ -n "$SURF" ] && [ -z "$DOCS_T" ] && warn "el diff toca superficie observable y ningún doc del mapa — revisa Art. 11" \
                                   || ok "documentación: sin señal de obsolescencia"

# =============================================================================
sec "4· Presupuesto de contexto"
budget() { [ -f "$1" ] || return 0; n=$(wc -l < "$1" | tr -d ' ');
  [ "$n" -le "$2" ] && ok "$1 · $n líneas (≤$2)" || warn "$1 · $n líneas (>$2) — consolida"; }
budget "$H/memory/state.md" 200
budget "$H/memory/history.md" 600
budget "$H/method.md" 400
[ -f AGENTS.md ] && budget AGENTS.md 200

# =============================================================================
sec "5· Bloques por perfil de arquitectura"
SVC_FILE="$H/gate/services.txt"
if [ ! -f "$SVC_FILE" ] || ! grep -qE '^[^#[:space:]]' "$SVC_FILE"; then
  skip "$SVC_FILE vacío — declara los servicios (<ruta>:<python|node|mcp>) para activar este bloque"
else
  CHANGED="$(git diff --name-only 2>/dev/null; git diff --name-only --cached 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null)"
  touched() { echo "$CHANGED" | grep -q "^$1/"; }
  while IFS=: read -r path type; do
    [ -z "$path" ] && continue; case "$path" in \#*) continue ;; esac
    path="$(echo "$path" | xargs)"; type="$(echo "$type" | xargs)"
    [ -d "$path" ] || { warn "servicio declarado ausente: $path"; continue; }
    if [ "$MODE" != "full" ] && ! touched "$path"; then skip "$path · sin cambios — SKIP"; continue; fi
    case "$type" in
      python)
        py=""; for v in venv_test venv .venv venv_run; do
          [ -x "$path/$v/bin/python" ] && "$path/$v/bin/python" -c "import pytest" 2>/dev/null && { py="$v/bin/python"; break; }; done
        if [ -z "$py" ]; then skip "$path · pytest no instalado en su venv — SKIP"; else
          echo "  ${BLU}→${NC} $path · pytest"
          ( cd "$path" && "$py" -m pytest -q -o addopts='' -p no:cacheprovider ) >/tmp/gate_$$.log 2>&1 \
            && ok "$path · tests" || { err "$path · tests FALLAN"; sed 's/^/      /' /tmp/gate_$$.log | tail -25; }
          rm -f /tmp/gate_$$.log
        fi ;;
      node)
        [ -d "$path/node_modules" ] || { skip "$path · sin node_modules — SKIP (npm ci)"; continue; }
        echo "  ${BLU}→${NC} $path · type-check + vitest"
        ( cd "$path" && npm run --silent type-check ) >/tmp/gate_$$.log 2>&1 \
          && ok "$path · type-check" || { err "$path · type-check FALLA"; sed 's/^/      /' /tmp/gate_$$.log | tail -20; }
        ( cd "$path" && npx --yes vitest run --reporter=dot ) >/tmp/gate_$$.log 2>&1 \
          && ok "$path · vitest" || { err "$path · vitest FALLA"; sed 's/^/      /' /tmp/gate_$$.log | tail -25; }
        rm -f /tmp/gate_$$.log ;;
      mcp)
        ok "$path · (recordatorio) valida el JSON Schema de las tools tocadas" ;;
      *) warn "$path · tipo desconocido '$type' (usa python|node|mcp)" ;;
    esac
  done < "$SVC_FILE"
fi
# contrato REST — activo cuando exista un openapi.yaml committeado en algún servicio
OAS="$(git ls-files '*openapi.yaml' 2>/dev/null | head -1)"
if [ -n "$OAS" ] && [ -f "$OAS" ]; then
  if command -v spectral >/dev/null 2>&1; then
    spectral lint "$OAS" >/tmp/gate_$$.log 2>&1 && ok "spectral: $OAS pasa el lint" \
      || { err "spectral: $OAS falla"; sed 's/^/      /' /tmp/gate_$$.log | tail -12; }
    rm -f /tmp/gate_$$.log
  else warn "spectral no instalado — lint de contrato omitido"; fi
else skip "sin openapi.yaml committeado — contrato REST aún no anclado"; fi

# =============================================================================
#  Bloque de proyecto (opcional): checks propios de este repo.
#  Si existe .harness/gate/project.sh, se ejecuta aquí; puede usar ok/warn/err.
# =============================================================================
if [ -f "$H/gate/project.sh" ]; then
  sec "P· Checks de proyecto"
  # shellcheck source=/dev/null
  . "$H/gate/project.sh"
fi

# =============================================================================
sec "Resumen"
echo "  ${GRN}$PASSES ok${NC} · ${YLW}$WARNS warn${NC} · ${RED}$ERRORS error${NC}"
if [ "$ERRORS" -gt 0 ]; then
  echo; echo "${RED}${BLD}⛔ COMPUERTA CERRADA.${NC} Corrige los ❌ y re-ejecuta."
  exit 1
fi
echo; echo "${GRN}${BLD}✅ Compuerta abierta.${NC}"
[ "$WARNS" -gt 0 ] && echo "   ($WARNS aviso(s) — revísalos si tu tarea los toca.)"
exit 0
