---
id: PLAN-0003
tipo: plan
feature: 0003-vault-crud
estado: approved
aprobaciones:
  fase_2: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-11 }
  ajustes_fase_3: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-12 }   # §10, con el GATE 3
  ajustes_fase_4: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-12 }   # §11
  hallazgo_fase_4: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-12 }  # §12
  etag_listados: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-12 }    # §13
actualizado: 2026-10-12
---

# PLAN-0003 · CRUD de bóvedas

> El *cómo* de SPEC-0003, en el patrón por-capas con puertos (ADR-001):
> `routers → services → core/ports ← adapters`.
> **Prerrequisito:** SPEC-0004 (`0004-api-problem-details`, errores RFC 9457) — cumplido:
> `verified` el 2026-10-12 en esta misma rama. Este plan sólo **lanza excepciones de
> dominio**; el formato `application/problem+json` lo pone el traductor de esa feature.
> Ajustes de la Fase 3 a lo que dejó SPEC-0004: §10. Ajustes de la Fase 4: §11, §12 y §13.

## 0. Gates de simplicidad
- [x] Simplicity — CouchDB por HTTP con el `httpx` que ya existe; sin librerías nuevas
  (ni backend ni frontend).
- [x] Anti-Abstraction — un solo puerto nuevo (`VaultPort`), el mismo patrón que
  `CouchDBPort`; el servicio se prueba con un doble del puerto.
- [x] Integration-First — `contracts/openapi.yaml` de 0003 se exporta y versiona antes de
  implementar las rutas (test de deriva).

## 1. Cumplimiento constitucional
| Artículo | Cómo lo respeta este plan |
|---|---|
| Art. 1–2 (patrón) | Rutas finas en `routers/vaults.py`; reglas en `services/vault_service.py`; acceso a CouchDB sólo vía `VaultPort` → `adapters/vault_repository.py`. `services/` no importa de `adapters/`. |
| Art. 3 (testing) | TDD; ≥ 80 % por módulo, objetivo 90 %; integración contra **CouchDB real** (P5); vitest en el frontend. |
| Art. 5 (seguridad) / P2–P3 | La base se deriva **sólo** del `sub` del token (`synapse_user_{sub}`); ningún endpoint acepta `owner_id`/`user_id`; ajena = 404 idéntico a inexistente; `require_password_changed` en todo el router. |
| Art. 6 (contratos/errores) | OpenAPI 3.1 exportado en `contracts/openapi.yaml`; errores RFC 9457 vía la feature previa. |
| Art. 10 (raíz) | La unicidad del nombre se resuelve con una escritura condicional de CouchDB (reserva), no con "comprobar y luego escribir". |
| Art. 11 (docs) | §8. |
| Art. 12 | 3 archivos + `contracts/`. |

## 2. Arquitectura de la feature (por-capas con puertos)

### Núcleo (`core/`)
- **Esquemas** (`core/schemas.py`, pydantic, `extra="forbid"` → RF-023):
  - `VaultCreate { name, description?, tags? }` y `VaultUpdate` (mismos campos, todos
    opcionales; se aplican sólo los enviados — `exclude_unset`). `name: null` o
    `tags: null` → 422; `description: null` borra la descripción.
  - Validadores: `name.strip()` 1–100; `description` ≤ 2000; `tags` ≤ 20, cada uno
    `strip()` 1–32, después minúsculas y sin repetidos conservando el orden (RF-005, RF-006).
  - `VaultOut` y `VaultPage { items, next_cursor }`.
- **Errores de dominio** (`core/errors.py`, catálogo de SPEC-0004): `VaultNotFound`
  (`vault-not-found`, 404), `VaultNameTaken` (`vault-name-taken`, 409),
  `PreconditionRequired` (`precondition-required`, 428), `PreconditionFailed`
  (`precondition-failed`, 412) y `InvalidCursor` (422) — subclase de `ValidationFailed`
  sin `slug` ni `detail` propios, lanzada sin `detail=` y con
  `errors=[{"parameter": "cursor", "detail": "Invalid cursor."}]` de texto fijo (BB-3 de
  la re-verificación 7 de 0004). `StorageUnavailable` (503) ya existe. Los traduce
  `core/problems.py`; las rutas los declaran con `problem_responses`.
