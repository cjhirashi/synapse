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


# --- Almacenamiento ---

class StorageUnavailable(DomainError):
    slug = "storage-unavailable"
    title = "Storage unavailable"
    status = 503
    detail = "Storage unavailable"


class ProvisioningError(StorageUnavailable):
    """Falló el aprovisionamiento de la base CouchDB de un usuario."""

    detail = "Storage provisioning unavailable"


# --- Fallos internos de puertos (no son entradas del catálogo) ---

class RevisionConflict(Exception):
    """El almacén rechazó una escritura por `_rev` (documento cambiado o ya existente).

    Lo lanza `VaultPort` y el servicio siempre lo convierte en `VaultNameTaken` o
    `PreconditionFailed`; no hereda de `DomainError` porque nunca llega al cliente así.
    """
