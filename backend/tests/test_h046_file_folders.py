"""H-046: carpetas de archivos con subniveles, mover archivos y carpetas, y listar por carpeta."""
import pytest

from tests.test_agent_api_key_access import _bearer_client, _guest
from tests.test_agent_api_key_api import create_agent_key
from tests.test_files_api import PNG, _upload, _vault, storage  # noqa: F401  (fixture `storage`)
from tests.test_vaults_api import assert_problem


def _folders(client, vault_id):
    res = client.get(f"/vaults/{vault_id}/file-folders")
    assert res.status_code == 200, res.text
    return res.json()["folders"]


def _create(client, vault_id, path):
    return client.post(f"/vaults/{vault_id}/file-folders", json={"path": path})


def _list(client, vault_id, **params):
    res = client.get(f"/vaults/{vault_id}/files", params=params)
    assert res.status_code == 200, res.text
    return res.json()


def test_empty_vault_has_no_folders(ready_admin, storage):
    assert _folders(ready_admin, _vault(ready_admin)) == []


def test_create_nested_folder_includes_ancestors_and_is_idempotent(ready_admin, storage):
    v = _vault(ready_admin)
    res = _create(ready_admin, v, "Portafolio/Synapse/Capturas")
    assert res.status_code == 201 and res.json()["folders"] == ["Portafolio", "Portafolio/Synapse", "Portafolio/Synapse/Capturas"]
    assert _create(ready_admin, v, "Portafolio/Synapse").status_code == 201
    assert _folders(ready_admin, v) == ["Portafolio", "Portafolio/Synapse", "Portafolio/Synapse/Capturas"]


@pytest.mark.parametrize("bad", ["", "   ", "a//b", "/a", "a/", "a/../b", "a\\b"])
def test_create_folder_rejects_invalid_paths(ready_admin, storage, bad):
    assert_problem(_create(ready_admin, _vault(ready_admin), bad), 422, "validation-error")


def test_folders_with_files_exist_without_being_created(ready_admin, storage):
    v = _vault(ready_admin)
    assert _upload(ready_admin, v, folder="Docs/2026").status_code == 201
    assert _folders(ready_admin, v) == ["Docs", "Docs/2026"]


def test_list_files_filters_by_folder_and_root(ready_admin, storage):
    v = _vault(ready_admin)
    _upload(ready_admin, v, filename="raiz.png")
    _upload(ready_admin, v, filename="a.png", folder="A")
    _upload(ready_admin, v, filename="ab.png", folder="A/B")
    assert _list(ready_admin, v)["total"] == 3
    assert [f["name"] for f in _list(ready_admin, v, folder="A")["files"]] == ["a.png"]  # no incluye subcarpetas
    assert [f["name"] for f in _list(ready_admin, v, folder="A/B")["files"]] == ["ab.png"]
    assert [f["name"] for f in _list(ready_admin, v, folder="")["files"]] == ["raiz.png"]


def test_move_file_between_folders_and_to_root(ready_admin, storage):
    v = _vault(ready_admin)
    fid = _upload(ready_admin, v, folder="A").json()["id"]
    res = ready_admin.patch(f"/files/{fid}", json={"folder": "B/C"})
    assert res.status_code == 200 and res.json()["folder"] == "B/C"
    assert "B/C" in _folders(ready_admin, v) and "B" in _folders(ready_admin, v)
    res = ready_admin.patch(f"/files/{fid}", json={"folder": ""})
    assert res.status_code == 200 and res.json()["folder"] is None
    assert [f["id"] for f in _list(ready_admin, v, folder="")["files"]] == [fid]


def test_patch_without_folder_does_not_move(ready_admin, storage):
    v = _vault(ready_admin)
    fid = _upload(ready_admin, v, folder="A").json()["id"]
    res = ready_admin.patch(f"/files/{fid}", json={"name": "nuevo.png"})
    assert res.status_code == 200 and res.json()["folder"] == "A"


def test_move_file_to_invalid_folder_is_422_and_does_not_move(ready_admin, storage):
    v = _vault(ready_admin)
    fid = _upload(ready_admin, v, folder="A").json()["id"]
    assert_problem(ready_admin.patch(f"/files/{fid}", json={"folder": "x//y"}), 422, "validation-error")
    assert _list(ready_admin, v, folder="A")["total"] == 1


def test_foreign_user_cannot_move_file(ready_admin, db, storage):
    v = _vault(ready_admin)
    fid = _upload(ready_admin, v).json()["id"]
    guest = _guest(ready_admin, db)
    assert_problem(guest.patch(f"/files/{fid}", json={"folder": "A"}), 404, "file-not-found")


