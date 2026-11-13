"""H-053: perfil de agente — nombre visible y foto por `agent_id`, solo sesión humana."""
import pytest

from app.adapters.minio_adapter import get_object_storage
from app.main import app
from app.services import agent_access_guard
from tests.fake_object_storage import FakeObjectStorage
from tests.test_agent_api_key_access import _guest
from tests.test_h030_api import agent_client, vault_of

# PNG mínimo válido (firma de 8 bytes + relleno): el servidor decide el tipo por la firma.
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture(autouse=True)
def _fresh_registry_cache():
    agent_access_guard._CACHE.clear()
    fake = FakeObjectStorage()
    app.dependency_overrides[get_object_storage] = lambda: fake
    yield
    app.dependency_overrides.pop(get_object_storage, None)
    agent_access_guard._CACHE.clear()


def make_agent(admin, agent_id="aira"):
    vault_of(admin)
    return agent_client(admin, agent_id)


def test_the_list_has_every_agent_that_has_a_key_with_no_profile_yet(ready_admin):
    make_agent(ready_admin, "aira")
    got = ready_admin.get("/agent-profiles")
    assert got.status_code == 200
    assert got.json()["items"] == [{"agent_id": "aira", "display_name": None, "photo_url": None}]


def test_set_and_clear_the_display_name(ready_admin):
    make_agent(ready_admin)
    res = ready_admin.put("/agent-profiles/aira", json={"display_name": "  Aira · Arquitecta  "})
    assert res.status_code == 200 and res.json()["display_name"] == "Aira · Arquitecta"
    assert ready_admin.get("/agent-profiles").json()["items"][0]["display_name"] == "Aira · Arquitecta"
    cleared = ready_admin.put("/agent-profiles/aira", json={"display_name": "   "})
    assert cleared.json()["display_name"] is None
    assert ready_admin.put("/agent-profiles/aira", json={"display_name": "x" * 61}).status_code == 422
    assert ready_admin.put("/agent-profiles/aira", json={"nombre": "x"}).status_code == 422


def test_photo_lifecycle_upload_download_replace_and_delete(ready_admin):
    make_agent(ready_admin)
    up = ready_admin.put("/agent-profiles/aira/photo", files={"file": ("a.png", PNG, "image/png")})
    assert up.status_code == 200, up.text
    url = up.json()["photo_url"]
    assert url == "/agent-profiles/aira/photo?v=1"
    got = ready_admin.get("/agent-profiles/aira/photo")
    assert got.status_code == 200 and got.content == PNG and got.headers["content-type"] == "image/png"
    assert got.headers["cache-control"] == "private, no-cache"
    again = ready_admin.put("/agent-profiles/aira/photo", files={"file": ("b.png", PNG, "image/png")})
    assert again.json()["photo_url"].endswith("v=2")
    gone = ready_admin.delete("/agent-profiles/aira/photo")
    assert gone.status_code == 200 and gone.json()["photo_url"] is None
    assert ready_admin.get("/agent-profiles/aira/photo").status_code == 404
    back = ready_admin.put("/agent-profiles/aira/photo", files={"file": ("c.png", PNG, "image/png")})
    assert back.json()["photo_url"].endswith("v=3")  # la versión no se reinicia


def test_photo_is_checked_by_content_and_size(ready_admin):
    make_agent(ready_admin)
    fake = ready_admin.put("/agent-profiles/aira/photo", files={"file": ("a.png", b"no soy una imagen", "image/png")})
    assert fake.status_code == 415
    big = ready_admin.put("/agent-profiles/aira/photo", files={"file": ("a.png", PNG + b"\x00" * (2 * 1024 * 1024), "image/png")})
    assert big.status_code == 413
    assert ready_admin.get("/agent-profiles").json()["items"][0]["photo_url"] is None


def test_unknown_agents_and_bad_ids_are_rejected(ready_admin):
    make_agent(ready_admin)
    assert ready_admin.put("/agent-profiles/otro", json={"display_name": "X"}).status_code == 404
    assert ready_admin.put("/agent-profiles/otro/photo", files={"file": ("a.png", PNG, "image/png")}).status_code == 404
    assert ready_admin.put("/agent-profiles/MAYUS", json={"display_name": "X"}).status_code == 422
    assert ready_admin.get("/agent-profiles/aira/photo").status_code == 404  # sin foto


def test_agent_keys_cannot_read_or_edit_profiles(ready_admin):
    aira = make_agent(ready_admin)
    assert aira.get("/agent-profiles").status_code == 401
    assert aira.put("/agent-profiles/aira", json={"display_name": "Yo"}).status_code == 401
    assert aira.put("/agent-profiles/aira/photo", files={"file": ("a.png", PNG, "image/png")}).status_code == 401
    assert aira.get("/agent-profiles/aira/photo").status_code == 401


def test_a_person_never_sees_or_edits_the_agents_of_another(ready_admin, db):
    make_agent(ready_admin)
    ready_admin.put("/agent-profiles/aira", json={"display_name": "Aira"})
    guest = _guest(ready_admin, db)
    assert guest.get("/agent-profiles").json()["items"] == []
    assert guest.put("/agent-profiles/aira", json={"display_name": "Robado"}).status_code == 404
    assert guest.put("/agent-profiles/aira/photo", files={"file": ("a.png", PNG, "image/png")}).status_code == 404
    assert guest.get("/agent-profiles/aira/photo").status_code == 404
    assert ready_admin.get("/agent-profiles").json()["items"][0]["display_name"] == "Aira"
