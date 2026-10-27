---
titulo: Método del arnés — Slice Development
tipo: metodo
estado: piloto-v0.1
version_arnes: 0.1
base: reemplaza a SDD Anchored v1.9 (`skills/sdd-anchored/references/method.md`)
  para los proyectos piloto synapse y design-html — ver §12 Procedencia
---

# Método del arnés — `.harness/` (Slice Development)

> Plantilla de piloto. Copiar a `<proyecto>/.harness/method.md` sin cambios
> (es agnóstico de proyecto). Lo específico del proyecto vive en
> `constitution.md`, sin cambios respecto a SDD Anchored.
>
> **Qué cambia contra SDD Anchored v1.9:** la unidad de trabajo deja de ser
> la spec completa (elicitación de todos los `RF-` por adelantado, luego plan
> y tasks de la feature entera) y pasa a ser la **historia / slice
> vertical**: un recorte end-to-end chico y demostrable. El backlog vivo
> (`backlog.md`) reemplaza el catálogo de specs como lista de trabajo
> pendiente; refinar (EARS + plan) solo ocurre al TOMAR una historia, nunca
> antes — así reordenar o descartar es gratis.
>
> **Qué NO cambia:** `constitution.md`/ADR (lo caro de revertir), EARS como
> sintaxis de criterios, severidad Critical/High/Medium/Low, Converge (dos
> corridas limpias seguidas), solución de raíz, doc sincronizada, Directiva
> de Pausa, worktree aislado antes de implementar, las dos capas de contexto,
> el principio "el agente recomienda, el usuario decide".

## §0 · Qué es esto

Este repo trabaja con **Slice Development**: el trabajo vive como un backlog
de historias chicas, no como specs grandes planificadas de punta a punta. Una
historia se refina (criterios + plan) solo cuando se toma, se implementa en
un ciclo driver/navigator paso a paso, y se cierra con su propio gate — nunca
se acumulan 50+ tareas sin que nadie haya visto algo funcionando.

**Navegación:** lee **sólo la sección que necesitas**, nunca el archivo
entero.
- Escribir/reordenar el backlog → §2.
- Tomar una historia (refinar + planear) → §3.
- Ejecutar el ciclo driver/navigator → §4.
- Cerrar una historia (gate/Converge) → §5.
- Revisar un gate → §9.
- Dudas de un término → §10.

**Artefactos** (Constitución Art. 12, sin cambios): por proyecto
`constitution.md`, `method.md`, `memory/{state.md,history.md}`,
`decisions/ADR-*`. Por trabajo pendiente: **`backlog.md`** (nuevo, único
archivo con todas las historias no tomadas). Por historia tomada:
`historias/NNN-slug/{historia.md, plan.md}` (+ `contracts/` si la historia
cruza un contrato). **Nada más.**

---

## §1 · Génesis del proyecto

Idéntico a SDD Anchored — se hace **una sola vez, antes de la primera
historia**. Define la arquitectura *con* el usuario y la registra en
`constitution.md` Art. 2 + un `ADR-`. Greenfield: bucle interactivo
(dominio, escala, integraciones → el agente recomienda estilo de despliegue,
patrón interno, sustratos de integración, topología de agentes; el usuario
decide cada campo). Brownfield: modo alineación (el agente detecta el patrón
ya usado y lo registra, no lo elige).

Principio permanente: **el agente siempre recomienda la mejor alternativa
según las necesidades del proyecto; el usuario decide.**

---

## §2 · Backlog vivo — `backlog.md`

Un solo archivo con **todas** las historias no tomadas, formato
`references/templates/backlog.md`. Cada entrada es **una línea**:

```
- [ ] H-NNN — <resumen de 1 línea, en lenguaje de usuario, no técnico>
```

Reglas:
- **Escribir una entrada no exige refinarla.** No hay EARS, no hay plan, no
  hay estimación — eso llega solo al tomarla (§3). Una historia mal escrita
  en el backlog no cuesta nada corregirla o borrarla.
- **Reordenar y descartar son gratis.** El backlog se reprioriza en cualquier
  momento sin aprobación de nadie más que de quien decide el orden del
  proyecto (normalmente Carlos, o AIRA con autoridad delegada tipo "Modo 2").
