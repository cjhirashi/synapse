---
id: PLAN-0008
tipo: plan
feature: 0008-vault-editor
estado: approved
aprobaciones:
  fase_2: { por: "AIRA en nombre de Carlos Jiménez (cjhirashi), delegación explícita 2026-10-22; acepta P-1 (sin router REST de notas)", fecha: 2026-10-22 }
actualizado: 2026-10-22
---

# PLAN-0008 · Editor de documentos dentro de una bóveda

> El *cómo* de SPEC-0008 en el patrón por-capas con puertos (ADR-001):
> `routers → services → core/ports ← adapters`. Las notas siguen **el mismo patrón que ya
> usan las bóvedas desde SPEC-0005 (P-1)**: la UI lee y escribe la **réplica local
> PouchDB**; el servidor sólo ve las notas por el canal `/sync` y las valida en el push.
> Las reservas de unicidad (`note-path:*`) son, como `vault-name:*`, documentos **sólo del
> servidor**: las escribe el push, nunca viajan por el canal en ninguna dirección.
> **Prerrequisitos cumplidos:** SPEC-0002, 0003, 0004, 0005 (`verified`), 0007
> (`implemented`: `/vaults/*` ya negocia SPA/API por `Accept`).
> Las decisiones de producto de spec §6 no se reabren. Lo que este plan decide y necesita
> el visto bueno del GATE 2 está en §7 (P-1…P-10).

## 0. Gates de simplicidad
- [x] Simplicity — ninguna ruta, base ni colección nueva: las notas son un tipo más de
  documento en `synapse_user_{id}` y viajan por el canal de 0005, que ya está preparado para
  ampliarse por tipo (PLAN-0005 §2.4). Sin router REST de notas (P-1): ningún RF lo pide.
- [x] Anti-Abstraction — un módulo de reservas compartido (`services/reservations.py`) con
  **dos** usuarios reales (nombres de bóveda y rutas de nota), no especulativo; en el push,
  una tabla por tipo (`vault`, `note`) en lugar de un sistema de *plugins*. El editor no
  tiene capa propia: dos envoltorios finos (Milkdown, CodeMirror) sobre una cadena markdown.
- [x] Integration-First — `contracts/note.schema.json` (forma cerrada del documento) se
  fija en este plan; el delta del canal (§4: dos códigos de rechazo y el tope de cuerpo de
  `_bulk_docs`) se escribe primero como test rojo del contrato de 0005 y después se
  re-exporta.

## 1. Cumplimiento constitucional
| Artículo | Cómo lo respeta este plan |
|---|---|
| Art. 1–2 (patrón) | Reglas puras de nota en `core/note_rules.py`; reservas y comprobaciones en `services/` (`note_service.py`, `reservations.py`, `sync_push.py`); CouchDB sólo por `VaultPort` (genérico por documento) y `ReplicationPort`. Rutas sin lógica nueva salvo el tope de cuerpo. `services/` no importa de `adapters/`. En el cliente, la lógica (reglas, almacén, árbol) vive en módulos puros de `notes/`; los componentes sólo la llaman. |
| Art. 1 (dependencias nuevas) | Milkdown y CodeMirror 6 justificados en P-3 (ADR-010 del diseño original), con versiones exactas y sin paquetes que arrastren Vue. |
| Art. 3 (testing) | TDD; ≥ 80 % por módulo; push, filtros y reservas contra **CouchDB real** (P5); dos réplicas PouchDB reales contra backend y CouchDB reales (`npm run test:sync`); RNF-001 medido (§5). |
| Art. 5 (seguridad) / P2–P3 | La base sigue saliendo sólo del token. Lista blanca ampliada **sólo** a `note:{uuid}:{uuid}` canónico (RF-006); `note-path:*`, `vault-name:*` y `_design/*` nunca entran ni salen. Una nota sólo se acepta si su bóveda existe y está activa **en la base del propio usuario** (RF-004). Topes de tamaño: contenido 2 MiB, frontmatter 64 KiB, cuerpo de `_bulk_docs` 16 MiB, 200 documentos. Render de markdown sin HTML crudo y con URLs saneadas (§2.6). |
| Art. 6 (contratos/errores) | JSON Schema del documento en `contracts/`; las rutas siguen en el OpenAPI de 0005 (re-export). Errores HTTP siguen RFC 9457 (413 `payload-too-large` ya existe); los rechazos por documento siguen el formato `forbidden` + `reason` de 0005. |
| Art. 10 (raíz) | La unicidad de ruta usa el **mismo** mecanismo de reservas que los nombres de bóveda, extraído una vez (no copiado). Los límites de cuerpo se resuelven en el origen (tope del servidor acorde al peor documento válido + reparto de lotes en el cliente), no con reintentos. |
| Art. 11 (docs) | §8. |
| Art. 12 | Las reglas de nota existen una vez en Python (`core/note_rules.py`) y una vez en TS (`notes/noteRules.ts`), comparadas contra la misma batería JSON (§5). |

## 2. Arquitectura de la feature (por-capas con puertos)

### 2.1 Núcleo (`backend/app/core/note_rules.py`, nuevo)
Funciones puras, sin E/S, con sus constantes:
- `PATH_MAX = 300`, `CONTENT_MAX_BYTES = 2 * 1024 * 1024`, `FRONTMATTER_MAX_BYTES = 64 * 1024`.
- `normalize_path(path) -> str`: parte por `/`, quita espacios a los lados de cada segmento
  con la semántica `White_Space` de pydantic-core (`str::trim` de Rust, PLAN-0005 §2.5 nota
  (b): quita U+0085, no U+FEFF) y vuelve a unir.
- `check_path(value) -> str | None`: el código de rechazo (`validation-error:path`,
  `not-normalized:path`) o `None`. Reglas: texto; 1–300 puntos de código; sin `Cc`; ningún
  segmento vacío (P-4); igual a su forma normalizada.
- `path_key(path) -> str`: `NFKC` + `casefold` de la ruta completa (reutiliza `name_key`).
- `check_content(value)`: texto, Unicode bien formado (`value.encode("utf-8")` sin
  sustitutos sueltos) y ≤ 2 MiB en bytes UTF-8 (RF-016).
- `check_frontmatter(value)`: objeto JSON cuya serialización compacta
  (`json.dumps(ensure_ascii=False, separators=(",", ":"))`) en UTF-8 es ≤ 64 KiB (P-4).
- `NOTE_KEYS`, `NOTE_REQUIRED` (todas salvo `frontmatter`, opcional por spec §3).

### 2.2 Coordinación (`services/`)
| Módulo | Responsabilidad | RF |
|---|---|---|
| `reservations.py` (nuevo) | Extrae de `VaultService` el algoritmo de reserva **sin cambiar su comportamiento** (PLAN-0003 §12/§15, PLAN-0005 P-4): `reserve(reservation_id, owner, holds)` escribe el documento de reserva (primer intento sin leer; ante conflicto relee y decide), respeta el arrendamiento de 30 s y reasigna huérfanas; `release(reservation_id, owner, holds)` es de mejor esfuerzo y sólo borra si sigue apuntando al mismo dueño y ya no la usa. `holds(reservation) -> bool` lo da cada tipo. Lanza `ReservationTaken` (excepción interna de `services/`, no de HTTP). | RF-011, RF-013 |
| `vault_service.py` (0003) | `reserve`/`release` pasan a delegar en `reservations.py`; `_holder` queda como el predicado de bóvedas; `VaultNameTaken` se lanza al traducir `ReservationTaken`. Toda la batería existente (`test_vault_service.py`, `test_vaults_concurrency.py`, `test_sync_push.py`) sigue verde **sin tocarla**: es la prueba de no regresión del extraído. | — (P-2) |
| `note_service.py` (nuevo) | `NoteService(port: VaultPort, db, clock)`: `reserve_path(note_id, path)` y `release_path(note_id, path)` sobre `note-path:{vault_id}:{path_key}` (`{_id, type: "note-path", note_id, reserved_at}`); su predicado `holds` mira **todas** las hojas vivas de la nota (`VaultPort.leaves`) y considera ocupada la reserva si alguna hoja es `type: "note"`, `deleted_at = null` y tiene la misma clave. Lanza `NotePathTaken` (interna). | RF-011, RF-013, RF-017 |
| `sync_filter.py` (0005) | §2.4. | RF-006 |
| `sync_push.py` (0005) | §2.3. | RF-004, RF-005, RF-013, RF-014, RF-016 |

`VaultPort` no cambia: `get`, `put`, `delete` y `leaves` ya son genéricos por documento
(`list_page` sigue siendo sólo de bóvedas). No hace falta un puerto de notas.

