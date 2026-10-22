---
id: TASKS-0008
tipo: tasks
feature: 0008-vault-editor
estado: draft
actualizado: 2026-10-22
---

# TASKS-0008 · Editor de documentos dentro de una bóveda

> Desglose de PLAN-0008 (GATE 2 aprobado por AIRA en nombre de Carlos, P-1 aceptado).
> Orden de PLAN-0008 §6. Cada tarea de test (rojo) va inmediatamente antes de la que la
> pone en verde.

## Reglas
- Cada tarea: ≤ 30 min, un solo propósito, `(cubre RF-NNN)`, zona del patrón (o `[doc]`).
- Orden por dependencias (PLAN-0008 §6). **Test antes que código.**
- Cada tarea lleva su `CHECK:` (comando exacto, rutas relativas a la raíz del repo) y su
  `EXPECT:` (resultado esperado; en un test rojo, el fallo esperado).
- Cada fila de `plan.md §8` → una tarea `[doc]` (bloque I).
- Errores con el catálogo de SPEC-0004: ninguna `HTTPException`. Los rechazos del push son
  por documento (`forbidden` + `reason`), nunca HTTP.
- Tests nuevos del backend en `backend/tests/test_note*.py` y `test_reservations.py`
  (cubiertos por 0008). Los tests de 0002/0003/0005 que cambien se re-anclan al cierre (P-2).
- **Nunca** se añade `test.db` al repositorio (`git add` explícito, nunca `-A`).
- La suite completa del backend tarda **~13 min** y no se cuelga (`state.md`): no se corta.
- Cada test lleva en un comentario el `RF-` que cubre (Art. 9).

## Tareas

### 0 · Línea base
- [x] T-000 — Suites completas en verde antes de tocar nada; anotar los números en `history.md` (cubre RF-001…RF-019, RNF-001: referencia de no regresión) [zona: sistema]
  - CHECK: `bash .harness/gate/check.sh && (cd backend && python3 -m pytest -q) && (cd frontend && npx vitest run && npm run typecheck)`
  - EXPECT: gate "Compuerta abierta"; backend `passed` con 0 failed (≈ 791 tests, ~13 min); frontend todos los archivos `passed`, 0 failed; typecheck sin errores.

### A · Contrato y núcleo del backend (PLAN-0008 §2.1, §4)
- [x] T-001 — Test (rojo) `test_note_contract.py`: `note.schema.json` tiene `additionalProperties: false`, `required` = `NOTE_REQUIRED`, `properties` = `NOTE_KEYS`, `path.maxLength` = `PATH_MAX`, `content.x-max-utf8-bytes` = `CONTENT_MAX_BYTES`, `frontmatter.x-max-json-utf8-bytes` = `FRONTMATTER_MAX_BYTES` (cubre RF-005) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_contract.py`
  - EXPECT: falla al importar: `ModuleNotFoundError: No module named 'app.core.note_rules'`.
- [x] T-002 — Test (rojo) en `test_contract.py`: el `reason` de `BulkDocsRejection` del contrato de 0005 contiene `note-path-taken` y `vault-not-found` (cubre RF-004, RF-013) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_contract.py -k push_schemas`
  - EXPECT: 1 failed (`AssertionError: note-path-taken`).
- [x] T-003 — Batería común `backend/tests/fixtures/note_rules_cases.json`: casos de `path` (1/300/301 puntos de código, `Cc`, `/a`, `a/`, `a//b`, segmento sólo espacios, `" a / b "`, U+0085, U+FEFF), `content` (2 MiB exactos con multibyte, +1 byte, sustituto suelto), `frontmatter` (64 KiB, +1, no objeto) y `path_key` (ß/SS, NFC/NFD, anchura completa) con veredicto, forma normalizada y clave (cubre RF-005, RF-013, RF-016) [zona: test]
  - CHECK: `python3 -I -c "import json;d=json.load(open('backend/tests/fixtures/note_rules_cases.json'));print(sorted(d))"`
  - EXPECT: imprime las secciones `content`, `frontmatter`, `path`, `path_key`; JSON válido.
- [x] T-004 — Test (rojo) `test_note_rules.py`: recorre la batería contra `check_path`, `normalize_path`, `path_key`, `check_content`, `check_frontmatter` (cubre RF-005, RF-013, RF-016) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_rules.py`
  - EXPECT: error de colección `ModuleNotFoundError: No module named 'app.core.note_rules'`.
- [x] T-005 — `backend/app/core/note_rules.py`: constantes, `NOTE_KEYS`/`NOTE_REQUIRED`, `normalize_path` (strip `White_Space` por segmento), `check_path`, `path_key`, `check_content`, `check_frontmatter`, comentadas (cubre RF-005, RF-013, RF-016) [zona: núcleo]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_rules.py tests/test_note_contract.py`
  - EXPECT: todos `passed`, 0 failed.

### B · Reservas (PLAN-0008 §2.2)
- [x] T-006 — Test (rojo) `test_reservations.py` con doble en memoria de `VaultPort`: crear, reescritura propia, ocupada → `ReservationTaken`, huérfana reasignada, arrendamiento de 30 s, `release` no borra una reserva reasignada ni una en uso (cubre RF-011, RF-013) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_reservations.py`
  - EXPECT: error de colección `ModuleNotFoundError: No module named 'app.services.reservations'`.
- [x] T-007 — `backend/app/services/reservations.py`: `ReservationTaken`, `reserve(reservation_id, owner, holds)`, `release(...)` extraídos de `VaultService` sin cambiar el algoritmo (cubre RF-011, RF-013) [zona: servicio]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_reservations.py`
  - EXPECT: todos `passed`.
- [x] T-008 — `vault_service.py` delega `reserve`/`release` en `reservations.py` y traduce a `VaultNameTaken`; ningún test de bóvedas se modifica (cubre RF-013: no regresión del mecanismo compartido) [zona: servicio]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_vault_service.py tests/test_vaults_concurrency.py tests/test_vaults_api.py tests/test_sync_push.py && git diff --stat -- backend/tests`
  - EXPECT: todos `passed`; `git diff` no lista ningún `test_vault*.py` ni `test_sync_push.py`.
- [x] T-009 — Test (rojo) `test_note_service.py` contra CouchDB real: reservar ruta, equivalencia NFKC+casefold → `NotePathTaken`, dos reservas simultáneas de la misma ruta (hilos) → una gana, rama perdedora viva conserva su reserva, `release_path` tras renombrar (cubre RF-011, RF-013, RF-017) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_service.py`
  - EXPECT: error de colección `ModuleNotFoundError: No module named 'app.services.note_service'`.
