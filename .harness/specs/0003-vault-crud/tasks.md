---
id: TASKS-0003
tipo: tasks
feature: 0003-vault-crud
estado: approved
aprobaciones:
  fase_3: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-12 }
actualizado: 2026-10-12
---

# TASKS-0003 · CRUD de bóvedas

## Reglas
- Cada tarea: ≤ 30 min, un solo propósito, `(cubre RF-NNN)`, zona del patrón (o `[doc]`).
- Orden por dependencias (PLAN-0003 §6, ajustado en §10). **Test antes que código.**
- Cada fila de `plan.md §8` → una tarea `[doc]`.
- Errores con el catálogo de SPEC-0004: ninguna `HTTPException`, todo 422 de dominio hereda
  de `ValidationFailed`, cada ruta declara sus errores con `problem_responses`
  (`ContractGuard` lo exige en toda la suite).
- Los tests nuevos viven en `backend/tests/test_vault*.py` (cubiertos por 0003); no se
  tocan los `test_problem*.py` de SPEC-0004 (`verified`): sus barridos genéricos del
  catálogo ya aplican a las clases nuevas.

## Tareas
### A · Contrato (PLAN-0003 §4)
- [x] T-001 — test (rojo) en `test_contract.py`: el contrato de `0003-vault-crud` documenta los 6 endpoints de SPEC-0003 §3 (`GET`/`POST /vaults`, `GET`/`PATCH`/`DELETE /vaults/{vault_id}`, `POST /vaults/{vault_id}/restore`) (cubre RF-001, RF-004, RF-008, RF-009, RF-011, RF-013) [zona: test]
- [x] T-002 — `scripts/export_openapi.py`: `"0003-vault-crud": {"paths": ("/vaults",), "schemas": ()}` en `FEATURES` (cubre RF-001, RF-004) [zona: script]

### B · Núcleo: esquemas, errores y cursor
- [x] T-003 — test (rojo) `test_vault_schemas.py`: límites de `VaultCreate` — `name` 0/1/100/101 tras quitar espacios y sólo espacios; `description` 2000/2001; 20/21 tags; tag 0/33 (cubre RF-005) [zona: test]
- [x] T-004 — test (rojo) `test_vault_schemas.py`: normalización (`name` sin espacios a los lados; tags en minúsculas, sin repetidos, orden conservado); `extra="forbid"` con `owner_id`, `id`, `deleted_at`; `VaultUpdate` — campos ausentes no se marcan como enviados, `name: null`/`tags: null` → error, `description: null` válido (cubre RF-006, RF-009, RF-023) [zona: test]
- [x] T-005 — `core/schemas.py`: `VaultCreate`, `VaultUpdate`, `VaultOut`, `VaultPage` con restricciones nativas de pydantic (PLAN-0003 §10) (cubre RF-005, RF-006, RF-009, RF-023) [zona: núcleo]
- [x] T-006 — test (rojo) `test_vault_errors.py`: `VaultNotFound` 404, `VaultNameTaken` 409, `PreconditionRequired` 428 y `PreconditionFailed` 412 con su `slug`; `InvalidCursor` ⊂ `ValidationFailed` sin `slug` ni `detail` propios (BB-3); `RevisionConflict` no es `DomainError` (cubre RF-003, RF-007, RF-010, RF-014) [zona: test]
- [x] T-007 — `core/errors.py`: las cinco clases del catálogo y `RevisionConflict`, comentadas (cubre RF-003, RF-007, RF-010, RF-014) [zona: núcleo]
- [x] T-008 — test (rojo) `test_vault_service.py`: cursor — ida y vuelta de `{d, c, i}`; base64 basura, JSON sin claves o de otro tipo y `d` distinto del pedido → `InvalidCursor` con `errors=[{"parameter": "cursor", ...}]` de texto fijo (cubre RF-002, RF-003) [zona: test]
- [x] T-009 — `services/vault_service.py`: `encode_cursor`/`decode_cursor` (cubre RF-002, RF-003) [zona: servicio]

