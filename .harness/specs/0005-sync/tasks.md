---
id: TASKS-0005
tipo: tasks
feature: 0005-sync
estado: approved
aprobaciones:
  fase_3: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-13 }   # sin nginx: proxy con Caddy externo
actualizado: 2026-10-13
---

# TASKS-0005 · Sincronización PouchDB ↔ CouchDB (offline-first)

> **GATE 3 aprobado (2026-10-13)** con una observación del usuario: sin nginx, el proxy
> inverso es un Caddy externo. T-067 pasa de configurar nginx a documentar los requisitos del Caddy.

## Reglas
- Cada tarea: ≤ 30 min, un solo propósito, `(cubre RF-NNN)`, zona del patrón (o `[doc]`).
- Orden por dependencias (PLAN-0005 §6). **Test antes que código.**
- Cada fila de `plan.md §8` → una tarea `[doc]` (bloque L).
- Errores con el catálogo de SPEC-0004: ninguna `HTTPException`; cada ruta declara sus
  errores con `problem_responses` (`ContractGuard`).
- Tests nuevos del backend en `backend/tests/test_sync*.py` (cubiertos por 0005). Los de
  bóvedas que cambian por P-1 (`test_vault_service.py`, `test_vault_repository.py`, pantallas
  de `frontend/src/vaults/`) son de 0003 y se re-anclan al cierre (bloque L). No se tocan
  los `test_problem*.py` de SPEC-0004.
- **Nunca** se añade `test.db` al repositorio (`git add` explícito, nunca `-A`).

## Tareas
### A · Contrato y errores (PLAN-0005 §4)
- [ ] T-001 — test (rojo) en `test_contract.py`: el contrato de `0005-sync` documenta las rutas de PLAN-0005 §2.1 (`GET /sync/`, `GET /sync/db/`, `GET`·`POST /sync/db/_changes`, `POST _revs_diff`, `POST _bulk_get`, `GET`·`POST _all_docs`, `POST _bulk_docs`, `GET`·`PUT _local/{id}`) y no la comodín (cubre RF-001, RF-003) [zona: test]
- [ ] T-002 — `scripts/export_openapi.py`: `"0005-sync": {"paths": ("/sync",), "schemas": ()}` en `FEATURES` (cubre RF-001) [zona: script]
- [x] T-003 — test (rojo) `test_sync_errors.py`: `SyncEndpointNotFound` (404, `sync-endpoint-not-found`) y `PayloadTooLarge` (413, `payload-too-large`) son `DomainError` con su `slug` (cubre RF-003) [zona: test]
- [x] T-004 — `core/errors.py`: las dos clases, comentadas (cubre RF-003) [zona: núcleo]

### B · Filtros puros (`services/sync_filter.py`)
- [x] T-005 — test (rojo) `test_sync_filter.py`: `is_replicable_id` (`vault:{uuid}` canónico sí; `vault-name:*`, `_design/*`, UUID no canónico, `foo` no) y `changes_query` (lista blanca, descarta `filter`/`doc_ids`/`selector`/`view`, `feed=continuous` → `ValidationFailed`, acota `heartbeat`/`timeout` a 60 s, selector fijo) (cubre RF-004, RF-007) [zona: test]
- [x] T-006 — test (rojo) `test_sync_filter.py`: recorte de `_revs_diff` (no replicables → `missing` sin consultar), `_bulk_get` (no replicables → `not_found`) y su fusión con la respuesta, `all_docs_query` (rango forzado, `keys` filtradas), `sanitize_db_info` (sin `doc_count` ni tamaños, `db_name: "db"`) (cubre RF-004, RF-007) [zona: test]
- [x] T-007 — `sync_filter.py`: `is_replicable_id`, `changes_query` (cubre RF-004, RF-007) [zona: servicio]
- [x] T-008 — `sync_filter.py`: recortes de `_revs_diff`, `_bulk_get`, `_all_docs` y `sanitize_db_info` (cubre RF-004, RF-007) [zona: servicio]

