# .claude/agents/ — binding de Claude Code

Estos archivos son el **binding del arnés a Claude Code**: subagentes que el
`orquestador` invoca. El **manual operativo** de cada rol NO vive aquí — vive en
`.harness/method.md §8`. Cada stub es ~15 líneas: `frontmatter` (`name`,
`description`, `tools`, `model`) + arranque + reglas duras + convención de salida
(una línea + referencia a archivo).

## Conjunto base (mapea 1:1 a `method.md §8`)

| Agente | Rol | model |
|---|---|---|
| `orquestador` | Coordinador — clasifica, sostiene las puertas humanas, delega, cierre | sonnet |
| `autor-de-spec` | Fase 1 · elicitación interactiva → `spec.md` | sonnet |
| `arquitecto` | Fase 2 · `plan.md` conforme al patrón + `covers` | sonnet |
| `implementador` | Fase 4 · TDD, una tarea a la vez | sonnet |
| `revisor` | Verificador adversarial · corre el gate, traza `RF-↔test` | sonnet |
| `explorador` | Búsqueda read-only acotada antes de speccar | haiku |

`revisor` nunca es más débil que `implementador` (lección: implementador en haiku
fabricó evidencia).

## Especialistas de dominio (opcionales, por proyecto)

Añádelos solo si el dominio es estrecho y profundo (p. ej. infra de red). Son
**destinos de delegación acotada** del `orquestador`/`implementador`: una task de un
plan aprobado, no diseñan la solución. Si un subproyecto de una app entra en
desarrollo intenso y justifica su propio especialista, se añade **vía un `ADR-`**.

| Especialista incluido | Cuándo copiarlo | model |
|---|---|---|
| `experto-ux-ui` | **Solo si el proyecto tiene frontend.** Diseña y revisa la UX/UI — aporta flujos y estados en Fase 1/2, revisa la UI contra un estándar profesional (contraste WCAG AA, consistencia, accesibilidad, responsive, microcopy) en Fase 4. No escribe código de producción. | sonnet |

Al copiarlo, rellena su nota "Sistema de diseño — <proyecto>" al final del archivo, y
registra la adopción con un `ADR-` (ver `ADR-003` en `cjhirashi-career`/`hira`).
