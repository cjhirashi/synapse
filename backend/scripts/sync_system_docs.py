#!/usr/bin/env python3
"""H-041: replica los documentos de sistema (la skill global y `plantilla-skill`, de `app/system_docs/`) en todas
las bóvedas vivas de todos los usuarios, o informa la deriva respecto del repositorio.

Sin `--apply` solo informa (`--check`, solo lectura): por bóveda, qué crearía o actualizaría. Con `--apply` escribe
(actualiza en sitio, conservando el id de la nota) y, con `--report`, guarda lo anterior para revertir. `--revert`
deshace un informe de `--apply`. `--stamp` recalcula las huellas del manifiesto (lo ejecuta quien sube una versión).

Uso (dentro del contenedor):
  python scripts/sync_system_docs.py [--apply [--report f.json] | --revert f.json | --stamp] [--email c] [--vault id]
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.adapters.vault_repository import VaultRepository  # noqa: E402
from app.core import system_docs  # noqa: E402
from app.services.system_docs_service import CREATE, UPDATE, SystemDocsService, _user_dbs, sync_all  # noqa: E402


def revert(port: VaultRepository, report: list[dict], email: str | None) -> list[dict]:
    done = []
    users = {e: (uid, db) for uid, e, db in _user_dbs(email)}
    for entry in report:
        if entry.get("user") not in users or not entry.get("applied"):
            continue
        user_id, db = users[entry["user"]]
        actions = [a for a in entry.get("actions", []) if a["action"] in (CREATE, UPDATE)]
        undone = SystemDocsService(port, db, user_id).revert(entry["vault_id"], actions)
        done.append({"vault": entry["vault"], "vault_id": entry["vault_id"], "reverted": undone})
    return done


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="escribe; sin esto solo informa (deriva)")
    parser.add_argument("--report", help="con --apply: guarda el informe (con lo anterior) en este archivo")
    parser.add_argument("--revert", metavar="INFORME", help="deshace un informe guardado con --apply --report")
    parser.add_argument("--stamp", action="store_true", help="recalcula las huellas del manifiesto")
    parser.add_argument("--email", help="limita a un usuario")
    parser.add_argument("--vault", help="limita a una bóveda (id)")
    args = parser.parse_args()
    if args.stamp:
        changed = system_docs.stamp()
        print(json.dumps({"stamped": changed}, ensure_ascii=False))
        return 0
    port = VaultRepository()
    if args.revert:
        report = json.loads(Path(args.revert).read_text(encoding="utf-8"))
        print(json.dumps(revert(port, report, args.email), ensure_ascii=False, indent=2))
        return 0
    report = sync_all(port, apply=args.apply, only_email=args.email, only_vault=args.vault)
    if args.apply and args.report:
        Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    pending = sum(1 for e in report for a in e.get("actions", []) if a["action"] in (CREATE, UPDATE))
    conflicts = sum(1 for e in report for a in e.get("actions", []) if a["action"] == "conflict")
    errors = sum(1 for e in report if "error" in e)
    print(f"# bóvedas: {len(report)}; documentos {'escritos' if args.apply else 'con deriva'}: {pending}; "
          f"conflictos: {conflicts}; errores: {errors}", flush=True)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