- [x] T-010 — `backend/app/services/note_service.py`: `NoteService`, `NotePathTaken`, `reserve_path`, `release_path`, predicado `holds` sobre todas las hojas vivas de la nota; documento `note-path:{vault_id}:{path_key}` (cubre RF-011, RF-013, RF-017) [zona: servicio]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_service.py`
  - EXPECT: todos `passed`.

### C · Filtros, push y rutas (PLAN-0008 §2.3–§2.5)
- [x] T-011 — Test (rojo) `test_note_sync_filter.py`: `is_replicable_id` acepta `note:{uuid}:{uuid}` canónico y rechaza `note:{uuid}`, mayúsculas, `note-path:*`, `foo`; selector `^(vault|note):`; `all_docs_query` devuelve dos rangos (`note:` antes que `vault:`) (cubre RF-006) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_sync_filter.py`
  - EXPECT: failed en los casos de nota y de rangos (`assert False`/`KeyError`); los de `vault:` pasan.
- [x] T-012 — `sync_filter.py`: `is_replicable_id` con notas, selector ampliado, `all_docs_query` con lista de rangos (cubre RF-006) [zona: servicio]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_sync_filter.py tests/test_sync_filter.py`
  - EXPECT: todos `passed` (si un test de 0005 fija el rango único, se ajusta en esta tarea y se anota para el re-anclaje).
- [x] T-013 — Test (rojo) `test_note_sync_push.py` (dobles), forma y campos: claves sobrantes/ausentes, `type`, `frontmatter` opcional, `validation-error:path|content|frontmatter`, `not-normalized:path`, `vault_id` ≠ id, timestamps, `created_at` inmutable (cubre RF-005, RF-016) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_sync_push.py -k "shape or field"`
  - EXPECT: failed: las notas salen como `invalid-id` en lugar del código esperado.
- [x] T-014 — `sync_push.py`: tabla `_KINDS` por prefijo; pasos 4–6a/6b para notas con `note_rules` (cubre RF-005, RF-016) [zona: servicio]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_sync_push.py -k "shape or field" tests/test_sync_push.py`
  - EXPECT: todos `passed`.
- [x] T-015 — Test (rojo) en `test_note_sync_push.py`, bóveda activa: inexistente → `vault-not-found`; borrada → `vault-not-found`; creada en el mismo lote (también en orden "nota, bóveda") → aceptada; en conflicto con una rama activa → aceptada; lápida de nota de bóveda borrada → `vault-not-found` (cubre RF-004, RF-014) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_sync_push.py -k vault`
  - EXPECT: failed: no existe el código `vault-not-found` (se aceptan o rechazan con otro código).
- [x] T-016 — `sync_push.py`: paso 6c sobre la proyección de `vault:{vault_id}` y orden bóvedas-antes-que-notas tras la pasada de identidad (cubre RF-004, RF-014) [zona: servicio]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_sync_push.py -k vault`
  - EXPECT: todos `passed`.
- [x] T-017 — Test (rojo) en `test_note_sync_push.py`, reservas: ruta tomada → `note-path-taken`; renombrar libera la anterior y reserva la nueva; soft delete libera; restaurar reserva o `note-path-taken`; lote mixto bóvedas + notas rechaza sólo la mala (cubre RF-010, RF-011, RF-013, RF-017) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_sync_push.py -k "reserv or rename or delete or restore or mixed"`
  - EXPECT: failed: sin reserva de rutas no hay `note-path-taken` ni liberaciones.
- [x] T-018 — `sync_push.py`: pasos 7 y 9 para notas con `NoteService`; `SyncPushService` recibe `notes` (cubre RF-010, RF-011, RF-013, RF-017) [zona: servicio]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_sync_push.py tests/test_sync_push.py`
  - EXPECT: todos `passed`.
- [x] T-019 — Test (rojo) `test_note_sync_api.py` (TestClient + CouchDB real): nota válida empujada y devuelta por `_changes`, `_all_docs` (con `limit` entre rangos), `_bulk_get`, `_revs_diff`; `note-path:*` nunca aparece; 2 MiB con emojis y con caracteres de control se guarda y se relee igual; +1 byte → `validation-error:content` y la revisión previa sigue; cuerpo de 16 MiB + 1 → 413; de 12 MiB → 201 (cubre RF-004, RF-006, RF-016) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_sync_api.py`
  - EXPECT: failed: 413 con cuerpos > 4 MiB, `_all_docs` sin notas, push sin `NoteService`.
- [x] T-020 — `routers/sync.py`: tope por ruta (`MAX_BULK_DOCS_BYTES` = 16 MiB para `_bulk_docs`), `REJECTION_REASON` con los dos códigos, `get_push_service` con `NoteService`, `_all_docs` con dos rangos y corte por `limit` (cubre RF-004, RF-006, RF-016) [zona: ruta]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_sync_api.py tests/test_sync_api.py`
  - EXPECT: todos `passed` (el test de 0005 que fija 413 a 4 MiB en `_bulk_docs` se ajusta aquí; anotado para el re-anclaje).
- [x] T-021 — Test (rojo→verde) `test_note_sync_isolation.py`: B no ve notas ni reservas de A por ninguna ruta; nota de B con el `vault_id` de una bóveda de A → `vault-not-found` y la base de A sin cambios; `note-path:*` empujado → `invalid-id` (cubre RF-004, RF-006) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_sync_isolation.py`
  - EXPECT: todos `passed` (con T-020 ya hecho; si alguno falla, es un hallazgo de aislamiento y se corrige en el origen antes de seguir).
- [x] T-022 — Re-export del contrato de 0005 (`scripts/export_openapi.py`) (cubre RF-004, RF-013) [zona: script]
  - CHECK: `cd backend && python3 scripts/export_openapi.py && python3 -m pytest -q tests/test_contract.py`
  - EXPECT: `0005-sync/contracts/openapi.yaml` cambia sólo en `reason` y en el texto del 413; `test_contract.py` todos `passed` (T-002 en verde).
- [x] T-023 — Suite completa del backend y cobertura de los módulos tocados (cubre RF-004, RF-005, RF-006, RF-013, RF-016) [zona: sistema]
  - CHECK: `cd backend && python3 -m pytest -q --cov=app --cov-report=term-missing`
  - EXPECT: 0 failed; `note_rules.py`, `note_service.py`, `reservations.py`, `sync_push.py`, `sync_filter.py`, `routers/sync.py` ≥ 80 % (objetivo 90 % en los nuevos).

### D · Frontend base (PLAN-0008 §2.6, P-3)
- [x] T-024 — Dependencias exactas del editor (P-3): `@milkdown/{core,ctx,prose,preset-commonmark,preset-gfm,plugin-listener,plugin-history}@7.22.3`, `@codemirror/state@6.7.6`, `@codemirror/view@6.43.15`, `@codemirror/commands@6.11.1`, `@codemirror/language@6.13.1`, `@codemirror/lang-markdown@6.5.2` (cubre RF-008) [zona: configuración]
  - CHECK: `cd frontend && npm install --save-exact @milkdown/core@7.22.3 @milkdown/ctx@7.22.3 @milkdown/prose@7.22.3 @milkdown/preset-commonmark@7.22.3 @milkdown/preset-gfm@7.22.3 @milkdown/plugin-listener@7.22.3 @milkdown/plugin-history@7.22.3 @codemirror/state@6.7.6 @codemirror/view@6.43.15 @codemirror/commands@6.11.1 @codemirror/language@6.13.1 @codemirror/lang-markdown@6.5.2 && npm ls vue; npm ls @milkdown/core @codemirror/view && npx vitest run`
  - EXPECT: `npm ls vue` → `(empty)`; versiones exactas listadas; suite existente sin fallos.
