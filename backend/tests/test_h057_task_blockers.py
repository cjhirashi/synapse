"""H-057: una tarea puede estar bloqueada por otras de su bóveda; no se da por hecha hasta que todas lo estén."""
import pytest

from app.services import agent_access_guard
from tests.test_h030_api import vault_of
from tests.test_h053_tasks import get, make, patch, sub


@pytest.fixture(autouse=True)
def _fresh_registry_cache():
    agent_access_guard._CACHE.clear()
    yield
    agent_access_guard._CACHE.clear()


def pointer(res) -> str:
    assert res.status_code == 422, res.text
    return res.json()["errors"][0]["pointer"]


def test_a_blocked_task_can_start_but_cannot_be_done_until_its_blockers_are(ready_admin):
    vault = vault_of(ready_admin)
    first, second = make(ready_admin, vault, title="Primera"), make(ready_admin, vault, title="Segunda")
    blocked = make(ready_admin, vault, title="Depende", blocked_by=[first["id"], second["id"]])
    assert blocked["blocked_by"] == sorted([first["id"], second["id"]]) and blocked["blocked"] is True
    assert patch(ready_admin, vault, blocked["id"], status="in_progress").status_code == 200
    assert pointer(patch(ready_admin, vault, blocked["id"], status="done")) == "/status"
    assert patch(ready_admin, vault, first["id"], status="done").status_code == 200
    assert pointer(patch(ready_admin, vault, blocked["id"], status="done")) == "/status"  # falta la segunda
    assert patch(ready_admin, vault, second["id"], status="done").status_code == 200
    assert get(ready_admin, vault, blocked["id"])["blocked"] is False
    assert patch(ready_admin, vault, blocked["id"], status="done").status_code == 200


def test_a_cancelled_blocker_does_not_release_the_task(ready_admin):
    vault = vault_of(ready_admin)
    blocker = make(ready_admin, vault, title="Bloqueadora")
    blocked = make(ready_admin, vault, title="Depende", blocked_by=[blocker["id"]])
    assert patch(ready_admin, vault, blocker["id"], status="cancelled").status_code == 200
    assert pointer(patch(ready_admin, vault, blocked["id"], status="done")) == "/status"
    # Quitar el bloqueo la libera.
    assert patch(ready_admin, vault, blocked["id"], blocked_by=[]).status_code == 200
    assert patch(ready_admin, vault, blocked["id"], status="done").status_code == 200


def test_blockers_can_be_changed_cleared_and_are_listed(ready_admin):
    vault = vault_of(ready_admin)
    a, b = make(ready_admin, vault, title="A"), make(ready_admin, vault, title="B")
    task = make(ready_admin, vault, title="T")
    assert patch(ready_admin, vault, task["id"], blocked_by=[a["id"]]).json()["blocked_by"] == [a["id"]]
    assert patch(ready_admin, vault, task["id"], blocked_by=[b["id"]]).json()["blocked_by"] == [b["id"]]
    assert patch(ready_admin, vault, task["id"], title="Solo título").json()["blocked_by"] == [b["id"]]  # sin enviarlo no cambia
    assert patch(ready_admin, vault, task["id"], blocked_by=None).json()["blocked_by"] == []
    items = ready_admin.get(f"/vaults/{vault}/tasks").json()["items"]
    assert {t["id"]: t["blocked_by"] for t in items}[task["id"]] == []


def test_only_tasks_of_the_same_vault_can_block(ready_admin):
    vault, other = vault_of(ready_admin, "Uno"), vault_of(ready_admin, "Dos")
    foreign = make(ready_admin, other, title="Ajena")
    task = make(ready_admin, vault, title="T")
    assert pointer(patch(ready_admin, vault, task["id"], blocked_by=[foreign["id"]])) == "/blocked_by"
    res = ready_admin.post(f"/vaults/{vault}/tasks", json={"title": "Nueva", "blocked_by": [foreign["id"]]})
    assert pointer(res) == "/blocked_by"
    assert pointer(patch(ready_admin, vault, task["id"], blocked_by=["no-existe"])) == "/blocked_by"


