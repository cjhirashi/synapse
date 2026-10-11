---
id: SPEC-0003
tipo: spec
feature: 0003-vault-crud
estado: draft
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: c8c9e24   # base al abrir la spec (aún sin código propio)
anchor_mode: advisory
covers:
  - backend/app/routers/vaults.py
  - backend/app/services/vault_service.py
  - backend/app/core/ports/vault_port.py
  - backend/app/adapters/vault_repository.py
  - backend/tests/test_vaults*.py
  - frontend/src/vaults/**
  - frontend/src/api/vaults.ts
  - .harness/specs/0003-vault-crud/diagrams/**
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: pendiente
  fase_2: pendiente
actualizado: 2026-10-11
---

# SPEC-0003 · CRUD de bóvedas

> Fase 1 (Specify) **en curso**: elicitación interactiva (`method.md §3`). Borrador
> armado desde `TAREAS.md` T-002 y lo que ya entregó SPEC-0002. Todo lo que aún no ha
> decidido el usuario está marcado `[NEEDS CLARIFICATION]`.

## 1. Contexto del dominio
- **Problema:** cada usuario necesita crear y organizar sus propias bóvedas (contenedores
  de documentos) y ningún otro usuario puede verlas ni tocarlas.
- **Límites:** Synapse es un almacén puro: sin IA interna. Los agentes OpenClaw acceden
  vía API con la misma autenticación. La identidad viene sólo del token (P2) y se
  comprueba en cada endpoint (P3).
- **Dependencias:** SPEC-0002 (sesión por cookie, `get_current_user`, bloqueo con
  `must_change_password`). La base CouchDB `synapse_user_{id}` **ya se crea al dar de alta
  al usuario** (SPEC-0002), no al crear la primera bóveda como dice T-002.
- **Almacenamiento:** `[NEEDS CLARIFICATION: ¿la bóveda es un documento en la base
  CouchDB del usuario o una fila en PostgreSQL? (P1)]`

## 2. Alcance
### En alcance (borrador)
- Listar, crear, ver, editar (nombre, descripción, tags) y borrar con soft delete las
  bóvedas del usuario autenticado.
- Aislamiento: un usuario nunca ve ni modifica las bóvedas de otro.
- `[NEEDS CLARIFICATION: ¿restaurar desde la papelera y purga a los 30 días entran aquí? (P3)]`
- `[NEEDS CLARIFICATION: ¿la UI de bóvedas (frontend) entra en esta feature? (P6)]`
### Fuera de alcance (borrador)
- Documentos dentro de la bóveda (feature de documentos).
- Sincronización PouchDB ↔ CouchDB (0004-sync-offline-first).
- Compartir bóvedas entre usuarios.
- Permisos especiales para agentes OpenClaw (usan la API como cualquier usuario).
- Diagrama de arquitectura (T-003): se hace en paralelo, no bloquea esta feature.

## 3. Modelo de datos y contratos de E/S
| Frontera | Dirección | Tipo | Contrato en `contracts/` |
|---|---|---|---|
| `GET /vaults` | entrada | REST | `openapi.yaml#/paths/~1vaults` |
| `POST /vaults` | entrada | REST | `openapi.yaml#/paths/~1vaults` |
| `GET /vaults/{vault_id}` | entrada | REST | `openapi.yaml#/paths/~1vaults~1{vault_id}` (propuesto) |
| `PATCH /vaults/{vault_id}` | entrada | REST | `openapi.yaml#/paths/~1vaults~1{vault_id}` |
| `DELETE /vaults/{vault_id}` | entrada | REST | `openapi.yaml#/paths/~1vaults~1{vault_id}` |
| Almacén de bóvedas | salida | `[NEEDS CLARIFICATION: P1]` | — |

**Bóveda (de T-002):** `id`, `name`, `description`, `owner_id`, `tags[]`, `created_at`,
`updated_at`, más `deleted_at` (soft delete).
- `[NEEDS CLARIFICATION: validaciones de nombre (obligatorio, longitud, único por usuario)
  y límites de tags (P2)]`
- `[NEEDS CLARIFICATION: sobre de error RFC 9457 o `{"detail"}` actual (P5)]`

## 4. Criterios de aceptación (EARS)
> Se escriben al cerrar las preguntas de §Marcadores. Borrador de lo que ya es firme:

- **RF-001** — CUANDO un usuario autenticado pide `GET /vaults` el sistema DEBE devolver
  sólo sus bóvedas no borradas.
- **RF-002** — CUANDO un usuario autenticado crea una bóveda válida el sistema DEBE
  guardarla con él como `owner_id` (tomado del token, nunca del cuerpo) y devolverla.
- **RF-003** — SI un usuario pide, edita o borra una bóveda que no es suya ENTONCES el
  sistema DEBE rechazarlo sin modificar nada `[NEEDS CLARIFICATION: 403 o 404 (P4)]`.
- **RF-004** — CUANDO el dueño borra una bóveda el sistema DEBE marcarla con `deleted_at`
  y dejar de listarla, sin borrar sus datos.
- **RF-005** — MIENTRAS el usuario tenga `must_change_password` el sistema DEBE responder
  403 en todos los endpoints de bóvedas (comportamiento heredado de SPEC-0002).

## 5. Casos límite y manejo de errores
- Bóveda inexistente o ya borrada: `[NEEDS CLARIFICATION: P3/P4]`.
- Edición concurrente de la misma bóveda: `[NEEDS CLARIFICATION: ¿última escritura gana
  o control con versión/ETag? (P2)]`.
- Almacén caído: `[NEEDS CLARIFICATION: 503 como en el alta de usuarios]`.

## 6. Registro de decisiones y descartes
| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| La base CouchDB no se crea al crear la primera bóveda | SPEC-0002 ya la crea al dar de alta al usuario; T-002 está desactualizado | Crearla en `POST /vaults` | — |

## Marcadores abiertos
- `[NEEDS CLARIFICATION: P1 — dónde vive la bóveda (CouchDB del usuario vs PostgreSQL)]`
- `[NEEDS CLARIFICATION: P2 — validaciones de nombre/tags y concurrencia]`
- `[NEEDS CLARIFICATION: P3 — papelera: restaurar y purga a 30 días, dentro o fuera]`
- `[NEEDS CLARIFICATION: P4 — 403 vs 404 ante bóveda ajena]`
- `[NEEDS CLARIFICATION: P5 — RFC 9457 vs `{"detail"}`]`
- `[NEEDS CLARIFICATION: P6 — UI de bóvedas y paginación]`
