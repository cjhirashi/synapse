# Backlog — Synapse

> Lista viva de historias no tomadas. Una línea por historia, sin EARS, sin
> plan, sin estimación — eso llega solo al tomarla (`method.md` §3).
> Reordenar o descartar una entrada de aquí es gratis; no requiere aprobación
> salvo la que el proyecto ya exija para fijar prioridades.

## En curso

- [~] H-012 — Wikilinks: navegar al hacer clic, sólo en Lectura (y crear la nota si el destino no existe, estilo Obsidian) → `historias/h012-wikilinks-navegacion/historia.md`, Gate 1 pasado ("así es", 2026-10-30); `implemented` (2026-10-30; TDD vía Claude Code Modo 2, 5 commits atómicos, Converge ×2 sin fallos; suite completa 90 archivos/1752 tests en verde, typecheck limpio; C-1..C-5 cubiertos) en worktree `h012-wikilinks-click` / rama `feature/h012-wikilinks-navegacion`, **sin merge ni push**; falta checkpoint demostrable de Carlos (clic en wikilink resuelto abre la nota; en Visual no navega; roto sin extensión crea+abre) para `verified`, y que Carlos revise/mergee/reconstruya/redespliegue/push
- [~] H-002.5 — Ventana de configuración para que Carlos cree/revoque sus propias API keys desde el frontend (corrige el alcance original de SPEC-0013, que las dejaba fuera) → `historias/0013-ui-gestion-api-keys/`, Gate 1 pasado ("así es", 2026-10-28)
- [~] H-008 — Riel de bóvedas expandible + chips rellenos con degradado + paleta Tailwind extendida a 17 colores → `historias/h008-riel-boveda-rediseño/`, `implemented` (2026-10-29; 6 pasos TDD verdes, build + suite 1692/1692 OK); falta checkpoint demostrable de Carlos + push/merge para `verified`

## Por tomar (orden = prioridad — validado por Carlos 2026-10-28)

- [ ] H-001.1 — Panel de propiedades en LECTURA con presentación estilo Obsidian (iconos, sin cabecera, sin scroll) · rama `feature/0012-propiedades-obsidian` · **bloqueada:** Gate 2 (plan técnico) de SPEC-0012 nunca se presentó a Carlos, sigue `pendiente`
- [ ] H-001.2 — Edición de propiedades: menú de tipo por icono + pastillas + añadir/quitar · rama `feature/0012-propiedades-obsidian`
- [ ] H-001.3 — No regresión de SPEC-0010 + fidelidad visual final + documentación de cierre · rama `feature/0012-propiedades-obsidian`
- [ ] H-007 — `NoteSidebar.test.tsx` > «RF-042: "Nueva carpeta" crea una nota dentro y la abre en edición» es intermitente (falla ~2 de 3 corridas aisladas, `expect(onOpen).toHaveBeenCalledWith(...)` recibe 0 llamadas — carrera entre `waitForCondition` y el callback de apertura). Confirmado preexistente: falla igual en el commit base antes de H-006 (no es regresión de ese trabajo). Encontrado al verificar independientemente H-006 (la sesión headless reportó "1683 en verde" sin haber corrido la suite completa tras el 429 de rate-limit, 2026-10-29). No bloqueante (pasa casi siempre en la suite completa por el orden/paralelismo de vitest), pero hay que arreglar la carrera en el test, no ignorarla.
- [ ] H-004.2 — Un agente OpenClaw crea/actualiza/borra notas de su bóveda vía REST (escritura) → Gate 1 pasado ("así es", 2026-10-29); prioridad **máxima**, por encima de todo lo anterior en esta lista; depende de H-004.1 (ya `implemented`/desplegado, ver abajo); mismo borrador en `historias/0014-acceso-agentes-notas/historia.md`
- [ ] H-005 — Corregir `_check_precondition` para aceptar `ETag` débil (`W/"..."`) en `If-Match`: Cloudflare reescribe el `ETag` fuerte del origen a débil cuando comprime la respuesta con Brotli (confirmado con curl externo: `Accept-Encoding: br` → débil, `identity` → fuerte, directo a `localhost:8000` sin Cloudflare → siempre fuerte — no es bug de origen ni del plugin cliente). La comparación de string exacta actual rechaza con 412 cualquier `update`/`delete`/`restore` cuyo `GET` previo llegó comprimido, aunque la revisión (`_rev`) sí coincida. Repro: nota creada (ETag fuerte, update ok) → ese mismo update ya responde comprimido (ETag débil) → el siguiente `delete` con ese ETag da 412 pese a mismo `_rev`. Afecta `note_content_service.py::_check_precondition` (líneas 291-296) y la copia idéntica en `vault_service.py` (líneas 274-279). Arreglo propuesto: comparar ignorando el prefijo `W/` (comparación débil, RFC 7232 — correcta cuando el cliente solo ve lo que el borde entrega). No bloqueante: `list`/`get`/`create` funcionan siempre; solo falla el segundo write cuando el ETag previo llegó débil. Hallazgo de un subagente verificando el checkpoint demostrable de H-004, 2026-10-29.

