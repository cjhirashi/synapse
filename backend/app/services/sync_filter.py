"""Filtros del canal de sincronización (SPEC-0005 RF-004, RF-007; PLAN-0005 §2.4).

Funciones puras sobre los parámetros y cuerpos del protocolo de replicación de CouchDB.
Deciden qué llega a CouchDB y qué ve el cliente: sólo se replican las bóvedas
(`vault:{uuid}` canónico); las reservas `vault-name:*` y `_design/vaults` nunca salen, y
ninguna respuesta cuenta documentos (eso revelaría las reservas).

Regla común de parámetros: lo que no está en la lista blanca se **descarta** sin error (el
cliente no puede elegir filtro, vista ni selector); lo que está pero no tiene un valor
válido → `InvalidSyncRequest` (422) con un texto fijo por parámetro.
"""
import json
from collections.abc import Mapping
from typing import NamedTuple

from app.core.errors import InvalidSyncRequest, StorageUnavailable
from app.services.vault_service import is_canonical_uuid

VAULT_PREFIX = "vault:"

# Selector fijo de `_changes` (filtro `_selector` de CouchDB): sólo documentos de bóveda.
VAULT_SELECTOR = {"_id": {"$regex": "^" + VAULT_PREFIX}}

# Esperas de `_changes` acotadas (ms): un `longpoll` nunca retiene la conexión más de 60 s.
MAX_WAIT_MS = 60_000

# Rango de `_all_docs` con orden de bytes de CouchDB: incluye todo `vault:*` y nada más
# (`vault-name:*` queda antes porque `-` < `:`).
_ALL_DOCS_RANGE = {
    "startkey": json.dumps(VAULT_PREFIX),
    "endkey": json.dumps(VAULT_PREFIX + "￰"),
}

_BOOLEANS = {"true", "false"}


def is_replicable_id(doc_id: object) -> bool:
    """¿El documento viaja por el canal? Sólo bóvedas con id canónico (RF-004, RF-007)."""
    return (
        isinstance(doc_id, str)
        and doc_id.startswith(VAULT_PREFIX)
        and is_canonical_uuid(doc_id[len(VAULT_PREFIX):])
    )


# --- Validación de parámetros (texto fijo, nunca interpolado con datos del cliente) ---

def _invalid_parameter(name: str, detail: str) -> InvalidSyncRequest:
    return InvalidSyncRequest(f"invalid sync parameter {name}", errors=[{"parameter": name, "detail": detail}])


def _invalid_body(detail: str) -> InvalidSyncRequest:
    return InvalidSyncRequest("invalid sync body", errors=[{"pointer": "#", "detail": detail}])


def _non_negative_int(params: Mapping[str, str], name: str) -> int | None:
    value = params.get(name)
    if value is None:
        return None
    if not value.isascii() or not value.isdigit():
        raise _invalid_parameter(name, "Must be a non-negative integer.")
    return int(value)


def _boolean(params: Mapping[str, str], name: str) -> str | None:
    value = params.get(name)
    if value is not None and value not in _BOOLEANS:
        raise _invalid_parameter(name, "Must be true or false.")
    return value


def _choice(params: Mapping[str, str], name: str, allowed: set[str]) -> str | None:
    value = params.get(name)
    if value is not None and value not in allowed:
        raise _invalid_parameter(name, "Unsupported value.")
    return value


def _wait_ms(params: Mapping[str, str], name: str) -> str | None:
    """`heartbeat`/`timeout` en ms, acotados a `MAX_WAIT_MS` (`heartbeat=true` = el tope)."""
    if name == "heartbeat" and params.get(name) == "true":
        return str(MAX_WAIT_MS)
    value = _non_negative_int(params, name)
    return None if value is None else str(min(value, MAX_WAIT_MS))


def _compact(values: dict[str, str | int | None]) -> dict[str, str]:
    """Quita los parámetros ausentes y deja todo como texto de query."""
    return {k: str(v) for k, v in values.items() if v is not None}


# --- `_changes` ---

def changes_query(params: Mapping[str, str]) -> tuple[dict[str, str], dict]:
    """Query y cuerpo de `POST _changes?filter=_selector` a partir de los del cliente.

    El cuerpo del cliente no se usa nunca: el selector es siempre `VAULT_SELECTOR`.
    """
    query = _compact({
        "since": params.get("since"),  # secuencia opaca: CouchDB la valida
        "limit": _non_negative_int(params, "limit"),
        "feed": _choice(params, "feed", {"normal", "longpoll"}),
        "heartbeat": _wait_ms(params, "heartbeat"),
        "timeout": _wait_ms(params, "timeout"),
        "style": _choice(params, "style", {"main_only", "all_docs"}),
        "seq_interval": _non_negative_int(params, "seq_interval"),
        "include_docs": _boolean(params, "include_docs"),
        "conflicts": _boolean(params, "conflicts"),
    })
    query["filter"] = "_selector"
    return query, {"selector": VAULT_SELECTOR}


# --- `_revs_diff` ---

