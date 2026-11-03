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
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.attribute_rules import migrate_frontmatter, normalize_key, validate_general


class CouchError(Exception):
    """CouchDB no respondió como se esperaba; la herramienta se detiene en lugar de seguir a medias."""


class CouchClient:
    """Cliente mínimo de CouchDB."""

    def __init__(self, url: str, user: str, password: str):
        self.url = url.rstrip("/")
        self.user = user
        self.password = password
        self._auth = b64encode(f"{user}:{password}".encode()).decode()

    def _request(self, method: str, path: str, body: Optional[bytes] = None) -> tuple[int, dict]:
        """Petición HTTP a CouchDB. Un 409 o un 404 se devuelven; cualquier otro fallo lanza `CouchError`."""
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
        """Bases de usuario (`synapse_user_*`). Si CouchDB falla, lanza: nunca devuelve «sin bases»."""
        _, resp = self._request("GET", "_all_dbs")
        return [db for db in resp if db.startswith("synapse_user_")]

    def note_docs(self, db: str) -> list[dict]:
        """Todas las notas de una base, con sus conflictos."""
        query = "_all_docs?include_docs=true&startkey=%22note:%22&endkey=%22note:%EF%B0%B0%22&conflicts=true"
        _, resp = self._request("GET", f"{db}/{query}")
        return [row["doc"] for row in resp.get("rows", []) if row.get("doc")]

    def get_doc(self, db: str, doc_id: str) -> Optional[dict]:
        """Un documento con sus conflictos, o `None` si no existe."""
        status, resp = self._request("GET", f"{db}/{quote(doc_id, safe='')}?conflicts=true")
        return None if status == 404 else resp

    def put(self, db: str, doc: dict) -> tuple[int, dict]:
        """Escribe un documento."""
        body = json.dumps(doc, ensure_ascii=False).encode("utf-8")
        status, resp = self._request("PUT", f"{db}/{quote(doc['_id'], safe='')}?rev={doc['_rev']}", body)
        return status, resp


_TARGETS = {
    "titulo": "titulo", "descripcion": "descripcion", "tags": "tags", "status": "estado", "estado": "estado",
    "fecha_creacion": "fecha_creacion_original", "ultima_actualizacion": "fecha_actualizacion_original",
    "fecha_actualizacion": "fecha_actualizacion_original", "ruta": "ruta_original",
}


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
    validation_error_list: list[dict] = []

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

            for key in fm.keys():
                target = _TARGETS.get(normalize_key(key) or "")
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
                validation_error_list.append({"id": doc["_id"], "code": validation_error})

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
        "validation_errors": validation_error_list,
        "plan_digest": plan_digest,
    }

    report_file.write_text(json.dumps(report, indent=2, ensure_ascii=False))

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
        target = info["target"] or "(clave libre, sin cambio)"
        summary_lines.append(f"- `{key}` → {target if target.startswith('(') else '`' + target + '`'} ({info['count']} notas)")

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
                "",
            ]
            + [f"- {item['id']}: {item['code']}" for item in validation_error_list]
        )

    summary_file.write_text("\n".join(summary_lines))


def _live_note_plan(couch_client, dbs: list[str]) -> tuple[list[tuple[str, str, str, dict]], int]:
    """Plan de migración (db, id, rev, frontmatter nuevo) y número de notas omitidas por conflictos."""
    items: list[tuple[str, str, str, dict]] = []
    conflicted = 0
    for db in dbs:
        for doc in couch_client.note_docs(db):
            if doc.get("type") != "note" or doc.get("deleted_at") is not None or "_deleted" in doc:
                continue
            fm = doc.get("frontmatter") or {}
            if not fm:
                continue
            if "_conflicts" in doc:
                conflicted += 1
                continue
            new_fm = migrate_frontmatter(fm)
            if fm != new_fm:
                items.append((db, doc["_id"], doc["_rev"], new_fm))
    return items, conflicted


_PRESERVED = ("created_at", "updated_at", "content", "deleted_at", "type", "path")


