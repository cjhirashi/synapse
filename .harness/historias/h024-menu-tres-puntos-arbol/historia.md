---
id: H-024
titulo: Menú de tres puntos en cada fila del árbol para renombrar o borrar notas y carpetas
estado: refined # Gate 1 pasado (Carlos, 2026-10-30: P-1 y P-2 confirmadas, más confirmación obligatoria en todo borrado); P-4/P-5 por defecto de AIRA sin objeción; pedido 2026-10-30 con captura
covers:
  - frontend/src/notes/NoteSidebar.tsx
  - frontend/src/notes/NoteSidebar.test.tsx
  - frontend/src/notes/TreeRowMenu.tsx
  - frontend/src/notes/TreeRowMenu.test.tsx
  - frontend/src/notes/ConfirmDelete.tsx
  - frontend/src/notes/ConfirmDelete.test.tsx
  - frontend/src/notes/folders.ts
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

## 3. Decisiones de producto (P-1 y P-2 confirmadas por Carlos 2026-10-30; P-3..P-5 propuestas de AIRA)

- **P-1 (renombrar carpeta):** cambia el prefijo de ruta de todas las notas
  activas de la carpeta, conservando la subestructura, con la misma regla de
  unicidad que mover carpeta (H-003): si el nuevo nombre ya existe en esa
  carpeta, avisa y no cambia nada.
- **P-2 (borrar carpeta):** manda TODAS sus notas a la papelera (recuperables
  una a una desde la papelera), con confirmación que dice cuántas notas se
  borrarán. Una carpeta vacía por derivación no existe, así que no hay caso vacío.
- **P-2b (confirmación, Carlos 2026-10-30):** TODO borrado desde el árbol (nota
  o carpeta, por menú, por Supr o desde el ⋮ del editor) pide primero una
  confirmación explícita, para que nada se borre por error. La respuesta segura
  (Cancelar) es la enfocada y la de Esc.
- **P-3 (menú):** el ⋮ es visible en la fila con hover o foco, y siempre visible
  en táctil (sin hover); el menú reutiliza el patrón del ⋮ del editor
  (`NoteMenu`: portal, teclado, Esc, clic fuera).
- **P-4 (nombre en edición):** renombrar edita el nombre en línea, en la
  misma fila (Enter confirma, Esc cancela), en vez del formulario del panel.
- **P-5 (alcance del nombre):** el texto editado es el nombre dentro de la
  misma carpeta; un `/` en él se rechaza como inválido. Mover entre carpetas
  sigue siendo por arrastre (H-003). Esto reemplaza el formulario actual
  «Ruta de la nota», que permitía mover escribiendo una ruta.

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
- **C-7:** CUANDO se elige «Borrar» en una nota, el sistema DEBE mostrar un
  diálogo de confirmación con el nombre de la nota y la aclaración de que irá a
  la papelera, y SÓLO al confirmar llevarla a ella; Cancelar o Esc NO DEBEN
  borrar nada. SI es la nota abierta con borrador sin guardar, DEBE además
  aplicarse la confirmación de cambios sin guardar ya existente.
- **C-8:** CUANDO se elige «Borrar» en una carpeta, el sistema DEBE mostrar un
  diálogo con su nombre y el número de notas (incluidas las de subcarpetas)
  que irán a la papelera, y SÓLO al confirmar llevarlas todas; SI la nota
  abierta está dentro, DEBE aplicarse la confirmación de borrador sin guardar
  y cerrarse el editor.
- **C-8b:** El diálogo de borrado DEBE enfocar «Cancelar» al abrirse, cerrarse
  con Esc como Cancelar, devolver el foco a la fila de origen, y TODO camino de
  borrado desde el árbol (menú ⋮, Supr y el ⋮ del editor) DEBE pasar por él.
- **C-9:** El panel inferior `.note-actions` y su botón «Renombrar»/«Borrar»
  DEBEN dejar de existir; los atajos F2 y Supr sobre la fila enfocada DEBEN
  seguir funcionando para notas.
- **C-10:** En pantallas sin hover el ⋮ DEBE estar siempre visible y tener un
  área táctil ≥ 28 px; con scroll horizontal del árbol (H-023) DEBE quedar
  anclado visible en el borde derecho de la barra y NO DEBE desplazarse con el
  nombre.
- **C-11:** El drag-and-drop (H-003), la selección, el scroll y el renombrado
  existentes NO DEBEN regresionar (suite verde).

`[NEEDS CLARIFICATION] = 0` — Carlos confirmó P-1, P-2 y la confirmación obligatoria (2026-10-30); P-4/P-5 siguen como propuestas sin objeción.
