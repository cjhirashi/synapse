---
id: H-009
titulo: Sidebar de notas ocultable con botón, fija en tableta/escritorio y flotante en móvil
estado: implemented # Gate 1 pasado (Carlos, 2026-10-29). Implementada, desplegada y checkpoint visual parcial de Carlos (botón visible y funcional). Corrección pedida sobre C-1 (ubicación del botón, ver §3) en curso. Pendiente re-confirmación visual para pasar a verified (§8).
covers:
  - frontend/src/notes/VaultWorkspacePage.tsx
  - frontend/src/notes/VaultWorkspacePage.test.tsx
  - frontend/src/notes/notes.css
  - frontend/src/layout/AppLayout.css
origen: backlog
---

# H-009 — Sidebar de notas ocultable con botón, fija en tableta/escritorio y flotante en móvil

## 1. Intención (lenguaje de usuario)

Pedido de Carlos (2026-10-29, por captura de la versión móvil de
`synapse.cjhirashi.com`): en móvil, la sidebar de archivos/carpetas de una
bóveda (`NoteSidebar`, dentro de `.vault-workspace-side`) se apila **arriba**
del contenido del documento en vez de quedar a la izquierda. No debe cambiar
de posición — debe seguir a la izquierda, igual que en escritorio/tableta,
solo que en móvil debe empezar **oculta** y abrirse como **ventana
flotante** (superpuesta, sin reordenar ni empujar el editor). Un botón para
mostrarla/ocultarla debe existir en los 3 anchos (móvil/tableta/escritorio);
en tableta y escritorio la sidebar es **fija** (dockeada, como hoy), el
botón solo la muestra/oculta sin volverla flotante.

**Causa raíz confirmada en el código** (no es un bug de posicionamiento
suelto): `notes.css` línea 569, `@media (max-width: 800px) { .vault-workspace
{ flex-direction: column } }` — a esa regla le basta con cambiar la
dirección del flex para que `.vault-workspace-side` (la sidebar) quede
*antes* de `.vault-workspace-main` (el editor) en pantalla, porque en el
marcado (`VaultWorkspacePage.tsx`) la sidebar ya va primero en el DOM. Esa
misma regla agrupa tableta y móvil bajo un solo comportamiento (apilado),
que es lo que esta historia separa.

## 2. Alcance / fuera de alcance

- Dentro: el contenedor `.vault-workspace-side` (cabecera + `NoteSidebar`)
  de `VaultWorkspacePage.tsx`/`Workspace`; su modo de presentación (fija vs.
  flotante) y visibilidad por ancho; un botón nuevo de mostrar/ocultar,
  visible en los 3 anchos; las reglas de `notes.css`/`AppLayout.css` que hoy
  apilan sidebar+editor en `@media (max-width: 800px)`.
- Fuera: el riel de bóvedas (`VaultRail`/chips, ya resuelto en H-008); el
  contenido/orden del árbol de `NoteSidebar` (búsqueda, drag&drop, iconos);
  el editor; cualquier cambio de breakpoint fuera de esta sidebar (p. ej.
  `app-header`, migas del editor).
- Reutiliza patrones ya existentes en el proyecto en vez de crear nuevos:
  `useMediaQuery` (`frontend/src/layout/useMediaQuery.ts`, ya usado por
  `NoteSidebar.tsx` línea 126 con `"(max-width: 640px)"`) para el estado
  responsivo, y el patrón de cierre por click-afuera de `AccountMenu.tsx`
  (`mousedown` + `useRef`, líneas 15-26) para la ventana flotante móvil.

## 3. Criterios de aceptación (EARS booleano)

- **C-1 (corregido 2026-10-29, tras checkpoint visual):** Carlos vio el
  resultado desplegado y pidió mover el botón: la versión original lo
  colocaba en `.vault-workspace-header` (cabecera de la propia sidebar), lo
  que reservaba una columna/gutter fija de 44 px que le restaba ancho al
  documento incluso con la barra colapsada. Corregido: el botón DEBE vivir
  en la fila de título del documento (`.note-editor-header` de
  `NoteEditor.tsx`, la misma fila de Atrás/Adelante/migas/controles de
  edición/menú ⋮), como primer elemento de esa fila, sin columna propia.
  Caso sin nota abierta (vacío, sin fila de título): el botón queda flotando
  sin reservar espacio de layout — mismo criterio de "sin robar ancho al
  documento". Sigue visible en los 3 anchos, con icono
  `PanelLeft`/`PanelLeftClose` y `aria-expanded`/`aria-controls` apuntando al
  contenedor de la sidebar.
