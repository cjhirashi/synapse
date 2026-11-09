import json
import re
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
    # H-030 E5: solo los rellena `get_current_principal` al resolver una API key (la cookie no los lleva).
    agent_id: str | None = None      # agente que identifica la clave; None = clave general o sesión humana
    agent_admin: bool = False
    key_label: str | None = None
    via_key: bool = False            # la petición llegó por API key (no por cookie)
    declared_agent: str | None = None  # `X-Agent-Id` declarado (sin verificar): solo para el modo sombra


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


# --- H-029: Catálogo de atributos (PASO 1) ---
# Las 7 claves generales de notas (no se pueden usar como atributos de bóveda).
_VAULT_RESERVED_KEYS = {"titulo", "descripcion", "ruta", "fecha_creacion", "fecha_actualizacion", "tags"}
_ATTRIBUTE_KEY = re.compile(r"[a-z0-9_]{1,64}")
_ATTRIBUTE_TYPES = ("text", "number", "boolean", "list", "date", "select", "multiselect")


def _validate_attributes_dict(attrs: dict | None) -> dict | None:
    """Valida el diccionario completo de atributos (H-029 PASO 1, RF-001 a RF-004)."""
    if attrs is None:
        return None
    if not isinstance(attrs, dict):
        raise field_error("attributes_invalid_type")
    if len(attrs) > 100:
        raise field_error("attributes_too_many")

    # Validar claves y valores
    for key, val in attrs.items():
        # Validar clave
        if not isinstance(key, str) or not _ATTRIBUTE_KEY.fullmatch(key):
            raise field_error("attribute_key_invalid")
        if key in _VAULT_RESERVED_KEYS:
            raise field_error("attribute_key_reserved")
        # `estado` sí se declara en el catálogo, solo como select: ahí cada bóveda guarda sus estados nuevos.
        if key == "estado" and not (isinstance(val, dict) and val.get("type") == "select"):
            raise field_error("attribute_key_reserved")

        # Validar valor (debe ser dict con "type" y opcionalmente "options")
        if not isinstance(val, dict):
            raise field_error("attribute_value_invalid")
        if "type" not in val:
            raise field_error("attribute_type_missing")

        attr_type = val.get("type")
        if attr_type not in _ATTRIBUTE_TYPES:
            raise field_error("attribute_type_invalid")

        options = val.get("options")
        if options is not None:
            if not isinstance(options, list):
                raise field_error("options_invalid_type")
            if options and attr_type not in ("select", "multiselect"):
                raise field_error("options_not_allowed_for_type")
            if len(options) > 200:
                raise field_error("options_too_many")
            for opt in options:
                if not isinstance(opt, str) or not opt or opt != opt.strip():
                    raise field_error("option_invalid")
                if len(opt) > 64:
                    raise field_error("option_too_long")
            if len(set(options)) != len(options):
                raise field_error("option_duplicate")

    # Tamaño total JSON (UTF-8 sin ASCII, separadores compactos).
    json_bytes = json.dumps(attrs, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(json_bytes) > 64 * 1024:
        raise field_error("attributes_too_large")

    return attrs


VaultAttributes = Annotated[dict | None, AfterValidator(_validate_attributes_dict)]


class VaultCreate(BaseModel):
    """Cuerpo de `POST /vaults`; cualquier otro campo → 422 (RF-023)."""

    model_config = ConfigDict(extra="forbid")

    name: VaultName
    description: VaultDescription | None = None
    tags: VaultTags = Field(default_factory=list)
    icon: VaultIcon | None = None
    attributes: VaultAttributes = None


class VaultUpdate(BaseModel):
    """Cuerpo de `PATCH /vaults/{id}`: se aplican sólo los campos enviados (RF-009).

    `name` y `tags` no admiten `null`: su tipo no es anulable y el valor por defecto `None`
    no se valida (pydantic no valida defaults), así que "ausente" se distingue de un
    `null` explícito, que da 422. `description: null`, `icon: null` y `attributes: null` sí valen: borran el campo.
    Se lee con `model_dump(exclude_unset=True)`.
    """

    model_config = ConfigDict(extra="forbid")

    name: VaultName = None  # type: ignore[assignment]
    description: VaultDescription | None = None
    tags: VaultTags = None  # type: ignore[assignment]
    icon: VaultIcon | None = None
    attributes: VaultAttributes = None


class VaultOut(BaseModel):
    id: str
    name: str
    description: str | None
    tags: list[str]
    icon: str | None
    attributes: dict | None = None
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
    frontmatter: dict | None
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


class FolderMove(BaseModel):
    """Cuerpo de `POST /vaults/{vault_id}/folders/move` (H-039): rutas de carpeta, sin `INDICE.md` ni nombre de archivo."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: str = Field(alias="from", examples=["Proyectos/2025"])
    to: str = Field(examples=["Archivo/Proyectos 2025"])


class WikilinkRewriteOut(BaseModel):
    notes: int
    links: int
    ambiguous: int
    pending: int


class FolderMoveOut(BaseModel):
    """Resultado de mover una carpeta: notas movidas y wikilinks reescritos en la bóveda."""

    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(serialization_alias="from")
    to: str
    moved_notes: int
    rewrite: WikilinkRewriteOut


# --- API keys de agente (SPEC-0013) ---

AgentKeyLabel = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)
]


# H-030 E5: id de agente = identificador corto en minúsculas (el mismo que usa OpenClaw: aira, liza, emma…).
AgentId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,31}$")]


class AgentKeyCreate(BaseModel):
    """Cuerpo de `POST /auth/agent-keys`; cualquier otro campo → 422."""

    model_config = ConfigDict(extra="forbid")

    label: AgentKeyLabel
    # Sin `agent_id` la key es general (comportamiento anterior). `is_admin` solo tiene sentido con agente.
    agent_id: AgentId | None = None
    is_admin: bool = False


class AgentKeyUpdate(BaseModel):
    """Cuerpo de `PATCH /auth/agent-keys/{id}`: reasigna el agente y/o el indicador de administrador."""

    model_config = ConfigDict(extra="forbid")

    agent_id: AgentId | None = None
    is_admin: bool = False


class AgentKeyCreated(BaseModel):
    """Respuesta de la creación: el valor plano (`key`) viaja **sólo aquí** (RF-001)."""

    id: str
    label: str
    key: str
    created_at: datetime
    agent_id: str | None = None
    is_admin: bool = False


class AgentKeyOut(BaseModel):
    """Elemento del listado: sin `key` ni `key_hash` (RF-004/RNF-002)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    label: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None
    agent_id: str | None = None
    is_admin: bool = False


# --- Archivos (H-015) ---


class FileFolderCreate(BaseModel):
    """Cuerpo de `POST /vaults/{vault_id}/file-folders` (H-046): ruta de la carpeta, con `/` entre niveles."""

    model_config = ConfigDict(extra="forbid")

    path: str = Field(examples=["Portafolio/Synapse"])


class FileFolderMove(BaseModel):
    """Cuerpo de `POST /vaults/{vault_id}/file-folders/move` (H-046): mueve la carpeta y todo lo que contiene."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: str = Field(alias="from", examples=["Portafolio/Synapse"])
    to: str = Field(examples=["Archivo/Synapse"])


class FileFoldersOut(BaseModel):
    """Carpetas de archivos de una bóveda: ordenadas e incluyen las ancestras de cada una."""

    folders: list[str]


class FileFolderMoveOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias="from")
    to: str
    moved_files: int


class FileMetaOut(BaseModel):
    """Metadatos de un archivo (respuesta de `POST` y `PATCH /files/{id}`); nunca los bytes."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    vault_id: str
    name: str
    content_type: str
    size: int
    visibility: str
    folder: str | None
    created_at: datetime


class FileVisibilityUpdate(BaseModel):
    """Cuerpo de `PATCH /files/{id}`; cualquier otro campo → 422 (C-8)."""

    model_config = ConfigDict(extra="forbid")

    visibility: Literal["private", "public"]


# --- Registro de agentes por bóveda (H-030 E5) ---

class AgentAccessPut(BaseModel):
    """Cuerpo de `PUT /vaults/{id}/agent-access/{agent_id}`: carpetas con escritura (`*` = toda la bóveda salvo
    las reservadas) y estado del registro."""

    model_config = ConfigDict(extra="forbid")

    carpetas: Annotated[list[Annotated[str, StringConstraints(min_length=1, max_length=300)]], Field(max_length=50)]
    estado: Literal["activo", "suspendido"] = "activo"


class AgentAccessKeyOut(BaseModel):
    label: str
    is_admin: bool


class SkillOut(BaseModel):
    """Una skill de bóveda (H-041 E4): quién la posee, a quién invita y en qué estado está."""

    note_id: str
    path: str
    titulo: str | None
    propietario: str | None  # ausente solo si está archivada
    agentes: list[str]
    estado: str | None


class SkillListOut(BaseModel):
    skills: list[SkillOut]


class SkillAssign(BaseModel):
    """Cuerpo de `POST /vaults/{id}/skills/{note_id}/assign`: el gestor que pasa a ser propietario."""

    model_config = ConfigDict(extra="forbid")

    propietario: Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,31}$")]