- [x] T-025 — *Polyfills* de jsdom en `src/test-setup.ts` (`Range.getClientRects`, `Range.getBoundingClientRect`, `document.elementFromPoint`), comentados como hueco de jsdom (cubre RF-007, RF-008) [zona: test]
  - CHECK: `cd frontend && npx vitest run`
  - EXPECT: suite existente sin fallos.
- [x] T-026 — Test (rojo) `notes/noteRules.test.ts`: lee `backend/tests/fixtures/note_rules_cases.json` y exige el mismo veredicto, normalización y clave (cubre RF-005, RF-013, RF-016) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/noteRules.test.ts`
  - EXPECT: falla al resolver `./noteRules` ("Failed to resolve import").
- [x] T-027 — `notes/noteRules.ts` (espejo de `core/note_rules.py`; `pathKey` reutiliza `nameKey`) (cubre RF-005, RF-013, RF-016) [zona: núcleo]
  - CHECK: `cd frontend && npx vitest run src/notes/noteRules.test.ts`
  - EXPECT: todos `passed`.
- [x] T-028 — Test (rojo) `notes/untitled.test.ts`: `Sin título.md`, `Sin título 2.md`, hueco libre, equivalencia por `pathKey` (cubre RF-012) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/untitled.test.ts`
  - EXPECT: falla al resolver `./untitled`.
- [x] T-029 — `notes/untitled.ts` (cubre RF-012) [zona: núcleo]
  - CHECK: `cd frontend && npx vitest run src/notes/untitled.test.ts`
  - EXPECT: todos `passed`.
- [x] T-030 — Test (rojo) `notes/noteTree.test.ts`: anidado sin aplanar, carpetas antes que notas, orden `es` numérico, nombre sin `.md`, carpeta sin notas desaparece (cubre RF-001, RF-019) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/noteTree.test.ts`
  - EXPECT: falla al resolver `./noteTree`.
- [x] T-031 — `notes/noteTree.ts` (`buildTree`) (cubre RF-001, RF-019) [zona: núcleo]
  - CHECK: `cd frontend && npx vitest run src/notes/noteTree.test.ts`
  - EXPECT: todos `passed`.
- [x] T-032 — Test (rojo) `notes/mergeNote.test.ts`: sólo difieren en `updated_at` → cerrar perdedora; cualquier otra diferencia (ruta, contenido, frontmatter, borrado) → manual; nunca decide por fecha (cubre RF-009) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/mergeNote.test.ts`
  - EXPECT: falla al resolver `./mergeNote`.
- [x] T-033 — `notes/mergeNote.ts` (cubre RF-009) [zona: núcleo]
  - CHECK: `cd frontend && npx vitest run src/notes/mergeNote.test.ts`
  - EXPECT: todos `passed`.
- [x] T-034 — Test (rojo) `notes/noteStore.test.ts` (PouchDB en memoria), alta y lectura: `create` con título (añade `.md`), sin título (`Sin título n`), ids `note:{vault}:{uuid}`, `frontmatter: {}`, ruta duplicada → `NotePathTakenError`; `list` por bóveda sin `content` y sin notas de otra bóveda; `get` (cubre RF-003, RF-012, RF-013) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/noteStore.test.ts`
  - EXPECT: falla al resolver `./noteStore`.
- [x] T-035 — `notes/noteStore.ts`: `create`, `list`, `get`, errores (cubre RF-003, RF-012, RF-013) [zona: servicio]
  - CHECK: `cd frontend && npx vitest run src/notes/noteStore.test.ts`
  - EXPECT: todos `passed`.
- [x] T-036 — Test (rojo) en `noteStore.test.ts`, cambios: `rename` (mismo `_id`, ruta ocupada → error), `softDelete` (revisión con `deleted_at`, nunca lápida), `restore` (ruta ocupada → `NotePathTakenError`), `save` > 2 MiB → `NoteValidationError` sin escribir, cuota llena → `StorageFullError` (cubre RF-010, RF-011, RF-016, RF-017) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/noteStore.test.ts`
  - EXPECT: failed: `rename`/`softDelete`/`restore`/`save` no existen.
- [x] T-037 — `noteStore.ts`: `rename`, `softDelete`, `restore`, `save` (camino normal) (cubre RF-010, RF-011, RF-016, RF-017) [zona: servicio]
  - CHECK: `cd frontend && npx vitest run src/notes/noteStore.test.ts`
  - EXPECT: todos `passed`.

### E · Sync del cliente (PLAN-0008 §2.6, P-6…P-8)
- [x] T-038 — Test (rojo) en `noteStore.test.ts`: `save` con `baseRev` desfasado escribe una rama hija de `baseRev` con revisión determinista (dos llamadas iguales → misma `_rev`) y el documento queda con `_conflicts` (cubre RF-009) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/noteStore.test.ts -t "desfasad"`
  - EXPECT: failed: `save` lanza el 409 de PouchDB.
- [x] T-039 — `sync/conflicts.ts` exporta `child()`; `noteStore.save` escribe la rama con `new_edits:false` ante el 409 (P-8) (cubre RF-009) [zona: servicio]
  - CHECK: `cd frontend && npx vitest run src/notes/noteStore.test.ts src/sync/conflicts.test.ts`
  - EXPECT: todos `passed`.
- [x] T-040 — Test (rojo) en `sync/conflicts.test.ts`: el barrido inicial y el feed detectan notas en conflicto; `mergeNote` cierra las sólo-`updated_at`; las demás quedan manuales con `kind: "note"`; `resolve` de nota escribe la elección; notas de una bóveda en la papelera no se listan (cubre RF-009, RF-014) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/sync/conflicts.test.ts`
  - EXPECT: failed en los casos de nota (no se detectan).
- [x] T-041 — `sync/conflicts.ts`: rangos `note:*`, combinación por tipo, `ManualConflict.kind`, filtro por bóveda activa (cubre RF-009, RF-014) [zona: servicio]
  - CHECK: `cd frontend && npx vitest run src/sync/conflicts.test.ts`
  - EXPECT: todos `passed`.
