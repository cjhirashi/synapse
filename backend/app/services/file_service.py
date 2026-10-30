"""Reglas de negocio de los archivos (H-015).

Opera sobre el repositorio de metadatos (Postgres) y el puerto de almacenamiento de objetos
(MinIO vía adaptador, o un FAKE en los tests); no conoce HTTP. Valida que la bóveda sea del
usuario, el tamaño (≤ 5 MB) y el tipo (husmeado de los bytes, nunca del header del cliente),
y sanea los SVG (RNF-003) antes de guardar. Lanza errores de dominio de `core/errors.py`.
"""
import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from app.adapters.file_repository import FileRepository
from app.core.errors import FileNotFound, FileTooLarge, UnsafeSvg, UnsupportedFileType
from app.core.file_safety import SVG, is_safe_svg, sniff_content_type
from app.core.models.file import File
from app.core.ports.object_storage_port import ObjectStoragePort

# Límite por archivo (C-2/C-6). El router corta la lectura en 5 MB + 1 byte y aquí se decide.
MAX_FILE_SIZE = 5 * 1024 * 1024


class FileService:
    def __init__(
        self,
        repo: FileRepository,
        storage: ObjectStoragePort,
        owner_id: str,
        ensure_vault: Callable[[str], None],
    ) -> None:
        self._repo = repo
        self._storage = storage
        self._owner_id = owner_id
        # Lanza `VaultNotFound` si la bóveda no existe o no es del usuario (lo provee la ruta
        # con el `VaultService` del dueño; los tests pasan un doble).
        self._ensure_vault = ensure_vault

    def create(self, *, vault_id: str, filename: str, data: bytes) -> File:
        """Guarda el objeto y crea su registro privado (C-1), o rechaza sin crear nada (C-2/C-5).

        El orden importa (C-2): toda validación ocurre ANTES de tocar MinIO o Postgres, así un
        archivo rechazado no deja rastro en ningún almacén.
        """
        self._ensure_vault(vault_id)
        if len(data) > MAX_FILE_SIZE:
            raise FileTooLarge(f"{len(data)} bytes > {MAX_FILE_SIZE}")
        content_type = sniff_content_type(data)
        if content_type is None:
            raise UnsupportedFileType("tipo no reconocido de los bytes")
        if content_type == SVG and not is_safe_svg(data):
            raise UnsafeSvg("el SVG no pasó el saneo RNF-003")

        file_id = str(uuid.uuid4())
        object_key = f"vaults/{vault_id}/{file_id}"
        self._storage.put_object(object_key, data, content_type)
        return self._repo.create(
            File(
                id=file_id,
                owner_id=self._owner_id,
                vault_id=vault_id,
                name=filename,
                content_type=content_type,
                size=len(data),
                visibility="private",
                object_key=object_key,
                created_at=datetime.now(UTC),
            )
        )

    def get_record(self, file_id: str) -> File:
        """El registro del archivo; `FileNotFound` si no existe (C-3). La regla de visibilidad
        y propiedad la aplica la ruta (un público lo sirve sin sesión)."""
        record = self._repo.get(file_id)
        if record is None:
            raise FileNotFound(f"archivo inexistente: {file_id}")
        return record

    def read(self, record: File) -> bytes:
        """Los bytes del objeto; `StorageUnavailable` si el almacén no responde."""
        return self._storage.get_object(record.object_key)

    def set_visibility(self, file_id: str, visibility: str) -> File:
        """Cambia la visibilidad sólo si el archivo es del usuario autenticado (C-8); si no
        existe o es de otro, `FileNotFound` (no revela que existe)."""
        record = self._repo.set_visibility(file_id, self._owner_id, visibility)
        if record is None:
            raise FileNotFound(f"archivo inexistente o ajeno: {file_id}")
        return record
