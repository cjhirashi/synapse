"""Entradas del catálogo de errores para la sincronización (SPEC-0005, catálogo de SPEC-0004).

Los barridos genéricos de `test_problem_catalog.py` (type único, todo 422 hereda de
`ValidationFailed`) ya aplican a estas clases; aquí se fija qué entradas existen.
"""
import pytest

from app.core import errors
from app.core.errors import DomainError, InvalidSyncRequest, ValidationFailed

SYNC_ENTRIES = {
    "SyncEndpointNotFound": ("sync-endpoint-not-found", 404),  # RF-003
    "PayloadTooLarge": ("payload-too-large", 413),             # RF-003 (límites de PLAN-0005 §2.1)
    "CheckpointNotFound": ("checkpoint-not-found", 404),       # RF-010 (checkpoint ausente)
}


@pytest.mark.parametrize("name, expected", sorted(SYNC_ENTRIES.items()))
def test_rf_003_sync_catalog_entry_exists(name, expected):
    cls = getattr(errors, name)
    assert issubclass(cls, DomainError)
    assert (cls.slug, cls.status) == expected
    assert "slug" in vars(cls), "cada entrada declara su propio slug"


def test_rf_004_invalid_sync_request_is_a_validation_failed_without_own_slug_or_detail():
    """Mismo `type` y `detail` raíz que todo 422 (enmiendas 7 y 8 de SPEC-0004)."""
    assert issubclass(InvalidSyncRequest, ValidationFailed)
    assert "slug" not in vars(InvalidSyncRequest) and "detail" not in vars(InvalidSyncRequest)