### C · Puerto y adaptador (CouchDB real)
- [x] T-010 — `core/ports/vault_port.py`: `VaultPort` (ABC) con `get`, `put`, `delete`, `list_page` documentados (cubre RF-001, RF-004) [zona: puerto]
- [x] T-011 — test (rojo) `test_vault_repository.py`: `put` crea y devuelve `_rev`; `put` con `_rev` viejo o sobre un doc existente sin `_rev` → `RevisionConflict`; `get` inexistente → `None`; `delete` con `_rev` (cubre RF-004, RF-010) [zona: test]
- [x] T-012 — test (rojo) `test_vault_repository.py`: `list_page` — sólo `type: "vault"`, filtro `deleted`, orden `created_at` desc y empate por `_id` desc, `after` sin repetidos ni saltos con inserciones a mitad; `_design/vaults` idempotente (cubre RF-001, RF-002, RF-012, RF-024) [zona: test]
- [x] T-013 — test (rojo) `test_vault_repository.py`: CouchDB inaccesible (puerto cerrado) y 5xx → `StorageUnavailable` en cada método (cubre RF-017) [zona: test]
- [x] T-014 — `adapters/vault_repository.py`: `get`/`put`/`delete` con `httpx` (201/200 ok, 409 → `RevisionConflict`, 404 → `None`, red/5xx → `StorageUnavailable`) (cubre RF-004, RF-010, RF-017) [zona: adaptador]
- [x] T-015 — `adapters/vault_repository.py`: `_design/vaults` (vista `by_created`, `PUT` idempotente memorizado por base) y `list_page` con `startkey`/`startkey_docid` y descarte condicional (plan §11) (cubre RF-001, RF-002, RF-012, RF-024) [zona: adaptador]

### D · Servicio (doble en memoria de `VaultPort`)
- [ ] T-016 — doble en memoria `InMemoryVaultPort` en `test_vault_service.py`: `_rev` incremental, `RevisionConflict`, fallos inyectables por operación y escritura intercalada entre lectura y `put` (cubre RF-010, RF-017, RF-021) [zona: test]
- [ ] T-017 — test (rojo): `create` — `id` UUID v4 y `_id` `vault:{id}`; `owner_id` recibido; reserva `vault-name:{minúsculas}`; mismo nombre sin distinguir mayúsculas → `VaultNameTaken` sin bóveda; reserva huérfana reasignada; dos reservas intercaladas → una gana; fallo del `put` tras reservar → sin bóveda y nombre libre (cubre RF-004, RF-007, RF-017, RF-021, RF-022) [zona: test]
- [ ] T-018 — `VaultService.create` y `_reserve` (con liberación de mejor esfuerzo) (cubre RF-004, RF-007, RF-017, RF-021, RF-022) [zona: servicio]
- [ ] T-019 — test (rojo): `get` (inexistente, de otro `type`, borrada o `vault_id` no UUID → `VaultNotFound`) y `update` (sólo lo enviado, `description: null` borra, `updated_at` renovado, renombrado reserva el nuevo y libera el viejo, mismo nombre con otras mayúsculas no choca consigo mismo; sin `If-Match` → 428; viejo → 412 sin cambios ni reserva colgada; escritura intercalada → 412) (cubre RF-008, RF-009, RF-010, RF-014, RF-021, RF-027) [zona: test]
- [ ] T-020 — `VaultService.get`, precondición `If-Match` (`ETag` = `_rev` entre comillas) y `update` (cubre RF-008, RF-009, RF-010, RF-014, RF-021, RF-027) [zona: servicio]
- [ ] T-021 — test (rojo): `delete` (pone `deleted_at`, conserva datos, libera el nombre; sobre borrada → 404) y `restore` (`deleted_at = null`; sobre activa → 404; nombre ocupado → 409 y sigue borrada; ambos con 428/412) (cubre RF-010, RF-011, RF-013, RF-025, RF-026, RF-027) [zona: test]
- [ ] T-022 — `VaultService.delete` y `restore` (cubre RF-010, RF-011, RF-013, RF-025, RF-026, RF-027) [zona: servicio]
- [ ] T-023 — test (rojo): `list` — pide `limit+1`; `next_cursor` sólo si sobra uno y `null` en la última página; `deleted` hacia el puerto; cursor de la papelera en la lista normal → `InvalidCursor` (cubre RF-001, RF-002, RF-003, RF-012, RF-024) [zona: test]
- [ ] T-024 — `VaultService.list` (cubre RF-001, RF-002, RF-003, RF-012, RF-024) [zona: servicio]