def run_apply(couch_client, report_file: Path, dry_apply: bool = False) -> int:
    """Modo apply. Códigos: 0 bien, 2 el plan ya no coincide con el informe, 3 una nota releída difiere
    de lo esperado, 4 error de escritura distinto de un 409."""
    report = json.loads(report_file.read_text())
    items, conflicted = _live_note_plan(couch_client, couch_client.list_dbs())

    if not items:
        print("Nada que migrar: ninguna nota viva con cambios pendientes.")
        return 0
    if calculate_plan_digest(items) != report["plan_digest"]:
        print("ERROR: el plan actual no coincide con el informe aprobado (cambiaron las notas o el informe es de otra corrida). No se escribió nada.")
        return 2

    written = conflicts = skipped = 0
    problems: list[str] = []
    errors: list[str] = []
    for db, note_id, rev, new_fm in items:
        doc = couch_client.get_doc(db, note_id)
        if doc is None or doc.get("_rev") != rev or "_conflicts" in doc:
            skipped += 1
            continue
        before = {k: doc.get(k) for k in _PRESERVED}
        if dry_apply:
            continue
        status, _ = couch_client.put(db, {**doc, "frontmatter": new_fm})
        if status == 409:
            conflicts += 1
            continue
        if status not in (200, 201):
            errors.append(f"{db}/{note_id}: HTTP {status}")
            continue
        written += 1
        after = couch_client.get_doc(db, note_id)
        if after is None:
            problems.append(f"{db}/{note_id}: no se pudo releer")
            continue
        changed = [k for k in _PRESERVED if after.get(k) != before[k]]
        if changed:
            problems.append(f"{db}/{note_id}: cambió {', '.join(changed)}")
        if after.get("frontmatter") != new_fm or validate_general(after.get("frontmatter") or {}) is not None:
            problems.append(f"{db}/{note_id}: el frontmatter releído no es el esperado")

    print(f"Escritas: {written} | 409 (cambió entretanto): {conflicts} | omitidas por conflictos: {conflicted} | omitidas por cambio de revisión: {skipped} | errores de escritura: {len(errors)}")
    for line in problems + errors:
        print("  ", line)
    if problems:
        return 3
    return 4 if errors else 0


def main():
    parser = argparse.ArgumentParser(description="Migración de atributos de notas")
    parser.add_argument("--mode", choices=["report", "apply"], required=True)
    parser.add_argument("--report-file", type=Path, help="Archivo JSON del informe")
    parser.add_argument("--summary-file", type=Path, help="Archivo Markdown del resumen")
    parser.add_argument("--only-db", type=str, help="Filtrar a una sola base")
    parser.add_argument("--dry-apply", action="store_true", help="Dry run en apply")

    args = parser.parse_args()

    # Credenciales
    try:
        couchdb_url, couchdb_user, couchdb_password = (
            os.environ[k] for k in ("COUCHDB_URL", "COUCHDB_USER", "COUCHDB_PASSWORD"))
    except KeyError as missing:
        parser.error(f"falta la variable de entorno {missing}")

    couch = CouchClient(couchdb_url, couchdb_user, couchdb_password)

    if args.mode == "report":
        if not args.report_file:
            parser.error("--report-file requerido para mode=report")
        if not args.summary_file:
            parser.error("--summary-file requerido para mode=report")

        try:
            run_report(couch, args.report_file, args.summary_file, args.only_db)
        except CouchError as e:
            print(f"ERROR: {e}")
            sys.exit(1)
        print(f"Informe escrito en {args.report_file}")
        print(f"Resumen escrito en {args.summary_file}")

    elif args.mode == "apply":
        if not args.report_file:
            parser.error("--report-file requerido para mode=apply")

        try:
            exit_code = run_apply(couch, args.report_file, dry_apply=args.dry_apply)
        except CouchError as e:
            print(f"ERROR: {e}")
            exit_code = 1
        sys.exit(exit_code)


if __name__ == "__main__":
    main()
