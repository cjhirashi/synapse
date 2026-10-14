---
id: PLAN-0005
tipo: plan
feature: 0005-sync
estado: verified
aprobaciones:
  fase_2: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-13 }   # con P-1 (a) y P-2
  enmienda_1: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-13 }   # §10, VC-1…VC-8
  enmienda_2: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-14 }   # §11, VD-1…VD-5
  enmienda_3: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-14 }   # §12, VE-1 opción (a), VE-2…VE-5
  enmienda_4: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-14 }   # §13, VF-4 opción (b), VF-1…VF-3
  enmienda_5: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-14 }         # menores de la verificación 5, VG-1…VG-4 (pruebas y texto)
  verified: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-14 }           # verificación 5 APPROVED con menores; VG-1…VG-5 → backlog 9
actualizado: 2026-10-14
---

# PLAN-0005 · Sincronización PouchDB ↔ CouchDB (offline-first)

> El *cómo* de SPEC-0005 en el patrón por-capas con puertos (ADR-001):
> `routers → services → core/ports ← adapters`, con el canal de ADR-002 (proxy `/sync` con
> push validado) y la resolución de ADR-003 (por campo contra el ancestro, si no el usuario).
> **Prerrequisitos cumplidos:** SPEC-0002 (sesión), SPEC-0003 (bóvedas, `verified`),
> SPEC-0004 (RFC 9457, `verified`). Este plan sólo lanza errores de dominio; el formato
> `application/problem+json` lo pone el traductor de 0004.
> **Enmienda del GATE 3 (2026-10-13, por el usuario):** sin nginx; el proxy inverso es un
> Caddy externo. Cambian §2.5 (mismo origen), §6 paso 10, §7 y §8; el diseño de la API no cambia.
> **GATE 2 aprobado (2026-10-13):** el usuario aprobó el plan con P-1 opción (a) (se toca el
> código de 0003 y se re-ancla al cierre) y P-2 (dependencia `pouchdb-browser`); P-3…P-5
> quedan confirmadas con el plan (§7).
> **Enmienda 1 (2026-10-13, aprobada por el usuario):** correcciones de la verificación
> adversarial VC-1…VC-8 en §10; cambian §2.5 nota (i), §7 P-5 y §9 (RF-003, RF-015, RF-017).

## 0. Gates de simplicidad
- [x] Simplicity — el backend reenvía el protocolo de replicación de CouchDB, que ya existe,
  en lugar de inventar uno; el cliente usa el replicador de PouchDB (checkpoints,
  reanudación, lotes) en lugar de una cola propia. Única dependencia nueva: PouchDB en el
  frontend (P-2); el backend sigue con `httpx`.
- [x] Anti-Abstraction — un puerto nuevo (`ReplicationPort`, async, para el reenvío) y un
  método nuevo en `VaultPort` (`leaves`). Sin capa de "almacén de bóvedas" intercambiable en
  el frontend: la UI pasa a usar la réplica local directamente (P-1).
- [x] Integration-First — `0005-sync/contracts/openapi.yaml` (rutas exactas, cuerpos y
  motivos de rechazo) se exporta y versiona antes de implementar el proxy (test de deriva).

## 1. Cumplimiento constitucional
| Artículo | Cómo lo respeta este plan |
|---|---|
| Art. 1–2 (patrón) | Rutas finas en `routers/sync.py`; reglas del push y filtros en `services/sync_push.py` y `services/sync_filter.py`; CouchDB sólo vía `ReplicationPort` y `VaultPort`. `services/` no importa de `adapters/`. |
| Art. 3 (testing) | TDD; ≥ 80 % por módulo; proxy contra **CouchDB real** (P5); dos réplicas PouchDB reales contra el proxy real (RNF-002); vitest en el frontend. |
| Art. 5 (seguridad) / P2–P3 | La base sale **sólo** del `sub` del token; la URL del cliente nunca nombra una base (§2). `require_password_changed` en todo el router, incluida la ruta comodín. La credencial admin no sale del backend. Lista blanca de rutas y de parámetros de consulta; `vault-name:*` y `_design/*` nunca salen ni entran. Límites de tamaño del cuerpo. |
| Art. 6 (contratos/errores) | OpenAPI 3.1 por feature; errores RFC 9457; el resultado por documento sigue el formato de `_bulk_docs` de CouchDB con `reason` documentado (§4). |
| Art. 10 (raíz) | La unicidad de nombre no se duplica: el push usa las mismas reservas y el mismo `name_key` que la API REST (`VaultService`), extendidas a todas las ramas vivas (P-4). |
| Art. 11 (docs) | §8. |
| Art. 12 | Las reglas de campo viven en `core/schemas.py` (backend) y se reflejan una sola vez en el cliente (`sync/vaultRules.ts`), con un test que compara ambos contra los mismos casos (§5). |

## 2. Arquitectura de la feature (por-capas con puertos)

### 2.1 Rutas exactas del canal (`routers/sync.py`)
El cliente abre la base remota `new PouchDB(origin + "/sync/db", { skip_setup: true })`.
`db` es un nombre **fijo**: la base real (`synapse_user_{sub}`) la pone el proxy.

| Método y ruta | Reenvío a CouchDB | Notas |
|---|---|---|
| `GET /sync/` | — | Respuesta propia `{"couchdb": "Welcome"}` (PouchDB consulta la raíz para su id; sin `uuid` ni versión). |
| `GET /sync/db/` | `GET /{base}` | Devuelve sólo `db_name: "db"`, `update_seq` e `instance_start_time`; nunca `doc_count` ni tamaños (revelarían reservas). |
| `GET`·`POST /sync/db/_changes` | `POST /{base}/_changes?filter=_selector` | Selector fijo `{"_id": {"$regex": "^vault:"}}` (RF-004). Parámetros en lista blanca (`since`, `limit`, `feed` ∈ {`normal`, `longpoll`}, `heartbeat`, `timeout`, `style`, `seq_interval`, `include_docs`, `conflicts`); `filter`, `doc_ids`, `selector`, `view` del cliente se descartan. `heartbeat` y `timeout` se acotan a 60 s. Respuesta **en streaming**. |
| `POST /sync/db/_revs_diff` | `POST /{base}/_revs_diff` | Sólo se consultan los ids `vault:*`; los demás se responden como `missing` sin preguntar a CouchDB, para que el push los rechace con motivo (RF-007) sin revelar si existen. |
| `POST /sync/db/_bulk_get` | `POST /{base}/_bulk_get` | Pedidos no `vault:*` → `{"error": "not_found"}` sin consultarlos (RF-004). |
| `GET`·`POST /sync/db/_all_docs` | `GET`·`POST /{base}/_all_docs` | Rango forzado a `startkey="vault:"`, `endkey="vault:￰"`; con `keys`, se quitan los no `vault:*` (RF-004). |
| `POST /sync/db/_bulk_docs` | `POST /{base}/_bulk_docs` | Push validado (§2.3). Exige `new_edits: false` (lo que envía el replicador); `true` → 422. |
| `GET`·`PUT /sync/db/_local/{id}` | igual | Checkpoints del replicador. Cuerpo ≤ 64 KiB. |
| cualquier otra ruta o método bajo `/sync` | — | Ruta comodín final (`include_in_schema=False`) → `SyncEndpointNotFound` (404, RF-003). Cubre también `DELETE /sync/db/_local/x` (un 405 del framework diría que la ruta existe). |

- `APIRouter(prefix="/sync", dependencies=[Depends(require_password_changed)])` → 401/403
  en toda ruta, también la comodín (RF-002). Cada operación declara sus errores con
  `problem_responses` (lo exige `ContractGuard`).
- Dependencia `get_sync_db(current_user) -> f"synapse_user_{current_user.sub}"` (RF-001),
  la misma regla que `get_vault_service`.
- `_changes` es `async def` con `StreamingResponse` sobre el puerto async; así un
  `longpoll` no ocupa un hilo del pool. Las demás rutas son `def` (síncronas, como 0003).
- Cuerpo de `_bulk_docs` ≤ 4 MiB y ≤ 200 documentos; si no → `PayloadTooLarge` (413). El
  cliente usa `batch_size: 50`, así que un cliente sano nunca llega al límite.
- `main.py`: `include_router(sync.router)`.

**Notas de implementación (Fase 4, bloque F; sin cambio de requisitos):**
- **(a) Todas las rutas son `async def`.** El puerto de replicación es async y `_bulk_docs`
  ya lo era (nota de §2.3). Las demás rutas sólo esperan al puerto, así que tampoco ocupan
  un hilo del pool.
- **(b) Tope de cuerpo en toda ruta del canal:** 4 MiB, salvo `_local` (64 KiB). Va en una
  `APIRoute` propia (`SyncRoute`). FastAPI lee el cuerpo antes de las dependencias y
  convierte en 400 cualquier error durante esa lectura. Por eso la ruta lee el cuerpo con el
  tope, también sin `Content-Length` (chunked), y después lo entrega a FastAPI. Todas las
  operaciones declaran el 413.
- **(c) Dependencia de router `get_sync_user`** en lugar de `require_password_changed`. Hace
  las mismas comprobaciones (401/403), pero con `get_db` en `scope="function"`: la sesión
  SQL se cierra antes de enviar la respuesta, así que un `longpoll` no retiene una conexión
  del pool hasta 60 s.
- **(d) `CheckpointNotFound`** (404, `checkpoint-not-found`) es una entrada nueva del
  catálogo. Es la respuesta de `GET _local/{id}` sin checkpoint, que PouchDB interpreta como
  "empezar desde 0".
- **(e) Códigos de éxito:**
  - `_bulk_docs` responde 201 con la lista de rechazos (vacía si se aceptó todo), igual
    que CouchDB.
  - `PUT _local/{id}` responde 201.
