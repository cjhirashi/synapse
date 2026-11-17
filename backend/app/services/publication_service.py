"""Servicio de publicación de notas (H-035): publicar, republicar, despublicar y consultar estado."""

import json
import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError

from app.adapters.publication_repository import PublicationRepository
from app.core.errors import AlreadyPublished, NotPublished, PublishNotEnabled
from app.core.models.publication import Publication
from app.services.note_content_service import NoteContentService, Versioned
from app.services.publication_snapshot import clean_html, meta_of, number_headings, title_of
from app.services.template_lookup import find_template


def _enabled(template: dict | None) -> bool:
    """La plantilla del documento tiene `estilo.publicar.activo` en verdadero."""
    estilo = template.get("estilo") if template else None
    publicar = estilo.get("publicar") if isinstance(estilo, dict) else None
    return isinstance(publicar, dict) and publicar.get("activo") is True


def _iso(moment: datetime | None) -> str | None:
    """Las fechas se guardan en UTC sin zona: se devuelven en ISO 8601 con `Z`."""
    return moment.isoformat() + "Z" if moment else None


class PublicationService:
    """Publica, republica, despublica y consulta una nota (una instancia por petición). Solo la persona (sesión) llega aquí."""

    def __init__(self, notes: NoteContentService, repo: PublicationRepository, owner_id: str) -> None:
        self._notes = notes
        self._repo = repo
        self._owner_id = owner_id

    def _load(self, vault_id: str, note_id: str) -> tuple[Versioned, dict, dict | None]:
        """La nota (con su revisión), su frontmatter y su plantilla; lanza `NoteNotFound`/`VaultNotFound` si no existe."""
        versioned = self._notes.get(vault_id, note_id)
        frontmatter = versioned.note.frontmatter or {}
        return versioned, frontmatter, find_template(self._notes, vault_id, frontmatter.get("plantilla"))

    @staticmethod
    def _view(versioned: Versioned, template: dict | None, pub: Publication | None) -> dict:
        return {
            "enabled": _enabled(template),
            "published": pub is not None,
            "token": pub.token if pub else None,
            "path": f"/p/{pub.token}" if pub else None,
            "published_at": _iso(pub.published_at) if pub else None,
            "republished_at": _iso(pub.republished_at) if pub else None,
            "stale": bool(pub and versioned.etag != pub.note_rev),  # el documento cambió desde la copia
        }

    @staticmethod
    def _snapshot(html: str, versioned: Versioned, frontmatter: dict, template: dict | None) -> dict:
        """Campos de la copia fija: HTML limpio con ids de encabezado, índice, título y metadatos mostrados."""
        numbered, toc = number_headings(clean_html(html))
        return {
            "title": title_of(frontmatter, versioned.note.path),
            "html": numbered,
            "meta": json.dumps(meta_of(frontmatter, template), ensure_ascii=False),
            "toc": json.dumps(toc, ensure_ascii=False),
            "note_rev": versioned.etag,
        }

    def status(self, vault_id: str, note_id: str) -> dict:
        versioned, _, template = self._load(vault_id, note_id)
        return self._view(versioned, template, self._repo.get_for_note(self._owner_id, vault_id, note_id))

    def publish(self, vault_id: str, note_id: str, html: str) -> dict:
        """Crea la publicación con un token nuevo. Solo si la plantilla la activa y la nota no está ya publicada."""
        versioned, frontmatter, template = self._load(vault_id, note_id)
        if not _enabled(template):
            raise PublishNotEnabled()
        if self._repo.get_for_note(self._owner_id, vault_id, note_id):
            raise AlreadyPublished()
        pub = Publication(
            id=str(uuid.uuid4()), owner_id=self._owner_id, vault_id=vault_id, note_id=note_id, token=secrets.token_urlsafe(24),
            published_at=datetime.now(UTC).replace(tzinfo=None), **self._snapshot(html, versioned, frontmatter, template),
        )
        try:
            self._repo.add(pub)
            self._repo.commit()
        except IntegrityError:  # dos publicaciones a la vez de la misma nota: gana la primera
            self._repo.rollback()
            raise AlreadyPublished() from None
        return self._view(versioned, template, pub)

    def republish(self, vault_id: str, note_id: str, html: str) -> dict:
        """Reemplaza la copia fija; el token, el id y la fecha de publicación no cambian."""
        versioned, frontmatter, template = self._load(vault_id, note_id)
        if not _enabled(template):
            raise PublishNotEnabled()
        pub = self._repo.get_for_note(self._owner_id, vault_id, note_id)
        if pub is None:
            raise NotPublished()
        for field, value in self._snapshot(html, versioned, frontmatter, template).items():
            setattr(pub, field, value)
        pub.republished_at = datetime.now(UTC).replace(tzinfo=None)
        self._repo.commit()
        return self._view(versioned, template, pub)

    def unpublish(self, vault_id: str, note_id: str) -> None:
        """Borra la copia. Siempre se puede, aunque la plantilla ya no tenga la publicación activa."""
        pub = self._repo.get_for_note(self._owner_id, vault_id, note_id)
        if pub is None:
            raise NotPublished()
        self._repo.delete(pub)
        self._repo.commit()
