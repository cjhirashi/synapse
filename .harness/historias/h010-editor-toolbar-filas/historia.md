---
id: H-010
titulo: Cabecera del editor en 3 filas + barra de formato Markdown (negritas, cursivas, H1-H4, listas)
estado: implemented # Gate 1 pasado — Carlos confirmó "así es" (2026-10-29) a los criterios y a incluir los 4 controles propuestos (tachado, código en línea, cita, línea horizontal). El criterio de overflow de Fila 3 (scroll horizontal vs. wrap) no lo especificó: AIRA decidió scroll horizontal (ver C-7), a corregir si no le gusta al verlo. Implementada vía Claude Code (Modo 2) el 2026-10-30; falta checkpoint demostrable de Carlos para `verified` (Gate 2), y PR/merge (los hace Carlos).
covers:
  - frontend/src/editor/NoteEditor.tsx
  - frontend/src/editor/NoteEditor.test.tsx
  - frontend/src/editor/MilkdownView.tsx
  - frontend/src/editor/MilkdownView.test.tsx
  - frontend/src/editor/editor.css
origen: backlog
---

# H-010 — Cabecera del editor en 3 filas + barra de formato Markdown

## 1. Intención (lenguaje de usuario)

Pedido de Carlos (2026-10-29, por captura tras el checkpoint de H-009): con
el botón de alternar la sidebar ya metido en `.note-editor-header` (H-009,
corrección C-1), esa fila quedó con demasiados controles encimados —
Visual/Código, Insertar tabla + fila + columna, Guardar, Leer/Editar — y
tapan el título del documento. Pide reorganizar esa cabecera en **3 filas**
dentro de la misma sección de encabezado (no mover nada fuera de ella):

- **Fila 1** (como quedó con H-009, sin cambios): botón de sidebar, Atrás,
  Adelante, migas/título, lápiz Editar / libro Leer, menú ⋮.
- **Fila 2**: Visual, Código y Guardar — visibles en modo edición,
  independientemente de si la vista es Visual o Código.
- **Fila 3**: todos los controles de formato — tabla (ya existente: Insertar
  tabla + Añadir fila + Añadir columna) más los que pide añadir: encabezados
  H1 a H4, negritas, cursivas, lista numerada, lista con viñetas, "todos los
  controles de formato que podamos utilizar en markdown". Visible **solo**
  en modo edición **y** vista Visual (no en Código, no en Leer) — mismo gate
  que ya usa hoy el botón de tabla.

**Alcance de "todos los controles de formato" (propuesta de AIRA, a
confirmar):** el editor usa Milkdown con `@milkdown/preset-commonmark` +
`@milkdown/preset-gfm` (confirmado en `MilkdownView.tsx`). Los comandos que
ya existen ahí, listos para exponer como botón con el mismo patrón que ya
usa la tabla (`commandsCtx`/`TableCommands`), sin escribir lógica de editor
nueva, son:

| Control | Comando Milkdown |
|---|---|
| Negritas | `toggleStrongCommand` |
| Cursivas | `toggleEmphasisCommand` |
| Tachado | `toggleStrikethroughCommand` (gfm) |
| Código en línea | `toggleInlineCodeCommand` |
| Encabezado H1–H4 | `wrapInHeadingCommand(1\|2\|3\|4)` |
| Cita (blockquote) | `wrapInBlockquoteCommand` |
| Línea horizontal | `insertHrCommand` |
| Lista con viñetas | `wrapInBulletListCommand` |
| Lista numerada | `wrapInOrderedListCommand` |
| Tabla (ya existe) | `insertTableCommand`/`addRowAfterCommand`/`addColAfterCommand` |

Carlos pidió explícitamente H1-H4, negritas, cursivas, lista numerada y
lista con viñetas, y confirmó ("así es", 2026-10-29) los 4 propuestos
también: tachado, código en línea, cita, línea horizontal — los 9 entran.
**Fuera de esta historia:** insertar enlace (`toggleLinkCommand`
pide una URL — necesita un diálogo/input nuevo, no es un botón de un clic
como el resto) y lista de tareas/checkbox (no hay comando directo expuesto
por el preset, solo una regla de autoformato al escribir `- [ ]`) — ambos
quedan para una historia aparte si Carlos los quiere.

## 2. Alcance / fuera de alcance

- Dentro: reorganizar `.note-editor-header` de `NoteEditor.tsx` en 3 filas
  (CSS + JSX, sin tocar qué hace cada botón que ya existe); añadir los
  nuevos botones de formato de la tabla de arriba, wireados a Milkdown por
  el mismo mecanismo que ya usa `TableCommands` en `MilkdownView.tsx`
  (ampliar esa interfaz, no crear un mecanismo paralelo).
