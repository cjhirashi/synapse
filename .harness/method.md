---
titulo: Método del arnés — SDD Anchored (simplificado)
tipo: metodo
estado: approved
version_arnes: 1.0
---

# Método del arnés — `.harness/`

> Plantilla genérica. Copiar a `<proyecto>/.harness/method.md` sin cambios (es
> agnóstico de proyecto). Lo específico del proyecto vive en `constitution.md`.

## §0 · Qué es esto

Este repo trabaja con **Spec-Anchored Development**: la especificación vive versionada
junto al código y **no muere tras el primer commit**. Un cambio de comportamiento
exige actualizar **primero** la spec; el gate (`gate/check.sh`) impide que código y
spec se divorcien.

**Navegación:** lee **sólo la sección que necesitas**, nunca el archivo entero.
- Clasificar una petición → §2 (rúbrica).
- Redactar/tocar una spec → §3 y §4.
- Revisar un gate → §7.
- Dudas de un término → §9.

**Artefactos** (Constitución Art. 12): por proyecto `constitution.md`, `method.md`,
`memory/{state.md,history.md}`, `decisions/ADR-*`. Por feature `specs/NNN-slug/{spec.md,
plan.md, tasks.md}` (+ `contracts/` si aplica). **Nada más.**

---

## §1 · Génesis del proyecto

Se hace **una sola vez, antes de la primera feature**. Define la arquitectura *con*
el usuario y la registra en `constitution.md` Art. 2 + un `ADR-`.

**Proyecto nuevo (greenfield):** bucle interactivo —
1. El usuario describe el proyecto: dominio, escala esperada, nº de equipos,
   integraciones (APIs, MCPs, eventos), agentes de IA, restricciones.
2. El agente **recomienda**, con su porqué y contrapartidas:
   - **Estilo de despliegue** — monolito modular *(default para producto en
     descubrimiento)* · microservicios · serverless · híbrido.
   - **Patrón interno** — hexagonal · por-capas · Clean · Onion · … El agente
     recomienda el que mejor encaje (para sistemas con agentes de IA + APIs + MCP,
     hexagonal suele ser buena recomendación por aislar lo no determinista — pero es
     recomendación, **no** mandato).
   - **Sustratos de integración** · **topología de agentes** · **capas transversales**.
3. El usuario **decide** cada campo. Decisiones y descartes → `ADR-` (uno por decisión de peso).
4. Se completa el `perfil_arquitectura` y el **mapa de documentación** en `constitution.md`.

**Proyecto existente (brownfield):** **modo alineación** — el agente **detecta** el
patrón que el código y `docs/` ya usan y lo **registra** (no lo elige). Los huecos
(requisito sin test, doc obsoleta) se anotan como features nuevas.

Principio permanente: **el agente siempre recomienda la mejor alternativa según las
necesidades del proyecto; el usuario decide.**

---

## §2 · Rúbrica de decisión (Fase 0) — ¿entra al arnés?

**Se responde SIEMPRE, en voz alta, antes de tocar un archivo** — incluida una
petición que suena a "arregla esto"/"corrige esta falla". Que algo suene urgente o
pequeño no exime de aplicar la rúbrica.

```
¿La corrección exige cambiar una decisión ya tomada en un spec/ADR
 existente (rediseño), no solo el síntoma?                → SÍ → CARRIL SDD.
¿El área tocada NO tiene spec.md que la cubra (sin ancla)
 Y el cambio toca lógica de negocio o un contrato
 (no solo config/infra)?                                  → SÍ → CARRIL SDD
                                                                (spec mínimo primero
                                                                 — ver nota abajo).
¿Cruza servicios, esquema de BD, un endpoint/contrato,
 o toca una capa/frontera nueva?                          → SÍ → CARRIL SDD.
¿Revertir un malentendido costaría > 4 h,
 o el trabajo dura más de una sesión,
 o hay exigencia de auditoría?                            → SÍ → CARRIL SDD.
¿Trivial / bajo riesgo / parche de < 5 min,
 y ninguna de las anteriores aplica?                      → SÍ → PROMPT DIRECTO.
en caso de DUDA                                           → CARRIL SDD.
```