### E · Rutas (TestClient + CouchDB real)
- [ ] T-025 — test (rojo) `test_vaults_api.py`: flujos felices — `POST` 201 con `ETag` y documento en `synapse_user_{sub}` con `owner_id` del token; `GET` lista y por id con `ETag`; `PATCH` 200 con `ETag` nuevo; `DELETE` 204 y desaparece de lista y de `GET`; papelera paginada; `restore` 200 (cubre RF-001, RF-002, RF-004, RF-006, RF-008, RF-009, RF-011, RF-012, RF-013, RF-022) [zona: test]
- [ ] T-026 — test (rojo) `test_vaults_api.py`: 422 Problem — `limit` 0/201, cursor basura (`parameter: cursor`), límites de RF-005, campos desconocidos; en cada caso sin documento escrito (cubre RF-003, RF-005, RF-023) [zona: test]
- [ ] T-027 — test (rojo) `test_vaults_api.py`: 409 (`Notas`/`notas`, restaurar con nombre ocupado), nombres liberados al borrar y al renombrar, 428 y 412 en `PATCH`/`DELETE`/`restore`, 404 de RF-026, 503 con CouchDB inaccesible (cubre RF-007, RF-010, RF-017, RF-025, RF-026, RF-027) [zona: test]
- [ ] T-028 — test (rojo) `test_vaults_isolation.py`: B no ve en su lista la bóveda de A; `GET`/`PATCH`/`DELETE`/`restore` de B con el id de A → 404 con cuerpo idéntico al de un id inexistente y al de un id no UUID; la base de A no cambia; sin cookie → 401 y con cambio de contraseña pendiente → 403 en los 6 endpoints (cubre RF-014, RF-015) [zona: test]
- [ ] T-029 — test (rojo) `test_vaults_concurrency.py`: dos `POST` simultáneos (hilos) con el mismo nombre → una 201 y una 409; lo mismo con dos renombrados (cubre RF-021) [zona: test]
- [ ] T-030 — `routers/vaults.py`: router con `require_password_changed`, `get_vault_service` (base sólo del `sub` del token), 6 rutas finas con `ETag`/`If-Match` y `problem_responses` por operación (cubre RF-001…RF-015, RF-017, RF-021…RF-027) [zona: ruta]
- [ ] T-031 — `main.py`: `include_router(vaults_router)` (cubre RF-001, RF-015) [zona: ruta]
- [ ] T-032 — re-exportar contratos (`0003-vault-crud/contracts/openapi.yaml` nuevo; 0002 y 0004 sin cambios); T-001 en verde (cubre RF-001, RF-004) [doc]

### F · Rendimiento
- [ ] T-033 — `conftest.py`: marca `perf` registrada y fuera de la corrida por defecto (se ejecuta con `-m perf`) (cubre RNF-001) [zona: test]
- [ ] T-034 — `test_vaults_perf.py`: 1 000 bóvedas, 50 lecturas de la primera página (`limit=50`), p95 < 300 ms contra CouchDB real (cubre RNF-001) [zona: test]

