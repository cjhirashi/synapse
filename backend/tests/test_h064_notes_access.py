"""H-064 F3: lo que un miembro invitado ve y escribe en las notas de una bóveda compartida, por rol, operación y zona."""
import uuid
from types import SimpleNamespace

import pytest

from app.core.models.change_log import ChangeLog
from app.core.models.user import User
from tests.test_h030_api import agent_client, register, vault_of
from tests.test_h064_invitations_api import invite, person, problem

PUB_A, PUB_B, PRIV_C, ROOT = "Pub/a.md", "Pub/sub/b.md", "Priv/c.md", "root.md"


def put_note(client, vault_id, path, content="x"):
    res = client.post(f"/vaults/{vault_id}/notes", json={"path": path, "content": content})
    assert res.status_code == 201, res.text
    return res.json()


def paths(client, vault_id, **params):
    res = client.get(f"/vaults/{vault_id}/notes", params={"limit": 200, **params})
    assert res.status_code == 200, res.text
    return {n["path"] for n in res.json()["items"]}


def real(found: set[str]) -> set[str]:
    return {p for p in found if not p.endswith("INDICE.md")}


def join(owner, db, vault_id, email, grants, accept=True):
    client = person(owner, db, email)
    member = invite(owner, vault_id, email, grants).json()
    if accept:
        assert client.post(f"/invitations/{member['id']}/accept").status_code == 200
    return client, member


@pytest.fixture
def shared(ready_admin, db):
    vault = vault_of(ready_admin, name="Compartida")
    notes = {p: put_note(ready_admin, vault, p) for p in (PUB_A, PUB_B, PRIV_C, ROOT)}
    register(ready_admin, vault, "aira", ["*"])
    ana, ana_m = join(ready_admin, db, vault, "ana@example.com", [{"folder": "Pub", "level": "lectura"}])
    bea, bea_m = join(ready_admin, db, vault, "bea@example.com", [{"folder": "Pub", "level": "escritura"}, {"folder": "Priv", "level": "lectura"}])
    cam, cam_m = join(ready_admin, db, vault, "cam@example.com", [{"folder": "*", "level": "lectura"}])
    return SimpleNamespace(owner=ready_admin, vault=vault, notes=notes, ana=ana, bea=bea, cam=cam, ana_m=ana_m, bea_m=bea_m, cam_m=cam_m, db=db)


# --- Leer ---

def test_each_member_lists_only_what_its_grants_cover(shared):
    s = shared
    assert real(paths(s.ana, s.vault)) == {PUB_A, PUB_B}
    assert real(paths(s.bea, s.vault)) == {PUB_A, PUB_B, PRIV_C}
    assert real(paths(s.cam, s.vault)) == {PUB_A, PUB_B, PRIV_C, ROOT}
    assert all(p.startswith("Pub/") or p.startswith("PLANTILLAS/") for p in paths(s.ana, s.vault))
    owner_sees = paths(s.owner, s.vault)
    assert "AG - AGENTES/aira.md" in owner_sees
    for member in (s.ana, s.bea, s.cam):
        assert not any(p.startswith(("AG - ", "BITACORA/")) for p in paths(member, s.vault))


def test_prefix_listing_is_filtered_and_an_unreadable_folder_is_empty(shared):
    s = shared
    assert real(paths(s.ana, s.vault, prefix="Pub/sub")) == {PUB_B}
    assert real(paths(s.ana, s.vault, prefix="Pub")) == {PUB_A, PUB_B}
    assert paths(s.ana, s.vault, prefix="Priv") == set()
    assert paths(s.cam, s.vault, prefix="AG - AGENTES") == set()
    assert paths(s.owner, s.vault, prefix="AG - AGENTES") != set()


