---
historia: H-023
estado: confirmado # diseño de AIRA (2026-10-30); P-1..P-3 y C-1..C-9 aprobados por Carlos en Gate 1
---

# Plan H-023 — Sidebar: scroll horizontal + ancho ajustable (escritorio)

Base: rama `feature/h022-scrolls-tematizados` (ambas tocan `notes.css`; se mergean en ese orden).
jsdom no calcula layout: C-1/C-2/C-9 se prueban como contrato de CSS (patrón `rule()` de
`layoutCss.test.ts`) y AIRA los verifica después en navegador real. C-4..C-8 se prueban con eventos.

## Decisiones de diseño

- **Todas las filas del ancho del contenido más ancho (C-2):** `ul.note-tree` pasa a
  `display: grid; grid-template-columns: minmax(max-content, 1fr)`. La columna única mide
  `max(ancho visible, fila más ancha)` y cada `li`/fila se estira a ella, así el fondo de
  hover/selección cubre todo el ancho también con el árbol desplazado. Se mantiene
  `overflow-y: auto` y `overflow-x: auto` (antes `hidden`).
- **Sin elipsis (C-1):** `.note-tree-name` pierde `overflow: hidden` y `text-overflow: ellipsis`
  (conserva `white-space: nowrap`). El atributo `title` ya existente se queda.
- **Escritorio = ventana ≥ 1024 px** (P-1) con `useMediaQuery("(min-width: 1024px)")` (el hook
  existente en `layout/useMediaQuery.ts`).
- **Ancho** (P-2/P-3): constantes `SIDEBAR_MIN = 240`, `SIDEBAR_MAX = 384` (= 160 %),
  `SIDEBAR_STEP = 16`, clave `localStorage` `synapse.sidebar-width`. El ancho se aplica como
  variable CSS `--side-width` en `style` de `.vault-workspace-side` SOLO si es escritorio; la regla
  `.vault-workspace-side` usa `width: var(--side-width, 240px)`. En < 1024 px no se pone la
  variable (conserva 240 / ventana flotante de H-009, cuyo `@media (max-width: 640px)` sigue ganando).
- **Corrección tras verificar en Chromium real (AIRA, 2026-10-30):** `minmax(100%, max-content)` (borrador) NO
  estiraba las filas (la pista no crece sobre el contenedor: filas de 239 px con el texto desbordado); y el asa
  con `right: 0` tapaba la barra vertical del árbol. Quedan `minmax(max-content, 1fr)` y el asa FUERA del borde
  (`right: -6px`, `z-index`); el arrastre también termina con `pointercancel`.
- **Asa:** `<div role="separator" aria-orientation="vertical" tabIndex=0>` como último hijo de
  `.vault-workspace-side` (que pasa a `position: relative`), 6 px de ancho pegada al borde derecho,
  `cursor: col-resize`, `touch-action: none`. Arrastre con `pointerdown` en el asa y
  `pointermove`/`pointerup` en `window` (sin `setPointerCapture`, que jsdom no tiene), `preventDefault`
  en `pointerdown` y clase `is-resizing` en `document.body` durante el arrastre (`user-select: none`,
  cursor `col-resize`) para no seleccionar texto ni disparar clics debajo.
- Estado y persistencia en el hook `useSidebarWidth` (valor validado al leer: no numérico, NaN o
  fuera de rango → 240; escritura tolerante a `localStorage` no disponible).
- `VaultWorkspacePage` conserva el ancho al ocultar/mostrar (el estado vive en la página, no en el
  asa) — C-8.

## Pasos TDD (un commit por paso, citando H-023)

1. **Árbol con scroll horizontal (C-1, C-2, C-3).** Test en `layoutCss.test.ts`: `.note-tree` tiene
   `overflow-x: auto` (ya no `hidden`), `display: grid` y `grid-template-columns: minmax(100%, max-content)`;
   `.note-tree-name` no declara `text-overflow`. Actualiza la aserción vieja de RNF-001 solo si choca
   (debe seguir exigiendo `overflow-y: auto`). Luego CSS mínimo en `notes.css`. Suite de `NoteSidebar`
   y `tree.perf` verdes.
2. **`useSidebarWidth` (C-7, parte de C-8).** Archivo `frontend/src/notes/useSidebarWidth.ts` + test:
   clamp 240–384, valor por defecto 240, lectura validada de `localStorage` (corrupto/fuera de rango → 240),
   `set` persiste, `reset` vuelve a 240.
3. **`SidebarResizeHandle` (C-4, C-5).** `frontend/src/notes/SidebarResizeHandle.tsx` + test: renderiza
   `role="separator"` con `aria-valuenow/min/max` (240/384) y `aria-orientation="vertical"`; arrastre
   con `fireEvent.pointerDown/Move/Up` (usa `clientX`) llama `onChange` con el ancho acotado a 240–384;
   fuera de rango se acota; flechas ←/→ ±16 y Home = 240; doble clic → 240; durante el arrastre
   `document.body` lleva `is-resizing` y se quita al soltar.
4. **Integración (C-4, C-6, C-7, C-8, C-9).** En `VaultWorkspacePage.tsx`: si `isDesktop && sidebarOpen`
   renderiza el asa y pone `--side-width`; si no, ni asa ni variable. Tests en
   `VaultWorkspacePage.test.tsx` (o archivo nuevo `VaultWorkspacePage.resize.test.tsx`): ≥ 1024 px hay
   separador y `--side-width` refleja el ancho; < 1024 px no hay separador ni variable; ocultar y mostrar
   conserva el ancho; el ancho persistido se lee al montar; si la ventana cruza el umbral la variable
   se quita. Mock de `matchMedia` como hacen los tests existentes de H-009. CSS: `.vault-workspace-side`
   `position: relative` + `width: var(--side-width, 240px)`, `.sidebar-resize-handle` y
   `body.is-resizing`. Test de contrato CSS para `position: relative` y la variable (C-9: el panel del
   editor ya es `flex: 1; min-width: 0`, no necesita cambio; la aserción lo confirma).
5. **Cierre.** `historia.md` → `estado: implemented`; mover H-023 en `backlog.md` a «Implementadas,
   pendientes de checkpoint»; entrada Session-End en `memory/history.md` (riesgo residual: layout real y
   arrastre con mouse sin verificar en navegador, lo hace AIRA).

## Estrategia de prueba y verificación

`npx vitest run` dos veces seguidas limpias (intermitentes conocidos: NoteSidebar «Nueva carpeta»,
App.test «/vaults/new»: se reportan, no se debilitan), `npm run typecheck`, `npm run build`.
Verificación en navegador (AIRA, no el driver): scroll horizontal con anidación profunda, hover a
todo el ancho con el árbol desplazado, arrastre 240→384, persistencia tras recargar, sin asa a 800 px.

## Impacto en documentación (Art. 11)

`frontend/src/README.md`: añadir `useSidebarWidth.ts` y `SidebarResizeHandle.tsx` al mapa de `notes/`.
