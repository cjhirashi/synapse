import unicodedata
from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, field_validator,
)

from app.core.errors import field_error
from app.core.security import EMAIL_PATTERN, normalize_email


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _normalize(cls, v: str) -> str:
        return normalize_email(v)


class CreateUserRequest(BaseModel):
    email: str
    password: str = Field(min_length=1)

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = normalize_email(v)
        if not EMAIL_PATTERN.match(v):
            # El texto publicado sale del catálogo de errores (SPEC-0004 RF-011).
            raise field_error("invalid_email")
        return v


class UserResponse(BaseModel):
    id: str
    email: str
    role: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class TokenPayload(BaseModel):
    sub: str   # user_id — el proxy construye synapse_user_{sub}
    role: str
    exp: int
    ver: int   # versión de credenciales (RF-021)


# --- Bóvedas (SPEC-0003) ---
# Los límites usan restricciones nativas de pydantic: el traductor de 422 (SPEC-0004)
# regenera sus mensajes sólo con los límites del esquema, nunca con el valor enviado.

def _no_control_characters(name: str) -> str:
    """Rechaza caracteres de control (categoría `Cc`) en el nombre (SPEC-0003 enmienda 1, E2).

    Corre tras quitar los espacios de los extremos: sólo cuentan los del interior.
    """
    if any(unicodedata.category(char) == "Cc" for char in name):
        raise field_error("control_characters")
    return name


VaultName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
    AfterValidator(_no_control_characters),
]
VaultDescription = Annotated[str, StringConstraints(max_length=2000)]
# SPEC-0009 RF-012: `glifo` o `glifo:color`, kebab-case ASCII en minúscula (canon del contrato
# `0009/contracts/vault-icon.schema.json`). Sólo la gramática: el servidor no conoce el catálogo
# de íconos ni la paleta; el cliente resuelve lo desconocido a las iniciales. Una sola regla
# para REST y para el push (que la reutiliza); `pattern` y `max_length` son restricciones
# nativas, así el traductor de 422 (SPEC-0004) no publica nunca el valor enviado.
_ICON_WORD = r"[a-z0-9]+(?:-[a-z0-9]+)*"
VaultIcon = Annotated[
    str,
    StringConstraints(min_length=1, max_length=64, pattern=rf"^{_ICON_WORD}(?::{_ICON_WORD})?$"),
]
VaultTag = Annotated[
    str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=32)
]


def _dedupe_tags(tags: list[str]) -> list[str]:
    """Quita repetidos conservando el primer orden (RF-006); llegan ya en minúsculas."""
    return list(dict.fromkeys(tags))


# `max_length` cuenta los tags enviados, antes de quitar repetidos (RF-005).
VaultTags = Annotated[list[VaultTag], Field(max_length=20), AfterValidator(_dedupe_tags)]


class VaultCreate(BaseModel):
    """Cuerpo de `POST /vaults`; cualquier otro campo → 422 (RF-023)."""

    model_config = ConfigDict(extra="forbid")

    name: VaultName
    description: VaultDescription | None = None
    tags: VaultTags = Field(default_factory=list)
    icon: VaultIcon | None = None


class VaultUpdate(BaseModel):
    """Cuerpo de `PATCH /vaults/{id}`: se aplican sólo los campos enviados (RF-009).

    `name` y `tags` no admiten `null`: su tipo no es anulable y el valor por defecto `None`
    no se valida (pydantic no valida defaults), así que "ausente" se distingue de un
    `null` explícito, que da 422. `description: null` e `icon: null` sí valen: borran el campo.
    Se lee con `model_dump(exclude_unset=True)`.
    """

    model_config = ConfigDict(extra="forbid")

    name: VaultName = None  # type: ignore[assignment]
    description: VaultDescription | None = None
    tags: VaultTags = None  # type: ignore[assignment]
    icon: VaultIcon | None = None


class VaultOut(BaseModel):
    id: str
    name: str
    description: str | None
    tags: list[str]
    icon: str | None
    owner_id: str
    created_at: str
    updated_at: str
    deleted_at: str | None


class VaultListItem(VaultOut):
    # PLAN-0003 §13: en los listados la versión viaja en cada elemento (mismo valor que la
    # cabecera `ETag`); sin ella la Papelera no podría enviar `If-Match` al restaurar.
    etag: str


