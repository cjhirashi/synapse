# Backlog — Synapse

> Lista viva de historias no tomadas. Una línea por historia, sin EARS, sin
> plan, sin estimación — eso llega solo al tomarla (`method.md` §3).
> Reordenar o descartar una entrada de aquí es gratis; no requiere aprobación
> salvo la que el proyecto ya exija para fijar prioridades.

## En curso

- [~] H-002.5 — Ventana de configuración para que Carlos cree/revoque sus propias API keys desde el frontend (corrige el alcance original de SPEC-0013, que las dejaba fuera) → `historias/0013-ui-gestion-api-keys/`, Gate 1 pasado ("así es", 2026-10-28)
- [~] H-003 — Drag & drop de notas/carpetas en la sidebar izquierda → `historias/h003-drag-drop-sidebar/`, Gate 1 pasado ("así es", 2026-10-29), rama `feature/h003-drag-drop-sidebar`

## Por tomar (orden = prioridad — validado por Carlos 2026-10-28)

- [ ] H-001.1 — Panel de propiedades en LECTURA con presentación estilo Obsidian (iconos, sin cabecera, sin scroll) · rama `feature/0012-propiedades-obsidian` · **bloqueada:** Gate 2 (plan técnico) de SPEC-0012 nunca se presentó a Carlos, sigue `pendiente`
- [ ] H-001.2 — Edición de propiedades: menú de tipo por icono + pastillas + añadir/quitar · rama `feature/0012-propiedades-obsidian`
- [ ] H-001.3 — No regresión de SPEC-0010 + fidelidad visual final + documentación de cierre · rama `feature/0012-propiedades-obsidian`
- [ ] H-004.2 — Un agente OpenClaw crea/actualiza/borra notas de su bóveda vía REST (escritura) → Gate 1 pasado ("así es", 2026-10-29); prioridad **máxima**, por encima de todo lo anterior en esta lista; depende de H-004.1 (ya `implemented`/desplegado, ver abajo); mismo borrador en `historias/0014-acceso-agentes-notas/historia.md`

## Implementadas, pendientes de checkpoint de Carlos

- [~] H-002.1 — Crear, listar y revocar API keys de agente → desplegado, ver `historias/0013-acceso-agentes-api/historia.md`
- [~] H-002.2 — Un agente usa su API key para leer bóvedas/notas → desplegado, mismo detalle
- [~] H-002.3 — Revocar una key la invalida de inmediato → desplegado, mismo detalle
- [~] H-002.4 — Resiliencia de API keys + documentación de cierre → desplegado, mismo detalle
- [~] H-004.1 — Un agente OpenClaw lista y lee notas de su bóveda vía REST, sin protocolo CouchDB de cliente (lectura) → Gate 1 pasado ("así es", 2026-10-29: id-only, sin filtro de carpeta); implementado, 1342 tests en verde, desplegado y verificado en vivo (`/openapi.json` de `synapse.cjhirashi.com`); ver `historias/0014-acceso-agentes-notas/historia.md`. Falta el checkpoint manual de Carlos/`main`.

## Cerradas

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