- **Tamaño objetivo de una historia:** demostrable por sí sola (el usuario
  puede ver/probar algo al cerrarla) y completable en **una sesión** de
  trabajo continuo. Si al refinarla (§3) resulta que no cabe en una sesión,
  se parte en 2+ entradas de backlog ahí mismo, antes de planear — nunca se
  plane una historia que ya se sabe demasiado grande.
- **Historia huérfana de una spec en vuelo (migración):** ver
  `SKILL.md` → "Convertir un proyecto en vuelo bajo SDD Anchored" — se
  agregan como entradas normales, citando de qué `spec.md` vienen.

Criterio de término de esta sección: no aplica un gate aquí — el backlog
nunca "cierra", es un documento vivo. El primer gate real es Gate 1 (§9),
al tomar una historia.

---

## §3 · Tomar una historia — refinamiento + plan

Al tomar `H-NNN` del backlog (nunca antes):

1. Crea `historias/NNN-slug/` con `historia.md` (`references/templates/
   historia.md`) y `plan.md` dentro.
2. **Refinamiento EARS corto, interactivo con el usuario** — mismo espíritu
   que Fase 1 de SDD Anchored pero acotado a ESTA historia: preguntas
   enfocadas por áreas relevantes a la historia (nunca 30 de golpe),
   propuestas de mejora con su porqué, alternativas con contrapartidas. El
   usuario decide cada propuesta (acepta/ajusta/rechaza); el rechazo se
   registra en `historia.md §Descartes`. Se repite hasta `[NEEDS
   CLARIFICATION] = 0` y el usuario confirma "así es".
3. **Plan de ESA historia solamente** (no del proyecto, no de un épico): qué
   componentes del patrón de arquitectura tocar, contratos si aplica,
   estrategia de prueba, pasos TDD ordenados (ver §4), y si toca documentación
   del mapa (Art. 11) — igual que `plan.md §Impacto` de SDD Anchored, a
   escala de historia.
4. Fija `covers` en el front-matter de `historia.md`: globs de archivos que
   esta historia posee — mismo mecanismo de anclaje/drift de SDD Anchored,
   sin cambios.

**⏸ GATE 1** — §9.

---

## §4 · Ciclo Driver/Navigator

Reemplaza la Fase 4 "Implement & Validate" de SDD Anchored con roles
explícitos por turno, tomado del par-programming clásico pero con 3 alarmas
que cualquiera de los dos roles puede levantar en voz alta:

**Driver** (normalmente modelo rápido, §7): implementa **un paso TDD a la
vez** — escribe el test (debe fallar) → código mínimo → refactor → commit
cuando el paso queda verde. No se autoaprueba; no amplía el alcance de la
historia sin pasar por §5 Directiva de Pausa.

**Navigator** (humano, o AIRA con autoridad delegada): no escribe código,
vigila el avance del driver y levanta una de estas 3 alarmas explícitas en
cuanto la detecta — nunca espera "a ver si se resuelve sola":
- **Loop** — el driver repite el mismo intento fallido ≥ 3 veces sin cambiar
  de enfoque (heredado del umbral de `vigilar-trabajo-delegado`).
- **Scope creep** — el paso que se está implementando ya no corresponde a
  ningún punto del plan de la historia (`plan.md`).
- **Trampa en tests** — el test se hizo pasar debilitando la aserción, usando
  un mock que no prueba nada real, o cualquier forma de "verde sin haber
  resuelto el problema" (mismo espíritu que el verificador adversarial de
  SDD Anchored, aplicado paso a paso en vez de al final de la tarea).

Tras cada paso verde: commit atómico. No se acumulan varios pasos sin
commitear — si algo sale mal, el costo de descartar es un commit, no una
sesión completa.

---

## §5 · Gate y Converge por historia

Mismo mecanismo de SDD Anchored (`gate/check.sh`, §8), pero su alcance es
**la historia**, no la feature completa — por eso es chico y rápido:

- Verificador adversarial corre tras el último paso verde de la historia:
  busca cómo tumbarla (aserción débil, cobertura baja, contrato roto,
  `historia.md` no sincronizada), severidad explícita Critical/High/Medium/
  Low — Critical bloquea Converge siempre, el resto se prioriza pero no
  detiene por sí solo (tope de 3 amendments o 2h antes de escalar a humano,
  heredado del fix de SDD Anchored v1.8).