### 2.3 Push validado (`services/sync_push.py`)
`SyncPushService(vaults, notes: NoteService, port, replication, db, owner_id)`. Los nueve
pasos de PLAN-0005 §2.3 se mantienen; cambia que las comprobaciones por tipo salen de una
tabla `_KINDS` (`"vault:"` → reglas de 0005; `"note:"` → reglas de nota), y:
1. **Id** (RF-006): `is_replicable_id` acepta `vault:{uuid}` y `note:{uuid}:{uuid}` canónicos.
   **Orden del lote:** tras la pasada de identidad, los candidatos se procesan con las
   bóvedas primero (orden estable dentro de cada tipo). Así una bóveda creada sin conexión
   y sus notas, que el feed de cambios puede entregar en el orden "nota, bóveda" (la
   bóveda se editó después), se validan en el orden correcto dentro del mismo lote.
2. Ya almacenada — sin cambios.
3. **Lápida** (P-5 de 0005) — misma regla para notas; además, para `note:*` se exige
   la bóveda activa (paso 6c), igual que para cualquier otra revisión de nota.
4. **Forma** (RF-005): claves `NOTE_KEYS` (`frontmatter` opcional, el resto obligatorias);
   cualquier otra (incluidas `_attachments`, `_conflicts`, `owner_id`) →
   `validation-error:<clave>`; `type == "note"`.
5. **Campos** (RF-005, RF-016): `check_path`, `check_content`, `check_frontmatter`. El
   servidor no normaliza (P-3 de 0005): `not-normalized:path`.
6. **Servidor:** (a) `vault_id` igual al primer UUID del `_id` (`validation-error:vault_id`);
   (b) `created_at`/`updated_at`/`deleted_at` con el formato de `utc_now` y `created_at`
   inmutable entre hojas (reglas de 0005, compartidas); (c) **bóveda activa** (RF-004,
   RF-014): las hojas proyectadas de `vault:{vault_id}` (servidor + aceptadas del lote)
   deben incluir alguna viva con `deleted_at = null`; si no → `vault-not-found`. Como la
   base es la del token, "del propio usuario" está garantizado: una bóveda de otro usuario
   no existe en esta base. Con la bóveda en conflicto basta una rama activa (P-9).
7. **Reserva** (RF-013, RF-017): si la revisión está viva y `deleted_at` es `null`,
   `NoteService.reserve_path`; ocupada → `note-path-taken`. Mismo invariante que P-4 de
   0005: *toda hoja viva y activa de una nota tiene reservada su ruta*.
8. Escritura — sin cambios (un `_bulk_docs` `new_edits:false`).
9. **Liberación** (RF-011): por nota escrita, las rutas que usaban sus hojas (o reservadas
   en el lote) y que ya no usa ninguna hoja viva y activa → `NoteService.release_path`.
   Renombrar libera la ruta anterior; borrar (soft delete) libera la suya; restaurar la
   vuelve a reservar (paso 7).

Las notas de una bóveda borrada **conservan** su reserva (siguen `deleted_at = null`): al
restaurar la bóveda reaparecen sin colisiones (RF-014).

### 2.4 Filtros (`services/sync_filter.py`)
- `is_replicable_id`: `vault:{uuid}` **o** `note:{uuid}:{uuid}`, ambos canónicos
  (`is_canonical_uuid`). Nada más (RF-006): `note-path:*`, `note:{uuid}` con un solo UUID,
  mayúsculas o envoltorios → no replicable.
- Selector fijo de `_changes`: `{"_id": {"$regex": "^(vault|note):"}}` (`note-path:` no
  casa: `-` ≠ `:`).
- `_all_docs`: el rango único pasa a **dos rangos** en orden de bytes (`note:` < `vault:`);
  la ruta los consulta en ese orden y corta por `limit` (lo que falta tras el primero se
  pide al segundo). `all_docs_query` devuelve la lista de rangos; con `keys`, se filtran
  como hoy. `sanitize_all_docs_response` no cambia (ya filtra por `is_replicable_id`).
- `_revs_diff` y `_bulk_get` no cambian de código: dependen de `is_replicable_id`.

### 2.5 Rutas (`routers/sync.py`) y fronteras de salida
- Ninguna ruta nueva. `SyncRoute` aplica el tope por ruta: `_local` 64 KiB (igual),
  **`_bulk_docs` 16 MiB** (`MAX_BULK_DOCS_BYTES`, nuevo; P-6), resto 4 MiB (igual). 16 MiB
  cubre el peor documento de nota válido serializado (2 MiB de contenido con escapes JSON
  de 6 bytes por carácter de control → 12 MiB, más ruta, frontmatter ≤ 64 KiB y
  `_revisions`). `MAX_BULK_DOCS = 200` sigue.
- `REJECTION_REASON` añade `note-path-taken` y `vault-not-found`.
- `get_push_service` construye también `NoteService(vault_port, db)`.
- `_all_docs`: dos llamadas al puerto según §2.4.

| Frontera | Para qué | Implementación concreta |
|---|---|---|
| `VaultPort` (existente) | leer hojas de notas y bóvedas; escribir/borrar reservas `note-path:*` | `adapters/vault_repository.py` sin cambios |
| `ReplicationPort` (existente) | reenvío del protocolo, escritura `new_edits:false` | `adapters/replication_repository.py` sin cambios. CouchDB 3 por defecto admite documentos de hasta 8 MB (`max_document_size`, medido sin escapes) y la nota más grande ocupa ~2,1 MB: se comprueba con CouchDB real (§5). |
| Réplica local PouchDB (cliente) | lectura y escritura de notas de la UI | `notes/noteStore.ts` sobre la misma `PouchDB("synapse")` de `sync/localDb.ts` |

### 2.6 Frontend
**`frontend/src/notes/`** (datos y pantallas de la bóveda abierta):
| Módulo | Responsabilidad | RF |
|---|---|---|
| `noteRules.ts` | Espejo de `core/note_rules.py` (normalizar, validar, `pathKey` = `nameKey` de `sync/vaultRules.ts`, bytes UTF-8 con `TextEncoder`, `String.prototype.isWellFormed`). | RF-005, RF-013, RF-016 |
| `noteStore.ts` | Operaciones sobre la réplica: `list(vaultId, {deleted})` (`allDocs` sobre `note:{vaultId}:` … `note:{vaultId}:￰`, devuelve `{id, path, rev, updated_at, deleted_at}` sin `content`), `get(id)`, `create(vaultId, title?)`, `rename(id, path, rev)`, `save(id, content, baseRev)`, `softDelete`, `restore`. Ids `note:{vaultId}:{uuid v4}`, marcas `utcNow()`, `frontmatter: {}`. Título → ruta: se añade `.md` si no termina ya en `.md` (sin distinguir mayúsculas). Comprobación local de ruta única (aviso inmediato; la última palabra es del servidor). Errores: `NoteValidationError` (campos), `NotePathTakenError` (equivalente local del 409, RF-013), `NoteNotFoundError`, `StorageFullError` (de 0005). `save` con `baseRev` desfasado (409 de PouchDB) **no pierde lo escrito**: lo escribe como rama hija de `baseRev` con revisión determinista (`child()` de `sync/conflicts.ts`) y `new_edits:false`, y queda como conflicto para el usuario (P-8). | RF-003, RF-010…RF-013, RF-016, RF-017 |
| `untitled.ts` | `nextUntitledPath(existingKeys)`: `Sin título.md`, después `Sin título 2.md`, `Sin título 3.md`… el menor `n ≥ 2` libre por `pathKey`. | RF-012 |
| `noteTree.ts` | Función pura `buildTree(notes)`: carpetas como prefijos de `path` (segmentos exactos, sin aplanar), carpetas antes que notas, orden `localeCompare("es", {numeric: true, sensitivity: "base"})`; nombre visible sin `.md`. Una carpeta sin notas no existe. | RF-001, RF-019 |
| `mergeNote.ts` | Ante una nota en conflicto: si ganadora y perdedora sólo difieren en `updated_at` → cerrar la perdedora (convergencia de dos resoluciones iguales, VC-2 de 0005); cualquier otra diferencia → conflicto **manual**. Nunca elige por fecha (ADR-001). | RF-009 |
| `repush.ts` | Reintento dirigido de notas rechazadas con `vault-not-found` (P-7): cuando la bóveda `V` aparece activa en la réplica (cambio local, del pull o escrita por el push), lanza un push de una vez `db.replicate.to(remote, {doc_ids, checkpoint: false})` sólo con esas notas, y sus eventos van a `rejections.ts`/`status.ts` como los de `pushOnce`. | RF-004, RF-014 |
| `VaultWorkspacePage.tsx` | Ruta `/vaults/:id`. Lee la bóveda en `vaultStore` (id no canónico, inexistente o en la papelera → vista 404, RF-002; se relee con `dataVersion`, así una bóveda que llega por el pull sustituye al 404). Sidebar + editor; selección sólo en estado del componente (sin URL ni almacenamiento: RF-015). Carga el editor con `React.lazy`. | RF-001, RF-002, RF-015 |
| `NoteSidebar.tsx` | Árbol (`role="tree"`, carpetas plegadas por defecto), "Nueva nota" (campo de título opcional), renombrar/mover (edita la ruta completa), borrar, enlace a la papelera de la bóveda. Se relee con `notesVersion`. | RF-003, RF-010, RF-011, RF-012, RF-019 |
| `NoteTrash.tsx` | Papelera de notas **de esta bóveda**, con "Restaurar" (409 local si la ruta está ocupada). | RF-010, RF-017 |
| `VaultRail.tsx` | Riel con un icono (iniciales del nombre) por bóveda activa; el click navega a `/vaults/{id}`; la activa se marca. | RF-001 |
| `NoteConflictCard.tsx` | Ambas versiones en texto plano (`<pre>`: ruta, contenido, estado) y "Quedarme con esta"; llama a `resolveConflict`. | RF-009 |
| `messages.ts` | Textos en español (errores, motivos de rechazo de notas). | — |

