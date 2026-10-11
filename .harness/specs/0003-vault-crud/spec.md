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

> Fase 1 (Specify) **en curso**: elicitación interactiva (`method.md §3`). Tanda 1
> (P1–P6) decidida por el usuario; tanda 2 (casos límite, no funcionales, seguridad)
> abierta en §Marcadores.

## 1. Contexto del dominio
- **Problema:** cada usuario necesita crear y organizar sus propias bóvedas (contenedores
  de documentos) y ningún otro usuario puede verlas ni tocarlas.
- **Límites:** Synapse es un almacén puro: sin IA interna. Los agentes OpenClaw acceden
  vía API con la misma autenticación que un usuario. La identidad viene sólo del token
  (P2) y se comprueba en cada endpoint (P3).
- **Dependencias:**
  - SPEC-0002: sesión por cookie, `get_current_user`, bloqueo con `must_change_password`.
    La base CouchDB `synapse_user_{id}` ya existe desde el alta del usuario.
  - **Feature previa de errores RFC 9457** (número por reservar): manejador global de
    `application/problem+json` para toda la API. 0003 no se implementa antes que ella.
- **Almacenamiento:** cada bóveda es un documento `type: "vault"` dentro de la base
  CouchDB del propio usuario. El aislamiento lo da la base; ninguna consulta cruza bases.

## 2. Alcance
### En alcance
- API: listar (paginado), crear, ver, editar (nombre, descripción, tags), borrar con
  soft delete, listar la papelera y restaurar.
- Control de concurrencia optimista con ETag / `If-Match` (basado en `_rev`).
- Aislamiento: un usuario nunca ve ni modifica las bóvedas de otro (respuesta 404).
- UI: lista de bóvedas, formulario de crear/editar y borrar con confirmación.
### Fuera de alcance
- **Purga automática a los 30 días:** queda como RF-016 (diferido), se implementa en una
  feature aparte junto con la decisión sobre los documentos de la bóveda.
- Documentos dentro de la bóveda (feature de documentos).
- Sincronización PouchDB ↔ CouchDB (0004-sync-offline-first).
- Compartir bóvedas entre usuarios.
- Permisos especiales para agentes OpenClaw (usan la API como cualquier usuario).
- El formato de errores RFC 9457 en sí (feature previa).
- Diagrama de arquitectura (T-003): se hace en paralelo, no bloquea esta feature.

## 3. Modelo de datos y contratos de E/S
| Frontera | Dirección | Tipo | Contrato en `contracts/` |
|---|---|---|---|
| `GET /vaults` (`?limit`, `?cursor`, `?deleted`) | entrada | REST | `openapi.yaml#/paths/~1vaults` |
| `POST /vaults` | entrada | REST | `openapi.yaml#/paths/~1vaults` |
| `GET /vaults/{vault_id}` | entrada | REST | `openapi.yaml#/paths/~1vaults~1{vault_id}` |
| `PATCH /vaults/{vault_id}` (`If-Match`) | entrada | REST | `openapi.yaml#/paths/~1vaults~1{vault_id}` |
| `DELETE /vaults/{vault_id}` (`If-Match`) | entrada | REST | `openapi.yaml#/paths/~1vaults~1{vault_id}` |
| `POST /vaults/{vault_id}/restore` (`If-Match`) | entrada | REST | `openapi.yaml#/paths/~1vaults~1{vault_id}~1restore` |
| Base CouchDB `synapse_user_{id}` | salida | HTTP CouchDB | — (puerto `VaultPort`) |

**Bóveda (respuesta):**

| Campo | Tipo | Regla |
|---|---|---|
| `id` | string | generado por el servidor `[NEEDS CLARIFICATION: P10]` |
| `name` | string | obligatorio, 1–100 caracteres tras quitar espacios a los lados |
| `description` | string \| null | opcional, ≤ 2000 caracteres |
| `tags` | string[] | ≤ 20; cada uno 1–32 caracteres; en minúsculas y sin repetidos |
| `owner_id` | integer | id del dueño, tomado del token |
| `created_at`, `updated_at` | string (RFC 3339, UTC) | los pone el servidor |
| `deleted_at` | string \| null | `null` salvo en la papelera |