- **Converge:** repite driver/navigator→gate hasta que dos corridas
  consecutivas no agreguen hallazgos nuevos.
- **Directiva de Pausa** (sin cambios respecto a SDD Anchored): si un
  supuesto de `historia.md`/`plan.md` resulta inviable a medio ciclo, se
  detiene el código, se edita el documento con la restricción real y la
  solución de raíz, revisión humana por *git diff*, y solo tras aprobación
  se regeneran los pasos afectados. Prohibido el parche silencioso.

### Cierre de historia (Session-End)

Idéntico formato de 5 partes de SDD Anchored (Claim/Evidencia/Línea
base/Gaps/Riesgo residual/Próximo paso) en `memory/history.md`, a escala de
historia. `estado:` de `historia.md` → `implemented`/`verified`.
**Checkpoint demostrable:** antes de marcar `verified`, el usuario (o quien
tenga autoridad delegada) vio o probó el resultado funcionando — no solo leyó
el gate en verde. Este es el criterio que el piloto debe cumplir (ver
`SKILL.md` → criterios de verificación): al menos 2 checkpoints así por
piloto, no solo al cierre final.

---

## §6 · EARS — sintaxis de los criterios de aceptación

Sin cambios respecto a SDD Anchored. Forma genérica (orden fijo): `MIENTRAS
<estado>, CUANDO <disparador>, el <sistema> DEBE <respuesta>`.

| Patrón | Plantilla |
|---|---|
| Ubicuo | `El sistema DEBE <respuesta>.` |
| Estado | `MIENTRAS <estado>, el sistema DEBE <respuesta>.` |
| Evento | `CUANDO <disparador>, el sistema DEBE <respuesta>.` |
| Opción | `DONDE <característica presente>, el sistema DEBE <respuesta>.` |
| No deseado | `SI <fallo/condición> ENTONCES el sistema DEBE <respuesta>.` |
| Complejo | combinación de los anteriores. |

Reglas: un criterio = un `DEBE` (o `NO DEBE`). Respuesta **observable y
booleana**. Sin "y/o", "etc.", "según corresponda", "rápido", "amigable". Es
un **requisito** (qué / por qué), **no** pseudocódigo (cómo).

---

## §7 · Split de modelo (formalizado)

Heredado de SDD Anchored §8, formalizado explícito para el ciclo de historia:

- **Modelo fuerte (Opus):** grooming del backlog (si se delega) y
  refinamiento de historia (§3) — es la fase de mayor juicio y la más cara
  de deshacer si sale mal (una historia mal refinada contamina todo su
  ciclo driver/navigator).
- **Modelo rápido (default del proyecto):** rol Driver del ciclo §4 — es
  mecánico, acotado a un paso TDD a la vez, y tiene su propio control
  (test que debe fallar primero, Navigator vigilando).
- **Navigator:** modelo del operador (humano) o AIRA con autoridad delegada
  — no es una elección de modelo del proyecto, es un rol de vigilancia.

Por qué separar: iterar en refinamiento es barato comparado con el costo de
un ciclo driver/navigator completo construido sobre una historia ambigua —
mismo argumento que SDD Anchored usaba para Specify/Plan en Opus.

---

## §8 · La compuerta — `gate/check.sh`

Mismo mecanismo de SDD Anchored §6, sin cambios de bloques fijos (integridad,
trazabilidad, anclaje+docs+raíz, presupuesto) ni de bloques por perfil de
arquitectura. El único ajuste: "Trazabilidad" verifica la tabla de cobertura
de `historia.md` en vez de `tasks.md` — misma exigencia (100% de criterios
con ≥1 paso y ≥1 test), a escala de historia.

---

## §9 · Gates (checklists de revisión)

### Gate 0 — ¿esta historia entra al backlog o es prompt directo?
Misma rúbrica de SDD Anchored §2, sin cambios: cambios triviales/<5min sin
decisión de diseño van por prompt directo, cero artefactos. En la duda, pasa
al backlog.

### Gate 1 — salida de refinamiento (§3)
La historia se co-definió con el usuario · el agente propuso mejoras y
alternativas · los rechazos están en `historia.md §Descartes` · el usuario
dijo **"así es"** · cada criterio en EARS booleano · `[NEEDS CLARIFICATION]
= 0` · `plan.md` de la historia completo (componentes, contratos si aplica,
estrategia de prueba, pasos TDD ordenados) · sin conflicto con la
Constitución.

