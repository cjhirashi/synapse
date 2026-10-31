"""Errores de dominio de Synapse (SPEC-0004).

Cada subclase de `DomainError` con `slug` propio **es** una entrada del catálogo de
Problem Details: `type` = `urn:synapse:problem:{slug}`, más su `title`, código HTTP y
`detail` público por defecto (en inglés). Servicios y dependencias lanzan estas clases;
sólo `core/problems.py` las traduce a HTTP (RF-008).

El texto con el que se construye la excepción es **interno** (va al log, nunca al
cliente). Para dar al cliente un `detail` distinto del de la clase hay que pasarlo de
forma explícita con `detail=`.

También vive aquí el catálogo de mensajes de validación propios (`FIELD_ERROR_MESSAGES`):
el único texto de un validador que puede llegar al cliente.
"""
from typing import ClassVar

from pydantic_core import PydanticCustomError

PROBLEM_TYPE_PREFIX = "urn:synapse:problem:"


# --- Mensajes de validación propios (SPEC-0004 RF-011, enmiendas 3 y 4) ---
# Código del error → texto publicable en `errors[].detail` (inglés, sin `{}`). El traductor
# publica esta entrada por el código, nunca el mensaje con que se lanzó; un código que no
# esté aquí sale como texto genérico. Ningún código puede ser un tipo conocido de pydantic:
# el traductor resuelve antes esos tipos y esta entrada nunca se publicaría.
FIELD_ERROR_MESSAGES: dict[str, str] = {
    "invalid_email": "Invalid email format",
    "control_characters": "Must not contain control characters",
}


def field_error(code: str) -> PydanticCustomError:
    """Error que lanza un validador de pydantic para un código del catálogo."""
    return PydanticCustomError(code, FIELD_ERROR_MESSAGES[code])


class DomainError(Exception):
    slug: ClassVar[str]
    title: ClassVar[str]
    status: ClassVar[int]
    detail: ClassVar[str]

    def __init__(
        self,
        message: str | None = None,
        *,
        detail: str | None = None,
        errors: list[dict[str, str]] | None = None,
    ) -> None:
        super().__init__(message or detail or self.detail)
        self.public_detail = detail or self.detail
        # Sólo para 422: [{"pointer" | "parameter" | "header": ..., "detail": ...}].
        self.errors = errors

    @classmethod
    def type_uri(cls) -> str:
        return PROBLEM_TYPE_PREFIX + cls.slug


# --- Autenticación y autorización (SPEC-0002) ---

class NotAuthenticated(DomainError):
    slug = "not-authenticated"
    title = "Not authenticated"
    status = 401
    detail = "Not authenticated"


class InvalidToken(DomainError):
    slug = "invalid-token"
    title = "Invalid token"
    status = 401
    detail = "Invalid token"


class InvalidCredentials(DomainError):
    slug = "invalid-credentials"
    title = "Invalid credentials"
    status = 401
    detail = "Invalid credentials"


class InvalidRefreshToken(DomainError):
    slug = "invalid-refresh-token"
    title = "Invalid refresh token"
    status = 401
    detail = "Invalid refresh token"


class AdminRequired(DomainError):
    slug = "admin-required"
    title = "Admin required"
    status = 403
    detail = "Admin required"


class PasswordChangeRequired(DomainError):
    slug = "password-change-required"
    title = "Password change required"
    status = 403
    detail = "Password change required"


class WrongCurrentPassword(DomainError):
    slug = "wrong-current-password"
    title = "Current password is incorrect"
    status = 400
    detail = "Current password is incorrect"


class EmailTaken(DomainError):
    slug = "email-taken"
    title = "Email already registered"
    status = 409
    detail = "Email already registered"


# --- Validación ---

class ValidationFailed(DomainError):
    """Entrada única de todo 422, de pydantic o de dominio (RF-005, enmienda 7).

    Una validación que pydantic no puede expresar (p. ej. entre path, query y cuerpo) lanza
    una subclase sin slug propio con `errors=[{"pointer" | "parameter" | "header": ...,
    "detail": ...}]`. Cada `detail` es texto fijo, nunca interpolado con datos del cliente
    (RF-011): el traductor lo publica tal cual. El `detail` raíz no se redefine ni se pasa
    con `detail=`: es el mismo para todo 422 (enmienda 8).
    """

    slug = "validation-error"
    title = "Validation error"
    status = 422
    detail = "Request validation failed."


class PasswordPolicyViolation(ValidationFailed):
    """La nueva contraseña incumple la política (`core/security.py`)."""


class InvalidCursor(ValidationFailed):
    """`cursor` de `GET /vaults` ilegible o de otra lista (SPEC-0003 RF-003)."""


# --- Bóvedas (SPEC-0003) ---

class VaultNotFound(DomainError):
    """Bóveda inexistente, ajena, borrada o con id no UUID: mismo cuerpo siempre (RF-014)."""

    slug = "vault-not-found"
    title = "Vault not found"
    status = 404
    detail = "Vault not found"


class VaultNameTaken(DomainError):
    slug = "vault-name-taken"
    title = "Vault name already in use"
    status = 409
    detail = "Vault name already in use"


class PreconditionRequired(DomainError):
    """Escritura sin `If-Match` (RF-010)."""

    slug = "precondition-required"
    title = "Precondition required"
    status = 428
    detail = "If-Match header is required"


class PreconditionFailed(DomainError):
    """`If-Match` distinto del `ETag` vigente: la bóveda cambió (RF-010)."""

    slug = "precondition-failed"
    title = "Precondition failed"
    status = 412
    detail = "Vault has changed"


# --- Notas vía REST (historia 0014-acceso-agentes-notas, H-004) ---