- **Puerto** `core/ports/vault_port.py` (`VaultPort`, ABC). Opera sobre una base
  concreta (`db: str`) y sobre documentos con `_rev`:
  - `get(db, doc_id) -> dict | None`
  - `put(db, doc) -> str` (nuevo `_rev`; lanza `RevisionConflict` si `_rev` no coincide o el doc ya existe)
  - `delete(db, doc_id, rev) -> None` (lanza `RevisionConflict`)
  - `list_page(db, deleted: bool, limit: int, after: tuple[str, str] | None) -> list[dict]`
    (orden `created_at` desc, `_id` desc; `after` = clave de la última vista)
  - `RevisionConflict` vive en `core/errors.py` (el servicio no conoce códigos HTTP de CouchDB).
    No es un `DomainError` (no es una entrada del catálogo): el servicio siempre lo captura
    y lo convierte en 409/412; si escapara, sería un 500 genérico.

### Coordinación (`services/vault_service.py`)
`VaultService(port, db_name)` — una instancia por petición, con la base del usuario.

| Método | Pasos | RF |
|---|---|---|
| `list(deleted, limit, cursor)` | decodifica cursor → `list_page(limit+1)` → si sobra uno, `next_cursor` = cursor del último devuelto | RF-001, 002, 003, 012, 024 |
| `create(data, owner_id)` | `id = uuid4()` → `_reserve(name, id)` → `put(vault)`; si falla el `put`, la reserva queda huérfana (§11) | RF-004…007, 021, 022 |
| `get(id)` | `get("vault:{id}")`; inexistente, de otro tipo o borrada → `VaultNotFound` | RF-008, 014 |
| `update(id, data, if_match)` | precondición → si cambia el nombre (sin mayúsculas), `_reserve(nuevo)` → `put` con `_rev` = `if_match` (conflicto → 412; la reserva nueva queda huérfana, §11) → libera la anterior | RF-009, 010, 021, 027 |
| `delete(id, if_match)` | precondición → `deleted_at = now` con `put` → libera la reserva | RF-010, 011, 026, 027 |
| `restore(id, if_match)` | precondición (debe estar borrada; si no, 404) → `_reserve(name)` (ocupado → 409) → `deleted_at = null` con `put` | RF-010, 013, 025, 026 |

**Reserva de nombre** (`_reserve(name, vault_id)`, RF-007/RF-021/RF-027) — documento
`vault-name:{name.lower()}` = `{ type: "vault-name", vault_id, reserved_at }` (`reserved_at` y
el arrendamiento: §12):
1. `put` sin `_rev` (creación). Si CouchDB acepta → reservado.
2. Si choca (`RevisionConflict`): se lee la reserva y la bóveda a la que apunta. Si esa
   bóveda existe, no está borrada y su `name.lower()` coincide, **o la reserva sigue dentro
   de su arrendamiento de 30 s (§12)** → `VaultNameTaken` (409).
   Si no (reserva **huérfana**: un `put` que falló, un borrado o un renombrado que no
   alcanzó a liberarla) → se reasigna con `put` usando el `_rev` leído; si ese `put`
   choca, otra petición ganó → 409.
- Consecuencia: la liberación es "mejor esfuerzo"; una reserva que quede atrás bloquea como
  mucho lo que dura su arrendamiento y luego se detecta como huérfana (§12). Así no hay escrituras a medias que dejen un
  nombre bloqueado (RF-017) sin necesitar transacciones entre documentos.

**Precondición** (`If-Match`, RF-010): ausente → `PreconditionRequired`; el `ETag` es el
`_rev` entre comillas (`"3-abc…"`); si no coincide con el `_rev` actual → `PreconditionFailed`.
Se comprueba al leer y otra vez en el `put` (CouchDB rechaza un `_rev` viejo), así que
una escritura concurrente entre ambos pasos también da 412.

**Cursor** (RF-002/003): base64url de `{"d": deleted, "c": created_at, "i": id}`. Si no
decodifica o su `d` no coincide con el `deleted` pedido → `InvalidCursor` (422).

