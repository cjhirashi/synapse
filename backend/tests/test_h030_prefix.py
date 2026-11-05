"""H-030 E1: `GET /vaults/{id}/notes?prefix=` y la vista `by_path` contra CouchDB real."""
import pytest

from tests.test_notes_router import _note, put_note
from tests.test_vaults_api import assert_problem, create, user_db


def _paths(res) -> list[str]:
    return [i["path"] for i in res.json()["items"]]


def test_prefix_lists_only_the_folder_ordered_by_path(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    for path in ["A/b.md", "A/a.md", "AB/x.md", "A/sub/c.md", "Z.md", "a-2/y.md"]:
        put_note(user_db(db), _note(vault_id, path))
    res = ready_admin.get(f"/vaults/{vault_id}/notes", params={"prefix": "A"})
    assert res.status_code == 200, res.text
    assert _paths(res) == ["A/a.md", "A/b.md", "A/sub/c.md"]


def test_prefix_is_equivalent_under_case_and_unicode(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    put_note(user_db(db), _note(vault_id, "Diseño/Nota.md"))
    put_note(user_db(db), _note(vault_id, "Otro/Nota.md"))
    res = ready_admin.get(f"/vaults/{vault_id}/notes", params={"prefix": "diseño/"})
    assert _paths(res) == ["Diseño/Nota.md"]


def test_prefix_spaces_and_dashes_do_not_leak_between_folders(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    for path in ["AG - SKILLS/a.md", "AG - SKILLS-2/b.md", "AG - SKILLS.old/c.md", "AG - SKILLS2/d.md",
                 "AG - SKILLS/sub/e.md"]:
        put_note(user_db(db), _note(vault_id, path))
    res = ready_admin.get(f"/vaults/{vault_id}/notes", params={"prefix": "AG - SKILLS"})
    assert _paths(res) == ["AG - SKILLS/a.md", "AG - SKILLS/sub/e.md"]


def test_prefix_paginates_by_path_and_cursor_is_bound_to_the_folder(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    for i in range(5):
        put_note(user_db(db), _note(vault_id, f"F/n{i}.md"))
    put_note(user_db(db), _note(vault_id, "G/n9.md"))
    first = ready_admin.get(f"/vaults/{vault_id}/notes", params={"prefix": "F", "limit": 2}).json()
    assert [i["path"] for i in first["items"]] == ["F/n0.md", "F/n1.md"] and first["next_cursor"]
    seen = [i["path"] for i in first["items"]]
    cursor = first["next_cursor"]
    while cursor:
        page = ready_admin.get(f"/vaults/{vault_id}/notes", params={"prefix": "F", "limit": 2, "cursor": cursor}).json()
        seen += [i["path"] for i in page["items"]]
        cursor = page["next_cursor"]
    assert seen == [f"F/n{i}.md" for i in range(5)]
    other = ready_admin.get(f"/vaults/{vault_id}/notes", params={"prefix": "G", "cursor": first["next_cursor"]})
    assert_problem(other, 422, "invalid-cursor")


def test_prefix_respects_deleted_flag(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    put_note(user_db(db), _note(vault_id, "F/vivo.md"))
    put_note(user_db(db), _note(vault_id, "F/muerto.md", deleted=True))
    assert _paths(ready_admin.get(f"/vaults/{vault_id}/notes", params={"prefix": "F"})) == ["F/vivo.md"]
    assert _paths(ready_admin.get(f"/vaults/{vault_id}/notes", params={"prefix": "F", "deleted": "true"})) == ["F/muerto.md"]


def test_prefix_isolated_between_vaults(ready_admin, db):
    v1 = create(ready_admin, name="uno").json()["id"]
    v2 = create(ready_admin, name="dos").json()["id"]
    put_note(user_db(db), _note(v1, "F/a.md"))
    put_note(user_db(db), _note(v2, "F/b.md"))
    assert _paths(ready_admin.get(f"/vaults/{v1}/notes", params={"prefix": "F"})) == ["F/a.md"]


@pytest.mark.parametrize("prefix", ["a//b", "/a", " a "])
def test_prefix_invalid_is_422(ready_admin, prefix):
    vault_id = create(ready_admin).json()["id"]
    res = ready_admin.get(f"/vaults/{vault_id}/notes", params={"prefix": prefix})
    assert res.status_code == 422, res.text


def test_without_prefix_the_order_is_unchanged(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    put_note(user_db(db), _note(vault_id, "b.md", created_at="2026-10-10T00:00:00.000000Z"))
    put_note(user_db(db), _note(vault_id, "a.md", created_at="2026-10-11T00:00:00.000000Z"))
    assert _paths(ready_admin.get(f"/vaults/{vault_id}/notes")) == ["a.md", "b.md"]