class NoteNotFound(DomainError):
    """Nota inexistente, ajena, borrada o con id no UUID: mismo cuerpo siempre (C-3)."""

    slug = "note-not-found"
    title = "Note not found"
    status = 404
    detail = "Note not found"


class NotePathTaken(DomainError):
    """`path` ya lo usa otra nota viva de la bóveda (C-6); mapea la excepción interna del
    mismo nombre de `services/note_service.py` (reuso, sin reescribir)."""

    slug = "note-path-taken"
    title = "Note path already in use"
    status = 409
    detail = "Note path already in use"


# --- Sincronización (SPEC-0005) ---

class SyncEndpointNotFound(DomainError):
    """Ruta de `/sync` fuera del subconjunto permitido del protocolo (RF-003).

    Responde la ruta comodín final del router: la petición nunca llega a CouchDB, y el
    cuerpo es el mismo para cualquier ruta, método o base nombrada en la URL.
    """

    slug = "sync-endpoint-not-found"
    title = "Sync endpoint not found"
    status = 404
    detail = "Sync endpoint not found"


class CheckpointNotFound(DomainError):
    """`GET /sync/db/_local/{id}` de un checkpoint que no existe (PLAN-0005 §2.1).

    El replicador de PouchDB lee el 404 como "sin checkpoint" y replica desde el principio;
    es el único 404 del canal que no es `SyncEndpointNotFound` (la ruta sí existe).
    """

    slug = "checkpoint-not-found"
    title = "Checkpoint not found"
    status = 404
    detail = "Checkpoint not found"


class InvalidSyncRequest(ValidationFailed):
    """Parámetro o cuerpo del protocolo de replicación mal formado (SPEC-0005 RF-004).

    `services/sync_filter.py` lo lanza con `errors=` de texto fijo por parámetro o puntero;
    los parámetros fuera de la lista blanca no son error: se descartan sin más.
    """


class PayloadTooLarge(DomainError):
    """Lote de `_bulk_docs` o documento `_local` por encima de los límites (PLAN-0005 §2.1)."""

    slug = "payload-too-large"
    title = "Payload too large"
    status = 413
    detail = "Payload too large"


# --- Keys de agente (SPEC-0013) ---

class AgentKeyNotFound(DomainError):
    """`DELETE /auth/agent-keys/{id}` de una key ajena o inexistente (RF-005, P3).

    Mismo cuerpo en ambos casos: no revela si la key existe pero es de otro dueño.
    """

    slug = "agent-key-not-found"
    title = "Agent key not found"
    status = 404
    detail = "Agent key not found"


class AgentKeyLabelTaken(DomainError):
    """Crear una key con un `label` que ya usa **otra key vigente** del mismo dueño (RF-010).

    Sólo bloquea entre keys no revocadas: tras revocar, el label vuelve a estar libre
    (rotación). La unicidad es por dueño, nunca global entre usuarios.
    """

    slug = "agent-key-label-taken"
    title = "Agent key label already in use"
    status = 409
    detail = "Agent key label already in use"


# --- Archivos (H-015) ---

class FileNotFound(DomainError):
    """Archivo inexistente o, si es privado, de otro usuario: mismo cuerpo siempre (C-3).

    No distingue «no existe» de «es de otro»: un privado ajeno responde 404, no 403, para no
    revelar qué ids existen.
    """

    slug = "file-not-found"
    title = "File not found"
    status = 404
    detail = "File not found"


class FileTooLarge(DomainError):
    """El archivo supera el límite de 5 MB (C-2/C-6)."""

    slug = "file-too-large"
    title = "File too large"
    status = 413
    detail = "File exceeds the 5 MB limit"


class UnsupportedFileType(DomainError):
    """El tipo del archivo (husmeado de los bytes, no del header) no está admitido (C-2/C-6)."""

    slug = "unsupported-file-type"
    title = "Unsupported file type"
    status = 415
    detail = "File type not allowed: only images (png, jpeg, webp, gif, svg), PDF, Office and OpenDocument files, csv, txt, md, json, zip and html are accepted"


class UnsafeSvg(DomainError):
    """Un SVG que no pasa el saneo de RNF-003 (script, foreignObject, on*, href navegable, C-5)."""

    slug = "unsafe-svg"
    title = "Unsafe SVG"
    status = 400
    detail = "SVG contains disallowed content"


# --- Almacenamiento ---

class StorageUnavailable(DomainError):
    slug = "storage-unavailable"
    title = "Storage unavailable"
    status = 503
    detail = "Storage unavailable"


class ProvisioningError(StorageUnavailable):
    """Falló el aprovisionamiento de la base CouchDB de un usuario."""

    detail = "Storage provisioning unavailable"


# --- SPA / catch-all HTTP (SPEC-0007) ---

class SpaResourceNotFound(DomainError):
    """Ninguna ruta de la SPA ni de la API atiende la petición (SPEC-0007 RF-004/005/007).

    Un solo cuerpo para "esta petición no corresponde a ningún recurso que la SPA o la API
    sirvan": archivo del build inexistente (RF-004), subruta de API desconocida (RF-005) o
    ruta/método completamente fuera de la app (RF-007, reclasificado desde el 405 nativo de
    Starlette por `core/problems.py::_framework_error`, ver D-7/D-8).
    """

    slug = "spa-resource-not-found"
    title = "Resource not found"
    status = 404
    detail = "Resource not found"


# --- Fallos internos de puertos (no son entradas del catálogo) ---

class RevisionConflict(Exception):
    """El almacén rechazó una escritura por `_rev` (documento cambiado o ya existente).

    Lo lanza `VaultPort` y el servicio siempre lo convierte en `VaultNameTaken` o
    `PreconditionFailed`; no hereda de `DomainError` porque nunca llega al cliente así.
    """
