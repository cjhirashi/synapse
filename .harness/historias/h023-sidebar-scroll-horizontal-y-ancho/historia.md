---
id: H-023
titulo: Sidebar de archivos con scroll horizontal y ancho ajustable en escritorio
estado: implemented # Gate 1 pasado (Carlos, 2026-10-30: «Así es», P-1..P-3 confirmadas); implementada 2026-10-30 (TDD, 5 pasos)
covers:
  - frontend/src/notes/notes.css
  - frontend/src/notes/NoteSidebar.tsx
  - frontend/src/notes/NoteSidebar.test.tsx
  - frontend/src/notes/VaultWorkspacePage.tsx
  - frontend/src/notes/SidebarResizeHandle.tsx
  - frontend/src/notes/SidebarResizeHandle.test.tsx
  - frontend/src/notes/useSidebarWidth.ts
  - frontend/src/notes/useSidebarWidth.test.ts
  - frontend/src/notes/layoutCss.test.ts
origen: pedido de Carlos 2026-10-30
---

# H-023 — Sidebar: scroll horizontal + ancho ajustable (escritorio)

## 1. Intención

La lista de archivos de la bóveda solo tiene scroll vertical y un ancho fijo de
240 px (`.note-sidebar`/`.vault-workspace-side`, `notes.css`; el árbol fija
`overflow-x: hidden`). Con carpetas anidadas o nombres largos no se alcanza a
leer el nombre completo. Debe poder desplazarse en horizontal y, en escritorio,
ensancharse arrastrando su orilla con el mouse.

## 2. Alcance / fuera de alcance

- Dentro: árbol de notas con scroll horizontal; asa de arrastre en la orilla
  derecha de la sidebar en escritorio.
- Fuera: móvil/tableta (la sidebar conserva 240 px / ventana flotante de H-009);
  el riel de bóvedas; el estilo de las barras (H-022).

## 3. Decisiones de producto (propuestas de AIRA, confirmadas por Carlos 2026-10-30)

- **P-1:** «escritorio» = ventana ≥ 1024 px de ancho (por ancho, no por tipo de
  puntero: lección de H-021). Por debajo no hay asa.
- **P-2:** rango de ancho 240 px (el actual) a 384 px (160 %). No se puede
  hacer más angosta que hoy.
- **P-3:** el ancho elegido se recuerda entre sesiones (`localStorage`); doble
  clic en el asa vuelve a 240 px.

## 4. Criterios de aceptación (EARS booleano)

- **C-1:** CUANDO una fila del árbol (por anidación o nombre largo) excede el
  ancho visible, el árbol DEBE mostrar scroll horizontal y el nombre completo
  DEBE poder leerse desplazando; las filas NO DEBEN truncarse con elipsis.
- **C-2:** El fondo de hover/selección de las filas DEBE cubrir al menos todo
  el ancho visible, también con el árbol desplazado.
- **C-3:** El scroll vertical, el arrastrar-y-soltar (H-003) y las acciones de
  fila NO DEBEN regresionar (suite verde).
- **C-4:** MIENTRAS la ventana sea ≥ 1024 px y la sidebar esté visible, DEBE
  existir un asa (`role="separator"`) en su orilla derecha con cursor
  `col-resize`; arrastrarla con el mouse DEBE cambiar el ancho entre 240 y
  384 px, sin seleccionar texto ni disparar clics por debajo.
- **C-5:** El asa DEBE poder operarse con teclado (flechas ←/→ ±16 px, Inicio
  = 240) y exponer `aria-valuenow/min/max`.
- **C-6:** MIENTRAS la ventana sea < 1024 px, NO DEBE existir asa y la
  sidebar DEBE conservar su ancho/comportamiento actual (H-009).
- **C-7:** El ancho DEBE persistir entre sesiones, validarse al leerlo (valor
  corrupto o fuera de rango → 240) y reajustarse si la ventana cruza el
  umbral de escritorio.
- **C-8:** CUANDO se oculta y se vuelve a mostrar la sidebar (H-009), DEBE
  conservar el ancho elegido.
- **C-9:** El panel del editor DEBE absorber el cambio de ancho sin scroll
  horizontal de la página.

`[NEEDS CLARIFICATION] = 0` — Carlos confirmó P-1..P-3 (2026-10-30).

## 5. Plan (borrador, se confirma al tomarla)

1. `notes.css`: `.note-tree` → `overflow-x: auto`; `.note-tree-group`/filas con
   `min-width: max-content` y `white-space: nowrap`, retirar elipsis de nombres
   del árbol; fondo de fila `min-width: 100%`.
2. `SidebarResizeHandle.tsx` (nuevo): pointer events con `setPointerCapture`,
   clamp 240-384, teclado, doble clic; estado y persistencia en
   `VaultWorkspacePage.tsx` vía variable CSS `--side-width` en
   `.vault-workspace-side`; `useMediaQuery("(min-width: 1024px)")`.
3. Tests: `NoteSidebar`/`layoutCss` (C-1/C-2), `SidebarResizeHandle` (C-4..C-7).
4. Verificar en navegador real a 1280 px y a 800 px.
