"""H-064 F3b1: lo que un miembro invitado ve y escribe en los archivos y las carpetas de una bóveda compartida.

API real (TestClient + CouchDB + Postgres); el almacén de objetos es un FAKE en memoria. Las reglas por carpeta y nivel
viven en `tests/test_h064_access_rules.py`; aquí, las rutas.
"""
import uuid
from types import SimpleNamespace

import pytest

from app.main import app
from app.core.models.user import User
from app.routers.files import get_object_storage
from tests.fake_object_storage import FakeObjectStorage
from tests.test_h030_api import vault_of
from tests.test_h064_invitations_api import invite, person, problem

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture
def storage():
    fake = FakeObjectStorage()
    app.dependency_overrides[get_object_storage] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_object_storage, None)


def upload(client, vault_id, folder=None, filename="foto.png", data=PNG):
    form = {"vault_id": vault_id}
    if folder is not None:
        form["folder"] = folder
    return client.post("/files", data=form, files={"file": (filename, data, "image/png")})


def upload_ok(client, vault_id, folder=None, filename="foto.png"):
    res = upload(client, vault_id, folder=folder, filename=filename)
    assert res.status_code == 201, res.text
    return res.json()


def listing(client, vault_id, **params):
    res = client.get(f"/vaults/{vault_id}/files", params={"limit": 100, **params})
    assert res.status_code == 200, res.text
    return res.json()


def names(client, vault_id, **params) -> set[str]:
    return {f["name"] for f in listing(client, vault_id, **params)["files"]}


def join(owner, db, vault_id, email, grants):
    client = person(owner, db, email)
    member = invite(owner, vault_id, email, grants).json()
    assert client.post(f"/invitations/{member['id']}/accept").status_code == 200
    return client, member


@pytest.fixture
def shared(ready_admin, db, storage):
    vault = vault_of(ready_admin, name="Compartida")
    files = {
        "a": upload_ok(ready_admin, vault, folder="Pub", filename="a.png"),
        "b": upload_ok(ready_admin, vault, folder="Pub/sub", filename="b.png"),
        "c": upload_ok(ready_admin, vault, folder="Priv", filename="c.png"),
        "root": upload_ok(ready_admin, vault, filename="root.png"),
        "reg": upload_ok(ready_admin, vault, folder="AG - AGENTES", filename="reg.png"),
    }
    ana, ana_m = join(ready_admin, db, vault, "ana@example.com", [{"folder": "Pub", "level": "lectura"}])
    bea, bea_m = join(ready_admin, db, vault, "bea@example.com",
                      [{"folder": "Pub", "level": "escritura"}, {"folder": "Priv", "level": "lectura"}])
    cam, cam_m = join(ready_admin, db, vault, "cam@example.com", [{"folder": "*", "level": "lectura"}])
    return SimpleNamespace(owner=ready_admin, vault=vault, files=files, ana=ana, bea=bea, cam=cam,
                           ana_m=ana_m, bea_m=bea_m, cam_m=cam_m, db=db, storage=storage)


# --- Listar ---

def test_each_guest_lists_only_the_files_its_grants_cover(shared):
    s = shared
    assert names(s.ana, s.vault) == {"a.png", "b.png"}
    assert names(s.bea, s.vault) == {"a.png", "b.png", "c.png"}
    assert names(s.cam, s.vault) == {"a.png", "b.png", "c.png", "root.png"}  # '*' no alcanza AG - AGENTES
    owner_names = names(s.owner, s.vault)
    assert owner_names == {"a.png", "b.png", "c.png", "root.png", "reg.png"}


def test_member_total_counts_only_what_it_sees_and_pages_never_repeat_or_leak(shared):
    s = shared
    for i in range(5):
        upload_ok(s.owner, s.vault, folder="Priv", filename=f"p{i}.png")
        upload_ok(s.owner, s.vault, folder="Pub", filename=f"q{i}.png")
    # Ana ve a.png, b.png (Pub/sub) y las cinco q (Pub); las cinco p son de Priv y no las ve.
    body = listing(s.ana, s.vault)
    assert body["total"] == 7 and len(body["files"]) == 7
    seen, offset = [], 0
    while True:
        page = listing(s.ana, s.vault, limit=3, offset=offset)
        assert page["total"] == 7
        if not page["files"]:
            break
        seen += [f["id"] for f in page["files"]]
        offset += 3
    assert len(seen) == len(set(seen)) == 7
    assert not any(n.startswith("p") for n in {f["name"] for f in listing(s.ana, s.vault, limit=100)["files"]})


