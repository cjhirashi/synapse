#!/usr/bin/env python3
"""H-031: migración de producción. Borra (a la papelera) la lista de notas indicada y crea el INDICE de cada carpeta.

Sin `--apply` sólo informa (en seco). Usa `NoteContentService`, así que respeta las reglas del servidor
(reservas de ruta, protección de INDICE) y deja las mismas revisiones que una edición normal.
"""
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.index_rules import folder_of
from app.services.note_content_service import NoteContentService, _etag


def live_notes(port, db: str) -> dict[str, list[dict]]:
    """Notas vivas por bóveda activa de la base."""
    vaults, after = [], None
    while True:
        page = port.list_page(db, False, 100, after)
        vaults += page
        if len(page) < 100:
            break
        after = (page[-1]["created_at"], page[-1]["_id"])
    out: dict[str, list[dict]] = {}
    for vault in vaults:
        vid = vault["_id"].split(":", 1)[1]
        notes, after = [], None
        while True:
            page = port.list_notes(db, vid, False, 100, after)
            notes += [d for d in page if not d.get("deleted_at")]
            if len(page) < 100:
                break
            after = (page[-1]["created_at"], page[-1]["_id"])
        out[vid] = notes
    return out


def plan(port, db: str, doomed: set[str]) -> tuple[list[dict], dict[str, set[str]]]:
    """(notas a borrar que siguen vivas, carpetas por bóveda que quedarán tras el borrado)."""
    victims, folders = [], defaultdict(set)
    for vid, notes in live_notes(port, db).items():
        for doc in notes:
            if doc["_id"] in doomed:
                victims.append(doc)
            else:
                folders[vid].add(folder_of(doc["path"]))
    return victims, folders


def run(port, db: str, doomed: set[str], apply: bool) -> dict:
    victims, folders = plan(port, db, doomed)
    report = {"a_borrar": len(victims), "ya_ausentes": len(doomed) - len(victims), "rechazados": [], "carpetas": sum(len(f) for f in folders.values())}
    if not apply:
        return report
    service = NoteContentService(port, db)
    for doc in victims:
        vid, nid = doc["_id"].split(":")[1:]
        try:
            service.delete(vid, nid, _etag(doc))
        except Exception as err:  # una nota no borrable no detiene el resto; queda en el informe
            report["rechazados"].append({"id": doc["_id"], "error": repr(err)})
    _, remaining = plan(port, db, set())
    for vid, notes_folders in remaining.items():
        for folder in notes_folders:
            service._ensure_indexes(vid, f"{folder}/x.md" if folder else "x.md")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, help="base de usuario (p. ej. synapse_user_<id>) o copia de ensayo")
    parser.add_argument("--ids", required=True, help="JSON con la lista de _id de notas a borrar")
    parser.add_argument("--apply", action="store_true", help="aplica; sin esto sólo informa")
    args = parser.parse_args()
    from app.adapters.vault_repository import VaultRepository  # import tardío: exige COUCHDB_* sólo al ejecutar

    doomed = set(json.load(open(args.ids)))
    print(json.dumps(run(VaultRepository(), args.db, doomed, args.apply), ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