### C · Puertos y adaptadores (CouchDB real)
- [x] T-009 — `core/ports/replication_port.py`: `ReplicationPort` (ABC async) con `db_info`, `changes`, `revs_diff`, `bulk_get`, `all_docs`, `bulk_docs_replicated`, `get_local`, `put_local`, documentados (cubre RF-001, RF-004) [zona: puerto]
- [x] T-010 — test (rojo) `test_sync_repository.py`: `db_info`, `revs_diff`, `bulk_get` con `revs`, `all_docs` con rango y `keys`, `get_local`/`put_local` (cubre RF-004, RF-010) [zona: test]
- [x] T-011 — test (rojo) `test_sync_repository.py`: `bulk_docs_replicated` con `new_edits:false` crea dos ramas en conflicto sin 409; `changes` con selector y `feed=longpoll` entrega bytes en streaming y termina al llegar un cambio (cubre RF-004, RF-012) [zona: test]
- [x] T-012 — test (rojo) `test_sync_repository.py`: CouchDB inaccesible y 5xx → `StorageUnavailable` en cada método, también a mitad del streaming (cubre RF-019) [zona: test]
- [x] T-013 — `adapters/replication_repository.py`: `httpx.AsyncClient` con credencial admin y mapeo de errores (cubre RF-004, RF-010, RF-019) [zona: adaptador]
- [x] T-014 — test (rojo) `test_vault_repository.py`: `leaves` devuelve todas las hojas vivas con `_revisions` (sin conflicto, una; con conflicto, ambas; lápidas fuera) (cubre RF-008) [zona: test]
- [x] T-015 — `VaultPort.leaves` + implementación en `adapters/vault_repository.py` (`open_revs=all&revs=true`) (cubre RF-008) [zona: puerto/adaptador]

### D · `VaultService._holder` con todas las hojas (P-4)
- [x] T-016 — test (rojo) `test_vault_service.py`: `InMemoryVaultPort` con hojas en conflicto; una reserva usada por una rama perdedora no se reasigna (ni por `create` ni por `restore`); sin conflictos el comportamiento no cambia (cubre RF-008) [zona: test]
- [x] T-017 — `services/vault_service.py`: `_holder` mira todas las hojas vivas y activas vía `leaves` (cubre RF-008) [zona: servicio]

### E · Push validado (`services/sync_push.py`, dobles)
- [ ] T-018 — dobles `InMemoryReplicationPort` (ramas, `_revisions`, ganadora determinista de CouchDB, fallos inyectables, escritura intercalada) en `test_sync_push.py` (cubre RF-005, RF-008) [zona: test]
- [ ] T-019 — test (rojo): id (RF-007 → `invalid-id`, incluido `_local/*` en el lote), revisión ya almacenada (aceptada sin escribir ni reservar), lápidas (`delete-not-allowed` salvo cierre de rama con otra hoja viva; cuerpo extra en la lápida → rechazo) (cubre RF-005, RF-007) [zona: test]
- [ ] T-020 — test (rojo): forma (`_attachments`, `_conflicts`, clave desconocida, `type` ≠ `vault` → `validation-error:<clave>`), campos (límites → `validation-error:<campo>`; sin normalizar → `not-normalized:<campo>`), `owner-mismatch`, formato de fechas, `immutable-field:created_at` (cubre RF-005, RF-001) [zona: test]
- [ ] T-021 — test (rojo): reservas — crear, renombrar, borrar (`deleted_at`), restaurar; nombre ocupado → `vault-name-taken`; rama perdedora con nombre de otra bóveda → rechazada; liberación del nombre que ninguna hoja usa; lote mixto (rechaza uno y guarda el resto); dos lotes intercalados con el mismo nombre → uno solo gana; error de escritura → `StorageUnavailable` sin reservas colgadas fuera de arrendamiento (cubre RF-005, RF-006, RF-008, RF-011) [zona: test]
- [ ] T-022 — `SyncPushService` pasos 1–6 (id, ya almacenada, lápidas, forma, campos con `core/schemas.py`, reglas de servidor) (cubre RF-005, RF-007) [zona: servicio]
- [ ] T-023 — `SyncPushService` pasos 7–9 (reserva con `VaultService._reserve`, escritura `new_edits:false`, liberación) y formato de rechazo `forbidden` + `reason` (cubre RF-006, RF-008, RF-011) [zona: servicio]

