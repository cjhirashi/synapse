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
    exe_data = b"MZ" + b"\x00" * 32  # ejecutable Windows
    res = _upload(ready_admin, vault_id, data=exe_data, filename="malware.exe", content_type="application/octet-stream")
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


# --- C-4: GET /vaults/{vault_id}/files lista archivos de la bóveda ---

def test_c4_list_vault_files_empty(ready_admin, storage):
    vault_id = _vault(ready_admin)
    res = ready_admin.get(f"/vaults/{vault_id}/files")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["files"] == [] and body["total"] == 0


def test_c4_list_vault_files_in_created_at_desc_order(ready_admin, storage):
    vault_id = _vault(ready_admin)
    # Subir 3 archivos, tienen created_at diferentes por el tiempo que pasa
    ids = []
    for i in range(3):
        res = _upload(ready_admin, vault_id, filename=f"file{i}.png")
        assert res.status_code == 201
        ids.append(res.json()["id"])

    res = ready_admin.get(f"/vaults/{vault_id}/files")
    assert res.status_code == 200
    files = res.json()["files"]
    assert len(files) == 3
    # Verificar que están en orden descendente (más reciente primero)
    returned_ids = [f["id"] for f in files]
    assert returned_ids == list(reversed(ids))


def test_c4_list_vault_files_with_pagination(ready_admin, storage):
    vault_id = _vault(ready_admin)
    # Subir 5 archivos
    for i in range(5):
        _upload(ready_admin, vault_id, filename=f"file{i}.png")

    # Pedir limit=2, offset=0
    res = ready_admin.get(f"/vaults/{vault_id}/files?limit=2&offset=0")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 5 and len(body["files"]) == 2
    assert body["limit"] == 2 and body["offset"] == 0


def test_c4_list_vault_files_offset(ready_admin, storage):
    vault_id = _vault(ready_admin)
    # Subir 3 archivos
    ids = []
    for i in range(3):
        res = _upload(ready_admin, vault_id, filename=f"file{i}.png")
        ids.append(res.json()["id"])

    # Pedir offset=1, limit=2
    res = ready_admin.get(f"/vaults/{vault_id}/files?limit=2&offset=1")
    body = res.json()
    assert len(body["files"]) == 2 and body["offset"] == 1


def test_c4_list_vault_files_404_if_not_owned(ready_admin, db, storage):
    guest = _guest(ready_admin, db)
    guest_vault = _vault(guest)
    # El admin intenta listar archivos del vault del guest
    assert_problem(ready_admin.get(f"/vaults/{guest_vault}/files"), 404, "vault-not-found")


def test_c4_list_vault_files_does_not_include_other_users_files(ready_admin, db, storage):
    guest = _guest(ready_admin, db)
    admin_vault = _vault(ready_admin)
    guest_vault = _vault(guest)

    # Admin sube archivo a su bóveda
    _upload(ready_admin, admin_vault, filename="admin.png")
    # Guest sube archivo a su bóveda
    _upload(guest, guest_vault, filename="guest.png")

    # Admin lista su bóveda: debe ver solo su archivo
    res = ready_admin.get(f"/vaults/{admin_vault}/files")
    files = res.json()["files"]
    assert len(files) == 1 and files[0]["name"] == "admin.png"


# --- C-5: PATCH /files/{id} con name ---

def test_c5_rename_file(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id, filename="old.png").json()["id"]
    res = ready_admin.patch(f"/files/{file_id}", json={"name": "new.png"})
    assert res.status_code == 200
    assert res.json()["name"] == "new.png"


def test_c5_rename_invalid_name_with_slash(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id, filename="file.png").json()["id"]
    res = ready_admin.patch(f"/files/{file_id}", json={"name": "path/to/file.png"})
    assert_problem(res, 415, "unsupported-file-type")


def test_c5_rename_invalid_name_with_backslash(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id, filename="file.png").json()["id"]
    res = ready_admin.patch(f"/files/{file_id}", json={"name": "path\\to\\file.png"})
    assert_problem(res, 415, "unsupported-file-type")


def test_c5_rename_invalid_name_with_control_char(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id, filename="file.png").json()["id"]
    res = ready_admin.patch(f"/files/{file_id}", json={"name": "file\x00.png"})
    assert_problem(res, 415, "unsupported-file-type")


def test_c5_rename_cannot_change_to_blocked_extension(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id, filename="file.png").json()["id"]
    res = ready_admin.patch(f"/files/{file_id}", json={"name": "file.exe"})
    assert_problem(res, 415, "unsupported-file-type")


def test_c5_rename_non_owner_gets_404(ready_admin, db, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id, filename="file.png").json()["id"]
    guest = _guest(ready_admin, db)
    assert_problem(guest.patch(f"/files/{file_id}", json={"name": "new.png"}), 404, "file-not-found")


