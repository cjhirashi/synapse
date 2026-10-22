"""Filtros del canal de sincronización (SPEC-0005 RF-004, RF-007; PLAN-0005 §2.4).

Funciones puras sobre los cuerpos de CouchDB, sin red: qué ids se replican, qué parámetros
de `_changes` y `_all_docs` llegan a CouchDB, y cómo se recortan `_revs_diff`, `_bulk_get`
y las respuestas que revelarían documentos internos (reservas, `_design/vaults`).
"""
import json

import pytest

from app.core.errors import InvalidSyncRequest, StorageUnavailable, SyncEndpointNotFound
from app.services import sync_filter as sf

VAULT_A = "vault:6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f"
VAULT_B = "vault:00000000-0000-4000-8000-000000000001"


# --- Ids replicables (RF-004, RF-007) ---

@pytest.mark.parametrize("doc_id", [VAULT_A, VAULT_B])
def test_rf_007_canonical_vault_ids_are_replicable(doc_id):
    assert sf.is_replicable_id(doc_id)


@pytest.mark.parametrize("doc_id", [
    "vault-name:mi bóveda",                          # reserva de nombre
    "_design/vaults",                                # vista interna
    "_local/checkpoint",                             # checkpoints: ruta propia
    "vault:6F1C2D3E-4A5B-4C6D-8E9F-0A1B2C3D4E5F",    # UUID no canónico (mayúsculas)
    "vault:6f1c2d3e4a5b4c6d8e9f0a1b2c3d4e5f",        # sin guiones
    "vault:{6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f}",  # con envoltorio
    "vault:",
    "foo",
    "",
    None,
    42,
])
def test_rf_007_other_ids_are_not_replicable(doc_id):
    assert not sf.is_replicable_id(doc_id)


# --- `_changes` (RF-004) ---

def test_rf_004_changes_forces_the_replicated_selector():
    query, body = sf.changes_query({})
    assert query["filter"] == "_selector"
    # SPEC-0008 RF-006 amplió el selector a las notas (`test_note_sync_filter.py`).
    assert body == {"selector": {"_id": {"$regex": "^(vault|note):"}}}


def test_rf_004_changes_keeps_only_whitelisted_parameters():
    query, _ = sf.changes_query({
        "since": "12-abc", "limit": "50", "feed": "longpoll", "heartbeat": "10000",
        "timeout": "30000", "style": "all_docs", "seq_interval": "50",
        "include_docs": "true", "conflicts": "false",
        # Lo que el cliente no puede elegir: se descarta sin error.
        "filter": "_doc_ids", "doc_ids": '["vault-name:x"]', "selector": "{}",
        "view": "vaults/by_created", "attachments": "true",
    })
    assert query == {
        "since": "12-abc", "limit": "50", "feed": "longpoll", "heartbeat": "10000",
        "timeout": "30000", "style": "all_docs", "seq_interval": "50",
        "include_docs": "true", "conflicts": "false", "filter": "_selector",
    }


@pytest.mark.parametrize("name", ["heartbeat", "timeout"])
def test_rf_004_changes_caps_waits_at_sixty_seconds(name):
    query, _ = sf.changes_query({name: "3600000"})
    assert query[name] == "60000"


def test_rf_004_changes_heartbeat_true_means_the_cap():
    query, _ = sf.changes_query({"heartbeat": "true"})
    assert query["heartbeat"] == "60000"


@pytest.mark.parametrize("params, parameter", [
    ({"feed": "continuous"}, "feed"),
    ({"feed": "eventsource"}, "feed"),
    ({"limit": "-1"}, "limit"),
    ({"limit": "diez"}, "limit"),
    ({"seq_interval": "1.5"}, "seq_interval"),
    ({"heartbeat": "-5"}, "heartbeat"),
    ({"timeout": "x"}, "timeout"),
    ({"style": "everything"}, "style"),
    ({"include_docs": "yes"}, "include_docs"),
    ({"conflicts": "1"}, "conflicts"),
])
def test_rf_004_changes_rejects_invalid_parameters(params, parameter):
    with pytest.raises(InvalidSyncRequest) as caught:
        sf.changes_query(params)
    assert [e["parameter"] for e in caught.value.errors] == [parameter]


