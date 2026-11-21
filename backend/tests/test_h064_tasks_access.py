"""H-064 F3b2: lo que un miembro invitado ve y escribe en las tareas de una bóveda compartida, por rol, operación y zona.

API real (TestClient + CouchDB + Postgres); el modelo de tareas con acceso restringido por path y nivel.
Las reglas por carpeta y nivel viven en `tests/test_h064_access_rules.py`; aquí, las rutas de tareas.
"""
import uuid
from types import SimpleNamespace

import pytest

from app.core.models.user import User
from tests.test_h030_api import agent_client, register, vault_of
from tests.test_h064_invitations_api import invite, person, problem


def put_task(client, vault_id, title="x", path=None, parent_id=None):
    """Crea una tarea o subtarea."""
    body = {"title": title}
    if path is not None:
        body["path"] = path
    if parent_id:
        res = client.post(f"/vaults/{vault_id}/tasks/{parent_id}/subtasks", json=body)
    else:
        res = client.post(f"/vaults/{vault_id}/tasks", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def tasks(client, vault_id, **params):
    """Lista tareas de la bóveda."""
    res = client.get(f"/vaults/{vault_id}/tasks", params=params)
    if res.status_code != 200:
        return None
    return res.json()["items"]


def join(owner, db, vault_id, email, grants, accept=True):
    """Invita a una persona y la hace aceptar (si accept=True)."""
    client = person(owner, db, email)
    member = invite(owner, vault_id, email, grants).json()
    if accept:
        assert client.post(f"/invitations/{member['id']}/accept").status_code == 200
    return client, member


@pytest.fixture
def shared(ready_admin, db):
    """Bóveda compartida con tareas en diferentes paths y miembros con diferentes permisos."""
    vault = vault_of(ready_admin, name="Compartida")
    # Crear tareas en diferentes paths: una sin path, dos en Pub/, una en Priv/
    root_task = put_task(ready_admin, vault, "Raíz sin path")
    pub_task = put_task(ready_admin, vault, "En Pub", path="Pub")
    pub_sub_task = put_task(ready_admin, vault, "En Pub/sub", path="Pub/sub")
    priv_task = put_task(ready_admin, vault, "En Priv", path="Priv")

    # Registrar agente
    register(ready_admin, vault, "aira", ["*"])

    # Crear miembros con diferentes concesiones
    ana, ana_m = join(ready_admin, db, vault, "ana@example.com", [{"folder": "Pub", "level": "lectura"}])
    bea, bea_m = join(ready_admin, db, vault, "bea@example.com",
                      [{"folder": "Pub", "level": "escritura"}, {"folder": "Priv", "level": "lectura"}])
    cam, cam_m = join(ready_admin, db, vault, "cam@example.com", [{"folder": "*", "level": "lectura"}])

    return SimpleNamespace(
        owner=ready_admin, vault=vault,
        root_task=root_task, pub_task=pub_task, pub_sub_task=pub_sub_task, priv_task=priv_task,
        ana=ana, bea=bea, cam=cam, ana_m=ana_m, bea_m=bea_m, cam_m=cam_m, db=db)


# --- Leer ---

def test_each_member_lists_only_tasks_its_grants_cover(shared):
    """Ana ve Pub, Bea ve Pub y Priv, Cam ve todo incluyendo raíz sin path (con `*` lectura)."""
    s = shared
    ana_tasks = {t["title"] for t in tasks(s.ana, s.vault) or []}
    bea_tasks = {t["title"] for t in tasks(s.bea, s.vault) or []}
    cam_tasks = {t["title"] for t in tasks(s.cam, s.vault) or []}
    owner_tasks = {t["title"] for t in tasks(s.owner, s.vault) or []}

    # Ana: solo Pub (lectura)
    assert ana_tasks == {"En Pub", "En Pub/sub"}
    # Bea: Pub (escritura) y Priv (lectura); no ve raíz sin path
    assert bea_tasks == {"En Pub", "En Pub/sub", "En Priv"}
    # Cam: todo incluyendo raíz sin path (con `*` lectura)
    assert cam_tasks == {"Raíz sin path", "En Pub", "En Pub/sub", "En Priv"}
    # Owner: todo
    assert owner_tasks == {"Raíz sin path", "En Pub", "En Pub/sub", "En Priv"}


def test_reading_a_hidden_task_answers_exactly_like_a_missing_one(shared):
    """GET de una tarea oculta debe responder 404 idéntico al de una inexistente."""
    s = shared
    # Ana puede ver pub_task pero no priv_task
    assert s.ana.get(f"/vaults/{s.vault}/tasks/{s.pub_task['id']}").status_code == 200
    ghost = s.ana.get(f"/vaults/{s.vault}/tasks/{uuid.uuid4()}")
    problem(ghost, 404, "task-not-found")

    # GET a una tarea oculta para Ana (Priv)
    hidden = s.ana.get(f"/vaults/{s.vault}/tasks/{s.priv_task['id']}")
    problem(hidden, 404, "task-not-found")
    # Comparar que son iguales (excepto instance que es la URL)
    assert {k: v for k, v in hidden.json().items() if k != "instance"} == \
           {k: v for k, v in ghost.json().items() if k != "instance"}


def test_root_task_without_path_is_only_readable_with_full_access(shared):
    """Una tarea sin path solo es legible con `*` en lectura (H-064 F3b2 Regla 1)."""
    s = shared
    root_id = s.root_task["id"]
    # Ana (Pub lectura) no puede verla
    problem(s.ana.get(f"/vaults/{s.vault}/tasks/{root_id}"), 404, "task-not-found")
    # Bea (Pub escritura + Priv lectura) tampoco (no tiene `*`)
    problem(s.bea.get(f"/vaults/{s.vault}/tasks/{root_id}"), 404, "task-not-found")
    # Cam (* lectura) sí
    assert s.cam.get(f"/vaults/{s.vault}/tasks/{root_id}").status_code == 200
    # Owner siempre
    assert s.owner.get(f"/vaults/{s.vault}/tasks/{root_id}").status_code == 200


# --- Escribir: crear ---

def test_create_needs_write_access_to_the_path(shared):
    """Crear una tarea exige escritura en su path."""
    s = shared
    # Ana (Pub lectura) no puede crear ni en Pub ni en Priv
    problem(s.ana.post(f"/vaults/{s.vault}/tasks", json={"title": "Ana en Pub", "path": "Pub"}), 403, "share-forbidden")
    problem(s.ana.post(f"/vaults/{s.vault}/tasks", json={"title": "Ana en Priv", "path": "Priv"}), 403, "share-forbidden")

    # Bea (Pub escritura) puede en Pub pero no en Priv (solo lectura)
    res = s.bea.post(f"/vaults/{s.vault}/tasks", json={"title": "Bea en Pub", "path": "Pub"})
    assert res.status_code == 201
    problem(s.bea.post(f"/vaults/{s.vault}/tasks", json={"title": "Bea en Priv", "path": "Priv"}), 403, "share-forbidden")

    # Cam (* lectura) no puede crear en ningún lado
    problem(s.cam.post(f"/vaults/{s.vault}/tasks", json={"title": "Cam", "path": "Pub"}), 403, "share-forbidden")
    problem(s.cam.post(f"/vaults/{s.vault}/tasks", json={"title": "Cam", "path": "Priv"}), 403, "share-forbidden")


def test_create_without_path_needs_full_write_access(shared):
    """Crear una tarea sin path exige `*` en escritura."""
    s = shared
    # Solo el owner puede crear sin path
    assert s.owner.post(f"/vaults/{s.vault}/tasks", json={"title": "Owner sin path"}).status_code == 201
    # Ningún miembro puede
    problem(s.ana.post(f"/vaults/{s.vault}/tasks", json={"title": "Ana sin path"}), 403, "share-forbidden")
    problem(s.bea.post(f"/vaults/{s.vault}/tasks", json={"title": "Bea sin path"}), 403, "share-forbidden")
    problem(s.cam.post(f"/vaults/{s.vault}/tasks", json={"title": "Cam sin path"}), 403, "share-forbidden")


def test_create_subtask_requires_read_on_parent_and_write_on_path(shared):
    """Crear subtarea: leer la raíz (si no, 404) y escribir el path (si no, 403)."""
    s = shared
    # Bea puede crear subtarea bajo pub_task (escritura en Pub)
    res = s.bea.post(f"/vaults/{s.vault}/tasks/{s.pub_task['id']}/subtasks",
                      json={"title": "Subtarea de Bea", "path": "Pub"})
    assert res.status_code == 201

    # Ana no escribe en la raíz (sin path): 403 antes de mirar al padre, así un padre oculto y uno inexistente responden igual
    hidden = s.ana.post(f"/vaults/{s.vault}/tasks/{s.priv_task['id']}/subtasks", json={"title": "Ana subtask"})
    ghost = s.ana.post(f"/vaults/{s.vault}/tasks/{uuid.uuid4()}/subtasks", json={"title": "Ana subtask"})
    problem(hidden, 403, "share-forbidden")
    problem(ghost, 403, "share-forbidden")
    # Con un path escribible, un padre que no lee es 404 (cubierto en test_create_cannot_hang_a_task_under_a_hidden_or_read_only_parent)
    problem(s.bea.post(f"/vaults/{s.vault}/tasks/{s.root_task['id']}/subtasks", json={"title": "x", "path": "Pub"}), 404, "task-not-found")

    # Cam puede leer pub_task pero no escribir
    problem(s.cam.post(f"/vaults/{s.vault}/tasks/{s.pub_task['id']}/subtasks",
                       json={"title": "Cam subtask", "path": "Pub"}), 403, "share-forbidden")


# --- Escribir: actualizar ---

def test_update_requires_read_and_write_on_path_before_if_match(shared):
    """PATCH exige lectura (si no, 404 antes que If-Match, H-064 F3b2 Regla 5) y escritura (si no, 403)."""
    s = shared
    # Tarea oculta para Ana
    task_id = s.priv_task["id"]
    etag = s.bea.get(f"/vaults/{s.vault}/tasks/{task_id}").headers["ETag"]

    # Ana: sin lectura → 404 incluso con If-Match errado
    wrong_if_match = {"If-Match": '"wrong"'}
    problem(s.ana.patch(f"/vaults/{s.vault}/tasks/{task_id}", json={"title": "y"}, headers=wrong_if_match), 404, "task-not-found")

    # Bea: lectura OK (Priv), escritura NO (Priv es lectura) → 403 incluso con If-Match errado
    problem(s.bea.patch(f"/vaults/{s.vault}/tasks/{task_id}", json={"title": "y"}, headers=wrong_if_match), 403, "share-forbidden")

    # Cam: lectura OK (* lectura), escritura NO (* es lectura) → 403 incluso con If-Match errado
    problem(s.cam.patch(f"/vaults/{s.vault}/tasks/{task_id}", json={"title": "y"}, headers=wrong_if_match), 403, "share-forbidden")

    # Solo owner puede actualizar
    res = s.owner.patch(f"/vaults/{s.vault}/tasks/{task_id}", json={"title": "Updated"}, headers={"If-Match": etag})
    assert res.status_code == 200 and res.json()["title"] == "Updated"


def test_update_on_path_change_checks_write_on_new_path(shared):
    """Si el PATCH cambia path, se exige escritura en el path nuevo."""
    s = shared
    task = put_task(s.owner, s.vault, "Task in Pub", path="Pub")
    etag = s.bea.get(f"/vaults/{s.vault}/tasks/{task['id']}").headers["ETag"]

    # Bea: cambiar de Pub a Priv (donde solo tiene lectura) → 403
    problem(s.bea.patch(f"/vaults/{s.vault}/tasks/{task['id']}", json={"path": "Priv"}, headers={"If-Match": etag}), 403, "share-forbidden")

    # Cam: no puede cambiar path (* lectura)
    cam_etag = s.cam.get(f"/vaults/{s.vault}/tasks/{task['id']}").headers["ETag"]
    problem(s.cam.patch(f"/vaults/{s.vault}/tasks/{task['id']}", json={"path": "Pub/sub"}, headers={"If-Match": cam_etag}), 403, "share-forbidden")


def test_member_cannot_assign_to_agent_or_change_project_id(shared):
    """Un miembro no puede asignar a agente ni cambiar project_id."""
    s = shared
    task_id = s.pub_task["id"]
    etag = s.bea.get(f"/vaults/{s.vault}/tasks/{task_id}").headers["ETag"]

    # Intentar asignar a agente → 403
    problem(s.bea.patch(f"/vaults/{s.vault}/tasks/{task_id}",
                        json={"assignee_type": "agent", "assignee_agent_id": "aira"},
                        headers={"If-Match": etag}), 403, "share-forbidden")

    # Solo el owner puede asignar a agente
    owner_etag = s.owner.get(f"/vaults/{s.vault}/tasks/{task_id}").headers["ETag"]
    res = s.owner.patch(f"/vaults/{s.vault}/tasks/{task_id}",
                        json={"assignee_type": "agent", "assignee_agent_id": "aira"},
                        headers={"If-Match": owner_etag})
    assert res.status_code == 200


def test_delete_requires_read_and_write(shared):
    """DELETE exige lectura (si no, 404 antes) y escritura (si no, 403)."""
    s = shared
    # Crear una tarea en Pub que Ana no puede escribir
    task = put_task(s.owner, s.vault, "Para borrar", path="Pub")

    # Ana: lectura OK, escritura NO → 403
    problem(s.ana.delete(f"/vaults/{s.vault}/tasks/{task['id']}"), 403, "share-forbidden")

    # Bea: escritura OK → 204
    task2 = put_task(s.owner, s.vault, "Para borrar 2", path="Pub")
    assert s.bea.delete(f"/vaults/{s.vault}/tasks/{task2['id']}").status_code == 204

    # Cam: lectura OK, escritura NO → 403
    task3 = put_task(s.owner, s.vault, "Para borrar 3", path="Priv")
    problem(s.cam.delete(f"/vaults/{s.vault}/tasks/{task3['id']}"), 403, "share-forbidden")


# --- Dependencias (blocked_by) ---

def test_blocked_by_is_filtered_to_readable_tasks(shared):
    """blocked_by solo lista tareas que el miembro puede leer."""
    s = shared
    # Crear dos tareas: una en Pub, otra en Priv
    pub = put_task(s.owner, s.vault, "pub blocker", path="Pub")
    priv = put_task(s.owner, s.vault, "priv blocker", path="Priv")

    # Crear una tarea que dependa de ambas
    task = put_task(s.owner, s.vault, "Bloqueada", path="Pub",
                    parent_id=None)  # raíz
    s.owner.patch(f"/vaults/{s.vault}/tasks/{task['id']}",
                  json={"blocked_by": [pub["id"], priv["id"]]})

    # Ana: solo ve la bloqueadora de Pub
    ana_view = s.ana.get(f"/vaults/{s.vault}/tasks/{task['id']}").json()
    assert ana_view["blocked_by"] == [pub["id"]]

    # Cam: ve ambas
    cam_view = s.cam.get(f"/vaults/{s.vault}/tasks/{task['id']}").json()
    assert set(cam_view["blocked_by"]) == {pub["id"], priv["id"]}


def test_member_cannot_block_with_unreadable_task(shared):
    """Si un miembro intenta bloquear con una tarea que no lee → TaskNotFound (404)."""
    s = shared
    # Crear una tarea en Pub que Bea puede escribir
    task = put_task(s.owner, s.vault, "Task in Pub", path="Pub")

    # Bea intenta bloquear con una tarea que no puede leer (el root sin path)
    # Bea tiene Pub (escritura) + Priv (lectura); no tiene root sin path
    problem(s.bea.patch(f"/vaults/{s.vault}/tasks/{task['id']}",
                        json={"blocked_by": [s.root_task["id"]]}), 404, "task-not-found")


# --- Acceso revocado ---

def test_revoking_grant_cuts_access_immediately(shared):
    """Revocar concesiones corta el acceso al momento."""
    s = shared
    # Ana inicialmente ve pub_task
    assert s.ana.get(f"/vaults/{s.vault}/tasks/{s.pub_task['id']}").status_code == 200

    # Revocar: cambiar concesiones de Ana
    s.owner.put(f"/vaults/{s.vault}/members/{s.ana_m['id']}/grants",
                json={"grants": [{"folder": "Pub/sub", "level": "lectura"}]})

    # Ana ya no ve pub_task (está en Pub, no en Pub/sub)
    problem(s.ana.get(f"/vaults/{s.vault}/tasks/{s.pub_task['id']}"), 404, "task-not-found")

    # Eliminar membresía
    assert s.owner.delete(f"/vaults/{s.vault}/members/{s.ana_m['id']}").status_code == 204
    # Ana pierde acceso a la bóveda completa
    problem(s.ana.get(f"/vaults/{s.vault}/tasks"), 404, "vault-not-found")


# --- Dueño y agentes sin cambios ---

def test_owner_behavior_unchanged(shared):
    """El dueño sigue teniendo acceso completo a todas sus tareas."""
    s = shared
    # Listar todas
    owner_tasks = tasks(s.owner, s.vault)
    assert len(owner_tasks) == 4  # root, pub, pub_sub, priv

    # Crear sin restricciones
    res = s.owner.post(f"/vaults/{s.vault}/tasks", json={"title": "Owner new"})
    assert res.status_code == 201

    # Actualizar sin restricciones
    task_id = s.pub_task["id"]
    etag = s.owner.get(f"/vaults/{s.vault}/tasks/{task_id}").headers["ETag"]
    res = s.owner.patch(f"/vaults/{s.vault}/tasks/{task_id}",
                        json={"path": "Priv", "title": "Moved"},
                        headers={"If-Match": etag})
    assert res.status_code == 200

    # Eliminar sin restricciones
    task2 = put_task(s.owner, s.vault, "To delete")
    assert s.owner.delete(f"/vaults/{s.vault}/tasks/{task2['id']}").status_code == 204


def test_agent_key_behavior_unchanged(shared):
    """Una key de agente del dueño sigue operando sin cambios (H-053 tests siguen pasando)."""
    s = shared
    aira_key = agent_client(s.owner, "aira")

    # Listar tareas del dueño vía key
    owner_tasks_via_key = tasks(aira_key, s.vault)
    owner_tasks_direct = tasks(s.owner, s.vault)
    assert {t["id"] for t in owner_tasks_via_key} == {t["id"] for t in owner_tasks_direct}

    # Crear tarea vía key
    res = aira_key.post(f"/vaults/{s.vault}/tasks", json={"title": "By aira key"})
    assert res.status_code == 201


def test_stranger_gets_404_like_before(shared, db):
    """Un extraño sigue recibiendo 404 para la bóveda (nada cambia)."""
    s = shared
    stranger = person(s.owner, db, "stranger@example.com")
    problem(stranger.get(f"/vaults/{s.vault}/tasks"), 404, "vault-not-found")
    problem(stranger.post(f"/vaults/{s.vault}/tasks", json={"title": "x"}), 404, "vault-not-found")


# --- Huecos que el cuerpo de la creación y del cambio no deben abrir ---

def test_create_cannot_hang_a_task_under_a_hidden_or_read_only_parent(shared):
    s = shared
    problem(s.bea.post(f"/vaults/{s.vault}/tasks", json={"title": "x", "path": "Pub", "parent_id": s.root_task["id"]}), 404, "task-not-found")
    problem(s.bea.post(f"/vaults/{s.vault}/tasks", json={"title": "x", "path": "Pub", "parent_id": s.priv_task["id"]}), 403, "share-forbidden")
    ok = s.bea.post(f"/vaults/{s.vault}/tasks", json={"title": "x", "path": "Pub", "parent_id": s.pub_task["id"]})
    assert ok.status_code == 201 and ok.json()["parent_id"] == s.pub_task["id"]


def test_create_cannot_assign_an_agent_set_a_project_or_block_with_a_hidden_task(shared):
    s = shared
    base = {"title": "x", "path": "Pub"}
    problem(s.bea.post(f"/vaults/{s.vault}/tasks", json={**base, "assignee_type": "agent", "assignee_agent_id": "aira"}), 403, "share-forbidden")
    problem(s.bea.post(f"/vaults/{s.vault}/tasks", json={**base, "assignee_agent_id": "aira"}), 403, "share-forbidden")
    problem(s.bea.post(f"/vaults/{s.vault}/tasks", json={**base, "project_id": "p-1"}), 403, "share-forbidden")
    problem(s.bea.post(f"/vaults/{s.vault}/tasks", json={**base, "blocked_by": [s.root_task["id"]]}), 404, "task-not-found")
    mine = s.bea.post(f"/vaults/{s.vault}/tasks", json={**base, "blocked_by": [s.pub_task["id"]]})
    assert mine.status_code == 201 and mine.json()["blocked_by"] == [s.pub_task["id"]]
    assert {t["title"] for t in tasks(s.owner, s.vault)} == {"Raíz sin path", "En Pub", "En Pub/sub", "En Priv", "x"}


def test_update_cannot_clear_the_path_or_assign_an_agent_through_the_user_kind(shared):
    s = shared
    task = put_task(s.owner, s.vault, "Mía", path="Pub")
    url = f"/vaults/{s.vault}/tasks/{task['id']}"
    problem(s.bea.patch(url, json={"path": None}), 403, "share-forbidden")
    problem(s.bea.patch(url, json={"assignee_type": "user", "assignee_agent_id": "aira"}), 403, "share-forbidden")
    problem(s.bea.patch(url, json={"project_id": "p-1"}), 403, "share-forbidden")
    assert s.bea.patch(url, json={"title": "Cambiada", "status": "in_progress"}).status_code == 200
    assert s.owner.get(url).json()["title"] == "Cambiada"


def test_deleting_a_root_needs_write_on_every_subtask(shared):
    s = shared
    root = put_task(s.owner, s.vault, "Raíz de Pub", path="Pub")
    put_task(s.owner, s.vault, "Hija en Priv", path="Priv", parent_id=root["id"])
    problem(s.bea.delete(f"/vaults/{s.vault}/tasks/{root['id']}"), 403, "share-forbidden")
    assert s.owner.get(f"/vaults/{s.vault}/tasks/{root['id']}").status_code == 200
    plain = put_task(s.owner, s.vault, "Otra raíz", path="Pub")
    put_task(s.owner, s.vault, "Hija en Pub", path="Pub", parent_id=plain["id"])
    assert s.bea.delete(f"/vaults/{s.vault}/tasks/{plain['id']}").status_code == 204


def test_the_cross_vault_listing_never_includes_a_shared_vault(shared):
    s = shared
    res = s.bea.get("/tasks")
    assert res.status_code == 200 and res.json()["items"] == []
