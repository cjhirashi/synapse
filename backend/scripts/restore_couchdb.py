#!/usr/bin/env python3
"""Restaura en un CouchDB los documentos de los volcados de `backup_semanal.sh` (carpeta `couchdb/` del respaldo descifrado).

Cada archivo `<base>.json` es la respuesta de `_all_docs?include_docs=true`; se crea la base y se insertan sus documentos
con `new_edits=false` (conserva `_id` y `_rev`, igual que la réplica). No borra nada: si la base ya existe y tiene
documentos, se niega salvo con `--force`.

Uso: python3 restore_couchdb.py <carpeta couchdb/> <url de CouchDB> <usuario> <contraseña> [--force]
Ej.: python3 restore_couchdb.py ./couchdb http://localhost:5984 admin '***'
"""
import base64
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--force"]
    force = "--force" in sys.argv
    if len(args) != 4:
        print(__doc__)
        return 2
    folder, url, user, password = Path(args[0]), args[1].rstrip("/"), args[2], args[3]
    auth = "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()

    def call(method: str, path: str, body: object | None = None, ok: tuple[int, ...] = (200, 201, 202)):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(f"{url}/{path}", method=method, data=data,
                                     headers={"Authorization": auth, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as res:
                return res.status, json.load(res)
        except urllib.error.HTTPError as err:
            if err.code in ok:
                return err.code, {}
            raise

    total = 0
    for file in sorted(folder.glob("*.json")):
        db = file.stem
        rows = json.loads(file.read_text(encoding="utf-8"))["rows"]
        status, _ = call("PUT", urllib.parse.quote(db, safe=""), ok=(412,))
        if status == 412:  # ya existía
            _, info = call("GET", urllib.parse.quote(db, safe=""))
            if info["doc_count"] > 0 and not force:
                print(f"{db}: ya existe con {info['doc_count']} documentos; no se toca (usa --force)")
                continue
        docs = [row["doc"] for row in rows]
        _, result = call("POST", f"{urllib.parse.quote(db, safe='')}/_bulk_docs", {"docs": docs, "new_edits": False})
        _, info = call("GET", urllib.parse.quote(db, safe=""))
        if info["doc_count"] != len(rows):
            print(f"{db}: ERROR, esperaba {len(rows)} documentos y quedaron {info['doc_count']}")
            return 1
        total += len(rows)
        print(f"{db}: {len(rows)} documentos")
    print(f"listo: {total} documentos restaurados")
    return 0


if __name__ == "__main__":
    sys.exit(main())