def test_folder_filter_is_exact_and_an_unreadable_folder_is_empty(shared):
    s = shared
    assert names(s.ana, s.vault, folder="Pub") == {"a.png"}
    assert names(s.ana, s.vault, folder="Pub/sub") == {"b.png"}
    assert names(s.ana, s.vault, folder="") == set()
    assert listing(s.ana, s.vault, folder="Priv")["total"] == 0
    assert listing(s.cam, s.vault, folder="AG - AGENTES")["total"] == 0
    assert names(s.owner, s.vault, folder="AG - AGENTES") == {"reg.png"}


def test_vault_files_listing_of_a_stranger_is_404(shared, ready_admin, db):
    dan = person(ready_admin, db, "dan@example.com")
    problem(dan.get(f"/vaults/{shared.vault}/files"), 404, "vault-not-found")


def test_member_folder_listing_shows_only_folders_with_a_level(shared):
    s = shared

    def folders(client):
        res = client.get(f"/vaults/{s.vault}/file-folders")
        assert res.status_code == 200, res.text
        return set(res.json()["folders"])

    assert folders(s.ana) == {"Pub", "Pub/sub"}
    assert folders(s.bea) == {"Pub", "Pub/sub", "Priv"}
    assert folders(s.cam) == {"Pub", "Pub/sub", "Priv"}  # AG - AGENTES y la raíz no
    assert folders(s.owner) >= {"Pub", "Pub/sub", "Priv", "AG - AGENTES"}


# --- Leer ---

def test_get_a_file_outside_the_grants_answers_exactly_like_a_missing_one(shared):
    s = shared
    assert s.ana.get(f"/files/{s.files['a']['id']}").status_code == 200
    ghost = s.ana.get(f"/files/{uuid.uuid4()}")
    problem(ghost, 404, "file-not-found")
    for hidden in ("c", "root", "reg"):
        res = s.ana.get(f"/files/{s.files[hidden]['id']}")
        problem(res, 404, "file-not-found")
        assert {k: v for k, v in res.json().items() if k != "instance"} == {k: v for k, v in ghost.json().items() if k != "instance"}
    problem(s.cam.get(f"/files/{s.files['reg']['id']}"), 404, "file-not-found")
    assert s.owner.get(f"/files/{s.files['reg']['id']}").status_code == 200


def test_a_public_file_a_member_cannot_read_is_404_for_that_member_only(shared):
    s = shared
    res = s.owner.patch(f"/files/{s.files['c']['id']}", json={"visibility": "public"})
    assert res.status_code == 200, res.text
    problem(s.ana.get(f"/files/{s.files['c']['id']}"), 404, "file-not-found")
    assert s.bea.get(f"/files/{s.files['c']['id']}").status_code == 200


def test_anonymous_public_file_is_still_served(shared):
    from fastapi.testclient import TestClient
    s = shared
    s.owner.patch(f"/files/{s.files['c']['id']}", json={"visibility": "public"})
    anonymous = TestClient(app, base_url=str(s.owner.base_url))
    assert anonymous.get(f"/files/{s.files['c']['id']}").status_code == 200


# --- Subir ---

def test_upload_into_a_write_folder_is_201(shared):
    s = shared
    created = upload(s.bea, s.vault, folder="Pub/sub", filename="de-bea.png")
    assert created.status_code == 201, created.text
    assert created.json()["folder"] == "Pub/sub"
    assert "de-bea.png" in names(s.ana, s.vault)


def test_upload_into_a_read_only_folder_is_403(shared):
    s = shared
    stored = len(s.storage.objects)
    problem(upload(s.ana, s.vault, folder="Pub", filename="x.png"), 403, "share-forbidden")
    problem(upload(s.cam, s.vault, folder="Pub", filename="x.png"), 403, "share-forbidden")
    assert "x.png" not in names(s.owner, s.vault)
    assert len(s.storage.objects) == stored  # nada llegó al almacén


