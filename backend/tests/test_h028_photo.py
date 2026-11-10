"""Foto de perfil (H-028): `PUT`/`GET`/`DELETE /auth/me/photo` de punta a punta.

Los objetos van a un FAKE en memoria del almacén, por el mismo punto de override que `/files`
(`get_object_storage`). El `ContractGuard` de `conftest` exige que cada error emitido esté
declarado en la ruta, así que estos tests también lo comprueban.
"""
import pytest

from app.adapters.minio_adapter import get_object_storage
from app.main import app
from tests.fake_object_storage import FakeObjectStorage
from tests.test_agent_api_key_access import _bearer_client, _guest
from tests.test_agent_api_key_api import create_agent_key
from tests.test_vaults_api import assert_problem

# Bytes con la firma real de cada formato admitido (la validación es por contenido, no por nombre).
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
WEBP = b"RIFF" + (40).to_bytes(4, "little") + b"WEBP" + b"\x00" * 32
MAX_BYTES = 2 * 1024 * 1024


@pytest.fixture
def storage():
    fake = FakeObjectStorage()
    app.dependency_overrides[get_object_storage] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_object_storage, None)


def _put_photo(client, data: bytes, filename: str = "foto.png"):
    # El Content-Type que declara el cliente en la parte es irrelevante: se decide por los bytes.
    return client.put("/auth/me/photo", files={"file": (filename, data, "application/octet-stream")})


def _user_id(client) -> str:
    return client.get("/auth/me").json()["user_id"]


# --- Subida válida: PNG, JPEG y WebP (B5/B6 de la historia) ---

@pytest.mark.parametrize(("data", "mime"), [(PNG, "image/png"), (JPEG, "image/jpeg"), (WEBP, "image/webp")])
def test_rf_h028_p1_valid_image_is_stored_and_served_with_its_type(ready_admin, storage, data, mime):
    """EARS: Cuando el usuario sube una foto PNG, JPEG o WebP válida, el sistema la guarda en
    `users/{id}/avatar`, anuncia `photo_url` con la versión y la sirve con su Content-Type."""
    res = _put_photo(ready_admin, data)
    assert res.status_code == 200, res.text
    assert res.json()["photo_url"] == "/auth/me/photo?v=1"
    assert ready_admin.get("/auth/me").json()["photo_url"] == "/auth/me/photo?v=1"

    photo = ready_admin.get("/auth/me/photo")
    assert photo.status_code == 200
    assert photo.content == data
    assert photo.headers["content-type"] == mime
    assert storage.objects == {f"users/{_user_id(ready_admin)}/avatar": (data, mime)}


# --- Rechazos: por contenido y por tamaño ---

@pytest.mark.parametrize(
    "data",
    [
        b"esto es texto, no una imagen",                       # txt disfrazado de .png
        b"GIF89a" + b"\x00" * 32,                               # GIF: admitido en /files, no en el avatar
        b'<svg xmlns="http://www.w3.org/2000/svg"></svg>',     # SVG: idem
    ],
)
def test_rf_h028_p2_content_outside_png_jpeg_webp_is_rejected(ready_admin, storage, data):
    """EARS: Cuando el contenido no es PNG, JPEG ni WebP (aunque el nombre diga .png), el sistema
    responde 415 `profile-photo-invalid-type` y no guarda nada."""
    res = _put_photo(ready_admin, data, filename="foto.png")
    assert_problem(res, 415, "profile-photo-invalid-type")
    assert storage.objects == {}
    assert ready_admin.get("/auth/me").json()["photo_url"] is None


def test_rf_h028_p3_over_2mb_is_rejected_with_413(ready_admin, storage):
    """EARS: Cuando la foto supera 2 MB, el sistema responde 413 `profile-photo-too-large` y no guarda nada."""
    too_big = PNG + b"\x00" * MAX_BYTES
    assert_problem(_put_photo(ready_admin, too_big), 413, "profile-photo-too-large")
    assert storage.objects == {}


def test_rf_h028_p3_exactly_2mb_is_accepted(ready_admin, storage):
    """EARS: Cuando la foto pesa exactamente 2 MB, el sistema la acepta (el límite es inclusivo)."""
    at_limit = PNG + b"\x00" * (MAX_BYTES - len(PNG))
    assert len(at_limit) == MAX_BYTES
    assert _put_photo(ready_admin, at_limit).status_code == 200


# --- Ciclo de vida: versión, borrado, ausencia y caché ---

def test_rf_h028_p4_second_upload_bumps_version_and_overwrites_the_object(ready_admin, storage):
    """EARS: Cuando el usuario sube otra foto, `avatar_version` sube (cache-busting) y la clave
    del objeto se sobrescribe: un usuario tiene una sola foto almacenada."""
    _put_photo(ready_admin, PNG)
    res = _put_photo(ready_admin, JPEG, filename="otra.jpg")
    assert res.json()["photo_url"] == "/auth/me/photo?v=2"

    photo = ready_admin.get("/auth/me/photo")
    assert photo.content == JPEG
    assert photo.headers["content-type"] == "image/jpeg"
    assert list(storage.objects) == [f"users/{_user_id(ready_admin)}/avatar"]


