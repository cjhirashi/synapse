#!/usr/bin/env python3
"""H-040: migra el bloque YAML al inicio del cuerpo de las notas a atributos.

Modos:
- `report` (ensayo, NO escribe): cuenta por bóveda las notas que empiezan por un bloque YAML, las migrables y
  las no migrables (con motivo), el mapeo de claves y los valores del YAML que no se guardarían.
- `backup`: guarda los documentos completos que el plan tocaría (JSON 600) con el digest del plan.
- `apply`: exige un informe aprobado y un respaldo del MISMO plan; escribe con el `_rev` leído, relee y verifica.
- `rollback`: devuelve el cuerpo y los atributos originales de las notas que siguen tal como las dejó la migración.

Uso: COUCHDB_URL=… COUCHDB_USER=… COUCHDB_PASSWORD=… python scripts/migrate_body_yaml.py --mode report \
        --report-file informe.json --summary-file resumen.md [--only-db synapse_user_xxx]
     … --mode backup --backup-file respaldo.json [--only-db …]
     … --mode apply --report-file informe.json --backup-file respaldo.json [--dry-apply] [--only-db …]
     … --mode rollback --backup-file respaldo.json [--dry-apply]
"""
import argparse
import hashlib
import json
import os
import sys
from base64 import b64encode
from collections import Counter, defaultdict
from pathlib import Path
from typing import Optional
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.attribute_rules import normalize_key, validate_general  # noqa: E402
from app.core.body_yaml import YAML_ONLY_ALIASES, plan_note  # noqa: E402
from app.core.index_rules import is_index_path  # noqa: E402

_ALIASES = {"title": "titulo", "description": "descripcion", "etiquetas": "tags", "status": "estado", **YAML_ONLY_ALIASES}
_STANDARD = {"titulo", "descripcion", "tags", "estado", "fecha_creacion", "fecha_actualizacion"}


class CouchError(Exception):
    """CouchDB no respondió como se esperaba; la herramienta se detiene en lugar de seguir a medias."""


class CouchClient:
    """Cliente mínimo de CouchDB."""

    def __init__(self, url: str, user: str, password: str):
        self.url = url.rstrip("/")
        self._auth = b64encode(f"{user}:{password}".encode()).decode()

    def _request(self, method: str, path: str, body: Optional[bytes] = None) -> tuple[int, dict]:
        """Un 404 o un 409 se devuelven; cualquier otro fallo lanza `CouchError`."""
        headers = {"Authorization": f"Basic {self._auth}", "Content-Type": "application/json"}
        req = Request(f"{self.url}/{path}", data=body, headers=headers, method=method)
        try:
            with urlopen(req, timeout=120) as resp:
                return resp.status, json.loads(resp.read())
        except HTTPError as e:
            if e.code in (404, 409):
                return e.code, {"error": str(e)}
            raise CouchError(f"{method} {path}: HTTP {e.code}") from e
        except Exception as e:
            raise CouchError(f"{method} {path}: {e}") from e

    def _get(self, path: str) -> dict:
        return self._request("GET", path)[1]

    def get_doc(self, db: str, doc_id: str) -> Optional[dict]:
        """Un documento con sus conflictos, o `None` si no existe."""
        status, resp = self._request("GET", f"{db}/{quote(doc_id, safe='')}?conflicts=true")
        return None if status == 404 else resp

    def put(self, db: str, doc: dict) -> tuple[int, dict]:
        """Escribe un documento con su `_rev` (un 409 se devuelve)."""
        body = json.dumps(doc, ensure_ascii=False).encode("utf-8")
        return self._request("PUT", f"{db}/{quote(doc['_id'], safe='')}?rev={doc['_rev']}", body)

    def list_dbs(self) -> list[str]:
        return sorted(db for db in self._get("_all_dbs") if db.startswith("synapse_user_"))

    def _docs_with_prefix(self, db: str, prefix: str) -> list[dict]:
        query = f"_all_docs?include_docs=true&conflicts=true&startkey={quote(json.dumps(prefix))}&endkey={quote(json.dumps(prefix + chr(0xFFF0)))}"
        return [row["doc"] for row in self._get(f"{db}/{query}").get("rows", []) if row.get("doc")]

    def note_docs(self, db: str) -> list[dict]:
        return self._docs_with_prefix(db, "note:")

    def vault_names(self, db: str) -> dict[str, str]:
        return {doc["_id"].removeprefix("vault:"): doc.get("name", "") for doc in self._docs_with_prefix(db, "vault:")}