### Rutas (`routers/vaults.py`)
- `APIRouter(prefix="/vaults", dependencies=[Depends(require_password_changed)])`
  (RF-015: 401 sin sesión, 403 con cambio pendiente).
- Dependencia `get_vault_service(current_user)` → `VaultService(port, f"synapse_user_{current_user.sub}")`.
- `GET /vaults?limit=50&cursor=&deleted=false` · `POST /vaults` (201 + `ETag`) ·
  `GET /vaults/{vault_id}` (200 + `ETag`) · `PATCH /vaults/{vault_id}` (`If-Match`, 200 + `ETag`) ·
  `DELETE /vaults/{vault_id}` (`If-Match`, 204) · `POST /vaults/{vault_id}/restore` (`If-Match`, 200 + `ETag`).
- `vault_id` que no es UUID → 404 (no 422), para que "no existe" se vea siempre igual (RF-014).
- `vault_id` se declara `str` (no `UUID`) para que pydantic no responda 422; el servicio
  lo valida y lanza `VaultNotFound`. `If-Match` se declara opcional (`Header(None)`) para
  que su ausencia sea 428 y no un 422 de pydantic.
- `main.py`: sólo `include_router` (los manejadores ya los instala SPEC-0004).

### Fronteras de salida
| Frontera | Para qué | Implementación concreta |
|---|---|---|
| CouchDB, base `synapse_user_{id}` | documentos `vault:{uuid}` y `vault-name:{nombre}` | `adapters/vault_repository.py` (`httpx`; 201/200 = ok, 409 = `RevisionConflict`, 404 = `None`, error de red o 5xx = `StorageUnavailable`) |
| CouchDB, vista `_design/vaults/_view/by_created` | listado paginado y ordenado | misma clase; ver §3 |

### Frontend (`frontend/src/`)
- `api/auth.ts`: se exporta `request` (hoy privado) para reutilizar la renovación de
  sesión; sin otros cambios.
- `api/vaults.ts`: `listVaults({deleted, cursor})`, `createVault`, `updateVault(id, data, etag)`,
  `deleteVault(id, etag)`, `restoreVault(id, etag)`; devuelven la bóveda con su `etag`
  (cabecera `ETag`).
- `vaults/VaultListPage.tsx` (RF-018, RF-020): lista, "Cargar más" con `next_cursor`,
  botones editar/borrar, confirmación antes de borrar.
- `vaults/VaultForm.tsx` (RF-019): crear/editar; errores de 422 junto al campo y aviso de
  nombre repetido en 409; ante 412 avisa que la bóveda cambió y recarga.
- `vaults/TrashPage.tsx` (RF-028): borradas con `deleted_at` y "Restaurar"; 409 → aviso de
  nombre ocupado.
- `App.tsx`: rutas `/vaults`, `/vaults/new`, `/vaults/:id/edit`, `/vaults/trash`; `/`
  redirige a `/vaults`. `layout/AppLayout.tsx`: enlaces "Bóvedas" y "Papelera".

## 3. Modelo de datos (CouchDB, base del usuario)
- **Bóveda** `_id: "vault:{uuid}"`:
  `{ type: "vault", name, description, tags, owner_id, created_at, updated_at, deleted_at }`.
  `owner_id` se guarda para los agentes (la base ya define el dueño).
- **Reserva** `_id: "vault-name:{name.lower()}"`: `{ type: "vault-name", vault_id }`.
- **Índice** `_design/vaults`, vista `by_created`:
  `emit([doc.deleted_at ? 1 : 0, doc.created_at], null)` para `type == "vault"`.
  Consulta `descending=true`, `startkey=[d, {}]`, `endkey=[d]`, `include_docs=true`,
  `limit`; con cursor, `startkey=[d, c]`, `startkey_docid="vault:{i}"` (descarte condicional de la primera fila, ver §11).
  CouchDB ordena por clave y luego por `_id`, lo que da exactamente RF-024 y una página
  siguiente sin repetidos ni saltos aunque se creen bóvedas mientras tanto (RNF-001).