- **C-2:** MIENTRAS el ancho de la ventana sea > 640 px (tableta o
  escritorio), el sistema DEBE presentar la sidebar **fija/dockeada** a la
  izquierda del editor (mismo lugar y ancho de 240 px que hoy) cuando está
  visible — nunca como superposición.
- **C-3:** CUANDO se abre una bóveda con el ancho ≤ 640 px (móvil), el
  sistema DEBE iniciar con la sidebar **oculta** por defecto.
- **C-4:** CUANDO se abre una bóveda con el ancho > 640 px (tableta o
  escritorio), el sistema DEBE iniciar con la sidebar **visible** por
  defecto (sin cambio de comportamiento respecto a hoy).
- **C-5:** CUANDO el ancho es ≤ 640 px y el usuario despliega la sidebar con
  el botón de C-1, el sistema DEBE mostrarla como **ventana flotante**
  (superpuesta con `position: fixed`, por encima del editor) anclada a la
  izquierda, sin desplazar ni reordenar `.vault-workspace-main` — el editor
  permanece exactamente donde estaba debajo.
- **C-6:** CUANDO la sidebar flotante (móvil) está abierta y el usuario hace
  click/tap fuera de ella, o selecciona/abre una nota del árbol, el sistema
  DEBE cerrarla automáticamente (mismo patrón de `AccountMenu.tsx`), para
  que no tape el editor tras elegir una nota.
- **C-7:** CUANDO el ancho cambia de ≤ 640 px a > 640 px (o viceversa) con
  la bóveda ya abierta (resize de ventana o rotación de dispositivo), el
  sistema DEBE recalcular el modo de presentación (flotante↔fija) sin
  cerrar la nota abierta ni perder su estado.
- **C-8:** El botón de C-1 DEBE ser operable por teclado (foco visible,
  `Enter`/`Space` lo activan) y la sidebar flotante (móvil) DEBE cerrarse
  con `Escape` cuando tiene el foco dentro — paridad con el resto de
  overlays del proyecto (`AccountMenu`, `NoteTrash`).

`[NEEDS CLARIFICATION] = 0`. **Gate 1 pasado** (`method.md` §9): Carlos
confirmó "así es" sobre estos 8 criterios y el plan (§6) el 2026-10-29, y
añadió una directriz permanente que aplica a esta y a toda sidebar futura
(ver nota abajo).

> **Nota permanente (Carlos, 2026-10-29):** este patrón de 2 modos
> (fija/flotante + oculta por defecto en móvil) debe recordarse para
> cualquier sidebar que se implemente, izquierda o derecha. Existen 2
> *tipos* de sidebar distintos y hay que nombrarlos para poder elegir cuál
> usar en cada caso futuro — documentado como patrón reusable en
> `source.patrones-sidebar-responsive` (wiki de AIRA): **sidebar oculta**
> (este tipo, H-009) vs. **sidebar en riel** (ya implementado en Synapse
> como `VaultRail.tsx`/H-008). Esta historia es la primera aplicación del
> tipo "sidebar oculta".

## 4. Casos límite y errores

- Bóveda sin notas (árbol vacío): el botón y el comportamiento de
  mostrar/ocultar no cambian — se aplican igual aunque el árbol esté vacío.
- Papelera de notas abierta (`showTrash`): no es parte de `.vault-workspace-
  side`, no se ve afectada por esta historia.
- Resize cruzando el breakpoint con la sidebar flotante abierta en móvil
  (C-7): al pasar a > 640 px debe quedar **visible y fija** (no flotante
  cerrada) — continuidad de lo que el usuario ya tenía abierto.
- Teclado/lector de pantalla: el botón nunca debe quedar sin accesible
  (C-8) aunque el modo cambie de fija a flotante.

## 5. Descartes

- Persistir la preferencia de abierto/cerrado entre sesiones
  (`localStorage`): no pedido por Carlos; cada apertura de bóveda usa el
  default por ancho (C-3/C-4). Si lo quiere, es una historia aparte.
