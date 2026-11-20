"""H-064 F4: agentes de miembros invitados en bóvedas compartidas.

Los agentes creados por un invitado (con POST /auth/agent-keys {"label","agent_id"})
entran con las mismas concesiones de la persona como techo. No regresan.

API real (TestClient + CouchDB + Postgres); el modelo de acceso restringido por path y nivel.
"""
import uuid
from types import SimpleNamespace

import pytest

from app.core.models.change_log import ChangeLog
from app.core.models.task import VaultTask
from app.core.models.user import User
from app.main import app
from app.routers.files import get_object_storage
from tests.fake_object_storage import FakeObjectStorage
from tests.test_h030_api import agent_client, post_note, register, vault_of
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


def upload(client, vault_id, folder=None, filename="foto.png"):
    """Sube un archivo a la bóveda."""
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    form = {"vault_id": vault_id}
    if folder is not None:
        form["folder"] = folder
    res = client.post("/files", data=form, files={"file": (filename, png, "image/png")})
    assert res.status_code == 201, res.text
    return res.json()


def download(client, file_id):
    """Descarga un archivo por su ID."""
    return client.get(f"/files/{file_id}")


@pytest.fixture
def storage():
    """Almacén de objetos fake en memoria."""
    fake = FakeObjectStorage()
    app.dependency_overrides[get_object_storage] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_object_storage, None)


@pytest.fixture
def shared(ready_admin, db, storage):
    """Bóveda compartida con notas, tareas y archivos en diferentes paths."""
    vault = vault_of(ready_admin, name="Compartida")

    # Crear notas
    post_note(ready_admin, vault, "Pub/n.md", "nota pública")
    post_note(ready_admin, vault, "Priv/n.md", "nota privada")

    # Crear tareas
    pub_task = put_task(ready_admin, vault, "Tarea Pub", path="Pub")
    priv_task = put_task(ready_admin, vault, "Tarea Priv", path="Priv")

    # Crear archivos
    pub_file = upload(ready_admin, vault, folder="Pub", filename="pub.png")
    priv_file = upload(ready_admin, vault, folder="Priv", filename="priv.png")

    # Registrar agente del propietario
    register(ready_admin, vault, "aira", ["*"])

    # Crear miembros
    ana, ana_m = join(ready_admin, db, vault, "ana@example.com", [{"folder": "Pub", "level": "escritura"}])
    bea, bea_m = join(ready_admin, db, vault, "bea@example.com", [{"folder": "Pub", "level": "lectura"}])
    cam, cam_m = join(ready_admin, db, vault, "cam@example.com", [{"folder": "*", "level": "lectura"}])

    return SimpleNamespace(
        owner=ready_admin, vault=vault,
        pub_note_path="Pub/n.md", priv_note_path="Priv/n.md",
        pub_task=pub_task, priv_task=priv_task,
        pub_file=pub_file, priv_file=priv_file,
        ana=ana, bea=bea, cam=cam,
        ana_m=ana_m, bea_m=bea_m, cam_m=cam_m,
        db=db)


# --- 1. Leer notas ---

def test_guest_agent_reads_accessible_note(shared):
    """El agente de Ana lee Pub/n.md (200)."""
    s = shared
    ana_aira = agent_client(s.ana, "aira")
    res = ana_aira.get(f"/vaults/{s.vault}/notes", params={"prefix": "Pub"})
    assert res.status_code == 200
    paths = {n["path"] for n in res.json()["items"]}
    assert s.pub_note_path in paths


def _note_id(owner, vault, path):
    item = next(i for i in owner.get(f"/vaults/{vault}/notes", params={"limit": 200}).json()["items"] if i["path"] == path)
    return item["id"]


def test_guest_agent_cannot_read_forbidden_note(shared):
    """El agente de Ana no ve Priv/n.md: ni en el listado ni por id (404, idéntico a una nota inexistente)."""
    s = shared
    ana_aira = agent_client(s.ana, "aira")
    res = ana_aira.get(f"/vaults/{s.vault}/notes", params={"prefix": "Priv"})
    assert res.status_code == 200
    assert res.json()["items"] == []
    hidden = ana_aira.get(f"/vaults/{s.vault}/notes/{_note_id(s.owner, s.vault, s.priv_note_path)}")
    ghost = ana_aira.get(f"/vaults/{s.vault}/notes/{uuid.uuid4()}")
    problem(hidden, 404, "note-not-found")
    assert {k: v for k, v in hidden.json().items() if k != "instance"} == {k: v for k, v in ghost.json().items() if k != "instance"}
    ok = ana_aira.get(f"/vaults/{s.vault}/notes/{_note_id(s.owner, s.vault, s.pub_note_path)}")
    assert ok.status_code == 200, ok.text