class SkillResolution(BaseModel):
    """Qué hacer con una skill de un gestor que sale: `assign` (a `a`, uno de sus invitados), `delete` o `archive`."""

    model_config = ConfigDict(extra="forbid")

    note_id: str
    accion: Literal["assign", "delete", "archive"]
    a: Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,31}$")] | None = None


class AgentLeave(BaseModel):
    """Cuerpo de `POST /vaults/{id}/agent-access/{agent_id}/leave`: quitar o suspender al gestor resolviendo antes
    cada skill de la que es propietario."""

    model_config = ConfigDict(extra="forbid")

    modo: Literal["quitar", "suspender"]
    skills: Annotated[list[SkillResolution], Field(max_length=200)] = []


class AgentLeaveOut(BaseModel):
    asignadas: int
    eliminadas: int
    archivadas: int
    invitaciones_quitadas: int


class AgentAccessEntryOut(BaseModel):
    agent_id: str
    estado: str
    carpetas: list[str]
    note_id: str
    keys: list[AgentAccessKeyOut]  # claves vigentes de ese agente (nombre `op-…`)


class AgentAccessOut(BaseModel):
    mode: str
    agents: list[AgentAccessEntryOut]
    unregistered_keys: list[AgentAccessKeyOut]  # claves con agente que aún no tienen registro en esta bóveda
    unregistered_agent_ids: list[str]


class ShadowCountOut(BaseModel):
    agent_id: str | None
    decision: str
    reason: str | None
    declared: bool
    count: int


class ShadowDenyOut(BaseModel):
    at: datetime
    vault_id: str | None
    agent_id: str | None
    op: str
    paths: list[str]
    reason: str | None


class ShadowReportOut(BaseModel):
    mode: str
    hours: int
    total: int
    counts: list[ShadowCountOut]
    recent_denies: list[ShadowDenyOut]