- Unificar el breakpoint de 800 px en uno solo de 640 px en todo el
  proyecto: fuera de alcance — esta historia solo separa el comportamiento
  de `.vault-workspace-side`, no toca otros usos de 800 px
  (`AppLayout.css`, `editor.css`).

## 6. Plan (de ESTA historia solamente)

- No toca backend ni datos — es solo frontend (`VaultWorkspacePage.tsx` +
  `notes.css` + el recorte de `AppLayout.css` que depende del apilado).
- Estado nuevo en `Workspace` (`VaultWorkspacePage.tsx`): `sidebarOpen`
  (boolean), inicializado según `useMediaQuery("(max-width: 640px)")` (igual
  patrón que `NoteSidebar.tsx` línea 126) — `false` si coincide (móvil),
  `true` si no (tableta/escritorio). Un `useEffect` que reaccione al cambio
  de ese media query para aplicar C-7 (recalcular sin perder `openId`).
- CSS: separar el `@media (max-width: 800px)` actual de `notes.css` (línea
  569) en dos reglas — una ≤ 640 px (móvil: sidebar `position: fixed`,
  overlay, `z-index` por encima del editor, sin afectar el flujo de
  `.vault-workspace-main`) y otra para > 640 px que mantenga `.vault-
  workspace` en fila (`flex-direction: row`) con la sidebar dockeada,
  visible/oculta por `display`/ancho según `sidebarOpen` — tableta deja de
  heredar el apilado de la regla de 800 px. Revisar si el ajuste de
  `AppLayout.css` línea 167 (`@media max-width: 800px` → scroll del
  `.app-main:has(.vault-workspace)`) sigue aplicando tal cual o debe seguir
  el mismo corte de 640 px.
  Nota de responsividad (viewport exacto de la captura de Carlos: 390×844,
  iPhone): queda dentro del rango ≤ 640 px.
- Botón de alternar en `.vault-workspace-header` (junto al `<h1>` de la
  bóveda): icono `PanelLeft`/`PanelLeftClose` (`lucide-react`, ya en el
  proyecto), `onClick` invierte `sidebarOpen`, `aria-expanded`/`aria-
  controls` apuntando a un `id` nuevo en `.vault-workspace-side`.
- Cierre por click-afuera y `Escape` en móvil: mismo patrón de
  `AccountMenu.tsx` (líneas 15-26, `useRef` + listener de `mousedown` en
  `document`, limpiar en cleanup) — solo activo cuando el modo es flotante
  (≤ 640 px) y `sidebarOpen` es `true`.
- Estrategia de prueba: `VaultWorkspacePage.test.tsx` (el único test
  existente de este componente) — casos nuevos para C-1 (botón presente y
  accesible), C-3/C-4 (default por ancho, mockeando `useMediaQuery` como ya
  se hace para `NoteSidebar`'s `compact`), C-5 (clase/estilo flotante en
  móvil), C-6 (cierra al click afuera / al abrir nota), C-7 (resize no
  pierde `openId`), C-2 (fija en tableta/escritorio, sin overlay).
- Pasos TDD ordenados (orientativo — el plan definitivo se confirma al
  tomar la historia, §3 del método):
  1. `CHECK:` test rojo — botón de alternar existe y tiene
     `aria-expanded`/`aria-controls` / `EXPECT:` verde.
  2. `CHECK:` test rojo — default oculta en ≤ 640 px, visible en > 640 px /
     `EXPECT:` verde (mock de `useMediaQuery`).
  3. `CHECK:` test rojo — en móvil, abrir con el botón aplica el modo
     flotante (clase/atributo distinto al modo fijo) sin mover
     `.vault-workspace-main` / `EXPECT:` verde.
  4. `CHECK:` test rojo — click afuera / abrir nota cierra la flotante en
     móvil / `EXPECT:` verde.
  5. `CHECK:` test rojo — resize cruzando 640 px no pierde `openId` / `EXPECT:` verde.
  6. CSS: separar las reglas de `notes.css`/`AppLayout.css` descritas
     arriba; verificación visual manual en los 3 anchos antes de dar por
     bueno el paso (no hay test de CSS).
  7. Build de frontend, regresión completa de frontend.
- Impacto en documentación (Art. 11): línea en `frontend/src/README.md`
  junto a la mención de `VaultWorkspacePage`/sidebar, describiendo el nuevo
  botón y los 2 modos de presentación.

## 7. Tabla de cobertura

