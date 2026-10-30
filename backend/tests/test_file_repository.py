"""Repositorio de metadatos de archivos en Postgres (H-015) — sqlite de prueba.

Sin MinIO ni CouchDB: sólo la tabla `files`. El `db` de `conftest` es sqlite y `setup_db`
crea las tablas (el modelo `File` se registra al importarlo aquí)."""
from datetime import datetime

from app.adapters.file_repository import FileRepository
from app.core.models.file import File


def _file(db, file_id="f-1", owner_id="owner-1", vault_id="v-1", visibility="private") -> File:
    repo = FileRepository(db)
    return repo.create(
        File(
            id=file_id,
            owner_id=owner_id,
            vault_id=vault_id,
            name="foto.png",
            content_type="image/png",
            size=123,
            visibility=visibility,
            object_key=f"vaults/{vault_id}/{file_id}",
            created_at=datetime(2026, 10, 30, 12, 0, 0),
        )
    )


def test_create_then_get_roundtrips(db):
    created = _file(db)
    got = FileRepository(db).get("f-1")
    assert got is not None
    assert (got.id, got.owner_id, got.vault_id, got.size) == ("f-1", "owner-1", "v-1", 123)
    assert got.object_key == "vaults/v-1/f-1"
    assert created.id == got.id


def test_default_visibility_is_private(db):
    repo = FileRepository(db)
    repo.create(
        File(
            id="f-def",
            owner_id="owner-1",
            vault_id="v-1",
            name="x.png",
            content_type="image/png",
            size=1,
            object_key="vaults/v-1/f-def",
            created_at=datetime(2026, 10, 30, 12, 0, 0),
        )
    )
    assert FileRepository(db).get("f-def").visibility == "private"


def test_get_unknown_returns_none(db):
    assert FileRepository(db).get("missing") is None


def test_set_visibility_by_owner_changes_it(db):
    _file(db)
    updated = FileRepository(db).set_visibility("f-1", "owner-1", "public")
    assert updated is not None and updated.visibility == "public"
    assert FileRepository(db).get("f-1").visibility == "public"


def test_set_visibility_by_other_user_leaves_it_untouched(db):
    _file(db)
    assert FileRepository(db).set_visibility("f-1", "someone-else", "public") is None
    assert FileRepository(db).get("f-1").visibility == "private"


def test_set_visibility_unknown_returns_none(db):
    assert FileRepository(db).set_visibility("missing", "owner-1", "public") is None