**`frontend/src/editor/`** (cargado bajo demanda):
| Módulo | Responsabilidad | RF |
|---|---|---|
| `NoteEditor.tsx` | Estado de la nota abierta: `draft` (markdown), `baseRev`, `mode` (`read` por defecto, `edit`), `view` (`visual`/`code`), sucio/limpio. "Editar"/"Leer"; en edición, alternar Visual/Código **sin escribir ni releer**: ambos modos leen y escriben el mismo `draft`. Guardado explícito (P-5): botón "Guardar", Ctrl/Cmd+S, y "Leer" guarda antes si hay cambios; aviso al cambiar de nota o salir con cambios sin guardar (`beforeunload` + confirmación interna). Contenido > 2 MiB → mensaje y no se escribe (RF-016). Si la nota abierta tiene conflicto, aviso con enlace a `/conflicts`. | RF-007, RF-008, RF-016 |
| `MilkdownView.tsx` | Envoltorio de Milkdown (`Editor.make()` en un efecto, sin `@milkdown/react`): `readOnly` para el modo lectura (`editable: () => false`, sin cursor) y edición WYSIWYG; `listener.markdownUpdated` sólo emite tras cambios del documento, así abrir o alternar sin editar no reescribe el markdown. | RF-007, RF-008 |
| `CodeView.tsx` | Envoltorio de CodeMirror 6 (`EditorView` + `markdown()`), el mismo contrato `{value, onChange}`. | RF-008 |
| `safeUrl.ts` | Esquemas admitidos en enlaces (`http`, `https`, `mailto`, relativos) e imágenes (`http`, `https`); el resto se quita. Se aplica al esquema de Milkdown (`linkSchema`, `imageSchema`); el nodo `html` de commonmark se muestra como texto, nunca como HTML. | Art. 5 |

**Cambios en archivos de otras features (sin reclamarlos; re-anclaje al cierre, §7):**
- `App.tsx` (0002): ruta `/vaults/:id` → `VaultWorkspacePage` (las estáticas `new`/`trash`
  ganan por rango en React Router 6).
- `layout/AppLayout.tsx` (0002): monta `VaultRail` en las rutas privadas.
- `vaults/VaultListPage.tsx` (0003): acción "Abrir" junto a "Editar" (RF-018).
- `sync/resources.ts`, `sync/useSync.ts`, `sync/SyncProvider.tsx` (0005): `notes: NoteStore`,
  `notesVersion` (feed propio de `note:*`, separado de `dataVersion` para que guardar una
  nota no relea las listas de bóvedas) y arranque/cierre de `repush.ts`.
- `sync/conflicts.ts` (0005): el barrido inicial y el feed cubren también `note:*`; la
  combinación por tipo (`mergeVault` / `mergeNote`); `ManualConflict` gana `kind`; exporta
  `child()`. Los conflictos de notas de una bóveda borrada no se listan (RF-014).
- `sync/ConflictView.tsx` (0005): pinta `NoteConflictCard` para `kind: "note"`.
- `sync/RejectionsPage.tsx` (0005): textos de `note-path-taken`, `vault-not-found` y de los
  campos de nota; "Corregir" de una nota lleva a `/vaults/{vault_id}` con la nota en el
  estado de navegación (no persistido).
- `sync/remote.ts` (0005): el `fetch` propio parte un `POST /sync/db/_bulk_docs` cuyo cuerpo
  supera 8 MiB en sub-peticiones secuenciales de ≤ 8 MiB (un documento mayor va solo) y
  concatena las listas de rechazos; si una falla, devuelve ese fallo (PouchDB reintenta el
  lote entero; el paso 2 del push es idempotente). PouchDB sólo limita el lote por número
  de documentos, no por bytes (P-6).
- `test-setup.ts` (sin dueño): *polyfills* de `Range.getClientRects`/`getBoundingClientRect`
  y `document.elementFromPoint` que ProseMirror y CodeMirror piden en jsdom.
- `vite.config.ts`, `vitest.sync.config.ts`, `package.json` (sin dueño): §5 y §7.

## 3. Modelo de datos
- **Documento `note:{vault_id}:{note_uuid}`** en `synapse_user_{id}`: campos de spec §3;
  forma exacta en `contracts/note.schema.json`.
- **Reserva `note-path:{vault_id}:{path_key}`** `{_id, type: "note-path", note_id,
  reserved_at}`: sólo del servidor, nunca replicada (fuera de la lista blanca).
- **Réplica local:** documentos `note:*` junto a los `vault:*`; sin `_local` nuevos (los
  rechazos van al `_local/synapse-rejections` existente).
- Sin índices nuevos: el árbol usa el rango de `_id` por bóveda (el prefijo lleva el
  `vault_id`), que PouchDB resuelve con su índice primario.
- Sin cambios en PostgreSQL ni migraciones. Sin `schema_version` (R-9 de 0005).

## 4. Contratos
| Archivo | Frontera | Gate(s) de CI |
|---|---|---|
| `0008-vault-editor/contracts/note.schema.json` (nuevo, ya escrito) | cuerpo de una revisión `note:*` aceptada por el push | `test_note_contract.py`: claves, obligatorias, patrones y límites (`maxLength`, `x-max-utf8-bytes`, `x-max-json-utf8-bytes`) iguales a `core/note_rules.py`; los casos de `note_rules_cases.json` válidos cumplen el esquema |
| `0005-sync/contracts/openapi.yaml` (re-export) | `/sync/**`: sin rutas nuevas; `BulkDocsRejection.reason` añade `note-path-taken` y `vault-not-found`; descripción del 413 de `_bulk_docs` con 16 MiB | test de deriva (`test_contract.py`, que además comprueba los dos códigos nuevos); Spectral |

- **Por qué no hay `openapi.yaml` en 0008:** las rutas de `/sync` son de 0005 y
  `test_contract.py` exige que cada ruta pertenezca a exactamente una feature (un canon por
  hecho, Art. 12). Esta feature no añade rutas, así que no entra en `FEATURES` de
  `export_openapi.py`; cambia el contenido de un esquema de 0005, que se re-exporta.
- Patrón resultante: `^(invalid-id|owner-mismatch|immutable-field:created_at|vault-name-taken|note-path-taken|vault-not-found|delete-not-allowed|validation-error:.+|not-normalized:.+)$`.
- Errores HTTP: ninguno nuevo. `PayloadTooLarge` (413) sigue para cuerpos > tope o > 200
  documentos. RF-016 se cumple por documento (`validation-error:content`, el 422 del push).