### F · Rutas (TestClient + CouchDB real)
- [ ] T-024 — test (rojo) `test_sync_api.py`: sin cookie → 401 y con cambio pendiente → 403 en cada ruta y en la comodín; fuera del subconjunto → 404 problem+json sin llegar a CouchDB (`PUT /sync/db/x`, `DELETE /sync/db/_local/x`, `_find`, `_purge`, `_security`, `_design/vaults`, `/sync/synapse_user_x/…`) (cubre RF-002, RF-003) [zona: test]
- [ ] T-025 — test (rojo) `test_sync_api.py`: con una reserva y `_design/vaults` en la base, no aparecen en `_changes` (normal y `longpoll`), `_all_docs` ni `_bulk_get`; `GET /sync/db/` sin `doc_count`; `GET /sync/` (cubre RF-004) [zona: test]
- [ ] T-026 — test (rojo) `test_sync_api.py`: `_bulk_docs` válido guardado con su `_rev`; inválido rechazado por documento; `new_edits:true` → 422; > 200 docs o > 4 MiB → 413; `_local` > 64 KiB → 413 (cubre RF-005, RF-006, RF-007) [zona: test]
- [ ] T-027 — test (rojo) `test_sync_api.py`: secuencia de PouchDB completa (raíz, info, `_local` checkpoint, `_changes`, `_revs_diff`, `_bulk_docs`, `_bulk_get`) reanudable desde el checkpoint; reenvío del mismo lote sin duplicados; CouchDB inaccesible → 503 problem+json (cubre RF-010, RF-019) [zona: test]
- [ ] T-028 — test (rojo) `test_sync_isolation.py`: A y B con datos; B no ve nada de A por ninguna ruta; no escribe en la base de A (base en la URL → 404, `owner_id` de A → `owner-mismatch`); la base de A no cambia (cubre RF-001, RNF-003) [zona: test]
- [ ] T-029 — `routers/sync.py`: router con `require_password_changed`, `get_sync_db`, rutas síncronas (`/`, `db/`, `_revs_diff`, `_bulk_get`, `_all_docs`, `_bulk_docs`, `_local`), límites de tamaño y comodín final (cubre RF-001, RF-002, RF-003, RF-004, RF-005, RF-006) [zona: ruta]
- [ ] T-030 — `routers/sync.py`: `_changes` `async` con `StreamingResponse` sobre `ReplicationPort.changes` (cubre RF-004, RF-010) [zona: ruta]
- [ ] T-031 — `main.py`: `include_router(sync.router)`; re-export de `0005-sync/contracts/openapi.yaml` (cubre RF-001, RF-003) [zona: ruta]

