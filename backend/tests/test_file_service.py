"""Reglas de negocio de archivos (H-015) — repo sqlite + FAKE del puerto, sin MinIO ni CouchDB.

Cubre validación (tipo/tamaño/SVG), propiedad de la bóveda y reglas de acceso del servicio."""
import pytest

from app.adapters.file_repository import FileRepository
from app.core.errors import (
    FileNotFound, FileTooLarge, UnsafeSvg, UnsupportedFileType, VaultNotFound,
)
from app.services.file_service import MAX_FILE_SIZE, FileService
from tests.fake_object_storage import FakeObjectStorage

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
OWNER = "owner-1"
VAULT = "11111111-1111-4111-8111-111111111111"


def _service(db, *, owner=OWNER, vaults=(VAULT,)):
    storage = FakeObjectStorage()

    def ensure_vault(vault_id):
        if vault_id not in vaults:
            raise VaultNotFound(f"vault ajena: {vault_id}")

    return FileService(FileRepository(db), storage, owner, ensure_vault), storage


# --- C-1: subida válida crea objeto + registro privado ---

def test_valid_upload_stores_object_and_private_record(db):
    service, storage = _service(db)
    record = service.create(vault_id=VAULT, filename="foto.png", data=PNG)
    assert record.owner_id == OWNER and record.vault_id == VAULT
    assert record.content_type == "image/png" and record.size == len(PNG)
    assert record.visibility == "private"
    assert record.object_key == f"vaults/{VAULT}/{record.id}"
    # El objeto quedó en el almacén bajo la clave por bóveda.
    assert storage.objects[record.object_key][0] == PNG


# --- C-2/C-6: rechazos sin crear nada ---

def test_too_large_is_rejected_and_nothing_is_stored(db):
    service, storage = _service(db)
    with pytest.raises(FileTooLarge):
        service.create(vault_id=VAULT, filename="big.png", data=PNG + b"\x00" * (MAX_FILE_SIZE + 1))
    assert storage.objects == {}


def test_unsupported_type_is_rejected_and_nothing_is_stored(db):
    service, storage = _service(db)
    exe_data = b"MZ" + b"\x00" * 32  # ejecutable Windows
    with pytest.raises(UnsupportedFileType):
        service.create(vault_id=VAULT, filename="malware.exe", data=exe_data)
    assert storage.objects == {}


# --- C-5: SVG saneado ---

def test_safe_svg_is_accepted(db):
    service, storage = _service(db)
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'
    record = service.create(vault_id=VAULT, filename="icon.svg", data=svg)
    assert record.content_type == "image/svg+xml"
    assert storage.objects[record.object_key][0] == svg


def test_hostile_svg_is_rejected_and_nothing_is_stored(db):
    service, storage = _service(db)
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    with pytest.raises(UnsafeSvg):
        service.create(vault_id=VAULT, filename="evil.svg", data=svg)
    assert storage.objects == {}


# --- propiedad de la bóveda: sólo bóvedas del usuario ---

def test_upload_to_a_foreign_vault_is_rejected(db):
    service, storage = _service(db)
    with pytest.raises(VaultNotFound):
        service.create(vault_id="99999999-9999-4999-8999-999999999999", filename="x.png", data=PNG)
    assert storage.objects == {}


# --- C-3: lectura por id ---

def test_get_record_and_read_content(db):
    service, storage = _service(db)
    record = service.create(vault_id=VAULT, filename="foto.png", data=PNG)
    again = service.get_record(record.id)
    assert again.id == record.id
    assert service.read(again) == PNG


def test_get_record_unknown_raises_file_not_found(db):
    service, _ = _service(db)
    with pytest.raises(FileNotFound):
        service.get_record("missing")


# --- C-8: cambio de visibilidad sólo del dueño ---

def test_owner_can_change_visibility(db):
    service, _ = _service(db)
    record = service.create(vault_id=VAULT, filename="foto.png", data=PNG)
    updated = service.set_visibility(record.id, "public")
    assert updated.visibility == "public"


def test_non_owner_cannot_change_visibility(db):
    service, _ = _service(db)
    record = service.create(vault_id=VAULT, filename="foto.png", data=PNG)
    other, _ = _service(db, owner="someone-else")
    with pytest.raises(FileNotFound):
        other.set_visibility(record.id, "public")
    assert service.get_record(record.id).visibility == "private"