## 5. Estrategia de pruebas (TDD)
| Zona | Qué se prueba | Herramienta / archivo |
|---|---|---|
| Núcleo | `note_rules.py`: límites exactos (300 / 301 puntos de código, 2 MiB / +1 byte con multibyte, 64 KiB), `Cc`, segmentos vacíos, normalización por segmento (U+0085, U+FEFF), sustitutos sueltos, `path_key` (ß/SS, NFC/NFD, anchura completa) | pytest unit (`test_note_rules.py`) + batería común `backend/tests/fixtures/note_rules_cases.json` |
| Reglas espejo | la misma batería contra `noteRules.ts`: mismo veredicto, misma normalización y misma clave | `test_note_rules.py` + vitest `notes/noteRules.test.ts` |
| Coordinación: reservas | `reservations.py` con doble de `VaultPort`: creación, reescritura propia, huérfana reasignada, arrendamiento, liberación que no borra la ajena; y la suite existente de bóvedas intacta | pytest (`test_reservations.py`; regresión: `test_vault_service.py`, `test_vaults_concurrency.py` sin cambios) |
| Coordinación: notas | `NoteService` contra **CouchDB real**: dos reservas simultáneas de la misma ruta → una gana; rama perdedora con la ruta → sigue reservada | pytest (`test_note_service.py`) |
| Coordinación: push | `SyncPushService` con dobles: cada código de nota, `vault_id` ≠ id, bóveda inexistente / borrada / en el mismo lote / en conflicto, orden bóveda-antes-que-nota, renombrar libera, borrar libera, restaurar reserva o `note-path-taken`, lápida de nota, lote mixto bóvedas + notas | pytest + dobles (`test_note_sync_push.py`) |
| Filtros | `is_replicable_id` (dos UUID, uno solo, mayúsculas, `note-path:`), selector, dos rangos de `_all_docs` con `limit` | pytest (`test_note_sync_filter.py`) |
| Rutas | protocolo con notas contra CouchDB real: `_changes`/`_all_docs`/`_bulk_get`/`_revs_diff` devuelven `note:*` y nunca `note-path:*`; push de nota válida guardada; 2 MiB de contenido con emojis y con caracteres de control se guarda y se relee igual; 2 MiB + 1 → rechazo y la versión previa sigue; cuerpo de 16 MiB + 1 → 413 | pytest + TestClient (`test_note_sync_api.py`) |
| Aislamiento (Art. 5) | A y B: B no ve notas ni reservas de A por ninguna ruta; una nota de B con el `vault_id` de una bóveda de A → `vault-not-found` y la base de A no cambia; `note-path:*` empujado → `invalid-id` | `test_note_sync_isolation.py` |
| Contrato | §4 | `test_note_contract.py`, `test_contract.py` |
| Frontend unit | `noteStore` (PouchDB en memoria: crear con y sin título, `Sin título n`, ruta duplicada, renombrar, borrar, restaurar con ruta ocupada, guardar con `baseRev` desfasado → rama en conflicto, > 2 MiB no escribe), `noteTree`, `mergeNote`, `repush`, `remote` (reparto de `_bulk_docs`), `conflicts` con notas, vistas (`VaultWorkspacePage`, `NoteSidebar`, `NoteTrash`, `VaultRail`, `NoteConflictCard`, `RejectionsPage`), `VaultListPage` ("Abrir") | vitest + Testing Library |
| Editor | `NoteEditor` con un editor falso inyectable (modo, sucio, guardar, alternar sin escribir); `MilkdownView` y `CodeView` con las **librerías reales** en jsdom (con los *polyfills* de §2.6): el texto inicial se muestra, una transacción (`dispatch`) emite el markdown, alternar Visual→Código→Visual sin editar deja el texto idéntico byte a byte, en lectura no hay `contenteditable="true"`; `safeUrl` y un `[x](javascript:alert(1))` / `<script>` que no se convierten en enlace ni en elemento | vitest |
| Sync real | dos dispositivos reales (`test-utils/device.ts`) contra backend y CouchDB reales: nota creada sin conexión llega; edición concurrente → conflicto manual en ambos, resolver converge; misma ruta en dos dispositivos → uno rechazado con `note-path-taken`; bóveda borrada en A y nota editada en B → `vault-not-found`, al restaurar la bóveda el reintento la sube; bóveda + nota + renombrado de la bóveda con el lote cortado entre ambas → la nota acaba aceptada; diez notas de 2 MiB suben y bajan | `npm run test:sync` (`notes/notes.integration.test.ts`; `vitest.sync.config.ts` incluye `src/{sync,notes}/*.integration.test.ts`) |
| Rendimiento (RNF-001) | ver abajo | `npm run test:perf` |

**Medición de RNF-001** (análoga a RNF-001 de 0003: tamaño fijo, p95, marca aparte):
`notes/tree.perf.test.tsx`, sólo con `NOTES_PERF=1` (`npm run test:perf`; `vite.config.ts`
lo excluye de `npm test`). Réplica PouchDB en memoria con **1 000 notas** de una bóveda
(rutas en hasta 3 niveles, 40 carpetas, ~4 KiB de contenido cada una) y otras 200 de otra
bóveda; 30 montajes de `VaultWorkspacePage` (3 de calentamiento descartados), cada uno
cronometrado desde el montaje hasta que el árbol (`role="tree"`) muestra todos sus
elementos de primer nivel; **p95 < 300 ms**. Limitación declarada: jsdom + memoria no es
IndexedDB; en la Fase 4 se añade como evidencia una medición manual en el navegador
(panel Performance, mismo volumen) pegada en la verificación.

## 6. Secuenciación (tests antes que código)
1. Contrato: `test_note_contract.py` y la ampliación de `test_contract.py` (rojo).
2. Núcleo: batería `note_rules_cases.json` + `test_note_rules.py` (rojo) → `core/note_rules.py`.
3. Reservas: `test_reservations.py` (rojo) → `services/reservations.py`; `vault_service.py`
   delega; suite de bóvedas en verde sin cambios.
4. `test_note_service.py` (rojo) → `services/note_service.py`.
5. `test_note_sync_filter.py` (rojo) → `sync_filter.py`.
6. `test_note_sync_push.py` (rojo) → `sync_push.py`.
7. `test_note_sync_api.py`, `test_note_sync_isolation.py` (rojo) → `routers/sync.py`;
   re-export del contrato de 0005 (paso 1 en verde).
8. Frontend base: dependencias (P-3); `noteRules`, `untitled`, `noteTree`, `mergeNote`,
   `noteStore` (rojo → verde).
9. Sync del cliente: `remote.ts` (reparto), `conflicts.ts` con notas, `repush.ts`,
   `resources`/`useSync`/`SyncProvider` (rojo → verde).
10. Editor: `safeUrl`, `CodeView`, `MilkdownView`, `NoteEditor` (rojo → verde).
11. Pantallas: `VaultRail`, `NoteSidebar`, `NoteTrash`, `VaultWorkspacePage`,
    `NoteConflictCard`, `ConflictView`, `RejectionsPage`, `VaultListPage`, `App.tsx`,
    `AppLayout.tsx` (rojo → verde).
12. Sync real (`notes.integration.test.ts`) y RNF-001 (`tree.perf.test.tsx`).
13. Diagrama de la feature (`diagrams/`), tareas `[doc]` de §8 y re-anclajes (§7).

