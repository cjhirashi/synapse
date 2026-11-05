# backend/app/core/

Configuración global, seguridad, logger y puertos (interfaces abstractas).

## Esquemas de bóveda (SPEC-0003, SPEC-0009)

- `schemas.py` — modelos y tipos anotados de la API de bóvedas, canon de sus reglas (el push las
  reutiliza). `VaultIcon` (SPEC-0009) es el texto `glifo[:color]`: 1–64 caracteres, patrón
  `^[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)?$`, sin `strip` ni minúsculas (un espacio
  o una mayúscula es inválido, no «sin normalizar»). Sólo valida la gramática: el catálogo de
  glifos y la paleta viven en el cliente. `VaultCreate.icon` y `VaultUpdate.icon` son
  `VaultIcon | None` (en `PATCH`, ausente conserva y `null` borra); `VaultOut.icon` es
  obligatorio y anulable. Contrato:
  `.harness/specs/0009-rediseno-visual-workspace/contracts/vault-icon.schema.json`.

## Errores (SPEC-0004)

- `errors.py` — catálogo de errores de dominio. Cada subclase de `DomainError` con `slug`
  propio es una entrada: `type` = `urn:synapse:problem:{slug}`, `title`, código y `detail`
  público por defecto. El mensaje con que se construye la excepción es interno: el
  traductor lo registra (5xx en ERROR con traza, 4xx en INFO) y no lo publica. También
  guarda `FIELD_ERROR_MESSAGES` y `field_error`: los únicos textos de validadores propios
  que llegan al cliente (sus códigos nunca coinciden con un tipo de pydantic).
  Servicios y dependencias lanzan estas clases; no saben nada de HTTP.
- `problems.py` — traductor único a Problem Details (RFC 9457). `install_problem_handlers`
  registra los manejadores (dominio, validación de pydantic, errores del framework y no
  controlados, con un 500 de campos fijos más `instance` si el propio traductor falla). Los
  `detail` de cada entrada de un 422 se regeneran desde las plantillas de pydantic con sólo
  las claves seguras de `ctx` (`SAFE_CTX_KEYS`: límites del esquema y recuentos de
  colecciones); los tipos propios, desde `FIELD_ERROR_MESSAGES`; si no se puede,
  `Invalid value.`.
  `problem_responses` e
  `install_problem_openapi` publican los errores en el contrato. Es el único módulo de
  `app/` que importa `HTTPException`.
- Sólo `errors.py` y `problems.py` pueden importar `pydantic_core` o construir errores de
  validación (`ValidationError`, `RequestValidationError`, `InitErrorDetails`,
  `from_exception_data`, también con alias o heredando): un error construido a mano con un
  tipo conocido haría que el traductor publicara su `ctx`. Capturarlos (`except`) sí se
  puede. Lo comprueba `test_problem_catalog.py` por análisis estático: sólo reconoce llamadas
  y herencias por nombre, alias o atributo; cualquier otra referencia (variable, parámetro,
  `functools.partial`, `getattr`, `type()`, tablas) se le escapa (residual aceptado). Las
  validaciones entre campos usan `field_error` en un `model_validator`; las que cruzan path,
  query y cuerpo, una subclase de `ValidationFailed` con `errors=` de texto fijo.
- `ValidationFailed` es la única entrada `validation-error`: todo 422 de dominio hereda de
  ella sin `slug` ni `detail` propios (y se lanza sin `detail=`) y el traductor la usa
  para los 422 de pydantic (RF-005).

## Autenticación y principal (SPEC-0002, SPEC-0013)

- `dependencies.py` — resolución del `current_user`/principal. `get_current_user` es **sólo
  cookie** (JWT `access_token`) e intacta; `get_current_principal` (SPEC-0013) intenta la
  cookie primero y, si no hay, un `Authorization: Bearer <key>` que resuelve vía
  `AgentKeyService` al **mismo** `TokenPayload` del dueño (`sub`/`role`/`ver`, `exp` sintético:
  la caducidad real de una key es su revocación). Ambas comparten `_principal_from_cookie` (no
  se duplica la validación JWT). La superficie de datos (`require_password_changed`, `/vaults`,
  `/sync`) usa el principal; la de cuenta/gestión y admin sigue cookie-only (contención
  estructural, P-4). El camino `Bearer` traduce `OperationalError` del control plane a
  `StorageUnavailable` (503), sólo en esa rama.
- `security.py` — además del hash de contraseñas (Argon2id), el de secretos de alta entropía
  (`_sha256_hex`, compartido por refresh tokens y API keys) y el formato de las API keys de
  agente: `API_KEY_PREFIX` (`syn_ak_`), `generate_api_key`, `hash_api_key`,
  `is_well_formed_api_key` (rechazo barato por forma antes de la BD).
- `models/agent_api_key.py` — `AgentApiKey`, tabla del control plane (migración 005): sólo el
  `key_hash` en reposo, FK a `users`, índice parcial único `(owner_id, label) WHERE revoked_at
  IS NULL` (label único por dueño entre keys vigentes). Esquemas de E/S en `schemas.py`
  (`AgentKeyCreate`/`AgentKeyCreated`/`AgentKeyOut`; `AgentKeyOut` nunca lleva `key`/`key_hash`).

## Notas y tiempo (SPEC-0008)