## Implementadas, pendientes de checkpoint de Carlos

- [~] H-011 — Wikilinks `[[...]]`: reconocerlos y mostrarlos como enlace en Lectura y edición Visual (Fase 1; navegación/autocompletar quedan como H-012/H-013) → `historias/h011-wikilinks-reconocer-mostrar/historia.md`, Gate 1 pasado ("así es", 2026-10-30); `implemented` (2026-10-30; TDD vía Claude Code Modo 2, Converge ×2 sin fallos; C-6 corregido por AIRA el mismo día — Carlos aclaró que Lectura es donde más se usan — ahora se pintan en Lectura y Visual, solo Código queda literal) → **desplegado** (`7bf5e88`, suite completa 89 archivos/1740 tests en verde, rebuild+redeploy de `synapse-backend`, `/health` 200); falta checkpoint visual de Carlos (abrir «El Juramento del Aprendiz Masón» en Lectura y ver el alias como enlace + el `.docx` roto) para `verified`.
- [~] H-010 — Cabecera del editor en 3 filas (título solo / Visual+Código+Guardar / barra de formato con 12 controles: tabla, negritas, cursivas, tachado, código en línea, H1-H4, cita, línea horizontal, listas) → `historias/h010-editor-toolbar-filas/historia.md`, `implemented` (2026-10-30; 5 pasos TDD vía Claude Code Modo 2, Converge sin Critical/High) → **desplegado** (merge a `feature/sprint-1-auth` `c556437`, rebuild+redeploy de `synapse-backend`, `/health` 200); falta checkpoint visual de Carlos (cabecera en 3 filas + los 12 controles de formato) para `verified`.
- [~] H-003 — Drag & drop de notas/carpetas en la sidebar izquierda (C-1…C-8, incluye placeholder al vaciar una carpeta) → desplegado, ver `historias/h003-drag-drop-sidebar/historia.md`
- [~] H-006 — Iconos de notas/carpetas en la sidebar con el color de la bóveda, solo contorno (sin relleno — Carlos pidió relleno, lo vio y lo revirtió el mismo día) → desplegado, verificado independientemente por AIRA tras un 429 de rate-limit en la sesión implementadora; ver `historias/h006-iconos-color-bóveda/historia.md`
- [~] H-002.1 — Crear, listar y revocar API keys de agente → desplegado, ver `historias/0013-acceso-agentes-api/historia.md`
- [~] H-002.2 — Un agente usa su API key para leer bóvedas/notas → desplegado, mismo detalle
- [~] H-002.3 — Revocar una key la invalida de inmediato → desplegado, mismo detalle
- [~] H-002.4 — Resiliencia de API keys + documentación de cierre → desplegado, mismo detalle
- [~] H-004.1 — Un agente OpenClaw lista y lee notas de su bóveda vía REST, sin protocolo CouchDB de cliente (lectura) → Gate 1 pasado ("así es", 2026-10-29: id-only, sin filtro de carpeta); implementado, 1342 tests en verde, desplegado y verificado en vivo (`/openapi.json` de `synapse.cjhirashi.com`); ver `historias/0014-acceso-agentes-notas/historia.md`. Falta el checkpoint manual de Carlos/`main`.

## Cerradas

- [x] H-009 — Sidebar de notas ocultable con botón: fija en tableta/escritorio, oculta por defecto y flotante en móvil → `historias/h009-sidebar-notas-responsive/historia.md`, `verified` (Carlos, 2026-10-30, confirmado en `synapse.cjhirashi.com` tras el fix de seguimiento §10 del tope de 24vh huérfano).

(ver `.harness/specs/*/spec.md` para el historial previo a la migración — SPEC-0002 a SPEC-0011)

## Migradas desde spec en vuelo (2026-10-28)

> `specs/0012-propiedades-estilo-obsidian/spec.md` y
> `specs/0013-acceso-agentes-api/spec.md` quedaron `superseded-por-backlog`:
> `AGENTS.md` nunca se actualizó al migrar a Slice Development (2026-10-25),
> así que ambas se siguieron elicitando como spec completa en vez de historia.
> Ningún código fue escrito para ninguna de las dos (solo `spec.md`/`plan.md`/
> `tasks.md`) — se preserva el contenido original íntegro ahí mismo (no se
> transcribe, para no perder fidelidad de lo ya aprobado). El 2026-10-28 se
> partió cada spec en slices demostrables (arriba) a pedido de Carlos — ver
> `historias/0013-acceso-agentes-api/historia.md` (H-002.x) y, en la rama
> `feature/0012-propiedades-obsidian`, `historias/0012-propiedades-estilo-obsidian/
> historia.md` (H-001.x). No se migran SPEC-0010 (enmienda 3 / RF-066, en vuelo
> con código real y commits) ni SPEC-0011 (ya mergeada).
