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
from app.core.errors import (
    FileFolderNotEmpty, FileNotFound, FileTooLarge, FolderMoveInvalid, FolderNotFound, UnsafeSvg, UnsupportedFileType,
    ValidationFailed,
)
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

# Valores válidos de visibilidad
_VALID_VISIBILITIES = {"private", "public"}

# Patrón para sanear nombres: sin separadores de ruta, sin control chars, 1-255 caracteres
_INVALID_NAME_PATTERN = re.compile(r'[\x00-\x1f\x7f/\\]|^\s+|\s+$')

# Patrón para validar folder: sin separadores de ruta, sin control chars, 1-64 caracteres, no . ni ..
_INVALID_FOLDER_PATTERN = re.compile(r'[\x00-\x1f\x7f/\\]')


def _sanitize_filename(name: str) -> str | None:
    """Sanea el nombre del archivo (C-5/C-11):
    - Sin separadores de ruta (/ \\)
    - Sin caracteres de control
    - Sin espacios en los extremos
    - 1-255 caracteres
    Retorna el nombre saneado o None si es inválido."""
    if not name or len(name) > 255 or _INVALID_NAME_PATTERN.search(name):
        return None
    return name.strip()


MAX_FOLDER_DEPTH = 8
MAX_FOLDER_PATH = 300


def _validate_folder(folder: str | None) -> str | None:
    """Valida una carpeta de archivos (H-025, H-046): ruta con `/` entre niveles.
    - None, vacía o solo espacios → None (raíz)
    - Cada nivel: 1-64 caracteres, sin `\\` ni control chars, sin espacios en los extremos, ni `.` ni `..`
    - Hasta 8 niveles y 300 caracteres en total; sin niveles vacíos (`a//b`, `/a`, `a/`)
    Lanza ValidationFailed si es inválida; retorna la ruta saneada o None."""
    if folder is None or not folder or not folder.strip():
        return None

    clean_folder = folder.strip()
    if len(clean_folder) > MAX_FOLDER_PATH:
        raise ValidationFailed(f"carpeta muy larga: máximo {MAX_FOLDER_PATH} caracteres")
    levels = clean_folder.split("/")
    if len(levels) > MAX_FOLDER_DEPTH:
        raise ValidationFailed(f"carpeta con demasiados niveles: máximo {MAX_FOLDER_DEPTH}")
    for level in levels:
        if not level:
            raise ValidationFailed("carpeta inválida: nivel vacío")
        if len(level) > 64:
            raise ValidationFailed("carpeta muy larga: cada nivel admite máximo 64 caracteres")
        if level != level.strip():
            raise ValidationFailed("carpeta inválida: un nivel no puede empezar ni terminar con espacio")
        if _INVALID_FOLDER_PATTERN.search(level.replace("/", "")) or "\\" in level:
            raise ValidationFailed("carpeta inválida: contiene caracteres no permitidos")
        if level in {".", ".."}:
            raise ValidationFailed(f"carpeta inválida: {level} no permitido")
    return clean_folder


