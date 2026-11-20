"""H-064 F7a: `/sync/shared/{vault_id}`, la lectura filtrada de una bóveda compartida para el replicador del invitado.

Lo que importa aquí es lo que NO sale: un documento que el invitado no puede leer no aparece por ningún endpoint ni por
ningún camino (feed, listado, lectura por id), y es indistinguible de uno que no existe.
"""
import json
import uuid
from types import SimpleNamespace

import httpx
import pytest

from app.core import shared_sync_rules as rules
from app.core.config import settings
from app.core.models.user import User
from app.core.vault_access import Grant, MemberAccess
from app.routers import shared_sync
from tests.test_h030_api import agent_client, register, vault_of
from tests.test_h064_invitations_api import invite, person
from tests.test_h064_notes_access import join, put_note
from tests.test_vaults_api import AUTH, assert_problem, stored_docs

PUB_A, PUB_B, PRIV_C, ROOT = "Pub/a.md", "Pub/sub/b.md", "Priv/c.md", "root.md"
NOT_FOUND = "sync-endpoint-not-found"
ALL_PATHS = (PUB_A, PUB_B, PRIV_C, ROOT)


def doc_id(vault: str, note: dict) -> str:
    return f"note:{vault}:{note['id'].split(':')[-1]}"


def owner_db_name(db) -> str:
    return db.query(User).filter(User.email == "cjhirashi@gmail.com").one().couchdb_name


def feed(client, vault, method="get", **params):
    res = getattr(client, method)(f"/sync/shared/{vault}/db/_changes", params=params)
    assert res.status_code == 200, res.text
    return res.json()


def raw_paths(client, vault, **params):
    docs = [row["doc"] for row in feed(client, vault, include_docs="true", **params)["results"]]
    return {d["path"] for d in docs if d["type"] == "note"}


def real(found):
    """Sin los INDICE.md que el servidor genera por carpeta (también se replican si su carpeta es legible)."""
    return {p for p in found if not p.endswith("INDICE.md")}


def seen_paths(client, vault, **params):
    return real(raw_paths(client, vault, **params))


def bulk_get(client, vault, requests, **params):
    res = client.post(f"/sync/shared/{vault}/db/_bulk_get", params=params, json={"docs": requests})
    assert res.status_code == 200, res.text
    return res.json()["results"]


def all_docs(client, vault, method="get", **kwargs):
    res = getattr(client, method)(f"/sync/shared/{vault}/db/_all_docs", **kwargs)
    assert res.status_code == 200, res.text
    return res.json()


def revision_of(owner, vault, note) -> str:
    """La revisión real de una nota, leída por el canal propio del propietario."""
    rows = owner.get("/sync/db/_changes", params={"include_docs": "true"}).json()["results"]
    return next(r["doc"]["_rev"] for r in rows if r["id"] == doc_id(vault, note))


@pytest.fixture
def world(ready_admin, db):
    vault = vault_of(ready_admin, name="Compartida")
    other = vault_of(ready_admin, name="Otra")
    notes = {p: put_note(ready_admin, vault, p) for p in ALL_PATHS}
    other_note = put_note(ready_admin, other, "Pub/ajena.md")
    register(ready_admin, vault, "aira", ["*"])
    ana, ana_m = join(ready_admin, db, vault, "ana@example.com", [{"folder": "Pub", "level": "lectura"}])
    bea, _ = join(ready_admin, db, vault, "bea@example.com", [{"folder": "Pub", "level": "escritura"}, {"folder": "Priv", "level": "lectura"}])
    cam, _ = join(ready_admin, db, vault, "cam@example.com", [{"folder": "*", "level": "lectura"}])
    return SimpleNamespace(owner=ready_admin, vault=vault, other=other, notes=notes, other_note=other_note, ana=ana, ana_m=ana_m, bea=bea, cam=cam, db=db)


# --- Lo que llega por `_changes` ---

