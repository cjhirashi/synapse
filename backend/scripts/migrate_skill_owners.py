#!/usr/bin/env python3
"""Propietarios de las skills en lista: migra `propietario` de texto a lista de un elemento en todas las bóvedas vivas
de todos los usuarios y, con `--coowner`, añade copropietarios a las skills de un propietario en una bóveda.

Sin `--apply` solo informa (solo lectura). Con `--apply` escribe como `Actor("system")` por `NoteContentService`
(deja constancia en la BITACORA con autor `sistema`, no toca `version`, contenido ni `estado`) y es idempotente.

Uso (dentro del contenedor):
  python scripts/migrate_skill_owners.py [--apply] [--email c] [--vault id] [--coowner VAULT_ID:PROPIETARIO=AGENTE ...]
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.adapters.vault_repository import VaultRepository  # noqa: E402
from app.core import skill_rules  # noqa: E402
from app.core.agent_access import Actor  # noqa: E402
from app.core.schemas import NoteUpdate  # noqa: E402
from app.services.agent_access_guard import read_registry  # noqa: E402
from app.services.change_log_service import SYSTEM, ChangeLogService  # noqa: E402
from app.services.note_content_service import NoteContentService  # noqa: E402
from app.services.skill_service import SkillService  # noqa: E402
from app.services.system_docs_service import _active_vaults, _user_dbs  # noqa: E402


def plan_owners(frontmatter: dict, coowners: dict[str, list[str]]) -> list[str] | None:
    """Los propietarios nuevos de una skill, o `None` si ya están como corresponde (lista y completa)."""
    current = skill_rules.owners_of(frontmatter)
    if not current:
        return None
    target = list(current)
    for owner in current:
        for extra in coowners.get(owner, []):
            if extra not in target:
                target.append(extra)
    return None if frontmatter.get(skill_rules.OWNER) == target else target


def run(port: VaultRepository, *, apply: bool, email: str | None, only_vault: str | None,
        coowner: dict[str, dict[str, list[str]]]) -> list[dict]:
    report = []
    for user_id, user_email, db in _user_dbs(email):
        for vault in _active_vaults(port, db):
            vault_id = vault["_id"].split(":", 1)[1]
            if only_vault and vault_id != only_vault:
                continue
            entry = {"user": user_email, "vault": vault.get("name"), "vault_id": vault_id, "skills": []}
            try:
                registry = read_registry(port, db, vault_id)
                contents = NoteContentService(
                    port, db, actor=Actor("system"),
                    changelog=ChangeLogService(port, db, user_id, None, via="system", author=SYSTEM))
                for skill in SkillService(port, db).list_skills(vault_id):
                    new = plan_owners(skill.frontmatter, coowner.get(vault_id, {}))
                    if new is None:
                        continue
                    item = {"note_id": skill.note_id, "path": skill.path, "antes": skill.frontmatter.get(skill_rules.OWNER),
                            "despues": new, "no_gestores": [o for o in new if not skill_rules.is_manager(registry, o)]}
                    if apply:
                        fm = {**skill.frontmatter, skill_rules.OWNER: new}
                        contents.update(vault_id, skill.note_id, NoteUpdate(frontmatter=fm), skill.etag)
                        item["escrita"] = True
                    entry["skills"].append(item)
            except Exception as exc:  # noqa: BLE001
                entry["error"] = f"{type(exc).__name__}: {exc}"
            if entry["skills"] or "error" in entry:
                report.append(entry)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="escribe; sin esto solo informa")
    parser.add_argument("--email", help="limita a un usuario")
    parser.add_argument("--vault", help="limita a una bóveda (id)")
    parser.add_argument("--coowner", action="append", default=[], metavar="VAULT_ID:PROPIETARIO=AGENTE",
                        help="añade AGENTE a las skills cuyo propietario es PROPIETARIO en esa bóveda")
    parser.add_argument("--report", help="guarda el informe en este archivo")
    args = parser.parse_args()
    coowner: dict[str, dict[str, list[str]]] = {}
    for spec in args.coowner:
        vault_id, rest = spec.split(":", 1)
        owner, extra = rest.split("=", 1)
        coowner.setdefault(vault_id, {}).setdefault(owner, []).append(extra)
    report = run(VaultRepository(), apply=args.apply, email=args.email, only_vault=args.vault, coowner=coowner)
    if args.report:
        Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    total = sum(len(e["skills"]) for e in report)
    errors = sum(1 for e in report if "error" in e)
    print(f"# bóvedas con cambios: {len(report)}; skills {'escritas' if args.apply else 'por cambiar'}: {total}; errores: {errors}",
          flush=True)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
