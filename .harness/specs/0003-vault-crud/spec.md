---
id: SPEC-0003
tipo: spec
feature: 0003-vault-crud
estado: verified
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: 0e6c5e5   # re-anclaje por SPEC-0008 (T-092 de TASKS-0008)
anchor_mode: advisory
covers:
  - backend/app/routers/vaults.py
  - backend/app/services/vault_service.py
  - backend/app/core/ports/vault_port.py
  - backend/app/adapters/vault_repository.py
  - backend/tests/test_vault*.py
  - frontend/src/vaults/**
  - .harness/specs/0003-vault-crud/contracts/**
  - .harness/specs/0003-vault-crud/diagrams/**
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-11 }
  fase_2: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-11 }
  fase_3: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-12 }
  enmienda_fase_4: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-12 }   # `etag` en los listados (PLAN-0003 §13)
  enmienda_1: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-13 }   # verificación adversarial (PLAN-0003 §15)
  menores_verificacion_2: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-13 }   # VB-1…VB-5 (T-071…T-075)
  verified: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-13 }
actualizado: 2026-10-13
---

# SPEC-0003 · CRUD de bóvedas

> Fase 1 (Specify) cerrada: co-definida con el usuario (tandas P1–P6 y P7–P12), "así es"
> y GATE 1 aprobados el 2026-10-11. GATE 2 (plan) aprobado el 2026-10-11.
>
> **Enmienda 1 2026-10-13** (verificación adversarial, VA-3/VA-4/VA-5/VA-10): nombres
> equivalentes con NFKC y plegado de mayúsculas Unicode (§3, RF-007, RF-021, RF-025); sin
> caracteres de control en `name` (RF-005); un cursor válido es sólo uno emitido por el
> servidor (RF-003); `vault_id` sólo en forma canónica (RF-014). Aprobada por el usuario;
> el *cómo* en PLAN-0003 §15.
>
> **Re-anclaje 2026-10-13** (PLAN-0005 §7 y P-1, T-083 de TASKS-0005): SPEC-0005
> (sincronización) tocó estos `covers` sin cambiar ningún requisito de esta spec. Las
> pantallas (`VaultListPage`, `VaultForm`, `TrashPage`, `useVaultPages`, `errors.ts`, nuevo
> `fields.ts`) leen y escriben la réplica local (`sync/vaultStore`) en vez de la API REST, y
> siguen cumpliendo RF-018/019/020/028; `api/vaults.ts` y su test se retiraron, por eso salen
> de `covers`. En el backend, `VaultPort.leaves`, `vault_repository.leaves` (`open_revs=all`)
> y `vault_service._holder` consideran todas las ramas de un documento (RF-008 de 0005), con
> sus pruebas en `test_vault_repository.py` y `test_vault_service.py`. La API REST de
> bóvedas no cambia. Ancla movida a `461517f`. Sin cambio de requisitos.

> **Re-anclaje 2026-10-23** (PLAN-0008 P-2 y §13, T-092 de TASKS-0008): SPEC-0008 tocó archivos de
> estos `covers` sin cambiar ningún requisito de esta spec: `vault_service.py` delega la reserva
> `vault-name:*` en `services/reservations.py` (mismo algoritmo, suite de bóvedas sin cambios como
> prueba de no regresión) y `core/timestamps.py` reúne `utc_now`; `VaultListPage.tsx` gana
> "Abrir" (RF-018 de 0008); los estilos de lista pasan a `.card-list`/`.chip-list` (VU-1) sin cambio
> visual (capturas antes/después). Backlog para Carlos: el id `vault-name:{name_key}` no tiene tope
> de longitud (NFKC puede expandir ×18 un nombre de 100 caracteres) — mismo riesgo que H-1 de 0008;
> corregirlo exige migrar las reservas existentes. Sin cambio de requisitos.

## 1. Contexto del dominio
- **Problema:** cada usuario necesita crear y organizar sus propias bóvedas (contenedores
  de documentos) y ningún otro usuario puede verlas ni tocarlas.
- **Límites:** Synapse es un almacén puro: sin IA interna. Los agentes OpenClaw acceden
  vía API con la misma autenticación que un usuario. La identidad viene sólo del token
  (P2) y se comprueba en cada endpoint (P3).
- **Dependencias:**
  - SPEC-0002: sesión por cookie, `get_current_user`, bloqueo con `must_change_password`.
    La base CouchDB `synapse_user_{id}` ya existe desde el alta del usuario.
  - **SPEC-0004 `0004-api-problem-details`** (errores RFC 9457): manejador global de
    `application/problem+json` para toda la API. 0003 no se implementa antes que ella.
- **Almacenamiento:** cada bóveda es un documento `type: "vault"` dentro de la base
  CouchDB del propio usuario. El aislamiento lo da la base; ninguna consulta cruza bases.

## 2. Alcance
### En alcance
- API: listar (paginado), crear, ver, editar (nombre, descripción, tags), borrar con
  soft delete, listar la papelera y restaurar.
- Control de concurrencia optimista con ETag / `If-Match` (basado en `_rev`).
- Aislamiento: un usuario nunca ve ni modifica las bóvedas de otro (respuesta 404).
- UI: lista de bóvedas, formulario de crear/editar, borrar con confirmación y vista
  "Papelera" con restaurar.
### Fuera de alcance
- **Purga automática a los 30 días:** queda como RF-016 (diferido), se implementa en una
  feature aparte junto con la decisión sobre los documentos de la bóveda.
- Documentos dentro de la bóveda (feature de documentos).
- Sincronización PouchDB ↔ CouchDB (feature de sincronización, número por reservar).
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
| `id` | string (UUID v4) | generado por el servidor, en forma canónica (minúsculas con guiones); en CouchDB el documento es `vault:{id}` |
| `name` | string | obligatorio, 1–100 caracteres tras quitar espacios a los lados, sin caracteres de control (categoría Unicode `Cc`) |
| `description` | string \| null | opcional, ≤ 2000 caracteres |
| `tags` | string[] | ≤ 20; cada uno 1–32 caracteres; en minúsculas y sin repetidos |
| `owner_id` | string (UUID) | id del dueño (`users.id`), tomado del token |
| `created_at`, `updated_at` | string (RFC 3339, UTC) | los pone el servidor |
| `deleted_at` | string \| null | `null` salvo en la papelera |

- La versión del documento viaja en la cabecera `ETag` (derivada de `_rev`), no en el cuerpo,
  salvo en los listados: cada elemento lleva su `etag` (mismo valor que la cabecera), porque
  una bóveda borrada no se puede pedir por id y la Papelera lo necesita para restaurar
  (enmienda de la Fase 4, PLAN-0003 §13).
- Lista: `{ "items": [Bóveda + etag], "next_cursor": string | null }`; `limit` 1–200 (50 por
  defecto); orden: `created_at` descendente y, a igual fecha, `id` descendente.
- Cuerpos de `POST`/`PATCH`: sólo `name`, `description`, `tags`; cualquier otro campo → 422.
- **Nombres equivalentes** (enmienda 1): dos nombres son el mismo si coinciden tras
  normalizarlos con NFKC y plegado de mayúsculas Unicode (`casefold`): «Notas»/«NOTAS»,
  «Straße»/«STRASSE», «café» compuesto/descompuesto. Se guarda el nombre tal como llega
  (sin espacios a los lados); la normalización sólo decide la unicidad.
- Unicidad del nombre: documento de reserva `vault-name:{nombre normalizado}` en la misma
  base (detalle de diseño en `plan.md`).
- Errores: `application/problem+json` (RFC 9457) vía la feature previa.

## 4. Criterios de aceptación (EARS)

**Listado y paginación**
- **RF-001** — CUANDO un usuario autenticado pide `GET /vaults` el sistema DEBE devolver
  sólo sus bóvedas con `deleted_at = null`, cada una con su `etag`.
- **RF-002** — CUANDO `GET /vaults` recibe `limit` (1–200, 50 si falta) el sistema DEBE
  devolver como máximo `limit` bóvedas y un `next_cursor` opaco que, enviado como
  `cursor`, devuelve la página siguiente sin repetir ni saltar bóvedas; en la última
  página `next_cursor` es `null`.
- **RF-024** — El sistema DEBE ordenar las bóvedas de `GET /vaults` por `created_at`
  descendente y, a igual `created_at`, por `id` descendente.
- **RF-003** — SI `limit` está fuera de 1–200 o `cursor` no es válido (cualquier valor
  distinto de un `next_cursor` que el servidor emitió para esa lista) ENTONCES el sistema
  DEBE responder 422.

**Crear**
- **RF-004** — CUANDO un usuario autenticado envía `POST /vaults` válido el sistema DEBE
  guardar la bóveda en su base CouchDB con `owner_id` tomado del token y responder 201
  con la bóveda y su `ETag`.
- **RF-005** — SI `name` falta, queda fuera de 1–100 caracteres tras quitar espacios o
  contiene caracteres de control (`Cc`), o `description` supera 2000, o hay más de 20 tags, o un tag queda fuera de 1–32
  caracteres, ENTONCES el sistema DEBE responder 422 sin guardar nada.
- **RF-006** — CUANDO se guarda una bóveda el sistema DEBE quitar los espacios a los lados
  de `name` y dejar `tags` en minúsculas y sin repetidos.
- **RF-007** — SI ya existe otra bóveda no borrada del mismo usuario con un `name`
  equivalente (§3) ENTONCES el sistema DEBE responder 409 sin guardar nada.
- **RF-021** — CUANDO dos peticiones simultáneas crean o renombran bóvedas del mismo
  usuario con nombres equivalentes (§3) el sistema DEBE guardar sólo una y responder 409
  a la otra; en ningún orden de peticiones pueden quedar dos bóvedas activas con nombres
  equivalentes.
- **RF-022** — CUANDO se crea una bóveda el sistema DEBE asignarle un `id` UUID v4
  generado por el servidor.
- **RF-023** — SI el cuerpo de `POST` o `PATCH` trae un campo distinto de `name`,
  `description` o `tags` (p. ej. `owner_id`, `id`, `deleted_at`) ENTONCES el sistema DEBE
  responder 422 sin guardar nada.

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
  sólo sus bóvedas borradas, cada una con su `etag`, con la misma paginación de RF-002.
- **RF-013** — CUANDO el dueño envía `POST /vaults/{vault_id}/restore` sobre una bóveda
  borrada con `If-Match` vigente el sistema DEBE poner `deleted_at = null` y responder
  200 con la bóveda y su `ETag` nuevo.
- **RF-025** — SI al restaurar ya existe otra bóveda no borrada del usuario con un `name`
  equivalente (§3) ENTONCES el sistema DEBE responder 409 sin modificar
  nada.
- **RF-026** — SI se pide `DELETE` sobre una bóveda ya borrada, o `restore` sobre una no
  borrada, ENTONCES el sistema DEBE responder 404 sin modificar nada.
- **RF-027** — CUANDO se borra una bóveda su nombre DEBE quedar libre para otra bóveda del
  mismo usuario; CUANDO se renombra, el nombre anterior DEBE quedar libre.

**Aislamiento y acceso**
- **RF-014** — SI un usuario pide, edita, borra o restaura una bóveda que no existe en su
  propia base (inexistente, de otro usuario o con un `vault_id` que no es un UUID en forma
  canónica) ENTONCES el sistema DEBE responder 404 con el mismo cuerpo en todos los casos
  y sin modificar nada.
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
- **RF-028** — CUANDO el usuario abre la vista "Papelera" el frontend DEBE listar sus
  bóvedas borradas con su `deleted_at` y un botón "Restaurar"; un 409 al restaurar DEBE
  mostrarse como aviso de nombre ocupado.

## 5. Casos límite y manejo de errores
- Bóveda inexistente, ajena o ya borrada al pedirla/editarla: 404 (RF-011, RF-014).
- Edición concurrente: 412 (RF-010); el cliente debe volver a leer.
- Almacén caído: 503 (RF-017).
- Creación o renombrado simultáneo con el mismo nombre: sólo uno gana, 409 al otro (RF-021).
- Restaurar con el nombre ocupado por otra bóveda activa: 409 (RF-025).
- Borrar una ya borrada / restaurar una no borrada: 404 (RF-026).
- Campos desconocidos en el cuerpo (p. ej. `owner_id`): 422 (RF-023).
- Nombre con caracteres de control (p. ej. NUL): 422 (RF-005).
- «Straße» con «STRASSE» activa, o «café» descompuesto con «café» compuesto: 409 (RF-007).
- Cursor alterado, con datos añadidos o fabricado a mano: 422 (RF-003).
- `vault_id` en mayúsculas, sin guiones, entre llaves o como `urn:uuid:`: 404 (RF-014).
- Bóvedas creadas mientras se pagina: el orden por `created_at`/`id` mantiene el cursor
  estable (RF-002, RF-024).

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
| P7 · Unicidad del nombre con un documento de reserva `vault-name:{minúsculas}` (la clave pasa a NFKC + `casefold` con E1) | CouchDB no tiene restricciones únicas; el conflicto de escritura deja un solo ganador | Comprobar y luego escribir (admite duplicados raros) | — |
| P8 · Restaurar con nombre ocupado → 409; borrar ya borrada / restaurar no borrada → 404 | Coherente con la vista normal y la papelera; nunca se pierde una bóveda por restaurar | Renombrar solo al restaurar; 409 o 204 idempotente | — |
| P9 · Orden por `created_at` desc + `id`; p95 < 300 ms (RNF-001) | Lo más reciente primero y cursor estable | Orden alfabético; sin objetivo de rendimiento | — |
| P10 · `id` UUID v4 del servidor (`vault:{uuid}` en CouchDB) | No adivinable ni enumerable; prefijo listo para otros tipos de documento | Id del cliente; slug del nombre | — |
| P11 · Campos desconocidos → 422 | Hace visibles errores de clientes y agentes; `owner_id` nunca viene de fuera | Ignorarlos en silencio | — |
| P12 · Vista "Papelera" con restaurar en la UI | La API ya lo soporta; sin ella sólo se restaura por API | Papelera sólo por API | — |
| E1 · Nombres equivalentes con NFKC + `casefold` (VA-4, enmienda 1) | `lower()` deja convivir nombres que el usuario ve iguales («Straße»/«STRASSE», «café» NFC/NFD) | Sólo `lower()`; guardar el nombre ya normalizado (cambiaría lo que escribió el usuario) | — |
| E2 · Sin caracteres de control en `name` (VA-10, enmienda 1) | Un NUL o un salto de línea en un nombre es invisible o rompe la UI y los agentes | Aceptarlos; quitarlos en silencio | — |

## 7. Requisitos no funcionales (RNF)
- **RNF-001** — `GET /vaults` con `limit=50` DEBE responder en p95 < 300 ms con 1 000
  bóvedas en la base del usuario, apoyado en un índice de CouchDB (sin recorrer la base
  completa).

## Marcadores abiertos
- Ninguno.