- Fuera: el editor de código (`CodeView.tsx`, vista "Código" no lleva barra
  de formato — es texto plano); el menú ⋮ (`NoteMenu.tsx`); el botón de
  sidebar y su ubicación (ya resuelto en H-009); insertar enlace y lista de
  tareas (ver nota de alcance arriba); atajos de teclado nuevos para estos
  comandos (Milkdown ya trae los suyos propios vía `strongKeymap`/
  `emphasisKeymap`/etc., no hace falta añadir nada).

## 3. Criterios de aceptación (EARS booleano)

- **C-1:** La Fila 1 de `.note-editor-header` DEBE contener únicamente lo
  que ya tiene hoy tras H-009 (botón de sidebar, Atrás, Adelante,
  migas/título, lápiz Editar/libro Leer, menú ⋮) — ningún control de
  edición/formato se queda ahí.
- **C-2:** MIENTRAS `mode === "edit"` (Visual o Código), el sistema DEBE
  mostrar una Fila 2 con los botones Visual, Código y Guardar (+ el
  indicador "Guardado"/"Cambios sin guardar" que ya existe) — visible en
  ambas vistas de edición, no sólo en Visual.
- **C-3:** MIENTRAS `mode === "edit"` Y la vista sea Visual, el sistema DEBE
  mostrar una Fila 3 con: Insertar tabla + Añadir fila + Añadir columna (ya
  existentes, solo se mueven de fila) y los 9 botones nuevos confirmados de
  la tabla de §1 (negritas, cursivas, tachado, código en línea, H1-H4, cita,
  línea horizontal, lista con viñetas, lista numerada).
- **C-4:** CUANDO la vista es Código, o el modo es Leer, la Fila 3 NO DEBE
  mostrarse (mismo criterio que ya aplica hoy a la tabla, extendido a los
  botones nuevos).
- **C-5:** Cada botón nuevo de Fila 3 DEBE ejecutar el comando Milkdown
  correspondiente de la tabla de §1 sobre la selección/posición actual del
  cursor, con la selección/foco del editor intactos tras el clic (mismo
  comportamiento que ya tiene "Insertar tabla" hoy).
- **C-6:** Cada botón nuevo DEBE tener `aria-label` descriptivo y ser
  operable por teclado (mismo patrón `note-nav-button` que ya usan los
  botones existentes de esa cabecera).
- **C-7 (decisión de AIRA, sin especificar por Carlos — corregible al
  verla):** con tabla + los 9 nuevos, Fila 3 tiene ~12 controles; en
  pantallas angostas DEBE hacer **scroll horizontal** (no envolver a una
  fila adicional, para no empujar el contenido del documento hacia abajo)
  — mismo criterio de "no robar espacio" que ya motivó mover el botón de
  sidebar en la corrección de H-009.

`[NEEDS CLARIFICATION] = 0` — Carlos confirmó "así es" (2026-10-29) a los
9 controles y no objetó la decisión de C-7.

## 4. Casos límite y errores

- Cursor fuera de un párrafo editable (p. ej. dentro de un bloque de código
  o tabla) al pulsar negritas/cursivas: Milkdown ya resuelve esto en sus
  comandos (no aplican si el nodo no acepta esa marca) — no es código nuevo,
  es el comportamiento ya probado de `toggleStrongCommand`/etc.
- Encabezado H1-H4 sobre un párrafo que ya es un encabezado de otro nivel:
  `wrapInHeadingCommand` cambia el nivel (comportamiento ya definido por
  Milkdown, no hay que reimplementarlo).

## 5. Descartes

- Insertar enlace (`toggleLinkCommand`): requiere diálogo con input de URL,
  fuera de alcance de esta historia (los demás controles son de un clic).
- Lista de tareas/checkbox: sin comando directo expuesto por el preset de
  Milkdown instalado (`task-list-item.d.ts` sólo expone una regla de
  autoformato al escribir, no un comando) — se necesitaría más
  investigación/código nuevo, fuera de esta historia.
- Resaltado de estado activo (p. ej. el botón de negritas "encendido" si el
  cursor ya está en texto en negritas, como hace Visual/Código con
  `aria-pressed`): no lo pidió Carlos explícitamente; técnicamente más caro
  que el resto (hay que leer las marcas de la selección en cada cambio del
  editor). Propuesto como posible historia aparte si lo quiere.

## 6. Plan (de ESTA historia solamente) — borrador, se confirma al tomarla

- Ampliar `TableCommands` (`MilkdownView.tsx`) a una interfaz más general
  (p. ej. `EditorCommands`) que añada `toggleBold`, `toggleItalic`,
  `setHeading(level)`, `wrapBulletList`, `wrapOrderedList` (+ las que se
  confirmen de la tabla de §1), cada una llamando `commandsCtx` con el
  comando de Milkdown correspondiente — mismo patrón que ya usan
  `insertTable`/`addRowAfter`/`addColAfter` ahí mismo.
