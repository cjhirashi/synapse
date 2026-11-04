#!/usr/bin/env python3
"""H-040: Herramienta de migración del YAML del cuerpo de notas a atributos."""
import argparse
import hashlib
import json
import os
import sys
from base64 import b64encode
from collections import defaultdict
from pathlib import Path
from typing import Optional
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.body_yaml import split_body_yaml, plan_note
from app.core.attribute_rules import validate_general


class CouchError(Exception):
    """CouchDB no respondió como se esperaba."""


class CouchClient:
    """Cliente mínimo de CouchDB."""

    def __init__(self, url: str, user: str, password: str):
        self.url = url.rstrip("/")
        self.user = user
        self.password = password
        self._auth = b64encode(f"{user}:{password}".encode()).decode()

    def _request(self, method: str, path: str, body: Optional[bytes] = None) -> tuple[int, dict]:
        """Petición HTTP a CouchDB."""
        url = f"{self.url}/{path}"
        headers = {"Authorization": f"Basic {self._auth}", "Content-Type": "application/json"}
        req = Request(url, data=body, headers=headers, method=method)
        try:
            with urlopen(req, timeout=60) as resp:
                return resp.status, json.loads(resp.read())
        except HTTPError as e:
            if e.code in (404, 409):
                return e.code, {"error": str(e)}
            raise CouchError(f"{method} {path}: HTTP {e.code}") from e
        except Exception as e:
            raise CouchError(f"{method} {path}: {e}") from e

    def list_dbs(self) -> list[str]:
        """Bases de usuario (`synapse_user_*`)."""
        _, resp = self._request("GET", "_all_dbs")
        return [db for db in resp if db.startswith("synapse_user_")]

    def note_docs(self, db: str) -> list[dict]:
        """Todas las notas de una base."""
        query = "_all_docs?include_docs=true&startkey=%22note:%22&endkey=%22note:%EF%B0%B0%22&conflicts=true"
        _, resp = self._request("GET", f"{db}/{query}")
        return [row["doc"] for row in resp.get("rows", []) if row.get("doc")]

    def get_vault_name(self, db: str, vault_id: str) -> Optional[str]:
        """Obtiene el nombre de la bóveda desde su documento."""
        doc_id = f"vault:{vault_id}"
        status, resp = self._request("GET", f"{db}/{quote(doc_id, safe='')}?conflicts=true")
        if status == 200 and resp.get("type") == "vault":
            return resp.get("name")
        return None


def calculate_plan_digest(plan_items: list[tuple[str, str, str, str, str]]) -> str:
    """Calcula sha256 del plan (db, id, rev, frontmatter_json, content_json)."""
    lines = []
    for db, note_id, rev, frontmatter_json, content_json in sorted(plan_items):
        lines.append(f"{db}|{note_id}|{rev}|{frontmatter_json}|{content_json}")
    canonical = "\n".join(lines).encode()
    return hashlib.sha256(canonical).hexdigest()