def test_c5_rename_and_visibility_together(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id, filename="file.png").json()["id"]
    res = ready_admin.patch(f"/files/{file_id}", json={"name": "new.png", "visibility": "public"})
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "new.png" and body["visibility"] == "public"


# --- C-6: DELETE /files/{id} ---

def test_c6_delete_file_removes_object_and_record(ready_admin, storage):
    vault_id = _vault(ready_admin)
    res = _upload(ready_admin, vault_id, filename="file.png")
    file_id = res.json()["id"]

    # El objeto está en el fake (hay exactamente 1)
    assert len(storage.objects) == 1
    object_key = list(storage.objects.keys())[0]

    # Borrar
    res = ready_admin.delete(f"/files/{file_id}")
    assert res.status_code == 204

    # El objeto se fue del fake
    assert object_key not in storage.objects
    assert len(storage.objects) == 0

    # El registro se fue de la base (GET retorna 404)
    assert_problem(ready_admin.get(f"/files/{file_id}"), 404, "file-not-found")


def test_c6_delete_non_owner_gets_404(ready_admin, db, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id, filename="file.png").json()["id"]
    guest = _guest(ready_admin, db)
    assert_problem(guest.delete(f"/files/{file_id}"), 404, "file-not-found")


def test_c6_delete_fails_if_storage_fails_but_record_survives(ready_admin, storage):
    vault_id = _vault(ready_admin)
    res = _upload(ready_admin, vault_id, filename="file.png")
    file_id = res.json()["id"]

    # Simular que el almacén falla durante DELETE: borrar el objeto del fake
    object_key = list(storage.objects.keys())[0]
    del storage.objects[object_key]

    # Intentar borrar el archivo
    res = ready_admin.delete(f"/files/{file_id}")
    # Debe retornar error (storage unavailable)
    assert res.status_code == 503, res.text

    # El registro debe seguir existiendo (según spec C-6: "Si MinIO falla, el registro se conserva")
    # Pero GET también falla porque el objeto no está en el almacén
    res = ready_admin.get(f"/files/{file_id}")
    assert res.status_code == 503  # StorageUnavailable


# --- C-3: Cabeceras de GET /files/{id} por tipo ---

PDF = b"%PDF-1.4" + b"\x00" * 32
DOCX = b"PK\x03\x04" + b"\x00" * 100  # ZIP válido pero sin word/
HTML_DATA = b"<html><body>test</body></html>"
TXT_DATA = b"hello world"


def test_c3_png_has_inline_disposition(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id, filename="image.png").json()["id"]
    res = ready_admin.get(f"/files/{file_id}")
    assert res.status_code == 200
    assert res.headers["content-disposition"] == "inline"
    assert res.headers["x-content-type-options"] == "nosniff"


def test_c3_pdf_has_inline_disposition(ready_admin, storage):
    vault_id = _vault(ready_admin)
    res = _upload(ready_admin, vault_id, data=PDF, filename="doc.pdf", content_type="application/pdf")
    assert res.status_code == 201
    file_id = res.json()["id"]

    res = ready_admin.get(f"/files/{file_id}")
    assert res.status_code == 200
    assert res.headers["content-disposition"] == "inline"
    assert res.headers["x-content-type-options"] == "nosniff"


def test_c3_html_has_inline_with_csp_sandbox(ready_admin, storage):
    vault_id = _vault(ready_admin)
    res = _upload(ready_admin, vault_id, data=HTML_DATA, filename="page.html", content_type="text/html")
    assert res.status_code == 201
    file_id = res.json()["id"]

    res = ready_admin.get(f"/files/{file_id}")
    assert res.status_code == 200
    assert res.headers["content-disposition"] == "inline"
    csp = res.headers["content-security-policy"]
    assert "sandbox" in csp and "allow-scripts" in csp and "connect-src 'none'" in csp
    assert res.headers["x-content-type-options"] == "nosniff"


def test_c3_txt_has_attachment_disposition(ready_admin, storage):
    vault_id = _vault(ready_admin)
    res = _upload(ready_admin, vault_id, data=TXT_DATA, filename="readme.txt", content_type="text/plain")
    assert res.status_code == 201
    file_id = res.json()["id"]

    res = ready_admin.get(f"/files/{file_id}")
    assert res.status_code == 200
    # TXT no está en _INLINE_TYPES, así que debe ser attachment
    assert "attachment" in res.headers["content-disposition"]
    assert res.headers["x-content-type-options"] == "nosniff"


def test_c3_private_file_has_cache_control(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id, filename="image.png").json()["id"]
    # El archivo es privado por defecto
    res = ready_admin.get(f"/files/{file_id}")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "private, no-store"