def test_pagination_with_filtering_neither_repeats_nor_leaks(shared):
    s = shared
    for i in range(6):
        put_note(s.owner, s.vault, f"Pub/n{i}.md")
        put_note(s.owner, s.vault, f"Priv/p{i}.md")
    want = real(paths(s.ana, s.vault))
    assert len(want) == 8 and not any(p.startswith("Priv/") for p in want)
    for extra in ({}, {"prefix": "Pub"}):
        seen, cursor = [], None
        for _ in range(40):
            res = s.ana.get(f"/vaults/{s.vault}/notes", params={"limit": 2, **extra, **({"cursor": cursor} if cursor else {})})
            assert res.status_code == 200, res.text
            seen += [n["path"] for n in res.json()["items"]]
            cursor = res.json()["next_cursor"]
            if cursor is None:
                break
        assert cursor is None and len(seen) == len(set(seen))
        assert real(set(seen)) == want
        assert not any(p.startswith(("Priv/", "root")) for p in seen)


def test_the_trash_is_filtered_like_the_rest(shared):
    s = shared
    for note in (s.notes[PUB_A], s.notes[PRIV_C]):
        got = s.owner.get(f"/vaults/{s.vault}/notes/{note['id']}")
        assert s.owner.delete(f"/vaults/{s.vault}/notes/{note['id']}", headers={"If-Match": got.headers["ETag"]}).status_code == 204
    assert real(paths(s.ana, s.vault, deleted="true")) == {PUB_A}
    assert real(paths(s.cam, s.vault, deleted="true")) == {PUB_A, PRIV_C}


def test_reading_a_hidden_note_answers_exactly_like_a_missing_one(shared):
    s = shared
    assert s.ana.get(f"/vaults/{s.vault}/notes/{s.notes[PUB_A]['id']}").status_code == 200
    ghost = s.ana.get(f"/vaults/{s.vault}/notes/{uuid.uuid4()}")
    problem(ghost, 404, "note-not-found")
    for hidden in (PRIV_C, ROOT):
        res = s.ana.get(f"/vaults/{s.vault}/notes/{s.notes[hidden]['id']}")
        problem(res, 404, "note-not-found")
        assert {k: v for k, v in res.json().items() if k != "instance"} == {k: v for k, v in ghost.json().items() if k != "instance"}
    registry = next(n for n in s.owner.get(f"/vaults/{s.vault}/notes", params={"prefix": "AG - AGENTES"}).json()["items"])
    problem(s.cam.get(f"/vaults/{s.vault}/notes/{registry['id']}"), 404, "note-not-found")
    assert s.owner.get(f"/vaults/{s.vault}/notes/{registry['id']}").status_code == 200


# --- Escribir ---

def test_write_needs_a_write_grant_and_a_reader_gets_403(shared):
    s = shared
    post = lambda who, path: who.post(f"/vaults/{s.vault}/notes", json={"path": path, "content": "n"})  # noqa: E731
    for path in ("Pub/new.md", "Priv/new.md", "root2.md", "AG - AGENTES/x.md", "PLANTILLAS/plantilla-x.md", "bitacora/x.md"):
        problem(post(s.ana, path), 403, "share-forbidden")
        problem(post(s.cam, path), 403, "share-forbidden")
    assert post(s.bea, "Pub/new.md").status_code == 201
    assert post(s.bea, "Pub/sub/deep/new2.md").status_code == 201
    for path in ("Priv/new.md", "root2.md", "AG - AGENTES/x.md", "AG - SKILLS/skill-x.md", "PLANTILLAS/plantilla-x.md", "BITACORA/2026-11/x.md"):
        problem(post(s.bea, path), 403, "share-forbidden")
    assert "Pub/new.md" in paths(s.owner, s.vault) and "Pub/new.md" in paths(s.ana, s.vault)


