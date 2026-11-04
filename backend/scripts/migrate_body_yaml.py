#!/usr/bin/env python3
"""H-040: migra el bloque YAML al inicio del cuerpo de las notas a atributos.

Por ahora solo el modo `report` (ensayo en seco, NO escribe nada): cuenta por bóveda las notas que empiezan por
un bloque YAML, las migrables y las no migrables (con motivo), el mapeo de claves y los valores del YAML que
no se guardarían (conflicto con un atributo existente). `apply`/`backup`/`rollback` se añaden tras la
confirmación de Carlos.

Uso: COUCHDB_URL=… COUCHDB_USER=… COUCHDB_PASSWORD=… python scripts/migrate_body_yaml.py --mode report \
        --report-file informe.json --summary-file resumen.md [--only-db synapse_user_xxx]
"""
import argparse
import hashlib
import json
import os
import sys
from base64 import b64encode
from collections import Counter, defaultdict
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.attribute_rules import normalize_key  # noqa: E402
from app.core.body_yaml import plan_note  # noqa: E402
from app.core.index_rules import is_index_path  # noqa: E402

_ALIASES = {"title": "titulo", "description": "descripcion", "etiquetas": "tags", "status": "estado"}
_STANDARD = {"titulo", "descripcion", "tags", "estado"}


class CouchError(Exception):
    """CouchDB no respondió como se esperaba; la herramienta se detiene en lugar de seguir a medias."""


class CouchClient:
    """Cliente mínimo de CouchDB (solo lectura en este modo)."""

    def __init__(self, url: str, user: str, password: str):
        self.url = url.rstrip("/")
        self._auth = b64encode(f"{user}:{password}".encode()).decode()

    def _get(self, path: str) -> dict:
        req = Request(f"{self.url}/{path}", headers={"Authorization": f"Basic {self._auth}"}, method="GET")
        try:
            with urlopen(req, timeout=120) as resp:
                return json.loads(resp.read())
        except Exception as e:
            raise CouchError(f"GET {path}: {e}") from e

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
                keys[key][target if target in _STANDARD or target in ("fecha_creacion", "fecha_actualizacion") else "(atributo libre)"] += 1
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


def main() -> None:
    parser = argparse.ArgumentParser(description="H-040: YAML del cuerpo de las notas -> atributos")
    parser.add_argument("--mode", choices=["report"], required=True)
    parser.add_argument("--report-file", type=Path, required=True)
    parser.add_argument("--summary-file", type=Path, required=True)
    parser.add_argument("--only-db", type=str)
    args = parser.parse_args()
    try:
        url, user, password = (os.environ[k] for k in ("COUCHDB_URL", "COUCHDB_USER", "COUCHDB_PASSWORD"))
    except KeyError as missing:
        parser.error(f"falta la variable de entorno {missing}")
    try:
        report = run_report(CouchClient(url, user, password), args.report_file, args.summary_file, args.only_db)
    except CouchError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    print(f"con YAML={report['total_con_yaml']} migrables={report['total_migrables']} "
          f"no_migrables={report['total_no_migrables']} digest={report['plan_digest']}")


if __name__ == "__main__":
    main()
