"""H-060: gestión de cuentas por el administrador, límites por usuario, reajuste y purga.

Contra CouchDB real y un FAKE del almacén de objetos (como `test_files_api.py`). El `ContractGuard` de `conftest` exige que
cada error emitido esté declarado en el contrato.
"""
from datetime import datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from app.adapters.couchdb import CouchDBAdapter
from app.adapters.minio_adapter import get_object_storage
from app.core.config import settings
from app.core.limits import GRACE_DAYS, counts_as_document
from app.core.models.file import File
from app.core.models.limit_grace import LimitGrace
from app.core.models.notification import Notification
from app.core.models.user import User
from app.main import app
from app.routers.vaults import get_vault_port
from app.services.limit_reconcile_service import LimitReconcileService
from app.services.user_purge_service import UserPurgeService
from tests.conftest import SEED_EMAIL, SEED_PASSWORD, login
from tests.fake_object_storage import FakeObjectStorage
from tests.test_vaults_api import assert_problem, create

GUEST = "guest@test.com"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32  # 40 bytes


@pytest.fixture
def storage():
    fake = FakeObjectStorage()
    app.dependency_overrides[get_object_storage] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_object_storage, None)


def _guest_client(admin, db, email=GUEST, **limits) -> TestClient:
    """Crea la cuenta como admin, le quita el cambio forzado y devuelve un cliente con su sesión."""
    res = admin.post("/admin/users", json={"email": email, **limits})
    assert res.status_code == 201, res.text
    db.query(User).filter(User.email == email).update({"must_change_password": False})
    db.commit()
    guest = TestClient(app, base_url=str(admin.base_url))
    assert login(guest, email, SEED_PASSWORD).status_code == 200
    return guest


def _make_super_admin(admin, db) -> None:
    db.query(User).filter(User.email == SEED_EMAIL).update({"role_id": "super-admin-role-id"})
    db.commit()
    admin.cookies.clear()
    assert login(admin).status_code == 200


def _user_id(db, email=GUEST) -> str:
    return db.query(User).filter(User.email == email).one().id


# --- Alta con contraseña base y límites iniciales ---

def test_create_uses_base_password_defaults_and_forces_change(ready_admin, db):
    res = ready_admin.post("/admin/users", json={"email": GUEST})
    assert res.status_code == 201
    body = res.json()
    assert body["role"] == "guest" and body["must_change_password"] is True
    assert body["limits"] == {"max_vaults": 2, "max_notes_per_vault": 100, "max_storage_bytes_per_vault": 500 * 1024 * 1024}
    assert login(TestClient(app, base_url=str(ready_admin.base_url)), GUEST, "admin1234").status_code == 200


def test_create_accepts_explicit_and_null_limits(ready_admin):
    res = ready_admin.post("/admin/users", json={
        "email": GUEST, "max_vaults": 5, "max_notes_per_vault": None, "max_storage_bytes_per_vault": 1000})
    assert res.json()["limits"] == {"max_vaults": 5, "max_notes_per_vault": None, "max_storage_bytes_per_vault": 1000}


def test_create_rejects_a_password_in_the_body(ready_admin):
    assert ready_admin.post("/admin/users", json={"email": GUEST, "password": "otra-cosa-1234"}).status_code == 422


def test_new_password_cannot_be_the_base_password(ready_admin, db):
    guest = _guest_client(ready_admin, db)
    res = guest.post("/auth/change-password", json={"current_password": SEED_PASSWORD, "new_password": "admin1234"})
    assert res.status_code == 422


def test_admin_cannot_create_admins_but_a_super_admin_can(ready_admin, db):
    assert ready_admin.post("/admin/users", json={"email": "a@test.com", "role": "admin"}).status_code == 403
    _make_super_admin(ready_admin, db)
    res = ready_admin.post("/admin/users", json={"email": "a@test.com", "role": "admin"})
    assert res.status_code == 201 and res.json()["role"] == "admin"
    # Un admin no tiene límites aunque se envíen.
    assert res.json()["limits"] == {"max_vaults": None, "max_notes_per_vault": None, "max_storage_bytes_per_vault": None}


