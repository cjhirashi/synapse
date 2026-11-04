---
id: H-039
titulo: Al mover o renombrar una nota o una carpeta por la API, reescribir los wikilinks que apuntaban a la ruta vieja
estado: in-progress # orden de Carlos 2026-11-04 (vía `main`); Q-2..Q-4 con la recomendación de AIRA; Q-1 (interfaz) pendiente de Carlos
covers:
  - backend/app/core/wikilink_rewrite.py
  - backend/app/core/wikilink_rewrite_test.py          # si el proyecto ubica el unit test del core junto al módulo; si no, backend/tests/test_wikilink_rewrite.py
  - backend/app/services/note_content_service.py
  - backend/app/services/folder_service.py
  - backend/app/routers/notes.py
  - backend/app/routers/folders.py
  - backend/app/core/errors.py
  - backend/app/core/schemas.py
  - backend/tests/fixtures/wikilink_rewrite_cases.json
  - backend/tests/test_wikilink_rewrite.py
  - backend/tests/test_note_rewrite_api.py
  - backend/tests/test_folder_move_api.py
origen: pedido de Carlos 2026-11-04 (los wikilinks de otras notas se rompen al cambiar `path`; además no hay operación de mover carpeta por API y el INDICE no viaja). Medición en la bóveda real de Carlos (1239 notas vivas, 3125 wikilinks) incluida en §3.
---

# H-039 — Reescritura de wikilinks al mover/renombrar nota o carpeta (API)

## 1. Intención

Hoy un agente mueve o renombra una nota con `PATCH /vaults/{id}/notes/{note_id}`
cambiando su `path`, pero **ningún wikilink de otras notas se reescribe**: los
enlaces `[[ruta vieja]]` que apuntaban a esa nota quedan rotos. Tampoco existe
una operación de API para **mover o renombrar una carpeta** (prefijo de ruta):
sólo se puede mover nota por nota, y al hacerlo el `INDICE.md` de la carpeta no
viaja (queda huérfano en el origen y nace uno vacío en el destino vía
`_ensure_indexes`), perdiendo su atributo `descripcion`.

Esta historia hace que, al mover/renombrar una nota o una carpeta **por la
API**, Synapse reescriba automáticamente en toda la bóveda los wikilinks que
apuntaban a las rutas viejas, conservando el texto visible, y defina una
operación atómica de mover carpeta que arrastra su INDICE con su `descripcion`.

## 2. Alcance / fuera de alcance

- **Dentro:**
  - Reescritura de wikilinks al cambiar `path` de una nota por `PATCH` (el que
    renombra el archivo y/o cambia su carpeta).
  - Nueva operación `POST /vaults/{vault_id}/folders/move` (mover/renombrar una
    carpeta = reubicar el prefijo de todas sus notas vivas, con su INDICE).
  - Módulo puro de reglas de reescritura (`core/wikilink_rewrite.py`) + fixture
    JSON compartido (`wikilink_rewrite_cases.json`) que el frontend podrá cumplir.
  - Reporte de cuántas notas/enlaces se reescribieron, sin romper `NoteOut`.
  - Nuevo etag/versión y sellado de `fecha_actualizacion` en cada nota tocada.
- **Fuera:**
  - El canal de `/sync` (push de PouchDB) y la interfaz web
    (`noteStore.renameFolder`/`moveFolder`/`renameDoc`): **no se reescribe ahí en
    esta historia**. Se deja la regla pura y el fixture listos para que un paso
    posterior del frontend los cumpla (ver §5 y `plan.md` D-7). Recomendación a
    Carlos en §6.
  - Enlaces **entre bóvedas**: el resolutor del cliente
    (`frontend/src/editor/wikilink.ts`) sólo resuelve dentro de la MISMA bóveda
    (verificado: `resolveWikiLink` compara contra `notes` de una sola bóveda, sin
    componente de bóveda en el destino). No existen wikilinks entre bóvedas, así
    que no hay nada que reescribir entre bóvedas.
  - Reescritura del cuerpo de un INDICE (su cuerpo no se guarda, se genera con
    `render_body`; nunca contiene wikilinks que persistan).
  - Deshacer/historial de la operación.