# --- `_revs_diff` (RF-004, RF-007) ---

def test_rf_007_revs_diff_answers_non_replicable_ids_as_missing_without_asking():
    forward, local = sf.filter_revs_diff_request({
        VAULT_A: ["1-a", "2-b"],
        "vault-name:x": ["1-c"],
        "_design/vaults": ["3-d"],
    })
    assert forward == {VAULT_A: ["1-a", "2-b"]}
    assert local == {"vault-name:x": {"missing": ["1-c"]}, "_design/vaults": {"missing": ["3-d"]}}


@pytest.mark.parametrize("body", [[], "x", {VAULT_A: "1-a"}, {VAULT_A: [1]}, None])
def test_rf_004_revs_diff_rejects_a_malformed_body(body):
    with pytest.raises(InvalidSyncRequest):
        sf.filter_revs_diff_request(body)


# --- `_bulk_get` (RF-004) ---

def test_rf_004_bulk_get_forwards_only_replicable_ids():
    plan = sf.filter_bulk_get_request({"docs": [
        {"id": VAULT_A, "rev": "2-b"},
        {"id": "vault-name:x"},
        {"id": VAULT_B, "atts_since": ["1-a"], "extra": True},
    ]})
    assert plan.forward == {"docs": [{"id": VAULT_A, "rev": "2-b"}, {"id": VAULT_B}]}


def test_rf_004_bulk_get_merges_not_found_in_request_order():
    plan = sf.filter_bulk_get_request({"docs": [
        {"id": "vault-name:x", "rev": "1-c"},
        {"id": VAULT_A},
        {"id": "_design/vaults"},
    ]})
    couch = {"results": [{"id": VAULT_A, "docs": [{"ok": {"_id": VAULT_A, "_rev": "1-a"}}]}]}
    merged = sf.merge_bulk_get_response(plan, couch)
    assert merged == {"results": [
        {"id": "vault-name:x", "docs": [{"error": {
            "id": "vault-name:x", "rev": "1-c", "error": "not_found", "reason": "missing"}}]},
        {"id": VAULT_A, "docs": [{"ok": {"_id": VAULT_A, "_rev": "1-a"}}]},
        {"id": "_design/vaults", "docs": [{"error": {
            "id": "_design/vaults", "rev": "undefined", "error": "not_found", "reason": "missing"}}]},
    ]}


def test_rf_004_bulk_get_with_nothing_replicable_needs_no_couchdb_call():
    plan = sf.filter_bulk_get_request({"docs": [{"id": "vault-name:x"}]})
    assert plan.forward == {"docs": []}
    assert sf.merge_bulk_get_response(plan, {"results": []})["results"][0]["id"] == "vault-name:x"


def test_rf_004_bulk_get_rejects_a_couchdb_answer_of_another_length():
    plan = sf.filter_bulk_get_request({"docs": [{"id": VAULT_A}]})
    with pytest.raises(StorageUnavailable):
        sf.merge_bulk_get_response(plan, {"results": []})


@pytest.mark.parametrize("body", [
    None, [], {}, {"docs": "x"}, {"docs": [{"rev": "1-a"}]}, {"docs": [{"id": 3}]},
    {"docs": [{"id": VAULT_A, "rev": 1}]}, {"docs": ["x"]},
])
def test_rf_004_bulk_get_rejects_a_malformed_body(body):
    with pytest.raises(InvalidSyncRequest):
        sf.filter_bulk_get_request(body)


def test_rf_004_bulk_get_query_keeps_only_revs_and_latest():
    assert sf.bulk_get_query({"revs": "true", "latest": "true", "attachments": "true"}) == {
        "revs": "true", "latest": "true",
    }


def test_rf_004_bulk_get_query_rejects_non_boolean_flags():
    with pytest.raises(InvalidSyncRequest):
        sf.bulk_get_query({"revs": "si"})


