#!/usr/bin/env bash
# Respaldo semanal de Synapse a Google Drive (carpeta «Aira Backups» de la raíz). Se corre en el host, no en el contenedor.
#
# Qué respalda (dos archivos cifrados por corrida, mismo sello de fecha):
#   synapse-db-<AAAAMMDD-HHMM>.tar.zst.gpg     PostgreSQL (pg_dump -Fc) + los documentos de CouchDB de cada usuario (JSON)
#   synapse-files-<AAAAMMDD-HHMM>.tar.zst.gpg  los archivos de MinIO (imágenes, PDF, HTML)
# Conserva los 3 sellos más recientes: al subir el cuarto, borra el más viejo (borrado definitivo, no papelera).
# Cifrado: GPG simétrico AES-256 con la frase de `$BASE/passphrase`. SIN ESA FRASE EL RESPALDO NO SE PUEDE ABRIR: guarda
# una copia fuera de este servidor (gestor de contraseñas). Restaurar: backend/scripts/README.md.
#
# Uso: backup_semanal.sh            (lo ejecuta el crontab del host; escribe su bitácora en $BASE/respaldo.log)
set -euo pipefail
umask 077

BASE=/mnt/disco2/cjhirashi-data/proyectos/synapse/.claude/worktrees/respaldos-semanales
FOLDER_ID=1MLwJsafNNtAlv_wKM_lqck0d7xL3vibU   # «Aira Backups»
ACCOUNT=cjhirashi@gmail.com
KEEP=3
MINIO_DIR=/mnt/disco1/synapse-data/minio
PASSFILE="$BASE/passphrase"
LOG="$BASE/respaldo.log"
STAMP=$(TZ=America/Mexico_City date +%Y%m%d-%H%M)
WORK="$BASE/work-$STAMP"

export PATH="/home/cjhirashi/.local/bin:/usr/local/bin:/usr/bin:/bin"
# El llavero de gog se abre con una variable que ya vive en el .env de OpenClaw; se lee solo esa, no se copia a ningún lado.
GOG_KEYRING_PASSWORD=$(grep -m1 '^GOG_KEYRING_PASSWORD=' /home/cjhirashi/.openclaw/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")
export GOG_KEYRING_PASSWORD

log() { echo "$(TZ=America/Mexico_City date '+%Y-%m-%d %H:%M:%S %Z') $*" >> "$LOG"; }
cleanup() { rm -rf "$WORK"; }
fail() { log "FALLÓ: $1"; exit 1; }
trap 'cleanup' EXIT
trap 'log "FALLÓ en la línea $LINENO"; exit 1' ERR

mkdir -p "$BASE" "$WORK"
[ -s "$PASSFILE" ] || fail "no existe la frase de cifrado $PASSFILE"
log "inicio $STAMP"

# --- 1. PostgreSQL ---
docker exec synapse-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$WORK/postgres.dump"
docker exec -i synapse-postgres pg_restore -l < "$WORK/postgres.dump" > /dev/null || fail "el volcado de PostgreSQL no es legible"

# --- 2. CouchDB: los documentos de cada base de usuario ---
mkdir "$WORK/couchdb"
couch() { docker exec synapse-couchdb sh -c "curl -sf -u \"\$COUCHDB_USER:\$COUCHDB_PASSWORD\" \"http://localhost:5984/$1\""; }
for db in $(couch _all_dbs | python3 -c 'import json,sys; print(" ".join(d for d in json.load(sys.stdin) if d.startswith("synapse_user_")))'); do
  couch "$db/_all_docs?include_docs=true" > "$WORK/couchdb/$db.json"
  expected=$(couch "$db" | python3 -c 'import json,sys; print(json.load(sys.stdin)["doc_count"])')
  python3 - "$WORK/couchdb/$db.json" "$expected" <<'PY' || fail "el volcado de CouchDB $db no coincide con su doc_count"
import json, sys
data = json.load(open(sys.argv[1]))
# `doc_count` no cuenta los borrados; `_all_docs` tampoco los devuelve.
sys.exit(0 if len(data["rows"]) == int(sys.argv[2]) else 1)
PY
done

DB_FILE="$WORK/synapse-db-$STAMP.tar.zst.gpg"
FILES_FILE="$WORK/synapse-files-$STAMP.tar.zst.gpg"
encrypt() { gpg --batch --yes --pinentry-mode loopback --passphrase-file "$PASSFILE" --symmetric --cipher-algo AES256 -o "$1"; }
tar -C "$WORK" -cf - postgres.dump couchdb | zstd -19 -T0 -q | encrypt "$DB_FILE"

# --- 3. Archivos (MinIO) ---
tar -C "$MINIO_DIR" -cf - . | zstd -3 -T0 -q | encrypt "$FILES_FILE"

# --- 4. Subida y verificación (el tamaño en Drive debe ser el local) ---
upload() {
  local path=$1 name size
  name=$(basename "$path"); size=$(stat -c %s "$path")
  gog -a "$ACCOUNT" drive upload "$path" --parent "$FOLDER_ID" > /dev/null
  remote=$(gog -a "$ACCOUNT" drive ls --parent "$FOLDER_ID" --max 200 --json | python3 -c '
import json, sys
name = sys.argv[1]
print(next((f.get("size", "") for f in json.load(sys.stdin)["files"] if f["name"] == name), ""))' "$name")
  [ "$remote" = "$size" ] || fail "Drive tiene $remote bytes de $name y el local $size"
  log "subido $name ($size bytes)"
}
upload "$DB_FILE"
upload "$FILES_FILE"

# --- 5. Retención: solo se llega aquí si la subida se verificó ---
gog -a "$ACCOUNT" drive ls --parent "$FOLDER_ID" --max 200 --json | python3 -c '
import json, re, sys
keep = int(sys.argv[1])
files = [f for f in json.load(sys.stdin)["files"] if re.fullmatch(r"synapse-(db|files)-\d{8}-\d{4}\.tar\.zst\.gpg", f["name"])]
stamps = sorted({re.search(r"\d{8}-\d{4}", f["name"]).group() for f in files}, reverse=True)
old = set(stamps[keep:])
for f in files:
    if re.search(r"\d{8}-\d{4}", f["name"]).group() in old:
        print(f["id"], f["name"])' "$KEEP" | while read -r id name; do
  gog -a "$ACCOUNT" drive delete "$id" --permanent --force > /dev/null
  log "borrado el respaldo antiguo $name"
done

log "OK $STAMP"