- `note_rules.py` — reglas puras de las notas, sin E/S: claves del documento
  (`NOTE_KEYS`/`NOTE_REQUIRED`), `check_path`, `check_content`, `check_frontmatter` (devuelven el
  código de rechazo del push o `None`), `normalize_path` y `path_key` (NFKC + `casefold`, igual
  que `name_key` de bóvedas). Topes: ruta 300 puntos de código, `content` 2 MiB y `frontmatter`
  64 KiB. Las usa `services/sync_push.py` y las espeja `frontend/src/notes/noteRules.ts`; ambos
  recorren `tests/fixtures/note_rules_cases.json`.
  Desde SPEC-0010 `check_path` rechaza además un último segmento `.md` (sin distinguir mayúsculas), tras normalizar:
  `X/.md` y `X/ .md` son `validation-error:path` (también `.ｍｄ` en anchos completos: NFKC + casefold). `check_frontmatter` añade un tope de 32 niveles de anidamiento (`FRONTMATTER_MAX_DEPTH`), comprobado de forma iterativa antes de serializar.
- `index_rules.py` — reglas puras de los `INDICE.md` automáticos (H-031), sin E/S: nombre reservado por `path_key`,
  `folder_of`/`index_path_for`/`ancestor_folders`, `changed_keys` y `check_op` (códigos `reserved-name:path`,
  `index-readonly:content|attr|path|delete`, `index-root:delete`). Un INDICE sólo admite editar `descripcion` y se borra
  únicamente con su carpeta; el de la raíz nunca. Las usan `note_content_service.py` y `sync_push.py`; las espeja
  `frontend/src/notes/indexRules.ts` sobre `tests/fixtures/indice_cuerpo.json`.
- `ag_rules.py` — reglas puras de las carpetas reservadas (`AG - SKILLS`, `AG - MENSAJES`, `AG - AGENTES`, `BITACORA`,
  `PLANTILLAS`, H-030): nombres por `path_key`, `check_create`/`check_folder_move`/`check_index_delete`, formato de
  `AG - MENSAJES` (`parse_mensaje_path`, `check_cabecera`, `stamp_cabecera` que sella `cerrada_el`, `check_agent_mensaje_op`
  de inmutabilidad). Códigos `reserved-name:path`, `meta-folder:*`, `ag-mensajes:*`. Las usan REST y `sync_push.py`.
  Desde H-030b `check_create` exige además la forma canónica en MAYÚSCULAS (`meta-folder:case`: `PLANTILLAS`, nunca `Plantillas`) y
  `check_folder_move(from, to)` solo deja pasar `Plantillas` → `PLANTILLAS`.
- `meta_rules.py` — reglas de escritura de las carpetas META con lógica (H-030b), sin E/S: `BITACORA` de solo lectura para todos
  (`bitacora:readonly`), `PLANTILLAS` solo `plantilla-<nombre>.md` planas con definición válida (`plantilla:*`) y, desde H-041, los documentos de
  sistema intocables para todo actor menos el publicador (`check_system_write`: `sistema:readonly`, `sistema:reserved`; `Actor("system")`).
  `system_docs.py` — registro de los documentos de sistema (carga `app/system_docs/manifest.json` y sus `.md`), `content_hash` y `stamp`. `plantilla_rules.py` — nombre, ruta y
  definición (`alcance`, `atributos`, `estilo`) de una plantilla y su alcance por carpeta. `bitacora_rules.py` — qué cambios se
  registran (`classify`: no INDICES ni la propia BITACORA ni cambios solo de `fecha_actualizacion`), día local por zona horaria,
  `day_path` (`BITACORA/AAAA-MM/AAAA-MM-DD.md`) y el texto del día (`render_day`). Las usan REST, `sync_push.py` y `folder_service.py`.
- `agent_access.py` — permisos de escritura de los agentes (H-030 E6), sin E/S: `Actor`, `parse_registration` del registro
  `AG - AGENTES/<id>.md`, `decide`/`decide_files`. `note_prefix.py` — filtro por carpeta del listado (`view_key`, `in_folder`).
- `index_body.py` — cuerpo generado del INDICE (secciones Navegación / Subcarpetas / Documentos con listas: `- [[enlace]] — descripción · Estado · Tags · Actualizado`, sólo las partes con valor; los enlaces escapan el Markdown de la ruta y no se emiten para nombres que el editor no podría reconocer, ver la regla «Enlace» de `tests/fixtures/indice_cuerpo.json`):
  se calcula al leer (`GET` de la nota) y no se guarda; el espejo del cliente es `frontend/src/notes/indexBody.ts`.
- `timestamps.py` — formato único de marca de tiempo (RFC 3339 UTC, ancho fijo) y su
  comprobación; lo comparten bóvedas, notas, reservas y push.

## Atributos, fechas y archivos (H-029, H-015/H-016)

- `attribute_rules.py` — reglas de los atributos META de una nota (claves, etiquetas, estados, fechas
  `AAAA-MM-DD`) y migración de frontmatter antiguo. La especificación compartida vive en
  `tests/fixtures/attribute_rules.json` y la comparte `frontend/src/editor/attributeRules.ts`: ambos pasan los mismos casos.
- `note_dates.py` — `stamp_dates`: fechas de creación y actualización que sella el servidor (día de CDMX) cuando un
  agente escribe por REST.
- `file_safety.py` — funciones puras sobre bytes: tipo por firma (`sniff_content_type`, `resolve_content_type`, que rechaza
  ejecutables y verifica coherencia OOXML/ODF) y saneo de SVG (`is_safe_svg`, mismo criterio RNF-003 que el editor).
- `models/file.py` — `File`, metadatos de un archivo subido a MinIO (migraciones 006 y 007, carpeta opcional).

## Subdirectorios

- `ports/` — Protocols de Python que definen las interfaces que `services/` consume
  (`agent_key_port.py` es el de las API keys de agente, SPEC-0013; `object_storage_port.py`, el del almacén
  de objetos de archivos, H-015/H-016)