def test_guests_cannot_reach_admin_routes(ready_admin, db):
    guest = _guest_client(ready_admin, db)
    assert guest.get("/admin/users").status_code == 403
    assert guest.post("/admin/users", json={"email": "x@test.com"}).status_code == 403


# --- Listado y visibilidad ---

def test_admin_lists_only_guests_super_admin_lists_all(ready_admin, db):
    _guest_client(ready_admin, db)
    assert [u["email"] for u in ready_admin.get("/admin/users").json()] == [GUEST]
    _make_super_admin(ready_admin, db)
    assert {u["email"] for u in ready_admin.get("/admin/users").json()} == {GUEST, SEED_EMAIL}


def test_admin_cannot_manage_an_admin_account(ready_admin, db):
    _make_super_admin(ready_admin, db)
    other = ready_admin.post("/admin/users", json={"email": "a@test.com", "role": "admin"}).json()["id"]
    db.query(User).filter(User.email == SEED_EMAIL).update({"role_id": "admin-role-id"})
    db.commit()
    ready_admin.cookies.clear()
    assert login(ready_admin).status_code == 200
    assert_problem(ready_admin.delete(f"/admin/users/{other}"), 404, "user-not-found")


# --- Límites ---

def test_patch_limits_updates_and_clears(ready_admin, db):
    _guest_client(ready_admin, db)
    uid = _user_id(db)
    res = ready_admin.patch(f"/admin/users/{uid}/limits", json={"max_vaults": 9, "max_notes_per_vault": None})
    assert res.status_code == 200
    assert res.json()["limits"]["max_vaults"] == 9 and res.json()["limits"]["max_notes_per_vault"] is None
    assert res.json()["limits"]["max_storage_bytes_per_vault"] == 500 * 1024 * 1024  # no enviado: no cambia


def test_vault_limit_blocks_the_next_vault_only_for_guests(ready_admin, db):
    guest = _guest_client(ready_admin, db, max_vaults=1)
    assert create(guest, "Una").status_code == 201
    assert_problem(create(guest, "Dos"), 403, "vault-limit-reached")
    assert create(ready_admin, "A").status_code == 201 and create(ready_admin, "B").status_code == 201


def test_trashed_vault_frees_a_slot_and_restoring_respects_the_limit(ready_admin, db):
    guest = _guest_client(ready_admin, db, max_vaults=1)
    first = create(guest, "Una")
    guest.delete(f"/vaults/{first.json()['id']}", headers={"If-Match": first.headers["ETag"]})
    assert create(guest, "Dos").status_code == 201
    [trashed] = guest.get("/vaults", params={"deleted": "true"}).json()["items"]
    res = guest.post(f"/vaults/{trashed['id']}/restore", headers={"If-Match": trashed["etag"]})
    assert_problem(res, 403, "vault-limit-reached")


def test_document_limit_counts_user_notes_not_indexes(ready_admin, db):
    guest = _guest_client(ready_admin, db, max_notes_per_vault=2)
    vid = create(guest, "Notas").json()["id"]
    for name in ("a.md", "carpeta/b.md"):  # la carpeta crea su INDICE: no cuenta
        assert guest.post(f"/vaults/{vid}/notes", json={"path": name, "content": "x"}).status_code == 201
    assert_problem(guest.post(f"/vaults/{vid}/notes", json={"path": "c.md", "content": "x"}), 403, "document-limit-reached")


def test_storage_limit_is_per_vault_and_counts_bytes(ready_admin, db, storage):
    guest = _guest_client(ready_admin, db, max_storage_bytes_per_vault=100)
    vid = create(guest, "Archivos").json()["id"]

    def upload(vault, name):
        return guest.post("/files", data={"vault_id": vault}, files={"file": (name, PNG, "image/png")})

    assert upload(vid, "a.png").status_code == 201 and upload(vid, "b.png").status_code == 201  # 80 B
    assert_problem(upload(vid, "c.png"), 403, "storage-limit-reached")
    other = create(guest, "Otra").json()["id"]
    assert upload(other, "d.png").status_code == 201  # otra bóveda: su propio cupo