def test_guest_agent_never_sees_the_reserved_zones_of_the_owner(shared):
    """Ni `AG - AGENTES` (donde el propietario registró `aira`) ni `BITACORA` aparecen para el agente del invitado."""
    s = shared
    star = agent_client(s.cam, "aira")  # Cam tiene lectura en toda la bóveda
    paths = {n["path"] for n in star.get(f"/vaults/{s.vault}/notes", params={"limit": 200}).json()["items"]}
    assert {"Pub/n.md", "Priv/n.md"} <= paths
    assert not any(p.startswith(("AG - AGENTES", "AG - SKILLS", "AG - MENSAJES", "BITACORA")) for p in paths)
    registry_id = _note_id(s.owner, s.vault, "AG - AGENTES/aira.md")
    problem(star.get(f"/vaults/{s.vault}/notes/{registry_id}"), 404, "note-not-found")


def test_guest_agent_lists_only_accessible_notes(shared):
    """GET /vaults/{v}/notes del agente de Ana solo lista lo de Pub."""
    s = shared
    ana_aira = agent_client(s.ana, "aira")
    res = ana_aira.get(f"/vaults/{s.vault}/notes", params={"limit": 200})
    assert res.status_code == 200
    paths = {n["path"] for n in res.json()["items"]}
    # Ana tiene escritura en Pub, así que ve notas de Pub (y PLANTILLAS pero no BITACORA/AG-)
    assert all("Pub/" in p or "PLANTILLAS/" in p for p in paths)


# --- 2. Escribir notas ---

def test_guest_agent_writes_in_accessible_folder(shared):
    """El agente de Ana crea y edita en Pub (201 crear, 200 editar)."""
    s = shared
    ana_aira = agent_client(s.ana, "aira")

    # Crear nota
    res = ana_aira.post(f"/vaults/{s.vault}/notes", json={"path": "Pub/por-aira.md", "content": "escrito por agente"})
    assert res.status_code == 201, res.text
    note_id = res.json()["id"]
    etag = res.headers["ETag"]

    # Editar nota
    res = ana_aira.patch(f"/vaults/{s.vault}/notes/{note_id}", json={"content": "editado"}, headers={"If-Match": etag})
    assert res.status_code == 200, res.text


def test_guest_agent_cannot_write_in_forbidden_folder(shared):
    """El agente de Ana NO puede escribir en Priv (404 al leer, 403 al crear)."""
    s = shared
    ana_aira = agent_client(s.ana, "aira")

    # Crear en Priv: aunque Ana tiene escritura en Pub, no tiene nada en Priv
    # El endpoint debe responder 403 share-forbidden o 404 según el comportamiento de la PERSONA
    res = ana_aira.post(f"/vaults/{s.vault}/notes", json={"path": "Priv/x.md", "content": "x"})
    res_person = s.ana.post(f"/vaults/{s.vault}/notes", json={"path": "Priv/x.md", "content": "x"})
    assert res.status_code == res_person.status_code == 403
    problem(res, 403, "share-forbidden")
    assert "Priv/x.md" not in {n["path"] for n in s.owner.get(f"/vaults/{s.vault}/notes", params={"limit": 200}).json()["items"]}


# --- 3. Colisión de ID de agente ---

def test_guest_agent_id_collision_limited_by_guest_grants(shared):
    """El propietario registró aira con ['*']; el agente aira de Bea (solo lectura en Pub) NO puede escribir.

    Bea tiene SOLO lectura en Pub. Su agente aira está limitado a esas concesiones.
    El agente aira del PROPIETARIO sí escribe en Priv (regresión).
    """
    s = shared

    # Agente aira de Bea (solo lectura en Pub)
    bea_aira = agent_client(s.bea, "aira")

    # No puede escribir en Pub (Bea solo tiene lectura)
    res = bea_aira.post(f"/vaults/{s.vault}/notes", json={"path": "Pub/x.md", "content": "x"})
    assert res.status_code == 403, res.text
    problem(res, 403, "share-forbidden")

    # No puede leer ni escribir en Priv
    res = bea_aira.get(f"/vaults/{s.vault}/notes", params={"prefix": "Priv"})
    assert res.status_code == 200 and len(res.json()["items"]) == 0

    # Agente aira del PROPIETARIO sí puede escribir en Priv (sin cambios)
    owner_aira = agent_client(s.owner, "aira")
    res = owner_aira.post(f"/vaults/{s.vault}/notes", json={"path": "Priv/por-propietario.md", "content": "owner"})
    assert res.status_code == 201, res.text