### G · Frontend base
- [ ] T-032 — `package.json`: `pouchdb-browser` y, en desarrollo, `pouchdb-adapter-memory`, versiones exactas (P-2); `npm ci` y suite actual en verde (cubre RF-009) [zona: config]
- [ ] T-033 — `backend/tests/fixtures/vault_rules_cases.json` + test `test_sync_rules_mirror.py`: cada caso (entrada, veredicto, normalizado) coincide con `core/schemas.py` (cubre RF-005, RF-015) [zona: test]
- [ ] T-034 — test (rojo) `sync/vaultRules.test.ts`: la misma batería JSON → mismo veredicto y normalización; `nameKey` (cubre RF-005, RF-015) [zona: test]
- [ ] T-035 — `sync/vaultRules.ts` (cubre RF-005, RF-015) [zona: cliente]
- [ ] T-036 — test (rojo) `sync/localDb.test.ts`: `_local/synapse-owner`; usuario distinto → réplica destruida y vacía antes de replicar; mismo usuario → se conserva; almacenamiento borrado → réplica vacía nueva (cubre RF-018) [zona: test]
- [ ] T-037 — `sync/localDb.ts` (sin `auto_compaction`) (cubre RF-018) [zona: cliente]
- [ ] T-038 — test (rojo) `sync/vaultStore.test.ts`: `create`/`update`/`softDelete`/`restore`/`list`/`get` sobre PouchDB en memoria; normaliza; nombre ocupado en local → error; `_rev` viejo → error de "la bóveda cambió"; orden `created_at` desc, `_id` desc; fechas con formato de `utc_now`; cuota agotada → error claro (cubre RF-009, RF-011) [zona: test]
- [ ] T-039 — `sync/vaultStore.ts` (cubre RF-009, RF-011) [zona: cliente]
- [ ] T-040 — test (rojo) `sync/merge.test.ts`: tabla de ADR-003 — campos distintos, mismo campo (choque), sin ancestro, tags altas/bajas y orden, borrado vs edición (restaurada), ambos borrados, sólo `updated_at` distinto, resultado inválido (> 20 tags) → manual, convergencia de dos resoluciones simultáneas (cubre RF-012, RF-013, RF-014, RF-015) [zona: test]
- [ ] T-041 — `sync/merge.ts` (cubre RF-012, RF-013, RF-014, RF-015) [zona: cliente]

### H · Replicación, estado, rechazos y conflictos
- [ ] T-042 — test (rojo) `sync/remote.test.ts`: `credentials: "include"`; 401 → `refreshSession()` y reintento; refresh fallido → evento "sesión caducada" (cubre RF-002, RF-016) [zona: test]
- [ ] T-043 — `sync/remote.ts` (cubre RF-002, RF-016) [zona: cliente]
- [ ] T-044 — test (rojo) `sync/replicator.test.ts` (temporizadores falsos): espera 1, 2, 4… 60, 60 s y vuelta a 1 s tras éxito; sesión caducada → `cancel()` sin tocar la réplica y reanuda con el mismo usuario; Web Lock: sólo una instancia replica (cubre RF-010, RF-016, RF-019) [zona: test]
- [ ] T-045 — `sync/replicator.ts` (`live`, `retry`, `batch_size: 50`, `back_off_function`, Web Lock + `BroadcastChannel`) (cubre RF-010, RF-016, RF-019) [zona: cliente]
- [ ] T-046 — test (rojo) `sync/status.test.ts`: transiciones en línea / sin conexión (503 o sin respuesta) / sincronizando / pendientes / sesión caducada; hora de la última sync persistida en `_local/synapse-sync-state` (cubre RF-009, RF-010, RF-019) [zona: test]
- [ ] T-047 — `sync/status.ts` (cubre RF-009, RF-010, RF-019) [zona: cliente]
- [ ] T-048 — test (rojo) `sync/rejections.test.ts`: `denied` → entrada persistente con id, rev y motivo; se limpia al escribirse una revisión posterior; sobrevive a recargar (cubre RF-006) [zona: test]
- [ ] T-049 — `sync/rejections.ts` (cubre RF-006) [zona: cliente]
- [ ] T-050 — test (rojo) `sync/conflicts.test.ts`: detecta conflictos en `changes` y al arrancar; ancestro leído del árbol local; combina y escribe hija de la ganadora + lápida de la perdedora en un `bulkDocs`; lo no combinable queda en la lista con ambas versiones (cubre RF-012, RF-013, RF-014, RF-015) [zona: test]
- [ ] T-051 — `sync/conflicts.ts` (cubre RF-012, RF-013, RF-014, RF-015) [zona: cliente]