- **Prompt directo:** implementa → `gate/check.sh` → listo. Cero artefactos.
- **Carril SDD:** §3.
- **Área sin ancla (sin `spec.md` que la cubra):** es el estado normal de un proyecto
  recién alineado — no una licencia para saltarse Fase 1. Un spec mínimo (aunque sea
  de un `RF-` y tres líneas) es más barato que un fix que después hay que deshacer.

Regla de oro: **el mínimo rigor que elimina la ambigüedad en este contexto — y en la
duda, el rigor gana.** Frenar en Fase 1 cuesta minutos; deshacer código cuesta sesiones.

---

## §3 · Flujo de 4 fases (carril SDD)

```
[1 Specify] → ⏸ GATE 1 → [2 Plan] → ⏸ GATE 2 → [3 Tasks] → [4 Implement & Validate] → CIERRE
     ▲                                                                │
     └──────────────── Directiva de Pausa (§5) ────────────────────────┘
```

Iterar en Fase 1–2 es **barato**; refactorizar código es caro.

### Fase 1 · Specify — elicitación interactiva con el usuario

La spec **se define con el usuario**, no la redacta el agente en solitario. Bucle
hasta converger:

1. El usuario expone su intención (informal).
2. El agente responde con **tres cosas, no un borrador silencioso**:
   - **Preguntas enfocadas** en tandas cortas, por áreas: dominio · alcance / fuera de
     alcance · actores · datos y contratos de E/S · criterios de aceptación · casos
     límite y errores · no funcionales · seguridad. **Nunca 30 preguntas de golpe.**
   - **Propuestas de mejora** sobre lo que el usuario dijo: mejor formulación (a EARS
     booleano y testeable), un "fuera de alcance" que conviene fijar, un caso límite
     que falta, un antipatrón a evitar.
   - **Buenas prácticas y alternativas** con su porqué (RFC 9457, idempotencia,
     versionado, principios de la Constitución, qué será frontera del sistema).
3. El usuario **decide** cada propuesta (acepta / ajusta / rechaza). El agente
   registra la decisión **y el descarte** (→ `spec.md §6`).
4. El agente refleja el delta de `spec.md` y marca lo abierto como
   `[NEEDS CLARIFICATION: …]`.
5. Se repite hasta: `[NEEDS CLARIFICATION] = 0` · cada `RF-` en EARS booleano · alcance
   y fuera-de-alcance cerrados · **el usuario confirma "así es"**.

El agente **cuestiona y mejora, no transcribe.** Salida: `spec.md` co-definida, con
`covers` borrador en su front-matter.

**`spec.md` — scaffold (6 secciones):** ver `specs/_template/spec.md`.

**⏸ GATE 1** — §7.

### Fase 2 · Plan

`plan.md` (ver `specs/_template/plan.md`) traduce cada `RF-` al **patrón de
arquitectura elegido en la Génesis** (Art. 1–2), de forma concreta:
- Componentes por zona del patrón; **fronteras de salida** con su implementación concreta.
- Contratos: qué archivos en `contracts/` y qué gates de CI aplican.
- Estrategia de pruebas **por zona del patrón**.
- Secuenciación: **tests antes que código**.
- Una sección `### Implementación de RF-NNN` por cada `RF-`.
- **§ Impacto en documentación** *(obligatorio, Art. 11)*: qué documentos del mapa
  vuelve obsoletos esta feature y cómo se actualizan → una fila = una tarea `[doc]`.
  Si no toca doc: declararlo explícito.
- Fija `covers` (front-matter de `spec.md`): globs de archivos que la feature poseerá
  — código, tests **y rutas de doc**.