def test_guest_agent_cannot_read_forbidden_folder(shared):
    """El agente de Bea no puede leer Priv (aunque Bea tenga lectura, solo en Pub)."""
    s = shared
    bea_aira = agent_client(s.bea, "aira")

    res = bea_aira.get(f"/vaults/{s.vault}/notes", params={"prefix": "Priv"})
    assert res.status_code == 200
    assert res.json()["items"] == []
    problem(bea_aira.get(f"/vaults/{s.vault}/notes/{_note_id(s.owner, s.vault, s.priv_note_path)}"), 404, "note-not-found")


def test_the_owner_registry_is_not_applied_to_a_guest_agent_with_the_same_id(shared, monkeypatch):
    """Con el cumplimiento activo, el registro de `aira` del propietario (suspendido y solo en `Priv`) frena a SU `aira`
    pero no al `aira` de Ana: a ella la rige su concesión en `Pub`."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    s = shared
    register(s.owner, s.vault, "aira", ["Priv"], estado="suspendido")
    from app.services import agent_access_guard
    agent_access_guard._CACHE.clear()
    ana_aira = agent_client(s.ana, "aira")
    res = ana_aira.post(f"/vaults/{s.vault}/notes", json={"path": "Pub/pese-al-registro.md", "content": "x"})
    assert res.status_code == 201, res.text
    task = ana_aira.post(f"/vaults/{s.vault}/tasks", json={"title": "pese al registro", "path": "Pub"})
    assert task.status_code == 201, task.text
    assert upload(ana_aira, s.vault, folder="Pub", filename="pese-al-registro.png")["folder"] == "Pub"
    owner_aira = agent_client(s.owner, "aira")
    problem(owner_aira.post(f"/vaults/{s.vault}/notes", json={"path": "Pub/denegado.md", "content": "x"}), 403, "agent-access-denied")
    problem(owner_aira.post(f"/vaults/{s.vault}/tasks", json={"title": "denegada"}), 403, "agent-access-denied")


# --- 4. Clave general del invitado (sin agent_id) ---

def test_general_key_of_guest_gets_404_on_shared_vault(shared):
    """Una clave general del invitado (sin agent_id) obtiene 404 en la bóveda compartida.

    Si el endpoint /auth/agent-keys permite crear sin agent_id, testeamos que obtiene 404.
    Si no lo permite, omitimos esta prueba.
    """
    s = shared
    res = s.ana.post("/auth/agent-keys", json={"label": "general-ana"})

    # Si la API lo rechaza, reportamos que se omite
    if res.status_code == 422:
        pytest.skip("Endpoint rechaza POST /auth/agent-keys sin agent_id")

    assert res.status_code == 201
    from tests.test_agent_api_key_access import _bearer_client
    general = _bearer_client(s.ana, res.json()["key"])

    # Intentar acceder a la bóveda compartida
    problem(general.get(f"/vaults/{s.vault}/notes"), 404, "vault-not-found")


# --- 5. Clave admin del invitado ---

def test_guest_agent_key_with_admin_flag_still_limited_by_grants(shared):
    """Una clave is_admin del invitado (agent_client(bea, "root", admin_flag=True))
    sigue limitada a las concesiones de Bea.

    Si la API no lo permite desde un usuario no-admin, reportamos el error.
    """
    s = shared
    res = s.bea.post("/auth/agent-keys", json={"label": "root-bea", "agent_id": "root", "is_admin": True})

    # Si la API rechaza que un usuario no-admin se declare admin, reportamos
    if res.status_code == 422 or res.status_code == 403:
        pytest.skip(f"API rechaza is_admin=True desde usuario no-admin (status {res.status_code})")

    assert res.status_code == 201
    from tests.test_agent_api_key_access import _bearer_client
    bea_root = _bearer_client(s.bea, res.json()["key"])

    # Aún limitado por las concesiones de Bea (lectura en Pub)
    # No puede escribir en Pub
    problem(bea_root.post(f"/vaults/{s.vault}/notes", json={"path": "Pub/x.md", "content": "x"}), 403, "share-forbidden")
    # No ve Priv
    res = bea_root.get(f"/vaults/{s.vault}/notes", params={"prefix": "Priv"})
    assert res.status_code == 200 and len(res.json()["items"]) == 0


# --- 6. Autoría en BITACORA ---

def test_authorship_in_bitacora(shared):
    """Tras escribir Ana (sesión) y su agente en Pub, change_log muestra autoría exacta.

    Ana (persona) → author_kind="human", author="ana@example.com"
    Agente aira de Ana → author_kind="agent", author="aira (de ana@example.com)"
    """
    s = shared
    ana_aira = agent_client(s.ana, "aira")

    # Ana (persona) escribe
    res_person = s.ana.post(f"/vaults/{s.vault}/notes", json={"path": "Pub/de-ana.md", "content": "por ana"})
    assert res_person.status_code == 201

    # Agente aira de Ana escribe
    res_agent = ana_aira.post(f"/vaults/{s.vault}/notes", json={"path": "Pub/de-aira.md", "content": "por aira"})
    assert res_agent.status_code == 201

    # Consultar change_log
    s.db.expire_all()
    logs = s.db.query(ChangeLog).filter(
        ChangeLog.vault_id == s.vault,
        ChangeLog.path.in_(["Pub/de-ana.md", "Pub/de-aira.md"])
    ).order_by(ChangeLog.path).all()

    assert len(logs) >= 2

    # Buscar la entrada de Ana (persona)
    ana_log = next((l for l in logs if l.path == "Pub/de-ana.md"), None)
    assert ana_log is not None
    assert ana_log.author_kind == "human"
    assert ana_log.author == "ana@example.com"

    # Buscar la entrada del agente
    aira_log = next((l for l in logs if l.path == "Pub/de-aira.md"), None)
    assert aira_log is not None
    assert aira_log.author_kind == "agent"
    assert aira_log.author == "aira (de ana@example.com)"


# --- 7. Autoría en tareas ---

def test_authorship_in_tasks(shared):
    """Ana (sesión) crea tarea → created_by == f"guest:{ana_id}".
    Su agente → created_by == f"guest:{ana_id}/agent:aira".
    La tarea del propietario sigue con created_by == "user".
    """
    s = shared

    # Obtener ID de Ana desde la BD
    ana_user = s.db.query(User).filter(User.email == "ana@example.com").first()
    assert ana_user is not None
    ana_id = str(ana_user.id)

    # Ana (persona) crea una tarea en Pub
    res_person = s.ana.post(f"/vaults/{s.vault}/tasks", json={"title": "Tarea de Ana", "path": "Pub"})
    assert res_person.status_code == 201
    task_ana = res_person.json()

    # Agente aira de Ana crea una tarea en Pub
    ana_aira = agent_client(s.ana, "aira")
    res_agent = ana_aira.post(f"/vaults/{s.vault}/tasks", json={"title": "Tarea de Aira", "path": "Pub"})
    assert res_agent.status_code == 201
    task_aira = res_agent.json()

    # Consultar las tareas en la BD
    s.db.expire_all()
    task_ana_db = s.db.query(VaultTask).filter(VaultTask.id == task_ana["id"]).first()
    task_aira_db = s.db.query(VaultTask).filter(VaultTask.id == task_aira["id"]).first()

    assert task_ana_db is not None
    assert task_aira_db is not None

    # Verificar created_by
    assert task_ana_db.created_by == f"guest:{ana_id}"
    assert task_aira_db.created_by == f"guest:{ana_id}/agent:aira"

    # Tarea del propietario sigue con "user"
    owner_task = s.owner.post(f"/vaults/{s.vault}/tasks", json={"title": "Tarea owner", "path": "Pub"})
    assert owner_task.status_code == 201
    owner_task_db = s.db.query(VaultTask).filter(VaultTask.id == owner_task.json()["id"]).first()
    assert owner_task_db.created_by == "user"


# --- 8. Tareas por clave de agente ---

def test_guest_agent_lists_only_readable_tasks(shared):
    """El agente de Ana lista solo tareas legibles (Pub, no Priv)."""
    s = shared
    ana_aira = agent_client(s.ana, "aira")

    res = ana_aira.get(f"/vaults/{s.vault}/tasks", params={"limit": 200})
    assert res.status_code == 200
    task_titles = {t["title"] for t in res.json()["items"]}

    # Ana tiene escritura en Pub: ve tareas de Pub
    assert "Tarea Pub" in task_titles
    # No ve Priv
    assert "Tarea Priv" not in task_titles


def test_guest_agent_cannot_assign_agent_to_task(shared):
    """El agente de Ana no puede asignar una tarea a un agente (misma respuesta que la PERSONA)."""
    s = shared
    ana_aira = agent_client(s.ana, "aira")

    # Obtener ETag de la tarea
    res = ana_aira.get(f"/vaults/{s.vault}/tasks/{s.pub_task['id']}")
    assert res.status_code == 200
    etag = res.headers["ETag"]

    # Intentar asignar a agente (igual que Ana persona)
    res_agent = ana_aira.patch(f"/vaults/{s.vault}/tasks/{s.pub_task['id']}",
                               json={"assignee_type": "agent", "assignee_agent_id": "aira"},
                               headers={"If-Match": etag})
    res_person = s.ana.patch(f"/vaults/{s.vault}/tasks/{s.pub_task['id']}",
                             json={"assignee_type": "agent", "assignee_agent_id": "aira"},
                             headers={"If-Match": etag})
    assert res_agent.status_code == res_person.status_code
    if res_agent.status_code == 403:
        problem(res_agent, 403, "share-forbidden")


def test_guest_agent_cross_vault_listing_excludes_shared_vault(shared):
    """GET /tasks (sin bóveda) con clave de agente del invitado solo muestra tareas de SU cuenta (propietario del agente)."""
    s = shared
    ana_aira = agent_client(s.ana, "aira")

    res = ana_aira.get("/tasks")
    assert res.status_code == 200
    items = res.json()["items"]

    # No debe mostrar tareas de la bóveda compartida del propietario (cjhirashi)
    # Solo tareas de la bóveda de Ana (que no hay, pero la clave no vería las del propietario)
    # El propietario tiene tareas en esa bóveda; Ana no tiene ninguna propia: su /tasks debe salir vacío.
    assert items == []


# --- 9. Archivos por clave de agente ---

def test_guest_agent_uploads_and_downloads_in_accessible_folder(shared):
    """El agente de Ana sube un archivo a Pub y lo descarga; no ve los de Priv."""
    s = shared
    ana_aira = agent_client(s.ana, "aira")

    # Subir archivo a Pub
    file_res = upload(ana_aira, s.vault, folder="Pub", filename="agent-upload.png")
    file_id = file_res["id"]

    # Descargar archivo
    res = download(ana_aira, file_id)
    assert res.status_code == 200, res.text

    # Listar archivos
    res = ana_aira.get(f"/vaults/{s.vault}/files", params={"limit": 100})
    assert res.status_code == 200
    file_names = {f["name"] for f in res.json()["files"]}
    assert "agent-upload.png" in file_names
    # No ve Priv
    assert "priv.png" not in file_names


# --- 10. Revocación inmediata ---

def test_revocation_cuts_access_immediately(shared):
    """El propietario revoca a Ana (DELETE /vaults/{v}/members/{member_id})
    y la MISMA clave del agente de Ana pasa a 404 en la siguiente petición.
    """
    s = shared
    ana_aira = agent_client(s.ana, "aira")

    # Verificar acceso inicial
    res = ana_aira.get(f"/vaults/{s.vault}/notes", params={"prefix": "Pub"})
    assert res.status_code == 200

    # Revocar a Ana
    assert s.owner.delete(f"/vaults/{s.vault}/members/{s.ana_m['id']}").status_code == 204

    # Mismo agente intenta acceder: debe recibir 404
    problem(ana_aira.get(f"/vaults/{s.vault}/notes"), 404, "vault-not-found")


# --- 11. Agente de tercera cuenta sin invitación ---

def test_agent_of_non_member_gets_404(shared, db):
    """Un agente que no es de ningún miembro (clave de tercera cuenta sin invitación) obtiene 404."""
    s = shared

    # Crear persona completamente ajena sin invitación
    dave = person(s.owner, db, "dave@example.com")
    dave_aira = agent_client(dave, "aira")

    # Debe obtener 404 (nunca fue invitado)
    problem(dave_aira.get(f"/vaults/{s.vault}/notes"), 404, "vault-not-found")


# --- 12. Descubrir bóvedas compartidas con la clave del agente ---

def test_a_guest_agent_can_list_its_invitations_but_not_answer_them(shared, db):
    s = shared
    ana_aira = agent_client(s.ana, "aira")
    res = ana_aira.get("/invitations", params={"status": "activo"})
    assert res.status_code == 200, res.text
    (inv,) = res.json()["items"]
    assert inv["vault_id"] == s.vault and inv["vault_name"] == "Compartida"
    assert {(g["folder"], g["level"]) for g in inv["grants"]} == {("Pub", "escritura")}
    assert ana_aira.post(f"/invitations/{inv['id']}/leave").status_code in (401, 403)
    assert [m["status"] for m in s.owner.get(f"/vaults/{s.vault}/members").json()["items"] if m["id"] == s.ana_m["id"]] == ["activo"]