def filter_revs_diff_request(body: object) -> tuple[dict[str, list[str]], dict[str, dict]]:
    """Separa lo que se pregunta a CouchDB de lo que se responde aquí como `missing`.

    Un id no replicable se da por ausente sin consultarlo: el push lo rechazará con motivo
    (`invalid-id`, RF-007) y el cliente no sabe si existe en el servidor.
    Devuelve `(cuerpo para CouchDB, respuestas locales)`; la respuesta final es la unión.
    """
    if not isinstance(body, dict) or not all(
        isinstance(revs, list) and all(isinstance(rev, str) for rev in revs)
        for revs in body.values()
    ):
        raise _invalid_body("Expected an object of document ids to revision lists.")
    forward = {doc_id: revs for doc_id, revs in body.items() if is_replicable_id(doc_id)}
    local = {doc_id: {"missing": revs} for doc_id, revs in body.items() if doc_id not in forward}
    return forward, local


# --- `_bulk_get` ---

class BulkGetPlan(NamedTuple):
    """Pedidos originales del cliente y el subconjunto que se reenvía a CouchDB."""

    requested: list[dict]     # [{"id", "rev"?}] en el orden del cliente
    replicable: list[bool]    # por pedido: ¿se reenvía?
    forward: dict             # cuerpo para CouchDB: {"docs": [...]} sólo replicables


def bulk_get_query(params: Mapping[str, str]) -> dict[str, str]:
    """Parámetros de `_bulk_get` admitidos: `revs` y `latest` (no hay adjuntos, RF-005)."""
    return _compact({"revs": _boolean(params, "revs"), "latest": _boolean(params, "latest")})


def filter_bulk_get_request(body: object) -> BulkGetPlan:
    docs = body.get("docs") if isinstance(body, dict) else None
    if not isinstance(docs, list) or not all(
        isinstance(doc, dict)
        and isinstance(doc.get("id"), str)
        and isinstance(doc.get("rev", ""), str)
        for doc in docs
    ):
        raise _invalid_body("Expected {\"docs\": [{\"id\": ..., \"rev\": ...}]}.")
    # Sólo `id` y `rev` llegan a CouchDB (sin `atts_since` ni otras claves del cliente).
    requested = [{k: doc[k] for k in ("id", "rev") if k in doc} for doc in docs]
    replicable = [is_replicable_id(doc["id"]) for doc in requested]
    forward = {"docs": [doc for doc, ok in zip(requested, replicable) if ok]}
    return BulkGetPlan(requested, replicable, forward)


def merge_bulk_get_response(plan: BulkGetPlan, couch: dict) -> dict:
    """Respuesta al cliente en su orden: lo de CouchDB y `not_found` para lo no replicable.

    CouchDB devuelve un resultado por pedido y en el mismo orden; si no, la respuesta no es
    de fiar y se trata como fallo del almacén.
    """
    couch_results = couch.get("results", [])
    if len(couch_results) != len(plan.forward["docs"]):
        raise StorageUnavailable("unexpected _bulk_get response length")
    pending = iter(couch_results)
    results = []
    for doc, ok in zip(plan.requested, plan.replicable):
        if ok:
            results.append(next(pending))
        else:
            results.append({"id": doc["id"], "docs": [{"error": {
                "id": doc["id"], "rev": doc.get("rev", "undefined"),
                "error": "not_found", "reason": "missing",
            }}]})
    return {"results": results}


# --- `_all_docs` ---

def all_docs_query(params: Mapping[str, str], body: dict | None) -> tuple[dict[str, str], dict | None]:
    """Query y cuerpo de `_all_docs`: rango forzado a `vault:*`, o `keys` sin las internas.

    `keys` puede llegar en el cuerpo (`POST`) o en la query (JSON). Rango, `key`, `skip` y
    `descending` del cliente se descartan: sólo se elige qué campos incluir y cuántos.
    """
    query = _compact({
        "include_docs": _boolean(params, "include_docs"),
        "conflicts": _boolean(params, "conflicts"),
        "limit": _non_negative_int(params, "limit"),
    })
    keys = _requested_keys(params, body)
    if keys is None:
        query.update(_ALL_DOCS_RANGE)
        return query, None
    return query, {"keys": [key for key in keys if is_replicable_id(key)]}


def _requested_keys(params: Mapping[str, str], body: dict | None) -> list[str] | None:
    if isinstance(body, dict) and "keys" in body:
        keys = body["keys"]
    elif "keys" in params:
        try:
            keys = json.loads(params["keys"])
        except ValueError:
            raise _invalid_parameter("keys", "Must be a JSON array of document ids.") from None
    else:
        return None
    if not isinstance(keys, list) or not all(isinstance(key, str) for key in keys):
        raise _invalid_parameter("keys", "Must be a JSON array of document ids.")
    return keys


def sanitize_all_docs_response(couch: dict) -> dict:
    """Sólo filas de bóvedas, y sin `total_rows`/`offset` reales (contarían las reservas).

    Una fila de `keys` sin documento no lleva `id`: se mira su `key`.
    """
    rows = [row for row in couch.get("rows", []) if is_replicable_id(row.get("id", row.get("key")))]
    return {"total_rows": len(rows), "offset": 0, "rows": rows}


# --- Información de la base ---

def sanitize_db_info(info: dict) -> dict:
    """Lo mínimo que usa el replicador: ni el nombre real de la base ni recuentos ni tamaños."""
    return {
        "db_name": "db",
        "update_seq": info["update_seq"],
        "instance_start_time": info["instance_start_time"],
    }