## 7. Seguimiento de complejidad / riesgos y decisiones para el GATE 2
| Decisión / riesgo | Justificación |
|---|---|
| **P-1 · Sin router REST de notas** (se retira `routers/notes.py` del `covers` borrador) | Ningún RF pide una API REST; la UI usa la réplica como con las bóvedas (P-1 de 0005), y una segunda vía de escritura duplicaría validación y reservas. RF-002/RF-013/RF-016 se cumplen en la UI (404 / 409 local) y en el push (`note-path-taken`, `validation-error:content`). Consecuencia: los agentes OpenClaw no acceden a las notas por API hasta una spec propia. **Alternativa:** `routers/notes.py` REST sobre `NoteService` (más superficie y pruebas, sin RF que la pida). |
| **P-2 · Tocar código de features cerradas** | `vault_service.py` (0003) delega en `reservations.py`; `sync_*.py`, `routers/sync.py`, sus tests y `frontend/src/sync/**` (0005); `App.tsx`, `layout/**`, `test_contract.py` (0002); `backend/README.md`, `frontend/README.md` (0007, modo `strict`). Ningún RF de esas specs cambia; al cerrar 0008 se mueven sus anclas con una nota (procedimiento de PLAN-0003 §7 y PLAN-0005 P-1). **Alternativa:** copiar el algoritmo de reservas en `NoteService` (dos copias de una lógica con historia de carreras, Art. 10/12). |
| **P-3 · Dependencias nuevas (ADR-010 del diseño original)** | Milkdown (WYSIWYG sobre ProseMirror) y CodeMirror 6, decididos en ADR-010 y confirmados en spec §6. Versiones exactas, **granulares** para no arrastrar Vue (`@milkdown/kit`, `@milkdown/react` y `@milkdown/crepe` dependen de `@milkdown/components`, que usa Vue): `@milkdown/core`, `@milkdown/ctx`, `@milkdown/prose`, `@milkdown/preset-commonmark`, `@milkdown/preset-gfm`, `@milkdown/plugin-listener`, `@milkdown/plugin-history` **7.22.3**; `@codemirror/state` **6.7.6**, `@codemirror/view` **6.43.15**, `@codemirror/commands` **6.11.1**, `@codemirror/language` **6.13.1**, `@codemirror/lang-markdown` **6.5.2** (sin el metapaquete `codemirror`). Se comprueban al instalar. El editor va en un *chunk* aparte (`React.lazy`): `/vaults` no lo descarga; el tamaño se mide con `vite build` en la Fase 4. Pruebas en jsdom con las librerías reales y *polyfills* de `Range` (§5); lo que jsdom no tiene (selección visual, IME) se comprueba a mano en navegador en la Fase 4. Sin Tailwind (ADR-010 lo citaba; el sistema de diseño ya implementado usa CSS propio, spec §6 "sin librería de diseño de terceros"). |
| **P-4 · Límites técnicos que completan §3** | Medidas no fijadas por la spec: contenido en **bytes UTF-8** y Unicode bien formado; `frontmatter` ≤ **64 KiB** serializado (sin tope, sería una vía para saltarse los 2 MiB); **segmentos de ruta no vacíos y recortados** (con `a//b` o `/a` el árbol tendría carpetas sin nombre). |
| **P-5 · Guardado explícito** ("Guardar", Ctrl/Cmd+S; "Leer" guarda antes; aviso con cambios sin guardar) | La réplica no compacta (lo necesita ADR-003 para el ancestro de las bóvedas): cada guardado conserva el cuerpo entero de la revisión anterior. Un autoguardado cada pocos segundos sobre notas grandes multiplicaría el almacenamiento local (R-11 de 0005). **Alternativa:** autoguardado con espera de 2 s (menos fricción, mucho más almacenamiento). |
| **P-6 · Tope de `_bulk_docs` 16 MiB + reparto en `remote.ts` a 8 MiB** | El lote del replicador es de 50 documentos sin límite de bytes; con notas de hasta 2 MiB el tope actual (4 MiB) devolvería 413 al mismo lote para siempre y la sincronización se pararía. El servidor admite el peor documento válido y el cliente nunca envía más de 8 MiB por petición. Coste: hasta 16 MiB en memoria por petición en el proxy. |
| **P-7 · Reintento dirigido de `vault-not-found`** | El feed de cambios ordena por la última secuencia: si una bóveda creada sin conexión se edita después de crear sus notas y el corte de lote cae entre ambas, la nota llega antes que su bóveda y se rechaza (RF-004 lo exige). `forbidden` no se reintenta, así que la nota no subiría hasta otra edición. El push único con `doc_ids` cuando la bóveda se confirma lo resuelve sin escribir revisiones nuevas. Cubre también "bóveda restaurada". |
| **P-8 · Guardar sobre una revisión desfasada crea un conflicto** | Si la nota cambió (otra pestaña, el pull) mientras se editaba, lo escrito se guarda como rama y el usuario elige en la vista de conflictos (RF-009). El aviso "cambió, recarga" de las bóvedas perdería texto. |
| **P-9 · Nota de una bóveda en conflicto** | Se acepta si alguna rama viva de la bóveda está activa (mismo criterio "todas las ramas" que P-4 de 0005); la resolución de la bóveda decide después. |
| P-10 · PWA fuera de este plan | Spec §6 cita ADR-010 ("PWA"), pero §2 no incluye manifiesto ni *service worker* y ningún RF lo pide; si se quiere, va en spec propia. |
| Riesgo · memoria del proxy en pulls grandes | `_bulk_get` con muchas notas de 2 MiB se lee entero en el proxy (sin streaming). Aceptable para un uso personal; la integración con diez notas de 2 MiB lo comprueba. |
| Riesgo · reformateo de Milkdown | Una edición en modo Visual reserializa el documento con `remark-stringify` (p. ej. viñetas `*` → `-`). Abrir o alternar sin editar no reescribe nada (prueba de §5). Es el comportamiento conocido de ADR-010. |
| Configuración compartida sin `covers` | `vite.config.ts`, `vitest.sync.config.ts`, `package.json`, `test-setup.ts`: precedente PLAN-0003 §14 / PLAN-0005 §7. |

## 8. Impacto en documentación (Art. 11)
> El mapa de la Constitución Art. 11 sigue con marcadores de la plantilla; el efectivo es el
> de `AGENTS.md` más los README por capa. `docs/API.md` no existe: el canon de la API son
> los `contracts/` por feature.

| Documento del mapa | Qué cambia | Acción |
|---|---|---|
| `0008-vault-editor/contracts/note.schema.json` | forma del documento de nota | creado en este plan |
| `0005-sync/contracts/openapi.yaml` | `reason` con `note-path-taken`/`vault-not-found`; 413 de `_bulk_docs` a 16 MiB | re-exportar |
| `backend/README.md` | "Sincronización": tipos replicados (`vault:*`, `note:*`), reservas `note-path:*` sólo del servidor, nuevos motivos, topes (16 MiB, 2 MiB, 64 KiB); nueva sección "Notas (SPEC-0008)" | actualizar |
| `backend/app/core/README.md` | `note_rules.py` | actualizar |
| `backend/app/services/README.md` | `reservations.py`, `note_service.py`, cambios de `sync_push`/`sync_filter` | actualizar |
| `backend/app/routers/README.md` | tope por ruta de `sync.py` | actualizar |
| `backend/tests/README.md` | `test_note*.py`, `test_reservations.py`, batería `note_rules_cases.json` | actualizar |
| `frontend/README.md` | dependencias del editor, `npm run test:perf`, `test:sync` incluye notas | actualizar |
| `frontend/src/README.md` | carpetas `notes/` y `editor/`, ruta `/vaults/:id`, riel, guardado explícito, reparto de `_bulk_docs`, reintento de `vault-not-found` | actualizar |
| `0008-vault-editor/diagrams/` (+ `README.md`) | flujo "abrir bóveda → editar → réplica → push validado → reservas" (Archify, dataflow) | crear |
| `0005-sync/diagrams/` | la tarjeta del canal nombra sólo `vault:*` | regenerar |
| `ARCHIFY.md` | entrada del diagrama de 0008 | actualizar |
| `0002`, `0003`, `0005`, `0007` `spec.md` | nota de re-anclaje (sin cambio de requisitos) | actualizar en el cierre |
| `.harness/memory/state.md` | estado de 0008 | actualizar en el cierre |

## 9. Implementación por requisito