def test_c3_public_file_no_cache_control(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id, filename="image.png").json()["id"]
    # Cambiar a público
    ready_admin.patch(f"/files/{file_id}", json={"visibility": "public"})

    res = ready_admin.get(f"/files/{file_id}")
    assert res.status_code == 200
    # Público no debe tener Cache-Control: private, no-store
    assert "cache-control" not in res.headers or "private" not in res.headers["cache-control"]


# --- C-5/C-11: Límites por tipo ---

def test_c11_document_larger_than_25mb_is_rejected(ready_admin, storage):
    vault_id = _vault(ready_admin)
    big_doc = PDF + b"\x00" * (25 * 1024 * 1024 + 1)
    res = _upload(ready_admin, vault_id, data=big_doc, filename="big.pdf")
    assert_problem(res, 413, "file-too-large")
    # No debe crear nada en el fake
    assert storage.objects == {}


def test_c11_document_exactly_25mb_is_accepted(ready_admin, storage):
    vault_id = _vault(ready_admin)
    doc_25mb = PDF + b"\x00" * (25 * 1024 * 1024 - len(PDF))
    res = _upload(ready_admin, vault_id, data=doc_25mb, filename="exact.pdf")
    assert res.status_code == 201


# --- C-2: Seguridad por firma ---

def test_c2_exe_renamed_to_pdf_is_rejected(ready_admin, storage):
    vault_id = _vault(ready_admin)
    exe_data = b"MZ" + b"\x00" * 100
    res = _upload(ready_admin, vault_id, data=exe_data, filename="evil.pdf")
    assert_problem(res, 415, "unsupported-file-type")
    assert storage.objects == {}


def test_c2_script_shebang_renamed_to_txt_is_rejected(ready_admin, storage):
    vault_id = _vault(ready_admin)
    script_data = b"#!/bin/bash\necho hello"
    res = _upload(ready_admin, vault_id, data=script_data, filename="script.txt")
    assert_problem(res, 415, "unsupported-file-type")
    assert storage.objects == {}


# --- C-12: API key de agente aplica misma regla de dueño ---

def test_c12_key_cannot_list_foreign_vault_files(ready_admin, db, storage):
    guest = _guest(ready_admin, db)
    guest_vault = _vault(guest)
    _upload(guest, guest_vault, filename="guest.png")

    admin_key = create_agent_key(ready_admin, "aira").json()["key"]
    agent = _bearer_client(ready_admin, admin_key)

    # El agente del admin intenta listar la bóveda del guest
    assert_problem(agent.get(f"/vaults/{guest_vault}/files"), 404, "vault-not-found")


def test_c12_key_cannot_rename_foreign_file(ready_admin, db, storage):
    guest = _guest(ready_admin, db)
    guest_vault = _vault(guest)
    file_id = _upload(guest, guest_vault, filename="guest.png").json()["id"]

    admin_key = create_agent_key(ready_admin, "aira").json()["key"]
    agent = _bearer_client(ready_admin, admin_key)

    # El agente del admin intenta renombrar el archivo del guest
    assert_problem(agent.patch(f"/files/{file_id}", json={"name": "new.png"}), 404, "file-not-found")


def test_c12_key_cannot_delete_foreign_file(ready_admin, db, storage):
    guest = _guest(ready_admin, db)
    guest_vault = _vault(guest)
    file_id = _upload(guest, guest_vault, filename="guest.png").json()["id"]

    admin_key = create_agent_key(ready_admin, "aira").json()["key"]
    agent = _bearer_client(ready_admin, admin_key)

    # El agente del admin intenta borrar el archivo del guest
    assert_problem(agent.delete(f"/files/{file_id}"), 404, "file-not-found")


def test_c12_key_can_list_own_vault_files(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id, filename="own.png").json()["id"]

    key = create_agent_key(ready_admin, "aira").json()["key"]
    agent = _bearer_client(ready_admin, key)

    res = agent.get(f"/vaults/{vault_id}/files")
    assert res.status_code == 200
    assert len(res.json()["files"]) == 1


def test_c12_key_can_rename_own_file(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id, filename="own.png").json()["id"]

    key = create_agent_key(ready_admin, "aira").json()["key"]
    agent = _bearer_client(ready_admin, key)

    res = agent.patch(f"/files/{file_id}", json={"name": "renamed.png"})
    assert res.status_code == 200


def test_c12_key_can_delete_own_file(ready_admin, storage):
    vault_id = _vault(ready_admin)
    file_id = _upload(ready_admin, vault_id, filename="own.png").json()["id"]

    key = create_agent_key(ready_admin, "aira").json()["key"]
    agent = _bearer_client(ready_admin, key)

    res = agent.delete(f"/files/{file_id}")
    assert res.status_code == 204