def test_update_delete_and_restore_follow_the_level_of_the_note(shared):
    s = shared
    note = s.notes[PUB_A]
    etag = s.bea.get(f"/vaults/{s.vault}/notes/{note['id']}").headers["ETag"]
    problem(s.ana.patch(f"/vaults/{s.vault}/notes/{note['id']}", json={"content": "y"}, headers={"If-Match": etag}), 403, "share-forbidden")
    edited = s.bea.patch(f"/vaults/{s.vault}/notes/{note['id']}", json={"content": "editado por bea"}, headers={"If-Match": etag})
    assert edited.status_code == 200 and edited.json()["content"] == "editado por bea"
    assert s.owner.get(f"/vaults/{s.vault}/notes/{note['id']}").json()["content"] == "editado por bea"

    priv = s.notes[PRIV_C]
    petag = s.bea.get(f"/vaults/{s.vault}/notes/{priv['id']}").headers["ETag"]
    problem(s.bea.patch(f"/vaults/{s.vault}/notes/{priv['id']}", json={"content": "y"}, headers={"If-Match": petag}), 403, "share-forbidden")
    problem(s.bea.delete(f"/vaults/{s.vault}/notes/{priv['id']}", headers={"If-Match": petag}), 403, "share-forbidden")
    assert s.owner.get(f"/vaults/{s.vault}/notes/{priv['id']}").json()["content"] == "x"

    new_etag = edited.headers["ETag"]
    assert s.bea.delete(f"/vaults/{s.vault}/notes/{note['id']}", headers={"If-Match": new_etag}).status_code == 204
    assert note["path"] in paths(s.ana, s.vault, deleted="true")
    problem(s.ana.post(f"/vaults/{s.vault}/notes/{note['id']}/restore", headers={"If-Match": new_etag}), 403, "share-forbidden")
    restored = s.bea.post(f"/vaults/{s.vault}/notes/{note['id']}/restore", headers={"If-Match": new_etag})
    assert restored.status_code == 412, restored.text  # llega a la precondición: el permiso pasó


def test_the_order_of_checks_never_leaks_what_the_member_cannot_see(shared):
    s = shared
    wrong = {"If-Match": '"1-wrong"'}
    root = s.notes[ROOT]["id"]
    problem(s.bea.patch(f"/vaults/{s.vault}/notes/{root}", json={"content": "y"}, headers=wrong), 404, "note-not-found")
    problem(s.bea.delete(f"/vaults/{s.vault}/notes/{root}", headers=wrong), 404, "note-not-found")
    problem(s.ana.patch(f"/vaults/{s.vault}/notes/{s.notes[PUB_A]['id']}", json={"content": "y"}, headers=wrong), 403, "share-forbidden")
    assert s.bea.patch(f"/vaults/{s.vault}/notes/{s.notes[PUB_A]['id']}", json={"content": "y"}, headers=wrong).status_code == 412


def test_a_member_cannot_move_or_rename_and_cannot_make_a_pdf(shared):
    s = shared
    note = s.notes[PUB_A]
    etag = s.bea.get(f"/vaults/{s.vault}/notes/{note['id']}").headers["ETag"]
    for new_path in ("Pub/otro.md", "Priv/otro.md", "Pub/a.md"):
        problem(s.bea.patch(f"/vaults/{s.vault}/notes/{note['id']}", json={"path": new_path}, headers={"If-Match": etag}), 403, "share-forbidden")
    assert s.owner.get(f"/vaults/{s.vault}/notes/{note['id']}").json()["path"] == PUB_A
    for who in (s.ana, s.bea, s.cam):
        problem(who.post(f"/vaults/{s.vault}/notes/{note['id']}/pdf", json={"html": "<p>x</p>"}), 403, "share-forbidden")


def test_a_guest_keeps_no_access_to_what_other_surfaces_expose(shared):
    s = shared
    # H-064 F3b1: la bóveda y sus archivos son del invitado según sus concesiones (solo id, nombre y descripción de la bóveda).
    res = s.ana.get(f"/vaults/{s.vault}")
    assert res.status_code == 200 and set(res.json()) == {"id", "name", "description"}
    assert s.ana.get(f"/vaults/{s.vault}/files").status_code == 200
    assert s.vault not in {v["id"] for v in s.ana.get("/vaults").json()["items"]}
    for surface in ("tasks", "folders", "agent-access", "members"):
        res = s.ana.get(f"/vaults/{s.vault}/{surface}")
        assert res.status_code in (404, 405), (surface, res.status_code)
    listed = s.ana.get(f"/vaults/{s.vault}/publications")
    assert listed.status_code == 404 or listed.json()["items"] == []


