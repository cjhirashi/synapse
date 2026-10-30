---
id: H-004
titulo: CRUD de notas vía REST para agentes OpenClaw (sin protocolo CouchDB del lado del cliente)
estado: implemented  # Gate 1 pasado ("así es", Carlos 2026-10-29): id-only y sin filtro de carpeta confirmados. H-004.1 (lectura) y H-004.2 (escritura) implemented, 1464 passed. Pendiente checkpoint demostrable (curl real) para verified.
covers:
  - backend/app/routers/notes.py                 # nuevo (H-004.1: GET, hecho; H-004.2: POST/PATCH/DELETE/restore, hecho)
  - backend/app/services/note_content_service.py # nuevo (H-004.1: get/list, hecho; H-004.2: create/update/delete/restore, hecho)
  - backend/app/services/note_service.py         # reutilizado reserve_path/release_path, sin reescribir (H-004.2, hecho)
  - backend/app/core/note_rules.py               # reutilizado check_path/check_content/check_frontmatter, sin reescribir (H-004.2, hecho)
  - backend/app/core/ports/vault_port.py          # + list_notes (H-004.1, hecho)
  - backend/app/adapters/vault_repository.py      # + list_notes (H-004.1, hecho)
  - backend/app/core/schemas.py                   # + NoteOut/NoteListItem/NotePage (H-004.1, hecho); + NoteCreate/NoteUpdate (H-004.2, hecho)
  - backend/app/core/errors.py                    # + NoteNotFound (H-004.1, hecho); + NotePathTaken (H-004.2, hecho)
  - backend/app/main.py                           # registra notes_router (H-004.1, hecho)
  - backend/tests/test_notes_router.py            # nuevo (H-004.1, hecho; H-004.2 amplia, hecho)
  - backend/tests/test_note_content_service.py    # nuevo (H-004.1, hecho; H-004.2 amplia, hecho)
  - docs/API.md
anchor_commit: a2ef69c
origen: backlog
---

# H-004 — CRUD de notas vía REST para agentes OpenClaw

## 0. Por qué existe esta historia (diagnóstico de P-1)

PLAN-0008 §7 (2026-10-22) decidió **P-1: sin `routers/notes.py`** porque
en ese momento "ningún RF lo pide" y una segunda vía de escritura
"duplicaría validación y reservas" frente al push de `/sync`. Es una
decisión de **alcance (YAGNI)**, no de integridad: la nota de PLAN-0008
dice textualmente *"los agentes OpenClaw no acceden a las notas por API
hasta una spec propia"* — anticipaba exactamente esta historia, no la
prohibía.

Verificado contra el código antes de proponer esto (no se asume):

- `core/note_rules.py` (`check_path`, `check_content`, `check_frontmatter`,
  `normalize_path`, `path_key`) son funciones puras ya compartidas entre
  el push (`services/sync_push.py`) y el espejo del cliente — no hay nada
  que reimplementar, solo importarlas.
- `services/note_service.py` ya expone `reserve_path`/`release_path` con
  el mismo mecanismo de `reservations.py` que usan las bóvedas, y ya
  considera "todas las hojas vivas" (`_holder`) — el caso de conflicto
  multi-hoja que justificó P-1 de PLAN-0005 ya está resuelto ahí, reusable
  tal cual.
- `core/ports/vault_port.py` (`get`/`put`/`delete`/`leaves`) es genérico
  por documento, no específico de bóvedas: `NoteService` ya lo usa para
  notas. Falta solo un método de listado (`list_notes`, análogo a
  `list_page` pero filtrado por `vault_id`+`type:"note"`).
- El precedente de riesgo ya está en producción: `routers/vaults.py` (REST,
  escribe directo vía `VaultPort.put` con ETag=`_rev`) coexiste con el push
  de `/sync` (misma base CouchDB, mismos documentos) desde SPEC-0003/0005.
  H-002 (2026-10-28, `1293 passed`, desplegado) ya añadió autenticación por
  agent-key a ese mismo router. Esta historia es la **misma arquitectura
  ya aprobada y corriendo**, aplicada a notas en vez de bóvedas — no
  introduce una clase de riesgo nueva.