### I · UI
- [ ] T-052 — test (rojo) `sync/SyncProvider.test.tsx`: arranca réplica y replicador con el `sub`; expone estado, rechazos, conflictos y `requestLogout` (cubre RF-009, RF-017, RF-018) [zona: test]
- [ ] T-053 — `sync/SyncProvider.tsx` y `sync/useSync.ts` (cubre RF-009, RF-017, RF-018) [zona: cliente]
- [ ] T-054 — test (rojo) `sync/SyncStatusBar.test.tsx`: textos de cada estado, hora de la última sync, contadores y enlaces a `/rejections` y `/conflicts` (cubre RF-009, RF-010, RF-019) [zona: test]
- [ ] T-055 — `sync/SyncStatusBar.tsx` (cubre RF-009, RF-010, RF-019) [zona: cliente]
- [ ] T-056 — test (rojo) `sync/RejectionsPage.test.tsx`: motivo en español por código, "Corregir" abre el formulario de la bóveda (cubre RF-006) [zona: test]
- [ ] T-057 — `sync/RejectionsPage.tsx` (cubre RF-006) [zona: cliente]
- [ ] T-058 — test (rojo) `sync/ConflictView.test.tsx`: ambas versiones campo a campo; elegir o combinar; guardar valida con `vaultRules` y escribe; error de validación visible (cubre RF-013, RF-015) [zona: test]
- [ ] T-059 — `sync/ConflictView.tsx` (cubre RF-013, RF-015) [zona: cliente]
- [ ] T-060 — test (rojo) `sync/LogoutDialog.test.tsx`: sin pendientes sale y destruye la réplica; con pendientes, las tres opciones (sin conexión, dos); "Sincronizar y salir" con un rechazo o fallo vuelve al aviso; "Cancelar" no sale (cubre RF-017) [zona: test]
- [ ] T-061 — `sync/LogoutDialog.tsx` (cubre RF-017) [zona: cliente]
- [ ] T-062 — tests (rojo) de `vaults/*.test.tsx` adaptados a `vaultStore`: lista y "Cargar más" en memoria, formulario (errores de campo, nombre ocupado, "la bóveda cambió"), confirmación de borrado, papelera y restaurar (cubre RF-009, RF-011) [zona: test]
- [ ] T-063 — `vaults/VaultListPage.tsx`, `VaultForm.tsx`, `TrashPage.tsx`, `useVaultPages.ts`, `errors.ts` sobre `vaultStore` (P-1) (cubre RF-009, RF-011) [zona: cliente]
- [ ] T-064 — tests (rojo) de integración de `App.tsx`/`AppLayout.tsx`: `SyncProvider` dentro de `RequireAuth`, rutas `/rejections` y `/conflicts`, barra de estado visible, "Salir" llama a `requestLogout` (cubre RF-009, RF-017) [zona: test]
- [ ] T-065 — `App.tsx` y `layout/AppLayout.tsx` (cubre RF-009, RF-017) [zona: cliente]
- [ ] T-066 — retirar `frontend/src/api/vaults.ts` y `vaults.test.ts` (sin importadores; la API REST no cambia) (cubre RF-009) [zona: cliente]

### J · Mismo origen (Caddy externo + Vite)
- [ ] T-067 — `backend/README.md`, sección de despliegue: requisitos del Caddy externo para `/sync/*` (mismo origen que la SPA, `flush_interval -1`, sin tiempo límite de respuesta < 90 s); sin nginx (enmienda del GATE 3) (cubre RF-001, RF-010) [doc]
- [ ] T-068 — `frontend/vite.config.ts`: `"/sync": BACKEND` (cubre RF-001) [zona: config]

