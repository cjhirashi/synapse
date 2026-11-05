#!/usr/bin/env python3
"""H-030b: lleva las carpetas de bitácora y plantillas que ya existen a las carpetas reservadas BITACORA y PLANTILLAS.

Sin `--apply` solo informa (en seco, solo lectura) y escribe el informe con las rutas viejas -> nuevas. Con `--apply`
escribe y guarda en el informe cómo estaba cada nota (`antes`), de modo que `--revert informe.json` lo deshace.

Qué hace, por bóveda:
1. Mayúsculas: una carpeta reservada escrita con otras mayúsculas (`Plantillas/...`) pasa a su forma canónica.
2. Conversión de plantillas (`CONVERSIONES`): cada nota de una carpeta de plantillas heredada pasa a
   `PLANTILLAS/plantilla-<nombre>.md` con la definición (`alcance`, `atributos`, `estilo`) que exige el servidor. Sin
   pérdida: los metadatos propios de la plantilla que no son generales pasan a `atributos` con su valor; el cuerpo no se toca.
3. Bitácoras manuales heredadas: pasan, intactas, a `BITACORA/HISTORICO/` (historial anterior a la bitácora automática).
4. El INDICE de una carpeta heredada que queda vacía se manda a la papelera; los de las carpetas nuevas se crean.
5. Se reescriben los wikilinks de la bóveda que apuntaban a las rutas viejas (mismo servicio que mover una carpeta).
6. La descripción de los INDICES de las cinco carpetas reservadas se pone al día; el registro de `aira` en
   `AG - AGENTES` cambia sus carpetas heredadas (`00- BITACORA`, `01 - PLANTILLAS`) por `PLANTILLAS`.

Los cambios constan en el registro de cambios con autor «sistema». Uso (dentro del contenedor):
    python scripts/h030b_migrate.py [--apply] [--email correo] [--report ruta.json]
    python scripts/h030b_migrate.py --revert ruta.json
"""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from h030_common import active_vaults, user_dbs

from app.adapters.vault_repository import VaultRepository
from app.core import ag_rules, plantilla_rules as pl
from app.core.attribute_rules import normalize_key, validate_general
from app.core.index_rules import folder_of, is_index_path
from app.core.note_dates import stamp_dates, today_cdmx
from app.core.note_rules import check_frontmatter, check_path, path_key
from app.core.timestamps import utc_now
from app.core.wikilink_rewrite import Rename
from app.services.change_log_service import SYSTEM, ChangeLogService
from app.services.note_content_service import NoteContentService
from app.services.note_service import NoteService
from app.services.wikilink_rewrite_service import WikilinkRewriteService

# (bóveda, carpeta heredada) -> qué es. `plantillas`: se convierten; `bitacora`: pasan a BITACORA/HISTORICO.
# Solo lo que Carlos ordenó migrar. Las demás carpetas con nombres parecidos (`02 PLANTILLAS`, `05 BITACORA`,
# `00 - PLANTILLAS`, `01 Plantillas` de Carrera) son de otros agentes y no se tocan: salen en «sin_tocar».
CONVERSIONES = {
    ("Proyectos", "01 - PLANTILLAS"): "plantillas",
    ("Proyectos", "00- BITACORA"): "bitacora",
    ("Personal", "Plantillas"): "plantillas",
    ("Carrera", "Plantillas"): "plantillas",
}
HISTORICO = f"{ag_rules.BITACORA}/HISTORICO"
OLD_DESCRIPTIONS = (
    "reservada; su lógica llega con H-030b",
)
REGISTRY_FIX = {"00- BITACORA": None, "01 - PLANTILLAS": "PLANTILLAS"}  # None = quitar (BITACORA no la escribe nadie)


def slug(file_name: str) -> str:
    """`Plantilla - Cover Letter.md` -> `cover-letter`; `1 - PL - Base.md` -> `base`."""
    base = file_name[:-3] if file_name.lower().endswith(".md") else file_name
    base = unicodedata.normalize("NFD", base)
    base = "".join(c for c in base if not unicodedata.combining(c)).lower()
    base = re.sub(r"^\s*\d+\s*[-–—]\s*", "", base)
    base = re.sub(r"^\s*(pl|plantilla)\s*[-–—]\s*", "", base)
    return re.sub(r"[^a-z0-9]+", "-", base).strip("-")[:56]


def _type_of(value) -> str | None:
    if isinstance(value, bool):
        return "booleano"
    if isinstance(value, (int, float)):
        return "numero"
    if isinstance(value, list) and all(isinstance(x, str) for x in value):
        return "lista"
    if isinstance(value, str):
        return "fecha" if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) else "texto"
    return "texto" if value is None else None