### Implementación de RF-001
`notes/VaultWorkspacePage.tsx` (ruta `/vaults/:id` en `App.tsx`), `notes/VaultRail.tsx` (en `layout/AppLayout.tsx`), `notes/NoteSidebar.tsx` + `notes/noteTree.ts`, `notes/noteStore.ts` (`list`). Tests: `noteTree.test.ts` (anidado sin aplanar, carpeta vacía desaparece, orden), `VaultWorkspacePage.test.tsx` (riel, árbol y editor vacío), `VaultRail.test.tsx`, `AppLayout.test.tsx`.
### Implementación de RF-002
`VaultWorkspacePage.tsx`: id no canónico, sin documento o con `deleted_at` → vista 404; relectura con `dataVersion`. Tests: `VaultWorkspacePage.test.tsx` (tres casos + bóveda que llega después por el pull); la bóveda de otro usuario no existe en la réplica (aislamiento de 0005, `isolation.integration.test.ts`).
### Implementación de RF-003
`noteStore.create` (id `note:{vault}:{uuid v4}`, `vault_id` de la bóveda activa, ruta del título + `.md`) y `NoteSidebar` abre la nota nueva en modo edición. Tests: `noteStore.test.ts`, `NoteSidebar.test.tsx`; push en `test_note_sync_push.py`.
### Implementación de RF-004
Paso 6c de `sync_push.py` (`vault-not-found`) y orden bóveda-antes-que-nota; `notes/repush.ts` (P-7). Tests: `test_note_sync_push.py`, `test_note_sync_isolation.py`, `repush.test.ts`, `notes.integration.test.ts` (lote cortado; bóveda borrada y restaurada).
### Implementación de RF-005
Pasos 4–6 de `sync_push.py` con `core/note_rules.py`. Tests: `test_note_rules.py`, `test_note_sync_push.py` (cada clave sobrante o ausente, `type`, cada campo), `test_note_contract.py`.
### Implementación de RF-006
`sync_filter.is_replicable_id`, selector y rangos de `_all_docs`. Tests: `test_note_sync_filter.py` (`note:{uuid}` con un UUID, mayúsculas, `note-path:*`, `foo` → no replicable), `test_note_sync_api.py` (ninguna ruta devuelve `note-path:*`), `test_sync_push.py` existente (`note:{uuid}` sigue `invalid-id`).
### Implementación de RF-007
`editor/NoteEditor.tsx` (modo `read` por defecto) y `editor/MilkdownView.tsx` (`readOnly`). Tests: `NoteEditor.test.tsx` (abre en lectura; "Editar" / "Leer"), `MilkdownView.test.tsx` (en lectura no hay `contenteditable="true"`; enlaces `javascript:` y `<script>` neutralizados), `safeUrl.test.ts`.
### Implementación de RF-008
`NoteEditor.tsx` (`draft` único), `MilkdownView.tsx`, `CodeView.tsx`. Tests: `NoteEditor.test.tsx` (alternar no llama a `noteStore`), `MilkdownView.test.tsx`/`CodeView.test.tsx` (texto idéntico tras alternar sin editar; una edición en un modo aparece en el otro).
### Implementación de RF-009
`sync/conflicts.ts` (notas en el barrido y el feed), `notes/mergeNote.ts`, `notes/NoteConflictCard.tsx` en `sync/ConflictView.tsx`; resolución con revisiones deterministas. Tests: `mergeNote.test.ts` (nunca elige por fecha), `conflicts.test.ts` (nota), `NoteConflictCard.test.tsx`, `notes.integration.test.ts` (dos dispositivos, resolver converge).
### Implementación de RF-010
`noteStore.softDelete` (revisión con `deleted_at`, nunca lápida); paso 9 libera la ruta; `NoteSidebar` la quita del árbol; `NoteTrash` la lista. Tests: `noteStore.test.ts`, `NoteTrash.test.tsx`, `test_note_sync_push.py` (borrar libera).
### Implementación de RF-011
`noteStore.rename` (mismo `_id`, cambia `path`), pasos 7 y 9 del push con `NoteService`. Tests: `noteStore.test.ts`, `NoteSidebar.test.tsx`, `test_note_sync_push.py` (renombrar libera la anterior y reserva la nueva), `test_note_service.py`.
### Implementación de RF-012
`notes/untitled.ts` usado por `noteStore.create`. Tests: `untitled.test.ts` (`Sin título.md`, `Sin título 2.md`, hueco libre, equivalencia por `pathKey`), `noteStore.test.ts` (nunca error por falta de título).
### Implementación de RF-013
Local: `NotePathTakenError` en `create`/`rename`/`restore`. Servidor: paso 7 (`note-path-taken`) con `reservations.py`. Tests: `noteStore.test.ts`, `test_note_service.py` (carrera real en CouchDB), `test_note_sync_push.py`, `notes.integration.test.ts` (misma ruta en dos dispositivos).
### Implementación de RF-014
Cliente: `VaultWorkspacePage` da 404 con la bóveda en la papelera; `conflicts.ts` y `RejectionsPage` ocultan sus notas. Servidor: paso 6c rechaza; las reservas se conservan. Tests: `VaultWorkspacePage.test.tsx`, `test_note_sync_push.py`, `notes.integration.test.ts` (borrar la bóveda y restaurarla: notas intactas).
### Implementación de RF-015
`VaultWorkspacePage.tsx`: selección sólo en estado, nada en URL ni almacenamiento. Tests: `VaultWorkspacePage.test.tsx` (volver a montar → ninguna nota abierta; sin escrituras en `localStorage`).
### Implementación de RF-016
`noteRules.checkContent` en `noteStore.save` (no escribe) y mensaje en `NoteEditor`; paso 5 del push (`validation-error:content`); tope de 16 MiB y reparto de `remote.ts` (P-6). Tests: `noteStore.test.ts`, `NoteEditor.test.tsx`, `test_note_sync_api.py` (2 MiB guardado; +1 byte rechazado y versión previa intacta; 16 MiB + 1 → 413), `remote.test.ts`.
### Implementación de RF-017
`noteStore.restore` (comprobación local) y paso 7 del push. Tests: `noteStore.test.ts`, `NoteTrash.test.tsx` (ruta ocupada → mensaje), `test_note_sync_push.py` (restaurar con la ruta tomada → `note-path-taken`).
### Implementación de RF-018
`vaults/VaultListPage.tsx`: enlace "Abrir" a `/vaults/{id}`. Tests: `VaultListPage.test.tsx`.
### Implementación de RF-019
`NoteSidebar.tsx` + `noteTree.ts`; click → `NoteEditor` en modo lectura. Tests: `NoteSidebar.test.tsx`, `VaultWorkspacePage.test.tsx`.
### Implementación de RNF-001
`notes/tree.perf.test.tsx` (`npm run test:perf`): 1 000 notas, p95 de 30 montajes < 300 ms (§5); `noteStore.list` sin `content` en la salida y carpetas plegadas para un DOM pequeño.

`covers` de `spec.md` (se fija en este plan): `backend/app/core/note_rules.py`,
`backend/app/services/note_service.py`, `backend/app/services/reservations.py`,
`backend/tests/test_note*.py`, `backend/tests/test_reservations.py`,
`backend/tests/fixtures/note_rules_cases.json`, `frontend/src/notes/**`,
`frontend/src/editor/**`, `.harness/specs/0008-vault-editor/contracts/**`,
`.harness/specs/0008-vault-editor/diagrams/**`.
Archivos compartidos que 0008 modifica sin reclamarlos (un dueño por archivo; re-anclaje al
cierre, P-2): de 0003 `backend/app/services/vault_service.py`, `frontend/src/vaults/VaultListPage.tsx`
(+ test); de 0005 `backend/app/services/sync_filter.py`, `sync_push.py`,
`backend/app/routers/sync.py`, `backend/tests/test_sync_*.py` que cambien,
`frontend/src/sync/{resources,useSync,SyncProvider,conflicts,ConflictView,RejectionsPage,remote}.ts(x)`
(+ tests), `0005-sync/contracts/openapi.yaml`, `0005-sync/diagrams/`; de 0002 `App.tsx`,
`layout/AppLayout.tsx` (+ test), `backend/tests/test_contract.py`; de 0007
`backend/README.md`, `frontend/README.md`; sin dueño `test-setup.ts`, `vite.config.ts`,
`vitest.sync.config.ts`, `package.json`, `package-lock.json` y los README por capa.

## 10. Enmienda 1 (2026-10-22) — hallazgos de las verificaciones de D–E (APPROVED) y F–G (REJECTED)
> Cambios técnicos dentro de lo aprobado (ningún RF ni decisión de §6 cambia). Se registran
> aquí para revisión por *git diff* (method §5, Directiva de Pausa); coordinador: Claude
> Code bajo la delegación de AIRA del 2026-10-22.

| Hallazgo | Severidad | Causa raíz | Corrección |
|---|---|---|---|
| VF-1 · salir de `/vaults/:id` por navegación interna descarta el borrador | High | §2.6 pedía "aviso al salir", pero con `BrowserRouter` no hay forma de bloquear la navegación interna (`useBlocker` sólo existe en *data routers*) | `main.tsx` pasa a `createBrowserRouter([{ path: "*", element: <App/> }])` + `RouterProvider` (las `<Routes>` de `App.tsx` siguen igual, como rutas descendientes). `NoteEditor` usa `useBlocker(dirty)` y el mismo diálogo que al cambiar de nota ("Guardar y salir", "Descartar y salir", "Seguir editando"). Los tests de componentes con `useBlocker` montan con `createMemoryRouter`. `main.tsx`/`App.tsx` son de 0002: re-anclaje al cierre (P-2). |
| VF-2 · borrar la nota abierta con borrador sucio lo descarta | Medium/High | `NoteSidebar` borra y desmonta el editor sin consultar su estado | El borrado de la nota abierta pasa por el editor: si está sucia, el mismo diálogo de confirmación antes de `softDelete`. |
| VF-3 · renombrar la nota abierta con borrador sucio crea un conflicto autoinfligido | Medium/High | Con borrador sucio el editor no se rebasa sobre la revisión nueva y guarda sobre `baseRev` viejo (P-8 es para ediciones concurrentes, no para acciones locales) | Si la revisión nueva conserva el `content` de la base (sólo cambió `path`/metadatos), el editor actualiza `baseRev` y la ruta sin tocar el borrador. Si cambió el contenido, sigue P-8. |
| VF-4 · nota abierta enviada a la papelera por sync con borrador sucio | Medium | El editor sólo ofrece guardar (falla con `NoteNotFoundError`) o descartar | Aviso en el editor con "Restaurar y guardar" (`restore` sujeto a RF-013 y después `save`); si la ruta está ocupada, mensaje y el borrador se conserva. |
| VF-5 · `missing` no se limpia al reaparecer la nota | Low | la rama de éxito no hace `setMissing(false)` | Corregirlo. |
| VF-6 · aserción débil en `MilkdownView.test.tsx` | Low | `link === null \|\| …` | Exigir el `<a>` presente. |
| VF-8 · `#fff` fijo en `notes.css` | Low | color sin token | Token de `tokens.css`. |
| VF-9 · `role="tree"` sin teclado de árbol | Low | los roles anuncian un patrón que no existe | Teclado WAI-ARIA del árbol: ↑/↓, →/← (abrir/cerrar carpeta o ir al padre), Inicio/Fin, *roving tabindex*. |
| RD-1 · la bóveda "activa" se mira sólo en la ganadora | Medium | `conflicts.ts`/`repush.ts` no aplican P-9 | Función compartida `vaultIsActive(db, vaultId)`: activa si alguna rama viva (ganadora o `_conflicts`) tiene `deleted_at = null`. |
| RD-2 · `repush` se queda sin disparador tras un fallo de red o al arrancar | Medium | sólo se dispara por cambios de la bóveda; el `catch` traga el fallo | También se dispara al abrir `resources` (rechazos `vault-not-found` persistidos con bóveda ya activa) y al reconectar (`status` online); un fallo deja el reintento pendiente para el siguiente disparador. |
| RD-3 · `retry` lee rechazos sin esperar `settled()` | Low | carrera con el registro del rechazo del mismo lote | `await rejections.settled()` antes de `list()`. |
| VF-7 · pares test/código en un solo commit | Low (proceso) | — | Desde la enmienda, el test rojo se commitea aparte. |