### Gate 2 — Converge de la historia (§5)
Dos corridas consecutivas del verificador sin hallazgos nuevos · 0
hallazgos Critical sin resolver · commits citan `H-NNN` · solución de raíz
(sin *workarounds*, sin `TODO`/`FIXME` sin ticket) · docs sincronizadas si
la historia tocó superficie observable · **checkpoint demostrable** cumplido
(el usuario vio/probó el resultado) · `memory/state.md`/`history.md`
actualizados · aprobación humana del PR (o autoridad delegada explícita,
"Modo 2").

---

## §10 · Glosario

- **Historia / slice vertical** — unidad de trabajo: recorte end-to-end
  chico y demostrable, completable en una sesión.
- **Backlog (`backlog.md`)** — lista viva de historias no tomadas, sin
  refinar. Reordenar/descartar es gratis.
- **Refinamiento** — EARS + plan de UNA historia, solo al tomarla (§3).
- **Driver / Navigator** — roles del ciclo de implementación (§4); Navigator
  vigila 3 alarmas explícitas (loop, scope creep, trampa en tests).
- **Checkpoint demostrable** — evidencia de que el usuario vio/probó el
  resultado antes del cierre, no solo leyó el gate en verde.
- **Anchor / `covers`** — igual que SDD Anchored: globs de los archivos que
  una historia posee, base de detección de drift.
- **Converge** — igual que SDD Anchored: repetir ciclo→gate hasta 2 corridas
  sin hallazgos nuevos, a escala de historia.
- **Severidad de hallazgo** — Critical/High/Medium/Low, igual que SDD
  Anchored; Critical bloquea Converge siempre.
- **`superseded-por-backlog`** — estado de un `spec.md` de SDD Anchored cuyas
  tareas restantes se convirtieron a historias de backlog (migración, ver
  `SKILL.md`).

---

## §11 · Eficiencia de tokens (obligatorio)

Sin cambios respecto a SDD Anchored §10: leer por secciones, estado en
disco no en el chat, retornos de una línea de subagentes, `/clear` entre
tareas no relacionadas, presupuestos (`memory/state.md` ≤ 200 líneas), un
canon por hecho, dos capas de contexto (`CLAUDE.md` mínimo siempre cargado;
`AGENTS.md`/`constitution.md`/`backlog.md`/`decisions/` bajo demanda), y
confirmar reglas duras tras `/compact`.

---

## §12 · Procedencia

**Origen (2026-10-24):** Carlos compartió el video "Me equivoqué, NO uses
Spec Driven Development" (HolaMundoDev) tras malestar repetido con specs/
planes inflados bajo SDD Anchored — caso real: synapse SPEC-0010, 140 tareas
planificadas 100% por adelantado, replanificada 2 veces a medio camino por
descubrimiento tardío de alcance. Evaluación de mérito completa (qué del
video es válido, qué no aplica a los bloqueos reales de esos días, qué no
prueba su demo) en `synthesis.bitácora-de-actividades`, entrada 2026-10-24.

**Qué se tomó del video:** backlog vivo de historias chicas en vez de specs
grandes, refinamiento solo al tomar la historia (no antes), ciclo
driver/navigator con alarmas explícitas, checkpoints demostrables tempranos
en vez de una sola demo al final.

**Qué se conservó de SDD Anchored sin cambios:** `constitution.md`/ADR, EARS,
severidad de hallazgos, Converge, solución de raíz, Directiva de Pausa,
worktree aislado, dos capas de contexto, mecanismo de anclaje/`covers`/drift,
el principio "el agente recomienda, el usuario decide". El video no ataca
estos mecanismos — son los que protegen lo genuinamente caro de revertir
(decisiones de arquitectura, restricciones cruzadas tipo multi-tenant/sync/
auth) y el video nunca los puso a prueba contra ese tipo de restricción.

**Estado:** v0.1 piloto, no promovida sobre `harness/reference/.harness/
method.md` (que sigue en SDD Anchored v1.9). Piloto activo en synapse y
design-html desde 2026-10-25; hira es el siguiente proyecto en la fila tras
validar. Criterios de promoción en `synthesis.planes-de-ejecución-pendientes`.
