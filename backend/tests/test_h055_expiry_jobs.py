"""H-055: Pruebas de despublicación automática de publicaciones vencidas."""

import uuid
from datetime import UTC, datetime, timedelta

from app.adapters.notification_repository import NotificationRepository
from app.adapters.publication_repository import PublicationRepository
from app.core.models.publication import Publication
from app.services.notification_service import NotificationService
from app.services.publication_jobs import expire_publications
from tests.conftest import TestingSessionLocal


def test_expired_publication_deleted_others_remain(db):
    """Una publicación con `unpublish_at` pasado se borra, otra con futuro y otra sin fecha quedan."""
    repo = PublicationRepository(db)
    now = datetime.now(UTC).replace(tzinfo=None)
    owner_id = "user-1"
    vault_id = "vault-1"

    # Vencida
    expired_pub = Publication(
        id=str(uuid.uuid4()),
        owner_id=owner_id,
        vault_id=vault_id,
        note_id="note-1",
        token="expired-token",
        title="Vencida",
        html="<p>x</p>",
        meta="{}",
        toc="[]",
        note_rev="rev",
        published_at=now - timedelta(days=10),
        unpublish_at=now - timedelta(days=1),
    )
    repo.add(expired_pub)

    # Con vencimiento futuro
    future_pub = Publication(
        id=str(uuid.uuid4()),
        owner_id=owner_id,
        vault_id=vault_id,
        note_id="note-2",
        token="future-token",
        title="Futura",
        html="<p>x</p>",
        meta="{}",
        toc="[]",
        note_rev="rev",
        published_at=now,
        unpublish_at=now + timedelta(days=10),
    )
    repo.add(future_pub)

    # Sin vencimiento
    no_expiry = Publication(
        id=str(uuid.uuid4()),
        owner_id=owner_id,
        vault_id=vault_id,
        note_id="note-3",
        token="no-expiry-token",
        title="Sin vencimiento",
        html="<p>x</p>",
        meta="{}",
        toc="[]",
        note_rev="rev",
        published_at=now,
        unpublish_at=None,
    )
    repo.add(no_expiry)
    repo.commit()

    # Ejecutar la pasada
    count = expire_publications(TestingSessionLocal, now)
    assert count == 1

    # Verificar que la vencida se borró
    assert repo.get_by_token("expired-token") is None

    # Verificar que las otras quedan
    assert repo.get_by_token("future-token") is not None
    assert repo.get_by_token("no-expiry-token") is not None


def test_expired_publication_creates_notification(db):
    """Se crea UN aviso `publication_expired` para el dueño."""
    repo = PublicationRepository(db)
    notif_repo = NotificationRepository(db)
    now = datetime.now(UTC).replace(tzinfo=None)
    owner_id = "user-1"
    vault_id = "vault-1"
    note_id = "note-1"

    # Crear publicación vencida
    pub = Publication(
        id="pub-1",
        owner_id=owner_id,
        vault_id=vault_id,
        note_id=note_id,
        token="token-123",
        title="Publicación a vencer",
        html="<p>x</p>",
        meta="{}",
        toc="[]",
        note_rev="rev",
        published_at=now - timedelta(days=5),
        unpublish_at=now - timedelta(hours=1),
    )
    repo.add(pub)
    repo.commit()

    # Ejecutar la pasada
    count = expire_publications(TestingSessionLocal, now)
    assert count == 1

    # Verificar aviso creado
    notices = notif_repo.list(owner_id, unread=False, limit=10)
    assert len(notices) == 1
    assert notices[0].kind == "publication_expired"
    assert "«Publicación a vencer»" in notices[0].title
    assert notices[0].url.endswith("?tab=publicados")
    assert notices[0].resource_id == note_id