def test_system_documents_do_not_count_as_documents():
    for path in ("INDICE.md", "A/INDICE.md", "AG - SKILLS/skill-x.md", "AG - MENSAJES/c/001.md", "BITACORA/2026-11/x.md",
                 "PLANTILLAS/plantilla-x.md", "", None):
        assert not counts_as_document(path), path
    assert counts_as_document("Notas/idea.md") and counts_as_document("A/B/c.md")


# --- Baja con gracia, recuperación y roles ---

def test_delete_blocks_login_restore_brings_it_back(ready_admin, db):
    guest = _guest_client(ready_admin, db)
    uid = _user_id(db)
    res = ready_admin.delete(f"/admin/users/{uid}")
    assert res.status_code == 200 and res.json()["deleted_at"] and res.json()["purge_at"]
    assert guest.get("/vaults").status_code == 401  # su sesión dejó de valer
    assert login(TestClient(app, base_url=str(ready_admin.base_url)), GUEST, SEED_PASSWORD).status_code == 401
    assert_problem(ready_admin.delete(f"/admin/users/{uid}"), 409, "user-state-conflict")
    restored = ready_admin.post(f"/admin/users/{uid}/restore")
    assert restored.status_code == 200 and restored.json()["deleted_at"] is None
    assert login(TestClient(app, base_url=str(ready_admin.base_url)), GUEST, SEED_PASSWORD).status_code == 200
    assert_problem(ready_admin.post(f"/admin/users/{uid}/restore"), 409, "user-state-conflict")


def test_email_stays_reserved_while_deleted(ready_admin, db):
    _guest_client(ready_admin, db)
    ready_admin.delete(f"/admin/users/{_user_id(db)}")
    assert ready_admin.post("/admin/users", json={"email": GUEST}).status_code == 409


def test_nobody_deletes_themselves_nor_the_last_super_admin(ready_admin, db):
    _make_super_admin(ready_admin, db)
    me = _user_id(db, SEED_EMAIL)
    assert_problem(ready_admin.delete(f"/admin/users/{me}"), 403, "user-action-forbidden")
    ready_admin.post("/admin/users", json={"email": "a@test.com", "role": "admin"})
    db.query(User).filter(User.email == "a@test.com").update({"role_id": "super-admin-role-id", "must_change_password": False})
    db.commit()
    second = TestClient(app, base_url=str(ready_admin.base_url))
    assert login(second, "a@test.com", SEED_PASSWORD).status_code == 200
    assert second.delete(f"/admin/users/{me}").status_code == 200  # otro super admin sí, mientras quede uno
    assert_problem(second.delete(f"/admin/users/{_user_id(db, 'a@test.com')}"), 403, "user-action-forbidden")


def test_only_a_super_admin_changes_roles_and_it_forces_a_new_login(ready_admin, db):
    guest = _guest_client(ready_admin, db)
    uid = _user_id(db)
    assert_problem(ready_admin.patch(f"/admin/users/{uid}/role", json={"role": "admin"}), 403, "super-admin-required")
    _make_super_admin(ready_admin, db)
    res = ready_admin.patch(f"/admin/users/{uid}/role", json={"role": "admin"})
    assert res.status_code == 200 and res.json()["role"] == "admin"
    assert guest.get("/vaults").status_code == 401  # el rol viaja en el token: hay que entrar de nuevo


# --- Reajuste de límites ---

def _overage_setup(ready_admin, db, notes=3):
    guest = _guest_client(ready_admin, db, max_notes_per_vault=10)
    vid = create(guest, "Notas").json()["id"]
    for i in range(notes):
        assert guest.post(f"/vaults/{vid}/notes", json={"path": f"n{i}.md", "content": "x"}).status_code == 201
    return guest, vid


def test_lowering_a_limit_opens_a_grace_period_and_notifies(ready_admin, db):
    _overage_setup(ready_admin, db)
    uid = _user_id(db)
    res = ready_admin.patch(f"/admin/users/{uid}/limits", json={"max_notes_per_vault": 1})
    assert [g["kind"] for g in res.json()["grace"]] == ["documents"]
    row = db.query(LimitGrace).one()
    assert row.deadline_at - row.started_at == timedelta(days=GRACE_DAYS)
    assert db.query(Notification).filter(Notification.kind == "limit_grace", Notification.owner_id == uid).count() == 1
    res = ready_admin.patch(f"/admin/users/{uid}/limits", json={"max_notes_per_vault": 10})
    assert res.json()["grace"] == [] and db.query(LimitGrace).count() == 0