- **Creación del índice:** el adaptador hace `PUT _design/vaults` idempotente (409 =
  ya existe) la primera vez que toca cada base en el proceso (memoria por base). Cubre a
  los usuarios ya existentes sin migración ni cambios en el alta de usuarios.
- Sin cambios en PostgreSQL ni migraciones Alembic.

## 4. Contratos
| Archivo en `contracts/` | Frontera | Gate(s) |
|---|---|---|
| `0003-vault-crud/contracts/openapi.yaml` | REST `/vaults/**` | test de deriva (`test_contract.py`); Spectral cuando esté instalado |

`scripts/export_openapi.py` hoy vuelca **toda** la app en el contrato de 0002. Pasa a
**repartir por feature**: cada contrato lleva sólo sus rutas (`/auth`, `/admin`, `/health`
→ 0002; `/vaults` → 0003) y los `components` que esas rutas referencian (recorrido de
`$ref`). Un canon por hecho (Art. 12), y el contrato de 0002 no cambia. `test_contract.py`
compara cada contrato con su parte de la app y comprueba los endpoints de cada spec.

## 5. Estrategia de pruebas (TDD)
| Zona | Qué se prueba | Herramienta |
|---|---|---|
| Núcleo | validación y normalización de esquemas, `extra="forbid"`, cursor | pytest unit |
| Coordinación | reglas de `VaultService` con un doble en memoria de `VaultPort` (que también simula `RevisionConflict`): reserva y huérfanas, 409/412/428/404, restaurar, liberar nombres | pytest + doble |
| Adaptador | `VaultRepository` contra **CouchDB real**: put/get/delete con `_rev`, conflicto, vista y paginación con empates de `created_at`, índice idempotente, 503 con CouchDB inaccesible | pytest integración |
| Rutas | cada endpoint y código del contrato, `ETag`/`If-Match`, 401/403, campos desconocidos, `vault_id` no UUID | pytest + TestClient + CouchDB real |
| Aislamiento | A crea; B lista (no la ve), y `GET`/`PATCH`/`DELETE`/`restore` con el id de A → 404 idéntico al de un id inexistente; la base de A no cambia | `test_vaults_isolation.py` |
| Concurrencia | dos creaciones simultáneas con el mismo nombre → una 201 y una 409 (hilos contra CouchDB real) | pytest integración |
| Rendimiento | 1 000 bóvedas, 50 peticiones de la primera página, p95 < 300 ms (RNF-001) | pytest marcado `perf` |
| Frontend | lista/cargar más, formulario y errores 422/409/412, confirmación de borrado, papelera y restaurar, cliente `vaults.ts` con `ETag` | vitest + Testing Library |

## 6. Secuenciación
1. ~~Re-anclaje previo de 0002~~ — hecho por SPEC-0004 (T-001).
2. Contrato: el reparto por feature ya existe (SPEC-0004 T-002/T-003); falta la feature
   `0003-vault-crud` en `FEATURES` y el test de sus endpoints (rojo) → export.
3. Núcleo: tests de esquemas y cursor (rojo) → `schemas.py`, errores.
4. Adaptador: tests de integración (rojo) → `VaultPort`, `VaultRepository`, vista.
5. Servicio: tests con doble (rojo) → `VaultService`.
6. Rutas: tests de endpoints, aislamiento y concurrencia (rojo) → `routers/vaults.py`, `main.py`; re-export del contrato.
7. Rendimiento (RNF-001).
8. Frontend: tests (rojo) → `api/vaults.ts`, páginas, rutas y enlaces.
9. Tareas `[doc]` de §8.

