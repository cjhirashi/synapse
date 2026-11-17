"""H-035: Pruebas del repositorio de publicaciones (puro, sin HTTP)."""

import uuid
from datetime import UTC, datetime

from app.adapters.publication_repository import PublicationRepository
from app.core.models.publication import Publication


def test_repository_crud(db):
    """Crear, leer, actualizar y borrar publicaciones."""
    repo = PublicationRepository(db)
    owner_id = "user-1"
    vault_id = "vault-1"
    note_id = "note-1"

    # Crear
    pub = Publication(
        id=str(uuid.uuid4()),
        owner_id=owner_id,
        vault_id=vault_id,
        note_id=note_id,
        token="token-abc",
        title="Título",
        html="<p>Contenido</p>",
        meta="{}",
        toc="[]",
        note_rev="rev-1",
        published_at=datetime.now(UTC).replace(tzinfo=None),
    )
    repo.add(pub)
    repo.commit()

    # Leer
    found = repo.get_for_note(owner_id, vault_id, note_id)
    assert found is not None
    assert found.token == "token-abc"
    assert found.title == "Título"

    # Actualizar
    found.html = "<p>Nuevo contenido</p>"
    repo.commit()

    # Verificar actualización
    found2 = repo.get_for_note(owner_id, vault_id, note_id)
    assert found2.html == "<p>Nuevo contenido</p>"

    # Borrar
    repo.delete(found2)
    repo.commit()

    # Verificar borrado
    assert repo.get_for_note(owner_id, vault_id, note_id) is None


def test_get_by_token_ignores_owner(db):
    """get_by_token no valida el dueño (es para lectura pública en fase 2)."""
    repo = PublicationRepository(db)

    pub = Publication(
        id=str(uuid.uuid4()),
        owner_id="user-1",
        vault_id="vault-1",
        note_id="note-1",
        token="public-token",
        title="Público",
        html="<p>x</p>",
        meta="{}",
        toc="[]",
        note_rev="rev-1",
        published_at=datetime.now(UTC).replace(tzinfo=None),
    )
    repo.add(pub)
    repo.commit()

    # get_by_token lo devuelve sin validar dueño
    found = repo.get_by_token("public-token")
    assert found is not None
    assert found.owner_id == "user-1"


def test_list_for_vault(db):
    """list_for_vault devuelve solo las de la bóveda y dueño especificados."""
    repo = PublicationRepository(db)

    for i in range(3):
        pub = Publication(
            id=str(uuid.uuid4()),
            owner_id="user-1",
            vault_id="vault-1",
            note_id=f"note-{i}",
            token=f"token-{i}",
            title=f"Título {i}",
            html="<p>x</p>",
            meta="{}",
            toc="[]",
            note_rev="rev",
            published_at=datetime.now(UTC).replace(tzinfo=None),
        )
        repo.add(pub)

    # Otra de otro dueño
    pub_other = Publication(
        id=str(uuid.uuid4()),
        owner_id="user-2",
        vault_id="vault-1",
        note_id="note-x",
        token="token-x",
        title="Otra persona",
        html="<p>x</p>",
        meta="{}",
        toc="[]",
        note_rev="rev",
        published_at=datetime.now(UTC).replace(tzinfo=None),
    )
    repo.add(pub_other)
    repo.commit()

    # Listar
    listed = repo.list_for_vault("user-1", "vault-1")
    assert len(listed) == 3
    assert all(p.owner_id == "user-1" and p.vault_id == "vault-1" for p in listed)