# --- `_all_docs` (RF-004) ---

def test_rf_004_all_docs_forces_the_vault_range():
    queries, body = sf.all_docs_query({
        "include_docs": "true", "limit": "10",
        "startkey": '"vault-name:"', "endkey": '"zzz"', "key": '"_design/vaults"',
        "descending": "true", "skip": "3",
    }, None)
    # SPEC-0008 RF-006: un rango por tipo, `note:` antes que `vault:` (el de bóvedas, el último).
    assert queries[-1] == {
        "include_docs": "true", "limit": "10",
        "startkey": json.dumps("vault:"), "endkey": json.dumps("vault:￰"),
    }
    assert body is None


def test_rf_004_all_docs_drops_non_replicable_keys_from_the_body():
    queries, body = sf.all_docs_query({}, {"keys": [VAULT_A, "vault-name:x", "_design/vaults"]})
    assert body == {"keys": [VAULT_A]}
    assert all("startkey" not in q and "endkey" not in q for q in queries)


def test_rf_004_all_docs_drops_non_replicable_keys_from_the_query():
    _, body = sf.all_docs_query({"keys": json.dumps([VAULT_B, "vault-name:y"])}, None)
    assert body == {"keys": [VAULT_B]}


@pytest.mark.parametrize("params, body", [
    ({"keys": "not json"}, None),
    ({"keys": json.dumps("x")}, None),
    ({}, {"keys": [1]}),
    ({}, {"keys": "x"}),
    ({"limit": "-3"}, None),
    ({"include_docs": "maybe"}, None),
])
def test_rf_004_all_docs_rejects_malformed_input(params, body):
    with pytest.raises(InvalidSyncRequest):
        sf.all_docs_query(params, body)


def test_rf_004_all_docs_response_hides_counts_and_internal_rows():
    """`total_rows` y `offset` contarían reservas y `_design/vaults` (como `doc_count`)."""
    couch = {"total_rows": 7, "offset": 3, "rows": [
        {"id": VAULT_A, "key": VAULT_A, "value": {"rev": "1-a"}},
        {"id": "vault-name:x", "key": "vault-name:x", "value": {"rev": "1-c"}},
        {"key": VAULT_B, "error": "not_found"},
    ]}
    assert sf.sanitize_all_docs_response(couch) == {"total_rows": 2, "offset": 0, "rows": [
        {"id": VAULT_A, "key": VAULT_A, "value": {"rev": "1-a"}},
        {"key": VAULT_B, "error": "not_found"},
    ]}


# --- Información de la base (RF-004) ---

def test_rf_004_db_info_exposes_neither_name_nor_counts():
    info = {
        "db_name": "synapse_user_abc", "update_seq": "7-g1", "instance_start_time": "1791",
        "doc_count": 7, "doc_del_count": 0, "sizes": {"file": 1}, "purge_seq": "0-g1",
        "props": {}, "cluster": {"q": 2}, "disk_format_version": 8, "compact_running": False,
    }
    assert sf.sanitize_db_info(info) == {
        "db_name": "db", "update_seq": "7-g1", "instance_start_time": "1791",
    }


# --- Ids de checkpoint `_local` (RF-003, enmienda 1 · VC-1) ---

@pytest.mark.parametrize("local_id", [
    "kV5X.b8w9Vxxc_dQqXvGNg==",   # md5 en base64 de PouchDB (`/`→`.`, `+`→`_`)
    ".Bq1zv4R_2cJ9pYt0lN8wQ==",   # puede empezar por punto
    "2f1a9c0d6b7e4c35",
    "a" * 128,
])
def test_rf_003_pouchdb_checkpoint_ids_are_accepted(local_id):
    assert sf.checkpoint_id(local_id) == local_id


@pytest.mark.parametrize("local_id", ["", ".", "..", "a b", "a/b", "a%2Eb", "ñ", "a" * 129])
def test_rf_003_other_checkpoint_ids_are_not_an_endpoint(local_id):
    with pytest.raises(SyncEndpointNotFound):
        sf.checkpoint_id(local_id)