def test_a_task_cannot_block_itself_or_form_a_cycle(ready_admin):
    vault = vault_of(ready_admin)
    a, b, c = (make(ready_admin, vault, title=name) for name in "ABC")
    assert pointer(patch(ready_admin, vault, a["id"], blocked_by=[a["id"]])) == "/blocked_by"
    assert patch(ready_admin, vault, b["id"], blocked_by=[a["id"]]).status_code == 200  # B espera a A
    assert patch(ready_admin, vault, c["id"], blocked_by=[b["id"]]).status_code == 200  # C espera a B
    assert pointer(patch(ready_admin, vault, a["id"], blocked_by=[c["id"]])) == "/blocked_by"  # A esperaría a C: ciclo


def test_subtasks_can_be_blocked_and_block_but_not_across_parent_and_child(ready_admin):
    vault = vault_of(ready_admin)
    root = make(ready_admin, vault, title="Raíz")
    first, second = sub(ready_admin, vault, root["id"], title="Uno"), sub(ready_admin, vault, root["id"], title="Dos")
    assert patch(ready_admin, vault, second["id"], blocked_by=[first["id"]]).status_code == 200
    assert pointer(patch(ready_admin, vault, second["id"], status="done")) == "/status"
    assert pointer(patch(ready_admin, vault, second["id"], blocked_by=[root["id"]])) == "/blocked_by"  # no a su raíz
    assert pointer(patch(ready_admin, vault, root["id"], blocked_by=[first["id"]])) == "/blocked_by"  # ni la raíz a su hija
    other = make(ready_admin, vault, title="Suelta")
    assert patch(ready_admin, vault, first["id"], blocked_by=[other["id"]]).status_code == 200  # una subtarea sí a otra tarea
    assert sub(ready_admin, vault, root["id"], title="Tres", blocked_by=[other["id"]])["blocked"] is True


def test_a_blocked_root_is_not_closed_by_its_subtasks_and_is_released_when_its_blocker_is_done(ready_admin):
    vault = vault_of(ready_admin)
    blocker = make(ready_admin, vault, title="Bloqueadora")
    root = make(ready_admin, vault, title="Raíz", blocked_by=[blocker["id"]])
    child = sub(ready_admin, vault, root["id"], title="Hija")
    assert patch(ready_admin, vault, child["id"], status="done").status_code == 200
    assert get(ready_admin, vault, root["id"])["status"] == "in_progress"  # la hija está hecha pero la raíz espera
    assert patch(ready_admin, vault, blocker["id"], status="done").status_code == 200
    assert get(ready_admin, vault, root["id"])["status"] == "done"


def test_deleting_a_blocker_releases_the_tasks_that_waited_for_it(ready_admin):
    vault = vault_of(ready_admin)
    blocker = make(ready_admin, vault, title="Bloqueadora")
    blocked = make(ready_admin, vault, title="Depende", blocked_by=[blocker["id"]])
    assert ready_admin.delete(f"/vaults/{vault}/tasks/{blocker['id']}").status_code == 204
    assert get(ready_admin, vault, blocked["id"])["blocked_by"] == [] and get(ready_admin, vault, blocked["id"])["blocked"] is False
    assert patch(ready_admin, vault, blocked["id"], status="done").status_code == 200


def test_a_task_created_done_cannot_have_pending_blockers(ready_admin):
    vault = vault_of(ready_admin)
    blocker = make(ready_admin, vault, title="Bloqueadora")
    res = ready_admin.post(f"/vaults/{vault}/tasks", json={"title": "Hecha", "status": "done", "blocked_by": [blocker["id"]]})
    assert pointer(res) == "/status"


def test_the_cross_vault_listing_carries_the_blockers(ready_admin):
    vault = vault_of(ready_admin)
    blocker = make(ready_admin, vault, title="Bloqueadora")
    make(ready_admin, vault, title="Depende", blocked_by=[blocker["id"]])
    items = ready_admin.get("/tasks").json()["items"]
    assert [t["blocked"] for t in items if t["title"] == "Depende"] == [True]