- La versión del documento viaja en la cabecera `ETag` (derivada de `_rev`), no en el cuerpo.
- Lista: `{ "items": [Bóveda], "next_cursor": string | null }`; `limit` 1–200 (50 por defecto).
- Errores: `application/problem+json` (RFC 9457) vía la feature previa.

## 4. Criterios de aceptación (EARS)

**Listado y paginación**
- **RF-001** — CUANDO un usuario autenticado pide `GET /vaults` el sistema DEBE devolver
  sólo sus bóvedas con `deleted_at = null`.
- **RF-002** — CUANDO `GET /vaults` recibe `limit` (1–200, 50 si falta) el sistema DEBE
  devolver como máximo `limit` bóvedas y un `next_cursor` opaco que, enviado como
  `cursor`, devuelve la página siguiente sin repetir ni saltar bóvedas; en la última
  página `next_cursor` es `null`.
- **RF-003** — SI `limit` está fuera de 1–200 o `cursor` no es válido ENTONCES el sistema
  DEBE responder 422.

**Crear**
- **RF-004** — CUANDO un usuario autenticado envía `POST /vaults` válido el sistema DEBE
  guardar la bóveda en su base CouchDB con `owner_id` tomado del token y responder 201
  con la bóveda y su `ETag`.
- **RF-005** — SI `name` falta o queda fuera de 1–100 caracteres tras quitar espacios, o
  `description` supera 2000, o hay más de 20 tags, o un tag queda fuera de 1–32
  caracteres, ENTONCES el sistema DEBE responder 422 sin guardar nada.
- **RF-006** — CUANDO se guarda una bóveda el sistema DEBE quitar los espacios a los lados
  de `name` y dejar `tags` en minúsculas y sin repetidos.
- **RF-007** — SI ya existe otra bóveda no borrada del mismo usuario con el mismo `name`
  sin distinguir mayúsculas ENTONCES el sistema DEBE responder 409 sin guardar nada.

**Ver y editar**
- **RF-008** — CUANDO el dueño pide `GET /vaults/{vault_id}` de una bóveda no borrada el
  sistema DEBE responder 200 con la bóveda y su `ETag`.
- **RF-009** — CUANDO el dueño envía `PATCH /vaults/{vault_id}` con `If-Match` igual al
  `ETag` vigente el sistema DEBE actualizar sólo los campos enviados (`name`,
  `description`, `tags`, con las reglas de RF-005…RF-007), renovar `updated_at` y
  responder 200 con la bóveda y el `ETag` nuevo.
- **RF-010** — SI un `PATCH`, `DELETE` o `restore` llega sin `If-Match` ENTONCES el sistema
  DEBE responder 428; SI `If-Match` no coincide con el `ETag` vigente ENTONCES DEBE
  responder 412 sin modificar nada.

**Borrar, papelera y restaurar**
- **RF-011** — CUANDO el dueño envía `DELETE /vaults/{vault_id}` con `If-Match` vigente el
  sistema DEBE poner `deleted_at` con la hora actual, conservar los datos y responder
  204; la bóveda deja de aparecer en `GET /vaults` y en `GET /vaults/{vault_id}`.
- **RF-012** — CUANDO un usuario pide `GET /vaults?deleted=true` el sistema DEBE devolver
  sólo sus bóvedas borradas, con la misma paginación de RF-002.
- **RF-013** — CUANDO el dueño envía `POST /vaults/{vault_id}/restore` sobre una bóveda
  borrada con `If-Match` vigente el sistema DEBE poner `deleted_at = null` y responder
  200 con la bóveda y su `ETag` nuevo.

**Aislamiento y acceso**
- **RF-014** — SI un usuario pide, edita, borra o restaura una bóveda que no existe en su
  propia base (inexistente o de otro usuario) ENTONCES el sistema DEBE responder 404 con
  el mismo cuerpo en ambos casos y sin modificar nada.
- **RF-015** — MIENTRAS el usuario tenga `must_change_password` el sistema DEBE responder
  403 en todos los endpoints de bóvedas; sin sesión válida, 401 (heredado de SPEC-0002).