### K · Sincronización real (RNF-002)
- [ ] T-069 — `frontend/scripts/sync-integration.sh` (levanta uvicorn contra la base de test y CouchDB de test, crea dos usuarios, ejecuta `vitest --environment node` sobre `sync/*.integration.test.ts`, apaga) + script `npm run test:sync` (cubre RNF-002) [zona: test]
- [ ] T-070 — `sync/offline.integration.test.ts`: dos réplicas reales; crear/editar/borrar/restaurar sin conexión, volver la red y ver los cambios en la otra; "pendientes" hasta confirmar (cubre RF-009, RF-010, RF-011, RNF-002) [zona: test]
- [ ] T-071 — `sync/rejections.integration.test.ts`: dos bóvedas con el mismo nombre creadas sin conexión → la segunda rechazada, conserva su cambio, al renombrarla se sincroniza; REST y sync con el mismo nombre → nunca dos activas (cubre RF-005, RF-006, RF-008, RNF-002) [zona: test]
- [ ] T-072 — `sync/conflicts.integration.test.ts`: campos distintos → combinado en ambas; mismo campo → vista manual con ambas versiones en cualquier orden; borrado vs edición → restaurada; resolución con nombre ocupado → rechazo (cubre RF-012, RF-013, RF-014, RF-015, RNF-002) [zona: test]
- [ ] T-073 — `sync/session.integration.test.ts`: cookie invalidada a mitad → se detiene y conserva pendientes; tras login del mismo usuario reanuda; corte a mitad de lote reanuda desde el checkpoint sin duplicados; backend caído → "sin conexión" y recupera (cubre RF-016, RF-019, RNF-002) [zona: test]
- [ ] T-074 — `sync/isolation.integration.test.ts`: dos usuarios en dos réplicas; ninguno recibe ni puede subir datos del otro (cubre RF-001, RNF-003) [zona: test]
- [ ] T-075 — `sync/sync.perf.integration.test.ts` (marca `perf`): 20 ediciones, p95 ≤ 5 s hasta la otra réplica (cubre RNF-001) [zona: test]

### L · Documentación y re-anclajes (PLAN-0005 §8)
- [ ] T-076 — verificar que `0005-sync/contracts/openapi.yaml` exportado incluye los códigos `reason` y errores de §4 [doc]
- [ ] T-077 — `backend/README.md`: sección "Sincronización (SPEC-0005)" [doc]
- [ ] T-078 — `backend/app/{core/ports,adapters,services,routers}/README.md`: `ReplicationPort`, `ReplicationRepository`, `VaultPort.leaves`, `sync_push`, `sync_filter`, `sync.py` [doc]
- [ ] T-079 — `frontend/src/README.md`: carpeta `sync/`, estados, rechazos, conflictos, salida, proxys `/sync`, pantallas sobre la réplica [doc]
- [ ] T-080 — `frontend/README.md` (o scripts de `package.json`): `npm run test:sync` y `sync-integration.sh` [doc]
- [ ] T-081 — `0005-sync/diagrams/`: candidato con estado y rutas exactas, regenerar, `README.md` [doc]
- [ ] T-082 — `ARCHIFY.md`: estado del diagrama de sync [doc]
- [ ] T-083 — re-anclajes en el cierre: notas en `0003-vault-crud/spec.md` (P-1) y `0002-auth/spec.md` (App, layout, export) sin cambio de requisitos [doc]
- [ ] T-084 — `.harness/memory/state.md`: estado de 0005, hazards 1 y 3 mitigados [doc]