def convert_frontmatter(old: dict) -> tuple[dict, list[str]]:
    """Definición de plantilla a partir del frontmatter heredado. Devuelve `(frontmatter, avisos)`."""
    keep, atributos, avisos = {}, [], []
    for key, value in (old or {}).items():
        if key in ("fecha_creacion", "fecha_actualizacion") and validate_general({key: value}) is None:
            keep[key] = value
        elif key in ("titulo", "descripcion", "tags", "estado") and validate_general({key: value}) is None:
            keep[key] = value
        else:
            name, tipo = normalize_key(key), _type_of(value)
            if name is None or name in pl.NOT_EXTRA or tipo is None or any(a["nombre"] == name for a in atributos):
                avisos.append(f"metadato «{key}» no cabe como atributo: {value!r}")
                continue
            item = {"nombre": name, "tipo": tipo}
            if value is not None:
                item["valor"] = value
            atributos.append(item)
    keep.update({"alcance": ["*"], "atributos": atributos, "estilo": {"publicar": {}, "pdf": {}}})
    return keep, avisos


def canonical_path(path: str) -> str:
    """`Plantillas/x.md` -> `PLANTILLAS/x.md` (solo el primer segmento y solo si es una reservada mal escrita)."""
    if "/" not in path:
        return path
    first, rest = path.split("/", 1)
    canonical = ag_rules.meta_folder_of(path)
    return f"{canonical}/{rest}" if canonical is not None and first != canonical else path


def plan_vault(vault_name: str, notes: list[dict]) -> dict:
    """Operaciones previstas para una bóveda: `mover` (nota, ruta nueva, frontmatter nuevo), `papelera` (INDICES),
    `descripciones` y `sin_tocar`."""
    moves, trash, untouched, warnings = [], [], [], []
    old_folders = {f for (v, f) in CONVERSIONES if v == vault_name}
    for doc in sorted(notes, key=lambda d: d["path"]):
        path = doc["path"]
        first = path.split("/", 1)[0] if "/" in path else None
        kind = CONVERSIONES.get((vault_name, first)) if first else None
        if kind is not None and first in old_folders:
            rest = path.split("/", 1)[1]
            if is_index_path(path):
                if "/" not in rest:
                    trash.append(doc)
                continue
            if kind == "plantillas":
                name = slug(rest)
                new_path = pl.template_path(name)
                fm, avisos = convert_frontmatter(doc.get("frontmatter") or {})
                warnings += [f"{path}: {a}" for a in avisos]
                moves.append({"doc": doc, "new_path": new_path, "frontmatter": fm, "tipo": "plantilla"})
            else:
                moves.append({"doc": doc, "new_path": f"{HISTORICO}/{rest}", "frontmatter": None, "tipo": "bitacora"})
            continue
        fixed = canonical_path(path)
        if fixed != path:
            moves.append({"doc": doc, "new_path": fixed, "frontmatter": None, "tipo": "mayusculas"})
        elif first and any(k in path_key(first) for k in ("plantilla", "bitacora")) and ag_rules.meta_folder_of(path) is None:
            untouched.append(path)
    # Colisiones: dos notas a la misma ruta nueva, o una ruta nueva ya ocupada por otra nota que no se mueve.
    moving_ids = {m["doc"]["_id"] for m in moves}
    seen: dict[str, str] = {}
    for m in moves:
        key = path_key(m["new_path"])
        holder = next((d for d in notes if path_key(d["path"]) == key and d["_id"] != m["doc"]["_id"]), None)
        if key in seen or (holder is not None and holder["_id"] not in moving_ids and not (
                is_index_path(m["new_path"]) and m["tipo"] == "mayusculas")):
            m["colision"] = True
        seen[key] = m["doc"]["path"]
    return {"moves": moves, "trash": trash, "sin_tocar": sorted({p.split('/')[0] for p in untouched}), "avisos": warnings}


def run(port, db, owner_id, apply: bool) -> list[dict]:
    report = []
    for vault in active_vaults(port, db):
        vault_id = vault["_id"].split(":", 1)[1]
        service = NoteContentService(port, db)
        notes = service._live_paths(vault_id)
        plan = plan_vault(vault["name"], notes)
        entry = {
            "bóveda": vault["name"], "vault_id": vault_id,
            "mover": [{"id": m["doc"]["_id"], "tipo": m["tipo"], "antes": m["doc"]["path"], "después": m["new_path"],
                       "colisión": bool(m.get("colision"))} for m in plan["moves"]],
            "papelera": [d["path"] for d in plan["trash"]],
            "sin_tocar": plan["sin_tocar"], "avisos": plan["avisos"], "aplicado": apply,
            "respaldo": [],  # solo con --apply: estado previo de cada documento tocado
        }
        report.append(entry)
        if not apply:
            continue
        if any(m.get("colision") for m in plan["moves"]):
            entry["error"] = "colisión de rutas: no se aplica nada en esta bóveda"
            continue
        _apply_vault(port, db, owner_id, vault_id, plan, entry)
    return report


