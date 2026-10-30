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
    # H-015: las credenciales de MinIO salen del `.env` (sin default); endpoint/bucket sí lo tienen.
    "MINIO_ROOT_USER",
    "MINIO_ROOT_PASSWORD",
]


def test_h015_minio_endpoint_and_bucket_have_defaults():
    fields = Settings.model_fields
    assert fields["MINIO_ENDPOINT"].default == "synapse-minio:9000"
    assert fields["MINIO_BUCKET"].default == "synapse-files"
    assert not fields["MINIO_ENDPOINT"].is_required()
    assert not fields["MINIO_BUCKET"].is_required()


@pytest.mark.parametrize("missing", REQUIRED)
def test_rf_002_missing_env_var_prevents_startup(monkeypatch, missing):
    monkeypatch.delenv(missing)
    with pytest.raises(ValidationError) as exc:
        Settings(_env_file=None)
    assert missing in str(exc.value)


def test_rf_002_no_secret_has_a_default():
    for name in REQUIRED:
        assert Settings.model_fields[name].is_required(), name
