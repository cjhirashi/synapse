"""Filtros de lectura del canal de una bóveda compartida (H-064 F7a): qué ve un miembro de la base del propietario.

Funciones puras, sin E/S. La legibilidad se decide siempre en Python con `can_read` (el mismo predicado de notas, tareas y
archivos) sobre el documento que devuelve CouchDB; nunca hay rutas de carpetas en un selector de CouchDB. Lo que no es
legible se responde igual que lo que no existe.
"""
import json
from collections.abc import Mapping
from typing import NamedTuple

from app.core.errors import StorageUnavailable
from app.core.vault_access import MemberAccess, can_read
from app.services import sync_filter

# Documentos por lectura al servidor de documentos: el contenido de una nota puede pesar MiB.
CHANGES_LIMIT = 100
ALL_DOCS_BATCH = 50

_VAULT_FIELDS = ("_id", "_rev", "_revisions", "type", "name", "description", "icon", "owner_id", "created_at", "updated_at", "deleted_at")


def belongs(vault_id: str, doc_id: object) -> bool:
    """¿El id es el de la bóveda o el de una de sus notas? Todo lo demás (otras bóvedas, reservas, internos) → no."""
    if not isinstance(doc_id, str):
        return False
    if doc_id == f"vault:{vault_id}":
        return True
    return doc_id.startswith(f"note:{vault_id}:") and sync_filter.is_replicable_id(doc_id)


def readable(access: MemberAccess, vault_id: str, doc: object) -> bool:
    """La bóveda siempre; una nota solo si su `path` es legible con las concesiones; cualquier otra cosa, no."""
    if not isinstance(doc, dict) or not belongs(vault_id, doc.get("_id")):
        return False
    if doc["_id"] == f"vault:{vault_id}":
        return True
    path = doc.get("path")
    return isinstance(path, str) and can_read(access, path)


def project(doc: dict) -> dict:
    """La bóveda llega reducida (sin etiquetas ni catálogo de atributos); una nota, tal cual."""
    if not str(doc.get("_id", "")).startswith("vault:"):
        return doc
    return {**{key: doc[key] for key in _VAULT_FIELDS if key in doc}, "tags": [], "attributes": None}


def _missing(doc_id: str, rev: str | None) -> dict:
    """Respuesta de `_bulk_get` para un id que no existe: la misma que para uno no legible."""
    return {"id": doc_id, "docs": [{"error": {"id": doc_id, "rev": rev or "undefined", "error": "not_found", "reason": "missing"}}]}


# --- `_changes` ---

def changes_query(params: Mapping[str, str], vault_id: str) -> tuple[dict[str, str], dict, bool]:
    """Query y cuerpo para CouchDB y si el cliente pidió los documentos.

    El selector solo filtra por id (la bóveda y sus notas): la ruta se evalúa después, en Python, para lo cual se piden
    siempre los documentos. El tamaño del lote queda acotado.
    """
    query, _ = sync_filter.changes_query(params)
    wants_docs = query.get("include_docs") == "true"
    limit = query.get("limit")
    query["limit"] = str(CHANGES_LIMIT if limit is None else min(int(limit), CHANGES_LIMIT))
    query["include_docs"] = "true"
    return query, {"selector": {"_id": {"$regex": f"^(vault:{vault_id}$|note:{vault_id}:)"}}}, wants_docs


def filter_changes(access: MemberAccess, vault_id: str, couch: object, wants_docs: bool) -> dict:
    """Solo los cambios de documentos legibles; `last_seq` se conserva para que el replicador avance aunque se omitan."""
    if not isinstance(couch, dict) or not isinstance(couch.get("results"), list):
        raise StorageUnavailable("unexpected _changes response")
    results = []
    for entry in couch["results"]:
        doc = entry.get("doc") if isinstance(entry, dict) else None
        if not isinstance(doc, dict) or not readable(access, vault_id, doc):
            continue
        kept = {key: value for key, value in entry.items() if key != "doc"}
        if wants_docs:
            kept["doc"] = project(doc)
        results.append(kept)
    out = {"results": results, "last_seq": couch.get("last_seq")}
    if "pending" in couch:
        out["pending"] = couch["pending"]
    return out


