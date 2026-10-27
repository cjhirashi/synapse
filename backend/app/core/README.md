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

## Notas y tiempo (SPEC-0008)

- `note_rules.py` — reglas puras de las notas, sin E/S: claves del documento
  (`NOTE_KEYS`/`NOTE_REQUIRED`), `check_path`, `check_content`, `check_frontmatter` (devuelven el
  código de rechazo del push o `None`), `normalize_path` y `path_key` (NFKC + `casefold`, igual
  que `name_key` de bóvedas). Topes: ruta 300 puntos de código, `content` 2 MiB y `frontmatter`
  64 KiB. Las usa `services/sync_push.py` y las espeja `frontend/src/notes/noteRules.ts`; ambos
  recorren `tests/fixtures/note_rules_cases.json`.
  Desde SPEC-0010 `check_path` rechaza además un último segmento `.md` (sin distinguir mayúsculas), tras normalizar:
  `X/.md` y `X/ .md` son `validation-error:path` (también `.ｍｄ` en anchos completos: NFKC + casefold). `check_frontmatter` añade un tope de 32 niveles de anidamiento (`FRONTMATTER_MAX_DEPTH`), comprobado de forma iterativa antes de serializar.
- `timestamps.py` — formato único de marca de tiempo (RFC 3339 UTC, ancho fijo) y su
  comprobación; lo comparten bóvedas, notas, reservas y push.

## Subdirectorios

- `ports/` — Protocols de Python que definen las interfaces que `services/` consume