def test_upload_into_a_folder_the_member_cannot_read_is_404(shared):
    s = shared
    problem(upload(s.ana, s.vault, folder="Priv", filename="x.png"), 404, "file-not-found")
    problem(upload(s.bea, s.vault, folder="AG - AGENTES", filename="x.png"), 404, "file-not-found")
    problem(upload(s.ana, s.vault, filename="root-x.png"), 404, "file-not-found")


def test_a_guest_never_uploads_into_a_hidden_zone_even_with_star_write(shared, db):
    s = shared
    star, _ = join(s.owner, db, s.vault, "star@example.com", [{"folder": "*", "level": "escritura"}])
    problem(upload(star, s.vault, folder="AG - AGENTES", filename="x.png"), 404, "file-not-found")
    problem(upload(star, s.vault, folder="BITACORA/2026", filename="x.png"), 404, "file-not-found")
    assert upload(star, s.vault, folder="Pub", filename="ok.png").status_code == 201


# --- Borrar ---

def test_delete_a_read_only_file_is_403_and_the_file_survives(shared):
    s = shared
    problem(s.ana.delete(f"/files/{s.files['a']['id']}"), 403, "share-forbidden")
    assert s.owner.get(f"/files/{s.files['a']['id']}").status_code == 200


def test_delete_needs_write_and_a_file_outside_the_grants_is_404(shared):
    s = shared
    problem(s.bea.delete(f"/files/{s.files['c']['id']}"), 403, "share-forbidden")
    problem(s.ana.delete(f"/files/{s.files['c']['id']}"), 404, "file-not-found")
    problem(s.cam.delete(f"/files/{s.files['reg']['id']}"), 404, "file-not-found")


def test_a_writer_deletes_what_it_can_write(shared):
    s = shared
    mine = upload_ok(s.bea, s.vault, folder="Pub", filename="borrar.png")
    assert s.bea.delete(f"/files/{mine['id']}").status_code == 204
    problem(s.owner.get(f"/files/{mine['id']}"), 404, "file-not-found")


# --- Mover y renombrar ---

def test_moving_or_renaming_a_file_as_a_member_is_403(shared):
    s = shared
    fid = s.files["a"]["id"]
    problem(s.bea.patch(f"/files/{fid}", json={"folder": "Pub/sub"}), 403, "share-forbidden")
    problem(s.bea.patch(f"/files/{fid}", json={"folder": ""}), 403, "share-forbidden")
    problem(s.bea.patch(f"/files/{fid}", json={"name": "renombrado.png"}), 403, "share-forbidden")
    record = next(f for f in listing(s.owner, s.vault)["files"] if f["id"] == fid)
    assert record["folder"] == "Pub" and record["name"] == "a.png"


def test_a_metadata_patch_that_keeps_path_and_folder_is_allowed_with_write(shared):
    s = shared
    fid = s.files["a"]["id"]
    same = s.bea.patch(f"/files/{fid}", json={"folder": "Pub", "name": "a.png"})
    assert same.status_code == 200, same.text
    shared_now = s.bea.patch(f"/files/{fid}", json={"visibility": "public"})
    assert shared_now.status_code == 200 and shared_now.json()["visibility"] == "public"
    problem(s.ana.patch(f"/files/{fid}", json={"visibility": "private"}), 403, "share-forbidden")


def test_a_member_cannot_move_a_folder_of_files_or_of_notes(shared):
    s = shared
    body = {"from": "Pub", "to": "Pub2"}
    problem(s.bea.post(f"/vaults/{s.vault}/file-folders/move", json=body), 403, "share-forbidden")
    problem(s.ana.post(f"/vaults/{s.vault}/file-folders/move", json=body), 403, "share-forbidden")
    problem(s.bea.post(f"/vaults/{s.vault}/folders/move", json=body), 403, "share-forbidden")
    assert s.owner.get(f"/vaults/{s.vault}/file-folders").json()["folders"].count("Pub") == 1
    assert names(s.owner, s.vault, folder="Pub") == {"a.png"}


# --- Carpetas de archivos ---

