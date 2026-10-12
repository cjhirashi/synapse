# backend/app/core/

Configuración global, seguridad, logger y puertos (interfaces abstractas).

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
- Sólo `errors.py` y `problems.py` pueden importar `pydantic_core` o usar `ValidationError`
  (`from_exception_data`, `InitErrorDetails`): un error construido a mano con un tipo
  conocido haría que el traductor publicara su `ctx` (lo comprueba `test_problem_catalog.py`).

## Subdirectorios

- `ports/` — Protocols de Python que definen las interfaces que `services/` consume