## 3. Hechos verificados que condicionan el diseño

- **El resolutor del cliente** (`resolveWikiLink`, `frontend/src/editor/wikilink.ts`):
  compara en minúsculas; acepta destino con o sin `.md`; **la ruta completa exacta
  gana**; si no hay ruta exacta, resuelve **por nombre de archivo** la primera nota
  con ese nombre; `INDICE.md` **sólo** resuelve por ruta completa, nunca por nombre.
  Mismo-bóveda únicamente.
- **Medición en producción** (solo lectura, bóveda de Carlos, 1239 notas vivas):
  3125 wikilinks. El **99 % es de solo nombre** `[[Nombre]]` (sin carpeta y SIN
  `.md`); **39** son de ruta completa con `/`; **160** llevan `|texto`; **33** usan
  `\|` (dentro de tablas).
- **Implicación de resolución:** mover una nota/carpeta **sin cambiar el nombre de
  archivo** NO rompe los enlaces por nombre (salvo que existan duplicados de ese
  nombre); **renombrar el archivo SÍ** los rompe. Los enlaces de ruta completa se
  rompen con cualquier cambio de la ruta.
- **CouchDB 3 no tiene transacciones multi-documento** (`all_or_nothing` no sirve);
  el puerto `VaultPort` no expone `_bulk_docs`. Las notas son documentos
  `note:{vault_id}:{note_id}` con `path`, `content`, `frontmatter`, `deleted_at`.
  `list_notes` pagina por la vista `[vault_id, deleted, created_at]`.
- **Incidente de ramas en conflicto:** 51 notas con dos ramas tras mover una
  carpeta mientras otro proceso editaba la ruta vieja → el diseño debe escribir
  sobre el `_rev` leído y tratar el 409 como `PreconditionFailed`.

## 4. Criterios de aceptación (EARS booleano)

Reglas de reescritura (se prueban contra el fixture compartido `wikilink_rewrite_cases.json`):

- **C-1:** CUANDO cambia la ruta de una nota de `A` a `B`, el sistema DEBE
  reescribir, en toda nota viva de la misma bóveda, cada wikilink cuyo **destino sea
  la ruta completa** de `A` (comparado con `path_key`: NFKC + casefold; con o sin
  sufijo `.md`) para que apunte a `B`, conservando el sufijo `.md` presente o
  ausente, el alias tras `|` o `\|`, y los espacios internos del cuerpo.
- **C-2:** CUANDO el movimiento **cambia el nombre de archivo** (último segmento) de
  `A` a `B`, el sistema DEBE reescribir además los wikilinks **de solo nombre**
  `[[NombreA]]` **únicamente si `A` era la única nota viva de la bóveda con ese
  nombre de archivo**, dejándolos como `[[NombreB]]` (conservando con/sin `.md` y el
  alias).
- **C-3:** SI el nombre de archivo de `A` lo comparten dos o más notas vivas
  (duplicado) ENTONCES el sistema NO DEBE reescribir los wikilinks de solo nombre de
  ese nombre (ambigüedad), DEBE reescribir sólo los de ruta completa exacta, y DEBE
  reportar el nombre ambiguo como no reescrito.
- **C-4:** CUANDO el nombre de archivo NO cambia (sólo cambia la carpeta), el sistema
  NO DEBE reescribir los wikilinks de solo nombre (siguen resolviendo por nombre);
  DEBE reescribir sólo los de ruta completa exacta.
