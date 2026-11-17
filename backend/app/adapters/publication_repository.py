from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.models.publication import Publication


class PublicationRepository:
    """Publicaciones de notas sobre la sesión de Postgres (una instancia por petición).
    Toda lectura acotada al dueño, excepto `get_by_token` (es la lectura pública de la fase 2).
    El commit lo hace quien llama, como en los demás repositorios.
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_for_note(self, owner_id: str, vault_id: str, note_id: str) -> Publication | None:
        """Obtiene la publicación de una nota del dueño, o None si no existe."""
        return self._db.query(Publication).filter(
            Publication.owner_id == owner_id,
            Publication.vault_id == vault_id,
            Publication.note_id == note_id,
        ).first()

    def get_by_token(self, token: str) -> Publication | None:
        """Obtiene una publicación por token SIN validar dueño (lectura pública). Fase 2."""
        return self._db.query(Publication).filter(Publication.token == token).first()

    def add(self, publication: Publication) -> Publication:
        """Agrega la publicación (flush, sin commit; lo hace quien llama)."""
        self._db.add(publication)
        self._db.flush()
        return publication

    def delete(self, publication: Publication) -> None:
        """Borra la publicación (flush, sin commit; lo hace quien llama)."""
        self._db.delete(publication)
        self._db.flush()

    def list_for_vault(self, owner_id: str, vault_id: str) -> list[Publication]:
        """Lista las publicaciones del dueño en la bóveda."""
        return self._db.query(Publication).filter(
            Publication.owner_id == owner_id,
            Publication.vault_id == vault_id,
        ).order_by(Publication.published_at.desc()).all()

    def commit(self) -> None:
        """Confirma los cambios en la base."""
        self._db.commit()

    def rollback(self) -> None:
        """Deshace los cambios pendientes (p. ej. tras un choque de unicidad)."""
        self._db.rollback()