def test_changes_carry_the_vault_and_only_the_readable_notes(world):
    w = world
    assert seen_paths(w.ana, w.vault) == {PUB_A, PUB_B}
    assert seen_paths(w.bea, w.vault) == {PUB_A, PUB_B, PRIV_C}
    # `*` lee todo salvo las zonas ocultas del sistema (AG - AGENTES, BITACORA…).
    assert seen_paths(w.cam, w.vault) == {PUB_A, PUB_B, PRIV_C, ROOT}


def test_the_generated_indexes_of_unreadable_folders_do_not_come_out_either(world):
    w = world
    ana_all = raw_paths(w.ana, w.vault)
    assert {"Pub/INDICE.md", "Pub/sub/INDICE.md"} <= ana_all
    assert not {"INDICE.md", "Priv/INDICE.md"} & ana_all
    assert {"INDICE.md", "Priv/INDICE.md"} <= raw_paths(w.cam, w.vault)


def test_changes_never_carry_other_vaults_reservations_or_internal_documents(world):
    w = world
    ids = {row["id"] for row in feed(w.cam, w.vault, include_docs="true")["results"]}
    assert all(rules.belongs(w.vault, i) for i in ids)
    assert doc_id(w.other, w.other_note) not in ids and f"vault:{w.other}" not in ids
    assert not any(i.startswith(("vault-name:", "note-path:", "_design")) for i in ids)


def test_changes_without_include_docs_still_hide_unreadable_notes_and_carry_no_documents(world):
    w = world
    rows = feed(w.ana, w.vault)["results"]
    assert all("doc" not in row for row in rows)
    ids = {r["id"] for r in rows}
    assert {f"vault:{w.vault}", doc_id(w.vault, w.notes[PUB_A]), doc_id(w.vault, w.notes[PUB_B])} <= ids
    assert not ids & {doc_id(w.vault, w.notes[PRIV_C]), doc_id(w.vault, w.notes[ROOT])}


def test_post_changes_ignores_the_selector_and_ids_the_client_sends(world):
    w = world
    res = w.ana.post(f"/sync/shared/{w.vault}/db/_changes", params={"include_docs": "true"},
                     json={"selector": {"_id": {"$gt": None}}, "doc_ids": [doc_id(w.vault, w.notes[PRIV_C])]})
    assert res.status_code == 200
    assert real({r["doc"]["path"] for r in res.json()["results"] if r["doc"]["type"] == "note"}) == {PUB_A, PUB_B}


def test_the_vault_document_arrives_reduced(world):
    w = world
    assert w.owner.patch(f"/vaults/{w.vault}", json={"description": "d", "tags": ["secreto"]}, headers={"If-Match": w.owner.get(f"/vaults/{w.vault}").headers["ETag"]}).status_code == 200
    vault_doc = next(r["doc"] for r in feed(w.ana, w.vault, include_docs="true")["results"] if r["id"] == f"vault:{w.vault}")
    assert vault_doc["name"] == "Compartida" and vault_doc["description"] == "d"
    assert vault_doc["tags"] == [] and vault_doc["attributes"] is None
    assert set(vault_doc) <= set(rules._VAULT_FIELDS) | {"tags", "attributes"}


def test_a_note_the_owner_moves_out_of_the_readable_area_stops_being_emitted(world):
    w = world
    note = w.notes[PUB_A]
    etag = w.owner.get(f"/vaults/{w.vault}/notes/{note['id']}").headers["ETag"]
    moved = w.owner.patch(f"/vaults/{w.vault}/notes/{note['id']}", json={"path": "Priv/movida.md"}, headers={"If-Match": etag})
    assert moved.status_code == 200, moved.text
    assert seen_paths(w.ana, w.vault) == {PUB_B}
    assert seen_paths(w.cam, w.vault) >= {"Priv/movida.md"}
    listed = {r["doc"]["path"] for r in all_docs(w.ana, w.vault, params={"include_docs": "true"})["rows"] if r["doc"]["type"] == "note"}
    assert real(listed) == {PUB_B}


# --- Lectura por id: `_bulk_get` ---