## 11. Enmienda 2 (2026-10-22) — re-verificación del frontend (hallazgos nuevos de la enmienda 1)
| Hallazgo | Severidad | Causa raíz | Corrección |
|---|---|---|---|
| N-1 · `useBlocker(dirty)` intercepta el cierre de sesión y la redirección por 401 | High | El bloqueo es booleano y la salida de sesión se decide en `SyncProvider` sin saber que hay un borrador sucio: cuando el editor pregunta, la sesión y la réplica ya están cerradas | (a) Registro de borradores sucios en el proveedor de sync (`unsavedDrafts`: el editor se registra mientras está sucio). `LogoutDialog` lo consulta **antes** de cerrar la sesión y avisa "hay cambios sin guardar en una nota" (mismo diálogo de 0005: salir igualmente / cancelar). (b) El bloqueo pasa a función: no bloquea la navegación a `/login` (la sesión ya terminó; el aviso se dio en (a) o la sesión caducó en el servidor). |
| N-2 · el bloqueo atrapa navegaciones que no cambian de pantalla | Medium | bloqueo booleano | La función bloquea sólo si cambia `pathname` (y no es `/login`). |
| N-3 · RD-1 sólo probado en `vaultActive` | Medium | faltan pruebas en los consumidores | Test en `conflicts.test.ts` y en `repush.test.ts` con la bóveda en conflicto (ganadora en papelera, perdedora activa) que falla si vuelven al `db.get` simple. |
| N-4 · `repush.enqueueAll` corta el id de bóveda por longitud fija | Low | supone UUID de 36 caracteres sin decirlo | Extraer el `vault_id` con el parser de ids de nota de `noteRules`/`noteStore` (un solo lugar que entiende `note:{vault}:{uuid}`). |
| N-5/N-6 · VF-5, VF-6, VF-8 sin commit rojo previo | Low (proceso) | — | Registrado; no se reescribe historia. |

## 12. Enmienda 3 (2026-10-22) — verificación del backend (REJECTED)
| Hallazgo | Severidad | Causa raíz | Corrección |
|---|---|---|---|
| VB-1 · `frontmatter` con `NaN`/`Infinity`/`1e999` → 500 en el push y lote atascado | High | `check_frontmatter` mide con `json.dumps` (que admite no finitos) y el fallo aparece al reenviar a CouchDB | `check_frontmatter` rechaza números no finitos (`allow_nan=False`) con `validation-error:frontmatter`; casos en `note_rules_cases.json`; el espejo TS (`noteRules.ts`) aplica la misma regla. Test de API: el push responde con el rechazo, nunca 500. |
| VB-2 · `_bulk_docs` lee hasta 16 MiB sin sesión | Medium | `SyncRoute.limited` lee el cuerpo antes de la dependencia de sesión | La sesión se valida antes de leer el cuerpo en todas las rutas de `/sync` (401 sin leer el cuerpo); test que lo demuestra. |
| VB-3 · JSON con anidamiento extremo → 400 no declarado | Low | `RecursionError` al decodificar el cuerpo no se trata como JSON inválido | Tratarlo igual que cualquier cuerpo JSON inválido, con la respuesta declarada en el contrato para ese caso; test. |
| VB-4 · 413 de 0005 movidos a `_revs_diff` | Low | — | Aceptado (sin aserción debilitada). |
| VB-5 · enteros de > 4300 dígitos → `ValueError` → 400 no declarado (re-verificación) | Medium | Misma raíz que VB-3: `_DeepJsonRequest.json` sólo trata `RecursionError` | Tratar todo `ValueError` del decodificador (incluido `int_max_str_digits`) como JSON inválido → 422 declarado; test con 5000 dígitos en todas las rutas con cuerpo. |

## 13. Enmienda 4 (2026-10-23) — verificación en navegador real (T-094)
> Recorrido completo 19/19 en Chromium real; RNF-001 en navegador p95 131,8 ms. Defectos de
> percepción y uno de 0002 destapado por el recorrido. Evidencia exigida (method §5): capturas
> antes/después en los estados afectados, no sólo DOM.

| Hallazgo | Severidad | Causa raíz | Corrección |
|---|---|---|---|
| VU-1 · filas del árbol y listas del markdown pintadas como tarjetas; nombres aplastados letra a letra | High (percepción) | `styles/global.css` estiliza `ul`/`ul > li` sin ámbito (pensado para la lista de bóvedas) y alcanza cualquier lista de la app | Acotar esos estilos a la lista de bóvedas (clase propia en `VaultListPage`, y su papelera si la usa) sin cambiar su aspecto; el árbol y el render de markdown con estilos propios (fila compacta, nombre sin cortar, `min-width: 0` + elipsis). Capturas antes/después de: lista de bóvedas (idéntica), árbol, nota en lectura con listas. |
| VU-2 · en lectura el contenido se anuncia como `textbox` | Low | `@milkdown/core` reescribe `role` | Con `editable: false`, fijar `role="document"` y `aria-readonly` tras crear la vista; test. |
| VU-3 · falta `prosemirror.css` | Low | no se importa la hoja base de ProseMirror | Importarla en el *chunk* del editor; el aviso de `white-space` desaparece. |
| VU-4 · el árbol no tiene scroll propio (1 000 notas → página de ~12 000 px) | Low | la sidebar crece con su contenido | Sidebar con altura acotada al viewport y scroll propio; captura con 1 000 notas. |
| VU-6 · renombrar no añade `.md` (crear sí) | Low | dos reglas de título→ruta | Una sola función título→ruta para `create` y `rename`; test rojo. |
| VU-5 · tras el cambio de contraseña forzado se vuelve al formulario vacío (la contraseña sí cambió) | Medium — **SPEC-0002** | `RequireAuth` decide con `must_change_password` en caché tras el cambio (por confirmar) | Fuera del alcance funcional de 0008 pero rompe el primer ingreso de todo usuario: corrección de raíz con test rojo anotado con el RF de 0002 que corresponda, commit propio citándolo; re-anclaje de 0002 al cierre. |

## 14. Enmienda 5 (2026-10-23) — Converge, corrida 1 (accesibilidad del árbol)
> Suites en verde (backend 1050, frontend 740, sync 25, perf p95 116,6 ms) y trazabilidad `Pass`
> RF por RF; cuatro hallazgos nuevos con una raíz común: las acciones de nota viven dentro del
> `role="tree"`.