**Conclusión:** no hay razón de integridad en P-1 que bloquee esto. La
simplificación que pide el caso de uso (el agente nunca maneja `_rev` de
CouchDB, solo un `ETag`/`If-Match` opaco) es exactamente el patrón que
`routers/vaults.py` ya usa — no es una simplificación nueva ni insegura,
es el patrón vigente.

**Riesgo real a vigilar (no bloqueante, documentar en RNF):** si en el
futuro un segundo escritor (la UI web con PouchDB) edita la misma nota que
un agente está escribiendo por REST, CouchDB genera un conflicto de rama
(`_conflicts`) — igual que hoy puede pasar entre dos pestañas de la UI. El
caso de uso que motiva esta historia (un agente gestiona su propia bóveda
dedicada, sin otro cliente escribiendo esa nota en paralelo) no lo
dispara; si en el futuro se comparte una bóveda entre agente y UI humana
activa a la vez, re-evaluar.

## 1. Intención (lenguaje de usuario)

Carlos aprobó migrar las bóvedas personales de los agentes OpenClaw
(Drive-mirror → Synapse). El plugin que un agente OpenClaw usa para
gestionar su propia bóveda necesita listar, leer, crear/actualizar y
borrar notas sin implementar el protocolo de replicación CouchDB completo
(`_bulk_docs`, `_revs_diff`, `_bulk_get`, `_changes`, checkpoints `_local`)
del lado del cliente — solo bóvedas tienen hoy esa vía simple (REST), notas
no.

## 2. Alcance / fuera de alcance

**Dentro:**
- Listar notas de una bóveda (metadata: id, path, created_at, updated_at,
  deleted_at — sin contenido, igual de ligero que el listado de bóvedas).
- Leer una nota por id (contenido + frontmatter completos).
- Crear una nota (path + frontmatter? + content).
- Actualizar una nota existente (path/frontmatter/content, con
  `If-Match` obligatorio — mismo contrato que `PATCH /vaults/{id}`).
- Borrar (soft-delete a papelera) y restaurar, igual que bóvedas
  (`DELETE`/`GET .../restore`).
- Autenticación: la misma dependencia (`get_current_principal`) que
  `vaults.py`/`sync.py` ya usan — agent-keys de H-002 funcionan aquí sin
  cambios, no se toca `agent_key_service.py`.

**Fuera de alcance:**
- Cualquier cambio al protocolo `/sync` o a la UI web (sigue en PouchDB,
  sin tocar).
- Búsqueda de texto completo, versionado/historial expuesto por API,
  adjuntos.
- La tool/plugin de OpenClaw que consume este API (la construye `main`,
  fuera de este repo, una vez el contrato esté `verified`).

## 3. Split propuesto (tamaño de sesión, método §2)

Mirando el tamaño de `routers/vaults.py` + `vault_service.py` (lo que esta
historia clona en ~70%, reusando validación/reservas ya existentes) contra
"completable en una sesión": se propone partir en 2, mismo criterio que
H-002:

- **H-004.1 — Lectura (list_notes + read_note).** Es lo mínimo para que
  AIRA pueda hacer la verificación por conteo de notas del plan de
  migración sin esperar la mitad de escritura.
- **H-004.2 — Escritura (create/update/delete_note + restore).** Depende
  de H-004.1 (reusa el router y los esquemas).

## 4. Criterios de aceptación (EARS booleano) — propuesta, `[NEEDS CLARIFICATION]` abajo

- **C-1:** CUANDO se llama `GET /vaults/{vault_id}/notes` con una
  credencial válida (cookie o agent-key) propietaria de `vault_id`, el
  sistema DEBE devolver la página de notas vivas (o borradas si
  `deleted=true`) sin su `content`/`frontmatter`, paginada igual que
  `GET /vaults` (cursor, `limit`).
- **C-2:** CUANDO se llama `GET /vaults/{vault_id}/notes/{note_id}`, el
  sistema DEBE devolver `path`, `frontmatter`, `content` y un header
  `ETag` (el `_rev` entre comillas, igual que bóvedas) — el agente nunca
  ve ni envía `_rev` crudo.
- **C-3:** SI `note_id` no existe o no pertenece a `vault_id`, ENTONCES
  404 `NoteNotFound` (mismo Problem Details que `VaultNotFound`).