def _apply_vault(port, db, owner_id, vault_id, plan, entry) -> None:
    notes_svc = NoteService(port, db)
    content = NoteContentService(port, db)
    log = ChangeLogService(port, db, owner_id, None, via="system", author=SYSTEM)
    renames: dict[str, Rename] = {}
    for m in plan["moves"]:
        doc, new_path = m["doc"], m["new_path"]
        fresh = port.get(db, doc["_id"])
        if fresh is None or fresh.get("deleted_at"):
            continue
        if (code := check_path(new_path)) is not None:
            raise SystemExit(f"ruta nueva inválida {new_path!r}: {code}")
        frontmatter = m["frontmatter"] if m["frontmatter"] is not None else fresh.get("frontmatter")
        if m["tipo"] == "plantilla" and (code := pl.check_definition(frontmatter)) is not None:
            raise SystemExit(f"{doc['path']}: la definición convertida no es válida ({code})")
        if frontmatter and (code := check_frontmatter(frontmatter)) is not None:
            raise SystemExit(f"{doc['path']}: frontmatter convertido inválido ({code})")
        entry["respaldo"].append({"id": fresh["_id"], "path": fresh["path"], "frontmatter": fresh.get("frontmatter"),
                                  "deleted_at": fresh.get("deleted_at")})
        notes_svc.reserve_path(fresh["_id"], new_path)
        updated = {**fresh, "path": new_path, "updated_at": utc_now(),
                   "frontmatter": stamp_dates(frontmatter, today_cdmx(), fresh.get("created_at"))}
        pending = log.begin(vault_id, fresh, updated)
        rev = port.put(db, updated)
        log.confirm(pending, rev)
        if path_key(fresh["path"]) != path_key(new_path):  # misma clave = misma reserva: no se libera
            notes_svc.release_path(fresh["_id"], fresh["path"])
        renames[fresh["_id"]] = Rename(fresh["path"], new_path)
    for doc in plan["trash"]:
        fresh = port.get(db, doc["_id"])
        if fresh is None or fresh.get("deleted_at"):
            continue
        entry["respaldo"].append({"id": fresh["_id"], "path": fresh["path"], "frontmatter": fresh.get("frontmatter"),
                                  "deleted_at": None})
        port.put(db, {**fresh, "deleted_at": utc_now(), "updated_at": utc_now()})
        notes_svc.release_path(fresh["_id"], fresh["path"])
    for m in plan["moves"]:
        content.ensure_indexes(vault_id, m["new_path"])
    if renames:
        report = WikilinkRewriteService(port, db).rewrite(vault_id, renames)
        entry["wikilinks"] = report.header()
    if any(m["tipo"] == "bitacora" for m in plan["moves"]):
        _describe(port, db, content, vault_id, f"{HISTORICO}/INDICE.md",
                  "Bitácoras manuales anteriores a la bitácora automática. Solo lectura.")
    entry["descripciones"] = _fix_descriptions(port, db, content, vault_id)
    if entry["bóveda"] == "Proyectos":
        entry["registro"] = _fix_registry(port, db, content, vault_id)
    log.flush()


def _describe(port, db, content: NoteContentService, vault_id: str, index_path: str, text: str) -> None:
    for doc in content._live_paths(vault_id):
        if path_key(doc["path"]) == path_key(index_path) and not (doc.get("frontmatter") or {}).get("descripcion"):
            port.put(db, {**doc, "updated_at": utc_now(), "frontmatter": stamp_dates(
                {**(doc.get("frontmatter") or {}), "descripcion": text}, today_cdmx(), doc.get("created_at"))})


def _fix_descriptions(port, db, content: NoteContentService, vault_id: str) -> list[str]:
    """Pone al día la `descripcion` del INDICE de cada carpeta reservada que no la tiene o conserva el texto de H-030."""
    done = []
    for doc in content._live_paths(vault_id):
        folder = folder_of(doc["path"]) if is_index_path(doc["path"]) else None
        if not folder or not ag_rules.is_meta_folder(folder):
            continue
        wanted = ag_rules.FOLDER_DESCRIPTIONS[ag_rules.META_FOLDERS[[path_key(n) for n in ag_rules.META_FOLDERS].index(path_key(folder))]]
        fm = doc.get("frontmatter") or {}
        current = fm.get("descripcion")
        if current == wanted or (current and not any(old in current for old in OLD_DESCRIPTIONS)):
            continue
        port.put(db, {**doc, "updated_at": utc_now(),
                      "frontmatter": stamp_dates({**fm, "descripcion": wanted}, today_cdmx(), doc.get("created_at"))})
        done.append(doc["path"])
    return done


