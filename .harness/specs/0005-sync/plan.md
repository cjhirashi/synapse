---
id: PLAN-0005
tipo: plan
feature: 0005-sync
estado: approved
aprobaciones:
  fase_2: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-13 }   # con P-1 (a) y P-2
actualizado: 2026-10-13
---

# PLAN-0005 · Sincronización PouchDB ↔ CouchDB (offline-first)

> El *cómo* de SPEC-0005 en el patrón por-capas con puertos (ADR-001):
> `routers → services → core/ports ← adapters`, con el canal de ADR-002 (proxy `/sync` con
> push validado) y la resolución de ADR-003 (por campo contra el ancestro, si no el usuario).
> **Prerrequisitos cumplidos:** SPEC-0002 (sesión), SPEC-0003 (bóvedas, `verified`),
> SPEC-0004 (RFC 9457, `verified`). Este plan sólo lanza errores de dominio; el formato
> `application/problem+json` lo pone el traductor de 0004.
> **GATE 2 aprobado (2026-10-13):** el usuario aprobó el plan con P-1 opción (a) (se toca el
> código de 0003 y se re-ancla al cierre) y P-2 (dependencia `pouchdb-browser`); P-3…P-5
> quedan confirmadas con el plan (§7).

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

**Mismo origen:** `frontend/nginx.conf` añade `location /sync/` con `proxy_buffering off` y
`proxy_read_timeout 90s` (longpoll); `vite.config.ts` añade `"/sync": BACKEND`. `/sync` es
sólo de la API: las vistas nuevas son `/rejections` y `/conflicts`, así que no hace falta
el `map` de `Accept` que necesita `/vaults` (ruta compartida entre API y SPA).

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
  `ValidationFailed` (422), `StorageUnavailable` (503).

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
10. Mismo origen: `nginx.conf`, `vite.config.ts`.
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
| P-5 · Lápidas sólo para cerrar ramas en conflicto | El borrado de bóvedas sigue siendo el *soft delete* de 0003; una lápida que dejaría la bóveda sin hojas vivas se rechaza. **Riesgo residual aceptado:** dos lápidas *simultáneas* de un cliente modificado sobre las dos ramas podrían borrar del todo una bóveda propia. No afecta a otro usuario (P2) y el cliente oficial nunca lo hace (siempre conserva la ganadora determinista, §2.6). |
| Re-anclaje de 0002 | 0005 modifica `App.tsx`, `layout/**` y `scripts/export_openapi.py` (de `covers` de 0002) y `core/errors.py`/`main.py` (sin dueño). Al cerrar, se mueve el ancla de 0002 con una nota, como en 0003/0004. |
| `frontend/nginx.conf`, `frontend/vite.config.ts`, `package.json` sin `covers` | Configuración compartida por varias features (precedente PLAN-0003 §14): no se anclan a 0005; se documentan en `frontend/src/README.md`. |
| Tests de sync real necesitan el backend levantado | `sync-integration.sh` lo levanta contra la base de test (SQLite, excepción P5) y CouchDB de test; fuera de `npm test` por defecto, obligatorio en la verificación. |
| Streaming de `_changes` | Puerto async propio para no bloquear hilos; el resto sigue síncrono como 0003. |
| Ancestro desde el árbol local | Sin `auto_compaction`; si falta, decide el usuario (RF-013), así que nunca se pierde una versión. |

## 8. Impacto en documentación (Art. 11)
| Documento del mapa | Qué cambia | Acción |
|---|---|---|
| `0005-sync/contracts/openapi.yaml` | rutas `/sync/**` y códigos de rechazo | crear (export) |
| `backend/README.md` | sección "Sincronización (SPEC-0005)": rutas, lista blanca, push validado, códigos `reason`, límites | actualizar |
| `backend/app/{core/ports,adapters,services,routers}/README.md` | `ReplicationPort`, `ReplicationRepository`, `VaultPort.leaves`, `sync_push`, `sync_filter`, `sync.py` | actualizar |
| `frontend/src/README.md` | carpeta `sync/`, réplica local, estados, rechazos y conflictos, cierre de sesión, proxys `/sync` de nginx y Vite, pantallas de bóvedas sobre la réplica | actualizar |
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
Rutas explícitas de §2.1 y comodín final → `SyncEndpointNotFound`. Tests: `test_sync_api.py` con `PUT /sync/db/x`, `DELETE /sync/db/_local/x`, `_find`, `_purge`, `_design/vaults`, `_security`; comprobar que no llega nada a CouchDB (doble del puerto en la prueba de ruta).
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
La resolución se escribe como una edición más y pasa por el push validado. Tests: integración, resolución con nombre ocupado → rechazo visible.
### Implementación de RF-016
`remote.ts` (401 → `refreshSession()`; si falla, sesión caducada), `replicator.ts` (`cancel` sin borrar). Tests: vitest con 401 tras refresh fallido → se detiene y conserva pendientes; tras login del mismo usuario reanuda; integración con cookie invalidada.
### Implementación de RF-017
`LogoutDialog.tsx` + `requestLogout()`; `AppLayout.tsx` lo usa. Tests vitest: sin pendientes sale y destruye; con pendientes, las tres opciones (sin red, dos); "Sincronizar y salir" con un rechazo vuelve al aviso.
### Implementación de RF-018
`localDb.ts` (`_local/synapse-owner`). Tests vitest: usuario distinto → réplica destruida antes de replicar; mismo usuario → se conserva.
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
`nginx.conf`, `vite.config.ts`, `package.json`. Se re-anclan al cierre (§7).