## 7. Seguimiento de complejidad / riesgos
| Excepción / riesgo | Justificación |
|---|---|
| Reserva de nombre como segundo documento | CouchDB no tiene unicidad; es la única forma de que dos escrituras simultáneas no ganen ambas. Las reservas huérfanas se auto-reparan (§2). |
| Vista map/reduce en lugar de un índice Mango | La paginación por clave exacta (`startkey` + `startkey_docid`) da un cursor estable con empates; con Mango haría falta `$or` sobre `created_at`/`_id`, que no usa bien el índice. Por eso RNF-001 dice ahora "índice de CouchDB" (fe de erratas al spec, ver abajo). |
| 0003 toca archivos de `covers` de 0002 (`App.tsx`, `layout/**`, `api/auth.ts`, `export_openapi.py`) y 0002 cubre `backend/tests/**` entero | Sin re-anclar, el gate marcaría DRIFT en 0002. Se acota `backend/tests/**` de 0002 a sus propios archivos y, al cerrar 0003, se mueve el `anchor_commit` de 0002 con una nota. |
| Test de rendimiento con tiempos | Marcado `perf` y fuera de la corrida por defecto para no volver la suite inestable; se ejecuta en la verificación. |
| Depende de la feature RFC 9457 | Cumplido: SPEC-0004 `verified` (2026-10-12). |

**Fe de erratas al spec (aplicadas junto al GATE 1, confirmadas en el GATE 2):**
`owner_id` es `string` (UUID, como `users.id`), no `integer`; RNF-001 pasa de "índice
Mango sobre …" a "índice de CouchDB" (detalle de implementación, no decisión del usuario).

## 8. Impacto en documentación (Art. 11)
| Documento del mapa | Qué cambia | Acción |
|---|---|---|
| `0003-vault-crud/contracts/openapi.yaml` | endpoints `/vaults/**` | crear (export) |
| `backend/README.md` | sección "Bóvedas (SPEC-0003)", endpoints, `ETag`/`If-Match`, estructura (`vault_service`, `vault_repository`, `vaults.py`), export por feature | actualizar |
| `backend/app/{core/ports,adapters}/README.md` | nuevo puerto y adaptador | actualizar |
| `frontend/src/README.md` | carpeta `vaults/`, `api/vaults.ts`, rutas | actualizar |
| `TAREAS.md` (T-002) | sin crear base en `POST`, 404 en vez de 403, sin índice `by_owner_id`, papelera, `If-Match` | actualizar |
| `ARCHIFY.md` | diagrama de aislamiento (404) y nota de T-003 | actualizar |
| `.harness/memory/state.md` | estado de 0003, residuales | actualizar en el cierre |

## 9. Implementación por requisito

