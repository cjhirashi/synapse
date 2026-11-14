#!/usr/bin/env python3
"""H-054: deja «sin estado» los documentos cuyo `estado` no es uno de los `estados` de su plantilla.

Sin `--apply` solo informa. Con `--apply` quita el `estado` de cada documento (los demás metadatos y el cuerpo no se
tocan), como `system`, y con `--report` guarda lo que había para poder restaurarlo a mano. No toca las carpetas
reservadas (`AG - SKILLS`, `AG - MENSAJES`…), donde el estado tiene lógica propia, ni documentos sin plantilla o
cuya plantilla ya no existe.

Uso (dentro del contenedor):
  python scripts/clear_invalid_estados.py [--apply [--report f.json]] [--email c] [--vault id]
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.adapters.vault_repository import VaultRepository  # noqa: E402
from app.core import ag_rules, plantilla_rules  # noqa: E402
from app.core.agent_access import Actor  # noqa: E402
from app.core.index_rules import is_index_path  # noqa: E402
from app.core.schemas import NoteUpdate  # noqa: E402
from app.services.change_log_service import SYSTEM, ChangeLogService  # noqa: E402
from app.services.note_content_service import NoteContentService  # noqa: E402
from app.services.system_docs_service import _active_vaults, _user_dbs  # noqa: E402


def live_notes(port: VaultRepository, db: str, vault_id: str) -> list[dict]:
    docs, after = [], None
    while True:
        page = port.list_notes(db, vault_id, False, 100, after)
        docs += [d for d in page if not d.get("deleted_at")]
        if len(page) < 100:
            return docs
        after = (page[-1]["created_at"], page[-1]["_id"])


def invalid(notes: list[dict]) -> list[tuple[dict, str, str]]:
    """`(nota, plantilla, estado)` de cada documento con un estado que no figura en su plantilla."""
    templates = {}
    for doc in notes:
        name = plantilla_rules.template_name(doc["path"])
        if name is not None:
            templates[name] = plantilla_rules.estado_names((doc.get("frontmatter") or {}).get("estados"))
    found = []
    for doc in notes:
        fm = doc.get("frontmatter") or {}
        ref, estado = fm.get("plantilla"), fm.get("estado")
        if (ag_rules.meta_folder_of(doc["path"]) is not None or is_index_path(doc["path"])
                or not isinstance(ref, str) or ref not in templates or not isinstance(estado, str) or estado == ""):
            continue
        if estado not in templates[ref]:
            found.append((doc, ref, estado))
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="escribe; sin esto solo informa")
    parser.add_argument("--report", help="con --apply: guarda el informe (con el estado anterior) en este archivo")
    parser.add_argument("--email", help="solo las bóvedas de este usuario")
    parser.add_argument("--vault", help="solo esta bóveda")
    args = parser.parse_args()

    port = VaultRepository()
    report, errors = [], 0
    for user_id, email, db in _user_dbs(args.email):
        contents = NoteContentService(
            port, db, actor=Actor("system"), changelog=ChangeLogService(port, db, user_id, None, via="system", author=SYSTEM))
        for vault in _active_vaults(port, db):
            vault_id = vault["_id"].split(":", 1)[1]
            if args.vault and vault_id != args.vault:
                continue
            for doc, ref, estado in invalid(live_notes(port, db, vault_id)):
                entry = {"user": email, "vault": vault["name"], "vault_id": vault_id, "path": doc["path"],
                         "note_id": doc["_id"].split(":")[2], "plantilla": ref, "estado": estado, "applied": False}
                if args.apply:
                    try:
                        fm = {k: v for k, v in (doc.get("frontmatter") or {}).items() if k != "estado"}
                        contents.update(vault_id, entry["note_id"], NoteUpdate(frontmatter=fm), f'"{doc["_rev"]}"')
                        entry["applied"] = True
                    except Exception as exc:  # noqa: BLE001 - una nota con problemas no frena a las demás
                        entry["error"] = f"{type(exc).__name__}: {exc}"
                        errors += 1
                report.append(entry)
                print(json.dumps(entry, ensure_ascii=False), flush=True)
    if args.report and args.apply:
        Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"# documentos con estado ajeno: {len(report)}; {'quitados' if args.apply else 'por quitar'}: "
          f"{sum(1 for e in report if e['applied']) if args.apply else len(report)}; errores: {errors}", flush=True)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
