#!/usr/bin/env python3
"""H-030 E3: crea en cada bóveda existente las carpetas reservadas (INDICE de `AG - SKILLS`, `AG - MENSAJES`,
`AG - AGENTES`, `BITACORA` y `PLANTILLAS`, más el de la raíz si faltara) y la skill de cajón si la bóveda no la tiene
(H-030b: nunca la sobrescribe). Idempotente.

Sin `--apply` solo informa (en seco, solo lectura): por bóveda, los INDICES que crearía y las colisiones con
contenido que ya existe (notas con el nombre de una carpeta reservada, rutas de `AG - MENSAJES` fuera de formato,
notas de `AG - AGENTES` que no son un registro válido).

Uso (dentro del contenedor): python scripts/ensure_ag_folders.py [--apply] [--email correo]
"""
import argparse
import json

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from h030_common import active_vaults, user_dbs

from app.adapters.vault_repository import VaultRepository
from app.core import ag_rules, meta_rules
from app.core.agent_access import parse_registration
from app.core.index_rules import is_index_path
from app.core.note_rules import path_key
from app.services.note_content_service import NoteContentService


def collisions(notes: list[dict]) -> list[str]:
    found = []
    for note in notes:
        path = note["path"]
        if ag_rules.is_reserved_name(path):
            found.append(f"nota con nombre reservado: {path}")
            continue
        zone = ag_rules.meta_folder_of(path)
        if zone == ag_rules.AG_MENSAJES and not is_index_path(path) and ag_rules.parse_mensaje_path(path) is None:
            found.append(f"ruta fuera del formato de AG - MENSAJES: {path}")
        if zone == ag_rules.AG_AGENTES and not is_index_path(path) and parse_registration(path, note.get("frontmatter")) is None:
            found.append(f"nota de AG - AGENTES que no es un registro válido: {path}")
        if zone == ag_rules.PLANTILLAS and (code := meta_rules.check_note_write(
                path=path, frontmatter=note.get("frontmatter"))) is not None:
            found.append(f"nota de PLANTILLAS que no es una plantilla válida ({code}): {path}")
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="escribe; sin esto solo informa")
    parser.add_argument("--email", help="limita a un usuario")
    args = parser.parse_args()
    port = VaultRepository()
    report = []
    for _user_id, email, db in user_dbs(args.email):
        for vault in active_vaults(port, db):
            vault_id = vault["_id"].split(":", 1)[1]
            service = NoteContentService(port, db)
            notes = service._live_paths(vault_id)
            todo = service.ensure_ag_folders(vault_id, dry_run=not args.apply)
            report.append({
                "user": email, "vault": vault["name"], "vault_id": vault_id, "notes": len(notes),
                "indices": todo, "collisions": collisions(notes),
                "applied": args.apply,
            })
    print(json.dumps(report, ensure_ascii=False, indent=2))
    total = sum(len(r["indices"]) for r in report)
    clashes = sum(len(r["collisions"]) for r in report)
    print(f"# bóvedas: {len(report)}; INDICES {'creados' if args.apply else 'por crear'}: {total}; colisiones: {clashes}",
          flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