### G · Frontend
- [ ] T-035 — test (rojo) `api/vaults.test.ts`: `listVaults({deleted, cursor})`, `createVault`, `updateVault`/`deleteVault`/`restoreVault` con `If-Match`; devuelven la bóveda con su `etag`; errores como `ApiError` con `type` (cubre RF-018, RF-019, RF-028) [zona: test]
- [ ] T-036 — `api/auth.ts`: exportar `request` (sin otros cambios); `api/vaults.ts` con los `type` de bóvedas (cubre RF-018, RF-019, RF-028) [zona: frontend]
- [ ] T-037 — test (rojo) `vaults/VaultListPage.test.tsx`: muestra nombre, descripción y tags; "Cargar más" pide con `cursor` y se oculta sin `next_cursor`; borrar pide confirmación y cancelar no envía `DELETE` (cubre RF-018, RF-020) [zona: test]
- [ ] T-038 — `vaults/VaultListPage.tsx` (cubre RF-018, RF-020) [zona: frontend]
- [ ] T-039 — test (rojo) `vaults/VaultForm.test.tsx`: crear y editar; 422 junto a su campo (por `pointer`); 409 → aviso de nombre repetido; 412 → aviso de bóveda cambiada y recarga (cubre RF-019) [zona: test]
- [ ] T-040 — `vaults/VaultForm.tsx` (cubre RF-019) [zona: frontend]
- [ ] T-041 — test (rojo) `vaults/TrashPage.test.tsx`: borradas con `deleted_at`; "Restaurar" llama con su `etag`; 409 → aviso de nombre ocupado (cubre RF-028) [zona: test]
- [ ] T-042 — `vaults/TrashPage.tsx` (cubre RF-028) [zona: frontend]
- [ ] T-043 — test (rojo) `App.test.tsx` y `layout/AppLayout.test.tsx`: rutas `/vaults`, `/vaults/new`, `/vaults/:id/edit`, `/vaults/trash`; `/` redirige a `/vaults`; enlaces "Bóvedas" y "Papelera" (cubre RF-018, RF-028) [zona: test]
- [ ] T-044 — `App.tsx` y `layout/AppLayout.tsx` (cubre RF-018, RF-028) [zona: frontend]

### H · Documentación (PLAN-0003 §8)
- [ ] T-045 — `backend/README.md`: sección "Bóvedas (SPEC-0003)" (endpoints, `ETag`/`If-Match`, 404 de ajena), estructura (`vault_service`, `vault_repository`, `vaults.py`), cuatro entradas nuevas en el catálogo de errores y la feature 0003 en "Contratos OpenAPI por feature" [doc]
- [ ] T-046 — `backend/app/core/ports/README.md` y `backend/app/adapters/README.md`: `VaultPort` y `VaultRepository` [doc]
- [ ] T-047 — `frontend/src/README.md`: carpeta `vaults/`, `api/vaults.ts`, rutas [doc]
- [ ] T-048 — `TAREAS.md` (T-002): sin crear base en `POST`, 404 en vez de 403, sin índice `by_owner_id`, papelera, `If-Match` [doc]
- [ ] T-049 — `ARCHIFY.md`: diagrama de aislamiento (404) y nota de T-003 [doc]
- [ ] T-050 — `state.md`: RF-016 (purga a 30 días) en el backlog como feature aparte (cubre RF-016) [doc]
- [ ] T-051 (cierre) — re-anclaje de 0002 (nota y `anchor_commit` por los archivos compartidos de PLAN-0003 §10, incluido `conftest.py`); `anchor_commit` de 0003; `state.md` con el estado de 0003 y residuales; tabla de cobertura con la evidencia [doc]