### Implementación de RF-001
`VaultService.list(deleted=False)` → `VaultRepository.list_page` (vista, `d=0`); `GET /vaults`. Tests: `test_vaults_api.py`, `test_vault_repository.py`.
### Implementación de RF-002
Cursor en `vault_service.py` (`limit+1` para saber si hay más); `startkey`/`startkey_docid` y descarte condicional de la primera fila en el adaptador (§11). Tests: paginación completa sin repetidos ni saltos, con empates de `created_at` e inserciones a mitad.
### Implementación de RF-003
`Query(ge=1, le=200)` en la ruta; `InvalidCursor` → 422. Tests: `limit=0`, `limit=201`, cursor basura, cursor de la papelera usado en la lista normal.
### Implementación de RF-004
`VaultService.create` + `POST /vaults` (201, `ETag`, `owner_id = current_user.sub`). Tests: API + documento en la base del usuario.
### Implementación de RF-005
Validadores de `VaultCreate`/`VaultUpdate`. Tests: unit de cada límite (0/1/100/101, 2000/2001, 20/21 tags, tag 0/33) + API 422 sin documento creado.
### Implementación de RF-006
Validadores (strip, minúsculas, sin repetidos). Tests unit + API.
### Implementación de RF-007
`_reserve` (§2). Tests: servicio con doble y API ("Notas" vs "notas" → 409); nombre de una borrada → se permite.
### Implementación de RF-008
`VaultService.get` + `GET /vaults/{id}` con `ETag`. Tests API.
### Implementación de RF-009
`VaultService.update` con `exclude_unset`; `updated_at` renovado; `ETag` nuevo. Tests: sólo cambia lo enviado; `description: null` borra.
### Implementación de RF-010
Precondición en el servicio + `RevisionConflict` del adaptador → 412. Tests: sin `If-Match` → 428; viejo → 412 sin cambios; escritura concurrente entre lectura y `put` (doble) → 412.
### Implementación de RF-011
`VaultService.delete` (`deleted_at`), 204; desaparece de la lista y de `GET`. Tests API.
### Implementación de RF-012
`list(deleted=True)` (vista, `d=1`). Tests API con paginación.
### Implementación de RF-013
`VaultService.restore`. Tests API: vuelve a la lista con `deleted_at = null`.
### Implementación de RF-014
Base derivada del token; `vault_id` no UUID → 404; mismo cuerpo para inexistente y ajena. Tests: `test_vaults_isolation.py` (compara cuerpos y verifica que la base de A no cambió).
### Implementación de RF-015
`dependencies=[Depends(require_password_changed)]` en el router. Tests: sin cookie → 401; usuario con cambio pendiente → 403 en los 6 endpoints.
### Implementación de RF-016
**Diferido** (spec §2): sin implementación en 0003; queda en el backlog de `state.md` como feature aparte.
### Implementación de RF-017
El adaptador traduce errores de red/5xx a `StorageUnavailable` → 503; la reserva huérfana no deja nombres bloqueados. Tests: adaptador apuntando a un puerto cerrado → 503; doble que falla en el `put` de la bóveda tras reservar → sin bóveda y el nombre sigue libre.
### Implementación de RF-018
`VaultListPage.tsx` + `listVaults`. Tests vitest: muestra nombre/descripción/tags y "Cargar más" pide con `cursor`.
### Implementación de RF-019
`VaultForm.tsx`. Tests vitest: 422 junto al campo, 409 aviso de nombre, 412 aviso y recarga.
### Implementación de RF-020
Confirmación en `VaultListPage.tsx` antes de `deleteVault`. Tests vitest: cancelar no envía `DELETE`.
### Implementación de RF-021
Reserva por escritura condicional. Tests: servicio (doble con dos reservas intercaladas) e integración con hilos contra CouchDB real → una 201 y una 409; también en renombrado.
### Implementación de RF-022
`uuid4()` en el servicio; `_id = "vault:{id}"`. Test: el `id` devuelto es UUID v4 y el documento existe con ese `_id`.
### Implementación de RF-023
`extra="forbid"` en `VaultCreate`/`VaultUpdate`. Tests: `owner_id`, `id`, `deleted_at` en el cuerpo → 422 sin cambios.
### Implementación de RF-024
Clave de la vista `[d, created_at]` con `descending=true` (empate por `_id`). Test de integración con varias bóvedas de igual `created_at`.
### Implementación de RF-025
`restore` → `_reserve` → 409. Test API: borrar A, crear B con el mismo nombre, restaurar A → 409 y A sigue borrada.
### Implementación de RF-026
`delete` sobre borrada y `restore` sobre activa → `VaultNotFound`. Tests API.
### Implementación de RF-027
Liberar la reserva en `delete` y en el renombrado; huérfanas reasignables. Tests: borrar y crear otra con el mismo nombre → 201; renombrar y crear con el nombre viejo → 201.
### Implementación de RF-028
`TrashPage.tsx` + `restoreVault`. Tests vitest: lista con `deleted_at`, "Restaurar" llama con `ETag`, 409 → aviso.
### Implementación de RNF-001
Vista `by_created` + `test_vaults_perf.py` (marca `perf`): 1 000 bóvedas, p95 de 50 lecturas de la primera página < 300 ms contra CouchDB real.

`covers` de `spec.md` (se fija en este plan): `backend/app/routers/vaults.py`,
`backend/app/services/vault_service.py`, `backend/app/core/ports/vault_port.py`,
`backend/app/adapters/vault_repository.py`, `backend/tests/test_vault*.py`,
`frontend/src/vaults/**`, `frontend/src/api/vaults.ts`,
`.harness/specs/0003-vault-crud/contracts/**`, `.harness/specs/0003-vault-crud/diagrams/**`.
Archivos compartidos que 0003 modifica: los que ya cubre 0002 (`core/schemas.py`,
`App.tsx`, `layout/**`, `api/auth.ts`, `export_openapi.py`, `test_contract.py`) se quedan en
0002 y se re-anclan al cierre (§7); `core/errors.py` y `main.py` no los cubre ninguna spec
y siguen sin dueño (transversales).