**⏸ GATE 2** — §7.

### Fase 3 · Tasks

`tasks.md` (ver `specs/_template/tasks.md`): tareas atómicas (≤ 30 min), ordenadas por
dependencia, **test antes que código**, cada una `(cubre RF-NNN)` + su zona (o `[doc]`).
Al final, la **tabla de cobertura** — que **es** la trazabilidad de la feature.

Chequeo automático: 100 % de `RF-`/`RNF-` con ≥ 1 tarea; cada fila de `plan.md
§Impacto` con su tarea `[doc]`.

### Fase 4 · Implement & Validate

Ciclo **TDD, una tarea a la vez**: escribe el test (debe fallar) → código mínimo →
refactor. La IA **no se autoaprueba**.

Tras cada tarea: `gate/check.sh` (§6). El verificador es **adversarial**: su meta es
**demostrar que la tarea está mal** (aserción débil, cobertura baja, contrato roto,
spec no sincronizado, parche). Evidencia = **salida de terminal pegada**.

**Regla de salida de la verificación.** Tras corregir los hallazgos de una ronda, sólo
hay otra ronda si (a) algún hallazgo era **bloqueante o mayor**, o (b) la corrección
**cambia el comportamiento** del código (respuestas, contratos, lógica). Los menores que
sólo tocan documentación, trazabilidad, estilo o un test que endurece lo existente se
corrigen, pasan el gate y la suite y se registran en `history.md`, **sin nueva ronda**;
el usuario decide entonces `verified`. Una evasión deliberada aceptada como residual no
reabre la verificación.

### Cierre (Session-End)

- `gate/check.sh` verde · `anchor_commit` (front-matter de `spec.md`) movido al commit
  de cierre · tabla de cobertura al día · docs del proyecto sincronizadas.
- Entrada **Session-End** en `memory/history.md` (formato fijo, §10).
- `memory/state.md` reescrito (correcciones arriba, backlog, próximo paso).
- `estado:` de `spec.md`/`plan.md` → `implemented`/`verified`.
- **Aprobación humana** del PR.

---

## §4 · EARS — sintaxis de los criterios de aceptación

Forma genérica (orden fijo): `MIENTRAS <estado>, CUANDO <disparador>, el <sistema>
DEBE <respuesta>`. 0..N precondiciones · 0..1 disparador · 1 sistema · 1..N respuestas.

| Patrón | Plantilla |
|---|---|
| Ubicuo | `El sistema DEBE <respuesta>.` |
| Estado | `MIENTRAS <estado>, el sistema DEBE <respuesta>.` |
| Evento | `CUANDO <disparador>, el sistema DEBE <respuesta>.` |
| Opción | `DONDE <característica presente>, el sistema DEBE <respuesta>.` |
| No deseado | `SI <fallo/condición> ENTONCES el sistema DEBE <respuesta>.` |
| Complejo | combinación de los anteriores. |

Reglas: un `RF-` = un `DEBE` (o `NO DEBE`). Respuesta **observable y booleana**. Sin
"y/o", "etc.", "según corresponda", "rápido", "amigable". Es un **requisito** (qué /
por qué), **no** pseudocódigo (cómo). Varios disparadores → parte en varios `RF-`.

---

## §5 · Reglas transversales

- **Solución de raíz, nunca parche** (Constitución Art. 10). Lo diferido va como
  `RF-`/`ADR-` explícito, no como código que se queda.
- **Documentación del proyecto sincronizada** (Art. 11): se planifica en Fase 2, se
  ejecuta como tareas `[doc]`, el gate falla si el *diff* toca superficie observable
  (endpoints, CLI, env, puertos, esquema) sin tocar su documento del mapa.
