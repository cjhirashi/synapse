from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.core.models.file import File


class FileRepository:
    """Metadatos de archivos sobre la sesión de Postgres (una instancia por petición)."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def create(self, file: File) -> File:
        self._db.add(file)
        self._db.commit()
        self._db.refresh(file)
        return file

    def get(self, file_id: str) -> File | None:
        return self._db.get(File, file_id)

    def set_visibility(self, file_id: str, owner_id: str, visibility: str) -> File | None:
        """Cambia la visibilidad sólo si el archivo existe y es del dueño; si no, `None` (C-8)."""
        file = self._db.get(File, file_id)
        if file is None or file.owner_id != owner_id:
            return None
        file.visibility = visibility
        self._db.commit()
        self._db.refresh(file)
        return file

    def set_name(self, file_id: str, owner_id: str, name: str) -> File | None:
        """Cambia el nombre sólo si el archivo existe y es del dueño; si no, `None` (C-5)."""
        file = self._db.get(File, file_id)
        if file is None or file.owner_id != owner_id:
            return None
        file.name = name
        self._db.commit()
        self._db.refresh(file)
        return file

    def delete(self, file_id: str, owner_id: str) -> bool:
        """Borra el archivo sólo si existe y es del dueño. Retorna True si se borró, False si no existe."""
        file = self._db.get(File, file_id)
        if file is None or file.owner_id != owner_id:
            return False
        self._db.delete(file)
        self._db.commit()
        return True

    def list_by_vault(
        self, vault_id: str, owner_id: str, limit: int = 100, offset: int = 0
    ) -> tuple[list[File], int]:
        """Lista archivos de la bóveda del usuario (C-4), con paginación. Retorna (archivos, total)."""
        query = self._db.query(File).filter(
            and_(File.vault_id == vault_id, File.owner_id == owner_id)
        )
        total = query.count()
        files = query.order_by(File.created_at.desc()).limit(limit).offset(offset).all()
        return files, total