## 10. Ajustes de la Fase 3 tras SPEC-0004 (2026-10-12)
Al escribir `tasks.md`, el plan se alinea con lo que SPEC-0004 dejó implementado; ninguna
decisión del spec cambia:
- Errores: cuatro entradas nuevas del catálogo (§2) e `InvalidCursor` ⊂ `ValidationFailed`
  (BB-3, aprobado por el usuario en el cierre de 0004). Nada se mapea en `main.py`.
- Validación de esquemas con restricciones nativas de pydantic (`StringConstraints` con
  `strip_whitespace`, `min_length`, `max_length`; `max_length` en la lista de tags): sus
  mensajes los regenera el traductor con los límites del esquema (RF-011 de 0004); la
  deduplicación de tags es una normalización, no un error. En `VaultUpdate`, `name` y
  `tags` tienen tipo no anulable con valor por defecto sin validar: si faltan no se
  aplican; si llegan como `null`, 422.
- Rutas: cada operación declara sus errores con `problem_responses` (lo exige
  `ContractGuard` en toda la suite) más `SESSION_ERRORS` y `PasswordChangeRequired` en el
  router.
- Contrato: sólo se añade `"0003-vault-crud": {"paths": ("/vaults",)}` a `FEATURES`.
- Frontend: los `type` de bóvedas (`vault-name-taken`, `precondition-failed`) se declaran en
  `api/vaults.ts` (cubierto por 0003), no en `problems.ts` (cubierto por 0004); se usa
  `ApiError` de `problems.ts`.
- Re-anclaje al cierre (§7): 0003 modifica archivos de `covers` de 0002 (`core/schemas.py`,
  `App.tsx`, `layout/**`, `api/auth.ts`, `export_openapi.py`, `test_contract.py`, `conftest.py`); al cerrar
  se mueve el ancla de 0002 con una nota.

## 11. Ajustes de la Fase 4 (implementación)
Aprobados por el usuario el 2026-10-12.
- Paginación (§3, T-015): en lugar de `skip=1` fijo, el adaptador pide `limit + 1` desde
  `startkey=[d, c]`/`startkey_docid` y descarta la primera fila **sólo si es** la bóveda del
  cursor. Con `skip=1`, si esa bóveda salió de la lista entre páginas (papelera,
  restaurada, borrada), la primera fila ya es la siguiente y se saltaba: un salto que
  RF-012 prohíbe. Mismo orden, misma consulta y mismo cursor; ninguna decisión del spec
  cambia. Lo cubre `test_rf_012_after_key_still_works_when_that_vault_left_the_list`.
- `VaultRepository` acepta un `transport` de httpx sólo para simular 5xx en tests; en
  producción no se pasa.