- **Directiva de Pausa:** si en Fase 4 una asunción de `spec.md`/`plan.md` resulta
  **inviable**: (1) detén el código; (2) edita `spec.md`/`plan.md` con la restricción
  real **y la solución de raíz**; (3) revisión humana por *git diff*; (4) sólo tras
  aprobación, regenera las tareas afectadas y reanuda. **Prohibido el parche silencioso.**
- **El agente siempre recomienda la mejor alternativa; el usuario decide.**
- **Estado en disco, no en el chat.**

---

## §6 · La compuerta — `gate/check.sh`

Compuerta **ejecutable local** (no CI). Se corre al cerrar cada tarea y antes de
`verified`. `exit 0` abierta · `exit 1` cerrada → nada pasa a `verified`.

**Bloques fijos:**
1. **Integridad** — archivos del arnés presentes · herramientas · git.
2. **Trazabilidad** — por cada `spec.md` en `implemented`/`verified`: la tabla de
   cobertura de su `tasks.md` completa (todo `RF-` con ≥1 tarea y ≥1 test) · sin tests
   sin `RF-` · `covers` ⊇ ∪(archivos citados en `plan.md`).
3. **Anclaje + docs + raíz** — drift de `covers` · doc del mapa (Art. 11) no
   actualizada cuando el *diff* toca superficie observable · `TODO`/`FIXME` sin ticket.
4. **Presupuesto** — `memory/state.md` ≤ 200 líneas; aviso si `method.md`/`history.md` se inflan.

**Bloques por perfil de arquitectura** (los servicios y su stack se declaran en
`gate/services.txt`, una línea `nombre:tipo` — `tipo` ∈ `python|node|mcp`): tests del
servicio tocado; si hay `openapi.yaml` committeado → Spectral + oasdiff; MCP → validar
JSON Schema de las *tools* tocadas; eventos → AsyncAPI diff / Specmatic.

**Política dura anti *rubber stamping*:** cobertura ≥ umbral (Art. 3), 0 hallazgos de
lint de contrato, 0 breaking no versionados, 0 filas de cobertura sin `Pass`, 0 parches.

---

## §7 · Gates 0–4 (checklists de revisión)

### Gate 0 — ¿entra al arnés?
Aplicar la rúbrica (§2). Documentar la decisión en una línea.

### Gate 1 — salida de Specify
**Elicitación:** la spec se co-definió con el usuario · el agente propuso mejoras y
buenas prácticas · los rechazos están en §6 · el usuario dijo **"así es"**.
**Value Captain:** impacto en la experiencia en lenguaje natural · decisiones y
descartes explícitos · alcance/fuera-de-alcance sin zonas grises.
**Tech Lead:** cada criterio en EARS booleano con `RF-` único · §3 lista **todas** las
fronteras con su contrato previsto · errores con RFC 9457 · sin conflicto con la
Constitución · `[NEEDS CLARIFICATION] = 0`.

### Gate 2 — salida de Plan
Conforme al **patrón de arquitectura elegido** · lógica de negocio en su zona
correcta · un archivo en `contracts/` por frontera que lo requiera · una sección
`### Implementación de RF-NNN` por cada `RF-` · estrategia de pruebas por zona · **§
Impacto en documentación** completo · `covers` cubre código + tests + doc · aserciones
de seguridad (Art. 5) cubiertas.

### Gate 3 — salida de Tasks *(mayormente automático)*
100 % de `RF-`/`RNF-` en la tabla de cobertura · cada fila de `plan.md §Impacto` con
tarea `[doc]` · tareas ≤ 30 min · orden con test antes que código · `T-NNN` únicos.

### Gate 4 — antes del merge
`gate/check.sh` verde (todos los bloques) · tabla de cobertura sin filas sin `Pass` ·
todo `RF-` con test **anotado** · commits/PR citan los `RF-` · **solución de raíz** (sin
*workarounds*, sin `TODO`/`FIXME` sin ticket) · **docs sincronizadas** (tareas `[doc]`
aplicadas) · Directiva de Pausa (si se usó) con re-aprobación del delta ·
**aprobación humana del PR** · `memory/state.md` y `history.md` actualizados.

