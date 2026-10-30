"""`/files/**` de punta a punta (H-015) — TestClient + CouchDB real + FAKE del puerto MinIO.

El `ContractGuard` de `conftest` exige que cada error emitido esté declarado en el contrato.
El almacén de objetos se sustituye por un FAKE en memoria (no se necesita MinIO real); las
bóvedas son reales en CouchDB (la validación de propiedad va contra la base del usuario)."""
import pytest

from app.main import app
from app.routers.files import get_object_storage
from tests.fake_object_storage import FakeObjectStorage
from tests.test_agent_api_key_access import _bearer_client, _guest
from tests.test_agent_api_key_api import create_agent_key
from tests.test_vaults_api import assert_problem, create

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
SAFE_SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'
HOSTILE_SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


@pytest.fixture
def storage():
    fake = FakeObjectStorage()
    app.dependency_overrides[get_object_storage] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_object_storage, None)


def _vault(client) -> str:
    res = create(client, name="Imágenes")
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _upload(client, vault_id, data=PNG, filename="foto.png", content_type="image/png"):
    return client.post(
        "/files",
        data={"vault_id": vault_id},
        files={"file": (filename, data, content_type)},
    )


# --- C-1: subida válida ---

def test_c1_valid_upload_creates_private_record(ready_admin, storage):
    vault_id = _vault(ready_admin)
    res = _upload(ready_admin, vault_id)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["vault_id"] == vault_id and body["visibility"] == "private"
    assert body["content_type"] == "image/png" and body["size"] == len(PNG)
    # El owner puede recuperarlo con su Content-Type.
    got = ready_admin.get(f"/files/{body['id']}")
    assert got.status_code == 200
    assert got.content == PNG
    assert got.headers["content-type"] == "image/png"


# --- C-2/C-6: rechazos ---

def test_c2_too_large_is_rejected(ready_admin, storage):
    vault_id = _vault(ready_admin)
    big = PNG + b"\x00" * (5 * 1024 * 1024 + 1)
    res = _upload(ready_admin, vault_id, data=big)
    assert_problem(res, 413, "file-too-large")
    assert storage.objects == {}


def test_c2_unsupported_type_is_rejected(ready_admin, storage):
    vault_id = _vault(ready_admin)
    res = _upload(ready_admin, vault_id, data=b"%PDF-1.7 nope", filename="d.pdf", content_type="application/pdf")
    assert_problem(res, 415, "unsupported-file-type")
    assert storage.objects == {}


def test_c6_backend_ignores_a_lying_client_content_type(ready_admin, storage):
    # El cliente miente diciendo image/png, pero los bytes son un PDF → el backend lo rechaza.
    vault_id = _vault(ready_admin)
    res = _upload(ready_admin, vault_id, data=b"%PDF-1.7 nope", filename="evil.png", content_type="image/png")
    assert_problem(res, 415, "unsupported-file-type")


# --- C-5: SVG ---

def test_c5_hostile_svg_is_rejected(ready_admin, storage):
    vault_id = _vault(ready_admin)
    res = _upload(ready_admin, vault_id, data=HOSTILE_SVG, filename="x.svg", content_type="image/svg+xml")
    assert_problem(res, 400, "unsafe-svg")
    assert storage.objects == {}


def test_c5_safe_svg_is_served_with_security_headers(ready_admin, storage):
    vault_id = _vault(ready_admin)
    res = _upload(ready_admin, vault_id, data=SAFE_SVG, filename="icon.svg", content_type="image/svg+xml")
    assert res.status_code == 201, res.text
    got = ready_admin.get(f"/files/{res.json()['id']}")
    assert got.status_code == 200
    assert got.headers["content-type"] == "image/svg+xml"
    assert got.headers["content-security-policy"] == "sandbox"
    assert got.headers["x-content-type-options"] == "nosniff"


# --- C-3: visibilidad y acceso ---

def test_c3_get_unknown_is_404(ready_admin, storage):
    assert_problem(ready_admin.get("/files/does-not-exist"), 404, "file-not-found")


def test_c3_private_without_session_is_401(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id).json()["id"]
    anon = _bearer_client(ready_admin, "")  # cliente sin cookie ni key válida
    anon.headers.pop("Authorization", None)
    assert_problem(anon.get(f"/files/{file_id}"), 401, "not-authenticated")


def test_c3_private_of_another_user_is_404(ready_admin, db, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id).json()["id"]
    guest = _guest(ready_admin, db)
    assert_problem(guest.get(f"/files/{file_id}"), 404, "file-not-found")


def test_c3_public_file_is_served_without_session(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id).json()["id"]
    ready_admin.patch(f"/files/{file_id}", json={"visibility": "public"})
    anon = _bearer_client(ready_admin, "")
    anon.headers.pop("Authorization", None)
    got = anon.get(f"/files/{file_id}")
    assert got.status_code == 200 and got.content == PNG


# --- C-7: API key aplica la misma regla de dueño ---

def test_c7_owner_key_reads_its_own_file(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id).json()["id"]
    raw = create_agent_key(ready_admin, "aira").json()["key"]
    agent = _bearer_client(ready_admin, raw)
    got = agent.get(f"/files/{file_id}")
    assert got.status_code == 200 and got.content == PNG


def test_c7_foreign_key_cannot_read_private_file(ready_admin, db, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id).json()["id"]
    guest = _guest(ready_admin, db)
    guest_raw = create_agent_key(guest, "aira").json()["key"]
    agent = _bearer_client(ready_admin, guest_raw)  # key del guest, cliente sin cookie
    assert_problem(agent.get(f"/files/{file_id}"), 404, "file-not-found")


def test_c7_key_can_upload_to_its_owner_vault(ready_admin, storage):
    vault_id = _vault(ready_admin)
    raw = create_agent_key(ready_admin, "aira").json()["key"]
    agent = _bearer_client(ready_admin, raw)
    res = agent.post("/files", data={"vault_id": vault_id}, files={"file": ("a.png", PNG, "image/png")})
    assert res.status_code == 201, res.text


# --- C-8: cambio de visibilidad sólo del dueño ---

def test_c8_owner_toggles_visibility(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id).json()["id"]
    res = ready_admin.patch(f"/files/{file_id}", json={"visibility": "public"})
    assert res.status_code == 200 and res.json()["visibility"] == "public"


def test_c8_non_owner_cannot_change_visibility(ready_admin, db, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id).json()["id"]
    guest = _guest(ready_admin, db)
    assert_problem(guest.patch(f"/files/{file_id}", json={"visibility": "public"}), 404, "file-not-found")


def test_c8_invalid_visibility_is_422(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id).json()["id"]
    res = ready_admin.patch(f"/files/{file_id}", json={"visibility": "secret"})
    assert res.status_code == 422, res.text


# --- Propiedad de la bóveda y auth de la subida ---

def test_upload_to_a_foreign_vault_is_404(ready_admin, db, storage):
    guest = _guest(ready_admin, db)
    guest_vault = _vault(guest)
    # El admin intenta subir a la bóveda del guest (que no existe en SU base) → vault-not-found.
    assert_problem(_upload(ready_admin, guest_vault), 404, "vault-not-found")


def test_upload_without_session_is_401(ready_admin, storage):
    vault_id = _vault(ready_admin)
    anon = _bearer_client(ready_admin, "")
    anon.headers.pop("Authorization", None)
    res = anon.post("/files", data={"vault_id": vault_id}, files={"file": ("a.png", PNG, "image/png")})
    assert_problem(res, 401, "not-authenticated")