class VaultPage(BaseModel):
    items: list[VaultListItem]
    next_cursor: str | None


# --- Notas vía REST (historia 0014-acceso-agentes-notas, H-004.1: sólo lectura) ---
# Mismo patrón que las de bóveda: `NoteOut` lleva el contenido completo (GET por id),
# `NoteListItem` es la versión ligera del listado (sin `content`/`frontmatter`, con `etag`
# para que la Papelera pueda restaurar sin otra consulta, PLAN-0003 §13).


class NoteOut(BaseModel):
    id: str
    vault_id: str
    path: str
    frontmatter: dict | None
    content: str
    created_at: str
    updated_at: str
    deleted_at: str | None


class NoteListItem(BaseModel):
    id: str
    vault_id: str
    path: str
    created_at: str
    updated_at: str
    deleted_at: str | None
    etag: str


class NotePage(BaseModel):
    items: list[NoteListItem]
    next_cursor: str | None


# --- Notas vía REST (historia 0014-acceso-agentes-notas, H-004.2: escritura) ---
# `path`/`content`/`frontmatter` no llevan restricciones nativas de pydantic (a diferencia de
# `VaultName`/`VaultTags`): su forma la decide `core/note_rules.py` (`check_path`,
# `check_content`, `check_frontmatter`), el mismo código que valida el push de `/sync` (C-5,
# C-10) — duplicar la regla aquí (p. ej. un `max_length`) daría dos vocabularios de rechazo
# para el mismo campo. El tipo de pydantic (str/dict) sólo descarta la forma JSON más básica
# (p. ej. un número donde se espera texto), que las reglas también rechazan igual.


class NoteCreate(BaseModel):
    """Cuerpo de `POST /vaults/{vault_id}/notes`; cualquier otro campo → 422 (C-5, mismo
    vocabulario `validation-error:<campo>` que `core/schemas.py` ya usa para bóvedas).

    `frontmatter` ausente o `null` son equivalentes (sin frontmatter): el servicio escribe el
    documento **sin la clave** en los dos casos, nunca con `frontmatter: null` (contrato
    `note.schema.json` de SPEC-0008, el mismo que valida el push: una clave presente con
    `null` la rechazaría `check_frontmatter`, C-10). `null` nunca pasa por esa regla porque el
    documento que persiste el servicio no llega a tener esa forma.
    """

    model_config = ConfigDict(extra="forbid")

    path: str
    content: str
    frontmatter: dict | None = None


class NoteUpdate(BaseModel):
    """Cuerpo de `PATCH /vaults/{vault_id}/notes/{note_id}`: se aplican sólo los campos
    enviados (`model_dump(exclude_unset=True)`, mismo patrón que `VaultUpdate`).

    `path` y `content` no admiten `null` (su tipo no es anulable): "ausente" se distingue de
    un `null` explícito, que da 422. `frontmatter: null` sí vale: borra el campo (como
    `description` en `VaultUpdate`).
    """

    model_config = ConfigDict(extra="forbid")

    path: str = None  # type: ignore[assignment]
    content: str = None  # type: ignore[assignment]
    frontmatter: dict | None = None


# --- API keys de agente (SPEC-0013) ---

AgentKeyLabel = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)
]


class AgentKeyCreate(BaseModel):
    """Cuerpo de `POST /auth/agent-keys`; cualquier otro campo → 422."""

    model_config = ConfigDict(extra="forbid")

    label: AgentKeyLabel


class AgentKeyCreated(BaseModel):
    """Respuesta de la creación: el valor plano (`key`) viaja **sólo aquí** (RF-001)."""

    id: str
    label: str
    key: str
    created_at: datetime


class AgentKeyOut(BaseModel):
    """Elemento del listado: sin `key` ni `key_hash` (RF-004/RNF-002)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    label: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


# --- Archivos (H-015) ---


class FileMetaOut(BaseModel):
    """Metadatos de un archivo (respuesta de `POST` y `PATCH /files/{id}`); nunca los bytes."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    vault_id: str
    name: str
    content_type: str
    size: int
    visibility: str
    created_at: datetime


class FileVisibilityUpdate(BaseModel):
    """Cuerpo de `PATCH /files/{id}`; cualquier otro campo → 422 (C-8)."""

    model_config = ConfigDict(extra="forbid")

    visibility: Literal["private", "public"]