def test_expired_grace_trashes_the_oldest_until_it_fits(ready_admin, db, storage):
    guest, vid = _overage_setup(ready_admin, db)
    ready_admin.patch(f"/admin/users/{_user_id(db)}/limits", json={"max_notes_per_vault": 1})
    later = datetime.utcnow() + timedelta(days=GRACE_DAYS, minutes=1)
    assert LimitReconcileService(db, get_vault_port(), storage, now=lambda: later).enforce_due() == 1
    live = [n["path"] for n in guest.get(f"/vaults/{vid}/notes").json()["items"] if n["path"].startswith("n")]
    assert live == ["n2.md"]  # quedó la más nueva; las otras, en la papelera
    trashed = guest.get(f"/vaults/{vid}/notes", params={"deleted": "true"}).json()["items"]
    assert {n["path"] for n in trashed} == {"n0.md", "n1.md"}
    assert db.query(LimitGrace).count() == 0


def test_grace_not_yet_due_changes_nothing(ready_admin, db, storage):
    _overage_setup(ready_admin, db)
    ready_admin.patch(f"/admin/users/{_user_id(db)}/limits", json={"max_notes_per_vault": 1})
    assert LimitReconcileService(db, get_vault_port(), storage).enforce_due() == 0
    assert db.query(LimitGrace).count() == 1


def test_expired_storage_grace_deletes_the_oldest_files(ready_admin, db, storage):
    guest = _guest_client(ready_admin, db, max_storage_bytes_per_vault=1000)
    vid = create(guest, "Archivos").json()["id"]
    for name in ("a.png", "b.png", "c.png"):
        assert guest.post("/files", data={"vault_id": vid}, files={"file": (name, PNG, "image/png")}).status_code == 201
    ready_admin.patch(f"/admin/users/{_user_id(db)}/limits", json={"max_storage_bytes_per_vault": 50})
    later = datetime.utcnow() + timedelta(days=GRACE_DAYS, minutes=1)
    LimitReconcileService(db, get_vault_port(), storage, now=lambda: later).enforce_due()
    assert [f.name for f in db.query(File).order_by(File.created_at)] == ["c.png"]


# --- Purga definitiva ---

def test_purge_removes_everything_of_an_expired_account(ready_admin, db, storage):
    guest = _guest_client(ready_admin, db)
    uid = _user_id(db)
    vid = create(guest, "Archivos").json()["id"]
    assert guest.post("/files", data={"vault_id": vid}, files={"file": ("a.png", PNG, "image/png")}).status_code == 201
    couch_url = f"{settings.COUCHDB_URL}/synapse_user_{uid}"
    auth = (settings.COUCHDB_USER, settings.COUCHDB_PASSWORD)
    assert httpx.get(couch_url, auth=auth).status_code == 200
    ready_admin.delete(f"/admin/users/{uid}")

    purger = UserPurgeService(db, CouchDBAdapter(), storage)
    assert purger.purge_expired(datetime.utcnow()) == 0  # aún dentro de la gracia
    assert purger.purge_expired(datetime.utcnow() + timedelta(days=GRACE_DAYS, minutes=1)) == 1

    assert db.query(User).filter(User.id == uid).count() == 0
    assert db.query(File).count() == 0
    assert storage.objects == {}
    assert httpx.get(couch_url, auth=auth).status_code == 404


def test_purge_failure_keeps_the_account_for_the_next_pass(ready_admin, db, storage, monkeypatch):
    _guest_client(ready_admin, db)
    uid = _user_id(db)
    ready_admin.delete(f"/admin/users/{uid}")

    def boom(self, name):
        raise RuntimeError("down")

    monkeypatch.setattr(CouchDBAdapter, "drop_user_db", boom)
    assert UserPurgeService(db, CouchDBAdapter(), storage).purge_expired(datetime.utcnow() + timedelta(days=GRACE_DAYS + 1)) == 0
    assert db.query(User).filter(User.id == uid).count() == 1