- [x] T-042 — Test (rojo) en `sync/remote.test.ts`: un `POST _bulk_docs` > 8 MiB se parte en sub-peticiones ≤ 8 MiB (un documento mayor va solo), se concatenan los rechazos en orden y un fallo de una sub-petición se devuelve tal cual; ≤ 8 MiB pasa sin cambios (cubre RF-016) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/sync/remote.test.ts`
  - EXPECT: failed: se envía una sola petición.
- [x] T-043 — `sync/remote.ts`: reparto de `_bulk_docs` en el `fetch` propio (P-6) (cubre RF-016) [zona: frontera]
  - CHECK: `cd frontend && npx vitest run src/sync/remote.test.ts`
  - EXPECT: todos `passed`.
- [x] T-044 — Test (rojo) `notes/repush.test.ts`: con un rechazo `vault-not-found` de una nota de `V`, un cambio que deja `V` activa dispara un push único con `doc_ids` de esas notas y `checkpoint: false`; sin rechazos o con `V` borrada no hace nada; los eventos van a rechazos y estado (cubre RF-004, RF-014) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/repush.test.ts`
  - EXPECT: falla al resolver `./repush`.
- [x] T-045 — `notes/repush.ts` (P-7) (cubre RF-004, RF-014) [zona: servicio]
  - CHECK: `cd frontend && npx vitest run src/notes/repush.test.ts`
  - EXPECT: todos `passed`.
- [x] T-046 — Test (rojo) en `sync/resources.test.ts` y `SyncProvider.test.tsx`: `notes` en los recursos y en el contexto; `notesVersion` cambia con escrituras `note:*` y **no** cambia `dataVersion`; `repush` se arranca y se cierra con los recursos (cubre RF-001, RF-019) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/sync/resources.test.ts src/sync/SyncProvider.test.tsx`
  - EXPECT: failed: `notes`/`notesVersion` indefinidos.
- [x] T-047 — `sync/resources.ts`, `sync/useSync.ts`, `sync/SyncProvider.tsx`: `NoteStore`, feed de notas, `notesVersion`, `repush` (cubre RF-001, RF-019) [zona: servicio]
  - CHECK: `cd frontend && npx vitest run src/sync && npm run typecheck`
  - EXPECT: todos `passed`; typecheck sin errores.

### F · Editor (PLAN-0008 §2.6)
- [x] T-048 — Test (rojo) `editor/safeUrl.test.ts`: admite `http`, `https`, `mailto`, relativos (enlaces) y `http`/`https` (imágenes); quita `javascript:`, `data:`, `vbscript:` con mayúsculas y espacios (cubre RF-007) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/safeUrl.test.ts`
  - EXPECT: falla al resolver `./safeUrl`.
- [x] T-049 — `editor/safeUrl.ts` (cubre RF-007) [zona: núcleo]
  - CHECK: `cd frontend && npx vitest run src/editor/safeUrl.test.ts`
  - EXPECT: todos `passed`.
- [x] T-050 — Test (rojo) `editor/CodeView.test.tsx` (CodeMirror real): muestra `value`; una transacción emite `onChange` con el texto nuevo; un `value` externo nuevo reemplaza el documento sin emitir (cubre RF-008) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/CodeView.test.tsx`
  - EXPECT: falla al resolver `./CodeView`.
- [x] T-051 — `editor/CodeView.tsx` (cubre RF-008) [zona: frontera]
  - CHECK: `cd frontend && npx vitest run src/editor/CodeView.test.tsx`
  - EXPECT: todos `passed`.
- [x] T-052 — Test (rojo) `editor/MilkdownView.test.tsx` (Milkdown real): `readOnly` sin `contenteditable="true"`; en edición una transacción emite markdown; montar sin editar no emite; `[x](javascript:alert(1))` sin `href` peligroso; `<script>` mostrado como texto, sin elemento `script` (cubre RF-007, RF-008) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/MilkdownView.test.tsx`
  - EXPECT: falla al resolver `./MilkdownView`.
- [x] T-053 — `editor/MilkdownView.tsx` (`Editor.make()`, commonmark + gfm + listener + history, esquemas de enlace/imagen con `safeUrl`) (cubre RF-007, RF-008) [zona: frontera]
  - CHECK: `cd frontend && npx vitest run src/editor/MilkdownView.test.tsx`
  - EXPECT: todos `passed`.
- [x] T-054 — Test (rojo) `editor/NoteEditor.test.tsx` (editores falsos inyectados): abre en lectura; "Editar"/"Leer"; alternar Visual/Código no llama a `noteStore` y conserva el borrador; "Guardar" y Ctrl/Cmd+S guardan; "Leer" con cambios guarda antes; > 2 MiB muestra el mensaje y no guarda; aviso de cambios sin guardar al cambiar de nota; aviso de conflicto con enlace a `/conflicts` (cubre RF-007, RF-008, RF-016) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/NoteEditor.test.tsx`
  - EXPECT: falla al resolver `./NoteEditor`.
- [x] T-055 — `editor/NoteEditor.tsx` + `editor/editor.css` (P-5) (cubre RF-007, RF-008, RF-016) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor`
  - EXPECT: todos `passed`.
- [x] T-056 — Test (rojo→verde) en `NoteEditor.test.tsx` con los editores **reales**: Visual → Código → Visual sin editar deja el markdown idéntico byte a byte; una edición en Código aparece en Visual (cubre RF-008) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/NoteEditor.test.tsx -t "reales"`
  - EXPECT: `passed` (si falla, la causa está en el envoltorio que reserializa sin cambios y se corrige allí).

### G · Pantallas (PLAN-0008 §2.6)
- [x] T-057 — Test (rojo) `notes/VaultRail.test.tsx`: un icono con iniciales por bóveda activa, no las de la papelera; click navega a `/vaults/{id}`; la activa marcada (cubre RF-001) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/VaultRail.test.tsx`
  - EXPECT: falla al resolver `./VaultRail`.
- [x] T-058 — `notes/VaultRail.tsx` + `notes/notes.css` (cubre RF-001) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/notes/VaultRail.test.tsx`
  - EXPECT: todos `passed`.
- [x] T-059 — Test (rojo) `notes/NoteSidebar.test.tsx`: árbol `role="tree"` con carpetas plegadas; click en una nota → `onOpen(id)`; "Nueva nota" con y sin título → abre en edición; renombrar/mover; borrar la quita; ruta ocupada → mensaje; relee con `notesVersion` (cubre RF-003, RF-010, RF-011, RF-012, RF-013, RF-019) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/NoteSidebar.test.tsx`
  - EXPECT: falla al resolver `./NoteSidebar`.
- [x] T-060 — `notes/NoteSidebar.tsx` + `notes/messages.ts` (cubre RF-003, RF-010, RF-011, RF-012, RF-013, RF-019) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/notes/NoteSidebar.test.tsx`
  - EXPECT: todos `passed`.
- [x] T-061 — Test (rojo) `notes/NoteTrash.test.tsx`: lista sólo las notas borradas de esta bóveda; "Restaurar" la devuelve al árbol; ruta ocupada → mensaje y sigue en la papelera (cubre RF-010, RF-017) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/NoteTrash.test.tsx`
  - EXPECT: falla al resolver `./NoteTrash`.