- `NoteEditor.tsx`: dividir el JSX actual de `.note-editor-header` en 3
  elementos de fila (p. ej. `<div className="note-editor-row-1/2/3">`
  dentro del mismo `<header>`); mover los botones existentes a su fila
  según C-1/C-2/C-3; añadir los botones nuevos a la Fila 3 con iconos
  `lucide-react` ya coherentes con el set del proyecto (`Bold`, `Italic`,
  `Heading1`..`Heading4`, `List`, `ListOrdered`, y los que se confirmen:
  `Strikethrough`, `Code`, `Quote`, `Minus`).
  - **Ojo con colisión de nombres:** el archivo ya importa `Code as
    CodeIcon` (vista "Código"); el icono de código en línea (si se
    confirma) necesita su propio alias, p. ej. `Code2 as InlineCodeIcon`.
- CSS (`editor.css`): grid/flex de 3 filas dentro de `.note-editor-header`
  (hoy es una sola fila); resolver C-7 (scroll horizontal vs. wrap) según
  lo que confirme Carlos.
- Estrategia de prueba: `NoteEditor.test.tsx` (fila correcta de cada botón,
  Fila 3 solo en Visual+edit, cada botón nuevo invoca su comando — mock de
  `EditorCommands` igual que ya se mockea `TableCommands` hoy);
  `MilkdownView.test.tsx` si hace falta probar que cada comando nuevo se
  registra/llama correctamente contra una instancia real de Milkdown (igual
  que ya prueba tabla).
- Pasos TDD: se detallan al tomar la historia (§3 del método), orientativo:
  1) refactor de filas sin tocar comportamiento (regresión en verde) → 2)
  `EditorCommands` ampliada en `MilkdownView` → 3) botones nuevos uno por
  uno o en bloque, con su test → 4) CSS de overflow/wrap → 5) build +
  regresión completa.

## 7. Tabla de cobertura

| Criterio | Pasos (commits) | Pruebas | Estado |
|---|---|---|---|
| **C-1** Fila 1 sólo con lo de H-009 | Commit 1 (reestructura; sidebar sigue siendo el 1.er hijo del header con `flex-wrap`, filas 2/3 a ancho completo) | `NoteEditor.test` → «C-1: en lectura no existen Fila 2 ni Fila 3», «C-1: lápiz y ⋮ en Fila 1; Visual/Código/Guardar en Fila 2; tabla en Fila 3», «en edición Visual: 3 filas…» | Cubierto |
| **C-2** Fila 2 en edición (ambas vistas) | Commit 1 | `NoteEditor.test` → «C-2: la Fila 2 (Visual/Código/Guardar/estado) aparece en edición y sigue en Código» | Cubierto |
| **C-3** Fila 3 con tabla + 9 botones | Commits 1 y 3 | `NoteEditor.test` → «C-3/C-6: la Fila 3 lleva la tabla y los 9 botones de formato (aria-label + note-nav-button)» | Cubierto |
| **C-4** Fila 3 oculta en Código/Leer | Commit 1 | `NoteEditor.test` → «C-4: la Fila 3 sólo existe en edición Visual (no en lectura ni en Código)» | Cubierto |
| **C-5** cada botón ejecuta su comando Milkdown | Commits 2 y 3 | `MilkdownView.test` → «comandos de formato (H-010)» (3 tests contra Milkdown real: marcas, H1-H4, bloques) + `NoteEditor.test` → «C-5: cada botón de formato ejecuta su comando de EditorCommands» | Cubierto |
| **C-6** aria-label + teclado | Commit 3 | `NoteEditor.test` → «C-3/C-6: … aria-label + note-nav-button», «C-6: los botones de formato son operables por teclado (Enter)» | Cubierto |
| **C-7** scroll horizontal de Fila 3 | Commits 1 (CSS) y 4 (test) | `NoteEditor.test` → «C-7: la Fila 3 hace scroll horizontal y sus controles no se encogen» (lee `editor.css`) | Cubierto |

Línea base (test:cov, 2026-10-30): `MilkdownView.tsx` 100 % líneas / 94,54 % ramas / 100 % funciones; `NoteEditor.tsx` 98,75 % líneas / 86,94 % ramas; total 97,69 % líneas. Suite completa: **88 archivos, 1714 tests, 0 fallos**; `npm run build` (tsc + vite) exit 0.

## 8. Checkpoint demostrable

Carlos debe abrir una nota en modo edición, ver la cabecera en 3 filas sin
que el título quede tapado, y confirmar que cada botón de formato nuevo
aplica lo que dice sobre el texto seleccionado.

