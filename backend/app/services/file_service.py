"""Reglas de negocio de los archivos (H-015/H-016).

Opera sobre el repositorio de metadatos (Postgres) y el puerto de almacenamiento de objetos
(MinIO vía adaptador, o un FAKE en los tests); no conoce HTTP. Valida que la bóveda sea del
usuario, el tamaño (5 MB imágenes, 25 MB documentos, C-2/C-11), el tipo (por firma de bytes,
C-2), sanea SVG (RNF-003, C-5) y valida nombres (sin separadores de ruta, C-5). Lanza errores
de dominio de `core/errors.py`.
"""
import re
import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from app.adapters.file_repository import FileRepository
from app.core.errors import FileNotFound, FileTooLarge, UnsafeSvg, UnsupportedFileType
from app.core.file_safety import SVG, is_safe_svg, resolve_content_type
from app.core.models.file import File
from app.core.ports.object_storage_port import ObjectStoragePort

# Límites por categoría (C-2/C-11). El router corta la lectura en límite + 1 byte.
MAX_FILE_SIZE_IMAGE = 5 * 1024 * 1024
MAX_FILE_SIZE_DOCUMENT = 25 * 1024 * 1024
# Compatible con código existente que usa MAX_FILE_SIZE
MAX_FILE_SIZE = MAX_FILE_SIZE_IMAGE

# Categorías de imagen (5 MB)
_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "svg"}

# Patrón para sanear nombres: sin separadores de ruta, sin control chars, 1-255 caracteres
_INVALID_NAME_PATTERN = re.compile(r'[\x00-\x1f\x7f/\\]|^\s+|\s+$')


def _sanitize_filename(name: str) -> str | None:
    """Sanea el nombre del archivo (C-5/C-11):
    - Sin separadores de ruta (/ \)
    - Sin caracteres de control
    - Sin espacios en los extremos
    - 1-255 caracteres
    Retorna el nombre saneado o None si es inválido."""
    if not name or len(name) > 255 or _INVALID_NAME_PATTERN.search(name):
        return None
    return name.strip()


def _get_file_extension(filename: str) -> str:
    """Extrae la extensión del nombre de archivo (sin el punto)."""
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


def _get_max_file_size(ext: str) -> int:
    """Retorna el límite de tamaño para la extensión (C-2/C-11)."""
    if ext.lower() in _IMAGE_EXTENSIONS:
        return MAX_FILE_SIZE_IMAGE
    return MAX_FILE_SIZE_DOCUMENT


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

        Valida:
        - Nombre (sin separadores de ruta, sin control chars, 1-255, sin espacios en extremos)
        - Tamaño (5 MB imágenes, 25 MB resto)
        - Tipo (por firma de bytes, nunca por Content-Type del cliente)
        - SVG (por RNF-003)
        """
        self._ensure_vault(vault_id)

        # Sanitizar nombre (C-5)
        clean_name = _sanitize_filename(filename)
        if clean_name is None:
            raise UnsupportedFileType(f"nombre inválido: {filename}")

        # Extraer extensión y verificar tamaño antes de validar tipo
        ext = _get_file_extension(clean_name)
        max_size = _get_max_file_size(ext)

        if len(data) > max_size:
            raise FileTooLarge(f"{len(data)} bytes > {max_size} (límite para .{ext})")

        # Resolver tipo por FIRMA de bytes (C-2/C-11), nunca por Content-Type del cliente
        content_type = resolve_content_type(data, ext)
        if content_type is None:
            raise UnsupportedFileType(f"tipo no válido o firma no coincide: {ext}")

        # SVG: verificar saneo (C-5)
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
                name=clean_name,
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

    def set_name(self, file_id: str, new_name: str) -> File:
        """Cambia el nombre sólo si el archivo es del usuario (C-5). La extensión se conserva
        o se valida que la nueva sea coherente con el tipo (C-5)."""
        record = self._repo.get(file_id)
        if record is None or record.owner_id != self._owner_id:
            raise FileNotFound(f"archivo inexistente o ajeno: {file_id}")

        # Sanitizar nuevo nombre
        clean_name = _sanitize_filename(new_name)
        if clean_name is None:
            raise UnsupportedFileType(f"nombre inválido: {new_name}")

        # Si la extensión cambió, verificar que sea coherente con el tipo guardado
        old_ext = _get_file_extension(record.name)
        new_ext = _get_file_extension(clean_name)

        if old_ext.lower() != new_ext.lower():
            # Verificar que la nueva extensión sea válida para el type ya guardado
            # Esto previene cambiar foto.png a malware.exe aunque sea el mismo tipo
            if not self._is_extension_valid_for_type(new_ext, record.content_type):
                raise UnsupportedFileType(
                    f"no se puede cambiar extensión a {new_ext} para tipo {record.content_type}"
                )

        # Actualizar en la repo
        updated = self._repo.set_name(file_id, self._owner_id, clean_name)
        if updated is None:
            raise FileNotFound(f"archivo inexistente o ajeno: {file_id}")
        return updated

    def delete(self, file_id: str) -> None:
        """Borra el archivo (objeto + registro) sólo si es del usuario (C-6). Si MinIO falla,
        el registro se conserva y se relanza la excepción (nunca registro huérfano silencioso)."""
        record = self._repo.get(file_id)
        if record is None or record.owner_id != self._owner_id:
            raise FileNotFound(f"archivo inexistente o ajeno: {file_id}")

        # Borrar objeto de MinIO primero; si falla, la transacción se detiene
        try:
            self._storage.delete_object(record.object_key)
        except Exception:
            # MinIO falló: relanzar sin borrar el registro (C-6)
            raise

        # Borrar el registro solo después de borrar el objeto
        self._repo.delete(file_id, self._owner_id)

    @staticmethod
    def _is_extension_valid_for_type(ext: str, content_type: str) -> bool:
        """¿La extensión es válida para el Content-Type guardado? (C-5)
        Previene cambios a extensiones ejecutables."""
        ext_lower = ext.lower()

        # Extensiones ejecutables siempre rechazadas
        if ext_lower in {"exe", "dll", "msi", "bat", "cmd", "com", "scr",
                         "sh", "js", "mjs", "jar", "apk", "app", "vbs", "ps1"}:
            return False

        # Mapeo simple de tipos a extensiones permitidas (no exhaustivo, lo importante es no permitir ejecutables)
        type_to_exts = {
            "image/png": {"png"},
            "image/jpeg": {"jpg", "jpeg"},
            "image/gif": {"gif"},
            "image/webp": {"webp"},
            "image/svg+xml": {"svg"},
            "application/pdf": {"pdf"},
            "application/msword": {"doc"},
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {"docx"},
            "application/vnd.ms-excel": {"xls"},
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {"xlsx"},
            "application/vnd.ms-powerpoint": {"ppt"},
            "application/vnd.openxmlformats-officedocument.presentationml.presentation": {"pptx"},
            "application/vnd.oasis.opendocument.text": {"odt"},
            "application/vnd.oasis.opendocument.spreadsheet": {"ods"},
            "application/vnd.oasis.opendocument.presentation": {"odp"},
            "application/rtf": {"rtf"},
            "text/csv": {"csv"},
            "text/plain": {"txt"},
            "text/markdown": {"md"},
            "application/json": {"json"},
            "text/html": {"html", "htm"},
            "application/zip": {"zip"},
        }

        allowed = type_to_exts.get(content_type, {ext_lower})
        return ext_lower in allowed