- **C-4:** CUANDO se llama `POST /vaults/{vault_id}/notes` con
  `{path, content, frontmatter?}` válidos, el sistema DEBE crear la nota,
  reservar `path` vía `NoteService.reserve_path` (reuso, sin reescribir) y
  devolver 201 + `ETag`.
- **C-5:** SI `path`/`content`/`frontmatter` no pasan
  `note_rules.check_*` (reuso exacto, misma función que usa el push), 
  ENTONCES 422 con el mismo código (`validation-error:<campo>`,
  `not-normalized:path`) que ya usa el push — un solo vocabulario de
  error en los dos canales.
- **C-6:** SI `path` ya está reservado por otra nota viva de la bóveda,
  ENTONCES 409 (`NotePathTaken`, ya existe como excepción en
  `note_service.py` — solo falta mapearla a Problem Details).
- **C-7:** CUANDO se llama `PATCH /vaults/{vault_id}/notes/{note_id}` sin
  header `If-Match`, el sistema DEBE responder 428
  (`PreconditionRequired`, mismo contrato que `PATCH /vaults/{id}`).
- **C-8:** CUANDO `If-Match` no coincide con el `ETag` vigente, 412
  (`PreconditionFailed`); si cambia `path`, se libera la reserva vieja y
  se reserva la nueva (reuso de `reserve_path`/`release_path`).
- **C-9:** CUANDO se llama `DELETE /vaults/{vault_id}/notes/{note_id}` con
  `If-Match` válido, el sistema DEBE marcar `deleted_at` (soft-delete,
  nunca borra el documento, igual que bóvedas) y liberar la reserva de
  `path`.
- **C-10:** Un escritor que llega por REST y otro que llega por `/sync`
  (replicación) escriben el mismo tipo de documento con el mismo mecanismo
  de `_rev`/conflicto de CouchDB — ningún atajo nuevo, ninguna validación
  que el push no comparta.

**Resuelto en Gate 1 (Carlos, 2026-10-29):**
1. Lectura sólo por `id`, nunca por `path` — propuesta YAGNI confirmada
   tal cual. Implementado así en H-004.1.
2. Listado siempre paginado completo de la bóveda, sin filtro de carpeta/
   prefijo — propuesta YAGNI confirmada tal cual. Implementado así en
   H-004.1.

## 5. Casos límite y errores

- Bóveda borrada (`deleted_at` en el vault): las notas de una bóveda en
  papelera siguen siendo accesibles por `GET`/`DELETE`, igual que hoy con
  `VaultService` (no se bloquea leer una bóveda borrada).
- `content` hasta 2 MiB UTF-8, `frontmatter` hasta 64 KiB / 32 niveles —
  mismos límites que el push (`note_rules.py`), sin excepción para REST.
- Respuesta 503 `StorageUnavailable` si CouchDB no responde — mismo patrón
  que `vaults.py`.

## 6. Descartes

Ninguno — Carlos aprobó la propuesta tal cual ("así es", 2026-10-29): los
dos puntos de §4 quedaron confirmados sin ajuste, y la prioridad de
H-004.1 pasó a máxima (por encima del backlog de Synapse en curso).

## 7. Plan (de ESTA historia solamente)

- **Componentes:**
  - `core/ports/vault_port.py` + `adapters/vault_repository.py`: nuevo
    método `list_notes(db, vault_id, deleted, limit, after)`, clon de
    `list_page` filtrado por `type:"note"` + `vault_id` (mismo orden de
    cursor: `created_at` desc, `_id` desc).
  - `services/note_content_service.py` (nuevo, ~misma forma que
    `vault_service.py`): `get`, `list`, `create`, `update`, `delete`,
    `restore`. Internamente: valida con `note_rules.check_*`, reserva/
    libera con `NoteService.reserve_path`/`release_path` (instancia
    existente, sin tocar su código), lee/escribe con `VaultPort.get/put/
    delete/leaves`. `Versioned`/ETag igual patrón que `vault_service.py`.
  - `routers/notes.py` (nuevo): mismo esqueleto que `routers/vaults.py`
    (`dependencies=[require_password_changed]`, `get_current_principal`,
    `problem_responses`), prefijo `/vaults/{vault_id}/notes`.
  - `core/schemas.py`: `NoteCreate`, `NoteUpdate`, `NoteOut`,
    `NoteListItem`, `NotePage` — mismo patrón que los de `Vault*`.
  - `core/errors.py`: `NoteNotFound`; mapear `NotePathTaken` (ya existe en
    `note_service.py`) a Problem Details 409.
  - `main.py`: `app.include_router(notes_router)`.