def test_a_member_can_never_publish_a_note_of_the_owner_on_the_internet(shared):
    s = shared
    note_id = s.notes[PUB_A]["id"]
    base = f"/vaults/{s.vault}/notes/{note_id}/publication"
    for who in (s.ana, s.bea, s.cam):
        assert who.get(base).status_code == 404
        assert who.post(base, json={"html": "<p>x</p>"}).status_code == 404
        assert who.put(base, json={"html": "<p>x</p>"}).status_code == 404
        assert who.post(f"{base}/check", json={"html": "<p>x</p>"}).status_code == 404
        assert who.delete(base).status_code == 404
    assert s.owner.get(base).status_code == 200
    assert s.owner.get(base).json()["published"] is False


# --- Quién entra ---

def test_non_members_pending_revoked_and_guest_keys_get_404_like_any_stranger(shared, db):
    s = shared
    dan = person(s.owner, db, "dan@example.com")
    eve = person(s.owner, db, "eve@example.com")
    invite(s.owner, s.vault, "eve@example.com")
    fay, fay_m = join(s.owner, db, s.vault, "fay@example.com", [{"folder": "*", "level": "escritura"}])
    assert s.owner.delete(f"/vaults/{s.vault}/members/{fay_m['id']}").status_code == 204
    for stranger in (dan, eve, fay):
        problem(stranger.get(f"/vaults/{s.vault}/notes"), 404, "vault-not-found")
        problem(stranger.post(f"/vaults/{s.vault}/notes", json={"path": "Pub/z.md", "content": "n"}), 404, "vault-not-found")
    ana_key = agent_client(s.ana, "aira")
    problem(ana_key.get(f"/vaults/{s.vault}/notes"), 404, "vault-not-found")
    owner_key = agent_client(s.owner, "aira")
    assert real(paths(owner_key, s.vault)) >= {PUB_A, PUB_B, PRIV_C, ROOT}


def test_revoking_or_changing_grants_takes_effect_on_the_very_next_request(shared):
    s = shared
    assert PUB_A in paths(s.ana, s.vault)
    put = s.owner.put(f"/vaults/{s.vault}/members/{s.ana_m['id']}/grants", json={"grants": [{"folder": "Pub/sub", "level": "lectura"}]})
    assert put.status_code == 200
    assert real(paths(s.ana, s.vault)) == {PUB_B}
    problem(s.ana.get(f"/vaults/{s.vault}/notes/{s.notes[PUB_A]['id']}"), 404, "note-not-found")
    assert s.owner.delete(f"/vaults/{s.vault}/members/{s.ana_m['id']}").status_code == 204
    problem(s.ana.get(f"/vaults/{s.vault}/notes"), 404, "vault-not-found")


def test_a_member_loses_access_when_the_owner_account_is_deactivated_and_the_owner_is_unaffected(shared):
    s = shared
    s.db.query(User).filter(User.email == "cjhirashi@gmail.com").update({"is_active": False})
    s.db.commit()
    problem(s.cam.get(f"/vaults/{s.vault}/notes"), 404, "vault-not-found")


# --- Autoría y cuotas del propietario ---

def test_what_a_member_writes_is_attributed_to_the_member(shared):
    s = shared
    put_note(s.bea, s.vault, "Pub/de-bea.md", "hola")
    rows = s.db.query(ChangeLog).filter(ChangeLog.vault_id == s.vault, ChangeLog.path == "Pub/de-bea.md").all()
    assert rows and {(r.author_kind, r.author) for r in rows} == {("human", "bea@example.com")}


def test_the_members_writes_count_against_the_owners_document_limit(ready_admin, db):
    owner = person(ready_admin, db, "due@example.com")
    editor = person(ready_admin, db, "edi@example.com")
    vault = vault_of(owner, name="Del dueño")
    member = invite(owner, vault, "edi@example.com", [{"folder": "*", "level": "escritura"}]).json()
    assert editor.post(f"/invitations/{member['id']}/accept").status_code == 200
    db.query(User).filter(User.email == "due@example.com").update({"max_notes_per_vault": 3})
    db.commit()
    created = [editor.post(f"/vaults/{vault}/notes", json={"path": f"n{i}.md", "content": "1"}) for i in range(4)]
    assert any(r.status_code == 403 and r.json()["type"].endswith("document-limit-reached") for r in created)
    assert owner.post(f"/vaults/{vault}/notes", json={"path": "del-dueno.md", "content": "1"}).status_code == 403
