---
historia: H-039
estado: confirmado # diseño de AIRA 2026-11-04, enmendado por el navegador (ver §6); Q-2..Q-4 resueltas con la recomendación (reversible); Q-1 (canal de la interfaz) queda para Carlos
---

# Plan H-039 — Reescritura de wikilinks al mover/renombrar nota o carpeta (API)

Base: rama `feature/h039-wikilinks-mover-carpeta`, worktree
`h039-wikilinks-carpetas`. Backend FastAPI hexagonal: `routers → services →
core/ports ← adapters`. Los servicios lanzan errores de dominio
(`core/errors.py`), nunca `HTTPException`; `core/problems.py` los traduce (RFC
9457). Pruebas con CouchDB real (P5; `localhost:15984`, admin/testpass,
`backend/tests/conftest.py`). Nada de mocks de BD en integración.

---

## §1 · Contrato de API

### 1.a — `PATCH /vaults/{vault_id}/notes/{note_id}` con reescritura

Sin cambio de método/ruta/cuerpo. Cambio de **efecto** y de **cabecera**:

- Cuando el cuerpo cambia `path` (`changes["path"] != old_path`, ya detectado por
  `NoteContentService.update` como `renamed`), tras mover la nota y asegurar
  INDICE se ejecuta el **plan de reescritura** (§1.c) sobre las demás notas.
- **Respuesta:** `200` con `NoteOut` **idéntico al actual** (no se amplía el
  contrato publicado — D-A) + cabecera `ETag` de la nota movida.
- **Cabecera nueva `X-Wikilinks-Rewritten`** (ASCII, formato estable):
  `notes=<n>; links=<m>; ambiguous=<k>; pending=<p>` donde `n` = notas ajenas reescritas, `m` =
  wikilinks reescritos, `k` = nombres ambiguos no reescritos (C-3/C-9), `p` = notas que siguieron
  chocando por `_rev` tras los reintentos (§2) y quedaron SIN reescribir (normalmente 0). Se documenta
  en el contrato como header de la respuesta 200 (igual que `ETag` hoy, vía
  `_with_etag`). Cuando el PATCH no cambia `path`, la cabecera se omite.
- **Errores:** los actuales (`_CONDITIONAL`, `VaultNotFound`, `NotePathTaken`). Un choque por `_rev` en una
  nota ajena NO falla el PATCH (la nota ya se movió): se reintenta (§2) y, si persiste, se cuenta en `pending`.

> Alternativa descartada: campo `rewrite` opcional en `NoteOut`. Contamina cada GET
> de nota con un campo que sólo tiene sentido en un PATCH; rompería el `exclude`
> actual de `NoteListItem`. La cabecera es informativa y no afecta al esquema del
> recurso.

### 1.b — `POST /vaults/{vault_id}/folders/move` (nuevo)

- **Router nuevo** `backend/app/routers/folders.py` (prefix
  `/vaults/{vault_id}/folders`, misma compuerta de sesión que `notes.py`).
- **Cuerpo** (`schemas.FolderMove`): `{ "from": str, "to": str }` (alias de campo
  porque `from` es palabra reservada de Python: `from_=Field(alias="from")`). Ambas
  son rutas de **carpeta** (sin `INDICE.md`, sin nombre de archivo), p. ej.
  `"Proyectos/2025"` → `"Archivo/Proyectos 2025"`. La raíz `""` no es válida.
- **`If-Match`:** **no** se usa (una carpeta no es un documento con un único `_rev`).
  La seguridad frente a escrituras concurrentes la da el plan sobre `_rev` por nota
  (§2) + idempotencia (C-13). Se documenta explícitamente que no lleva `If-Match`.
- **Respuesta `200`** con cuerpo `FolderMoveOut`:
  `{ from, to, moved_notes: int, rewrite: { notes, links, ambiguous } }`.
  (Aquí sí cuerpo propio: no es el recurso `NoteOut`, es el resultado de la
  operación.) Mismo dato también en cabecera `X-Wikilinks-Rewritten` por simetría.
