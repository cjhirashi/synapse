"""H-064 F1: punto único de construcción del nombre de base."""

import pytest
from app.core.vault_context import user_db_name, owner_context, USER_DB_PREFIX


def test_user_db_name():
    """Función user_db_name construye correctamente el nombre de la base."""
    user_id = "12345678-1234-5678-1234-567812345678"
    expected = f"{USER_DB_PREFIX}{user_id}"
    assert user_db_name(user_id) == expected


def test_owner_context():
    """Contexto del dueño: identidades iguales, is_owner=True."""
    user_id = "user-001"
    ctx = owner_context(user_id)

    assert ctx.owner_id == user_id
    assert ctx.actor_id == user_id
    assert ctx.db == f"{USER_DB_PREFIX}{user_id}"
    assert ctx.is_owner is True