| Criterio | Paso(s) | Test | Estado |
|---|---|---|---|
| C-1 | 1, corrección | `VaultWorkspacePage.test.tsx` «H-009 C-1 (corregido)…» | ✅ Reubicado tras checkpoint (test verde): botón en `.note-editor-header` / flotante en vacío |
| C-2 | 2, 6 | `VaultWorkspacePage.test.tsx` «H-009 C-2…» (contrato de atributos) + verificación visual | ✅ JS verde · 🖼 visual pendiente (checkpoint) |
| C-3 | 2 | `VaultWorkspacePage.test.tsx` «H-009 C-3…» | ✅ Implementado (test verde) |
| C-4 | 2 | `VaultWorkspacePage.test.tsx` «H-009 C-4…» | ✅ Implementado (test verde) |
| C-5 | 3, 6 | `VaultWorkspacePage.test.tsx` «H-009 C-5…» (atributos + orden DOM) + verificación visual | ✅ JS verde · 🖼 visual pendiente (checkpoint) |
| C-6 | 4 | `VaultWorkspacePage.test.tsx` «H-009 C-6…» (×3: click afuera, abrir nota, fija no cierra) | ✅ Implementado (test verde) |
| C-7 | 5 | `VaultWorkspacePage.test.tsx` «H-009 C-7…» | ✅ Implementado (test verde) |
| C-8 | 1, 4 | `VaultWorkspacePage.test.tsx` «H-009 C-8…» (teclado Enter+Space + Escape) | ✅ Implementado (test verde) |

## 8. Checkpoint demostrable

Pendiente — Carlos debe abrir una bóveda en los 3 anchos (móvil, tableta,
escritorio) y confirmar: el botón existe en los 3; en escritorio/tableta la
sidebar sigue fija a la izquierda y el botón solo la oculta/muestra sin
volverse flotante; en móvil arranca oculta y, al abrirla, aparece como
ventana flotante sin mover el editor ni reordenar el layout.

## 9. Session-End (al cerrar)

Implementación vía Claude Code en modo headless (Modo 2, autoridad delegada por
Carlos desde Gate 1), 2026-10-29. Ciclo Driver/Navigator de `method.md` §4, 7
pasos TDD, un commit atómico por paso citando «H-009».

- **Claim:** los 8 criterios EARS (C-1…C-8) quedan implementados en
  `VaultWorkspacePage.tsx` + `notes.css` + `AppLayout.css`. La barra de notas
  tiene botón de alternar (en la cabecera, teclado Enter/Space, `aria-expanded`/
  `aria-controls`), es fija/dockeada y arranca visible en tableta/escritorio
  (> 640 px) y arranca oculta y flota como overlay en móvil (≤ 640 px) sin
  mover el editor, se cierra por click-afuera/abrir-nota/`Escape`, y recalcula el
  modo al cruzar el breakpoint sin perder la nota abierta.
- **Evidencia:**
  - Línea base en verde antes de empezar: `npx vitest run` (desde `frontend/`)
    → `VaultWorkspacePage.test.tsx` 48/48. (La corrida inicial desde la raíz del
    worktree falló con `document is not defined` por CWD equivocada —la config
    `jsdom` vive en `frontend/vitest.config.ts`—, no por código.)
  - 12 tests nuevos «H-009 C-1…C-8» en `VaultWorkspacePage.test.tsx`
    (matchMedia controlable estilo `useTheme.test.tsx` para forzar el ancho y el
    cruce de breakpoint). Archivo: 59/59 verde.
  - `npm run build` (typecheck + vite build) OK.
  - Regresión completa `npx vitest run`: **88 archivos, 1703 tests, 0 fallos**.
  - Verificador adversarial (yo mismo, 2 corridas): sin Critical/High.
    Corrida 1 halló 1 Medium accionable (C-8 sólo probaba Enter, no Space) →
    corregido con test de Space. Corrida 2 sin hallazgos nuevos → **Converge**.
- **Gaps:** C-2 y C-5 dependen de CSS no verificable en jsdom (posición/overlay/
  240 px); los tests fijan el contrato de atributos (`data-open`/`data-floating`)
  y el orden del DOM (editor no reordenado), pero el pintado real queda para la
  verificación visual del checkpoint (§8). No hay test E2E/Playwright nuevo.