- Liberación de reservas (§2, T-018/T-020): sólo tras una escritura **confirmada** que deja
  el nombre sin usar (borrado o renombrado), y sólo si la reserva ya no la usa ninguna
  bóveda activa con ese nombre. Si el `put` de la bóveda falla al crear, o choca al
  renombrar, la reserva no se libera: queda huérfana y se reasigna. Liberarla podía dejar
  un nombre repetido (un error de red que oculta un `put` que sí entró, o dos renombrados
  intercalados de la misma bóveda hacia el mismo nombre). La regla de §2 ("una huérfana
  no bloquea nada") ya garantiza RF-017; ninguna decisión del spec cambia.
- `VaultService` recibe un reloj (`clock`) para que los tests fijen `created_at` y
  `updated_at`; devuelve `Versioned(vault, etag)` para que la ruta ponga el `ETag`.

## 12. Hallazgo de la Fase 4: carrera en la reserva de nombre
Detectado el 2026-10-12 por `test_vaults_concurrency.py` (T-029) contra CouchDB real.
**Aprobado por el usuario el 2026-10-12**; sustituye la regla de huérfanas de §2/§11.

- **Fallo (viola RF-021).** `_reserve` escribe la reserva *antes* que la bóveda (al crear) o
  antes de cambiarle el nombre (al renombrar/restaurar). En esa ventana la reserva apunta a
  una bóveda que no existe o que aún no se llama así; una petición simultánea la juzga
  huérfana, la reasigna y **las dos ganan** (dos 201, o dos 200). Reproducido de forma
  determinista con el doble en memoria: `before_next_put` lanza un segundo `create` justo
  antes del `put` de la bóveda del primero.
- **Causa raíz.** Con sólo el estado de la bóveda no se distingue una reserva *en curso* de
  una cuya escritura *falló*: ambas apuntan a una bóveda que no la usa.
- **Propuesta: arrendamiento (lease).** La reserva guarda `reserved_at` (el `clock` del
  servicio). Si su bóveda no la usa, la reserva **sigue bloqueando** mientras sea más
  reciente que `RESERVATION_LEASE = 30 s` (más de 3× el timeout de 10 s del adaptador, así
  que cubre cualquier escritura en curso); pasado ese plazo es huérfana y se reasigna como
  hoy. La liberación (§11) no cambia.
- **Alternativa descartada:** escribir primero la bóveda y compensar si la reserva falla. La
  perdedora sería visible en listados y una compensación fallida dejaría el nombre repetido.
- **Liberación sólo de la reserva propia (detalle de implementación de esta misma
  corrección).** `_release(name, vault_id)` borra la reserva sólo si sigue apuntando a la
  bóveda que libera. Si otra bóveda ya la reasignó (vencido el arrendamiento), su escritura
  puede estar en curso: borrarla dejaría el nombre sin reserva. Sin efecto visible fuera de
  esa carrera. Lo cubre `test_rf_021_late_release_keeps_a_reservation_taken_by_another_vault`.
- **Impacto observable:** tras una escritura fallida el nombre queda bloqueado (409) hasta
  30 s en lugar de quedar libre al instante. El spec no cambia (RF-017 es el 503 y sigue
  igual; RF-021 pasa a cumplirse). El test de RF-017 del servicio avanza el reloj más allá
  del arrendamiento; tests nuevos: crear/renombrar mientras la reserva ajena está vigente →
  409; huérfana vencida → se reasigna.

## 13. Hallazgo de la Fase 4: los listados no dan el `ETag` (APROBADO el 2026-10-12)
Detectado el 2026-10-12 al empezar el bloque G (frontend). Cambia una decisión del spec
(§3: "la versión viaja en la cabecera `ETag`, no en el cuerpo"), así que fue por carril SDD;
aprobado por el usuario el 2026-10-12 junto con la enmienda del spec.

- **Fallo.** `restore` exige `If-Match` (RF-010), pero un cliente no puede conocer el `ETag`
  de una bóveda borrada: el listado de la papelera no lo trae y `GET /vaults/{id}` de una
  borrada da 404 (RF-011). La vista "Papelera" (RF-028) no puede restaurar nada. Borrar desde
  la lista (RF-020) tampoco tiene `ETag` sin un `GET` previo por bóveda. Los tests de API lo
  ocultaban porque leen el `_rev` directamente de CouchDB.
- **Propuesta.** Cada elemento de `VaultPage.items` lleva `etag` (el mismo valor que la
  cabecera `ETag` de esa bóveda). Esquema `VaultListItem(VaultOut)` con `etag: str`, que el
  servicio construye desde `_rev`; las respuestas de una sola bóveda no cambian (sólo
  cabecera). Spec: §3 añade "salvo en los listados, donde cada elemento lleva su `etag`" y
  RF-001/RF-012 lo mencionan. Contrato de 0003 re-exportado.
- **Alternativas descartadas:** `GET /vaults/{id}?deleted=true` (más superficie y dos
  peticiones por acción); `restore` sin `If-Match` (contradice RF-010 y P2); `ETag` en la
  respuesta del `DELETE` (sólo sirve para deshacer al momento, no para la papelera tras
  recargar).
- **Impacto:** tests de API que lean el `etag` del listado en lugar de CouchDB; tests del
  servicio para `etag` en `list`; `api/vaults.ts` lo expone en cada bóveda.