- **(f) Comodín también en `/sync`,** sin barra final, además de `/sync/{rest:path}`.
- **(g) `id` y `rev` de `BulkDocsRejection` son `JsonValue`:** devuelven tal cual lo que
  envió el cliente, incluso un `_id` que no es texto (rechazado con `invalid-id`).

### 2.2 Fronteras de salida
| Frontera | Para qué | Implementación concreta |
|---|---|---|
| `ReplicationPort` (`core/ports/replication_port.py`, nuevo, async) | `db_info`, `changes` (iterador de bytes), `revs_diff`, `bulk_get`, `all_docs`, `bulk_docs_replicated` (escritura con `new_edits:false`), `get_local`, `put_local` | `adapters/replication_repository.py`: `httpx.AsyncClient` con la credencial admin; error de red o 5xx → `StorageUnavailable` (503); timeout de lectura del streaming = `timeout` pedido + margen. |
| `VaultPort.leaves(db, doc_id)` (método nuevo en el puerto de 0003) | todas las hojas vivas de una bóveda (`GET doc?open_revs=all&revs=true`) | `adapters/vault_repository.py` (síncrono, como el resto del puerto). |

### 2.3 Push validado (`services/sync_push.py`)
`SyncPushService(vaults: VaultService, port: VaultPort, replication: ReplicationPort, db, owner_id)`.
Por cada documento del lote, en orden, el resultado es "aceptado" o un rechazo
`{"id", "rev", "error": "forbidden", "reason": "<código>"}`. PouchDB trata `forbidden`
como *denied*: avisa al cliente, no reintenta y sigue con el resto del lote (RF-006).

1. **Id** (RF-007): `vault:{uuid}` canónico (`str(UUID(x)) == x`, como `VaultService._load`)
   o `_local/*`; cualquier otro → `invalid-id`. `_local/*` dentro de `_bulk_docs` →
   `invalid-id` (los checkpoints van por su propia ruta).
2. **Ya almacenada**: si su `_rev` ya está entre las revisiones del servidor, se acepta sin
   tocar nada (idempotencia al reenviar un lote cortado, spec §5).
3. **Lápida** (`_deleted: true`, P-5): sólo se admite si su cuerpo es exactamente
   `{_id, _rev, _revisions, _deleted}`, su padre es una hoja viva del servidor y queda **otra**
   hoja viva (cierra una rama de un conflicto). Si no → `delete-not-allowed` (el borrado de
   una bóveda es el *soft delete* de 0003, con `deleted_at`).
4. **Forma** (RF-005, R-9): claves permitidas `_id, _rev, _revisions, type, name,
   description, tags, owner_id, created_at, updated_at, deleted_at`; `_attachments`,
   `_conflicts` o cualquier otra → `validation-error:<clave>`. `type == "vault"`.
5. **Campos** (RF-005): las reglas de `core/schemas.py` (`VaultName`, descripción, tags) se
   aplican sobre el documento. Como el contenido de una revisión no puede cambiarse sin
   cambiar su `_rev` (P-3), el servidor **no normaliza**: si el valor normalizado difiere
   del recibido → `not-normalized:<campo>`; si incumple un límite →
   `validation-error:<campo>`. El cliente normaliza antes de escribir (§2.5).
6. **Servidor** (P2): `owner_id == sub` del token (si no → `owner-mismatch`); `created_at`,
   `updated_at` y `deleted_at` con el formato de `utc_now` (o `null` para `deleted_at`);
   `created_at` igual al de las hojas existentes de la bóveda (inmutable →
   `immutable-field:created_at`). Ninguna regla compara con el reloj (R-8).
7. **Reserva** (RF-008, P-4): si la revisión está viva y `deleted_at` es `null`,
   `VaultService._reserve(name, vault_id)` (reescribe la reserva propia, toma una huérfana,
   respeta el arrendamiento de 30 s); ocupada por otra bóveda → `vault-name-taken`.
8. **Escritura**: las revisiones aceptadas se escriben en un único
   `_bulk_docs` con `new_edits:false`. Un error de CouchDB en esa escritura → 503 de toda la
   petición (el cliente reintenta; los pasos 2 y 7 son idempotentes).
9. **Liberación**: por cada bóveda escrita, los nombres que usaban sus hojas antes de la
   escritura y ya no usa ninguna hoja viva y activa → `VaultService._release(name, id)`.

**Invariante de reservas (P-4):** *toda hoja viva con `deleted_at = null` tiene reservado
su nombre*. Con `new_edits:false` CouchDB no rechaza conflictos (no hay `If-Match` que
valga), así que cualquier rama perdedora puede pasar a ganadora (al cerrarse la otra rama);
si esa rama ya tiene su reserva, ninguna carrera deja dos bóvedas activas con nombres
equivalentes (RF-008). Para sostenerlo en la API REST también, `VaultService._holder`
pasa a mirar **todas** las hojas vivas de la bóveda (`VaultPort.leaves`) en lugar de sólo
la ganadora. Sin conflictos hay una sola hoja, así que el comportamiento REST no cambia.

**Notas de implementación (Fase 4, T-022/T-023; sin cambio de requisitos):**
- **Async:** `ReplicationPort` es async y `VaultPort`/`VaultService` son síncronos, así que
  `SyncPushService.push` es `async` y corre las llamadas síncronas en un hilo
  (`anyio.to_thread`). Por eso la ruta `_bulk_docs` será `async def`, a diferencia del resto
  de rutas no-stream de §2.1.
- **Reservas públicas:** `VaultService._reserve`/`_release` pasan a `reserve`/`release`. El
  push las usa desde otro servicio. Re-anclaje de 0003 al cierre (§7).
- **`_rev` y `_revisions`** se comprueban justo después del id: los pasos 2 y 3 dependen de
  ellos. Rechazo con `validation-error:_rev` o `validation-error:_revisions` si no están bien
  formados o no concuerdan (`start` = generación, `ids[0]` = hash).
- **Proyección de hojas por lote:** las reglas que miran "las hojas existentes" (lápida,
  `created_at`, liberación) usan las hojas del servidor más las revisiones ya aceptadas del
  mismo lote. Así se ve el estado que dejará la escritura. Cada `push` vuelve a leer las
  hojas.
- **Liberación (paso 9):** también se liberan los nombres que se reservaron dentro del lote y
  que no acaba usando ninguna hoja, por ejemplo una revisión intermedia superada por otra del
  mismo lote.
- Sólo `_deleted: true` es una lápida; cualquier otro valor de `_deleted` →
  `validation-error:_deleted`.

### 2.4 Filtros (`services/sync_filter.py`)
Funciones puras sobre los cuerpos de CouchDB, probadas sin red: `is_replicable_id`,
`changes_query` (lista blanca y acotado de parámetros, selector fijo),
`filter_revs_diff_request`, `filter_bulk_get_request` / `merge_bulk_get_response`,
`all_docs_query`, `sanitize_db_info`. Cuando lleguen los documentos dentro de las bóvedas,
se amplía `is_replicable_id` y la validación por `type` sin rehacer el canal (spec §2).

### 2.5 Frontend (`frontend/src/sync/`)
| Módulo | Responsabilidad | RF |
|---|---|---|
| `localDb.ts` | Réplica `new PouchDB("synapse")` (IndexedDB, sin `auto_compaction`, para conservar el cuerpo de los ancestros). `_local/synapse-owner` guarda el `sub` del dueño; si inicia sesión otro usuario → `destroy()` y se crea vacía antes de replicar. | RF-018, R-11 |
| `vaultRules.ts` | Reflejo en TS de las reglas de `core/schemas.py`: normalizar (strip, minúsculas y sin repetidos en tags), validar límites y caracteres de control, `nameKey` (NFKC + `toLocaleLowerCase` equivalente a `casefold` para los casos de la batería común, §5). | RF-005, RF-015 |
| `vaultStore.ts` | Operaciones de la UI sobre la réplica: `list(deleted)`, `get`, `create`, `update(id, data, rev)`, `softDelete`, `restore`; ids `vault:{uuid v4}`, `owner_id = sub`, marcas de tiempo con el formato de `utc_now`. Comprueba en local el nombre único entre bóvedas activas (aviso inmediato; la última palabra es del servidor). | RF-009, RF-011 |
| `remote.ts` | Base remota `"/sync/db"` con `fetch` propio: `credentials: "include"` y, ante 401, una renovación con `refreshSession()` de `api/auth.ts`; si falla, avisa "sesión caducada". | RF-002, RF-016 |
| `replicator.ts` | `localDb.sync(remote, { live, retry, batch_size: 50, back_off_function })`. Espera 1 s, 2 s, 4 s… máximo 60 s; vuelve a 1 s tras un `paused` sin error. Eventos → `status.ts`; `denied` → `rejections.ts`; sesión caducada → `cancel()` sin tocar la réplica y reanuda tras el login del mismo usuario. Un solo replicador por navegador: la pestaña que tiene el Web Lock `synapse-sync` replica y difunde el estado por `BroadcastChannel`; las demás leen la réplica y escuchan el estado. | RF-010, RF-016, RF-019, R-10 |
| `status.ts` | Estados `en línea` / `sin conexión` / `sincronizando` / `cambios pendientes` / `sesión caducada`, más contadores de rechazos y conflictos y la hora de la última sincronización correcta (en `_local/synapse-sync-state`). "Pendientes" = la secuencia local supera la última confirmada por el push. | RF-009, RF-010, RF-019 |
| `rejections.ts` | Lista persistente (`_local/synapse-rejections`: id, rev, motivo) de documentos rechazados; se limpia cuando una revisión posterior de ese id se escribe en el servidor. | RF-006 |
| `merge.ts` | Algoritmo puro de ADR-003 (§2.6). | RF-012…RF-014 |
| `conflicts.ts` | Detecta hojas en conflicto (`changes` con `conflicts: true` y un barrido al arrancar), obtiene el ancestro, aplica `merge.ts` y escribe el resultado; lo que no se combina queda en la lista de conflictos. | RF-012…RF-015 |
| `SyncProvider.tsx` / `useSync.ts` | Contexto React: estado, rechazos, conflictos, `requestLogout()`. | RF-009, RF-017 |
| `SyncStatusBar.tsx` | Indicador en el layout: estado, hora de la última sync, enlaces a rechazos y conflictos. | RF-009, RF-010, RF-019 |
| `RejectionsPage.tsx` | Lista de rechazos con el motivo en español y "Corregir" (abre el formulario de la bóveda). | RF-006 |
| `ConflictView.tsx` | Ambas versiones campo a campo; el usuario elige o combina; guardar pasa por `vaultRules` y el push. | RF-013, RF-015 |
| `LogoutDialog.tsx` | Aviso con pendientes: "Sincronizar y salir" (sólo con conexión; push de una vez y sale sólo si no queda nada pendiente ni rechazado, si no vuelve al aviso), "Salir y descartar", "Cancelar". Sin pendientes, sale directo. Al salir: `logout()` y `destroy()` de la réplica. | RF-017 |