def _fix_registry(port, db, content: NoteContentService, vault_id: str) -> str | None:
    for doc in content._live_paths(vault_id):
        if path_key(doc["path"]) != path_key("AG - AGENTES/aira.md"):
            continue
        fm = doc.get("frontmatter") or {}
        carpetas = fm.get("carpetas")
        if not isinstance(carpetas, list):
            return None
        new = []
        for c in carpetas:
            target = REGISTRY_FIX.get(c, c)
            if target is not None and target not in new:
                new.append(target)
        if new == carpetas:
            return None
        port.put(db, {**doc, "updated_at": utc_now(),
                      "frontmatter": stamp_dates({**fm, "carpetas": new}, today_cdmx(), doc.get("created_at"))})
        return f"{carpetas} -> {new}"
    return None


def revert(report_path: str) -> None:
    """Deshace un informe aplicado: cada nota vuelve a su ruta y frontmatter anteriores y los INDICES vuelven de la
    papelera. Si el INDICE que creó el servidor ocupa la ruta que hay que recuperar, ese INDICE se manda a la papelera."""
    report = json.loads(Path(report_path).read_text())
    port = VaultRepository()
    for entry in report:
        for _owner, _email, db in user_dbs():
            if port.get(db, f"vault:{entry['vault_id']}") is None:
                continue
            notes_svc = NoteService(port, db)
            content = NoteContentService(port, db)
            live = {path_key(d["path"]): d for d in content._live_paths(entry["vault_id"])}
            # Primero las notas movidas y al final los INDICES (su ruta puede estar ocupada por uno automático).
            ordered = sorted(entry.get("respaldo", []), key=lambda b: is_index_path(b["path"]))
            for before in ordered:
                doc = port.get(db, before["id"])
                if doc is None:
                    continue
                holder = live.get(path_key(before["path"]))
                if holder is not None and holder["_id"] != doc["_id"]:
                    if not is_index_path(holder["path"]):
                        raise SystemExit(f"{before['path']}: la ruta está ocupada por otra nota ({holder['_id']})")
                    port.put(db, {**holder, "deleted_at": utc_now(), "updated_at": utc_now()})
                    notes_svc.release_path(holder["_id"], holder["path"])
                    live.pop(path_key(holder["path"]), None)
                notes_svc.reserve_path(doc["_id"], before["path"])
                if not doc.get("deleted_at") and path_key(doc["path"]) != path_key(before["path"]):
                    notes_svc.release_path(doc["_id"], doc["path"])
                    live.pop(path_key(doc["path"]), None)
                restored = {**doc, "path": before["path"], "deleted_at": before["deleted_at"], "updated_at": utc_now(),
                            "frontmatter": before["frontmatter"]}
                port.put(db, restored)
                if before["deleted_at"] is None:
                    live[path_key(before["path"])] = restored
            print(f"{entry['bóveda']}: {len(entry.get('respaldo', []))} documentos restaurados")
    print("# Los wikilinks reescritos y las descripciones de INDICE no se revierten solos: usa el respaldo de CouchDB si hace falta.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="escribe; sin esto solo informa")
    parser.add_argument("--email", help="limita a un usuario")
    parser.add_argument("--report", default="/tmp/h030b-informe.json", help="dónde guardar el informe")
    parser.add_argument("--revert", help="deshace el informe indicado")
    args = parser.parse_args()
    if args.revert:
        revert(args.revert)
        return 0
    port = VaultRepository()
    report = []
    for user_id, email, db in user_dbs(args.email):
        for entry in run(port, db, user_id, args.apply):
            report.append({"usuario": email, **entry})
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=1))
    for entry in report:
        if not (entry["mover"] or entry["papelera"] or entry["sin_tocar"]):
            continue
        print(f"## {entry['usuario']} · {entry['bóveda']}")
        for m in entry["mover"]:
            print(f"  {m['tipo']:<10} {m['antes']}  ->  {m['después']}" + ("   ¡COLISIÓN!" if m["colisión"] else ""))
        for p in entry["papelera"]:
            print(f"  papelera   {p}")
        if entry["sin_tocar"]:
            print(f"  sin tocar (carpetas de otros agentes): {entry['sin_tocar']}")
        for a in entry["avisos"]:
            print(f"  aviso: {a}")
        if entry.get("error"):
            print(f"  ERROR: {entry['error']}")
    print(f"# informe: {args.report}; aplicado: {args.apply}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
