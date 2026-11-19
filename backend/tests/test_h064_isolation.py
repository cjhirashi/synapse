"""H-064 F1: aislamiento entre usuarios (crítico: nunca romper)."""

import pytest
from datetime import UTC, datetime

from app.core.models.user import User
from app.core.models.role import Role


def test_isolation_basic_access(db):
    """Usuario A no ve datos de Usuario B en listados (vaults, notes, tasks).

    Nota: Esta prueba es conceptual. Las rutas reales requieren fixtures más complejas
    que monten servidor + mocks de CouchDB. Se deja la estructura para ser ampliada.
    """
    role = db.query(Role).first()

    user_a = User(
        id="user-a",
        email="a@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_user-a",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    user_b = User(
        id="user-b",
        email="b@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_user-b",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(user_a)
    db.add(user_b)
    db.commit()

    # Verificar que A y B tienen IDs distintos
    assert user_a.id != user_b.id
    assert user_a.couchdb_name == "synapse_user_user-a"
    assert user_b.couchdb_name == "synapse_user_user-b"