- [x] T-062 — `notes/NoteTrash.tsx` (cubre RF-010, RF-017) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/notes/NoteTrash.test.tsx`
  - EXPECT: todos `passed`.
- [x] T-063 — Test (rojo) `notes/VaultWorkspacePage.test.tsx`: bóveda activa → riel, árbol y editor vacío; id no canónico / inexistente / en la papelera → 404; bóveda que llega después por el pull sustituye al 404; volver a montar → ninguna nota abierta y nada en `localStorage`; click en una nota → modo lectura (cubre RF-001, RF-002, RF-014, RF-015, RF-019) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/VaultWorkspacePage.test.tsx`
  - EXPECT: falla al resolver `./VaultWorkspacePage`.
- [x] T-064 — `notes/VaultWorkspacePage.tsx` (editor con `React.lazy`) (cubre RF-001, RF-002, RF-014, RF-015, RF-019) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/notes/VaultWorkspacePage.test.tsx`
  - EXPECT: todos `passed`.
- [x] T-065 — Test (rojo) `App.test.tsx` y `layout/AppLayout.test.tsx`: `/vaults/{id}` monta la bóveda abierta; `/vaults/new` y `/vaults/trash` siguen en sus páginas; el riel está en las rutas privadas y no en `/login` (cubre RF-001) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/App.test.tsx src/layout/AppLayout.test.tsx`
  - EXPECT: failed en los casos nuevos (ruta y riel ausentes).
- [x] T-066 — `App.tsx` (ruta `/vaults/:id`) y `layout/AppLayout.tsx` (`VaultRail`) (cubre RF-001) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/App.test.tsx src/layout/AppLayout.test.tsx`
  - EXPECT: todos `passed`.
- [x] T-067 — Test (rojo) `vaults/VaultListPage.test.tsx`: "Abrir" junto a "Editar" lleva a `/vaults/{id}` (cubre RF-018) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/vaults/VaultListPage.test.tsx`
  - EXPECT: 1 failed (no hay enlace "Abrir").
- [x] T-068 — `vaults/VaultListPage.tsx`: enlace "Abrir" (cubre RF-018) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/vaults/VaultListPage.test.tsx`
  - EXPECT: todos `passed`.
- [x] T-069 — Test (rojo) `notes/NoteConflictCard.test.tsx` y `sync/ConflictView.test.tsx`: ambas versiones en texto plano (ruta, contenido, estado), "Quedarme con esta" llama a `resolveConflict`; `ConflictView` pinta la tarjeta para `kind: "note"` y la de bóveda como antes (cubre RF-009) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/NoteConflictCard.test.tsx src/sync/ConflictView.test.tsx`
  - EXPECT: falla al resolver `./NoteConflictCard`.
- [x] T-070 — `notes/NoteConflictCard.tsx` y `sync/ConflictView.tsx` (cubre RF-009) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/notes/NoteConflictCard.test.tsx src/sync/ConflictView.test.tsx`
  - EXPECT: todos `passed`.
- [x] T-071 — Test (rojo) `sync/RejectionsPage.test.tsx`: textos en español de `note-path-taken`, `vault-not-found` y campos de nota; "Corregir" de una nota lleva a `/vaults/{vault_id}` con la nota en el estado de navegación; notas de bóveda en la papelera ocultas (cubre RF-004, RF-013, RF-014) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/sync/RejectionsPage.test.tsx`
  - EXPECT: failed en los casos de nota (texto genérico, enlace de bóveda).
