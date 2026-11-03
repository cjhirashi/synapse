#!/usr/bin/env python3
"""H-029: herramienta de migración de atributos con informe en seco."""
import argparse
import hashlib
import json
import os
import sys
from base64 import b64encode
from collections import defaultdict
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.attribute_rules import migrate_frontmatter, validate_general


class CouchClient:
    """Cliente mínimo de CouchDB."""

    def __init__(self, url: str, user: str, password: str):
        self.url = url.rstrip("/")
        self.user = user
        self.password = password
        self._auth = b64encode(f"{user}:{password}".encode()).decode()

    def _request(self, method: str, path: str, body: Optional[bytes] = None) -> tuple[int, dict]:
        """Ejecuta una petición HTTP contra CouchDB."""
        url = f"{self.url}/{path}"
        headers = {
            "Authorization": f"Basic {self._auth}",
            "Content-Type": "application/json",
        }
        req = Request(url, data=body, headers=headers, method=method)
        try:
            with urlopen(req) as resp:
                return resp.status, json.loads(resp.read())
        except Exception as e:
            status = getattr(e, "code", 500)
            return status, {"error": str(e)}

    def list_dbs(self) -> list[str]:
        """Lista todas las bases disponibles."""
        status, resp = self._request("GET", "_all_dbs")
        if status == 200:
            return [db for db in resp if db.startswith("synapse_user_")]
        return []

    def note_docs(self, db: str) -> list[dict]:
        """Lee todas las notas de una base."""
        query = "_all_docs?include_docs=true&startkey=%22note:%22&endkey=%22note:%EF%B0%B0%22&conflicts=true"
        status, resp = self._request("GET", f"{db}/{query}")
        if status == 200:
            return [row.get("doc") for row in resp.get("rows", []) if row.get("doc")]
        return []

    def put(self, db: str, doc: dict) -> tuple[int, dict]:
        """Escribe un documento."""
        doc_id = doc["_id"]
        body = json.dumps(doc).encode()
        rev = doc.get("_rev", "")
        query = f"?rev={rev}" if rev else ""
        status, resp = self._request("PUT", f"{db}/{doc_id}{query}", body)
        return status, resp


def calculate_plan_digest(plan_items: list[tuple[str, str, str, dict]]) -> str:
    """Calcula sha256 de la lista ordenada (db, _id, _rev, frontmatter_json)."""
    lines = []
    for db, note_id, rev, frontmatter in sorted(plan_items):
        fm_json = json.dumps(frontmatter, sort_keys=True, separators=(",", ":"))
        lines.append(f"{db}|{note_id}|{rev}|{fm_json}")
    canonical = "\n".join(lines).encode()
    return hashlib.sha256(canonical).hexdigest()


def run_report(
    couch_client,
    report_file: Path,
    summary_file: Path,
    only_db: Optional[str] = None,
) -> None:
    """Modo report: calcula migraciones y genera informe en seco."""
    dbs = [only_db] if only_db else couch_client.list_dbs()

    total_notes = 0
    notes_changed = 0
    notes_unchanged = 0
    notes_with_conflicts = []
    notes_with_validation_errors = 0

    source_keys: dict[str, dict] = defaultdict(lambda: {"count": 0, "target": None})
    estado_counts: dict[str, int] = defaultdict(int)
    tags_before_after: list[tuple[list, list]] = []
    original_keys_count: dict[str, int] = defaultdict(int)

    plan_items: list[tuple[str, str, str, dict]] = []

    for db in dbs:
        docs = couch_client.note_docs(db)
        for doc in docs:
            if doc is None:
                continue

            # Filtrar: vivas, sin _deleted, sin _conflicts, con frontmatter no vacío
            if doc.get("type") != "note":
                continue
            if doc.get("deleted_at") is not None:
                continue
            if "_deleted" in doc:
                continue
            if "_conflicts" in doc:
                notes_with_conflicts.append(doc["_id"])
                continue

            fm = doc.get("frontmatter") or {}
            if not fm:
                continue

            total_notes += 1

            # Calcular migración
            new_fm = migrate_frontmatter(fm)

            # Registrar cambios de claves
            for key in fm.keys():
                target = None
                if key in ("título", "titulo"):
                    target = "titulo"
                elif key in ("descripción", "descripcion"):
                    target = "descripcion"
                elif key in ("tags",):
                    target = "tags"
                elif key in ("status", "estado"):
                    target = "estado"
                elif key in ("fecha_creación", "fecha_creacion"):
                    target = "fecha_creacion"
                elif key in ("última_actualización", "fecha_actualizacion", "ultima_actualizacion"):
                    target = "fecha_actualizacion"
                elif key in ("ruta",):
                    target = "ruta"

                if key not in source_keys or source_keys[key]["target"] is None:
                    source_keys[key]["target"] = target

                source_keys[key]["count"] += 1

            # Contar cambios de tags
            if "tags" in fm or any(k in fm for k in ("tags_original",)):
                fm_tags = fm.get("tags", []) if isinstance(fm.get("tags"), list) else []
                new_tags = new_fm.get("tags", []) if isinstance(new_fm.get("tags"), list) else []
                if fm_tags != new_tags:
                    tags_before_after.append((fm_tags, new_tags))

            # Contar claves *_original
            for key in new_fm:
                if key.endswith("_original"):
                    original_keys_count[key] += 1

            # Registrar estado
            if "estado" in new_fm:
                estado_counts[new_fm["estado"]] += 1
            elif "estado_original" in new_fm:
                estado_counts[f"_original_{str(new_fm['estado_original'])}"] += 1

            # Validar que la nota migrada pase validate_general
            validation_error = validate_general(new_fm)
            if validation_error:
                notes_with_validation_errors += 1

            # Comparar si cambió
            if fm == new_fm:
                notes_unchanged += 1
            else:
                notes_changed += 1
                plan_items.append((db, doc["_id"], doc["_rev"], new_fm))

    # Calcular digest
    plan_digest = calculate_plan_digest(plan_items)

    # Construir reporte JSON
    report = {
        "total_notes": total_notes,
        "notes_changed": notes_changed,
        "notes_unchanged": notes_unchanged,
        "source_keys": dict(source_keys),
        "estado": dict(estado_counts),
        "tags_changed": {
            "count": len(tags_before_after),
            "examples": tags_before_after[:10],
        },
        "original_keys": dict(original_keys_count),
        "notes_with_conflicts": notes_with_conflicts,
        "notes_with_validation_errors": notes_with_validation_errors,
        "plan_digest": plan_digest,
    }

    report_file.write_text(json.dumps(report, indent=2))

    # Construir resumen Markdown
    summary_lines = [
        "# Migración de Atributos",
        "",
        f"**Total de notas:** {total_notes}",
        f"**Cambiarán:** {notes_changed}",
        f"**Sin cambios:** {notes_unchanged}",
        "",
        "## Claves de origen",
        "",
    ]

    for key in sorted(source_keys.keys()):
        info = source_keys[key]
        target = info["target"] or "desconocida"
        summary_lines.append(f"- `{key}` → `{target}` ({info['count']} notas)")

    summary_lines.extend(["", "## Estado"])
    for state in sorted(estado_counts.keys()):
        summary_lines.append(f"- {state}: {estado_counts[state]}")

    if notes_with_conflicts:
        summary_lines.extend(["", "## Notas con conflictos (excluidas)"])
        for nid in sorted(notes_with_conflicts):
            summary_lines.append(f"- {nid}")

    if notes_with_validation_errors:
        summary_lines.extend(
            [
                "",
                f"## ⚠️ {notes_with_validation_errors} notas con errores de validación",
            ]
        )

    summary_file.write_text("\n".join(summary_lines))