## Cobertura (el gate exige 100 %; `Estado` se rellena con la evidencia de la verificación)
| RF / doc | Tareas | Test(s) | Estado |
|---|---|---|---|
| RF-001 | T-001, T-002, T-010, T-012, T-015, T-023, T-024, T-025, T-030, T-031, T-032 | test_vaults_api, test_vault_repository, test_vault_service, test_contract | Pendiente |
| RF-002 | T-008, T-009, T-012, T-015, T-023, T-024, T-025, T-030 | test_vault_service, test_vault_repository, test_vaults_api | Pendiente |
| RF-003 | T-006, T-007, T-008, T-009, T-023, T-024, T-026, T-030 | test_vault_errors, test_vault_service, test_vaults_api | Pendiente |
| RF-004 | T-001, T-002, T-010, T-011, T-014, T-017, T-018, T-025, T-030, T-032 | test_vault_service, test_vault_repository, test_vaults_api | Pendiente |
| RF-005 | T-003, T-005, T-026, T-030 | test_vault_schemas, test_vaults_api | Pendiente |
| RF-006 | T-004, T-005, T-025, T-030 | test_vault_schemas, test_vaults_api | Pendiente |
| RF-007 | T-006, T-007, T-017, T-018, T-027, T-030 | test_vault_service, test_vaults_api | Pendiente |
| RF-008 | T-001, T-019, T-020, T-025, T-030 | test_vault_service, test_vaults_api | Pendiente |
| RF-009 | T-001, T-004, T-005, T-019, T-020, T-025, T-030 | test_vault_schemas, test_vault_service, test_vaults_api | Pendiente |
| RF-010 | T-006, T-007, T-011, T-014, T-016, T-019, T-020, T-021, T-022, T-027, T-030 | test_vault_repository, test_vault_service, test_vaults_api | Pendiente |
| RF-011 | T-001, T-021, T-022, T-025, T-030 | test_vault_service, test_vaults_api | Pendiente |
| RF-012 | T-012, T-015, T-023, T-024, T-025, T-030 | test_vault_repository, test_vault_service, test_vaults_api | Pendiente |
| RF-013 | T-001, T-021, T-022, T-025, T-030 | test_vault_service, test_vaults_api | Pendiente |
| RF-014 | T-006, T-007, T-019, T-020, T-028, T-030 | test_vault_service, test_vaults_isolation | Pendiente |
| RF-015 | T-028, T-030, T-031 | test_vaults_isolation | Pendiente |
| RF-016 | T-050 (diferido a otra feature, spec §2) | — | Pendiente |
| RF-017 | T-013, T-014, T-016, T-017, T-018, T-027, T-030 | test_vault_repository, test_vault_service, test_vaults_api | Pendiente |
| RF-018 | T-035, T-036, T-037, T-038, T-043, T-044 | vaults.test.ts, VaultListPage.test.tsx, App.test.tsx | Pendiente |
| RF-019 | T-035, T-036, T-039, T-040 | vaults.test.ts, VaultForm.test.tsx | Pendiente |
| RF-020 | T-037, T-038 | VaultListPage.test.tsx | Pendiente |
| RF-021 | T-016, T-017, T-018, T-019, T-020, T-029, T-030 | test_vault_service, test_vaults_concurrency | Pendiente |
| RF-022 | T-017, T-018, T-025, T-030 | test_vault_service, test_vaults_api | Pendiente |
| RF-023 | T-004, T-005, T-026, T-030 | test_vault_schemas, test_vaults_api | Pendiente |
| RF-024 | T-012, T-015, T-023, T-024, T-030 | test_vault_repository, test_vault_service | Pendiente |
| RF-025 | T-021, T-022, T-027, T-030 | test_vault_service, test_vaults_api | Pendiente |
| RF-026 | T-021, T-022, T-027, T-030 | test_vault_service, test_vaults_api | Pendiente |
| RF-027 | T-019, T-020, T-021, T-022, T-027, T-030 | test_vault_service, test_vaults_api | Pendiente |
| RF-028 | T-035, T-036, T-041, T-042, T-043, T-044 | vaults.test.ts, TrashPage.test.tsx, AppLayout.test.tsx | Pendiente |
| RNF-001 | T-033, T-034 | test_vaults_perf (`-m perf`) | Pendiente |
| doc: contrato-0003 | T-032 | — | Pendiente |
| doc: backend-readme | T-045 | — | Pendiente |
| doc: ports-adapters-readme | T-046 | — | Pendiente |
| doc: frontend-readme | T-047 | — | Pendiente |
| doc: tareas-t002 | T-048 | — | Pendiente |
| doc: archify | T-049 | — | Pendiente |
| doc: state | T-050, T-051 | — | Pendiente |
| doc: plan-0003-ajustes-fase-3 | (hecho al escribir este `tasks.md`: PLAN-0003 §10) | — | hecho |

> Esta tabla **es** la trazabilidad de la feature (no hay `traceability-matrix.md`).
> Fila sin test, en `Fail` o `Pendiente` → el gate no abre (al pasar a `implemented`).