def _with_ancestors(path: str) -> set[str]:
    """`a/b/c` → {`a`, `a/b`, `a/b/c`}."""
    levels = path.split("/")
    return {"/".join(levels[: i + 1]) for i in range(len(levels))}


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

    def create(self, *, vault_id: str, filename: str, data: bytes, folder: str | None = None, visibility: str = "private") -> File:
        """Guarda el objeto y crea su registro, privado por defecto o público si se pide al subir (C-1), o rechaza sin crear nada (C-2/C-5).

        El orden importa (C-2): toda validación ocurre ANTES de tocar MinIO o Postgres, así un
        archivo rechazado no deja rastro en ningún almacén.

        Valida:
        - Nombre (sin separadores de ruta, sin control chars, 1-255, sin espacios en extremos)
        - Carpeta (opcional, 1-64 caracteres si se proporciona)
        - Tamaño (5 MB imágenes, 25 MB resto)
        - Tipo (por firma de bytes, nunca por Content-Type del cliente)
        - SVG (por RNF-003)
        """
        self._ensure_vault(vault_id)

        # Sanitizar nombre (C-5)
        clean_name = _sanitize_filename(filename)
        if clean_name is None:
            raise UnsupportedFileType(f"nombre inválido: {filename}")

        if visibility not in _VALID_VISIBILITIES:
            raise ValidationFailed(f"visibilidad inválida: {visibility}")

        # Validar carpeta (H-025)
        clean_folder = _validate_folder(folder)

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
                visibility=visibility,
                folder=clean_folder,
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
        existe o es de otro, `FileNotFound` (no revela que existe). Rechaza visibilidad inválida."""
        if visibility not in _VALID_VISIBILITIES:
            raise ValidationFailed(f"visibilidad inválida: {visibility}")
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

    # --- Carpetas (H-046) ---

    def list_folders(self, vault_id: str) -> list[str]:
        """Carpetas de la bóveda: explícitas + las que tienen archivos + las ancestras de todas, ordenadas."""
        self._ensure_vault(vault_id)
        known = self._repo.explicit_folders(vault_id, self._owner_id) | self._repo.file_folders(vault_id, self._owner_id)
        every: set[str] = set()
        for path in known:
            every |= _with_ancestors(path)
        return sorted(every, key=lambda p: [x.casefold() for x in p.split("/")])

    def create_folder(self, vault_id: str, path: str) -> list[str]:
        """Crea la carpeta (y sus ancestras) aunque no tenga archivos. Idempotente."""
        clean = _validate_folder(path)
        if clean is None:
            raise ValidationFailed("carpeta inválida: la ruta no puede estar vacía")
        self._ensure_vault(vault_id)
        self._repo.add_folders(vault_id, self._owner_id, _with_ancestors(clean))
        return self.list_folders(vault_id)

    def move_file(self, file_id: str, folder: str | None) -> File:
        """Mueve un archivo a otra carpeta (`None` o vacía = raíz). La carpeta destino queda registrada."""
        clean = _validate_folder(folder)
        record = self.get_record(file_id)
        if record.owner_id != self._owner_id:
            raise FileNotFound(f"archivo inexistente o ajeno: {file_id}")
        if clean is not None:
            self._repo.add_folders(record.vault_id, self._owner_id, _with_ancestors(clean))
        moved = self._repo.set_folder(file_id, self._owner_id, clean)
        if moved is None:
            raise FileNotFound(f"archivo inexistente o ajeno: {file_id}")
        return moved

    def move_folder(self, vault_id: str, src: str, dst: str) -> tuple[str, str, int]:
        """Mueve una carpeta con todo lo que contiene (`src` pasa a llamarse `dst`). Si `dst` ya existe, se fusionan."""
        clean_src, clean_dst = _validate_folder(src), _validate_folder(dst)
        if clean_src is None or clean_dst is None:
            raise FolderMoveInvalid("la raíz no se mueve ni es destino de un nombre de carpeta")
        if clean_dst == clean_src or clean_dst.startswith(clean_src + "/"):
            raise FolderMoveInvalid("una carpeta no se puede mover dentro de sí misma")
        if clean_src not in self.list_folders(vault_id):
            raise FolderNotFound()
        self._repo.add_folders(vault_id, self._owner_id, _with_ancestors(clean_dst))
        moved = self._repo.move_folder_tree(vault_id, self._owner_id, clean_src, clean_dst)
        return clean_src, clean_dst, moved

    def delete_folder(self, vault_id: str, path: str) -> None:
        """Borra una carpeta vacía (y sus subcarpetas vacías). Con archivos dentro: `FileFolderNotEmpty`."""
        clean = _validate_folder(path)
        if clean is None:
            raise ValidationFailed("carpeta inválida: la raíz no se borra")
        if clean not in self.list_folders(vault_id):
            raise FolderNotFound()
        if self._repo.count_files_under(vault_id, self._owner_id, clean) > 0:
            raise FileFolderNotEmpty()
        self._repo.delete_folder_rows(vault_id, self._owner_id, clean)
