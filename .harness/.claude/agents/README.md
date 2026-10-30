# .claude/agents/ — binding de Claude Code

Estos archivos son el **binding del arnés a Claude Code**: subagentes que el
`orquestador` invoca. El **manual operativo** de cada rol NO vive aquí — vive en
`.harness/method.md §8`. Cada stub es ~15 líneas: `frontmatter` (`name`,
`description`, `tools`, `model`) + arranque + reglas duras + convención de salida
(una línea + referencia a archivo).

## Conjunto base (mapea 1:1 a `method.md §8`)

| Agente | Rol | model |
|---|---|---|
| `orquestador` | Coordinador — clasifica, sostiene las puertas humanas, delega, cierre | `claude-sonnet-5-5` |
| `autor-de-spec` | Fase 1 · elicitación interactiva → `spec.md` | `claude-opus-5` |
| `arquitecto` | Fase 2 · `plan.md` conforme al patrón + `covers` | `claude-opus-5` |
| `implementador` | Fase 4 · TDD, una tarea a la vez | `claude-haiku-5-5` |
| `revisor` | Verificador adversarial · corre el gate, traza `RF-↔test` | `claude-sonnet-5-5` |
| `explorador` | Búsqueda read-only acotada antes de speccar | `claude-haiku-5-5` |

**Ids explícitos, nunca alias** (`method.md §7`): los alias cortos resuelven a
versiones viejas — `sonnet` → `claude-sonnet-5`, `haiku` →
`claude-haiku-4-5-20251001`, `opus` → `claude-opus-4-8` (telemetría, 2026-10-30
CDMX). Un `model: sonnet` en estos stubs cuenta como defecto de configuración.
`claude-opus-5-5` aún no se usa: HTTP 400 con el `claude` 2.1.197 del PATH del
Gateway (exige ≥ 2.1.280).

Reparto de modelos (ids explícitos, `method.md`): quienes diseñan, especifican y
planifican usan modelo de razonamiento (`autor-de-spec` y `arquitecto` en `claude-opus-5`,
`orquestador` y `experto-ux-ui` en `claude-sonnet-5-5`); quienes implementan código y ejecutan tests
(`implementador`) y quienes leen (`explorador`) usan `claude-haiku-5-5`, porque el plan ya trae el
razonamiento hecho. `revisor` decide un veredicto adversarial y va en `claude-sonnet-5-5`. Si Haiku no
resuelve una falla, el trabajo vuelve a `arquitecto`/`autor-de-spec`, que corrigen el
diseño con modelo de razonamiento, y regresa a Haiku; el implementador no sube de
modelo por su cuenta. Un `model: sonnet|haiku|opus` (alias) cuenta como defecto de
configuración.

**Subagentes ad-hoc:** una llamada `Task`/Agent que no invoque uno de estos roles
**debe** declarar `model` explícito — sin la clave hereda el modelo del padre.
Tabla de defaults por forma de tarea en `method.md §7`. Si la tarea cabe en un rol
de arriba, usa el rol: `explorador` cubre toda la investigación read-only.

## Especialistas de dominio (opcionales, por proyecto)

Añádelos solo si el dominio es estrecho y profundo (p. ej. infra de red). Son
**destinos de delegación acotada** del `orquestador`/`implementador`: una task de un
plan aprobado, no diseñan la solución. Si un subproyecto de una app entra en
desarrollo intenso y justifica su propio especialista, se añade **vía un `ADR-`**.

| Especialista incluido | Cuándo copiarlo | model |
|---|---|---|
| `experto-ux-ui` | **Solo si el proyecto tiene frontend.** Diseña y revisa la UX/UI — aporta flujos y estados en Fase 1/2, revisa la UI contra un estándar profesional (contraste WCAG AA, consistencia, accesibilidad, responsive, microcopy) en Fase 4. No escribe código de producción. | `claude-sonnet-5-5` |

Al copiarlo, rellena su nota "Sistema de diseño — <proyecto>" al final del archivo, y
registra la adopción con un `ADR-` (ver `ADR-003` en `cjhirashi-career`/`hira`).