def test_bulk_get_answers_an_unreadable_note_exactly_like_one_that_does_not_exist(world):
    w = world
    unreadable = [(PRIV_C, w.notes[PRIV_C]), (ROOT, w.notes[ROOT])]
    requests = [{"id": doc_id(w.vault, n), "rev": revision_of(w.owner, w.vault, n)} for _, n in unreadable]
    requests.append({"id": doc_id(w.other, w.other_note), "rev": revision_of(w.owner, w.other, w.other_note)})
    requests += [{"id": f"vault:{w.other}", "rev": "1-x"}, {"id": "vault-name:x", "rev": "1-x"}]
    results = bulk_get(w.ana, w.vault, requests)
    ghost = bulk_get(w.ana, w.vault, [{"id": f"note:{w.vault}:{uuid.uuid4()}", "rev": r["rev"]} for r in requests])
    assert len(results) == len(requests)
    for got, wanted, missing in zip(results, requests, ghost):
        assert got["docs"] == [{"error": {"id": wanted["id"], "rev": wanted["rev"], "error": "not_found", "reason": "missing"}}]
        assert got["docs"][0]["error"]["reason"] == missing["docs"][0]["error"]["reason"]
        assert "path" not in json.dumps(got)


def test_bulk_get_returns_the_readable_notes_and_the_reduced_vault(world):
    w = world
    note = w.notes[PUB_A]
    vault_rev = revision_of_vault(w)
    results = bulk_get(w.ana, w.vault, [{"id": doc_id(w.vault, note), "rev": revision_of(w.owner, w.vault, note)}, {"id": f"vault:{w.vault}", "rev": vault_rev}], revs="true")
    note_doc, vault_doc = results[0]["docs"][0]["ok"], results[1]["docs"][0]["ok"]
    assert note_doc["path"] == PUB_A and "_revisions" in note_doc
    assert vault_doc["name"] == "Compartida" and vault_doc["tags"] == [] and vault_doc["attributes"] is None


def revision_of_vault(w) -> str:
    rows = w.owner.get("/sync/db/_changes", params={"include_docs": "true"}).json()["results"]
    return next(r["doc"]["_rev"] for r in rows if r["id"] == f"vault:{w.vault}")


def test_bulk_get_without_revisions_for_an_unreadable_note_leaks_nothing(world):
    w = world
    results = bulk_get(w.ana, w.vault, [{"id": doc_id(w.vault, w.notes[PRIV_C])}])
    assert results[0]["docs"][0]["error"]["error"] == "not_found"
    assert "content" not in json.dumps(results)


# --- Listado: `_all_docs` ---

@pytest.mark.parametrize("who, expected", [("ana", {PUB_A, PUB_B}), ("bea", {PUB_A, PUB_B, PRIV_C}), ("cam", {PUB_A, PUB_B, PRIV_C, ROOT})])
def test_all_docs_lists_only_readable_rows_with_or_without_documents(world, who, expected):
    w = world
    client = getattr(w, who)
    with_docs = all_docs(client, w.vault, params={"include_docs": "true"})
    assert real({r["doc"]["path"] for r in with_docs["rows"] if r["doc"]["type"] == "note"}) == expected
    without = all_docs(client, w.vault)
    assert all("doc" not in row for row in without["rows"])
    note_ids = {doc_id(w.vault, w.notes[p]) for p in expected}
    ids = {r["id"] for r in without["rows"]}
    assert note_ids | {f"vault:{w.vault}"} <= ids
    assert not ids & {doc_id(w.vault, w.notes[p]) for p in ALL_PATHS if p not in expected}
    assert without["total_rows"] == len(without["rows"]) and without["offset"] == 0


def test_all_docs_with_keys_drops_unreadable_foreign_and_internal_ids(world):
    w = world
    keys = [doc_id(w.vault, w.notes[PUB_A]), doc_id(w.vault, w.notes[PRIV_C]), doc_id(w.other, w.other_note), f"vault:{w.other}", "vault-name:x", "_design/vaults"]
    for method, kwargs in (("post", {"json": {"keys": keys}}), ("get", {"params": {"keys": json.dumps(keys)}})):
        rows = all_docs(w.ana, w.vault, method, **kwargs)["rows"]
        assert [r["id"] for r in rows] == [doc_id(w.vault, w.notes[PUB_A])]