- **Riesgo residual:**
  - **Desviación documentada:** el overlay móvil usa `position: absolute` anclado
    a `.vault-workspace` en vez del `position: fixed` que menciona el paréntesis de
    C-5. Razón: con `fixed` al viewport y un `app-header` que hace *wrap* (altura
    variable) no se puede ubicar el drawer bajo el header sin JS ni número mágico,
    y anclar al workspace garantiza que el editor **no se desplace** al abrir
    (requisito observable de C-5). Comportamiento observable intacto; a confirmar
    visualmente.
  - Detalles visuales a revisar en el checkpoint: hueco fijo de 44 px a la
    izquierda del editor en móvil para el botón flotante; aspecto de la barra
    **colapsada** en escritorio (queda sólo el botón en la cabecera); sombra/ancho
    (`min(280px, 85vw)`) del drawer.
  - Sin persistencia de la preferencia abierto/cerrado (Descartes): cada apertura
    y cada cruce de breakpoint reaplican el default por ancho.
- **Próximo paso:** checkpoint demostrable de Carlos (§8) — abrir una bóveda en
  los 3 anchos y validar botón + modos. Si aprueba, pasar `estado:` a `verified`.
  Revisar/push/merge a cargo de AIRA (no hechos aquí por diseño del encargo).

### Corrección C-1 (2026-10-29, tras checkpoint visual en producción)

Carlos vio el resultado desplegado y pidió mover el botón: estaba en
`.vault-workspace-header` (cabecera de la propia barra), lo que obligaba a dejar
siempre visible esa cabecera-asa y reservaba un gutter fijo de 44 px
(`padding-left` en `.vault-workspace-main` ≤ 640 px) que le restaba ancho al
documento incluso con la barra colapsada.

- **Claim:** el botón vive ahora en la **fila de título del editor**
  (`.note-editor-header`, como **primer elemento**) cuando hay nota abierta, y
  **flota** sobre la esquina del panel vacío cuando no la hay — sin reservar
  columna ni gutter. Al cerrar, `.vault-workspace-side` se oculta **entera** (ya
  no hace falta la cabecera-asa). Los modos fija/flotante y el resto de criterios
  (C-2…C-8) no cambian.
- **Arquitectura:** `sidebarOpen`/`isMobile`/toggle siguen en `Workspace`
  (`VaultWorkspacePage.tsx`). Un único componente `SidebarToggle` arma el botón;
  `Workspace` lo pasa a `NoteEditor` por la nueva prop opcional `sidebarToggle:
  ReactNode` (el editor sólo coloca el nodo como primer hijo de su header, no
  conoce la semántica de la barra) y lo renderiza él mismo, con la variante
  `--floating`, en el estado vacío. Elegido «pasar el nodo ya armado» sobre
  «pasar valores+callback» para tener **un solo origen de marcado** del botón
  (aria/icono/etiqueta), ya que debe aparecer también fuera de `NoteEditor`.
- **Evidencia:** 2 commits de la corrección (JSX/relocalización con test C-1
  reescrito; CSS). Test C-1 reescrito fija ambas ubicaciones y que el botón ya
  **no** está en `.vault-workspace-header`. `npm run build` OK. Regresión
  completa `npx vitest run` → **88 archivos, 1703 tests, 0 fallos**. Verificador
  adversarial (2 corridas) sin Critical/High.
- **CSS retirado:** `padding-left: 44px` de `.vault-workspace-main` (el gutter que
  motivó la corrección), las reglas de colapso de la cabecera y el estilo del
  botón viejo `.vault-workspace-toggle`.
- **Riesgo residual (nuevo, Low):** en estados **sin fila de título** internos de
  `NoteEditor` (nota cargando, o nota borrada desde otro dispositivo sin borrador
  → devuelve un `<p>`) no se pinta el toggle; si además la barra está cerrada, no
  hay botón para reabrirla en ese instante. Es raro y transitorio, y hay salida:
  el enlace «Bóvedas» del header de la app permite salir y reentrar, lo que
  reaplica el default por ancho (en escritorio la barra reabre). A validar en el
  checkpoint; si molesta, es un follow-up (pintar el toggle también en esos
  estados).
- **Entorno:** el directorio de trabajo del shell se reinició a la raíz del
  worktree en esta sesión (tomaba el vitest v5 de la raíz, sin jsdom, → `self is
  not defined`); se corrige con `cd frontend` antes de correr la suite.
