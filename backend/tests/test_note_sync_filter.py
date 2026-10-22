"""Filtros del canal con notas (SPEC-0008 RF-006; PLAN-0008 §2.4).

Extienden la lista blanca de SPEC-0005 RF-007 a `note:{vault_id}:{uuid}` canónico y nada más:
funciones puras, sin red.
"""
import json
import re

import pytest

from app.services import sync_filter as sf

VAULT = "vault:6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f"
NOTE = "note:6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f:00000000-0000-4000-8000-000000000001"


# --- Ids replicables (RF-006) ---

@pytest.mark.parametrize("doc_id", [VAULT, NOTE])
def test_rf_006_canonical_vault_and_note_ids_are_replicable(doc_id):
    assert sf.is_replicable_id(doc_id)


@pytest.mark.parametrize("doc_id", [
    "note:6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f",                    # un solo UUID
    "note:6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f:",                   # sin UUID de nota
    "note::00000000-0000-4000-8000-000000000001",                   # sin UUID de bóveda
    NOTE + ":extra",                                                # tercer segmento
    NOTE.upper().replace("NOTE:", "note:"),                         # UUID en mayúsculas
    NOTE.replace("-", ""),                                          # sin guiones
    "note:{6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f}:{00000000-0000-4000-8000-000000000001}",
    "NOTE:6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f:00000000-0000-4000-8000-000000000001",
    "note-path:6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f:nota.md",       # reserva: nunca viaja
    "note-path:" + NOTE[len("note:"):],
    "vault-name:notas",
    "notes/mi-nota.md",                                             # id del diseño original
    "foo",
])
def test_rf_006_other_ids_are_not_replicable(doc_id):
    assert not sf.is_replicable_id(doc_id)


# --- `_changes`: selector fijo ---

def test_rf_006_changes_selector_matches_vaults_and_notes_but_not_note_paths():
    _, body = sf.changes_query({})
    assert body == {"selector": {"_id": {"$regex": "^(vault|note):"}}}
    # `note-path:` no casa con `^note:` (`-` != `:`); se comprueba con el propio patrón.
    pattern = re.compile(body["selector"]["_id"]["$regex"])
    assert pattern.match(NOTE) and pattern.match(VAULT)
    assert not pattern.match("note-path:" + NOTE[len("note:"):])
    assert not pattern.match("vault-name:notas")


# --- `_all_docs`: dos rangos en orden de bytes ---

def test_rf_006_all_docs_asks_for_the_note_range_before_the_vault_range():
    queries, body = sf.all_docs_query({"include_docs": "true", "limit": "10"}, None)
    assert body is None
    assert queries == [
        {"include_docs": "true", "limit": "10",
         "startkey": json.dumps("note:"), "endkey": json.dumps("note:￰")},
        {"include_docs": "true", "limit": "10",
         "startkey": json.dumps("vault:"), "endkey": json.dumps("vault:￰")},
    ]


def test_rf_006_all_docs_ranges_cannot_be_chosen_by_the_client():
    queries, _ = sf.all_docs_query({"startkey": '"note-path:"', "endkey": '"zzz"'}, None)
    assert [q["startkey"] for q in queries] == [json.dumps("note:"), json.dumps("vault:")]


def test_rf_006_all_docs_keys_mode_is_a_single_query_without_ranges():
    queries, body = sf.all_docs_query({}, {"keys": [NOTE, VAULT, "note-path:x:y", "foo"]})
    assert body == {"keys": [NOTE, VAULT]}
    assert len(queries) == 1
    assert "startkey" not in queries[0] and "endkey" not in queries[0]


def test_rf_006_all_docs_response_keeps_notes_and_hides_reservations():
    couch = {"total_rows": 9, "offset": 2, "rows": [
        {"id": NOTE, "key": NOTE, "value": {"rev": "1-a"}},
        {"id": "note-path:x:y", "key": "note-path:x:y", "value": {"rev": "1-b"}},
        {"id": VAULT, "key": VAULT, "value": {"rev": "1-c"}},
    ]}
    response = sf.sanitize_all_docs_response(couch)
    assert [row["id"] for row in response["rows"]] == [NOTE, VAULT]
    assert (response["total_rows"], response["offset"]) == (2, 0)


# --- `_revs_diff` y `_bulk_get` dependen de `is_replicable_id` ---

def test_rf_006_revs_diff_forwards_notes_and_answers_reservations_locally():
    forward, local = sf.filter_revs_diff_request({NOTE: ["1-a"], "note-path:x:y": ["1-b"]})
    assert forward == {NOTE: ["1-a"]}
    assert local == {"note-path:x:y": {"missing": ["1-b"]}}


def test_rf_006_bulk_get_forwards_notes_only():
    plan = sf.filter_bulk_get_request({"docs": [{"id": NOTE}, {"id": "note-path:x:y"}]})
    assert plan.replicable == [True, False]
    assert plan.forward == {"docs": [{"id": NOTE}]}
