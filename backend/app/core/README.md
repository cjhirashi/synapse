# backend/app/core/

Configuración global, seguridad, logger y puertos (interfaces abstractas).

## Errores (SPEC-0004)

- `errors.py` — catálogo de errores de dominio. Cada subclase de `DomainError` con `slug`
  propio es una entrada: `type` = `urn:synapse:problem:{slug}`, `title`, código y `detail`
  público por defecto. El mensaje con que se construye la excepción es interno (log).
  Servicios y dependencias lanzan estas clases; no saben nada de HTTP.
- `problems.py` — traductor único a Problem Details (RFC 9457). `install_problem_handlers`
  registra los manejadores (dominio, validación de pydantic, errores del framework y no
  controlados, con un 500 constante si el propio traductor falla). `problem_responses` e
  `install_problem_openapi` publican los errores en el contrato. Es el único módulo de
  `app/` que importa `HTTPException`.

## Subdirectorios

- `ports/` — Protocols de Python que definen las interfaces que `services/` consume