- **Idempotente y reparadora (C-13):** si `from` no tiene notas vivas y `to` ya tiene notas, no hay nada que
  mover pero SÍ se reaplica la reescritura (§2, modo reparación): cada nota viva bajo `to/<resto>` se trata
  como renombre `from/<resto>` → `to/<resto>`, de modo que los wikilinks que quedaron pendientes de una corrida
  interrumpida se completan. Responde `200` con `moved_notes=0` y el `rewrite` aplicado. `from==to` → `200` con 0 (no-op, sin reescritura).
- **Errores de dominio (nunca HTTPException):**
  | Caso | Error (nuevo salvo nota) | HTTP |
  |---|---|---|
  | `from`/`to` = raíz o ruta inválida (`check_path` de carpeta) | `ValidationFailed` (`#/from`/`#/to`) | 422 |
  | `to` dentro de `from` (`to_key == from_key` o `to_key.startswith(from_key+"/")`) | `FolderMoveInvalid` | 422 |
  | ruta destino tomada por nota viva ajena (`path_key`) | `NotePathTaken` (reuso) | 409 |
  | una nota MOVIDA sigue chocando por `_rev` tras los reintentos | `WikilinkRewriteConflict` | 412 |
  | `from` sin notas vivas y `to` sin notas vivas | `FolderNotFound` (nuevo, `NotFound` 404) | 404 |
  | bóveda inexistente/ajena | `VaultNotFound` | 404 |
  | bóveda en papelera | `VaultNotFound` (no activa, como `_check_vault_active`) | 404 |
  - **Colisión de destino:** se valida con la misma regla `path_key` y las reservas
    de `NoteService` ANTES de escribir nada (fase planificar, §2). Una nota en
    papelera en la ruta destino **no** bloquea (sólo cuentan hojas vivas, como ya
    hace `NoteService._holder`).
  - **INDICE destino ya existente:** si en `to` ya hay un `INDICE.md` vivo, el del
    origen NO lo pisa: se conserva el del destino y el del origen se borra (su
    `descripcion` no se fusiona — se documenta como decisión; alternativa "fusionar
    descripciones" descartada por ambigua). Si no hay INDICE en `to`, el del origen
    viaja con su `descripcion` (C-11).

### 1.c — Qué cuenta como "mover" para la reescritura

Un movimiento se describe como un **conjunto de renombres** `{(A_i -> B_i)}` (una
nota en el PATCH; muchas en `/folders/move`). De ahí se derivan, de forma pura:
- El conjunto de **rutas completas viejas → nuevas** (`path_key`), para C-1/C-4.
- El conjunto de **nombres de archivo que cambian** (último segmento de `A_i` !=
  último de `B_i`) y, para cada uno, si el nombre viejo era **único vivo** en la
  bóveda (C-2) o **ambiguo** (C-3). La unicidad se mide sobre el censo de nombres de
  la bóveda ANTES del movimiento, excluyendo papelera e INDICE.

### 1.d — Errores nuevos en `core/errors.py`

```
class FolderMoveInvalid(ValidationFailed):   # 422, sin slug propio: errors=[{pointer,detail}]
    ...
class FolderNotFound(NotFound):               # 404: ni `from` ni `to` tienen notas vivas (patrón de NoteNotFound)
    ...
class WikilinkRewriteConflict(DomainError):  # 412
    slug = "wikilink-rewrite-conflict"; title = ...; status = 412
    detail = "A moved note kept changing during the operation; retry it"
```
`WikilinkRewriteConflict` se traduce igual que `PreconditionFailed` (412) pero con
slug propio para que el agente distinga "reintenta la operación completa".

---

## §2 · Atomicidad real sobre CouchDB (sin transacciones)

CouchDB 3 no tiene transacción multi-documento y `VaultPort` no expone
`_bulk_docs`. Estrategia en **4 fases**, toda la operación es **función
determinista del estado** (reejecutar converge):

1. **Planificar (sólo lectura, en memoria):** recorrer la bóveda con `list_notes`
   paginado (100/página; no cargar las 1239 de golpe más de una página a la vez —
   se acumula sólo lo necesario: `_id`, `_rev`, `path`, `content`). Construir:
   (a) el conjunto de renombres `{(A_i->B_i)}` y el censo de nombres para C-2/C-3;
   (b) para cada nota viva no-INDICE, aplicar la **regla pura** (§3) a su `content`;
   quedarse sólo con las que cambian → lista de escrituras `{(_id, _rev, nuevo
   content)}`. Validar TODO: colisiones de destino (`path_key` + reservas), `to`
   dentro de `from`, raíz. Si algo falla aquí, **no se ha escrito nada**.
2. **Reservar rutas nuevas:** para cada nota que se mueve, `reserve_path(id, B_i)`
   (reuso `NoteService`). Si una reserva choca → `NotePathTaken`, abortar; las
   reservas ya hechas se liberan en compensación (best-effort).
3. **Escribir:** por cada documento del plan, `put` con el `_rev` leído en la fase 1.
   Orden: primero las notas movidas (cambian `path`, sellan fecha, nuevo `_rev`);
   luego el INDICE (viaja con `descripcion`); luego las notas ajenas reescritas
   (sellan `fecha_actualizacion`, nuevo `_rev`). Un `put` que devuelva
   `RevisionConflict` (409 de CouchDB) → `WikilinkRewriteConflict` (C-14): se
   **aborta** el resto. Lo ya escrito queda consistente por sí mismo (cada nota es
   válida); el reporte indica cuántas quedaron por hacer.
4. **Liberar rutas viejas:** `release_path(id, A_i)` de las notas movidas
   (best-effort, como hoy en `update`).

**Qué garantiza (afirmable a Carlos tal cual):**
- Validación total antes de la primera escritura: una operación que va a chocar por
  colisión de destino o ruta inválida **no escribe nada**.
- Cada nota escrita es individualmente válida y versionada (nuevo `_rev`, fecha
  sellada); nunca se corrompe una nota a medias.
- Los conflictos de `_rev` no dejan wikilinks a medias en silencio: se reintentan sobre el contenido fresco y lo
  que no ceda se declara en `pending`.
- `/folders/move` es **reanudable/idempotente**: reejecutarlo con el mismo `{from,to}` cuando `from` ya está vacío
  entra en modo reparación y reaplica la reescritura sobre lo que quedó pendiente (C-13); lo ya reescrito no
  casa de nuevo (la ruta vieja ya no aparece en los contenidos).

**Qué NO garantiza (honesto):**
- **No es atómica** frente a un fallo a mitad de la fase 3: si el proceso muere pueden quedar algunas notas
  movidas/reescritas y otras no. Mitigación: reejecutar `/folders/move` (modo reparación). Para el `PATCH` de una
  sola nota no hay reejecución que repare (la nota ya se movió): lo pendiente se declara en `pending`. No hay rollback
  automático de las escrituras ya confirmadas en CouchDB.
- No bloquea escrituras concurrentes de `/sync` sobre la ruta vieja mientras corre
  (origen del incidente de las 51 ramas); sólo las detecta por `_rev` y aborta
  (C-14). La defensa real contra ese solapamiento es no correr el canal interfaz y el
  REST sobre la misma carpeta a la vez (Q-1).

> Alternativa descartada: `_bulk_docs` con `all_or_nothing=true`. CouchDB lo acepta
> pero **no garantiza atomicidad** (puede crear ramas en conflicto en vez de fallar),
> justo el modo que produjo el incidente. Añadir `bulk` al puerto por una garantía que
> no existe es peor que el plan por fases, que al menos es determinista y reanudable.

---

## §3 · Reglas puras de reescritura — `core/wikilink_rewrite.py` (sin E/S)

Módulo nuevo, espejo conceptual de `frontend/src/editor/wikilink.ts`. Reutiliza
`path_key` (`core/note_rules.py`) e `is_index_path` (`core/index_rules.py`). Firmas:

```python
# Un renombre del plan.
class Rename(NamedTuple):
    old_path: str
    new_path: str

# Resultado puro de reescribir UNA nota.
class Rewrite(NamedTuple):
    content: str          # cuerpo reescrito (== entrada si no hubo cambios)
    links: int            # nº de wikilinks reescritos en esta nota
    ambiguous: list[str]  # nombres ambiguos hallados y NO reescritos

def plan_renames(renames, name_census) -> "RewritePlan":
    """Deriva, de los renombres y el censo de nombres {name_key: nº vivos}, los
    mapeos: rutas completas viejas->nuevas (path_key) y nombres-de-archivo que
    cambian con su destino, marcando ambiguos (más de 1 vivo con ese nombre)."""

def rewrite_note(content: str, plan: "RewritePlan") -> Rewrite:
    """Reescribe los wikilinks del cuerpo según `plan`. No toca código vallado
    (``` / ~~~), código en línea (`...`), ni enlaces/imágenes markdown [..](..)."""
```

Reglas exactas (C-1..C-6), todas con casos en el fixture:
- **Tokenización:** reusar la gramática de `splitWikiLinks` (regex
  `\[\[([^[\]]+?)\]\]`) y `parseWikiLinkBody` (primer `|`), portadas a Python. El
  separador puede venir como `|` o escapado `\|` (tablas, 33 casos): se detecta cuál
  y se **conserva** al reescribir. Espacios internos del cuerpo (`[[ A | b ]]`) se
  conservan tal cual alrededor del destino reescrito.
- **Match por ruta completa (C-1/C-4):** `path_key(destino con .md forzado)` ==
  `path_key(old_path)`. Al reescribir, se conserva si el destino original traía `.md`
  o no, y la caja/acentos **del destino nuevo** se toman de `new_path` (el nombre
  canónico nuevo), no de la caja vieja.
- **Match por nombre (C-2/C-3):** sólo si el destino **no tiene `/`** y su `path_key`
  (con/sin `.md`) coincide con el nombre de archivo viejo de un renombre cuyo nombre
  **cambia** y es **único vivo**. Si el nombre es ambiguo → no se reescribe, se añade
  a `ambiguous`.
- **Nunca:** INDICE (su cuerpo no se guarda, no se le llama `rewrite_note`),
  destinos con extensión ajena (`.pdf`…; `hasUnmanagedExtension`), texto dentro de
  code fence / inline code / markdown link-image.
- **Rutas relativas entre hermanas:** el resolutor del cliente **no** admite rutas
  relativas (verificado: compara contra `path` absoluto o nombre de archivo). No
  existen, no se reescriben. Se documenta en el módulo.

**Fixture** `backend/tests/fixtures/wikilink_rewrite_cases.json`, estilo
`note_rules_cases.json`/`indice_cuerpo.json` (top-level `_doc`, luego arrays de
casos). Forma propuesta:
```json
{
  "_doc": "Reglas puras de reescritura de wikilinks (H-039). Backend y frontend las cumplen.",
  "rewrite": [
    { "name": "ruta-completa-con-alias",
      "renames": [["Proyectos/Plan.md", "Archivo/Plan.md"]],
      "census": { "plan.md": 1 },
      "content": "ver [[Proyectos/Plan.md|el plan]] y [[Proyectos/Plan|x]]",
      "expected": "ver [[Archivo/Plan.md|el plan]] y [[Archivo/Plan|x]]",
      "links": 2, "ambiguous": [] },
    { "name": "solo-nombre-unico-cambia-archivo",
      "renames": [["A/Nota.md", "A/Apunte.md"]],
      "census": { "nota.md": 1 },
      "content": "[[Nota]] y [[nota.md]]",
      "expected": "[[Apunte]] y [[apunte.md]]",
      "links": 2, "ambiguous": [] },
    { "name": "solo-nombre-ambiguo-no-se-toca",
      "renames": [["A/Nota.md", "A/Apunte.md"]],
      "census": { "nota.md": 2 },
      "content": "[[Nota]] [[A/Nota.md]]",
      "expected": "[[Nota]] [[A/Apunte.md]]",
      "links": 1, "ambiguous": ["nota.md"] },
    { "name": "mover-sin-renombrar-conserva-nombre",
      "renames": [["A/Nota.md", "B/Nota.md"]],
      "census": { "nota.md": 1 },
      "content": "[[Nota]] [[A/Nota.md]]",
      "expected": "[[Nota]] [[B/Nota.md]]",
      "links": 1, "ambiguous": [] },
    { "name": "tabla-escape-barra",
      "renames": [["A/Nota.md", "B/Nota.md"]],
      "census": { "nota.md": 1 },
      "content": "| [[A/Nota.md\\|texto]] |",
      "expected": "| [[B/Nota.md\\|texto]] |",
      "links": 1, "ambiguous": [] },
    { "name": "no-tocar-code-fence-ni-inline",
      "renames": [["A/Nota.md", "B/Nota.md"]],
      "census": { "nota.md": 1 },
      "content": "`[[A/Nota.md]]` y\n```\n[[A/Nota.md]]\n```",
      "expected": "`[[A/Nota.md]]` y\n```\n[[A/Nota.md]]\n```",
      "links": 0, "ambiguous": [] }
  ]
}
```
(El implementador añade casos de `.md`/sin `.md`, mayúsculas/acentos NFKC, enlace
markdown `[x](A/Nota.md)` que NO se toca, y nota en papelera que no cuenta al censo.)

---

## §4 · Pasos TDD (un commit por paso, citando H-039; Driver = modelo rápido)

1. **Fixture + regla pura `plan_renames`/`rewrite_note`** (C-1..C-6).
   Archivos: crear `backend/tests/fixtures/wikilink_rewrite_cases.json` (con todos los
   casos de §3) y `backend/app/core/wikilink_rewrite.py`. Test: nuevo
   `backend/tests/test_wikilink_rewrite.py` que recorre el fixture
   (`for case in cases["rewrite"]: assert rewrite_note(...) == (expected, links, ambiguous)`).
   Término: `pytest backend/tests/test_wikilink_rewrite.py` verde. Sin E/S, sin CouchDB.

2. **Errores nuevos** `FolderMoveInvalid`, `FolderNotFound`, `WikilinkRewriteConflict` en
   `backend/app/core/errors.py` + su traducción (verificar que `core/problems.py` ya
   los cubre por ser `DomainError`/`ValidationFailed`; añadir al catálogo si hace
   falta). Test: `backend/tests/test_problems.py` (o el existente de errores) afirma
   status/slug/type_uri. Término: `pytest backend/tests/test_problems.py` verde.

3. **Servicio de reescritura `WikilinkRewriteService`** (C-6, C-8, C-14). Nuevo
   `backend/app/services/wikilink_rewrite_service.py`: `plan(vault_id, renames) -> RewriteJob` (recorre la bóveda
   con `list_notes` paginado de 100, arma el censo de nombres vivos sin INDICE ni papelera, aplica
   `rewrite_note` a cada nota viva no-INDICE y conserva solo las que cambian) y `apply(job) -> RewriteReport(notes, links,
   ambiguous, pending)` (escribe sobre `_rev` leído con `stamp_dates`; ante `RevisionConflict` relee, reaplica y
   reintenta hasta 3 veces; ajena que no cede → `pending`). Tests nuevos en `backend/tests/test_wikilink_rewrite_service.py`
   con CouchDB real y `VaultRepository`: solo cambian las notas con enlace (ETag nuevo, `fecha_actualizacion` sellada, la
   no afectada conserva `_rev`), la papelera no se toca, un conflicto inyectado entre `plan` y `apply` (escribir la nota con el
   puerto directo) se resuelve con reintento y el enlace queda reescrito sobre el contenido fresco. Término: `pytest
   backend/tests/test_wikilink_rewrite_service.py` verde.

4. **PATCH con reescritura + cabecera** (C-7, C-9). En `NoteContentService.update`, cuando `renamed`, tras mover la nota y
   `_ensure_indexes`, ejecutar `WikilinkRewriteService` con el renombre único y devolver el `RewriteReport` junto al
   `Versioned`; `routers/notes.py::update_note` pone `X-Wikilinks-Rewritten: notes=..; links=..; ambiguous=..; pending=..` solo cuando
   hubo cambio de `path`. Tests nuevos `backend/tests/test_note_rewrite_api.py` (API real): PATCH que renombra
   actualiza los enlaces de otras notas (ruta completa y solo nombre único), cabecera presente, ausente sin cambio de `path`, y
   las no afectadas no cambian de ETag. Término: `pytest backend/tests/test_note_rewrite_api.py` verde.

5. **Servicio de carpeta `FolderService.move`** (C-10, C-11, C-12, C-13), sobre `WikilinkRewriteService`.
   Nuevo `backend/app/services/folder_service.py`: construye el conjunto de renombres
   de todas las notas vivas bajo `from/` (incluye el INDICE del origen → `to/INDICE.md`
   conservando `descripcion`), valida (raíz, `to` dentro de `from`, colisiones), y
   usa `WikilinkRewriteService` del paso 3. Modo reparación (C-13): si `from` ya no tiene notas vivas y `to` sí, genera los renombres
   `from/<resto>` → `to/<resto>` y solo reescribe. `from` y `to` vacíos → `FolderNotFound`.
   Test: nuevo `backend/tests/test_folder_move_api.py` con CouchDB real: mover carpeta
   con subcarpetas conserva subestructura; INDICE viaja con `descripcion`; no queda
   INDICE huérfano; colisión de destino → 409 sin mover nada; `to` dentro de `from`
   → 422; reejecución idempotente → 200 con `moved_notes=0`; reparación: dejar un enlace pendiente a mano, reejecutar y comprobar que se completa; ambos vacíos → 404. Término: `pytest backend/tests/test_folder_move_api.py` verde.

6. **Router nuevo `folders.py` + schemas** (C-10, C-12).
   `backend/app/routers/folders.py` con `POST .../folders/move`, `schemas.FolderMove`
   (`from_`→alias `from`) y `schemas.FolderMoveOut`; registrarlo en el app factory
   (donde se incluye `notes.router`). Test en el archivo del paso 5: cuerpo de
   respuesta `FolderMoveOut` y cabecera. Término: mismo `pytest` verde.

7. **No regresión + suites existentes** (C-15).
   Correr `pytest backend/tests/test_note_contract.py backend/tests/test_note_sync_push.py`
   y la suite de notas; confirmar que PATCH sin cambio de `path` y el push no cambian.
   Término: suites verdes.

8. **[doc] Documentación y contrato** (C-15). En el mismo commit del código:
   - `docs/API.md` §6: añadir subsección "7. Mover/renombrar carpeta"
     (`POST /vaults/{vault_id}/folders/move`, cuerpo `{from,to}`, respuesta,
     errores, idempotencia) y nota sobre la cabecera `X-Wikilinks-Rewritten` en el
     PATCH de nota.
   - `backend/app/README.md`: mencionar `services/folder_service.py`,
     `routers/folders.py`, `core/wikilink_rewrite.py`.
   - `backend/tests/README.md`: listar `test_wikilink_rewrite.py`,
     `test_note_rewrite_api.py`, `test_folder_move_api.py` y el fixture nuevo.
   - **Contrato OpenAPI:** si `/folders/move` es un **prefijo de ruta nuevo**, hay que
     decidir si lo posee el contrato existente
     `.harness/specs/0014-acceso-agentes-notas/contracts/openapi.yaml` o uno nuevo;
     recomendado: añadirlo a `0014` (misma familia de notas) y registrar el prefijo
     `/vaults/{vault_id}/folders` en el `FEATURES` de `backend/scripts/export_openapi.py`.
     Regenerar con `python backend/scripts/export_openapi.py` y actualizar el yaml.
   - Verificar con `pytest backend/tests/test_contract.py backend/tests/test_note_contract.py`.
   - Session-End en `.harness/memory/history.md`; `historia.md` → `implemented`;
     backlog a "Implementadas, pendientes de checkpoint".
   Término: `test_contract.py` verde y `git diff` muestra docs tocadas.

9. **[integración] Prueba end-to-end con CouchDB real** (C-7..C-14).
   Escenario que reproduce el caso de Carlos a escala reducida: bóveda con ~20 notas,
   wikilinks de ruta completa, de solo nombre (único y duplicado), con `|` y `\|`,
   uno dentro de code fence; mover una carpeta con su INDICE; afirmar: INDICE viajó
   con `descripcion`, enlaces de ruta reescritos, solo-nombre único reescrito,
   duplicado reportado ambiguo y no tocado, code fence intacto, nota en papelera
   intacta, `ETag`/`fecha_actualizacion` nuevos sólo en las tocadas. Simular conflicto
   de `_rev` (escribir la nota ajena entre fase 1 y 3 con el `port` directo) y afirmar
   `WikilinkRewriteConflict` + que reejecutar converge. Término: `pytest backend/tests/test_folder_move_api.py -k integracion` verde ×2 (Converge).

---

## §5 · Estimación, riesgos y canal de interfaz

- **Estimación:** 9 pasos; 1-2 (puros/errores) rápidos; 3-6 (servicio+router) el
  grueso; 8-9 (doc+integración) medios. Cabe en una sesión si Q-1..Q-4 llegan
  resueltas; si no, Gate 1 se detiene (no se implementa sobre decisión abierta).
- **Riesgos:**
  - **R-1 (conflictos concurrentes):** el incidente de las 51 ramas. Mitigado por
    escribir sobre `_rev` leído y abortar (C-14); NO eliminado (ver §2 "qué no
    garantiza"). Recomendación operativa: no mover carpetas por REST mientras la
    interfaz edita la misma bóveda.
  - **R-2 (recorrer la bóveda):** 1239 notas × `content` (≤2 MiB c/u) podría pesar si
    se carga todo. Mitigado: procesar por página de 100, quedarse sólo con las que
    cambian. A esta escala no se justifica un índice CouchDB nuevo (D-E).
  - **R-3 (regla pura divergente entre back y front):** el fixture compartido es la
    única fuente de verdad; el paso frontend futuro debe recorrerlo igual (como
    `note_rules_cases.json`).
  - **R-4 (INDICE destino existente):** decisión tomada (conserva el del destino); si
    Carlos quiere fusionar `descripcion`, es cambio de C-11 vía Directiva de Pausa.
- **Canal de interfaz / `/sync` (recomendación a Carlos):** dejar la regla pura
  (`core/wikilink_rewrite.py`) y el fixture como contrato; una **historia posterior**
  del frontend hará que `noteStore.renameFolder/moveFolder/renameDoc` (o el push)
  reescriba cumpliendo el mismo fixture. No reescribir en el push dentro de H-039:
  mezclar ambos canales sobre las mismas notas es justo lo que produjo el incidente.
- **Decisiones que requieren a Carlos (Gate 1):** Q-1 (canal interfaz), Q-2 (colisión
  en `/folders/move`), Q-3 (abortar vs. parcial en conflicto), Q-4 (cabecera vs.
  dry-run). Recomendaciones en `historia.md §6`.