- **Contrato:** feature propia `0014-acceso-agentes-notas` en
  `scripts/export_openapi.py` (dueño de `/vaults/{vault_id}/notes`, mismo
  mecanismo de prefijo-más-específico que separó `/auth/agent-keys` de
  `/auth` en 0013) → `.harness/specs/0014-acceso-agentes-notas/contracts/
  openapi.yaml`, autocontenido, sin tocar los contratos existentes.
- **Estrategia de prueba:**
  - `test_note_content_service.py`: TDD sobre el servicio, reusando
    `tests/fixtures/note_rules_cases.json` (la misma batería que ya
    prueba el push) para probar que el rechazo es idéntico por los dos
    canales — esto es lo que cierra, con una prueba y no solo con
    disciplina, el riesgo que P-1 señaló ("duplicaría validación").
  - `test_notes_router.py`: HTTP end-to-end (201/200/404/409/412/428/503),
    cookie y agent-key (reusa fixtures de `test_agent_api_key*.py`).
  - Regresión completa del backend (pytest completo, como en H-002:
    "1293 passed" era la línea base antes de esta historia).
- **Pasos TDD ordenados (H-004.1 — lectura):**
  1. `CHECK:` `list_notes` del puerto/adaptador rojo (fixture CouchDB) /
     `EXPECT:` verde.
  2. `CHECK:` `note_content_service.get`/`.list` rojo / `EXPECT:` verde.
  3. `CHECK:` `routers/notes.py` `GET` (list + get-by-id, 404, cookie y
     agent-key) rojo / `EXPECT:` verde.
  4. `docs/API.md` + `contracts/openapi.yaml`, regresión completa.
- **Pasos TDD ordenados (H-004.2 — escritura, tras H-004.1 `verified`):**
  5. `CHECK:` `note_content_service.create`/`.update`/`.delete`/`.restore`
     rojo (incluye reserva/liberación de `path`, 409/412/428) /
     `EXPECT:` verde.
  6. `CHECK:` `routers/notes.py` `POST`/`PATCH`/`DELETE`/`restore` rojo /
     `EXPECT:` verde.
  7. Prueba cruzada con `tests/fixtures/note_rules_cases.json` (mismo
     rechazo que el push). Regresión completa.
  8. `docs/API.md` + `contracts/openapi.yaml`, cierre.
- **Impacto en documentación (Art. 11):** `docs/API.md` (nueva sección
  "Notas"), `contracts/openapi.yaml`.

## 8. Estimación de esfuerzo

Referencia: H-002 (vaults/sync Bearer + gestión de keys, 4 sub-historias,
construcción nueva de tabla/servicio/router) tomó una sesión headless
completa (~7 commits, bloques A→H). Esta historia reusa validación y
reservas ya existentes (nada nuevo en `note_rules.py`/`reservations.py`) y
clona un router/servicio que ya existe como plantilla (`vaults.py`/
`vault_service.py`) — es más chica que H-002 completa.

- **H-004.1 (lectura):** ~1 sesión corta (half del tamaño de H-002.2, sin
  tabla nueva ni modelo nuevo — solo un método de puerto + servicio +
  2 rutas GET).
- **H-004.2 (escritura):** ~1 sesión (comparable a construir
  `routers/vaults.py` original, pero sin la parte de reservas — ya está
  hecha en `note_service.py`).

No requiere nueva migración de base de datos (las notas ya son
documentos CouchDB existentes desde SPEC-0008; no hay tabla Postgres
nueva como la de `agent_api_keys` en H-002).

## 9. Checkpoint demostrable (propuesto)

- H-004.1: `curl -H "Authorization: Bearer <key>" https://synapse.cjhirashi.com/vaults/{id}/notes` 
  devuelve las notas reales de una bóveda de prueba; `GET .../notes/{note_id}` 
  devuelve su contenido.