## Cobertura (el gate exige 100 %; `Estado` lo rellena el gate)
| RF / doc | Tareas | Test(s) | Estado |
|---|---|---|---|
| RF-001 | T-001, T-002, T-009, T-020, T-028, T-029, T-031, T-067, T-068, T-074 | test_contract, test_sync_isolation, test_sync_push, isolation.integration | Pendiente |
| RF-002 | T-024, T-029, T-042, T-043 | test_sync_api, remote.test | Pendiente |
| RF-003 | T-001, T-003, T-004, T-024, T-029, T-031 | test_sync_errors, test_sync_api | Pendiente |
| RF-004 | T-005…T-011, T-013, T-025, T-029, T-030 | test_sync_filter, test_sync_repository, test_sync_api | Pendiente |
| RF-005 | T-018…T-022, T-026, T-029, T-033…T-035, T-071 | test_sync_push, test_sync_api, test_sync_rules_mirror, vaultRules.test, rejections.integration | Pendiente |
| RF-006 | T-021, T-023, T-026, T-029, T-048, T-049, T-056, T-057, T-071 | test_sync_push, test_sync_api, rejections.test, RejectionsPage.test, rejections.integration | Pendiente |
| RF-007 | T-005…T-008, T-019, T-022, T-026 | test_sync_filter, test_sync_push, test_sync_api | Pendiente |
| RF-008 | T-014…T-018, T-021, T-023, T-071 | test_vault_repository, test_vault_service, test_sync_push, rejections.integration | Pendiente |
| RF-009 | T-032, T-038, T-039, T-046, T-047, T-052…T-055, T-062…T-066, T-070 | vaultStore.test, status.test, SyncStatusBar.test, vaults/*.test, offline.integration | Pendiente |
| RF-010 | T-010, T-013, T-027, T-030, T-044…T-047, T-054, T-055, T-067, T-070 | test_sync_repository, test_sync_api, replicator.test, status.test, offline.integration | Pendiente |
| RF-011 | T-021, T-023, T-038, T-039, T-062, T-063, T-070 | test_sync_push, vaultStore.test, vaults/*.test, offline.integration | Pendiente |
| RF-012 | T-011, T-040, T-041, T-050, T-051, T-072 | test_sync_repository, merge.test, conflicts.test, conflicts.integration | Pendiente |
| RF-013 | T-040, T-041, T-050, T-051, T-058, T-059, T-072 | merge.test, conflicts.test, ConflictView.test, conflicts.integration | Pendiente |
| RF-014 | T-040, T-041, T-050, T-051, T-072 | merge.test, conflicts.test, conflicts.integration | Pendiente |
| RF-015 | T-033…T-035, T-040, T-041, T-050, T-051, T-058, T-059, T-072 | test_sync_rules_mirror, vaultRules.test, merge.test, ConflictView.test, conflicts.integration | Pendiente |
| RF-016 | T-042…T-045, T-073 | remote.test, replicator.test, session.integration | Pendiente |
| RF-017 | T-052, T-053, T-060, T-061, T-064, T-065 | SyncProvider.test, LogoutDialog.test, App/AppLayout tests | Pendiente |
| RF-018 | T-036, T-037, T-052, T-053 | localDb.test, SyncProvider.test | Pendiente |
| RF-019 | T-012, T-013, T-027, T-044…T-047, T-054, T-055, T-073 | test_sync_repository, test_sync_api, replicator.test, status.test, session.integration | Pendiente |
| RNF-001 | T-075 | sync.perf.integration | Pendiente |
| RNF-002 | T-069…T-073 | *.integration (sync-integration.sh) | Pendiente |
| RNF-003 | T-028, T-074 | test_sync_isolation, isolation.integration | Pendiente |
| doc: contrato | T-076 | test_contract | Pendiente |
| doc: backend/README | T-077 | — | Pendiente |
| doc: app/*/README | T-078 | — | Pendiente |
| doc: frontend/src/README | T-079 | — | Pendiente |
| doc: frontend scripts | T-080 | — | Pendiente |
| doc: diagrams | T-081 | — | Pendiente |
| doc: ARCHIFY.md | T-082 | — | Pendiente |
| doc: re-anclajes 0002/0003 | T-083 | — | Pendiente |
| doc: state.md | T-084 | — | Pendiente |

> Esta tabla **es** la trazabilidad de la feature (no hay `traceability-matrix.md`).
> Fila sin test, en `Fail` o `Pendiente` → el gate no abre.
