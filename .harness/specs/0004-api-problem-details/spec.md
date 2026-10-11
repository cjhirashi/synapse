---
id: SPEC-0004
tipo: spec
feature: 0004-api-problem-details
estado: draft
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: c8c9e24   # base al abrir la spec (aún sin código propio)
anchor_mode: advisory
covers:
  - backend/app/core/problems.py
  - backend/tests/test_problem*.py
  - .harness/specs/0004-api-problem-details/contracts/**
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: pendiente
  fase_2: pendiente
actualizado: 2026-10-11
---

# SPEC-0004 · Errores de la API con Problem Details (RFC 9457)

> Fase 1 (Specify) **en curso**: elicitación interactiva (`method.md §3`). Borrador a
> partir de la Constitución Art. 6 y de la decisión P5 de SPEC-0003. Lo que aún no ha
> decidido el usuario está marcado `[NEEDS CLARIFICATION]`.

## 1. Contexto del dominio
- **Problema:** la API responde los errores con el `{"detail": ...}` de FastAPI, cada
  uno distinto, y la Constitución (Art. 6) exige Problem Details (RFC 9457); los
  clientes (frontend y agentes OpenClaw) necesitan un formato único y un identificador
  estable del tipo de error para decidir qué hacer.
- **Límites:** formato de las respuestas de error de **toda** la API REST del backend.
  No cambia qué endpoints existen ni qué código HTTP devuelve cada caso.
- **Estado actual (brownfield):**
  - `services/auth_service.py` construye y lanza `HTTPException` (la capa de servicio
    conoce HTTP); `core/dependencies.py` y `routers/` también.
  - `main.py` traduce `ProvisioningError` a 503 con `{"detail"}`.
  - Los 422 de validación de pydantic salen con la lista `detail` de FastAPI.
  - `frontend/src/api/auth.ts` lee `body.detail`.
  - El contrato OpenAPI no declara respuestas de error (residual de la verificación de 0002).
- **Consumidor inmediato:** SPEC-0003 (bóvedas) no se implementa hasta que esta feature
  esté mergeada.

## 2. Alcance
### En alcance (borrador)
- Manejador global que convierte **todo** error de la API en `application/problem+json`.
- Migrar los errores existentes de auth y admin al formato nuevo, conservando sus códigos HTTP.
- `[NEEDS CLARIFICATION: Q1 — ¿incluye los errores de FastAPI/Starlette (ruta inexistente, método no permitido, 500 no controlado)?]`
- `[NEEDS CLARIFICATION: Q2 — ¿se sacan las HTTPException de la capa de servicio (errores de dominio)?]`
- `[NEEDS CLARIFICATION: Q5 — respuestas de error en el contrato OpenAPI y lectura en el frontend]`
### Fuera de alcance (borrador)
- Cambiar los códigos HTTP o la lógica de cualquier endpoint.
- Observabilidad (ids de correlación, logging estructurado): Art. 7 sin definir.
- Traducción/internacionalización de mensajes en el backend.

## 3. Modelo de datos y contratos de E/S
| Frontera | Dirección | Tipo | Contrato en `contracts/` |
|---|---|---|---|
| Toda respuesta de error de la API | salida | REST | `openapi.yaml#/components/schemas/Problem` |

**Problem (RFC 9457):**

| Campo | Tipo | Regla |
|---|---|---|
| `type` | string (URI) | `[NEEDS CLARIFICATION: Q3]` |
| `title` | string | resumen corto y estable del tipo |
| `status` | integer | igual al código HTTP de la respuesta |
| `detail` | string | explicación de este caso concreto `[NEEDS CLARIFICATION: Q4 — idioma]` |
| `instance` | string | ruta de la petición |
| `errors` | array | sólo en 422 `[NEEDS CLARIFICATION: Q3]` |

- Cabecera `Content-Type: application/problem+json`.

## 4. Criterios de aceptación (EARS)
> Borrador de lo firme; se completa al cerrar los marcadores.

- **RF-001** — CUANDO un endpoint de la API responde con un código 4xx o 5xx el sistema
  DEBE enviar un cuerpo Problem Details con `Content-Type: application/problem+json`.
- **RF-002** — CUANDO el sistema envía un Problem Details su `status` DEBE ser igual al
  código HTTP de la respuesta.
- **RF-003** — El sistema DEBE conservar los códigos HTTP actuales de cada endpoint de auth
  y admin (sólo cambia el cuerpo).
- **RF-004** — SI un error no está controlado (500) ENTONCES el cuerpo NO DEBE contener
  trazas, mensajes de excepción ni datos internos.

## 5. Casos límite y manejo de errores
- Error lanzado antes del router (dependencias de auth): mismo formato que en el endpoint.
- Respuestas sin cuerpo (204) y cookies que se fijan en una respuesta de error: sin cambios.
- `[NEEDS CLARIFICATION: Q6 — compatibilidad con clientes actuales]`

## 6. Registro de decisiones y descartes
| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| Feature propia, previa a 0003 | Decisión P5 de SPEC-0003: un solo formato en toda la API | RFC 9457 sólo en bóvedas; mantener `{"detail"}` | — |
| Número `0004` para esta feature | Art. 9: el número se reserva al crear el archivo; la sincronización (citada como `0004` en ARCHIFY) tomará el siguiente libre | Saltarse números | — |

## Marcadores abiertos
- `[NEEDS CLARIFICATION: Q1 — errores de FastAPI/Starlette y 500]`
- `[NEEDS CLARIFICATION: Q2 — errores de dominio fuera de los servicios]`
- `[NEEDS CLARIFICATION: Q3 — forma de `type` y de los errores de validación]`
- `[NEEDS CLARIFICATION: Q4 — idioma de `title`/`detail`]`
- `[NEEDS CLARIFICATION: Q5 — contrato OpenAPI y frontend]`
- `[NEEDS CLARIFICATION: Q6 — compatibilidad / versionado]`