| Hallazgo | Severidad | Causa raíz | Corrección |
|---|---|---|---|
| C-1 · cada nota añade 2 paradas de Tab (≈ 2 000 con 1 000 notas), anula el *roving tabindex* | Medium | botones de acción por fila dentro del árbol | Las acciones salen del árbol: barra de acciones de la nota seleccionada (en la cabecera del editor/sidebar: "Renombrar", "Borrar"), una sola parada de Tab cada una; atajos desde el `treeitem` enfocado: F2 renombrar, Supr borrar (con la confirmación de VF-2 si está sucia). |
| C-2 · acciones ocultas hasta *hover*, sin vía táctil | Low | `max-width:0; opacity:0` + `:hover` | Resuelto por C-1 (la barra es siempre visible con una nota seleccionada). |
| C-3 · `aria-readonly` no es válido en `role="document"` | Low | VU-2 lo pidió así | Quitar `aria-readonly`; `role="document"` basta en lectura. |
| C-4 · `<button>` dentro de `role="tree"` (hijos no permitidos) | Low | igual que C-1 | Resuelto por C-1. |
| (ajeno) `localStorage is not defined` en `sync/localDb.ts:56` durante `test:sync` | — | entorno Node de la integración (0005) | Backlog de 0005, sin efecto en resultados; no se toca aquí. |

## 15. Enmienda 6 (2026-10-23) — Converge corrida 1 bis
| Hallazgo | Severidad | Causa raíz | Corrección |
|---|---|---|---|
| C-5 · tras borrar o renombrar el foco cae a `body` (WCAG 2.4.3) | Medium-Low | el elemento enfocado se desmonta sin destino de foco | Foco a la fila vecina tras borrar (o "Nueva nota" si no queda ninguna); al `treeitem` de la nota tras guardar/cancelar el renombrado. |
| C-6 · F2/Supr ignoran `busy` (doble `remove` con la misma `rev`) | Low | los atajos no comparten la guarda del botón | Misma guarda `busy` en los atajos. |
| C-7 · T-128…T-130 fuera de la tabla de cobertura | Low | — | Corregido por el coordinador en `tasks.md`. |

## 16. Enmienda 7 (2026-10-23) — Converge corrida 1 ter
| Hallazgo | Severidad | Causa raíz | Corrección |
|---|---|---|---|
| H1 · borrar la única nota de una carpeta deja el foco en `body` y una petición de foco colgada (la carpeta reaparecida roba el foco) | Medium | el vecino se calcula sobre las filas **antes** del borrado; las carpetas sin notas desaparecen del árbol derivado | Calcular el vecino sobre el árbol resultante (sin la nota y sin las carpetas que quedan vacías); si la clave pedida no existe tras releer, foco a "Nueva nota" y la petición se descarta. Tests: nota única en carpeta; última fila del árbol. |

## 17. Enmienda 8 (2026-10-23) — Converge corrida 1 con 4 revisores especializados
| Hallazgo | Severidad | Causa raíz | Corrección |
|---|---|---|---|
| H-1 · id de reserva `note-path:{vault}:{path_key}` sin tope: NFKC expande hasta ×18 (`"ﷺ"*300` → 5 400 caracteres) → CouchDB 400 → `StorageUnavailable` → 503 de todo el lote en cada reintento | High | el id usa la clave completa | `note-path:{vault_id}:{sha256(path_key)}` (hex), determinista y acotado; el documento guarda la `path_key` para diagnóstico. Test de API con `"ﷺ"*300` → 201 y unicidad intacta. (Sin datos previos de `note-path:*`: no hay migración.) |
| H-2 · `_rev` con > 4 300 dígitos de generación → `ValueError` → 500 | Medium | `int(match[1])` sin tope | Acotar la generación en el patrón de `_rev` (`[1-9][0-9]{0,15}`) → `validation-error:_rev` (mismo motivo que cualquier `_rev` mal formado); test. |
| E-1 · doble Ctrl/Cmd+S (o auto-repeat) crea una rama de conflicto con contenido idéntico | Medium | `save()` sin guarda de reentrada (sólo el botón se deshabilita) | Serializar guardados: un guardado en vuelo absorbe la llamada; si el borrador cambió durante el vuelo, se guarda después sobre la `rev` nueva. |
| E-2 · bóveda enviada a la papelera por sync con borrador sucio → el borrador se descarta en silencio | Low | el 404 desmonta el editor | El 404 de la bóveda muestra el borrador sin guardar (sólo lectura) con "Copiar texto" mientras exista; RF-014 se mantiene (no se edita ni se guarda). |
| U-1 · los `alertdialog` del editor no mueven el foco, sin Escape ni retorno | Medium | diálogos sin gestión de foco | Foco al primer botón al abrir, Escape = "Seguir editando", foco atrapado y retorno al disparador. |
| U-2 · texto de acento sobre `--accent-soft` a 3,15:1 (fila seleccionada; botón Visual/Código activo) | Medium-Low | color de texto de acento | `--text-primary` + indicador de acento (borde/barra), como el riel. |
| U-3 · Escape no cancela el renombrado | Low | — | Escape → `cancelRename()`. |
| U-4 · nombre accesible del riel sin el texto visible (WCAG 2.5.3) | Low | `aria-label` = nombre completo | Iniciales `aria-hidden` + nombre visualmente oculto, o `aria-label` que empiece por las iniciales. |
| U-5 · docs desfasadas (routers README, backend README §Límites, frontend/src README de `NoteSidebar`, `.card-list`, `titleToPath`) y T-123 pide `aria-readonly` | Low | — | Actualizar docs y el texto de T-123 (C-3). |
| S-1 · `list`/`create`/`rename`/`restore` y el barrido de conflictos leen el `content` de todas las notas (hasta 2 MiB c/u) en cada guardado y cada lote del pull | Medium | `allDocs({include_docs:true})` sobre la bóveda | Índice de resumen en memoria por réplica (`{id, path, rev, deleted_at, updated_at, conflicted}`): se construye una vez al abrir y se actualiza incrementalmente con el feed de cambios (sólo los ids cambiados se leen); `list`/unicidad/"Sin título n" leen el índice; el barrido de conflictos usa `conflicts:true` sobre ids marcados. RNF-001 sigue medido. |
| S-2 · doble borrado (o doble restauración) en dos dispositivos → conflicto con dos versiones idénticas | Low-Medium | `mergeNote` compara `deleted_at` exacto | Ramas con el mismo contenido y el mismo estado (ambas activas o ambas en papelera) se consideran iguales y convergen sin decidir por fecha. |
| S-3 · cuota llena al resolver un conflicto → error genérico | Low | `resolve` no traduce `isQuotaError` | `StorageFullError` y su mensaje. |
| S-4 · comentario falso ("dos guardados idénticos dan la misma revisión") | Low | el hash incluye `updated_at` | Corregir el comentario (la convergencia la garantiza `mergeNote`). |
| S-5 · título ".md" → fila sin nombre | Low | `displayName` vacío | Si queda vacío, mostrar el segmento completo. |
| (backlog 0003) `vault-name:{name_key}` tiene el mismo riesgo que H-1 (100 caracteres ×18) | — | id sin tope en SPEC-0003 | **No se toca en 0008**: cambiar el formato exige migrar reservas existentes. Backlog para decisión de Carlos. |

## 18. Enmienda 9 (2026-10-23) — Converge tras la enmienda 8
> Backend y seguridad: sección limpia. Hallazgos nuevos, todos Low/Low-Medium, en el frontend.

| Hallazgo | Severidad | Causa raíz | Corrección |
|---|---|---|---|
| T-1 · T-133…T-141 fuera de la tabla de cobertura | Low-Medium (proceso) | — | Corregido por el coordinador en `tasks.md`. |
| S-6 · con la cuota llena, la tarjeta de conflicto muestra "Inténtalo de nuevo" | Low-Medium | `NoteConflictCard`/`ConflictView` sólo traducen `NoteValidationError` | Toda la familia de errores conocidos (`StorageFullError` incluido) pasa por `noteErrorMessage`/el traductor de bóvedas; test de componente. |
| S-7 · la construcción inicial del índice trae todos los cuerpos de una vez | Low | primer `allDocs({include_docs:true})` sin paginar | Paginar (lotes de 200 con `startkey` exclusivo) y descartar cada cuerpo al indexarlo. |
| E-3 · el 404 de la bóveda muestra un borrador que el usuario descartó a propósito | Low | `salvaged` no se limpia en el cierre voluntario de la nota | Limpiarlo cuando la nota se cierra/borra/descarta voluntariamente; sólo sobrevive a la pérdida involuntaria de la bóveda. |
| E-4 · "Copiar texto" sin API de portapapeles: rechazo no manejado, sin aviso | Low | sin `try/catch` ni alternativa | Aviso "No se pudo copiar; selecciona el texto" y selección automática del texto; test sin `navigator.clipboard`. |
| E-5 · el diálogo de descarte enfoca primero la acción destructiva | Low | `ConfirmDialog` enfoca el primer botón | `ConfirmDialog` acepta el botón de foco inicial; en los diálogos de descarte, "Seguir editando". |