**UI de bóvedas (P-1):** `VaultListPage`, `VaultForm`, `TrashPage` y `useVaultPages` leen y
escriben `vaultStore` en lugar de `api/vaults.ts`. La paginación por cursor deja de
hacer falta (la réplica es local): el listado se ordena como RF-024 de 0003 (`created_at`
desc, `_id` desc) y "Cargar más" pagina en memoria. El aviso de "la bóveda cambió" (412 en
0003) pasa a ser el 409 local de PouchDB, con el mismo texto y recarga. `api/vaults.ts` y su
test se retiran: la API REST no cambia y sigue para los agentes (`state.md`).

**Integración:** `App.tsx` envuelve las rutas protegidas en `SyncProvider` (dentro de
`RequireAuth`, que ya conoce el `sub` por `getMe()`) y añade las rutas `/rejections` y
`/conflicts`. `layout/AppLayout.tsx` muestra `SyncStatusBar` y su botón "Salir" llama
a `requestLogout()`.

**Mismo origen (enmienda del GATE 3):** sin nginx. En producción el proxy inverso es el
**Caddy externo** del usuario, fuera de este repo: debe llevar `/sync/*` al backend en el
mismo origen que la SPA, sin búfer de respuesta (`flush_interval -1`) y sin un tiempo
límite de respuesta menor de 90 s (`longpoll`). Estos requisitos se documentan
(tarea `[doc]`); no hay configuración de proxy en el repo para 0005. En desarrollo,
`vite.config.ts` añade `"/sync": BACKEND`. `/sync` es
sólo de la API: las vistas nuevas son `/rejections` y `/conflicts`, así que no hace falta
el `map` de `Accept` que necesita `/vaults` (ruta compartida entre API y SPA).

**Notas de implementación (Fase 4, bloque G; sin cambio de requisitos):**
- (a) **Dependencias.** Además de las dos de P-2, los tipos en desarrollo
  `@types/pouchdb-browser` 6.1.5 y `@types/pouchdb-adapter-memory` 6.1.6 (versiones exactas,
  sólo tipos). `tsconfig.json` activa `resolveJsonModule` para que `vaultRules.test.ts` lea la
  batería común `backend/tests/fixtures/vault_rules_cases.json` sin copiarla.
- (b) **Reglas espejo exactas a pydantic-core, no a Python.** El `strip` de pydantic es el de
  Rust (`str::trim`, propiedad Unicode `White_Space`): quita U+0085 y no quita U+001C…U+001F
  ni U+FEFF. Las longitudes cuentan puntos de código y se miden tras el `strip` y **antes**
  de pasar a minúsculas (`"İ"*32` es una etiqueta válida que se alarga al bajarla). La
  batería incluye esos casos.
- (c) **`nameKey`.** `toLocaleLowerCase` no equivale a `casefold`: NFKC, después una tabla de
  los 97 puntos de código donde `casefold` ≠ minúsculas (estables bajo NFKC), el pliegue de
  cherokee por rangos y por último `toLowerCase`. Comprobado contra todo Unicode: sólo
  difieren 29 puntos de código nuevos de Unicode 17 (el navegador puede conocerlos y Python
  3.14 no). Es un aviso local; la última palabra es del servidor.
- (d) **`localDb`.** Siempre que el dueño guardado no sea el `sub` (otro usuario o dueño
  desconocido) se destruye la base entera, también sus documentos `_local`, antes de crearla.
- (e) **`vaultStore`.** `update` valida sólo los campos enviados (el PATCH parcial de 0003).
  El orden de los errores es el de 0003: validación, bóveda en el estado pedido
  (`VaultNotFoundError`), `rev` actual (`VaultChangedError`, también ante el 409 de PouchDB) y
  nombre libre (`VaultNameTakenError`, también al restaurar). Cuota agotada →
  `StorageFullError` (`indexed_db_went_bad` con `reason: "QuotaExceededError"`).
- (f) **`merge`.** El paso 7 ("sólo difieren en `updated_at`", etiquetas en el mismo orden) se
  comprueba antes que el ancestro: así la convergencia no depende de conservarlo. Para el
  paso 4 un lado "cambió algún campo" si cambió `name`, `description` o el conjunto de
  `tags` (reordenarlas no es una edición); un cambio de `deleted_at` sin oposición se aplica
  también cuando es una restauración. El resultado manual indica el motivo (`no-ancestor`,
  `clash` o `invalid`) y los campos afectados.

**Notas de implementación (Fase 4, bloque H; sin cambio de requisitos):**
- (a) **`remote.ts`.** PouchDB sólo usa el adaptador HTTP con una URL absoluta
  (`origin + "/sync/db"`); `skip_setup: true` evita el `PUT` de creación de la base (el canal
  responde 404). El `fetch` propio envía siempre `credentials: "include"` y, ante un 401,
  renueva con `refreshSession()` y reintenta una vez; si sigue en 401 avisa "sesión caducada".
- (b) **`replicator.ts` escucha `sync.push` y `sync.pull`.** El `paused` del objeto `Sync`
  pierde el error que distingue "al día" de "sin conexión", así que se escuchan las dos
  replicaciones (existen en tiempo de ejecución, no en los tipos). `change` (→ `written`),
  `denied` y `checkpoint` sólo se leen del push.