def calculate_plan_digest(plan_items: list[tuple[str, str, str, dict, str]]) -> str:
    """sha256 de la lista ordenada (db, _id, _rev, frontmatter nuevo, cuerpo nuevo)."""
    lines = []
    for db, note_id, rev, frontmatter, content in sorted(plan_items, key=lambda i: i[:3]):
        fm_json = json.dumps(frontmatter, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        lines.append(f"{db}|{note_id}|{rev}|{fm_json}|{content_hash}")
    return hashlib.sha256("\n".join(lines).encode()).hexdigest()


def run_report(couch, report_file: Path, summary_file: Path, only_db: str | None = None) -> dict:
    """Ensayo: calcula el plan de migración de todas las notas vivas. No escribe en CouchDB."""
    dbs = [only_db] if only_db else couch.list_dbs()
    vaults: dict[str, dict] = {}
    keys: dict[str, Counter] = defaultdict(Counter)  # clave original del YAML -> atributo destino
    reported_all: list[dict] = []
    not_migrable: list[dict] = []
    free_keys: Counter = Counter()
    plan_items: list[tuple[str, str, str, dict, str]] = []
    skipped = Counter()
    unmigrable_reasons: Counter = Counter()
    with_etiquetas = 0

    for db in dbs:
        names = couch.vault_names(db)
        for doc in couch.note_docs(db):
            if doc.get("type") != "note" or doc.get("deleted_at") is not None or "_deleted" in doc:
                continue
            if "_conflicts" in doc:
                skipped["con_conflictos"] += 1
                continue
            if is_index_path(doc.get("path") or ""):
                continue
            vault_id = doc.get("vault_id") or "?"
            row = vaults.setdefault(f"{db}|{vault_id}", {
                "db": db, "vault_id": vault_id, "nombre": names.get(vault_id, "(sin nombre)"),
                "notas_vivas": 0, "con_yaml": 0, "solo_etiquetas": 0, "migrables": 0, "no_migrables": 0, "con_atributo_etiquetas": 0,
                "motivos_no_migrable": {},
            })
            row["notas_vivas"] += 1
            if "etiquetas" in (doc.get("frontmatter") or {}):
                row["con_atributo_etiquetas"] += 1
                with_etiquetas += 1
            plan = plan_note(doc)
            if plan is None:
                continue
            if plan["ok"] and not plan["tiene_yaml"]:
                row["solo_etiquetas"] += 1
                row["migrables"] += 1
                plan_items.append((db, doc["_id"], doc["_rev"], plan["frontmatter_new"], plan["content_new"]))
                continue
            row["con_yaml"] += 1
            if not plan["ok"]:
                row["no_migrables"] += 1
                row["motivos_no_migrable"][plan["motivo"]] = row["motivos_no_migrable"].get(plan["motivo"], 0) + 1
                unmigrable_reasons[plan["motivo"]] += 1
                not_migrable.append({"db": db, "id": doc["_id"], "path": doc.get("path"), "motivo": plan["motivo"]})
                continue
            row["migrables"] += 1
            for key in plan["yaml_keys"]:
                normalized = normalize_key(key)
                target = _ALIASES.get(normalized, normalized) if normalized else None
                keys[key][target if target in _STANDARD else "(atributo libre)"] += 1
                if target not in _STANDARD:
                    free_keys[key] += 1
            for item in plan["reportados"]:
                reported_all.append({"db": db, "id": doc["_id"], "path": doc.get("path"), **item})
            plan_items.append((db, doc["_id"], doc["_rev"], plan["frontmatter_new"], plan["content_new"]))

    report = {
        "bovedas": sorted(vaults.values(), key=lambda r: (-r["con_yaml"], r["nombre"])),
        "total_con_yaml": sum(r["con_yaml"] for r in vaults.values()),
        "total_migrables": sum(r["migrables"] for r in vaults.values()),
        "total_no_migrables": sum(r["no_migrables"] for r in vaults.values()),
        "total_con_atributo_etiquetas": with_etiquetas,
        "omitidas": dict(skipped),
        "motivos_no_migrable": dict(unmigrable_reasons),
        "no_migrables": not_migrable,
        "mapeo_claves": {k: dict(v) for k, v in sorted(keys.items(), key=lambda kv: -sum(kv[1].values()))},
        "claves_libres": dict(free_keys.most_common()),
        "reportados": reported_all,
        "plan_digest": calculate_plan_digest(plan_items),
    }
    report_file.write_text(json.dumps(report, indent=2, ensure_ascii=False))

    lines = [
        "# H-040 — Ensayo de migración del YAML del cuerpo (sin escribir nada)", "",
        f"- Notas que empiezan por YAML: **{report['total_con_yaml']}** "
        f"(migrables {report['total_migrables']}, no migrables {report['total_no_migrables']})",
        f"- Notas con el atributo `etiquetas`: {with_etiquetas}",
        f"- Valores del YAML que NO se guardarían (conflicto o inválidos): {len(reported_all)}",
        f"- Omitidas por conflictos de CouchDB: {skipped.get('con_conflictos', 0)}", "",
        "## Por bóveda", "", "| Bóveda | Vivas | Con YAML | Migrables | No migrables | `etiquetas` |", "|---|---|---|---|---|---|",
    ]
    for r in report["bovedas"]:
        lines.append(f"| {r['nombre']} | {r['notas_vivas']} | {r['con_yaml']} | {r['migrables']} | {r['no_migrables']} | {r['con_atributo_etiquetas']} |")
    lines += ["", "## Mapeo de claves", "", "| Clave del YAML | Destino | Notas |", "|---|---|---|"]
    for key, targets in report["mapeo_claves"].items():
        for target, count in targets.items():
            lines.append(f"| `{key}` | {target} | {count} |")
    lines += ["", "## No migrables por motivo", ""] + [f"- {m}: {c}" for m, c in unmigrable_reasons.most_common()]
    lines += ["", f"`plan_digest`: `{report['plan_digest']}`", ""]
    summary_file.write_text("\n".join(lines))
    return report


def _live_plan(couch, dbs: list[str]) -> tuple[list[tuple[str, dict, dict]], int]:
    """Notas que `apply` tocaría, como `(db, documento, plan)`, y cuántas se omiten por conflictos de CouchDB.
    Mismos filtros que `run_report`: vivas, sin conflictos, no INDICE, plan migrable."""
    entries: list[tuple[str, dict, dict]] = []
    conflicted = 0
    for db in dbs:
        for doc in couch.note_docs(db):
            if doc.get("type") != "note" or doc.get("deleted_at") is not None or "_deleted" in doc:
                continue
            if "_conflicts" in doc:
                conflicted += 1
                continue
            if is_index_path(doc.get("path") or ""):
                continue
            plan = plan_note(doc)
            if plan is not None and plan["ok"]:
                entries.append((db, doc, plan))
    return entries, conflicted


def _digest_items(entries: list[tuple[str, dict, dict]]) -> list[tuple[str, str, str, dict, str]]:
    return [(db, doc["_id"], doc["_rev"], plan["frontmatter_new"], plan["content_new"]) for db, doc, plan in entries]


def _without(doc: dict, keys: tuple[str, ...]) -> dict:
    return {k: v for k, v in doc.items() if k not in keys}


_REWRITTEN = ("_rev", "frontmatter", "content")


def run_backup(couch, backup_file: Path, only_db: Optional[str] = None) -> int:
    """Guarda (JSON, permisos 600) los documentos completos que el plan tocaría, con el digest de ese plan."""
    entries, _ = _live_plan(couch, [only_db] if only_db else couch.list_dbs())
    docs: dict[str, list[dict]] = {}
    for db, doc, _plan in entries:
        docs.setdefault(db, []).append(doc)
    backup = {"plan_digest": calculate_plan_digest(_digest_items(entries)), "docs": docs}
    fd = os.open(backup_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(backup, handle, ensure_ascii=False)
    os.chmod(backup_file, 0o600)
    print(f"Respaldo: {len(entries)} notas de {len(docs)} bases en {backup_file} (plan_digest={backup['plan_digest']})")
    return 0


def run_apply(couch, report_file: Path, backup_file: Optional[Path], dry_apply: bool = False, only_db: Optional[str] = None) -> int:
    """Códigos: 0 bien (también «nada que migrar»), 2 el plan no coincide con el informe aprobado o falta el
    respaldo de ESE plan, 3 una nota releída no quedó como se esperaba, 4 error de escritura distinto de un 409."""
    report = json.loads(report_file.read_text())
    entries, conflicted = _live_plan(couch, [only_db] if only_db else couch.list_dbs())
    if not entries:
        print("Nada que migrar: ninguna nota viva con YAML en el cuerpo ni atributo `etiquetas`.")
        return 0
    items = _digest_items(entries)
    digest = calculate_plan_digest(items)
    if digest != report["plan_digest"]:
        print("ERROR: el plan actual no coincide con el informe aprobado (cambiaron las notas o el informe es de otra corrida). No se escribió nada.")
        return 2
    if not dry_apply:
        try:
            backup = json.loads(backup_file.read_text(encoding="utf-8")) if backup_file else None
        except (OSError, ValueError):
            backup = None
        covered = {(db, d["_id"], d["_rev"]) for db, docs in (backup or {}).get("docs", {}).items() for d in docs}
        if backup is None or backup.get("plan_digest") != digest or not {(i[0], i[1], i[2]) for i in items} <= covered:
            print("ERROR: falta el respaldo previo de este plan (--backup-file), o es de otra corrida. No se escribió nada.")
            return 2

    written = conflicts = skipped = 0
    problems: list[str] = []
    errors: list[str] = []
    for db, listed, plan in entries:
        note_id = listed["_id"]
        doc = couch.get_doc(db, note_id)
        if doc is None or doc.get("_rev") != listed["_rev"] or "_conflicts" in doc:
            skipped += 1
            continue
        if dry_apply:
            continue
        before = _without(doc, _REWRITTEN)
        status, _ = couch.put(db, {**doc, "frontmatter": plan["frontmatter_new"], "content": plan["content_new"]})
        if status == 409:
            conflicts += 1
            continue
        if status not in (200, 201):
            errors.append(f"{db}/{note_id}: HTTP {status}")
            continue
        written += 1
        after = couch.get_doc(db, note_id)
        if after is None:
            problems.append(f"{db}/{note_id}: no se pudo releer")
            continue
        changed = [k for k in before if after.get(k) != before[k]]
        if changed:
            problems.append(f"{db}/{note_id}: cambió {', '.join(changed)}")
        if (after.get("frontmatter") != plan["frontmatter_new"] or after.get("content") != plan["content_new"]
                or validate_general(after.get("frontmatter") or {}) is not None or plan_note(after) is not None):
            problems.append(f"{db}/{note_id}: lo releído no es lo esperado")

    print(f"Escritas: {written} | 409 (cambió entretanto): {conflicts} | omitidas por conflictos: {conflicted} | "
          f"omitidas por cambio de revisión: {skipped} | errores de escritura: {len(errors)}"
          + (" | (dry-apply: no se escribió nada)" if dry_apply else ""))
    for line in problems + errors:
        print("  ", line)
    if problems:
        return 3
    return 4 if errors else 0


def run_rollback(couch, backup_file: Path, dry_run: bool = False) -> int:
    """Devuelve el cuerpo y los atributos originales SOLO de las notas que siguen exactamente como las dejó la
    migración; una nota editada después no se toca. Códigos: 0 bien, 3 diferencia releída, 4 error."""
    backup = json.loads(backup_file.read_text(encoding="utf-8"))
    restored = untouched = edited = missing = 0
    problems: list[str] = []
    errors: list[str] = []
    for db, docs in backup["docs"].items():
        for old in docs:
            current = couch.get_doc(db, old["_id"])
            if current is None:
                missing += 1
                continue
            if current.get("frontmatter") == old.get("frontmatter") and current.get("content") == old.get("content"):
                untouched += 1
                continue
            plan = plan_note(old)
            if not plan or not plan["ok"] or current.get("frontmatter") != plan["frontmatter_new"] or current.get("content") != plan["content_new"]:
                edited += 1
                continue
            if dry_run:
                restored += 1
                continue
            before = _without(current, _REWRITTEN)
            doc = {**current, "content": old.get("content")}
            if "frontmatter" in old:
                doc["frontmatter"] = old["frontmatter"]
            else:
                doc.pop("frontmatter", None)
            status, _ = couch.put(db, doc)
            if status not in (200, 201):
                errors.append(f"{db}/{old['_id']}: HTTP {status}")
                continue
            restored += 1
            after = couch.get_doc(db, old["_id"])
            if (after is None or after.get("frontmatter") != old.get("frontmatter") or after.get("content") != old.get("content")
                    or any(after.get(k) != before[k] for k in before)):
                problems.append(f"{db}/{old['_id']}: lo releído no es lo esperado")
    print(f"Restauradas: {restored} | ya originales: {untouched} | editadas después (no se tocan): {edited} | "
          f"ausentes: {missing} | errores: {len(errors)}" + (" | (dry-run: no se escribió nada)" if dry_run else ""))
    for line in problems + errors:
        print("  ", line)
    return 3 if problems else (4 if errors else 0)


def main() -> None:
    parser = argparse.ArgumentParser(description="H-040: YAML del cuerpo de las notas -> atributos")
    parser.add_argument("--mode", choices=["report", "backup", "apply", "rollback"], required=True)
    parser.add_argument("--report-file", type=Path)
    parser.add_argument("--summary-file", type=Path)
    parser.add_argument("--backup-file", type=Path)
    parser.add_argument("--only-db", type=str)
    parser.add_argument("--dry-apply", action="store_true", help="en apply y rollback: calcula y verifica sin escribir")
    args = parser.parse_args()
    try:
        url, user, password = (os.environ[k] for k in ("COUCHDB_URL", "COUCHDB_USER", "COUCHDB_PASSWORD"))
    except KeyError as missing:
        parser.error(f"falta la variable de entorno {missing}")
    couch = CouchClient(url, user, password)
    try:
        if args.mode == "report":
            if not (args.report_file and args.summary_file):
                parser.error("--report-file y --summary-file son obligatorios en report")
            report = run_report(couch, args.report_file, args.summary_file, args.only_db)
            print(f"con YAML={report['total_con_yaml']} migrables={report['total_migrables']} "
                  f"no_migrables={report['total_no_migrables']} digest={report['plan_digest']}")
            return
        if args.mode == "backup":
            if not args.backup_file:
                parser.error("--backup-file es obligatorio en backup")
            sys.exit(run_backup(couch, args.backup_file, args.only_db))
        if args.mode == "apply":
            if not args.report_file:
                parser.error("--report-file es obligatorio en apply")
            sys.exit(run_apply(couch, args.report_file, args.backup_file, args.dry_apply, args.only_db))
        if not args.backup_file:
            parser.error("--backup-file es obligatorio en rollback")
        sys.exit(run_rollback(couch, args.backup_file, args.dry_apply))
    except CouchError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