def test_all_docs_limit_counts_readable_rows_and_pages_through_unreadable_ones(world, monkeypatch):
    w = world
    monkeypatch.setattr(shared_sync, "ALL_DOCS_BATCH", 2)
    for i in range(5):
        put_note(w.owner, w.vault, f"Priv/n{i}.md")
        put_note(w.owner, w.vault, f"Pub/n{i}.md")
    everything = all_docs(w.ana, w.vault, params={"include_docs": "true"})["rows"]
    paths = [r["doc"]["path"] for r in everything if r["doc"]["type"] == "note"]
    assert real(paths) == {PUB_A, PUB_B, *{f"Pub/n{i}.md" for i in range(5)}} and len(paths) == len(set(paths))
    limited = all_docs(w.ana, w.vault, params={"include_docs": "true", "limit": "3"})["rows"]
    assert len(limited) == 3 and all(r["doc"]["path"].startswith("Pub/") or r["doc"]["type"] == "vault" for r in limited)


def test_all_docs_ignores_the_range_the_client_asks_for(world):
    w = world
    rows = all_docs(w.ana, w.vault, params={"startkey": '"a"', "endkey": '"z"', "descending": "true", "include_docs": "true"})["rows"]
    assert real({r["doc"]["path"] for r in rows if r["doc"]["type"] == "note"}) == {PUB_A, PUB_B}


# --- `_revs_diff` ---

def test_revs_diff_answers_foreign_and_internal_ids_as_missing_without_asking_couch(world):
    w = world
    body = {doc_id(w.other, w.other_note): ["1-aaa"], f"vault:{w.other}": ["1-bbb"], "vault-name:x": ["1-ccc"], "_design/vaults": ["1-ddd"]}
    res = w.ana.post(f"/sync/shared/{w.vault}/db/_revs_diff", json=body)
    assert res.status_code == 200
    assert res.json() == {key: {"missing": revs} for key, revs in body.items()}


# --- Quién entra ---

def endpoints(vault):
    base = f"/sync/shared/{vault}"
    return [("get", f"{base}/db/", None), ("get", f"{base}/db/_changes", None), ("post", f"{base}/db/_changes", {}),
            ("post", f"{base}/db/_revs_diff", {}), ("post", f"{base}/db/_bulk_get", {"docs": []}), ("get", f"{base}/db/_all_docs", None),
            ("post", f"{base}/db/_all_docs", {}), ("get", f"{base}/db/_local/abc", None), ("put", f"{base}/db/_local/abc", {"last_seq": "1"}),
            ("post", f"{base}/db/_bulk_docs", {"docs": [], "new_edits": False}), ("get", f"{base}/db/_nada", None)]


def call(client, method, url, body):
    return getattr(client, method)(url, **({} if body is None else {"json": body}))


def assert_closed(client, vault):
    for method, url, body in endpoints(vault):
        assert_problem(call(client, method, url, body), 404, NOT_FOUND)


def test_a_stranger_the_owner_and_a_malformed_id_get_404_everywhere(world):
    w = world
    stranger = person(w.owner, w.db, "extrano@example.com")
    assert_closed(stranger, w.vault)
    assert_closed(w.owner, w.vault)
    assert_closed(w.ana, "no-es-un-uuid")
    assert_closed(w.ana, str(uuid.uuid4()))
    assert_closed(w.ana, w.other)


def test_a_pending_member_gets_404_until_accepting(world):
    w = world
    pending = person(w.owner, w.db, "pendiente@example.com")
    member = invite(w.owner, w.vault, "pendiente@example.com", [{"folder": "Pub", "level": "lectura"}]).json()
    assert_closed(pending, w.vault)
    assert pending.post(f"/invitations/{member['id']}/accept").status_code == 200
    assert seen_paths(pending, w.vault) == {PUB_A, PUB_B}


