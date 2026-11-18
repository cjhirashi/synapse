"""Servicio de publicación de notas (H-035): publicar, republicar, despublicar y consultar estado."""

import json
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError

from app.adapters.file_repository import FileRepository
from app.adapters.publication_repository import PublicationRepository
from app.core.errors import AlreadyPublished, InvalidUnpublishAt, NoteNotFound, NotPublished, PublishNotEnabled, VaultNotFound
from app.core.models.publication import Publication
from app.services.note_content_service import NoteContentService, Versioned
from app.services.publication_snapshot import clean_html, collect_resources, embed_frames, meta_of, number_headings, style_of, title_of
from app.services.template_lookup import find_template

MIN_EXPIRY_LEAD = timedelta(minutes=5)


def _enabled(template: dict | None) -> bool:
    """La plantilla del documento tiene `estilo.publicar.activo` en verdadero."""
    estilo = template.get("estilo") if template else None
    publicar = estilo.get("publicar") if isinstance(estilo, dict) else None
    return isinstance(publicar, dict) and publicar.get("activo") is True


def _iso(moment: datetime | None) -> str | None:
    """Las fechas se guardan en UTC sin zona: se devuelven en ISO 8601 con `Z`."""
    return moment.isoformat() + "Z" if moment else None


def _expiry(value: datetime | None) -> datetime | None:
    """Convierte la fecha de vencimiento a UTC sin zona; None si es None. Lanza InvalidUnpublishAt si es menor a ahora + 5 min."""
    if value is None:
        return None
    utc_no_tz = value.astimezone(UTC).replace(tzinfo=None)
    now_utc = datetime.now(UTC).replace(tzinfo=None)
    if utc_no_tz < now_utc + MIN_EXPIRY_LEAD:
        raise InvalidUnpublishAt("Expiry date must be at least 5 minutes in the future", errors=[{"pointer": "/unpublish_at", "detail": "Expiry date must be at least 5 minutes in the future"}])
    return utc_no_tz


class PublicationService:
    """Publica, republica, despublica y consulta una nota (una instancia por petición). Solo la persona (sesión) llega aquí."""

    def __init__(self, notes: NoteContentService, repo: PublicationRepository, owner_id: str, files: FileRepository | None = None) -> None:
        self._notes = notes
        self._repo = repo
        self._owner_id = owner_id
        self._files = files

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
            "unpublish_at": _iso(pub.unpublish_at) if pub else None,
            "stale": bool(pub and versioned.etag != pub.note_rev),  # el documento cambió desde la copia
        }

    @staticmethod
    def _snapshot(html: str, versioned: Versioned, frontmatter: dict, template: dict | None) -> dict:
        """Campos de la copia fija: HTML limpio con ids de encabezado, índice, título, metadatos mostrados y estilo del PDF."""
        clean = clean_html(html)
        framed = embed_frames(clean)
        numbered, toc = number_headings(framed)
        return {
            "title": title_of(frontmatter, versioned.note.path),
            "html": numbered,
            "meta": json.dumps(meta_of(frontmatter, template), ensure_ascii=False),
            "toc": json.dumps(toc, ensure_ascii=False),
            "style": json.dumps(style_of(template), ensure_ascii=False),
            "note_rev": versioned.etag,
        }

    def status(self, vault_id: str, note_id: str) -> dict:
        versioned, _, template = self._load(vault_id, note_id)
        return self._view(versioned, template, self._repo.get_for_note(self._owner_id, vault_id, note_id))

    def publish(self, vault_id: str, note_id: str, html: str, unpublish_at: datetime | None = None) -> dict:
        """Crea la publicación con un token nuevo. Solo si la plantilla la activa y la nota no está ya publicada."""
        unpublish_at = _expiry(unpublish_at)
        versioned, frontmatter, template = self._load(vault_id, note_id)
        if not _enabled(template):
            raise PublishNotEnabled()
        if self._repo.get_for_note(self._owner_id, vault_id, note_id):
            raise AlreadyPublished()
        pub = Publication(
            id=str(uuid.uuid4()), owner_id=self._owner_id, vault_id=vault_id, note_id=note_id, token=secrets.token_urlsafe(24),
            published_at=datetime.now(UTC).replace(tzinfo=None), unpublish_at=unpublish_at, **self._snapshot(html, versioned, frontmatter, template),
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

    def set_expiry(self, vault_id: str, note_id: str, unpublish_at: datetime | None) -> dict:
        """Fija o quita la fecha de vencimiento de una publicación (H-055). No exige que la plantilla siga activa."""
        versioned, _, template = self._load(vault_id, note_id)
        pub = self._repo.get_for_note(self._owner_id, vault_id, note_id)
        if pub is None:
            raise NotPublished()
        pub.unpublish_at = _expiry(unpublish_at)
        self._repo.commit()
        return self._view(versioned, template, pub)

    def list_published(self, vault_id: str) -> dict:
        """Lista las publicaciones del usuario en la bóveda (H-055)."""
        items = []
        for pub in self._repo.list_for_vault(self._owner_id, vault_id):
            try:
                versioned = self._notes.get(vault_id, pub.note_id)
                note_path = versioned.note.path
                stale = versioned.etag != pub.note_rev
                deleted = False
            except (NoteNotFound, VaultNotFound):  # StorageUnavailable se propaga: un fallo pasajero no marca nada como borrado
                note_path = None
                stale = False
                deleted = True

            items.append({
                "note_id": pub.note_id,
                "note_path": note_path,
                "title": pub.title,
                "token": pub.token,
                "path": f"/p/{pub.token}",
                "published_at": _iso(pub.published_at),
                "republished_at": _iso(pub.republished_at),
                "unpublish_at": _iso(pub.unpublish_at),
                "stale": stale,
                "deleted": deleted,
            })
        return {"items": items}

    def check(self, vault_id: str, note_id: str, html: str) -> dict:
        """Comprueba los recursos de una publicación potencial.

        Devuelve {resources: [...], external: [...], has_private: bool}.
        """
        # Cargar la nota para validar que existe
        self._load(vault_id, note_id)

        # Limpiar y recolectar recursos
        clean = clean_html(html)
        own_ids, external_urls = collect_resources(clean)

        # Verificar recursos propios
        resources = []
        has_private = False

        if self._files:
            for file_id in own_ids:
                record = self._files.get(file_id)
                if record is None or record.owner_id != self._owner_id:
                    # Archivo inexistente o de otro dueño: marcar como missing
                    resources.append({"id": file_id, "name": None, "content_type": None, "visibility": "missing"})
                    has_private = True
                else:
                    # Archivo propio: incluir sus metadatos
                    resources.append({
                        "id": file_id,
                        "name": record.name,
                        "content_type": record.content_type,
                        "visibility": record.visibility,
                    })
                    if record.visibility == "private":
                        has_private = True

        return {
            "resources": resources,
            "external": external_urls,
            "has_private": has_private,
        }
