# CLAUDE.md

Contexto de proyecto: **lee `AGENTS.md`** (mapa del repo).
Cómo trabajamos: el arnés vive en **`.harness/`** — empieza por `.harness/method.md §0`
y respeta `.harness/constitution.md`.

Protocolo de arranque:
1. `.harness/gate/check.sh` — si cierra la compuerta, PARA y reporta.
2. Lee `.harness/memory/state.md` (correcciones del usuario arriba).
3. Ojea `.harness/specs/`.

## Reglas duras (no negociables, aplican SIEMPRE — también a "arregla esto"/"corrige X")

- **Aplica la rúbrica de `method.md §2` antes de tocar un archivo.** Una petición que
  suena urgente o pequeña no te exime de clasificarla.
- **En caso de duda, o si "arreglar" implica revisar una decisión ya tomada en un spec
  o ADR (rediseño), entra al carril SDD.** Nunca "prompt directo porque es rápido".
- **No saltes la Fase 1 (Specify)** para nada que no sea trivial por la rúbrica. Un
  `spec.md` de una línea sigue siendo un spec — no una excusa para saltárselo.
- **Área sin `spec.md` que la cubra ≠ vía libre.** Es brownfield sin ancla todavía, no
  luz verde para tocarla sin spec.
- **No te autoapruebas** y no marcas nada `verified`.

Aquí abajo van sólo detalles específicos de Claude Code (hooks, skills, subagentes),
no contexto de proyecto (eso va en `AGENTS.md`).