- (c) **Saludo entre pestañas.** Una pestaña nueva envía un saludo por el `BroadcastChannel` y
  la que replica le contesta con su último `active`/`paused` de cada sentido (y "sesión
  caducada" si lo está); sin esto, con la replicación parada, no recibiría estado nunca.
- (d) **Reinicio de la espera.** `backOff` es la función del plan; la vuelta a 1 s la hace
  PouchDB (reinicia la espera a 0 al pasar a `active` tras un error). El test unitario cubre
  la función; el reinicio real lo comprueba la integración (bloque J).
- (e) **`status.ts`.** Estado inicial "sincronizando" (cada sentido intenta hasta su primer
  `paused`); un `error` (PouchDB abandonó) cuenta como "sin conexión". "Pendientes" compara
  la secuencia local con la del evento `checkpoint` del push (la secuencia local exacta que el
  servidor confirmó). Esa secuencia se persiste junto a la hora: el documento
  `_local/synapse-sync-state` es `{ last_sync_at, push_seq }` (amplía §3). Los contadores de
  rechazos y conflictos salen de `rejections.ts` y `conflicts.ts`; los junta `SyncProvider`.
- (f) **Documentos `_local` compartidos.** Todas las pestañas procesan los mismos eventos, así
  que `synapse-sync-state` y `synapse-rejections` se escriben leyendo, aplicando el cambio y
  reintentando ante el 409 de otra pestaña; el estado sólo avanza (hora y secuencia máximas).
- (g) **`rejections.ts`.** Una entrada por documento (la del último rechazo). Se quita con
  cualquier revisión de ese id que el push escriba: PouchDB sólo sube hojas, y las rechazadas
  nunca aparecen en `written`.
- (h) **`conflicts.ts` escribe con `new_edits: false`.** Un `bulkDocs` normal no es atómico por
  documento: si llegaba otra hija de `W`, la hija fallaba con 409 y la lápida sobre `L` se
  escribía igual, perdiendo los cambios de `L`. Con revisiones generadas en el cliente (como
  las trae la replicación) nada falla: un resultado que llega tarde queda como otra rama y la
  siguiente pasada lo funde. Las perdedoras se combinan de una en una (cada escritura cambia
  `W`); la lista manual vive en memoria y se recalcula al arrancar y en cada cambio.
- (i) **Resolución manual en `conflicts.ts`.** `resolve(id, loserRev, elección)` normaliza con
  `vaultRules` y escribe igual que la combinación automática; `ConflictView` (bloque I) sólo
  la llama. `vaultStore.ts` exporta `ID_PREFIX` para no repetir el prefijo.

**Notas de implementación (Fase 4, bloque I; sin cambio de requisitos):**
- (a) **Sesión y alcance.** `RequireAuth` publica el usuario verificado con `useMe()`; un
  fallo de la re-verificación que no es 401 conserva la sesión. `App.tsx` monta
  `SyncProvider` dentro de un `SyncScope` con `key={user_id}` (otro usuario, otra instancia)
  y `paused` mientras `must_change_password` (el canal respondería 403, RF-002).
- (b) **`SyncProvider`.** Las operaciones de arranque, cierre y logout pasan por una cola
  `serial()` para no solaparse. Los rechazos cuentan como cambios sin confirmar en el aviso
  de logout. El push único de "Sincronizar y salir" reutiliza `listenPush` (y `status.ts`
  exporta `seqNumber`). Si `logout()` falla no se destruye nada y se muestra el error. Un
  logout directo (sin pendientes) mantiene la fase "closed" con una guarda `leaving`.
  `SyncEnv` (réplica, remota y replicador) es la costura de pruebas; `App` la recibe en la
  prop `syncEnv`.
- (c) **`dataVersion` como refresco en vivo.** Cualquier escritura en la réplica incrementa
  `dataVersion`; lista y papelera se releen en silencio (sin volver a "cargando" y
  conservando cuántas se ven). El formulario no se recarga: lo escrito no se pierde y un
  cambio ajeno aparece al guardar como "la bóveda cambió".
- (d) **Páginas en memoria.** `useVaultPages` lee la lista entera y muestra páginas de 50;
  "Cargar más" no lee de nuevo, así que no tiene estado de "falló al cargar más". Una
  lectura anterior a la última se descarta por generación.
- (e) **Errores en las páginas.** `vaults/errors.ts`: `VaultChangedError` o
  `VaultNotFoundError` = vista desfasada (aviso y recarga); `StorageFullError` muestra el
  texto nuevo de R-11 ("No queda espacio en este dispositivo…"). Las páginas ya no tratan el
  401 ni "sesión cerrada": la réplica local no los produce y la sesión caducada la muestra
  la barra de estado.
- (f) **`vaults/fields.ts`** reúne los textos de las reglas por campo y la lectura de
  etiquetas y descripción; lo comparten `VaultForm` y `ConflictView`.
- (g) **`RejectionsPage`.** "Corregir" de una bóveda que está en la papelera lleva a
  `/vaults/trash` (el formulario sólo edita activas).
- (h) **`ConflictView`** trata el estado (activa / en la papelera) como un campo más que se
  elige.
- (i) **`SyncStatusBar`** es una región "Sincronización" con un `status` ("Sincronizado",
  "Sin conexión", con " · cambios pendientes" si los hay, "Sincronizando…", "Cambios
  pendientes", "La sesión caducó: inicia sesión para seguir sincronizando."), la hora de la
  última sincronización y enlaces con contador a rechazos y conflictos. `LogoutDialog` se
  monta dentro de la navegación "Cuenta" de `AppLayout`.

**Notas de implementación (Fase 4, bloque K; sin cambio de requisitos):**
- (a) **Costura de `remote.ts`.** `RemoteOptions` acepta `fetch` y `refresh` (por defecto el
  `fetch` global y `refreshSession()`): cada dispositivo simulado usa sus propias cookies y
  su propia red.
- (b) **`sync/resources.ts`.** La apertura de réplica, remota y replicador (`SyncEnv`,
  `openSyncResources`) y el push único (`pushOnce`) salen de `SyncProvider` para que la
  integración arme dispositivos sin React con el mismo código que la app.
- (c) **Usuarios por prueba.** `sync-integration.sh` levanta backend (SQLite temporal +
  CouchDB de test) y borra sólo las bases `synapse_user_*` que creó; no crea usuarios: cada
  prueba crea los suyos con la API de administración (el `globalSetup` cambia antes la
  contraseña del admin de arranque, RF-002 de 0002). Así ninguna prueba hereda datos de otra.
- (d) **Config propia.** `vitest.sync.config.ts` (entorno `node`, archivos en serie, URL y
  credenciales por `provide`/`inject`); la suite normal excluye `*.integration.test.ts`. La
  prueba de rendimiento sólo corre con `SYNC_PERF=1` (`npm run test:sync:perf`).
- (e) **Red simulada** (`test-utils/device.ts`). "Sin red" = el `fetch` del dispositivo falla
  con `TypeError` y aborta lo que está en curso —contando como en curso hasta que termina el
  cuerpo, porque el `_changes` longpoll del canal manda cabeceras al instante—; "backend
  caído" = peticiones a un origen muerto.
- (f) **Sesión invalidada a mitad.** Se provoca cambiando la contraseña desde otra sesión
  del mismo usuario; "volver a entrar" es cerrar, iniciar sesión y abrir la misma réplica
  (lo que hace la app al pasar por `/login`).
- (g) **Corte a mitad de lote.** La red se corta en el primer `checkpoint` del push; se
  comprueba que ningún id del primer lote vuelve a subir y que no hay duplicados.
- (h) **PouchDB en Node.** `pouchdb-browser` lee el global `self`; la preparación lo define
  antes de cargarlo. Las réplicas locales usan el adaptador `memory`.
- (i) **Defecto de PouchDB 9.** Tras escribir cada lote, `replicate` hace
  `src.info().then(...)` sin `catch`: si la red cae en ese momento queda un rechazo sin
  manejar (en el navegador, un "Uncaught (in promise)" en consola; la replicación sigue
  bien). **Decidido en la enmienda 1 (VC-7):** la contención vive en la app —
  `createRemoteDb` hace que las promesas de `info()` de la remota nazcan observadas— y el
  envoltorio del adaptador `http` de las pruebas de integración desaparece (§10). Reportarlo
  aguas arriba queda a decisión del usuario.
- (j) **Cobertura** excluye `src/test-utils/**` (andamiaje de pruebas, no código de la app).
- (k) **`synced()` del dispositivo** espera a que el `push_seq` persistido alcance la
  secuencia local del momento de la llamada (el "pendientes" se recalcula de forma
  asíncrona y podía parecer al día antes de tiempo).
- (l) **Aviso de PouchDB filtrado.** `onConsoleLog` descarta "The above 404 is totally
  normal…" (lectura de un `_local` aún inexistente).

### 2.6 Algoritmo de combinación (`merge.ts`, ADR-003)
Entrada: la ganadora `W` (la que elige CouchDB/PouchDB, determinista e igual en todas las
réplicas), cada perdedora viva `L` y el ancestro común `A` (la revisión más reciente que
aparece en el `_revisions` de ambas, leída de la réplica local con `get(id, { rev })`).
1. **Sin ancestro** (compactado o nunca visto por esta réplica) → conflicto manual (RF-013).
2. `name` y `description`: si `W = L`, ese valor; si sólo uno difiere de `A`, el que cambió;
   si ambos difieren entre sí y de `A` → **choque** → conflicto manual (RF-013).
3. `tags`: altas = (`W`−`A`) ∪ (`L`−`A`); bajas = (`A`−`W`) ∪ (`A`−`L`); resultado =
   (`A` ∪ altas) − bajas, en el orden de `W` y después las altas de `L` (RF-012). Una
   etiqueta quitada en un lado no reaparece; nunca hay choque en tags.
4. `deleted_at` (RF-014): si un lado la borró y el otro cambió algún campo respecto a `A`
   → `null` (gana la edición: restaurada). Si sólo un lado la borró y el otro no cambió nada
   → borrada. Si ambos → la de `W`.
5. `created_at` y `owner_id` no cambian; `updated_at` = ahora (es una edición nueva).
6. El resultado pasa por `vaultRules` (p. ej. más de 20 tags tras combinar); si falla →
   conflicto manual con el motivo (RF-015).
7. Escritura atómica local (`bulkDocs`): el resultado como hija de `W` y una lápida sobre
   `L`. Si `W` y `L` sólo difieren en `updated_at`, sólo la lápida. Como todas las réplicas
   eligen el mismo `W`, dos dispositivos que resuelven a la vez nunca cierran las dos ramas;
   sus resultados, si chocan, son iguales salvo `updated_at` y la siguiente pasada los funde
   (convergencia).

La resolución manual (RF-013) escribe igual: elección del usuario como hija de `W` y lápida
sobre `L`. El push la valida (RF-015) y, si se rechaza (p. ej. el nombre restaurado está
ocupado), sigue el flujo de RF-006.

## 3. Modelo de datos
- **Sin documentos ni campos nuevos en CouchDB.** Bóveda y reserva como en 0003.
- **Checkpoints** `_local/{id_de_replicación}` en la base del usuario (los escribe PouchDB;
  no se replican).
- **Réplica local:** documentos `vault:*`; `_local/synapse-owner` `{ sub }`,
  `_local/synapse-sync-state` `{ last_sync_at }`, `_local/synapse-rejections`
  `{ items: [{ id, rev, reason }] }`. Los `_local` no se replican.
- **Ancestro (ADR-003):** se lee del árbol de revisiones de la réplica local, que conserva
  los cuerpos de las revisiones no hoja mientras no se compacte (por eso sin
  `auto_compaction`). Sin almacenamiento propio de "versión base". Coste: la réplica guarda
  las revisiones intermedias de las bóvedas (pequeñas; R-11 lo vigila con la feature de
  documentos).
- **Versión de esquema (R-9):** sin campo `schema_version` por ahora. La forma cerrada del
  push (paso 4) rechaza con motivo cualquier documento de un cliente con otro esquema; un
  cambio de esquema futuro llega con su propia spec.
- Sin cambios en PostgreSQL ni migraciones.

## 4. Contratos
| Archivo en `contracts/` | Frontera | Gate(s) |
|---|---|---|
| `0005-sync/contracts/openapi.yaml` | `/sync/**` (las rutas de §2.1, sin la comodín) | test de deriva (`test_contract.py`); Spectral cuando esté instalado |

- `scripts/export_openapi.py`: `"0005-sync": {"paths": ("/sync",), "schemas": ()}` en
  `FEATURES`.
- Los cuerpos del protocolo se declaran con esquemas abiertos (`additionalProperties`) donde
  CouchDB los define; se cierran los que fija este plan: `BulkDocsRequest {docs, new_edits:
  false}`, `BulkDocsRejection {id, rev, error: "forbidden", reason}` con `reason` en un
  `enum`/patrón de los códigos de §2.3 (`invalid-id`, `validation-error:<campo>`,
  `not-normalized:<campo>`, `owner-mismatch`, `immutable-field:created_at`,
  `vault-name-taken`, `delete-not-allowed`).
- Errores: `SESSION_ERRORS`, `PasswordChangeRequired`, `SyncEndpointNotFound` (404,
  `sync-endpoint-not-found`, nuevo), `PayloadTooLarge` (413, `payload-too-large`, nuevo),
  `ValidationFailed` (422), `StorageUnavailable` (503). Fase 4, bloque F: además
  `CheckpointNotFound` (404, `checkpoint-not-found`, nuevo; nota (d) de §2.1).

## 5. Estrategia de pruebas (TDD)
| Zona | Qué se prueba | Herramienta |
|---|---|---|
| Núcleo / filtros | `sync_filter.py`: ids replicables, lista blanca de parámetros, selector fijo, recorte de `_revs_diff`/`_bulk_get`/`_all_docs`, `db_info` sin `doc_count` | pytest unit (`test_sync_filter.py`) |
| Coordinación | `SyncPushService` con dobles de `VaultPort`/`ReplicationPort`: cada código de rechazo, ya almacenada, lápidas, reservas por rama viva y liberación, lote mixto (rechaza uno, guarda el resto), carreras intercaladas (rama perdedora que pasa a ganadora; dos lotes con el mismo nombre) | pytest + dobles (`test_sync_push.py`) |
| `VaultService` | `_holder` con varias hojas (la API REST no reasigna una reserva usada por una rama perdedora) y sin conflictos (sin cambio de comportamiento) | pytest (`test_vault_service.py`, tests añadidos) |
| Adaptadores | `ReplicationRepository` y `VaultRepository.leaves` contra **CouchDB real**: `new_edits:false` con ramas en conflicto, `_changes` en streaming con `longpoll`, 503 con CouchDB inaccesible | pytest integración (`test_sync_repository.py`) |
| Rutas | cada ruta y código del contrato, 401/403 en todas (también la comodín), 404 fuera del subconjunto (incluidos `PUT /sync/db/{id}`, `DELETE _local`, `_design`, `_find`, `_purge`, base en la URL), 413, 422 con `new_edits:true`, protocolo completo simulando las peticiones de PouchDB | pytest + TestClient + CouchDB real (`test_sync_api.py`) |
| Aislamiento (RNF-003) | A y B con datos; B no ve nada de A por ninguna ruta, no puede escribir en la base de A (ni nombrándola en la URL, ni con `owner_id` de A), y `vault-name:*`/`_design/*` no aparecen nunca; la base de A no cambia | `test_sync_isolation.py` |
| Reglas espejo | la misma batería de casos (JSON en `backend/tests/fixtures/vault_rules_cases.json`) contra `core/schemas.py` y contra `vaultRules.ts`: mismo veredicto y misma normalización | pytest + vitest |
| Frontend unit | `merge.ts` (tabla de casos de ADR-003 incluida la convergencia), `vaultRules.ts`, `vaultStore.ts`, `status.ts`, `rejections.ts`, backoff con temporizadores falsos, cambio de usuario, diálogo de salida, vistas | vitest + Testing Library + PouchDB en memoria |
| Sync real (RNF-002) | dos réplicas PouchDB **reales** (adaptador en memoria) con el `replicator.ts` real, contra el backend real (uvicorn) y CouchDB real: crear/editar/borrar/restaurar sin conexión y reanudar; rechazo por nombre duplicado; conflicto combinable, choque manual, borrado vs edición; corte a mitad de lote; sesión caducada y reanudación | vitest entorno `node` (`sync/*.integration.test.ts`) + `frontend/scripts/sync-integration.sh` (levanta el backend contra la base de test) |
| Rendimiento (RNF-001) | 20 ediciones en la réplica 1; p95 del tiempo hasta verlas en la réplica 2 ≤ 5 s | mismo entorno, marcado `perf` |

## 6. Secuenciación
1. Contrato: `FEATURES` + test de endpoints de 0005 (rojo) → esqueleto de `routers/sync.py`
   con la lista de rutas → export.
2. Filtros: tests (rojo) → `sync_filter.py`.
3. Adaptadores: tests de integración (rojo) → `ReplicationPort`/`ReplicationRepository`,
   `VaultPort.leaves`.
4. `VaultService._holder` con todas las hojas: tests (rojo) → cambio.
5. Push: tests con dobles (rojo) → `SyncPushService`, errores nuevos.
6. Rutas, aislamiento y protocolo completo (rojo) → `routers/sync.py`, `main.py`;
   re-export del contrato.
7. Frontend base: dependencia PouchDB (P-2); tests (rojo) → `vaultRules`, `localDb`,
   `vaultStore`, `merge`.
8. Replicador, estado, rechazos, conflictos (rojo) → módulos de `sync/`.
9. UI: tests (rojo) → `SyncProvider`, barra, vistas, diálogo; páginas de bóvedas sobre
   `vaultStore` (P-1); `App.tsx`, `AppLayout.tsx`; retirar `api/vaults.ts`.
10. Mismo origen: `vite.config.ts`; requisitos del Caddy externo documentados (sin nginx).
11. Sync real y rendimiento (RNF-001/002) con `sync-integration.sh`.
12. Diagrama: actualizar la tarjeta de estado del candidato y regenerar.
13. Tareas `[doc]` de §8 y re-anclajes (§7).

## 7. Seguimiento de complejidad / riesgos y decisiones para el GATE 2
| Excepción / riesgo | Justificación |
|---|---|
| **P-1 · Tocar código de SPEC-0003 (`verified`)** | RF-009 exige que la UI lea y escriba la réplica local, y RF-008 que las reservas consideren todas las ramas; eso cambia `frontend/src/vaults/**`, retira `frontend/src/api/vaults.ts` y su test, y añade `VaultPort.leaves` y `_holder` multi-hoja en `vault_port.py`, `vault_repository.py` y `vault_service.py`. **Recomendación (a):** hacerlo aquí y, al cerrar 0005, mover el `anchor_commit` de 0003 con una nota (mismo procedimiento que PLAN-0003 §7 hizo con 0002). Ningún RF de 0003 cambia: sus pantallas siguen cumpliendo RF-018/019/020/028 con la réplica. **Alternativas:** (b) duplicar las pantallas en `sync/` y dejar las de 0003 muertas (dos fuentes de verdad, Art. 12); (c) mantener la UI sobre REST y usar la réplica sólo como caché (no cumple la escritura sin conexión que el usuario eligió en D-2). |
| **P-2 · Dependencia nueva `pouchdb-browser` (y `pouchdb-adapter-memory` sólo en tests)** | Implementar el protocolo de replicación a mano es justo lo que ADR-002 descartó. Versión exacta fijada (`9.0.0`, la estable actual; se comprueba al instalar). Aumenta el bundle (~45 kB gzip). |
| P-3 · El servidor no normaliza en el push | El contenido de una revisión no puede cambiar sin cambiar su `_rev`: si el proxy normalizara, servidor y cliente tendrían contenidos distintos bajo la misma revisión. El cliente normaliza antes de escribir y el servidor rechaza lo no normalizado (`not-normalized:<campo>`). Para el usuario es igual que en REST porque su cliente ya normaliza. |
| P-4 · Una reserva por cada rama viva y activa | Más estricto que "una por bóveda": una rama perdedora con un nombre que ya usa otra bóveda se rechaza al llegar (RF-006) en lugar de esperar a la resolución. Es lo que impide que una rama perdedora se convierta en ganadora sin reserva (§2.3). |
| P-5 · Lápidas sólo para cerrar ramas en conflicto | El borrado de bóvedas sigue siendo el *soft delete* de 0003; una lápida que dejaría la bóveda sin hojas vivas se rechaza. **Riesgo residual aceptado:** dos lápidas *simultáneas* de un cliente modificado sobre las dos ramas podrían borrar del todo una bóveda propia. No afecta a otro usuario (P2) y el cliente oficial nunca lo hace (siempre conserva la ganadora determinista, §2.6). **Enmienda 1 (VC-2):** dos dispositivos oficiales que resuelven a la vez el mismo conflicto escribían lápidas con revisiones aleatorias distintas sobre la misma rama y la segunda se rechazaba (`delete-not-allowed`, persistente). Se corrige en el origen con revisiones deterministas en el cliente (§10): las dos lápidas son la misma revisión y la segunda se acepta sin escribir (paso 2). |
| Re-anclaje de 0002 | 0005 modifica `App.tsx`, `layout/**` y `scripts/export_openapi.py` (de `covers` de 0002) y `core/errors.py`/`main.py` (sin dueño). Al cerrar, se mueve el ancla de 0002 con una nota, como en 0003/0004. |
| `frontend/vite.config.ts`, `package.json` sin `covers` | Configuración compartida por varias features (precedente PLAN-0003 §14): no se anclan a 0005; se documentan en `frontend/src/README.md`. |
| Tests de sync real necesitan el backend levantado | `sync-integration.sh` lo levanta contra la base de test (SQLite, excepción P5) y CouchDB de test; fuera de `npm test` por defecto, obligatorio en la verificación. |
| Streaming de `_changes` | Puerto async propio para no bloquear hilos; el resto sigue síncrono como 0003. |
| Ancestro desde el árbol local | Sin `auto_compaction`; si falta, decide el usuario (RF-013), así que nunca se pierde una versión. |

## 8. Impacto en documentación (Art. 11)
| Documento del mapa | Qué cambia | Acción |
|---|---|---|
| `0005-sync/contracts/openapi.yaml` | rutas `/sync/**` y códigos de rechazo | crear (export) |
| `backend/README.md` | sección "Sincronización (SPEC-0005)": rutas, lista blanca, push validado, códigos `reason`, límites, requisitos del proxy inverso externo (Caddy) para `/sync/*` | actualizar |
| `backend/app/{core/ports,adapters,services,routers}/README.md` | `ReplicationPort`, `ReplicationRepository`, `VaultPort.leaves`, `sync_push`, `sync_filter`, `sync.py` | actualizar |
| `frontend/src/README.md` | carpeta `sync/`, réplica local, estados, rechazos y conflictos, cierre de sesión, proxy `/sync` de Vite y requisitos del Caddy externo, pantallas de bóvedas sobre la réplica | actualizar |
| `frontend/README.md` o `package.json` scripts | `npm run test:sync` y `sync-integration.sh` | actualizar |
| `0005-sync/diagrams/` (+ `README.md`) | tarjeta de estado (ya no "falta el Gate 1") y rutas exactas | regenerar |
| `ARCHIFY.md` | estado del diagrama de sync | actualizar |
| `0003-vault-crud/spec.md` y `0002-auth/spec.md` | nota de re-anclaje (sin cambio de requisitos) | actualizar en el cierre |
| `.harness/memory/state.md` | estado de 0005; hazards 1 y 3 mitigados | actualizar en el cierre |

## 9. Implementación por requisito

### Implementación de RF-001
`get_sync_db(current_user)` en `routers/sync.py`; la URL del cliente es siempre `/sync/db`. Tests: `test_sync_isolation.py` (nombrar otra base en la URL → 404; los datos salen siempre de la base del token).
### Implementación de RF-002
`dependencies=[Depends(require_password_changed)]` en el router, comodín incluida. Tests: `test_sync_api.py`, sin cookie → 401 y con cambio pendiente → 403 en cada ruta.
### Implementación de RF-003
Rutas explícitas de §2.1 y comodín final → `SyncEndpointNotFound`. Tests: `test_sync_api.py` con `PUT /sync/db/x`, `DELETE /sync/db/_local/x`, `_find`, `_purge`, `_design/vaults`, `_security`; comprobar que no llega nada a CouchDB (doble del puerto en la prueba de ruta). Enmienda 1: identificadores `_local` fuera de formato (`.`, `..`, `%2E%2E`) → `SyncEndpointNotFound` (§10, VC-1).
### Implementación de RF-004
`sync_filter.py` (selector fijo, recortes) + rutas. Tests: `test_sync_filter.py`; `test_sync_api.py` con una reserva y el diseño `_design/vaults` presentes, que no aparecen en `_changes`, `_all_docs` ni `_bulk_get`.
### Implementación de RF-005
`SyncPushService` pasos 4–7 reutilizando `core/schemas.py` y `VaultService._reserve`. Tests: `test_sync_push.py` (cada regla), `test_sync_api.py` (documento válido guardado; inválido no).
### Implementación de RF-006
Rechazo por documento `forbidden` + `reason` (servidor); `rejections.ts`, `RejectionsPage.tsx` y "Corregir" (cliente). Tests: lote mixto en `test_sync_push.py`; vitest de `rejections.ts` y la vista; integración: nombre duplicado entre dos réplicas → la segunda ve el rechazo, conserva su cambio y al renombrar se sincroniza.
### Implementación de RF-007
Paso 1 del push y `_revs_diff` (no `vault:*` → `missing`). Tests: `vault-name:x`, `_design/x`, `vault:` con UUID no canónico, `foo` → `invalid-id`.
### Implementación de RF-008
Pasos 7 y 9 del push, invariante de P-4 y `_holder` multi-hoja. Tests: `test_sync_push.py` (renombrar, borrar, restaurar, rama perdedora que pasa a ganadora), `test_vault_service.py` (REST no reasigna una reserva de rama perdedora), integración REST + sync con el mismo nombre → nunca dos activas.
### Implementación de RF-009
`localDb.ts`, `vaultStore.ts`, páginas de bóvedas sobre la réplica, `SyncStatusBar.tsx`. Tests vitest: sin red se listan y editan bóvedas y se ve "sin conexión" con la hora de la última sync.
### Implementación de RF-010
`replicator.ts` (`live`, `retry`), `status.ts` (pendientes). Tests: vitest del estado; integración: editar sin conexión, volver la red y ver "pendientes" hasta confirmar.
### Implementación de RF-011
`softDelete`/`restore` de `vaultStore.ts` (cambian `deleted_at`, se replican como edición). Tests: integración, borrar en la réplica 1 → papelera en la réplica 2; restaurar → vuelve.
### Implementación de RF-012
`merge.ts` pasos 2–3 y 5–7; `conflicts.ts`. Tests: tabla de `merge.test.ts` (campos distintos, tags altas/bajas, convergencia de dos resoluciones); integración con dos réplicas editando campos distintos.
### Implementación de RF-013
`merge.ts` pasos 1, 2 y 6 → `ConflictView.tsx`. Tests: mismo campo y sin ancestro → conflicto manual, ambas versiones conservadas en cualquier orden de sincronización; la vista guarda la elección.
### Implementación de RF-014
`merge.ts` paso 4. Tests: borrar en una réplica y editar en otra → restaurada con la edición; con el nombre ya ocupado → rechazo (RF-015).
### Implementación de RF-015
La resolución se escribe como una edición más y pasa por el push validado. Tests: integración, resolución con nombre ocupado → rechazo visible. Enmienda 1: revisiones deterministas en `conflicts.ts`; integración con dos dispositivos que resuelven a la vez (§10, VC-2).
### Implementación de RF-016
`remote.ts` (401 → `refreshSession()`; si falla, sesión caducada), `replicator.ts` (`cancel` sin borrar). Tests: vitest con 401 tras refresh fallido → se detiene y conserva pendientes; tras login del mismo usuario reanuda; integración con cookie invalidada.
### Implementación de RF-017
`LogoutDialog.tsx` + `requestLogout()`; `AppLayout.tsx` lo usa. Tests vitest: sin pendientes sale y destruye; con pendientes, las tres opciones (sin red, dos); "Sincronizar y salir" con un rechazo vuelve al aviso. Enmienda 1: `requestLogout` lee el estado actual; `pushOnce` con pruebas propias (§10, VC-3, VC-4). Enmienda 2: la decisión pasa a `hasUnconfirmed()` en `resources.ts`, con pruebas propias; sin estado legible, avisa (§11, VD-1…VD-3). Enmienda 3: `unconfirmedState()` distingue la réplica ilegible; si la réplica no se borra tras cerrar la sesión, va al login con `LocalCopyNotice` (§12, VE-1…VE-3). Enmienda 4: la réplica descartada queda marcada como borrado pendiente y no se reutiliza; guarda de `leaving` en todas las entradas de la salida (§13, VF-1…VF-4).
### Implementación de RF-018
`localDb.ts` (`_local/synapse-owner`). Tests vitest: usuario distinto → réplica destruida antes de replicar; mismo usuario → se conserva. Enmienda 4: con la marca de borrado pendiente se destruye también para el mismo usuario (§13, VF-4).
### Implementación de RF-019
`back_off_function` (1 s → 60 s, reinicio tras éxito) y 503 → "sin conexión". Tests: vitest con temporizadores falsos (secuencia 1, 2, 4… 60, 60; reinicio); `test_sync_api.py` con CouchDB inaccesible → 503 problem+json.
### Implementación de RNF-001
`sync/sync.perf.integration.test.ts` (marca `perf`): p95 ≤ 5 s entre dos réplicas reales vía el proxy.
### Implementación de RNF-002
`sync/*.integration.test.ts` + `frontend/scripts/sync-integration.sh`: PouchDB real, replicador real, backend y CouchDB reales; ningún doble del protocolo.
### Implementación de RNF-003
`backend/tests/test_sync_isolation.py` (todas las rutas) y un caso de integración con dos usuarios en dos réplicas.

`covers` de `spec.md` (se fija en este plan): `backend/app/routers/sync.py`,
`backend/app/services/sync_*.py`, `backend/app/core/ports/replication_port.py`,
`backend/app/adapters/replication_repository.py`, `backend/tests/test_sync*.py`,
`backend/tests/fixtures/vault_rules_cases.json`, `frontend/src/sync/**`,
`frontend/scripts/sync-integration.sh`, `.harness/specs/0005-sync/contracts/**`,
`.harness/specs/0005-sync/diagrams/**`.
Archivos compartidos que 0005 modifica sin reclamarlos: de 0003 (P-1) `vault_service.py`,
`vault_port.py`, `vault_repository.py`, `test_vault_service.py`, `frontend/src/vaults/**`,
`frontend/src/api/vaults.ts` (se retira); de 0002 `App.tsx`, `layout/**`,
`scripts/export_openapi.py`, `test_contract.py`; sin dueño `core/errors.py`, `main.py`,
`vite.config.ts`, `package.json`. Se re-anclan al cierre (§7).

## 10. Enmienda 1 · Correcciones de la verificación adversarial (APROBADA el 2026-10-13)
La Fase 5 sobre `4476820` devolvió REJECTED (3 mayores, 5 menores; `history.md`). El
usuario aprobó corregir todo de raíz con TDD y, para VC-7, contener el defecto en la app.
Bloque M de `tasks.md` (T-085 en adelante). Ningún requisito nuevo: RF-003, RF-015 y
RF-017 se precisan (enmienda 1 de la spec).

**VC-1 · `_local/..` alcanzaba la raíz de la base (mayor, RF-003/RF-004).** `httpx`
normaliza los segmentos punto: `/db/_local/..` → `/db` (db info sin sanear) y `PUT` → crear
base con la credencial admin. Dos barreras:
- (a) **Ruta.** `sync_filter.checkpoint_id(local_id)` exige el formato de PouchDB
  (`md5` en base64 con `/`→`.` y `+`→`_`): `^(?!\.\.?$)[A-Za-z0-9._=-]{1,128}$`. Si no casa
  → `SyncEndpointNotFound` (la ruta no existe para ese id), declarado en las dos rutas
  `_local`. Starlette decodifica `%2E%2E` antes de casar, así que la regla lo cubre; `%2F`
  ya cae en el comodín.
- (b) **Adaptador.** `_local_path` codifica además `.` como `%2E`: ningún id llega a
  `httpx` con un segmento punto aunque cambie la regla (a). Comprobado contra CouchDB 3:
  `PUT _local/a%2Eb` guarda `_local/a.b`.

**VC-2 · Resolución simultánea en dos dispositivos (mayor, RF-015, P-5).** `child()` usaba
`crypto.randomUUID`: dos dispositivos que cerraban la misma rama escribían lápidas distintas
y el servidor rechazaba la segunda (dejaría la rama sin hojas vivas). Se corrige en el
origen con **revisiones deterministas**, como `deterministic_revs` de CouchDB/PouchDB:
- `child(parent, body)` pasa a ser asíncrona; el hash es SHA-256 (`crypto.subtle`) de un
  JSON canónico (claves ordenadas) con la revisión padre y el cuerpo nuevo (incluido
  `_deleted`), recortado a 32 hexadecimales.
- Lápidas iguales → misma revisión → el servidor la acepta sin escribir (paso 2 del push).
  Dos combinaciones que sólo difieren en `updated_at` dan dos hijas de `W` que la siguiente
  pasada cierra con el paso 7 (ganadora determinista), otra vez con lápidas iguales.
- **Alternativa descartada:** hacer idempotente la lápida en el servidor (aceptar una lápida
  sobre una rama ya cerrada). Ensancha la regla de P-5 para todos los clientes y deja dos
  revisiones distintas para el mismo hecho; la determinista no cambia el servidor.
- Prueba de integración con dos `Device` que resuelven el mismo conflicto a la vez: sin
  rechazos, la misma ganadora en ambos y "Sincronizar y salir" funciona.

**VC-3 · La guarda de `pushOnce` sin pruebas (mayor, RF-017/RF-018).** Tests unitarios de
`pushOnce`: un `denied` durante el push o un lote parcial (`last_seq` por debajo de la
secuencia local) → `false`; e integración de "Sincronizar y salir" con un rechazo → vuelve
al aviso y la réplica sigue intacta.

**VC-4 · Aviso de salida con estado viejo (menor, RF-017).** En el producto,
`requestLogout` pasa a asíncrona y decide con el estado actual: `status.refresh()` relee
`db.info()` antes de comparar con la secuencia confirmada y `rejections.settled()` espera las
escrituras de rechazos en curso. En el test, se espera un estado observable antes de pulsar
(nunca se pulsa dentro de `waitFor`, que reintentaría la acción).

**VC-5 · Entradas del cliente → 503 (menor).** El 503 queda para el almacén caído:
- Revisiones del push sólo hexadecimales (`[0-9a-f]+`), como las generan CouchDB, PouchDB y
  el cliente determinista; lo demás → `validation-error:_rev` (o `validation-error:_revisions` si falla un ancestro).
- Cuerpo de `PUT _local/{id}`: los únicos campos reservados admitidos son `_id` (igual a
  `_local/{id}`) y `_rev` (`0-N`); lo demás → `InvalidSyncRequest` (422) con `errors` de
  texto fijo, sin reenviar. Comprobado contra CouchDB 3: `_deleted` daba 200 (fuera de lo
  esperado), un `_rev` mal formado 400/500 y un `_*` desconocido 400; los `_local` no
  comprueban la revisión, así que no hay 409 que traducir.

**VC-6 · Límites atados a la constante (menor).** Los tests de límites usan los literales
200, 4 MiB y 64 KiB: cambiar la constante rompe la prueba.

**VC-7 · Defecto de PouchDB 9 (menor, decisión del usuario).** `ObservedPromise` y
`observeInfo` pasan de `test-utils/integration-setup.ts` a `sync/remote.ts`;
`createRemoteDb` los aplica a la instancia remota. Test en `remote.test.ts`; el envoltorio
del adaptador en la preparación de integración se retira (§2.5 nota (i)).

**VC-8 · El gate acepta una spec cerrada sin RF (menor).** `check.sh` falla si una spec
`implemented` o `verified` no define ningún `RF-NNN`.

Documentación afectada: `backend/README.md` y `backend/app/{services,adapters}/README.md`
(formato de `_local`, revisiones hexadecimales), `frontend/src/README.md` (revisiones
deterministas, contención de PouchDB), `0005-sync/contracts/openapi.yaml` (404 en `_local`).

## 11. Enmienda 2 · Menores de la verificación 2 (APROBADA el 2026-10-14)
La Fase 5 sobre `ba54882` devolvió APPROVED con cinco menores (`history.md`). El usuario
aprobó corregirlos con TDD. Bloque N de `tasks.md` (T-102 en adelante). Ningún requisito
nuevo: RF-017 se precisa (enmienda 2 de la spec).

**Decisión de salida en un solo lugar (VD-1, VD-3).** La lógica de `requestLogout` (esperar
los rechazos en curso, releer la secuencia, contar los rechazos) estaba dentro del
`useMemo` de `SyncProvider`, sin pruebas que aislaran cada paso. Pasa a
`hasUnconfirmed(resources)` en `resources.ts`, junto a `pushOnce`, su pareja:
- **VD-1.** `resources.test.ts` prueba que un rechazo aún en escritura cuenta: con la
  escritura del almacén retenida, `hasUnconfirmed` espera a `rejections.settled()` y da
  `true`; sin esa espera daría `false` (mutación detectada).
- **VD-3.** Si releer el estado falla (`db.info()` de IndexedDB con error), devuelve `true`
  y registra el error: no se puede afirmar que todo esté confirmado, así que se avisa
  (RF-017, enmienda 2). `requestLogout` nunca deja un rechazo sin manejar.
- **Alternativa descartada:** un `try/catch` dentro de `requestLogout`. Arregla el síntoma
  pero deja la decisión sin pruebas unitarias; con la función separada, `SyncProvider` sólo
  elige entre el aviso y la salida.

**VD-2 · `ok:false` sin fallos.** Caso de `pushOnce` con `ok: false`,
`doc_write_failures: 0` y la secuencia recorrida → `false`; quitar `result.ok` de la guarda
lo rompe.

**VD-4 · `canonical()` sin pruebas.** Se exporta y se prueba: el orden de las claves no
cambia el texto; una clave `undefined` se omite; un `undefined` dentro de una lista pasa a
`null` (como `JSON.stringify`; antes daba `[1,]`, que no es JSON). Los cuerpos reales no
llevan `undefined` en listas (`tags` son textos), así que ninguna revisión ya escrita
cambia.

**VD-5 · 409 en `put_local` y `rf_cov` del gate.**
- *409.* CouchDB 3 no comprueba la revisión de un `_local` (sondeo de la enmienda 1 y de
  esta: `PUT` con `_rev` viejo → 201; ya fijado por
  `test_rf_010_local_put_with_stale_rev_keeps_the_last_write`). Un 409 sería, por tanto,
  una respuesta inesperada del almacén y le corresponde el 503 como a cualquier otra
  (`_check_status`). Se decide así, sin código nuevo: el test de estados inesperados añade
  el 409 y el comentario de `_check_status` deja de citar el 409 como estado que todo
  llamador interpreta. **Alternativa descartada:** traducir el 409 a un 4xx propio; sería
  código para una respuesta que el almacén no produce.
- *Gate.* `rf_cov` contaba cualquier `RF-NNN` de la tabla de cobertura, aunque la spec no
  lo definiera: una fila de un RF ajeno podía tapar uno propio sin cubrir. Pasa a contar
  sólo los RF de la tabla que la spec define (intersección); probado en una copia.

Documentación afectada: `frontend/src/README.md` (`hasUnconfirmed`, aviso sin estado
legible), `backend/app/adapters/README.md` si cita el 409 de `_local`.

## 12. Enmienda 3 · Correcciones de la verificación 3 (APROBADA el 2026-10-14)
La Fase 5 sobre `c55a292` devolvió REJECTED por un mayor (VE-1) y cinco menores
(`history.md`). El usuario eligió la opción (a) para VE-1 y pidió tratar VE-6 aparte (test
inestable previo de `VaultListPage`; backlog de `state.md`). Bloque O de `tasks.md` (T-110
en adelante). RF-017 se precisa (enmienda 3 de la spec); ningún requisito nuevo.

**VE-1 · La réplica no se borra tras cerrar la sesión (opción a).** En `exit()` de
`SyncProvider`, `close()` + `destroyLocalDb()` no tenían manejo de errores: con IndexedDB en
error la sesión ya estaba cerrada en el servidor, pero `leaving` y la fase `exiting` se
quedaban colgados, no se navegaba y `LogoutDialog` dejaba un rechazo sin manejar.
- `exit()` captura el fallo del borrado, lo registra y navega igualmente a `/login` con el
  estado de navegación `{ localCopyKept: true }`. `leaving` sigue en `true`: la sesión ya
  no existe y no hay segunda salida que lanzar; el proveedor se desmonta al cambiar de ruta.
  `exit()` deja de poder rechazar.
- `sync/LocalCopyNotice.tsx` lee ese estado y muestra «No se pudo borrar la copia local de
  este dispositivo» (`role="alert"`). `App.tsx` la monta en la ruta `/login` junto a
  `LoginPage`: el aviso pertenece a la sincronización y `LoginPage` (0002) no cambia.
- La copia que queda la resuelve el próximo inicio de sesión: otro usuario → RF-018 la
  borra antes de replicar; el mismo → la reutiliza (sin código nuevo).
- La limpieza del efecto de apertura (`void serial(... close())`) captura y registra un
  fallo de `close()`: sin eso, un `close()` fallido al desmontar dejaba otro rechazo sin
  manejar.
- **Alternativas descartadas:** (b) quedarse en el aviso con «reintentar el borrado»: la
  sesión ya está cerrada en el servidor y el usuario quedaría atrapado en una página
  privada sin sesión; (c) borrar antes de cerrar la sesión: si luego el servidor no la
  cierra, se habrían perdido los cambios con la sesión abierta (contradice RF-017).

**VE-2 · El aviso no distingue la réplica ilegible.** `hasUnconfirmed()` pasa a
`unconfirmedState()` → `"none" | "pending" | "unreadable"`. `LogoutState` expone `reason`
(`"pending" | "unreadable"`) y `LogoutDialog` usa, con `unreadable`, el título «No se pudo
comprobar si hay cambios sin sincronizar» y un texto propio, sin «Sincronizar y salir»: el
push leería la misma réplica que no se pudo leer y acabaría en el mensaje de rechazos, que
no aplica. **Alternativa descartada:** mantener el booleano y añadir otro estado aparte;
dos fuentes para una misma decisión.

**VE-3 · Sin pruebas de proveedor/UI de la ruta de error.** `LogoutDialog.test.tsx`: con
`info()` en error, el aviso sale con el texto de VE-2 y sólo dos opciones; «Salir y
descartar» con `destroyLocalDb` en error llega al login con el aviso. `SyncProvider.test.tsx`
(o el mismo archivo): la salida directa con el borrado en error también llega con el aviso.
`LocalCopyNotice.test.tsx`: con y sin el estado. Cada prueba falla sin su corrección.

**VE-4 · README.** La fila de `resources.ts` en la tabla de `frontend/src/README.md` cita
`unconfirmedState` y `pushOnce`; se añade `LocalCopyNotice.tsx`.

**VE-5 · «Siempre JSON».** El docstring de `canonical()` y `state.md` decían que el
resultado siempre es JSON: lo es para los valores JSON y para `undefined` dentro de objetos
y listas, no para otros valores (una función, un `undefined` suelto). Se precisa el texto;
sin código.

**Re-anclaje de 0002.** `App.tsx` (de `covers` de 0002) gana una línea (el aviso en
`/login`). Al cerrar se mueve el ancla de 0002 con una nota, como en §7. Sin cambio de
requisitos de 0002.

Documentación afectada: `frontend/src/README.md`, spec de 0002 (nota de re-anclaje).

## 13. Enmienda 4 · Menores de la verificación 4 (APROBADA el 2026-10-14)
La Fase 5 sobre `0c45404` devolvió APPROVED con cuatro menores (VF-1…VF-4, `history.md`). El
usuario eligió la opción (b) para VF-4: corregirlo de raíz. Bloque P de `tasks.md` (T-117 en
adelante). RF-017 se precisa (enmienda 4 de la spec); ningún requisito nuevo. Como la
opción (b) cambia el comportamiento, sigue una ronda corta de verificación 5.

**VF-4 · La copia descartada se reutiliza (opción b).** Con la enmienda 3, si el borrado
fallaba tras «Salir y descartar» y volvía el mismo usuario, `openLocalDb` reutilizaba la
réplica (el dueño coincide) y el replicador subía los cambios que el usuario había
descartado. La decisión de descartar tiene que sobrevivir al fallo del borrado:
- `localDb.ts` gana una **marca de borrado pendiente** en `localStorage`, por nombre de base
  (`synapse-discarded:<nombre>`). Va fuera de la réplica a propósito: es IndexedDB la que
  falla, y una marca dentro de ella fallaría con el borrado.
  - `markDiscarded(db)` la escribe y devuelve si pudo; nunca lanza (registra el error).
  - `destroyLocalDb(db)` borra la réplica y, sólo si lo consiguió, quita la marca.
  - `openLocalDb(sub)` destruye la réplica también si tiene la marca, sea cual sea su dueño,
    y la quita tras destruirla. Si destruir falla, `openLocalDb` rechaza: el proveedor
    muestra el error de la réplica y no replica nada.
- `exit()` llama a `markDiscarded()` en cuanto el servidor cerró la sesión y **antes** de
  `close()`: si falla `close()` (el replicador no se detiene) el borrado ni se intenta, y la
  marca cubre también ese caso (y una pestaña cerrada a mitad del borrado).
- Si la marca no puede leerse, cuenta como ausente: los navegadores bloquean
  `localStorage` e IndexedDB con la misma política del sitio, así que en ese caso tampoco
  hay réplica que abrir, y tratarla como presente borraría en cada apertura los cambios sin
  confirmar del usuario. Si no puede escribirse, la salida sigue igual y el aviso del login
  no promete el borrado (riesgo residual del doble fallo, documentado en spec §5).
- `LocalCopyState` gana `discardPending: boolean` (si la marca quedó escrita). El aviso dice
  «No se pudo borrar la copia local de este dispositivo.» y, con la marca, añade «Se borrará
  la próxima vez que se inicie sesión en este dispositivo.»
- **Alternativas descartadas:** (a) aceptar el riesgo y documentarlo: lo descartado podía
  llegar al servidor, contra la decisión explícita del usuario (C-4); marcar dentro de la
  réplica (quitar `_local/synapse-owner`): falla junto con el borrado; tratar una marca
  ilegible como presente: pérdida de datos en cada apertura con el almacenamiento bloqueado.

**VF-2 · Una segunda petición durante la salida.** `requestLogout` y `syncAndExit` no
miraban `leaving`: un segundo «Cerrar sesión» mientras se borraba la réplica la leía ya
cerrada y abría un aviso `unreadable` falso. Ambas vuelven sin hacer nada si `leaving` es
`true`, como `exit()`.

**VF-1 · Pruebas de la guarda y de la fase.** `LogoutDialog.test.tsx`: dos salidas seguidas
en el mismo render → un solo `logout()` (guarda `leaving`); `logout()` que falla y luego
funciona → el segundo intento sale (se restablece `leaving`); con `logout()` en curso el
aviso muestra «Cerrando sesión…» y desactiva sus botones (fase `exiting`); una petición de
salida durante el borrado no vuelve a leer la réplica (VF-2).

**VF-3 · El aviso del login vuelve con «Atrás».** Con `BrowserRouter` el estado de
navegación se guarda en `history.state`: tras borrar la copia en un inicio de sesión
posterior, volver con «Atrás» a esa entrada mostraba otra vez el aviso. `LocalCopyNotice`
copia el estado a su estado local al montarse y lo quita de la entrada actual con
`navigate(location, { replace: true, state: null })`; el aviso sigue visible mientras la
página esté montada.

Documentación afectada: `frontend/src/README.md` (fila de `localDb.ts` y de
`LocalCopyNotice.tsx`).

## 14. Enmienda 5 · Menores de la verificación 5 (APROBADA el 2026-10-14)

La verificación 5 dio APPROVED con menores VG-1…VG-5; el usuario pasó SPEC-0005 a
`verified` y pidió corregir VG-1…VG-4. Sólo pruebas y texto: sin cambio de comportamiento,
así que por la regla de salida no hay otra ronda.

- **VG-1:** la prueba «si cerrar la réplica falla al salir» de `LogoutDialog.test.tsx`
  comprueba ahora la marca en `localStorage` y el texto del borrado pendiente: fija que
  `exit()` marca **antes** de `close()` (la mutación que marca después ya no pasa).
- **VG-2:** T-120 y la fila RF-018 de TASKS-0005 dejan de citar `App.test.tsx`, que la
  enmienda 4 no tocó.
- **VG-3:** con el replicador falso, «nada en remoto» se cumplía siempre. La prueba «el mismo
  usuario vuelve» comprueba en su lugar que el replicador de la segunda sesión se crea sobre
  una réplica sin la bóveda descartada y arranca.
- **VG-4:** SPEC-0005 RF-017 y §5 matizan el «nunca»: `QuotaExceededError` en `setItem` más
  un borrado fallido, o `removeItem` con error tras un `getItem` correcto, son dobles fallos
  del almacenamiento aceptados como riesgo residual. Descartado añadir código: es el único uso
  de `localStorage` del frontend, la clave es corta y otro almacén de la marca fallaría con el
  mismo almacenamiento.
- **VG-5** (varias pestañas del mismo usuario con el borrado fallido) queda en el backlog de
  `state.md`, fuera de esta enmienda: es anterior a la enmienda 4 y necesita su propio análisis.

## 15. Enmienda 6 · Tests inestables del frontend (backlog 8; pendiente de verificación)

El usuario pidió corregir desde la raíz el backlog 8: cuatro pruebas que fallaban o avisaban
de vez en cuando, sobre todo con la máquina cargada (con dos suites a la vez fallaban 2 de 12
corridas incluso tras un primer arreglo). Causas y correcciones:

- **VE-6 (`VaultListPage.test.tsx`, recarga por `dataVersion`):** la prueba esperaba la
  bóveda nueva sondeando el DOM con `findBy*`. Con 51 bóvedas en pantalla cada sondeo
  calcula nombres accesibles y estilos y, al fallar, imprime el DOM entero; eso ocupa el hilo
  que necesita la propia relectura de la réplica (2 ms sola frente a 31 ms con un sondeo
  pendiente), que llegaba tarde. La prueba espera ahora la relectura misma (la promesa de
  `vaults.list`, dentro de `act`) y consulta el DOM una sola vez.
- **`replicator.start()` en `SyncProvider.test.tsx`, `App.test.tsx` y `LogoutDialog.test.tsx`:**
  `start()` va en un efecto posterior al commit que pinta lo que la prueba espera, así que
  afirmarlo justo al verlo era una carrera; se espera con `waitFor`.
- **Aviso `act(...)` de VC-4 (`LogoutDialog.test.tsx`):** la escritura que precede a la salida
  produce, después de abrirse el aviso, dos renders de `SyncProvider`: el de `dataVersion`
  (visible: la prueba muestra la versión y la espera) y un aviso repetido del almacén de
  estado, cuyo feed relee la misma secuencia que ya leyó `refresh()`. Este segundo no cambia
  nada en pantalla, así que ninguna prueba puede esperarlo, y en la app vuelve a pintar todo
  el árbol en cada escritura. **Cambio de código:** `status.ts` sólo avisa a los suscriptores
  cuando el estado (`state`, `pending`, `lastSyncAt`) cambia.

El cambio de `status.ts` cambia la lógica del almacén (menos avisos, mismos estados), así que
por la regla de salida (b) pide una ronda de verificación; el resto son pruebas. Validado con
13 corridas de la suite (5 solas y 4 pares concurrentes): 381/381 y ningún aviso `act`;
integración 16/16; las mutaciones del comparador y de la recarga mueren.