# --- `_revs_diff` ---

def filter_revs_diff_request(body: object, vault_id: str) -> tuple[dict[str, list[str]], dict[str, dict]]:
    """Solo los ids de esta bóveda se preguntan a CouchDB; los demás se dan por ausentes sin consultarlos."""
    forward, local = sync_filter.filter_revs_diff_request(body)
    kept = {doc_id: revs for doc_id, revs in forward.items() if belongs(vault_id, doc_id)}
    local.update({doc_id: {"missing": revs} for doc_id, revs in forward.items() if doc_id not in kept})
    return kept, local


# --- `_bulk_get` ---

def filter_bulk_get_request(body: object, vault_id: str) -> sync_filter.BulkGetPlan:
    """El plan del canal propio con solo los ids de esta bóveda como reenviables."""
    plan = sync_filter.filter_bulk_get_request(body)
    replicable = [ok and belongs(vault_id, doc["id"]) for doc, ok in zip(plan.requested, plan.replicable)]
    forward = {"docs": [doc for doc, ok in zip(plan.requested, replicable) if ok]}
    return sync_filter.BulkGetPlan(plan.requested, replicable, forward)


def filter_bulk_get_response(access: MemberAccess, vault_id: str, plan: sync_filter.BulkGetPlan, couch: dict) -> dict:
    """Un resultado por pedido y en su orden: el documento legible, o `not_found` (igual que si no existiera)."""
    couch_results = couch.get("results", [])
    if len(couch_results) != len(plan.forward["docs"]):
        raise StorageUnavailable("unexpected _bulk_get response length")
    pending = iter(couch_results)
    results = []
    for requested, forwarded in zip(plan.requested, plan.replicable):
        if not forwarded:
            results.append(_missing(requested["id"], requested.get("rev")))
            continue
        result = next(pending)
        docs = []
        for item in result.get("docs", []):
            ok = item.get("ok")
            if ok is None:
                docs.append(item)
            elif readable(access, vault_id, ok):
                docs.append({"ok": project(ok)})
            else:
                docs.append(_missing(requested["id"], requested.get("rev"))["docs"][0])
        results.append({**result, "docs": docs})
    return {"results": results}


# --- `_all_docs` ---

class AllDocsPlan(NamedTuple):
    wants_docs: bool
    limit: int | None
    keys: list[str] | None  # None = todo lo de la bóveda; lista = solo esos ids (ya filtrados por pertenencia)


def all_docs_plan(params: Mapping[str, str], body: dict | None, vault_id: str) -> AllDocsPlan:
    """Qué listar: el rango de la bóveda o las claves pedidas que son suyas. Rango, `skip` y demás del cliente se descartan."""
    queries, forward = sync_filter.all_docs_query(params, body)
    query = queries[0]
    limit = int(query["limit"]) if "limit" in query else None
    keys = None if forward is None else [key for key in forward["keys"] if belongs(vault_id, key)]
    return AllDocsPlan(query.get("include_docs") == "true", limit, keys)


def note_range(vault_id: str) -> dict[str, str]:
    """Rango de las notas de esta bóveda en el orden de bytes de CouchDB."""
    prefix = f"note:{vault_id}:"
    return {"startkey": json.dumps(prefix), "endkey": json.dumps(prefix + "￰")}


def filter_all_docs_rows(access: MemberAccess, vault_id: str, rows: list[dict], wants_docs: bool) -> list[dict]:
    """Filas con documento legible; sin `doc` si el cliente no lo pidió (se pidió siempre para evaluar la ruta)."""
    kept = []
    for row in rows:
        doc = row.get("doc")
        if not readable(access, vault_id, doc):
            continue
        kept.append({**row, "doc": project(doc)} if wants_docs else {key: value for key, value in row.items() if key != "doc"})
    return kept
