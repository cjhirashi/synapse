---
id: H-024
titulo: Menú de tres puntos en cada fila del árbol para renombrar o borrar notas y carpetas
estado: draft # pendiente Gate 1 (Carlos); pedido 2026-10-30 con captura
covers:
  - frontend/src/notes/NoteSidebar.tsx
  - frontend/src/notes/NoteSidebar.test.tsx
  - frontend/src/notes/TreeRowMenu.tsx
  - frontend/src/notes/TreeRowMenu.test.tsx
  - frontend/src/notes/noteStore.ts
  - frontend/src/notes/noteStore.test.ts
  - frontend/src/notes/notes.css
origen: pedido de Carlos 2026-10-30 (captura del panel «Renombrar / Borrar» bajo el árbol)
---

# H-024 — Menú ⋮ por fila (renombrar / borrar), también carpetas

## 1. Intención

El panel inferior «Renombrar / Borrar» del árbol (`.note-actions`) no resulta
funcional y solo actúa sobre notas: las carpetas no se pueden renombrar ni
borrar (no existe operación de carpeta en `noteStore`; las carpetas se derivan
de las rutas de las notas). Cada fila (nota o carpeta) tendrá un botón de tres
puntos que abre un menú emergente con Renombrar y Borrar.

## 2. Alcance / fuera de alcance

- Dentro: botón ⋮ por fila; menú emergente con Renombrar y Borrar para notas y
  carpetas; operaciones nuevas de carpeta en `noteStore` (renombrar y borrar);
  retirar el panel `.note-actions` y su estado de selección asociado.
- Fuera: «Raíz» (no se renombra ni borra); mover por menú (sigue el arrastre,
  H-003); la papelera y su restauración (ya existen); el menú ⋮ del editor.

## 3. Decisiones de producto (propuestas de AIRA, a confirmar por Carlos)

- **P-1 (renombrar carpeta):** cambia el prefijo de ruta de todas las notas
  activas de la carpeta, conservando la subestructura, con la misma regla de
  unicidad que mover carpeta (H-003): si el nuevo nombre ya existe en esa
  carpeta, avisa y no cambia nada.
- **P-2 (borrar carpeta):** manda TODAS sus notas a la papelera (recuperables
  una a una desde la papelera), con confirmación que dice cuántas notas se
  borrarán. Una carpeta vacía por derivación no existe, así que no hay caso vacío.
- **P-3 (menú):** el ⋮ es visible en la fila con hover o foco, y siempre visible
  en táctil (sin hover); el menú reutiliza el patrón del ⋮ del editor
  (`NoteMenu`: portal, teclado, Esc, clic fuera).
- **P-4 (nombre en edición):** renombrar edita el nombre en línea, en la
  misma fila (Enter confirma, Esc cancela), en vez del formulario del panel.

## 4. Criterios de aceptación (EARS booleano)

- **C-1:** Cada fila de nota y de carpeta (no «Raíz») DEBE mostrar un botón ⋮
  con `aria-haspopup="menu"` y nombre accesible «Acciones de <nombre>».
- **C-2:** CUANDO se activa el ⋮ (clic, Enter o Espacio), el sistema DEBE abrir
  un menú con «Renombrar» y «Borrar» (separado y en estilo de peligro); NO DEBE
  abrir ni seleccionar la nota/carpeta de esa fila.
- **C-3:** El menú DEBE cerrarse con Esc, clic fuera o al elegir una opción, y
  devolver el foco al ⋮; DEBE quedar dentro de la ventana sin ser recortado por
  el scroll del árbol.
- **C-4:** CUANDO se elige «Renombrar» en una nota, el sistema DEBE editar su
  nombre en línea y aplicar el cambio con las reglas de ruta existentes.
- **C-5:** CUANDO se elige «Renombrar» en una carpeta y el nombre es válido y
  libre, el sistema DEBE reubicar todas sus notas activas bajo el nuevo nombre
  conservando la subestructura, y la carpeta DEBE quedar visible y desplegada.
- **C-6:** SI el nombre de carpeta nuevo ya existe en su carpeta padre o es
  inválido, ENTONCES el sistema DEBE mostrar el aviso existente de nombre de
  carpeta y NO DEBE mover ninguna nota.
- **C-7:** CUANDO se elige «Borrar» en una nota, el sistema DEBE llevarla a la
  papelera con el mismo flujo actual (incluida la confirmación de borrador sin
  guardar si es la nota abierta).
- **C-8:** CUANDO se elige «Borrar» en una carpeta, el sistema DEBE pedir
  confirmación indicando el número de notas y, al confirmar, llevar todas a la
  papelera; SI la nota abierta está dentro, DEBE aplicarse la misma
  confirmación de borrador sin guardar y cerrar el editor.
- **C-9:** El panel inferior `.note-actions` y su botón «Renombrar»/«Borrar»
  DEBEN dejar de existir; los atajos F2 y Supr sobre la fila enfocada DEBEN
  seguir funcionando para notas.
- **C-10:** En pantallas sin hover el ⋮ DEBE estar siempre visible y tener un
  área táctil ≥ 28 px; con scroll horizontal del árbol (H-023) DEBE quedar
  anclado visible en el borde derecho de la barra y NO DEBE desplazarse con el
  nombre.
- **C-11:** El drag-and-drop (H-003), la selección, el scroll y el renombrado
  existentes NO DEBEN regresionar (suite verde).

`[NEEDS CLARIFICATION] = 3` — P-1, P-2 y P-4 por confirmar (ver mensaje).