- **C-5:** El sistema NO DEBE reescribir texto dentro de **bloques de código**
  (vallas ``` o ~~~) ni de **código en línea** (`` `...` ``), ni destinos que sean
  **imágenes/enlaces markdown** `![](...)`/`[](...)`, ni el cuerpo de un INDICE
  (no se guarda).
- **C-6:** El sistema NO DEBE tocar notas que no contengan ningún wikilink afectado,
  ni notas en la papelera (`deleted_at` != null).

API — PATCH de nota con reescritura:

- **C-7:** CUANDO `PATCH /vaults/{vault_id}/notes/{note_id}` cambia `path`, el
  sistema DEBE aplicar C-1..C-6 sobre las demás notas de la bóveda ANTES de
  responder, y DEBE devolver la nota movida con su `path` nuevo y su `ETag` nuevo.
- **C-8:** CUANDO esa reescritura toca otras notas, el sistema DEBE sellar su
  `fecha_actualizacion` (`stamp_dates`, fecha CDMX) y generar un `_rev` nuevo para
  cada una, igual que `NoteContentService.update`.
- **C-9:** El sistema DEBE informar cuántas notas y cuántos wikilinks reescribió y
  cuáles quedaron ambiguos, en la cabecera de respuesta **`X-Wikilinks-Rewritten`**
  (p. ej. `notes=3; links=5; ambiguous=0`), SIN añadir campos a `NoteOut`.

API — mover/renombrar carpeta:

- **C-10:** El sistema DEBE exponer `POST /vaults/{vault_id}/folders/move` con cuerpo
  `{from, to}` (ambas rutas de carpeta, normalizadas con `path_key`), que reubique
  **todas las notas vivas** bajo `from/` a `to/` conservando la subestructura, y
  aplique la reescritura de wikilinks (C-1..C-6) a toda la bóveda tratando el
  conjunto de renombres como un solo cambio.
- **C-11:** CUANDO se mueve una carpeta, su `INDICE.md` DEBE viajar a la ruta nueva
  **conservando su `descripcion`** (y demás atributos no-fecha); NO DEBE quedar un
  INDICE huérfano en el origen; los INDICE de los ancestros del destino DEBEN
  asegurarse; el cuerpo del INDICE no se reescribe (se genera).
- **C-12:** SI alguna ruta destino ya está reservada por una nota viva ajena al
  movimiento (colisión por `path_key`), o `to` está dentro de `from` (mover una
  carpeta dentro de sí misma), o `from`/`to` son la raíz (`""`), o `from` no tiene
  ninguna nota viva, ENTONCES el sistema NO DEBE mover ni reescribir nada y DEBE
  responder con un error de dominio (§plan contrato), sin dejar estado parcial.
- **C-13:** `POST /folders/move` DEBE ser idempotente y reparadora: una segunda llamada con el mismo
  `{from, to}` cuando `from` ya no tiene notas vivas y `to` sí, DEBE responder 200 con 0 notas movidas y
  completar la reescritura de wikilinks que hubiera quedado pendiente (los que aún apunten a `from/<resto>` cuando
  existe `to/<resto>`); SI ni `from` ni `to` tienen notas vivas, ENTONCES DEBE responder 404.

Concurrencia y atomicidad:

- **C-14:** CUANDO una escritura de una nota choca por `_rev` (otra edición entró entre la lectura y la escritura),
  el sistema DEBE releer la nota, reaplicar la reescritura sobre el contenido fresco y reintentar (hasta 3 veces);
  SI una nota ajena sigue chocando ENTONCES DEBE contarla en `pending` y seguir con las demás, y SI una nota movida
  no cede ENTONCES DEBE responder 412 `wikilink-rewrite-conflict`; nunca DEBE perder la edición concurrente.

No regresión:

- **C-15:** Los contratos y comportamientos existentes de notas (crear, leer,
  borrar, restaurar, PATCH sin cambio de `path`, reservas, INDICE H-031) NO DEBEN
  regresionar (suite verde, contrato OpenAPI regenerado y verificado).

`[NEEDS CLARIFICATION]`: ver §6 — hay 4 decisiones de producto que requieren a
Carlos antes de cerrar Gate 1.

## 5. Decisiones de diseño tomadas por AIRA (detalle en `plan.md`)

- **D-A (reporte por cabecera, no por cuerpo):** `X-Wikilinks-Rewritten` en vez de
  ampliar `NoteOut`, para no romper el contrato publicado de la nota (C-9). Alt.
  descartada: campo opcional en `NoteOut` — contaminaría cada respuesta de lectura.
- **D-B (operación de carpeta por endpoint propio):** `POST /folders/move` en vez de
  sobrecargar el PATCH de nota, porque mover carpeta no es una nota y necesita
  cuerpo `{from, to}` y semántica propia (C-10..C-13).
- **D-C (atomicidad por fases en memoria):** planear y validar TODO antes de
  escribir; reservar rutas nuevas; escribir sobre `_rev` leído; liberar viejas.
  Sin transacción CouchDB real; garantías explícitas y honestas en `plan.md §2`.
- **D-D (regla pura compartida):** `core/wikilink_rewrite.py` sin E/S + fixture
  `wikilink_rewrite_cases.json`, para que el frontend lo cumpla en un paso futuro.
- **D-E (recorrer la bóveda, sin índice nuevo):** a 1239 notas vivas, recorrer con
  `list_notes` paginado (100 por página) y procesar por página basta; no se añade un
  índice CouchDB nuevo. Justificado por la escala real en `plan.md §2`.

## 6. Descartes y decisiones abiertas (requieren a Carlos — Gate 1)

Rechazos ya registrados:
- Reescribir en el canal `/sync`/interfaz dentro de ESTA historia: **descartado**
  del alcance (sería otra historia); se deja la regla pura lista. Ver recomendación.
- `_bulk_docs`/`all_or_nothing` de CouchDB para atomicidad: **descartado** (CouchDB 3
  no da atomicidad multi-doc real; añadiría complejidad sin la garantía buscada).

Decisiones abiertas (con recomendación de AIRA):
- **Q-1 — ¿Reescribir también por el canal de la interfaz/`/sync`?**
  Recomendación: historia aparte que reuse la regla pura y el fixture de ésta; no
  mezclar canales aquí.
- **Q-2 — ¿Qué hace `/folders/move` si choca una ruta destino?** Recomendación:
  abortar todo y 409 (C-12), nunca mover parcialmente. ¿Carlos prefiere "mover lo que
  se pueda y reportar"? (no recomendado).
- **Q-3 — ¿La reescritura debe fallar la operación completa si una nota ajena
  entra en conflicto (C-14)?** **Enmendada por el navegador:** no abortar; releer, reaplicar y reintentar sobre
  el contenido fresco (nunca se pierde la edición ajena) y declarar `pending` si no cede. Abortar dejaría a un `PATCH` ya aplicado sin forma de reparar.
- **Q-4 — Forma del reporte (C-9):** ¿cabecera `X-Wikilinks-Rewritten` basta o
  Carlos quiere un endpoint de "dry-run" que liste qué se reescribiría sin escribir?
  Recomendación: cabecera ahora; dry-run como historia futura si se necesita.

## Avance (AIRA, 2026-11-04 17:50 CDMX)

- Pasos 1-6 hechos y commiteados: regla pura + fixture (47 pruebas), errores, `WikilinkRewriteService` (reintento por `_rev`, `pending`),
  PATCH con `X-Wikilinks-Rewritten`, `FolderService.move` y `POST /vaults/{id}/folders/move`; pruebas de servicio (doble en memoria) y de API
  (CouchDB real). Cambios sobre el plan: detección de código por líneas de valla (no por paridad de comillas); la reparación de C-13 también
  corre tras un movimiento parcial (notas ya bajo `to` se tratan como venidas de `from`); `check_vault_active` y `ensure_indexes` públicos en
  `NoteContentService`. Decisiones Q-2..Q-4 aplicadas con la recomendación; Q-1 (canal de la interfaz y `/sync`) sigue abierta: NO reescribe.
- Pendiente: suite completa, despliegue y prueba en producción; la herramienta `synapse_vault` del plugin aún no tiene acción para mover carpeta.