def run_report(
    couch_client: CouchClient,
    report_file: Path,
    summary_file: Path,
    only_db: Optional[str] = None,
) -> None:
    """Modo report: calcula migraciones y genera informe en seco (C-6)."""
    dbs = [only_db] if only_db else couch_client.list_dbs()

    vault_by_db: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(dict))
    total_notes = 0
    notes_migrables = 0
    notes_no_migrables = 0
    notes_with_conflicts = []
    notes_with_validation_errors = []

    source_keys: dict[str, dict] = defaultdict(lambda: {"count": 0, "target": None})
    no_migrable_reasons: dict[str, int] = defaultdict(int)
    etiquetas_count = 0
    reportados_all: list[dict] = []

    plan_items: list[tuple[str, str, str, str, str]] = []

    for db in dbs:
        docs = couch_client.note_docs(db)
        db_notes = defaultdict(lambda: {"migrables": 0, "no_migrables": 0, "con_etiquetas": 0})

        for doc in docs:
            if doc is None:
                continue

            # Filtrar: vivas, sin _deleted, sin _conflicts, no INDICE
            if doc.get("type") != "note":
                continue
            if doc.get("deleted_at") is not None:
                continue
            if "_deleted" in doc:
                continue
            if "_conflicts" in doc:
                notes_with_conflicts.append(doc["_id"])
                continue
            if doc["_id"].endswith("INDICE.md"):
                continue

            total_notes += 1

            # Obtener el nombre de la bóveda
            vault_id = None
            for key in doc.get("frontmatter", {}).keys():
                if key.startswith("vault:"):
                    vault_id = key.split(":", 1)[1]
                    break

            vault_name = couch_client.get_vault_name(db, vault_id) if vault_id else "default"
            if not vault_name:
                vault_name = f"vault:{vault_id}" if vault_id else "default"

            # Intentar extraer YAML
            plan = plan_note(doc)

            if plan is not None:
                # Migrable
                notes_migrables += 1
                db_notes[vault_name]["migrables"] += 1

                # Recopilar reportados
                for item in plan["reportados"]:
                    reportados_all.append({
                        "nota_id": doc["_id"],
                        **item
                    })

                # Agregar al plan
                fm_json = json.dumps(plan["frontmatter_new"], sort_keys=True, separators=(",", ":"))
                content_json = json.dumps(plan["content_new"], separators=(",", ":"))
                plan_items.append((db, doc["_id"], doc["_rev"], fm_json, content_json))
            else:
                # No migrable
                content = doc.get("content", "")
                yaml_data, motivo = split_body_yaml(content)

                if yaml_data is None:
                    if content.strip().startswith("---"):
                        # YAML inválido u otro problema
                        notes_no_migrables += 1
                        db_notes[vault_name]["no_migrables"] += 1
                        no_migrable_reasons[motivo] += 1
                # Si no empieza por ---, no es migrable pero no se cuenta

            # Contar atributo etiquetas (C-5)
            if "etiquetas" in doc.get("frontmatter", {}):
                etiquetas_count += 1
                db_notes[vault_name]["con_etiquetas"] += 1

            # Contar claves del frontmatter
            for key in doc.get("frontmatter", {}).keys():
                if key not in source_keys or source_keys[key]["target"] is None:
                    source_keys[key]["count"] += 1
                else:
                    source_keys[key]["count"] += 1

        # Guardar conteos por bóveda
        for vault_name, counts in db_notes.items():
            if vault_name not in vault_by_db[db]:
                vault_by_db[db][vault_name] = {"count": 0}
            vault_by_db[db][vault_name].update(counts)

    # Calcular digest
    plan_digest = calculate_plan_digest(plan_items)

    # Construir reporte JSON
    report = {
        "total_notes": total_notes,
        "notes_migrables": notes_migrables,
        "notes_no_migrables": notes_no_migrables,
        "source_keys": dict(source_keys),
        "no_migrable_reasons": dict(no_migrable_reasons),
        "notas_con_etiquetas": etiquetas_count,
        "notes_with_conflicts": notes_with_conflicts,
        "reportados": reportados_all,
        "notes_with_validation_errors": notes_with_validation_errors,
        "vault_by_db": {db: dict(vaults) for db, vaults in vault_by_db.items()},
        "plan_digest": plan_digest,
    }

    report_file.write_text(json.dumps(report, indent=2, ensure_ascii=False))

    # Construir resumen Markdown
    summary_lines = [
        "# Migración YAML del Cuerpo de Notas (H-040)",
        "",
        f"- **Total de notas procesadas:** {total_notes}",
        f"- **Migrables:** {notes_migrables}",
        f"- **No migrables:** {notes_no_migrables}",
        f"- **Con conflictos de bóveda:** {len(notes_with_conflicts)}",
        f"- **Notas con atributo `etiquetas` (C-5):** {etiquetas_count}",
        "",
        "## Motivos de no migrabilidad",
        "",
    ]

    for motivo, count in sorted(no_migrable_reasons.items(), key=lambda x: x[1], reverse=True):
        summary_lines.append(f"- {motivo}: {count}")

    summary_lines.extend([
        "",
        "## Bóvedas",
        "",
    ])

    for db, vaults in sorted(vault_by_db.items()):
        summary_lines.append(f"### {db}")
        summary_lines.append("")
        for vault_name, counts in sorted(vaults.items()):
            summary_lines.append(f"- **{vault_name}**")
            summary_lines.append(f"  - Migrables: {counts.get('migrables', 0)}")
            summary_lines.append(f"  - No migrables: {counts.get('no_migrables', 0)}")
            summary_lines.append(f"  - Con `etiquetas`: {counts.get('con_etiquetas', 0)}")
        summary_lines.append("")

    summary_lines.extend([
        f"## Plan Digest (SHA256)",
        f"```",
        plan_digest,
        "```",
    ])

    summary_file.write_text("\n".join(summary_lines))

    print(f"Informe escrito en {report_file}")
    print(f"Resumen escrito en {summary_file}")


def main():
    parser = argparse.ArgumentParser(description="H-040: Migración del YAML del cuerpo a atributos.")
    parser.add_argument("--mode", default="report", choices=["report"], help="Modo de operación (por ahora solo report).")
    parser.add_argument("--report-file", type=Path, required=True, help="Archivo de informe JSON.")
    parser.add_argument("--summary-file", type=Path, required=True, help="Archivo de resumen Markdown.")
    parser.add_argument("--only-db", type=str, help="Solo procesar esta base de datos.")
    parser.add_argument("--couch-url", default="http://localhost:5984", help="URL de CouchDB.")
    parser.add_argument("--couch-user", default="admin", help="Usuario de CouchDB.")
    parser.add_argument("--couch-password", default="password", help="Contraseña de CouchDB.")

    args = parser.parse_args()

    couch_client = CouchClient(args.couch_url, args.couch_user, args.couch_password)

    try:
        if args.mode == "report":
            run_report(couch_client, args.report_file, args.summary_file, args.only_db)
    except CouchError as e:
        print(f"Error de CouchDB: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
