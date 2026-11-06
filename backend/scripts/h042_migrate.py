#!/usr/bin/env python3
"""H-042: pone al día los datos del buzón `AG - MENSAJES` de todas las bóvedas vivas de todos los usuarios.

Dos cosas, ambas reversibles:

1. La `descripcion` del INDICE de `AG - MENSAJES` pasa del texto de H-030 («una carpeta por destinatario…») al del modelo
   nuevo (una carpeta por conversación). Solo donde sigue siendo el texto original de H-030: una descripción que alguien
   cambió a propósito no se toca.
2. Informa (sin tocar) las notas de `AG - MENSAJES` que no encajan en el formato nuevo: conversaciones con el formato por
   destinatario de H-030, que habría que migrar a mano. Hoy no hay ninguna.

Sin `--apply` solo informa. Con `--apply` escribe (como `sistema`, consta en la BITACORA) y, con `--report`, guarda lo
anterior para revertir. `--revert` deshace un informe de `--apply`.

Uso (dentro del contenedor):
  python scripts/h042_migrate.py [--apply [--report f.json] | --revert f.json] [--email c]
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from h030_common import active_vaults, user_dbs  # noqa: E402

from app.adapters.vault_repository import VaultRepository  # noqa: E402
from app.core import ag_rules, conversation_rules  # noqa: E402
from app.core.agent_access import Actor  # noqa: E402
from app.core.index_rules import is_index_path  # noqa: E402
from app.core.note_prefix import in_folder, view_key  # noqa: E402
from app.core.schemas import NoteUpdate  # noqa: E402
from app.services.change_log_service import SYSTEM, ChangeLogService  # noqa: E402
from app.services.note_content_service import NoteContentService  # noqa: E402

OLD_DESCRIPTION = "Buzón entre agentes: una carpeta por destinatario y conversación, con una nota por mensaje."
NEW_DESCRIPTION = ag_rules.FOLDER_DESCRIPTIONS[ag_rules.AG_MENSAJES]


def _docs(port: VaultRepository, db: str, vault_id: str) -> list[dict]:
    found, after = [], None
    while True:
        page = port.list_notes_by_prefix(db, vault_id, False, view_key(ag_rules.AG_MENSAJES), 100, after)
        found += [d for d in page if in_folder(d["path"], ag_rules.AG_MENSAJES)]
        if len(page) < 100:
            return found
        after = (view_key(page[-1]["path"]), page[-1]["_id"])


def _service(port: VaultRepository, db: str, user_id: str) -> NoteContentService:
    changelog = ChangeLogService(port, db, user_id, None, via="system", author=SYSTEM)
    return NoteContentService(port, db, actor=Actor("system"), changelog=changelog)


def _set_description(port: VaultRepository, db: str, user_id: str, vault_id: str, note_id: str, text: str) -> None:
    contents = _service(port, db, user_id)
    current = contents.get(vault_id, note_id)
    frontmatter = {**current.note.frontmatter, "descripcion": text}
    contents.update(vault_id, note_id, NoteUpdate(frontmatter=frontmatter), current.etag)


def run(port: VaultRepository, apply: bool, email: str | None) -> list[dict]:
    report = []
    for user_id, user_email, db in user_dbs(email):
        for vault in active_vaults(port, db):
            vault_id = vault["_id"].split(":", 1)[1]
            docs = _docs(port, db, vault_id)
            entry = {"user": user_email, "vault": vault["name"], "vault_id": vault_id, "actions": [], "unconforming": []}
            for doc in docs:
                if doc["path"] == f"{ag_rules.AG_MENSAJES}/INDICE.md":
                    old = (doc.get("frontmatter") or {}).get("descripcion")
                    if old == OLD_DESCRIPTION:
                        action = {"note_id": doc["_id"].split(":")[2], "old": old, "new": NEW_DESCRIPTION, "applied": False}
                        if apply:
                            _set_description(port, db, user_id, vault_id, action["note_id"], NEW_DESCRIPTION)
                            action["applied"] = True
                        entry["actions"].append(action)
                elif not is_index_path(doc["path"]) and conversation_rules.parse_mensaje_path(doc["path"]) is None:
                    entry["unconforming"].append(doc["path"])
            report.append(entry)
    return report


def revert(port: VaultRepository, report: list[dict], email: str | None) -> list[dict]:
    users = {e: (uid, db) for uid, e, db in user_dbs(email)}
    done = []
    for entry in report:
        if entry["user"] not in users:
            continue
        user_id, db = users[entry["user"]]
        for action in entry["actions"]:
            if action.get("applied"):
                _set_description(port, db, user_id, entry["vault_id"], action["note_id"], action["old"])
                done.append({"vault": entry["vault"], "note_id": action["note_id"], "restored": action["old"]})
    return done


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="escribe; sin esto solo informa")
    parser.add_argument("--report", help="con --apply: guarda el informe (con lo anterior) en este archivo")
    parser.add_argument("--revert", metavar="INFORME", help="deshace un informe guardado con --apply --report")
    parser.add_argument("--email", help="limita a un usuario")
    args = parser.parse_args()
    port = VaultRepository()
    if args.revert:
        report = json.loads(Path(args.revert).read_text(encoding="utf-8"))
        print(json.dumps(revert(port, report, args.email), ensure_ascii=False, indent=2))
        return 0
    report = run(port, args.apply, args.email)
    if args.apply and args.report:
        Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    pending = sum(len(e["actions"]) for e in report)
    loose = sum(len(e["unconforming"]) for e in report)
    print(f"# bóvedas: {len(report)}; descripciones {'cambiadas' if args.apply else 'por cambiar'}: {pending}; "
          f"notas fuera del formato nuevo: {loose}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
