from datetime import UTC, datetime

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.models.file import File, FileFolder

_ALL = object()  # sin filtro de carpeta


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
        self, vault_id: str, owner_id: str, limit: int = 100, offset: int = 0, folder: object = _ALL
    ) -> tuple[list[File], int]:
        """Lista archivos de la bóveda del usuario (C-4), con paginación. Retorna (archivos, total).
        `folder`: sin pasar = todos; `None` = los de la raíz; una ruta = los de esa carpeta (no las subcarpetas)."""
        query = self._db.query(File).filter(
            and_(File.vault_id == vault_id, File.owner_id == owner_id)
        )
        if folder is not _ALL:
            query = query.filter(File.folder.is_(None) if folder is None else File.folder == folder)
        total = query.count()
        files = query.order_by(File.created_at.desc()).limit(limit).offset(offset).all()
        return files, total

    # --- Carpetas (H-046) ---

    def set_folder(self, file_id: str, owner_id: str, folder: str | None) -> File | None:
        """Mueve el archivo a otra carpeta (`None` = raíz) sólo si es del dueño; si no, `None`."""
        file = self._db.get(File, file_id)
        if file is None or file.owner_id != owner_id:
            return None
        file.folder = folder
        self._db.commit()
        self._db.refresh(file)
        return file

    def file_folders(self, vault_id: str, owner_id: str) -> set[str]:
        """Carpetas que existen por tener archivos (valores distintos de `files.folder`)."""
        rows = self._db.query(File.folder).filter(
            and_(File.vault_id == vault_id, File.owner_id == owner_id, File.folder.isnot(None))
        ).distinct().all()
        return {r[0] for r in rows}

    def explicit_folders(self, vault_id: str, owner_id: str) -> set[str]:
        rows = self._db.query(FileFolder.path).filter(
            and_(FileFolder.vault_id == vault_id, FileFolder.owner_id == owner_id)
        ).all()
        return {r[0] for r in rows}

    def add_folders(self, vault_id: str, owner_id: str, paths: set[str]) -> None:
        have = self.explicit_folders(vault_id, owner_id)
        now = datetime.now(UTC).replace(tzinfo=None)
        for path in sorted(paths - have):
            self._db.add(FileFolder(vault_id=vault_id, path=path, owner_id=owner_id, created_at=now))
        self._db.commit()

    def _under(self, column, path: str):
        return or_(column == path, column.like(path.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "/%", escape="\\"))

    def count_files_under(self, vault_id: str, owner_id: str, path: str) -> int:
        return self._db.query(File).filter(
            and_(File.vault_id == vault_id, File.owner_id == owner_id, self._under(File.folder, path))
        ).count()

    def move_folder_tree(self, vault_id: str, owner_id: str, src: str, dst: str) -> int:
        """Cambia el prefijo `src` por `dst` en los archivos y en las carpetas explícitas. Retorna cuántos archivos."""
        def swap(value: str) -> str:
            return dst + value[len(src):]

        files = self._db.query(File).filter(
            and_(File.vault_id == vault_id, File.owner_id == owner_id, self._under(File.folder, src))
        ).all()
        for f in files:
            f.folder = swap(f.folder)
        rows = self._db.query(FileFolder).filter(
            and_(FileFolder.vault_id == vault_id, FileFolder.owner_id == owner_id, self._under(FileFolder.path, src))
        ).all()
        have = self.explicit_folders(vault_id, owner_id)
        now = datetime.now(UTC).replace(tzinfo=None)
        for row in rows:
            new_path = swap(row.path)
            self._db.delete(row)
            if new_path not in have:
                self._db.add(FileFolder(vault_id=vault_id, path=new_path, owner_id=owner_id, created_at=now))
                have.add(new_path)
        self._db.commit()
        return len(files)

    def delete_folder_rows(self, vault_id: str, owner_id: str, path: str) -> None:
        for row in self._db.query(FileFolder).filter(
            and_(FileFolder.vault_id == vault_id, FileFolder.owner_id == owner_id, self._under(FileFolder.path, path))
        ).all():
            self._db.delete(row)
        self._db.commit()