def run_apply(
    couch_client,
    report_file: Path,
    dry_apply: bool = False,
) -> int:
    """Modo apply: aplica cambios con validación de digest."""
    report = json.loads(report_file.read_text())
    stored_digest = report["plan_digest"]

    # Recalcular plan desde las bases
    dbs = couch_client.list_dbs()
    plan_items: list[tuple[str, str, str, dict]] = []

    for db in dbs:
        docs = couch_client.note_docs(db)
        for doc in docs:
            if doc is None:
                continue
            if doc.get("type") != "note":
                continue
            if doc.get("deleted_at") is not None:
                continue
            if "_deleted" in doc:
                continue
            if "_conflicts" in doc:
                continue

            fm = doc.get("frontmatter") or {}
            if not fm:
                continue

            new_fm = migrate_frontmatter(fm)
            if fm != new_fm:
                plan_items.append((db, doc["_id"], doc["_rev"], new_fm))

    recalc_digest = calculate_plan_digest(plan_items)

    # Si no hay cambios (idempotente) es OK
    if len(plan_items) == 0 and len(report.get("plan_items", [])) == 0:
        return 0

    if recalc_digest != stored_digest:
        print(f"ERROR: digest mismatch. Stored: {stored_digest}, Calculated: {recalc_digest}")
        return 2

    # Aplicar cambios
    written = 0
    conflicts = 0
    validation_fails = 0

    for db, note_id, old_rev, new_fm in plan_items:
        # Leer la nota actual (para conservar otros campos)
        docs = couch_client.note_docs(db)
        doc = next((d for d in docs if d["_id"] == note_id), None)
        if not doc:
            continue

        # Preservar campos
        doc["frontmatter"] = new_fm
        doc["_rev"] = old_rev

        if dry_apply:
            # No escribir
            continue

        # Escribir
        status, resp = couch_client.put(db, doc)
        if status == 409:
            conflicts += 1
        elif status in (200, 201):
            # Verificar que se escribió correctamente
            validation_error = validate_general(new_fm)
            if validation_error:
                validation_fails += 1
                print(f"VALIDATION ERROR after write: {note_id} - {validation_error}")
            else:
                written += 1

    if validation_fails > 0:
        return 3

    return 0


def main():
    parser = argparse.ArgumentParser(description="Migración de atributos de notas")
    parser.add_argument("--mode", choices=["report", "apply"], required=True)
    parser.add_argument("--report-file", type=Path, help="Archivo JSON del informe")
    parser.add_argument("--summary-file", type=Path, help="Archivo Markdown del resumen")
    parser.add_argument("--only-db", type=str, help="Filtrar a una sola base")
    parser.add_argument("--dry-apply", action="store_true", help="Dry run en apply")

    args = parser.parse_args()

    # Credenciales
    couchdb_url = os.environ.get("COUCHDB_URL", "http://localhost:5984")
    couchdb_user = os.environ.get("COUCHDB_USER", "admin")
    couchdb_password = os.environ.get("COUCHDB_PASSWORD", "password")

    couch = CouchClient(couchdb_url, couchdb_user, couchdb_password)

    if args.mode == "report":
        if not args.report_file:
            parser.error("--report-file requerido para mode=report")
        if not args.summary_file:
            parser.error("--summary-file requerido para mode=report")

        run_report(couch, args.report_file, args.summary_file, args.only_db)
        print(f"Informe escrito en {args.report_file}")
        print(f"Resumen escrito en {args.summary_file}")

    elif args.mode == "apply":
        if not args.report_file:
            parser.error("--report-file requerido para mode=apply")

        exit_code = run_apply(couch, args.report_file, dry_apply=args.dry_apply)
        sys.exit(exit_code)


if __name__ == "__main__":
    main()