- [x] T-072 — `sync/RejectionsPage.tsx` con los textos de `notes/messages.ts`; `VaultWorkspacePage` abre la nota del estado de navegación (cubre RF-004, RF-013, RF-014) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/sync/RejectionsPage.test.tsx src/notes/VaultWorkspacePage.test.tsx`
  - EXPECT: todos `passed`.
- [x] T-073 — Suite completa del frontend, typecheck, cobertura y tamaño del *chunk* del editor (cubre RF-001…RF-019) [zona: sistema]
  - CHECK: `cd frontend && npm run test:cov && npm run build`
  - EXPECT: 0 failed; umbral de 80 % cumplido; el build lista un *chunk* aparte con Milkdown/CodeMirror (anotar su tamaño gzip en `history.md`) y el *chunk* principal no los incluye.

### H · Integración real y RNF-001 (PLAN-0008 §5)
- [ ] T-074 — `vitest.sync.config.ts` incluye `src/{sync,notes}/*.integration.test.ts`; `vite.config.ts` excluye `*.perf.test.tsx` salvo con `NOTES_PERF=1`; script `test:perf` en `package.json` (cubre RNF-001) [zona: configuración]
  - CHECK: `cd frontend && npx vitest run && npm run test:sync`
  - EXPECT: suite normal sin cambios de número; integración existente 16/16 `passed`.
- [ ] T-075 — Test `notes/notes.integration.test.ts` (dos dispositivos reales, backend y CouchDB reales): nota creada sin conexión llega; edición concurrente → conflicto manual en ambos y resolver converge; misma ruta en dos dispositivos → `note-path-taken` en uno (cubre RF-003, RF-009, RF-013) [zona: test]
  - CHECK: `cd frontend && npm run test:sync -- src/notes/notes.integration.test.ts`
  - EXPECT: todos `passed` (si falla, es un defecto de B–E y se corrige en su módulo, no en la prueba).
- [ ] T-076 — Casos de `notes.integration.test.ts`: bóveda borrada en A y nota editada en B → `vault-not-found`; restaurar la bóveda → el reintento la sube; bóveda + nota + renombrado de la bóveda con el corte de lote entre ambas → la nota acaba aceptada; notas intactas tras borrar y restaurar la bóveda (cubre RF-004, RF-014) [zona: test]
  - CHECK: `cd frontend && npm run test:sync -- src/notes/notes.integration.test.ts`
  - EXPECT: todos `passed`.
- [ ] T-077 — Casos de `notes.integration.test.ts`: diez notas de 2 MiB suben (reparto de `_bulk_docs`) y bajan al otro dispositivo; una de 2 MiB + 1 se rechaza en el cliente y no se pierde la anterior; renombrar/borrar/restaurar se replican (cubre RF-010, RF-011, RF-016, RF-017) [zona: test]
  - CHECK: `cd frontend && npm run test:sync -- src/notes/notes.integration.test.ts`
  - EXPECT: todos `passed`.
- [ ] T-078 — Test de rendimiento `notes/tree.perf.test.tsx`: 1 000 notas (+200 de otra bóveda), 30 montajes de `VaultWorkspacePage`, 3 de calentamiento, p95 hasta el árbol completo de primer nivel (cubre RNF-001) [zona: test]
  - CHECK: `cd frontend && npm run test:perf`
  - EXPECT: `passed` con el p95 impreso < 300 ms (anotar el valor en `history.md`).
- [ ] T-079 — Integración completa (canal de 0005 + notas) sin regresión (cubre RF-004, RF-006) [zona: sistema]
  - CHECK: `cd frontend && npm run test:sync`
  - EXPECT: todos los archivos `*.integration.test.ts` de `sync/` y `notes/` `passed`, 0 failed.

### I · Documentación, diagrama, re-anclajes y verificación manual (PLAN-0008 §8)
- [x] T-080 — Revisar `contracts/note.schema.json` contra la implementación final; corregir sólo si `test_note_contract.py` o la batería lo exigen [doc]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_contract.py`
  - EXPECT: `passed`; sin diferencias entre esquema y `core/note_rules.py`.
- [x] T-081 — `0005-sync/contracts/openapi.yaml` re-exportado y confirmado (sólo `reason` y 413) [doc]
  - CHECK: `git diff --stat -- .harness/specs/0005-sync/contracts/openapi.yaml && cd backend && python3 -m pytest -q tests/test_contract.py`
  - EXPECT: un archivo cambiado; `passed`.
- [x] T-082 — `backend/README.md`: "Sincronización" (tipos replicados, `note-path:*` sólo del servidor, motivos nuevos, topes 16 MiB / 2 MiB / 64 KiB) y sección "Notas (SPEC-0008)" [doc]
  - CHECK: `grep -c "note-path-taken\|vault-not-found\|SPEC-0008\|16 MiB" backend/README.md`
  - EXPECT: ≥ 4.
- [x] T-083 — `backend/app/core/README.md`: `note_rules.py` [doc]
  - CHECK: `grep -c "note_rules" backend/app/core/README.md`
  - EXPECT: ≥ 1.
- [x] T-084 — `backend/app/services/README.md`: `reservations.py`, `note_service.py`, cambios de `sync_push`/`sync_filter` [doc]
  - CHECK: `grep -c "reservations\|note_service" backend/app/services/README.md`
  - EXPECT: ≥ 2.
- [x] T-085 — `backend/app/routers/README.md`: tope por ruta de `sync.py` [doc]
  - CHECK: `grep -c "16 MiB" backend/app/routers/README.md`
  - EXPECT: ≥ 1.
- [x] T-086 — `backend/tests/README.md`: `test_note*.py`, `test_reservations.py`, `note_rules_cases.json` [doc]
  - CHECK: `grep -c "test_note\|test_reservations\|note_rules_cases" backend/tests/README.md`
  - EXPECT: ≥ 3.
- [x] T-087 — `frontend/README.md`: dependencias del editor, `npm run test:perf`, `test:sync` incluye notas [doc]
  - CHECK: `grep -c "test:perf\|Milkdown\|CodeMirror" frontend/README.md`
  - EXPECT: ≥ 3.
- [x] T-088 — `frontend/src/README.md`: `notes/`, `editor/`, ruta `/vaults/:id`, riel, guardado explícito, reparto de `_bulk_docs`, reintento de `vault-not-found` [doc]
  - CHECK: `grep -c "notes/\|editor/\|/vaults/:id\|vault-not-found" frontend/src/README.md`
  - EXPECT: ≥ 4.
- [x] T-089 — Diagrama de la feature con Archify (dataflow "abrir bóveda → editar → réplica → push validado → reservas") en `.harness/specs/0008-vault-editor/diagrams/` + `README.md` [doc]
  - CHECK: `ls .harness/specs/0008-vault-editor/diagrams/`
  - EXPECT: `README.md` y los artefactos HTML/PNG del diagrama.
- [x] T-090 — Regenerar `0005-sync/diagrams/` (el canal replica `vault:*` y `note:*`) [doc]
  - CHECK: `grep -c "note:" .harness/specs/0005-sync/diagrams/README.md`
  - EXPECT: ≥ 1.
- [x] T-091 — `ARCHIFY.md`: entrada del diagrama de 0008 [doc]
  - CHECK: `grep -c "0008" ARCHIFY.md`
  - EXPECT: ≥ 1.
- [ ] T-092 — Notas de re-anclaje (sin cambio de requisitos) en `spec.md` de 0002, 0003, 0005 y 0007 y anclas movidas al commit de cierre (P-2) [doc]
  - CHECK: `bash .harness/gate/check.sh`
  - EXPECT: sin `DRIFT` en 0002/0003/0005/0007; compuerta abierta.
- [ ] T-093 — `.harness/memory/state.md`: estado de 0008 (tareas, números de suites, p95, tamaño del *chunk*) [doc]
  - CHECK: `grep -c "0008-vault-editor" .harness/memory/state.md`
  - EXPECT: ≥ 1.
- [ ] T-094 — Verificación manual en navegador con la app real (`docker compose up -d`, `http://localhost:8000`): crear bóveda → "Abrir" → crear nota (con título y sin título) → editar en Visual y en Código → Guardar → Leer → renombrar/mover a una carpeta → borrar → restaurar desde la papelera de la bóveda; comprobar además el riel y el 404 de un id inexistente; medir RNF-001 con 1 000 notas (panel Performance). Evidencia: capturas o salida pegada en `history.md` y en la verificación (cubre RF-001…RF-019, RNF-001) [zona: sistema]
  - CHECK: `docker compose up -d && curl -s -o /dev/null -w "%{http_code}\n" -H "Accept: text/html" http://localhost:8000/vaults/00000000-0000-4000-8000-000000000000`
  - EXPECT: `200` (la SPA sirve la ruta) y el recorrido completo hecho en el navegador sin errores en consola, con la evidencia anotada.

### J · Enmienda 1 (PLAN-0008 §10) — hallazgos RD-1…RD-3 y VF-1…VF-9
> Test rojo en commit propio antes de cada corrección (VF-7).
- [x] T-095 — Test (rojo) `vaultIsActive`: bóveda con ganadora en papelera y perdedora activa → activa; ambas en papelera → no (cubre RF-014, RF-009) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/sync/vaultActive.test.ts`
  - EXPECT: falla: módulo `./vaultActive` inexistente.
- [x] T-096 — `sync/vaultActive.ts` y su uso en `conflicts.ts` y `notes/repush.ts` (RD-1) (cubre RF-009, RF-014, RF-004) [zona: cliente]
  - CHECK: `cd frontend && npx vitest run src/sync src/notes`
  - EXPECT: todos `passed`; un test de `conflicts.test.ts` y otro de `repush.test.ts` con la bóveda en conflicto (perdedora activa) pasan.
- [x] T-097 — Test (rojo) `repush`: reintento al abrir con `vault-not-found` persistidos y bóveda activa; reintento al reconectar tras un fallo de red; espera `settled()` (RD-2, RD-3) (cubre RF-004, RF-014) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/repush.test.ts`
  - EXPECT: fallan los tres casos nuevos.
- [x] T-098 — `repush.ts`: disparadores de arranque y reconexión; fallo deja el reintento pendiente; `await settled()` (cubre RF-004, RF-014) [zona: cliente]
  - CHECK: `cd frontend && npx vitest run src/notes/repush.test.ts src/sync`
  - EXPECT: todos `passed`.
- [x] T-099 — Test (rojo) navegación con borrador sucio: clic en el riel o en "Bóvedas" muestra el diálogo; "Seguir editando" no navega; "Descartar y salir" navega; "Guardar y salir" guarda y navega (VF-1) (cubre RF-008) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/VaultWorkspacePage.test.tsx src/editor/NoteEditor.test.tsx`
  - EXPECT: fallan los casos nuevos (la navegación ocurre sin diálogo).
- [x] T-100 — `main.tsx` a `createBrowserRouter` con ruta raíz comodín + `RouterProvider`; `useBlocker(dirty)` en `NoteEditor` con el diálogo existente; tests con `useBlocker` sobre `createMemoryRouter` (VF-1) (cubre RF-008) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run && npm run typecheck`
  - EXPECT: todos `passed`; typecheck limpio.
- [x] T-101 — Test (rojo) borrar la nota abierta sucia pide confirmación y "Seguir editando" no borra (VF-2); renombrar la nota abierta sucia y guardar no crea conflicto y conserva el borrador (VF-3) (cubre RF-010, RF-011) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/VaultWorkspacePage.test.tsx src/editor/NoteEditor.test.tsx`
  - EXPECT: fallan los casos nuevos.
- [x] T-102 — Confirmación de borrado de la nota abierta sucia; rebase de `baseRev`/ruta cuando sólo cambió la metadata (VF-2, VF-3) (cubre RF-010, RF-011) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/notes src/editor`
  - EXPECT: todos `passed`; `conflicts.list()` vacío tras renombrar y guardar.
- [x] T-103 — Test (rojo) nota abierta sucia enviada a la papelera por sync: "Restaurar y guardar" la restaura con el borrador; con la ruta ocupada, mensaje y borrador intacto; al reaparecer la nota desaparece el aviso "no existe" (VF-4, VF-5) (cubre RF-017, RF-013) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/NoteEditor.test.tsx`
  - EXPECT: fallan los casos nuevos.
- [x] T-104 — "Restaurar y guardar" en `NoteEditor`; `setMissing(false)` en la rama de éxito (VF-4, VF-5) (cubre RF-017, RF-013) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor src/notes`
  - EXPECT: todos `passed`.
- [x] T-105 — Test (rojo) teclado del árbol: ↑/↓, →/←, Inicio/Fin y un solo `tabindex=0` (VF-9) (cubre RF-019) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/NoteSidebar.test.tsx`
  - EXPECT: fallan los casos nuevos.
- [x] T-106 — Teclado WAI-ARIA del árbol con *roving tabindex* en `NoteSidebar` (VF-9) (cubre RF-019) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/notes/NoteSidebar.test.tsx`
  - EXPECT: `passed`.
- [x] T-107 — VF-6 (aserción del `<a>` en `MilkdownView.test.tsx`) y VF-8 (token en `notes.css`) (cubre RF-007) [zona: test/estilo]
  - CHECK: `cd frontend && npx vitest run src/editor/MilkdownView.test.tsx && grep -c "#fff" src/notes/notes.css`
  - EXPECT: `passed`; `0`.
- [x] T-108 — Cierre de la enmienda: suite frontend completa, typecheck, build y gate (cubre RF-001…RF-019) [zona: sistema]
  - CHECK: `cd frontend && npm run test:cov && npm run typecheck && npm run build && cd .. && bash .harness/gate/check.sh`
  - EXPECT: 0 failed; cobertura ≥ 80 % por módulo; build ok; "Compuerta abierta".

### K · Enmienda 2 (PLAN-0008 §11) — hallazgos N-1…N-4
> Test rojo en commit propio antes de cada corrección.
- [x] T-109 — Test (rojo) N-1/N-2: con borrador sucio, "Cerrar sesión" muestra el aviso de cambios sin guardar en el `LogoutDialog` **antes** de cerrar la sesión (cancelar no cierra nada; "salir igualmente" cierra y navega a `/login` sin diálogo del editor); una redirección a `/login` (401) no es bloqueada; una navegación a la misma ruta no es bloqueada (cubre RF-008) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/sync/LogoutDialog.test.tsx src/editor`
  - EXPECT: fallan los casos nuevos.
- [x] T-110 — `unsavedDrafts` en el proveedor de sync + registro desde `NoteEditor`; `LogoutDialog` lo consulta; `useBlocker` con función (cambio de `pathname` y destino ≠ `/login`) (cubre RF-008) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run`
  - EXPECT: todos `passed`.
- [x] T-111 — Test (rojo) N-3: `conflicts.test.ts` y `repush.test.ts` con la bóveda en conflicto (ganadora en papelera, perdedora activa); comprobar que fallan si se sustituye `vaultIsActive` por `db.get` (cubre RF-009, RF-014, RF-004) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/sync/conflicts.test.ts src/notes/repush.test.ts`
  - EXPECT: `passed` con el código actual; la prueba de mutación (sustitución temporal, no commiteada) los hace fallar — pegar ambas salidas.
- [x] T-112 — N-4: `repush.enqueueAll` obtiene el `vault_id` con el parser único de ids de nota (cubre RF-004) [zona: cliente]
  - CHECK: `cd frontend && npx vitest run src/notes`
  - EXPECT: todos `passed`.
- [x] T-113 — Cierre de la enmienda 2: `npm run test:cov`, typecheck, build y gate (cubre RF-001…RF-019) [zona: sistema]
  - CHECK: `cd frontend && npm run test:cov && npm run typecheck && npm run build && cd .. && bash .harness/gate/check.sh`
  - EXPECT: 0 failed; ≥ 80 % por módulo (incluido `vaultActive.ts`); build ok; "Compuerta abierta".

### L · Enmienda 3 (PLAN-0008 §12) — hallazgos VB-1…VB-3
> Test rojo en commit propio antes de cada corrección.
- [ ] T-114 — Test (rojo) VB-1: casos `NaN`, `Infinity`, `-Infinity`, `1e999` (anidados también) en `note_rules_cases.json` + `test_note_rules.py` + `noteRules.test.ts`; test de API: push con esos `frontmatter` → rechazo `validation-error:frontmatter`, nunca 500 (cubre RF-005) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q -p no:cacheprovider tests/test_note_rules.py tests/test_note_sync_api.py -k "frontmatter" ; cd ../frontend && npx vitest run src/notes/noteRules.test.ts`
  - EXPECT: fallan los casos nuevos (aceptados por la regla; 500 en la API).
- [ ] T-115 — `check_frontmatter` y `noteRules.ts` rechazan no finitos (cubre RF-005) [zona: núcleo]
  - CHECK: mismo de T-114
  - EXPECT: `passed`.
- [ ] T-116 — Test (rojo) VB-2: `POST /sync/db/_bulk_docs` sin sesión con cuerpo grande → 401 sin leer el cuerpo (p. ej. cuerpo en *stream* que falla si se consume) (cubre RF-006) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q -p no:cacheprovider tests/test_note_sync_api.py -k "unauth or sin_sesion"`
  - EXPECT: falla (el cuerpo se lee antes del 401).
- [ ] T-117 — `routers/sync.py`: sesión antes de leer el cuerpo (cubre RF-006) [zona: ruta]
  - CHECK: `cd backend && python3 -m pytest -q -p no:cacheprovider tests/test_note_sync_api.py tests/test_sync_api.py`
  - EXPECT: `passed`.
- [ ] T-118 — Test (rojo) y corrección VB-3: anidamiento extremo → misma respuesta declarada que un JSON inválido (cubre RF-005) [zona: ruta]
  - CHECK: `cd backend && python3 -m pytest -q -p no:cacheprovider tests/test_note_sync_api.py tests/test_sync_api.py tests/test_contract.py`
  - EXPECT: `passed`; sin respuesta no declarada (`ContractGuard`).
- [ ] T-119 — Cierre de la enmienda 3: suite backend completa (sola, sin otras suites contra el CouchDB de pruebas), vitest y gate (cubre RF-004…RF-006, RF-016) [zona: sistema]
  - CHECK: `cd backend && timeout 1500 python3 -m pytest -q -p no:cacheprovider --cov=app ; cd ../frontend && npx vitest run ; cd .. && bash .harness/gate/check.sh`
  - EXPECT: 0 failed; "Compuerta abierta".

## Cobertura (el gate exige 100 %; `Estado` lo rellena el gate)
| RF / doc | Tareas | Test(s) | Estado |
|---|---|---|---|
| RF-001 | T-030, T-031, T-046, T-047, T-057, T-058, T-063…T-066, T-094 | noteTree.test, resources.test, VaultRail.test, VaultWorkspacePage.test, App.test, AppLayout.test | Pendiente |
| RF-002 | T-063, T-064, T-094 | VaultWorkspacePage.test | Pendiente |
| RF-003 | T-034, T-035, T-059, T-060, T-075, T-094 | noteStore.test, NoteSidebar.test, notes.integration | Pendiente |
| RF-004 | T-002, T-015, T-016, T-019…T-022, T-044, T-045, T-071, T-072, T-076, T-079 | test_note_sync_push, test_note_sync_api, test_note_sync_isolation, test_contract, repush.test, RejectionsPage.test, notes.integration | Pendiente |
| RF-005 | T-001, T-003…T-005, T-013, T-014, T-026, T-027 | test_note_contract, test_note_rules, test_note_sync_push, noteRules.test | Pendiente |
| RF-006 | T-011, T-012, T-019…T-021, T-079 | test_note_sync_filter, test_note_sync_api, test_note_sync_isolation | Pendiente |
| RF-007 | T-025, T-048, T-049, T-052…T-055, T-094 | safeUrl.test, MilkdownView.test, NoteEditor.test | Pendiente |
| RF-008 | T-024, T-025, T-050…T-056, T-094 | CodeView.test, MilkdownView.test, NoteEditor.test | Pendiente |
| RF-009 | T-032, T-033, T-038…T-041, T-069, T-070, T-075 | mergeNote.test, noteStore.test, conflicts.test, NoteConflictCard.test, ConflictView.test, notes.integration | Pendiente |
| RF-010 | T-017, T-018, T-036, T-037, T-059…T-062, T-077, T-094 | test_note_sync_push, noteStore.test, NoteSidebar.test, NoteTrash.test, notes.integration | Pendiente |
| RF-011 | T-006, T-007, T-009, T-010, T-017, T-018, T-036, T-037, T-059, T-060, T-077, T-094 | test_reservations, test_note_service, test_note_sync_push, noteStore.test, NoteSidebar.test, notes.integration | Pendiente |
| RF-012 | T-028, T-029, T-034, T-035, T-059, T-060, T-094 | untitled.test, noteStore.test, NoteSidebar.test | Pendiente |
| RF-013 | T-002…T-010, T-017, T-018, T-022, T-026, T-027, T-034, T-035, T-059, T-060, T-071, T-072, T-075 | test_note_rules, test_reservations, test_note_service, test_note_sync_push, test_contract, noteRules.test, noteStore.test, RejectionsPage.test, notes.integration | Pendiente |
| RF-014 | T-015, T-016, T-040, T-041, T-044, T-045, T-063, T-064, T-071, T-072, T-076 | test_note_sync_push, conflicts.test, repush.test, VaultWorkspacePage.test, RejectionsPage.test, notes.integration | Pendiente |
| RF-015 | T-063, T-064, T-094 | VaultWorkspacePage.test | Pendiente |
| RF-016 | T-003…T-005, T-013, T-014, T-019, T-020, T-026, T-027, T-036, T-037, T-042, T-043, T-054, T-055, T-077 | test_note_rules, test_note_sync_push, test_note_sync_api, noteRules.test, noteStore.test, remote.test, NoteEditor.test, notes.integration | Pendiente |
| RF-017 | T-009, T-010, T-017, T-018, T-036, T-037, T-061, T-062, T-077, T-094 | test_note_service, test_note_sync_push, noteStore.test, NoteTrash.test, notes.integration | Pendiente |
| RF-018 | T-067, T-068, T-094 | VaultListPage.test | Pendiente |
| RF-019 | T-030, T-031, T-046, T-047, T-059, T-060, T-063, T-064, T-094 | noteTree.test, NoteSidebar.test, VaultWorkspacePage.test | Pendiente |
| RNF-001 | T-074, T-078, T-094 | tree.perf.test | Pendiente |
| doc: contracts/note.schema.json | T-080 | test_note_contract | Pendiente |
| doc: 0005-sync/contracts/openapi.yaml | T-022, T-081 | test_contract | Pendiente |
| doc: backend/README.md | T-082 | — | Pendiente |
| doc: backend/app/core/README.md | T-083 | — | Pendiente |
| doc: backend/app/services/README.md | T-084 | — | Pendiente |
| doc: backend/app/routers/README.md | T-085 | — | Pendiente |
| doc: backend/tests/README.md | T-086 | — | Pendiente |
| doc: frontend/README.md | T-087 | — | Pendiente |
| doc: frontend/src/README.md | T-088 | — | Pendiente |
| doc: 0008-vault-editor/diagrams | T-089 | — | Pendiente |
| doc: 0005-sync/diagrams | T-090 | — | Pendiente |
| doc: ARCHIFY.md | T-091 | — | Pendiente |
| doc: re-anclaje 0002/0003/0005/0007 | T-092 | gate | Pendiente |
| doc: state.md | T-093 | — | Pendiente |

> Esta tabla **es** la trazabilidad de la feature (no hay `traceability-matrix.md`).
> Fila sin test, en `Fail` o `Pendiente` → el gate no abre cuando la spec pase a `implemented`.