def test_rf_h028_p5_delete_removes_the_photo_everywhere(ready_admin, storage):
    """EARS: Cuando el usuario borra su foto, el sistema quita el objeto, `photo_url` pasa a null
    y `GET /auth/me/photo` responde 404."""
    _put_photo(ready_admin, PNG)
    res = ready_admin.delete("/auth/me/photo")
    assert res.status_code == 200
    assert res.json()["photo_url"] is None
    assert ready_admin.get("/auth/me").json()["photo_url"] is None
    assert_problem(ready_admin.get("/auth/me/photo"), 404, "profile-photo-not-found")
    assert storage.objects == {}


def test_rf_h028_p5b_storage_failure_on_delete_keeps_metadata_and_returns_503(ready_admin, storage):
    """EARS: Cuando el almacén falla al borrar, el sistema responde 503 y NO limpia `photo_url`:
    así la BD nunca dice "sin foto" mientras el objeto sigue en el almacén (sin silenciar el error)."""
    _put_photo(ready_admin, PNG)
    # El fake lanza StorageUnavailable al borrar una clave que no existe: simula el objeto perdido.
    storage.objects.clear()

    assert_problem(ready_admin.delete("/auth/me/photo"), 503, "storage-unavailable")
    assert ready_admin.get("/auth/me").json()["photo_url"] == "/auth/me/photo?v=1"


def test_rf_h028_p6_get_without_photo_is_404(ready_admin, storage):
    """EARS: Cuando el usuario no tiene foto, `GET /auth/me/photo` responde 404 `profile-photo-not-found`."""
    assert_problem(ready_admin.get("/auth/me/photo"), 404, "profile-photo-not-found")


def test_rf_h028_p7_photo_is_private_for_shared_caches(ready_admin, storage):
    """EARS: La foto de perfil es privada: la cabecera la marca `private` para que ningún caché
    compartido (proxy) la guarde y la sirva a otro usuario."""
    _put_photo(ready_admin, PNG)
    assert "private" in ready_admin.get("/auth/me/photo").headers["cache-control"]


# --- Aislamiento (B8): nadie ve ni cambia la foto de otro usuario ---

def test_rf_h028_b8_user_b_never_sees_user_a_photo(ready_admin, storage, db):
    """EARS B8: Cuando el usuario B pide su foto, el sistema le devuelve SU foto o 404, nunca la de A.
    Cada usuario tiene su propia clave en el almacén (`users/{id}/avatar`)."""
    _put_photo(ready_admin, PNG)
    guest = _guest(ready_admin, db)

    assert_problem(guest.get("/auth/me/photo"), 404, "profile-photo-not-found")
    assert guest.get("/auth/me").json()["photo_url"] is None

    # La subida de B no toca la foto de A.
    assert _put_photo(guest, JPEG, filename="b.jpg").status_code == 200
    assert ready_admin.get("/auth/me/photo").content == PNG
    assert guest.get("/auth/me/photo").content == JPEG
    assert len(storage.objects) == 2


def test_rf_h028_b8_user_id_in_query_is_ignored(ready_admin, storage, db):
    """EARS B8: Cuando B pide `GET /auth/me/photo?user_id=<A>`, el parámetro se ignora: la ruta no
    recibe ningún identificador de usuario, así que nunca puede apuntar a la foto de otro."""
    _put_photo(ready_admin, PNG)
    a_id = _user_id(ready_admin)
    guest = _guest(ready_admin, db)

    res = guest.get("/auth/me/photo", params={"user_id": a_id})
    assert_problem(res, 404, "profile-photo-not-found")


# --- API key (B9): una Bearer key nunca edita ni borra el perfil ---

def test_rf_h028_b9_agent_key_cannot_upload_delete_or_read_photo(ready_admin, storage):
    """EARS B9: Cuando una API key (Bearer, sin cookie) intenta PUT/DELETE/GET de la foto,
    el sistema responde 401 `not-authenticated` y la foto del dueño queda intacta."""
    _put_photo(ready_admin, PNG)
    raw = create_agent_key(ready_admin, "aira").json()["key"]
    agent = _bearer_client(ready_admin, raw)

    assert_problem(_put_photo(agent, JPEG, filename="robo.jpg"), 401, "not-authenticated")
    assert_problem(agent.delete("/auth/me/photo"), 401, "not-authenticated")
    assert_problem(agent.get("/auth/me/photo"), 401, "not-authenticated")

    assert ready_admin.get("/auth/me/photo").content == PNG
    assert storage.objects[f"users/{_user_id(ready_admin)}/avatar"] == (PNG, "image/png")
