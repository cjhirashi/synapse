"""Entradas del catálogo de errores para bóvedas (SPEC-0003, catálogo de SPEC-0004).

Los barridos genéricos de `test_problem_catalog.py` (type único, todo 422 hereda de
`ValidationFailed`) ya aplican a estas clases; aquí se fija qué entradas existen.
"""
import pytest

from app.core import errors
from app.core.errors import DomainError, InvalidCursor, RevisionConflict, ValidationFailed

VAULT_ENTRIES = {
    "VaultNotFound": ("vault-not-found", 404),        # RF-014, RF-026
    "VaultNameTaken": ("vault-name-taken", 409),      # RF-007, RF-021, RF-025
    "PreconditionRequired": ("precondition-required", 428),  # RF-010
    "PreconditionFailed": ("precondition-failed", 412),      # RF-010
}


@pytest.mark.parametrize("name, expected", sorted(VAULT_ENTRIES.items()))
def test_rf_014_vault_catalog_entry_exists(name, expected):
    cls = getattr(errors, name)
    assert issubclass(cls, DomainError)
    assert (cls.slug, cls.status) == expected
    assert "slug" in vars(cls), "cada entrada declara su propio slug"


def test_rf_003_invalid_cursor_is_a_validation_failed_without_own_slug_or_detail():
    """BB-3 (re-verificación 7 de SPEC-0004): mismo `type` y `detail` raíz que todo 422."""
    assert issubclass(InvalidCursor, ValidationFailed)
    assert "slug" not in vars(InvalidCursor) and "detail" not in vars(InvalidCursor)


def test_rf_010_revision_conflict_is_not_a_catalog_entry():
    """El servicio siempre lo convierte en 409/412; si escapara, sería un 500 genérico."""
    assert not issubclass(RevisionConflict, DomainError)
