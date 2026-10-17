import pytest
from pydantic import ValidationError

from app.core.config import Settings

REQUIRED = [
    "DATABASE_URL",
    "COUCHDB_URL",
    "COUCHDB_USER",
    "COUCHDB_PASSWORD",
    "JWT_SECRET",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
]


@pytest.mark.parametrize("missing", REQUIRED)
def test_rf_002_missing_env_var_prevents_startup(monkeypatch, missing):
    monkeypatch.delenv(missing)
    with pytest.raises(ValidationError) as exc:
        Settings(_env_file=None)
    assert missing in str(exc.value)


def test_rf_002_no_secret_has_a_default():
    for name in REQUIRED:
        assert Settings.model_fields[name].is_required(), name