---

## §8 · Quién hace qué

No hay manuales de rol aparte. Un mismo agente puede asumir varios roles; en un
proyecto de un operador, el humano es Value Captain **y** Tech Lead.

| Rol | Hace | No hace |
|---|---|---|
| **Coordinador** | Clasifica (rúbrica), sostiene la puerta humana, consolida `tasks.md`, escribe el Session-End | Código; marcar `verified` |
| **Autor de spec** | Conduce la elicitación de Fase 1, redacta `spec.md` | Diseño técnico; código |
| **Arquitecto** | `plan.md` conforme al patrón; fija `covers` | Código de implementación |
| **Implementador** | Código + tests, **una tarea a la vez**, TDD. No se autoaprueba | Ampliar el alcance; marcar `done` |
| **Verificador** (adversarial) | Corre el gate y los tests, traza `RF- ↔ test`, busca cómo tumbar la tarea | Editar el código del implementador |

Patrón **CIV** (Coordinator–Implementor–Verifier) como guía **opcional** si se usan
subagentes: el verificador tiene objetivos opuestos al implementador y bloquea el
merge si encuentra inconsistencias.

---

## §9 · Glosario

- **Anchor / `covers`** — globs (en el front-matter de `spec.md`) de los archivos que
  una feature posee. Base de la detección de drift.
- **`anchor_commit`** — último commit al que la spec fue reconciliada.
- **`anchor_mode`** — `advisory` (drift avisa) | `strict` (drift cierra el gate). Nace
  `advisory`; pasa a `strict` al llegar a `implemented`/`verified`.
- **Drift** — el código de `covers` cambió desde `anchor_commit` sin que la spec cambiara.
- **Directiva de Pausa** — protocolo cuando una asunción de la spec resulta inviable (§5).
- **Rúbrica** — el filtro de Fase 0: ¿ceremonia SDD o prompt directo?
- **`RF-` / `RNF-`** — requisito funcional (criterio EARS) / no funcional. Estables.
- **Modo alineación** — reconstruir una `spec.md` BASELINE del código que ya existe.
- **Modo re-anchor** — parchear una spec cuyo código drifteó, sin reconstruirla.
- **Session-End** — la entrada de cierre en `memory/history.md` (formato en §10).
- **Génesis** — el paso único donde se define/detecta la arquitectura del proyecto (§1).

---

## §10 · Eficiencia de tokens (obligatorio)

- **Lee por secciones, no archivos completos.**
- **Estado en disco, no en el chat.** El progreso va a `memory/`, no al historial.
- **Retornos de una línea** de los subagentes (referencia a archivo, no volcado).
- **`/clear` entre tareas no relacionadas.**
- **Presupuestos:** `memory/state.md` ≤ 200 líneas; entradas de `history.md` ≤ 200.
- **Un canon por hecho.** No repitas la Constitución ni este método en otros sitios.

### Formato fijo de la entrada Session-End (`memory/history.md`)

Para que el monitoreo del arnés sea barato, **cada** cierre de sesión añade **al
principio** de `history.md` una entrada con esta forma exacta:

```markdown
## [YYYY-MM-DD] <feature o tema> — <resultado>
- **Fase alcanzada:** specify | plan | tasks | implement | verified | (prompt-directo)
- **Rebotes del verificador:** <n>
- **Directiva de Pausa:** no | sí (<qué asunción, cómo se resolvió de raíz>)
- **Drift / re-anchor:** no | sí (<specs afectadas>)
- **Anclas movidas:** <spec → commit> | ninguna
- **Gate:** verde | cerrado por <bloque> (<detalle>)
- **Docs actualizadas:** <lista> | ninguna
- **Decisiones de diseño / límites de integración:** <1-3 líneas>
- **Próximo paso:** <acción concreta>
```