def test_a_revoked_member_loses_the_channel_at_once(world):
    w = world
    assert seen_paths(w.ana, w.vault) == {PUB_A, PUB_B}
    assert w.owner.delete(f"/vaults/{w.vault}/members/{w.ana_m['id']}").status_code == 204
    assert_closed(w.ana, w.vault)


def test_changed_grants_take_effect_at_once(world):
    w = world
    assert w.owner.put(f"/vaults/{w.vault}/members/{w.ana_m['id']}/grants", json={"grants": [{"folder": "Priv", "level": "lectura"}]}).status_code == 200
    assert seen_paths(w.ana, w.vault) == {PRIV_C}
    assert not any(p.startswith("Pub/") for p in raw_paths(w.ana, w.vault))


def test_an_api_key_never_enters_the_channel_not_even_an_agent_key_of_a_member(world):
    w = world
    key = agent_client(w.owner, "aira")
    assert_closed(key, w.vault)


def test_without_a_session_the_channel_answers_401(world):
    from fastapi.testclient import TestClient
    from app.main import app
    assert TestClient(app).get(f"/sync/shared/{world.vault}/db/_changes").status_code == 401


def test_the_channel_never_writes_documents(world):
    w = world
    doc = {"_id": f"note:{w.vault}:{uuid.uuid4()}", "_rev": "1-a", "_revisions": {"start": 1, "ids": ["a"]}, "type": "note", "path": "Pub/mala.md"}
    assert_problem(w.bea.post(f"/sync/shared/{w.vault}/db/_bulk_docs", json={"docs": [doc], "new_edits": False}), 404, NOT_FOUND)
    assert not any(d.get("path") == "Pub/mala.md" for d in stored_docs(owner_db_name(w.db)).values())


# --- Checkpoints: viven en la base del invitado, nunca en la del propietario ---

def couch_local(db_name, local_id):
    return httpx.get(f"{settings.COUCHDB_URL}/{db_name}/_local/{local_id}", auth=AUTH)


def test_checkpoints_are_stored_in_the_guest_database_and_read_back_under_the_original_id(world):
    w = world
    put = w.ana.put(f"/sync/shared/{w.vault}/db/_local/abc123", json={"_id": "_local/abc123", "last_seq": "7-x", "history": []})
    assert put.status_code == 201, put.text
    got = w.ana.get(f"/sync/shared/{w.vault}/db/_local/abc123")
    assert got.status_code == 200 and got.json()["_id"] == "_local/abc123" and got.json()["last_seq"] == "7-x"
    guest = w.db.query(User).filter(User.email == "ana@example.com").one()
    assert couch_local(guest.couchdb_name, f"shared-{w.vault}-abc123").status_code == 200
    assert couch_local(owner_db_name(w.db), f"shared-{w.vault}-abc123").status_code == 404
    assert couch_local(owner_db_name(w.db), "abc123").status_code == 404


def test_a_guest_cannot_read_the_checkpoint_of_another_guest(world):
    w = world
    assert w.ana.put(f"/sync/shared/{w.vault}/db/_local/abc123", json={"_id": "_local/abc123", "last_seq": "7-x"}).status_code == 201
    assert w.cam.get(f"/sync/shared/{w.vault}/db/_local/abc123").status_code == 404


def test_an_oversized_checkpoint_is_rejected(world):
    w = world
    res = w.ana.put(f"/sync/shared/{w.vault}/db/_local/abc123", json={"_id": "_local/abc123", "last_seq": "x" * (65 * 1024)})
    assert res.status_code == 413


# --- Reglas puras ---

VID = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
NOTE = f"note:{VID}:33333333-3333-4333-8333-333333333333"
READ_PUB = MemberAccess((Grant("Pub", "lectura"),))


