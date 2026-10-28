# Backlog — Synapse

> Lista viva de historias no tomadas. Una línea por historia, sin EARS, sin
> plan, sin estimación — eso llega solo al tomarla (`method.md` §3).
> Reordenar o descartar una entrada de aquí es gratis; no requiere aprobación
> salvo la que el proyecto ya exija para fijar prioridades.

## Por tomar (orden = prioridad — validado por Carlos 2026-10-28)

- [ ] H-001.1 — Panel de propiedades en LECTURA con presentación estilo Obsidian (iconos, sin cabecera, sin scroll) · rama `feature/0012-propiedades-obsidian` · **bloqueada:** Gate 2 (plan técnico) de SPEC-0012 nunca se presentó a Carlos, sigue `pendiente`
- [ ] H-001.2 — Edición de propiedades: menú de tipo por icono + pastillas + añadir/quitar · rama `feature/0012-propiedades-obsidian`
- [ ] H-001.3 — No regresión de SPEC-0010 + fidelidad visual final + documentación de cierre · rama `feature/0012-propiedades-obsidian`
- [ ] H-003 — Drag & drop de notas/carpetas en la sidebar (pedido directo de Carlos, 2026-10-27; aún sin refinar)

## Implementadas, pendientes de checkpoint de Carlos

- [~] H-002.1 — Crear, listar y revocar API keys de agente → desplegado, ver `historias/0013-acceso-agentes-api/historia.md`
- [~] H-002.2 — Un agente usa su API key para leer bóvedas/notas → desplegado, mismo detalle
- [~] H-002.3 — Revocar una key la invalida de inmediato → desplegado, mismo detalle
- [~] H-002.4 — Resiliencia de API keys + documentación de cierre → desplegado, mismo detalle

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