- H-004.2: el mismo `curl` crea una nota, la actualiza con `If-Match`, la
  borra, y Carlos la ve aparecer/cambiar/desaparecer en la UI web
  (PouchDB) sin refrescar el protocolo de sync a mano — prueba de que
  REST y replicación conviven sobre el mismo documento.

## 10. Tabla de cobertura (H-004.1)

Estado: `Green` = test ejecutado y en verde (suite completa del backend 2026-10-29:
**1342 passed, 0 fallos**, 1 deselected = marcador `perf` ya excluido por defecto).

| Criterio | Paso(s) | Test | Estado |
|---|---|---|---|
| C-1 (listado) | 1, 2, 3 | `test_vault_repository.py` (list_notes), `test_note_content_service.py` (list), `test_notes_router.py` (C-1) | Green |
| C-2 (lectura por id) | 2, 3 | `test_note_content_service.py` (get), `test_notes_router.py` (C-2) | Green |
| C-3 (404 nota) | 2, 3 | `test_note_content_service.py` (NoteNotFound), `test_notes_router.py` (C-3) | Green |
| §5 bóveda borrada no bloquea lectura | 2, 3 | `test_note_content_service.py`, `test_notes_router.py` | Green |
| §5 503 StorageUnavailable | 1, 3 | `test_vault_repository.py` (_CALLS), `test_notes_router.py` | Green |
| Auth: cookie y agent-key resuelven lo mismo | 3 | `test_notes_router.py` (bearer/revoked) | Green |
| Cursor ligado a bóveda+lista (422 si no) | 2 | `test_note_content_service.py` (decode_cursor) | Green |

C-4…C-10 (escritura): ver tabla de H-004.2 en §13.1.

## 13.1 Tabla de cobertura (H-004.2)

Estado: `Green` = test ejecutado y en verde (suite completa del backend 2026-10-29, tras
H-004.2: **1464 passed, 0 fallos**, 1 deselected = marcador `perf`).

| Criterio | Paso(s) | Test | Estado |
|---|---|---|---|
| C-4 (POST crea + reserva + 201/ETag) | 5, 6 | `test_note_content_service.py` (create), `test_notes_router.py` (C-4) | Green |
| C-5 (422 con el mismo código que el push) | 5, 6, 7 | `test_note_content_service.py` (rejects_path/content/frontmatter_exactly_like_the_push, bateria cruzada), `test_notes_router.py` (C-5) | Green |
| C-6 (409 NotePathTaken) | 5, 6 | `test_note_content_service.py`, `test_notes_router.py` (C-6) | Green |
| C-7 (428 sin If-Match en PATCH) | 5, 6 | `test_note_content_service.py`, `test_notes_router.py` (C-7) | Green |
| C-8 (412 con If-Match vencido; libera/reserva path al renombrar) | 5, 6 | `test_note_content_service.py`, `test_notes_router.py` (C-8) | Green |
| C-9 (DELETE soft-delete + libera path) | 5, 6 | `test_note_content_service.py`, `test_notes_router.py` (C-9) | Green |
| C-10 (mismo documento, mismo mecanismo _rev; sin atajos nuevos) | 5, 7 | prueba cruzada con `tests/fixtures/note_rules_cases.json`; bóveda activa exigida igual que `sync_push.py` | Green |
| Auth: cookie y agent-key escriben igual (SPEC-0013) | 6 | `test_notes_router.py` (bearer_key_can_write/revoked_key_cannot_write) | Green |
| §5 503 StorageUnavailable en escritura | 6 | `test_notes_router.py` (write_endpoints_are_503) | Green |

## 11. Checkpoint demostrable — resultado

`GET https://synapse.cjhirashi.com/openapi.json` (en vivo, 2026-10-29) declara
`GET /vaults/{vault_id}/notes` y `GET /vaults/{vault_id}/notes/{note_id}`, ambas con
`operationId` propio. Desplegado (`docker compose build backend && up -d backend`,
contenedor `synapse-backend` sano). Pendiente: que Carlos (o `main`, vía agent-key) haga
el `curl` real contra una bóveda con notas migradas para pasar de `implemented` a
`verified` — no bloquea que `main` empiece a integrar el endpoint ya.