- **RF-016** — *(diferido a otra feature)* El sistema DEBE eliminar definitivamente las
  bóvedas cuyo `deleted_at` tenga más de 30 días.
- **RF-017** — SI la base CouchDB del usuario no responde ENTONCES el sistema DEBE
  responder 503 sin dejar escrituras a medias.

**UI**
- **RF-018** — CUANDO un usuario autenticado abre la sección de bóvedas el frontend DEBE
  mostrar sus bóvedas (nombre, descripción, tags) y cargar más páginas si hay `next_cursor`.
- **RF-019** — CUANDO el usuario crea o edita una bóveda el frontend DEBE mostrar un
  formulario con nombre, descripción y tags, y mostrar junto al campo el error de un 422
  o el aviso de nombre repetido de un 409.
- **RF-020** — CUANDO el usuario pide borrar una bóveda el frontend DEBE pedir
  confirmación antes de enviar el `DELETE`.

## 5. Casos límite y manejo de errores
- Bóveda inexistente, ajena o ya borrada al pedirla/editarla: 404 (RF-011, RF-014).
- Edición concurrente: 412 (RF-010); el cliente debe volver a leer.
- Almacén caído: 503 (RF-017).
- Creación simultánea con el mismo nombre: `[NEEDS CLARIFICATION: P7]`.
- Restaurar cuando ya existe otra bóveda activa con ese nombre: `[NEEDS CLARIFICATION: P8]`.
- Borrar una ya borrada / restaurar una no borrada: `[NEEDS CLARIFICATION: P8]`.
- Campos desconocidos en el cuerpo (p. ej. `owner_id`): `[NEEDS CLARIFICATION: P11]`.

## 6. Registro de decisiones y descartes
| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| La base CouchDB no se crea en `POST /vaults` | SPEC-0002 ya la crea al dar de alta al usuario; T-002 está desactualizado | Crearla al crear la primera bóveda | — |
| P1 · La bóveda es un documento `type: "vault"` en la base CouchDB del usuario | El aislamiento lo da la base; PouchDB (0004) la replica sin trabajo extra | Fila en PostgreSQL (exige otro camino para sync/offline); índice `by_owner_id` (innecesario con una base por usuario) | — |
| P2 · Nombre único por usuario (sin distinguir mayúsculas, entre no borradas), límites de nombre/descripción/tags, tags normalizados | Evita bóvedas indistinguibles y entradas sin límite | Sin unicidad; tags libres | — |
| P2 · Concurrencia optimista con ETag (`_rev`) y `If-Match` obligatorio | Que nadie pise sin saberlo lo que cambió un agente u otra pestaña | Última escritura gana | — |
| P3 · Papelera y restaurar dentro; purga a 30 días diferida (RF-016) | La purga necesita tarea programada y la decisión sobre documentos que aún no existen | Purga dentro de 0003; papelera sin restaurar | — |
| P4 · Bóveda ajena → 404 | Un 403 confirma que el id existe (filtración) | 403 como decía T-002 | — |
| P5 · RFC 9457 en toda la API en una feature previa | Constitución Art. 6; un solo formato en auth y bóvedas | Mantener `{"detail"}`; RFC 9457 sólo en bóvedas | — |
| P6 · UI incluida; paginación por cursor con `limit` (50, máx. 200) | Prueba manual de la feature; agentes pueden crear muchas bóvedas | Sólo API; lista sin paginar; paginación por offset | — |

## 7. Requisitos no funcionales (RNF)
- `[NEEDS CLARIFICATION: P9 — rendimiento del listado y orden]`

## Marcadores abiertos
- `[NEEDS CLARIFICATION: P7 — unicidad del nombre ante creaciones simultáneas]`
- `[NEEDS CLARIFICATION: P8 — restaurar con nombre ocupado; borrar ya borrada; restaurar no borrada]`
- `[NEEDS CLARIFICATION: P9 — orden del listado y objetivo de rendimiento]`
- `[NEEDS CLARIFICATION: P10 — formato del id]`
- `[NEEDS CLARIFICATION: P11 — campos desconocidos en el cuerpo]`
- `[NEEDS CLARIFICATION: P12 — papelera y restaurar en la UI]`
