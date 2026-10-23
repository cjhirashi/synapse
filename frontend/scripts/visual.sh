#!/usr/bin/env bash
# Verificación visual en Chromium real (SPEC-0009 RF-006, RNF-001; PLAN-0009 §5.2): compila la SPA,
# levanta el backend del worktree (que la sirve, SPEC-0007) sobre una base SQLite temporal y el
# CouchDB de test, corre `npx playwright test` dentro del contenedor oficial de Playwright 1.56.0
# (misma versión que `@playwright/test`: los navegadores ya vienen en la imagen) y lo deja todo como
# estaba: detiene el backend, borra las bases CouchDB creadas y el directorio temporal.
# Los argumentos se pasan a `playwright test` (p. ej. `--grep "V-1|V-2"` o `--list`).
#
# Requisitos: Docker, el CouchDB de test (`synapse-test-couchdb`, o el de COUCHDB_URL) y las
# dependencias del backend instaladas (`pip install -r backend/requirements.txt`).
# Variables: VISUAL_PORT (8010), VISUAL_OUT_DIR (/tmp/s9/e2e), VISUAL_SKIP_BUILD=1 (reutiliza dist/).
set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$FRONTEND_DIR/../backend"
IMAGE="mcr.microsoft.com/playwright:v1.56.0-jammy"
PORT="${VISUAL_PORT:-8010}"
OUT_DIR="${VISUAL_OUT_DIR:-/tmp/s9/e2e}"

export COUCHDB_URL="${COUCHDB_URL:-http://localhost:15984}"
export COUCHDB_USER="${COUCHDB_USER:-admin}"
export COUCHDB_PASSWORD="${COUCHDB_PASSWORD:-testpass}"
export JWT_SECRET="visual-secret-$RANDOM$RANDOM"
export ADMIN_EMAIL="admin-visual@example.com"
export ADMIN_PASSWORD="admin-inicial-1234"
export FRONTEND_DIST="$FRONTEND_DIR/dist"

WORK_DIR="$(mktemp -d)"
export DATABASE_URL="sqlite:///$WORK_DIR/synapse.db"

couch() { curl -fsS -u "$COUCHDB_USER:$COUCHDB_PASSWORD" "$@"; }
user_dbs() { couch "$COUCHDB_URL/_all_dbs" | python3 -c 'import json,sys; print("\n".join(d for d in json.load(sys.stdin) if d.startswith("synapse_user_")))'; }

if ! couch "$COUCHDB_URL/_up" >/dev/null; then
  echo "CouchDB no responde en $COUCHDB_URL (¿está en marcha synapse-test-couchdb?)" >&2
  exit 1
fi
# Las bases de usuario que ya existían no son de esta corrida: no se tocan al limpiar.
DBS_BEFORE="$(user_dbs)"

UVICORN_PID=""
cleanup() {
  if [[ -n "$UVICORN_PID" ]]; then
    kill "$UVICORN_PID" 2>/dev/null || true
    wait "$UVICORN_PID" 2>/dev/null || true
  fi
  for db in $(comm -13 <(echo "$DBS_BEFORE" | sort) <(user_dbs | sort)); do
    couch -X DELETE "$COUCHDB_URL/$db" >/dev/null || true
  done
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

if [[ "${VISUAL_SKIP_BUILD:-0}" != "1" ]]; then
  (cd "$FRONTEND_DIR" && npm run build >"$WORK_DIR/build.log" 2>&1) || {
    cat "$WORK_DIR/build.log" >&2
    exit 1
  }
fi

(cd "$BACKEND_DIR" && alembic upgrade head >"$WORK_DIR/alembic.log" 2>&1) || {
  cat "$WORK_DIR/alembic.log" >&2
  exit 1
}
(cd "$BACKEND_DIR" && exec uvicorn app.main:app --host 127.0.0.1 --port "$PORT" --log-level warning) \
  >"$WORK_DIR/uvicorn.log" 2>&1 &
UVICORN_PID=$!

for _ in $(seq 1 100); do
  curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  if ! kill -0 "$UVICORN_PID" 2>/dev/null; then
    cat "$WORK_DIR/uvicorn.log" >&2
    exit 1
  fi
  sleep 0.1
done
curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null || {
  cat "$WORK_DIR/uvicorn.log" >&2
  exit 1
}

mkdir -p "$OUT_DIR"
status=0
# `--network host`: el contenedor ve el backend en 127.0.0.1; `--ipc=host`: Chromium no se queda
# sin memoria compartida. Corre con el usuario del host para que las capturas no queden de root.
docker run --rm --network host --ipc=host \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -e BASE_URL="http://127.0.0.1:$PORT" \
  -e ADMIN_EMAIL -e ADMIN_PASSWORD -e REGRESS_TAG -e RNF001_P95_MS \
  -e COUCHDB_URL -e COUCHDB_USER -e COUCHDB_PASSWORD \
  -e VISUAL_OUT_DIR="$OUT_DIR" \
  -v "$FRONTEND_DIR:/work" -v "$OUT_DIR:$OUT_DIR" -w /work \
  "$IMAGE" npx playwright test "$@" || status=$?
if [[ $status -ne 0 ]]; then
  echo "--- log del backend ---" >&2
  cat "$WORK_DIR/uvicorn.log" >&2
fi
exit $status