def test_creating_a_file_folder_needs_write_on_it(shared):
    s = shared
    created = s.bea.post(f"/vaults/{s.vault}/file-folders", json={"path": "Pub/nueva"})
    assert created.status_code == 201, created.text
    assert "Pub/nueva" in created.json()["folders"]
    problem(s.ana.post(f"/vaults/{s.vault}/file-folders", json={"path": "Pub/otra"}), 403, "share-forbidden")
    problem(s.bea.post(f"/vaults/{s.vault}/file-folders", json={"path": "Priv/nueva"}), 403, "share-forbidden")
    problem(s.bea.post(f"/vaults/{s.vault}/file-folders", json={"path": "Otra"}), 404, "folder-not-found")


def test_deleting_an_empty_file_folder_needs_write(shared):
    s = shared
    assert s.bea.post(f"/vaults/{s.vault}/file-folders", json={"path": "Pub/vacia"}).status_code == 201
    problem(s.ana.delete(f"/vaults/{s.vault}/file-folders", params={"path": "Pub/vacia"}), 403, "share-forbidden")
    problem(s.bea.delete(f"/vaults/{s.vault}/file-folders", params={"path": "Priv"}), 403, "share-forbidden")
    assert s.bea.delete(f"/vaults/{s.vault}/file-folders", params={"path": "Pub/vacia"}).status_code == 204


# --- Vault y dueño ---

def test_a_member_gets_only_id_name_and_description_of_the_vault(shared, ready_admin, db):
    s = shared
    res = s.ana.get(f"/vaults/{s.vault}")
    assert res.status_code == 200, res.text
    assert set(res.json()) == {"id", "name", "description"}
    assert res.json()["name"] == "Compartida" and res.json()["id"] == s.vault
    assert res.headers.get("etag")
    owner = s.owner.get(f"/vaults/{s.vault}").json()
    assert owner["owner_id"] and "attributes" in owner and "tags" in owner
    dan = person(ready_admin, db, "dan2@example.com")
    problem(dan.get(f"/vaults/{s.vault}"), 404, "vault-not-found")


def test_the_owner_still_sees_and_does_everything(shared):
    s = shared
    assert listing(s.owner, s.vault)["total"] == 5
    assert names(s.owner, s.vault, folder="Priv") == {"c.png"}
    fid = s.files["reg"]["id"]
    assert s.owner.patch(f"/files/{fid}", json={"folder": "Pub", "name": "movido.png"}).status_code == 200
    assert s.owner.delete(f"/files/{fid}").status_code == 204


def test_revoking_a_member_removes_file_access_immediately(shared):
    s = shared
    assert s.ana.get(f"/files/{s.files['a']['id']}").status_code == 200
    assert s.owner.delete(f"/vaults/{s.vault}/members/{s.ana_m['id']}").status_code == 204
    problem(s.ana.get(f"/files/{s.files['a']['id']}"), 404, "file-not-found")
    problem(s.ana.get(f"/vaults/{s.vault}/files"), 404, "vault-not-found")
    problem(s.ana.get(f"/vaults/{s.vault}"), 404, "vault-not-found")
    problem(s.ana.post(f"/vaults/{s.vault}/file-folders", json={"path": "Pub/x"}), 404, "vault-not-found")


def test_the_guests_own_storage_limit_does_not_apply_and_the_owners_does(ready_admin, db, storage):
    """El almacenamiento de la bóveda compartida se mide con el tope del propietario, no con el del invitado."""
    owner = person(ready_admin, db, "due@example.com")
    vault = vault_of(owner, name="Del dueño")
    editor = person(ready_admin, db, "edi@example.com")
    member = invite(owner, vault, "edi@example.com", [{"folder": "*", "level": "escritura"}]).json()
    assert editor.post(f"/invitations/{member['id']}/accept").status_code == 200
    db.query(User).filter(User.email == "edi@example.com").update({"max_storage_bytes_per_vault": 1})
    db.commit()
    assert upload(editor, vault, filename="libre.png").status_code == 201
    db.query(User).filter(User.email == "due@example.com").update({"max_storage_bytes_per_vault": 1})
    db.commit()
    blocked = upload(editor, vault, filename="tope.png")
    assert blocked.status_code == 403 and blocked.json()["type"].endswith("storage-limit-reached"), blocked.text
