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
