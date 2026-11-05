#!/usr/bin/env bash
# Corre la suite del backend en N fragmentos en paralelo: cada uno con su cwd (su test.db de SQLite) y su CouchDB
# (contenedores `synapse-shard-couch-<i>` desechables, puertos 16001+). La suite en serie comparte `./test.db` y el CouchDB de
# pruebas: nunca corras dos `pytest` a la vez sobre ellos (se pisan las tablas). Esta forma tarda ~3 min con 4 fragmentos.
# Uso: backend/scripts/pytest_shards.sh <ruta absoluta de backend> <N> [archivos a excluir...]
# Resultado: /tmp/pyshards/shard-<i>.log (termina con `exit=<código>`) y /tmp/pyshards/DONE. `test_brand_assets` y `test_spa`
# necesitan `frontend/dist`: si el árbol no lo tiene, fallan sin que sea un defecto (se excluye `test_spa.py` por defecto).
set -uo pipefail
BACKEND="$1"; N="${2:-4}"; shift 2 || true
LOGDIR=/tmp/pyshards; rm -rf "$LOGDIR"; mkdir -p "$LOGDIR"
cd "$BACKEND"
FILES=$(ls -S tests/test_*.py | grep -v "test_spa.py")
for x in "$@"; do FILES=$(echo "$FILES" | grep -v "$x"); done
# Reparto voraz por tamaño: cada archivo al fragmento con menos bytes.
python3 - "$N" $FILES > "$LOGDIR/assign.txt" <<'PY'
import os, sys
n = int(sys.argv[1]); files = sys.argv[2:]
buckets = [[0, []] for _ in range(n)]
for f in files:
    b = min(buckets, key=lambda b: b[0]); b[0] += os.path.getsize(f); b[1].append(f)
for i, (_, fs) in enumerate(buckets): print(i + 1, " ".join(fs))
PY
for i in $(seq 1 "$N"); do
  port=$((16000 + i)); name="synapse-shard-couch-$i"
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" -p 127.0.0.1:$port:5984 -e COUCHDB_USER=admin -e COUCHDB_PASSWORD=testpass couchdb:3 >/dev/null
done
for i in $(seq 1 "$N"); do
  port=$((16000 + i)); until curl -fsS "http://localhost:$port" >/dev/null 2>&1; do sleep 1; done
done
for i in $(seq 1 "$N"); do
  files=$(awk -v i="$i" '$1==i {$1=""; print}' "$LOGDIR/assign.txt")
  mkdir -p "/tmp/pyshard-$i"
  ( cd "/tmp/pyshard-$i" && rm -f test.db && PYTHONPATH="$BACKEND" COUCHDB_URL="http://localhost:$((16000 + i))" \
    python3 -m pytest $(for f in $files; do echo "$BACKEND/$f"; done) --rootdir="$BACKEND" -q -p no:cacheprovider -W ignore \
    > "$LOGDIR/shard-$i.log" 2>&1; echo "exit=$?" >> "$LOGDIR/shard-$i.log" ) &
done
wait
for i in $(seq 1 "$N"); do docker rm -f "synapse-shard-couch-$i" >/dev/null 2>&1; done
echo done > "$LOGDIR/DONE"