## 12. Session-End (2026-10-29, subagente de AIRA)

- **Claim:** H-004.1 (lectura) implementada, probada y **desplegada** en
  `synapse.cjhirashi.com`. `estado: en-curso` a nivel de H-004 (falta H-004.2); H-004.1 en
  sí queda `implemented`, pendiente sólo el checkpoint manual de Carlos/`main` para
  `verified`.
- **Evidencia (ejecutada):**
  - Paso 1 — `list_notes` en `VaultPort`/`VaultRepository` (+ ajuste obligado de los dos
    dobles de `VaultPort` en tests: `InMemoryVaultPort`, `InMemoryCouch`). Commit `f364268`.
  - Paso 2 — `NoteContentService` (get/list) + `NoteOut`/`NoteListItem`/`NotePage` +
    `NoteNotFound`; 22 tests nuevos sin CouchDB. Commit `af1c71b`.
  - Paso 3 — `routers/notes.py` (GET lista + GET por id) + `main.py`; 18 tests end-to-end
    (TestClient + CouchDB real). Commit `2aa8fef`.
  - Paso 4 — contrato OpenAPI propio (`0014-acceso-agentes-notas`) + `docs/API.md`.
    Commit `4c7ff0e`.
  - Regresión completa del backend: **1342 passed, 0 fallos** (línea base previa: 1293;
    la diferencia son los tests nuevos de esta historia más los que ya existían en el
    repo desde H-002/H-003 entre medias).
  - Despliegue: `docker compose build backend && docker compose up -d backend`; contenedor
    sano (`/health` → `200`); `/openapi.json` verificado igual en local (`:8000`) y en
    `https://synapse.cjhirashi.com` (dominio público, Caddy/cjhirashi-srv).
- **Gaps:** ninguno de código para el alcance de H-004.1. Falta el checkpoint
  *demostrable* (curl real de Carlos/`main` contra una bóveda con notas reales) antes de
  `verified` — no bloquea el uso del endpoint.
- **Próximo paso:** H-004.2 (escritura: create/update/delete/restore + reservas de
  `path` + `tests/fixtures/note_rules_cases.json` cruzado) — toma esta misma historia,
  pasos TDD 5→8 de §7.

## 13. Session-End (2026-10-29, continuación de H-004.2)

- **Claim:** H-004.2 (escritura) implementada y probada. `estado: implemented` a nivel de
  H-004 completo (lectura + escritura); pendiente sólo el checkpoint demostrable (curl real
  de Carlos/`main`) para `verified`, igual que quedó H-004.1. No se despliega en esta sesión
  (fuera de alcance del encargo: Docker/docker-compose los toca otro proceso).
