---
id: H-010
titulo: Cabecera del editor en 3 filas + barra de formato Markdown (negritas, cursivas, H1-H4, listas)
estado: pendiente # Gate 1 NO pasado — criterios redactados por AIRA desde la descripción de Carlos (captura + texto, 2026-10-29); falta su "así es" antes de tomarla.
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
lista con viñetas — eso **entra seguro**. Tachado/código en línea/cita/línea
horizontal están disponibles con el mismo esfuerzo (mismo patrón, cero
código de editor nuevo) y caen dentro de "todos los controles de formato que
podamos utilizar en markdown" — **propuestos, a confirmar con Carlos**, no
asumidos. **Fuera de esta propuesta:** insertar enlace (`toggleLinkCommand`
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
  existentes, solo se mueven de fila) y los botones nuevos de la tabla de
  §1 que Carlos confirme.
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
- **C-7:** La Fila 3 DEBE poder desbordar/envolver en pantallas angostas sin
  romper el layout (scroll horizontal o wrap, a decidir en el plan) — hoy
  son ~5 controles, con los nuevos pueden ser 12+.

`[NEEDS CLARIFICATION]`: 2 — (1) ¿cuáles de los 4 controles propuestos
además de lo pedido explícito (tachado, código en línea, cita, línea
horizontal) entran en esta historia?; (2) en pantallas angostas, ¿la Fila 3
hace scroll horizontal o envuelve a una fila adicional? Ambas se resuelven
con tu "así es" (puedes responder dentro del mismo mensaje, no hace falta
otra ronda).

## 4. Casos límite y errores

- Cursor fuera de un párrafo editable (p. ej. dentro de un bloque de código
  o tabla) al pulsar negritas/cursivas: Milkdown ya resuelve esto en sus
  comandos (no aplican si el nodo no acepta esa marca) — no es código nuevo,
  es el comportamiento ya probado de `toggleStrongCommand`/etc.
- Encabezado H1-H4 sobre un párrafo que ya es un encabezado de otro nivel:
  `wrapInHeadingCommand` cambia el nivel (comportamiento ya definido por
  Milkdown, no hay que reimplementarlo).

## 5. Descartes (a confirmar en el "así es")

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

(se llena al implementar)

## 8. Checkpoint demostrable

Carlos debe abrir una nota en modo edición, ver la cabecera en 3 filas sin
que el título quede tapado, y confirmar que cada botón de formato nuevo
aplica lo que dice sobre el texto seleccionado.

## 9. Session-End (al cerrar)

Pendiente — se completa al implementar.