## 9. Session-End (al cerrar)

**[2026-10-30] H-010 — Cabecera del editor en 3 filas + barra de formato Markdown: implemented**

- **Claim:** implementados C-1…C-7 en el worktree `h010-editor-toolbar` (rama
  `feature/h010-editor-toolbar-filas`, **sin merge**): `.note-editor-header` se
  reorganiza en 3 filas sin cambiar el comportamiento de los botones ya
  existentes — Fila 1 (sidebar/Atrás/Adelante/migas/lápiz/⋮) como hijos
  directos del header con `flex-wrap`; Fila 2 (Visual/Código/Guardar/estado) en
  edición en ambas vistas; Fila 3 (tabla ya existente + 9 botones de formato
  nuevos) sólo en edición Visual, con scroll horizontal en angosto. La interfaz
  `TableCommands` se amplió a `EditorCommands` (mismo mecanismo
  `commandsCtx`/`registerCommands`, no uno paralelo) con los 9 comandos de
  commonmark/gfm. Sin backend. `estado: implemented`; falta checkpoint
  demostrable de Carlos para `verified`.
- **Evidencia:** 4 commits citando H-010, ciclo driver/navigator un paso TDD a
  la vez (rojo→código mínimo→verde→commit): (1) reestructura en 3 filas +
  tests estructurales C-1/C-2/C-4 + CSS flex-wrap y scroll de Fila 3; (2)
  `TableCommands`→`EditorCommands` con los 9 comandos + 3 tests contra Milkdown
  real (C-5 a nivel comando); (3) los 9 botones en Fila 3 con iconos lucide
  (`Code2 as InlineCodeIcon` por la colisión con el `Code` de la vista
  "Código") + tests de invocación/aria-label/teclado (C-3/C-5/C-6); (4) test de
  C-7 leyendo `editor.css`. `npm run build` (tsc + vite) exit 0. Suite completa
  `npx vitest run` → **88 archivos, 1714 tests, 0 fallos**; `--coverage` sin
  fallos de umbral.
- **Línea base:** `MilkdownView.tsx` 100 % líneas / 94,54 % ramas / 100 %
  funciones; `NoteEditor.tsx` 98,75 % líneas / 86,94 % ramas; total 97,69 %.
  Tabla §7 con C-1…C-7 en `Cubierto`.
- **Decisión de diseño (sin tocar covers externos):** para no romper el test de
  H-009 que exige que el botón de sidebar sea el **primer hijo** de
  `.note-editor-header` (`VaultWorkspacePage.test.tsx`, fuera de los `covers` de
  H-010), la cabecera se hace `flex-wrap` con la Fila 1 como hijos directos y
  las Filas 2/3 como divis a ancho completo (`flex: 0 0 100%`), en vez de
  envolver también la Fila 1. Así no se edita ningún archivo fuera de los
  `covers` de la historia.
- **Gaps:** C-5 a nivel de botón se prueba con espías de `EditorCommands` (mock),
  no con Milkdown real; el enlace comando→efecto en el editor real está probado
  aparte en `MilkdownView.test` (marcas strong/emphasis/strike_through/
  inlineCode, encabezados H1-H4, nodos blockquote/hr/bullet_list/ordered_list).
  No se tocó backend. Resaltado de estado activo (botón "encendido" según la
  selección) sigue fuera de alcance (§5 Descartes), propuesto como historia
  aparte si Carlos lo quiere.
- **Riesgo residual (Low):** afecta a las pruebas **e2e** de Playwright (no corren
  en el gate de vitest, pero conviene saberlo): `workspace-visual.spec.ts` mide
  `.note-editor-header` como barra de una línea (altura/top); con 3 filas la
  cabecera es más alta en edición y esas mediciones podrían requerir ajuste al
  correr la suite visual. La Fila 1 en lectura conserva ~43px. Ninguna
  aserción de vitest quedó afectada.
- **Nota de entorno:** worktree con `frontend/node_modules` enlazado; `npx
  vitest` aquí resuelve al binario local v2.1.2 correcto (RUN v2.1.2), sin el
  problema del binario global descrito en entradas previas. El hook de
  `graphify` pedía usarlo antes de leer fuentes, pero `graphify query`/`explain`
  requieren aprobación interactiva y en headless quedaron denegados; se leyó
  directamente los archivos exactos del plan.
- **Próximo paso:** checkpoint demostrable (§8) — Carlos abre una nota en
  edición, ve la cabecera en 3 filas sin que el título quede tapado y confirma
  que cada botón de formato aplica lo que dice sobre el texto seleccionado →
  `verified`, PR y merge (los hace Carlos; sin push ni merge del agente).