def test_idempotent_no_duplicates_on_second_run(db):
    """Correr dos veces seguidas no duplica avisos y la segunda devuelve 0."""
    repo = PublicationRepository(db)
    now = datetime.now(UTC).replace(tzinfo=None)
    owner_id = "user-1"
    vault_id = "vault-1"

    pub = Publication(
        id="pub-1",
        owner_id=owner_id,
        vault_id=vault_id,
        note_id="note-1",
        token="token-123",
        title="x",
        html="<p>x</p>",
        meta="{}",
        toc="[]",
        note_rev="rev",
        published_at=now,
        unpublish_at=now - timedelta(hours=1),
    )
    repo.add(pub)
    repo.commit()

    # Primera pasada
    count1 = expire_publications(TestingSessionLocal, now)
    assert count1 == 1

    # Segunda pasada: la publicación ya se borró
    count2 = expire_publications(TestingSessionLocal, now)
    assert count2 == 0
    assert len(NotificationRepository(db).list(owner_id, unread=False, limit=10)) == 1


def test_disabled_notification_kind_doesnt_create_notice_but_still_unpublishes(db):
    """Con el tipo apagado en preferencias, la publicación se despublica igual pero sin aviso."""
    repo = PublicationRepository(db)
    notif_repo = NotificationRepository(db)
    now = datetime.now(UTC).replace(tzinfo=None)
    owner_id = "user-1"
    vault_id = "vault-1"

    pub = Publication(
        id="pub-1",
        owner_id=owner_id,
        vault_id=vault_id,
        note_id="note-1",
        token="token-123",
        title="x",
        html="<p>x</p>",
        meta="{}",
        toc="[]",
        note_rev="rev",
        published_at=now,
        unpublish_at=now - timedelta(hours=1),
    )
    repo.add(pub)
    repo.commit()

    # Desactivar el tipo
    NotificationService(notif_repo, owner_id).set_preferences({"publication_expired": False})

    # Ejecutar la pasada
    count = expire_publications(TestingSessionLocal, now)
    assert count == 1

    # La publicación se borró
    assert repo.get_by_token("token-123") is None

    # Pero no hay aviso
    notices = notif_repo.list(owner_id, unread=False, limit=10)
    assert len(notices) == 0


def test_due_for_unpublish_respects_exact_limit(db):
    """due_for_unpublish respeta el límite exacto (<= now), no devuelve nulas ni futuras, y las devuelve ordenadas."""
    repo = PublicationRepository(db)
    now = datetime.now(UTC).replace(tzinfo=None)
    owner_id = "user-1"
    vault_id = "vault-1"

    # En el límite exacto (should be included)
    pub1 = Publication(
        id="pub-1",
        owner_id=owner_id,
        vault_id=vault_id,
        note_id="note-1",
        token="token-1",
        title="Exacto",
        html="<p>x</p>",
        meta="{}",
        toc="[]",
        note_rev="rev",
        published_at=now,
        unpublish_at=now,
    )
    repo.add(pub1)

    # Pasado (should be included)
    pub2 = Publication(
        id="pub-2",
        owner_id=owner_id,
        vault_id=vault_id,
        note_id="note-2",
        token="token-2",
        title="Pasado",
        html="<p>x</p>",
        meta="{}",
        toc="[]",
        note_rev="rev",
        published_at=now,
        unpublish_at=now - timedelta(hours=1),
    )
    repo.add(pub2)

    # Futuro (should NOT be included)
    pub3 = Publication(
        id="pub-3",
        owner_id=owner_id,
        vault_id=vault_id,
        note_id="note-3",
        token="token-3",
        title="Futuro",
        html="<p>x</p>",
        meta="{}",
        toc="[]",
        note_rev="rev",
        published_at=now,
        unpublish_at=now + timedelta(hours=1),
    )
    repo.add(pub3)

    # Sin vencimiento (should NOT be included)
    pub4 = Publication(
        id="pub-4",
        owner_id=owner_id,
        vault_id=vault_id,
        note_id="note-4",
        token="token-4",
        title="Sin fecha",
        html="<p>x</p>",
        meta="{}",
        toc="[]",
        note_rev="rev",
        published_at=now,
        unpublish_at=None,
    )
    repo.add(pub4)
    repo.commit()

    # Consultar
    due = repo.due_for_unpublish(now)
    assert len(due) == 2
    assert {p.id for p in due} == {"pub-1", "pub-2"}

    # Verificar orden (pasado primero, luego exacto)
    assert due[0].id == "pub-2"  # pasado
    assert due[1].id == "pub-1"  # exacto
