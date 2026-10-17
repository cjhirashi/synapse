import uuid

import httpx
import pytest

from app.adapters.couchdb import CouchDBAdapter
from app.core.config import settings
from app.core.errors import ProvisioningError

AUTH = (settings.COUCHDB_USER, settings.COUCHDB_PASSWORD)


@pytest.fixture
def db_name():
    name = f"synapse_user_test_{uuid.uuid4().hex}"
    yield name
    httpx.delete(f"{settings.COUCHDB_URL}/{name}", auth=AUTH)


def _exists(name: str) -> bool:
    return httpx.get(f"{settings.COUCHDB_URL}/{name}", auth=AUTH).status_code == 200


def test_rf_014_ensure_user_db_creates_database(db_name):
    CouchDBAdapter().ensure_user_db(db_name)
    assert _exists(db_name)


def test_rf_015_ensure_user_db_is_idempotent(db_name):
    adapter = CouchDBAdapter()
    adapter.ensure_user_db(db_name)
    adapter.ensure_user_db(db_name)  # CouchDB responde 412: se trata como éxito
    assert _exists(db_name)


def test_rf_015_unreachable_couchdb_raises_provisioning_error(db_name):
    adapter = CouchDBAdapter(url="http://127.0.0.1:1")
    with pytest.raises(ProvisioningError):
        adapter.ensure_user_db(db_name)


def test_rf_015_bad_credentials_raise_provisioning_error(db_name):
    adapter = CouchDBAdapter(user="admin", password="wrong")
    with pytest.raises(ProvisioningError):
        adapter.ensure_user_db(db_name)