def test_belongs_accepts_only_the_vault_and_its_canonical_notes():
    assert rules.belongs(VID, f"vault:{VID}") and rules.belongs(VID, NOTE)
    for bad in (f"vault:{OTHER}", f"note:{OTHER}:33333333-3333-4333-8333-333333333333", f"note:{VID}:no-uuid", f"note-path:{VID}:x",
                f"vault-name:{VID}", "_design/vaults", None, 7):
        assert not rules.belongs(VID, bad)


def test_readable_requires_the_right_vault_and_a_readable_path():
    assert rules.readable(READ_PUB, VID, {"_id": NOTE, "path": "Pub/a.md"})
    assert rules.readable(READ_PUB, VID, {"_id": f"vault:{VID}"})
    assert not rules.readable(READ_PUB, VID, {"_id": NOTE, "path": "Priv/a.md"})
    assert not rules.readable(READ_PUB, VID, {"_id": NOTE})
    assert not rules.readable(READ_PUB, VID, {"_id": NOTE, "path": 5})
    assert not rules.readable(READ_PUB, VID, {"_id": f"note:{OTHER}:33333333-3333-4333-8333-333333333333", "path": "Pub/a.md"})
    assert not rules.readable(READ_PUB, VID, None)
    assert not rules.readable(MemberAccess((Grant("*", "lectura"),)), VID, {"_id": NOTE, "path": "BITACORA/x.md"})


def test_changes_query_forces_documents_caps_the_batch_and_ignores_the_client_selector():
    query, body, wants = rules.changes_query({"limit": "5000", "since": "3-a"}, VID)
    assert query["include_docs"] == "true" and query["limit"] == str(rules.CHANGES_LIMIT) and query["since"] == "3-a" and wants is False
    assert rules.changes_query({"include_docs": "true"}, VID)[2] is True
    assert rules.changes_query({}, VID)[0]["limit"] == str(rules.CHANGES_LIMIT)
    assert body == {"selector": {"_id": {"$regex": f"^(vault:{VID}$|note:{VID}:)"}}}


def test_filter_bulk_get_response_filters_inside_docs_not_at_the_top_level():
    plan = rules.filter_bulk_get_request({"docs": [{"id": NOTE, "rev": "1-a"}]}, VID)
    couch = {"results": [{"id": NOTE, "docs": [{"ok": {"_id": NOTE, "_rev": "1-a", "path": "Priv/x.md", "content": "secreto"}}]}]}
    out = rules.filter_bulk_get_response(READ_PUB, VID, plan, couch)
    assert out == {"results": [{"id": NOTE, "docs": [{"error": {"id": NOTE, "rev": "1-a", "error": "not_found", "reason": "missing"}}]}]}
    couch["results"][0]["docs"][0]["ok"]["path"] = "Pub/x.md"
    assert rules.filter_bulk_get_response(READ_PUB, VID, plan, couch)["results"][0]["docs"][0]["ok"]["content"] == "secreto"


def test_filter_all_docs_rows_reads_the_document_not_the_value():
    rows = [{"id": NOTE, "key": NOTE, "value": {"rev": "1-a"}, "doc": {"_id": NOTE, "path": "Pub/a.md"}},
            {"id": NOTE + "9", "key": NOTE + "9", "value": {"rev": "1-a"}, "doc": {"_id": NOTE + "9", "path": "Priv/a.md"}},
            {"key": "vault:zzz", "error": "not_found"}]
    assert [r["id"] for r in rules.filter_all_docs_rows(READ_PUB, VID, rows, True)] == [NOTE]
    assert "doc" not in rules.filter_all_docs_rows(READ_PUB, VID, rows, False)[0]


def test_the_response_to_a_malformed_couch_reply_is_a_storage_error_not_a_crash():
    from app.core.errors import StorageUnavailable
    with pytest.raises(StorageUnavailable):
        rules.filter_changes(READ_PUB, VID, {"nada": 1}, True)
    plan = rules.filter_bulk_get_request({"docs": [{"id": NOTE}]}, VID)
    with pytest.raises(StorageUnavailable):
        rules.filter_bulk_get_response(READ_PUB, VID, plan, {"results": []})
