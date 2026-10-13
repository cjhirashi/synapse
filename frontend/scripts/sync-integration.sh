#!/usr/bin/env bash
# Sincronización real (SPEC-0005 RNF-002, RNF-001; PLAN-0005 §5): levanta el backend (uvicorn)
# sobre una base SQLite temporal y el CouchDB de test, ejecuta `vitest.sync.config.ts` contra
# él y lo deja todo como estaba: detiene el backend, borra las bases CouchDB creadas en la
# corrida y el directorio temporal. Los argumentos se pasan a vitest.
#
# Requisitos: el contenedor `synapse-test-couchdb` (o el CouchDB de COUCHDB_URL) en marcha y
# las dependencias del backend instaladas (`pip install -r backend/requirements.txt`).
set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$FRONTEND_DIR/../backend"

export COUCHDB_URL="${COUCHDB_URL:-http://localhost:15984}"
export COUCHDB_USER="${COUCHDB_USER:-admin}"
export COUCHDB_PASSWORD="${COUCHDB_PASSWORD:-testpass}"
export JWT_SECRET="sync-integration-secret-$RANDOM$RANDOM"
export ADMIN_EMAIL="admin-sync@example.com"
export ADMIN_PASSWORD="admin-inicial-1234"

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

# Puerto libre que elige el sistema.
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
export SYNC_BACKEND_URL="http://127.0.0.1:$PORT"

(cd "$BACKEND_DIR" && alembic upgrade head >"$WORK_DIR/alembic.log" 2>&1) || {
  cat "$WORK_DIR/alembic.log" >&2
  exit 1
}
(cd "$BACKEND_DIR" && exec uvicorn app.main:app --host 127.0.0.1 --port "$PORT" --log-level warning) \
  >"$WORK_DIR/uvicorn.log" 2>&1 &
UVICORN_PID=$!

for _ in $(seq 1 100); do
  curl -fsS "$SYNC_BACKEND_URL/health" >/dev/null 2>&1 && break
  if ! kill -0 "$UVICORN_PID" 2>/dev/null; then
    cat "$WORK_DIR/uvicorn.log" >&2
    exit 1
  fi
  sleep 0.1
done
curl -fsS "$SYNC_BACKEND_URL/health" >/dev/null || {
  cat "$WORK_DIR/uvicorn.log" >&2
  exit 1
}

export SYNC_ADMIN_EMAIL="$ADMIN_EMAIL"
export SYNC_ADMIN_PASSWORD="$ADMIN_PASSWORD"
status=0
(cd "$FRONTEND_DIR" && npx vitest run --config vitest.sync.config.ts "$@") || status=$?
if [[ $status -ne 0 ]]; then
  echo "--- log del backend ---" >&2
  cat "$WORK_DIR/uvicorn.log" >&2
fi
exit $status