- **Evidencia (ejecutada):**
  - Paso 5 — `NoteContentService.create`/`.update`/`.delete`/`.restore` + `NoteCreate`/
    `NoteUpdate` en `core/schemas.py` + `NotePathTaken` en `core/errors.py` (409, mapea la
    excepción interna ya existente de `note_service.py`). Reutiliza sin reescribir
    `core/note_rules.py` (`check_path`/`check_content`/`check_frontmatter`) y
    `services/note_service.py` (`reserve_path`/`release_path`). Exige la bóveda **activa**
    (no sólo existente) para escribir, igual que `sync_push.py::_check_vault_is_active` — una
    bóveda borrada congela también la escritura de sus notas por REST (C-10). `frontmatter`
    ausente o `null` explícito escriben siempre el documento sin la clave (nunca
    `frontmatter: null`), porque el push distingue clave presente de ausente y rechazaría esa
    forma. Commit `ccbe849`.
  - Paso 6 — `POST`/`PATCH`/`DELETE`/`restore` en `routers/notes.py`, mismo esqueleto que las
    rutas GET y que `routers/vaults.py` para el patrón de escritura condicionada por
    `If-Match`. Sin tocar `core/dependencies.py`: agent-keys de H-002/SPEC-0013 funcionan sin
    cambios. Commit `160e8d1`.
  - Paso 7 — 74 tests nuevos en `test_note_content_service.py` (118 en total: create/update/
    delete/restore, reserva/liberación de `path`, 409/412/428, `frontmatter` ausente vs.
    `null`) y 44 tests end-to-end nuevos en `test_notes_router.py` (TestClient + CouchDB
    real: 201/200/204/404/409/412/422/428/503, cookie y agent-key). Prueba cruzada (C-5/C-10):
    recorre la misma batería `tests/fixtures/note_rules_cases.json` que ya prueba el push
    directo contra `core/note_rules.py`, ahora también contra `NoteContentService.create` —
    cierra con una prueba, no sólo con disciplina, el riesgo que PLAN-0008 P-1 señalaba
    (duplicar validación entre los dos canales). Commit `b16bcae`.
  - Paso 8 — `docs/API.md` (sección "Notas de una bóveda" ampliada con los 4 endpoints de
    escritura) y contrato OpenAPI propio re-exportado (`python scripts/export_openapi.py`,
    mismo mecanismo que usó AIRA en H-004.1); además `backend/README.md` ganó una sección
    "Notas vía REST" nueva (antes sólo describía H-004.1 de forma dispersa) y corrigió la
    afirmación obsoleta "No tiene API REST" de la sección "Notas (SPEC-0008)". Commit
    `a2ef69c`.
  - Regresión completa del backend: **1464 passed, 1 deselected (marca `perf`), 0 fallos**
    (línea base previa de H-004.1: 1342 passed; la diferencia son los 122 tests nuevos de
    esta sesión).
- **Desviación del plan:** ninguna en el código o los patrones citados en la historia — todo
  lo descrito en §7 (reuso de `note_rules.py`/`note_service.py`, patrón de `vaults.py`) existía
  tal cual y se pudo clonar sin adaptar. La única desviación fue de **entorno de prueba**, no
  de código: la primera corrida completa de esta sesión se invocó con `ADMIN_EMAIL`/
  `ADMIN_PASSWORD`/`JWT_SECRET` explícitos en la línea de comandos, que sobreescribieron los
  valores que `tests/conftest.py` ya fija con `os.environ.setdefault()` (`cjhirashi@gmail.com`/
  `admin1234`) — eso rompió el login de **toda** la suite (32 failed, 224 errors) sin relación
  con el código de esta historia. Corregido invocando `pytest` sin variables de entorno
  adicionales (sólo requiere el CouchDB de pruebas en `localhost:15984`, ya levantado). También
  fue necesario compilar el frontend (`cd frontend && npm ci && npm run build`) porque
  `frontend/dist` no existía en este worktree nuevo y `tests/test_spa.py` lo requiere para
  poder colectarse — no es un cambio de código, es un artefacto de build local (gitignorado).
- **Gaps:** ninguno de código para el alcance de H-004.2. Falta el checkpoint *demostrable*
  (Carlos o `main`, vía agent-key: crear una nota, actualizarla con `If-Match`, borrarla, y
  verla aparecer/cambiar/desaparecer en la UI web sin refrescar el sync a mano, §9) antes de
  `verified` — no bloquea que `main` empiece a integrar los endpoints de escritura ya. No se
  desplegó (fuera del encargo de esta sesión).

## 14. Hallazgo durante checkpoint demostrable (2026-10-29, subagente de AIRA)

Verificación real contra `synapse.cjhirashi.com` con el plugin `synapse_vault`:
`list`/`get`/`create`/`update` de notas probados con datos reales, round-trip completo —
sin hallazgos. `delete`/`restore` de notas expusieron un hallazgo **no crítico, no
bloqueante** (`_check_precondition` compara `If-Match` como string exacto y Cloudflare
reescribe el `ETag` a formato débil al comprimir con Brotli, causando 412 espurio en el
siguiente write tras un GET comprimido). Severidad: Medium — no bloquea el checkpoint de
H-004.2 en sí (list/get/create/update, lo que Carlos usa hoy, funciona), pero sí puede
bloquear un delete/restore real si el ETag previo llegó comprimido. Registrado como
`backlog.md` → H-005 (incluye repro completo y arreglo propuesto), no se corrige dentro de
esta historia porque la causa no está en el código de H-004 — es común a `vault_service.py`
(bóvedas, historia anterior) también.