def test_move_folder_moves_files_and_subfolders(ready_admin, storage):
    v = _vault(ready_admin)
    _upload(ready_admin, v, filename="a.png", folder="A")
    _upload(ready_admin, v, filename="ab.png", folder="A/B")
    _create(ready_admin, v, "A/Vacia")
    res = ready_admin.post(f"/vaults/{v}/file-folders/move", json={"from": "A", "to": "Z/Archivo"})
    assert res.status_code == 200, res.text
    assert res.json() == {"from": "A", "to": "Z/Archivo", "moved_files": 2}
    assert _folders(ready_admin, v) == ["Z", "Z/Archivo", "Z/Archivo/B", "Z/Archivo/Vacia"]
    assert [f["name"] for f in _list(ready_admin, v, folder="Z/Archivo/B")["files"]] == ["ab.png"]
    assert _list(ready_admin, v, folder="A")["total"] == 0


def test_move_folder_into_itself_or_root_is_invalid(ready_admin, storage):
    v = _vault(ready_admin)
    _create(ready_admin, v, "A/B")
    for src, dst in (("A", "A/B/C"), ("A", "A"), ("A", "")):
        res = ready_admin.post(f"/vaults/{v}/file-folders/move", json={"from": src, "to": dst})
        assert res.status_code == 422, (src, dst, res.text)


def test_move_unknown_folder_is_404(ready_admin, storage):
    v = _vault(ready_admin)
    assert_problem(ready_admin.post(f"/vaults/{v}/file-folders/move", json={"from": "No", "to": "X"}), 404, "folder-not-found")


def test_move_folder_merges_into_an_existing_one(ready_admin, storage):
    v = _vault(ready_admin)
    _upload(ready_admin, v, filename="a.png", folder="A")
    _upload(ready_admin, v, filename="b.png", folder="B")
    res = ready_admin.post(f"/vaults/{v}/file-folders/move", json={"from": "A", "to": "B"})
    assert res.status_code == 200
    assert sorted(f["name"] for f in _list(ready_admin, v, folder="B")["files"]) == ["a.png", "b.png"]


def test_delete_empty_folder_and_its_empty_subfolders(ready_admin, storage):
    v = _vault(ready_admin)
    _create(ready_admin, v, "A/B")
    assert ready_admin.delete(f"/vaults/{v}/file-folders", params={"path": "A"}).status_code == 204
    assert _folders(ready_admin, v) == []


def test_delete_folder_with_files_is_409_and_keeps_everything(ready_admin, storage):
    v = _vault(ready_admin)
    _upload(ready_admin, v, folder="A/B")
    assert_problem(ready_admin.delete(f"/vaults/{v}/file-folders", params={"path": "A"}), 409, "file-folder-not-empty")
    assert _folders(ready_admin, v) == ["A", "A/B"]


def test_delete_unknown_folder_is_404(ready_admin, storage):
    v = _vault(ready_admin)
    assert_problem(ready_admin.delete(f"/vaults/{v}/file-folders", params={"path": "No"}), 404, "folder-not-found")


def test_folders_of_a_foreign_vault_are_not_visible(ready_admin, db, storage):
    v = _vault(ready_admin)
    guest = _guest(ready_admin, db)
    assert guest.get(f"/vaults/{v}/file-folders").status_code == 404
    assert guest.post(f"/vaults/{v}/file-folders", json={"path": "A"}).status_code == 404


def test_folder_path_with_percent_and_underscore_does_not_match_siblings(ready_admin, storage):
    """El prefijo se compara literal: `50%_off` no arrastra a `50xxoff`."""
    v = _vault(ready_admin)
    _upload(ready_admin, v, filename="uno.png", folder="50%_off")
    _upload(ready_admin, v, filename="dos.png", folder="50xxoff")
    res = ready_admin.post(f"/vaults/{v}/file-folders/move", json={"from": "50%_off", "to": "Oferta"})
    assert res.json()["moved_files"] == 1
    assert [f["name"] for f in _list(ready_admin, v, folder="50xxoff")["files"]] == ["dos.png"]


def test_agent_key_can_create_and_move_folders_and_files(ready_admin, storage):
    v = _vault(ready_admin)
    agent = _bearer_client(ready_admin, create_agent_key(ready_admin, "aira").json()["key"])
    assert _create(agent, v, "Portafolio/Imagenes").status_code == 201
    fid = agent.post("/files", data={"vault_id": v, "folder": "Portafolio/Imagenes"}, files={"file": ("a.png", PNG, "image/png")}).json()["id"]
    assert agent.patch(f"/files/{fid}", json={"folder": "Portafolio"}).status_code == 200
    assert agent.post(f"/vaults/{v}/file-folders/move", json={"from": "Portafolio", "to": "Web"}).status_code == 200
