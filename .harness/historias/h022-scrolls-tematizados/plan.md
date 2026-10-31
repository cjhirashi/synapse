---
historia: H-022
titulo: Plan — Scrolls con el formato del tema
estado: confirmado # borrador de historia.md §4 confirmado leyendo los CSS y tests reales (2026-10-30)
---

# Plan H-022

## 1. Hallazgos al confirmar el borrador

Leídos: `global.css`, `tokens.css`, `notes/notes.css`, `editor/editor.css`, `notes/layoutCss.test.ts`,
`editor/contrast.test.ts`, `test-utils/wcag.ts`.

- **Único override local:** `notes.css` `.vault-rail { scrollbar-width: none }`. Ninguna otra regla de
  `notes.css`/`editor.css`/`AppLayout.css`/CodeMirror declara estilo de barra (sólo `overflow*`); no
  hay estilos de barra en TS. Un estilo global alcanza todo (sidebar, `.vault-workspace-main`, `pre`,
  `.note-table-scroll`, `.cm-scroller`, textareas, diálogos).
- **Mecanismo (ajuste al borrador, C-4):** Chromium ≥ 121 ignora `::-webkit-scrollbar` si el elemento
  declara `scrollbar-color`/`scrollbar-width`. Declarar ambos globalmente perdería el `:hover`/`:active`
  del pulgar (C-2) justo en el navegador principal. Por eso: WebKit/Blink (`::-webkit-scrollbar*`) es la
  vía por defecto y las propiedades estándar van bajo `@supports not selector(::-webkit-scrollbar)`
  (Firefox). Cada navegador usa un único mecanismo, sin conflicto. Firefox no ofrece estados
  hover/arrastre: limitación del navegador, no del estilo.
- **Móvil (C-6), hallado en la revisión del diff (paso 6):** estilizar `::-webkit-scrollbar` en Chrome/
  Android sustituye la barra overlay del sistema por una clásica permanente. Todo el bloque de barras
  (WebKit + `@supports`) va dentro de `@media (hover: hover) and (pointer: fine)` (la misma condición que
  ya usa `NoteEditor` para la vista previa). `color-scheme` queda fuera: es global.
- **Riel (C-5):** con barra clásica de 8 px el contenido del riel de 56 px pasa de 56 a 48 px: los chips
  (34 px, `align-items: center`) y la marca activa (`left: -10px`, calculada sobre el centrado en 56)
  se correrían 4 px. Raíz: la barra ocupa espacio sólo cuando hay desborde. Solución:
  `scrollbar-gutter: stable both-edges` reserva 8 px a cada lado, así el contenido se mantiene centrado
  con y sin desborde (colapsado: 40 px de contenido ≥ 34 px del chip; la marca queda dentro del gutter,
  que está dentro de la caja de relleno, no se recorta). Con barras overlay el gutter es 0 (C-6).
- **Contraste (C-7):** pulgar en reposo = `--border-control` (ADR-006, ≥ 3:1 por diseño). Medido contra
  `--bg-primary/-secondary/-tertiary` en ambos temas lo confirma el test del paso 5. **Conflicto
  detectado:** el hover de C-2 usa `--text-muted`, que en claro (#94a3b8) da ~2,56:1 sobre blanco (menor
  que el reposo, el pulgar «se desvanece» al pasar el mouse) y en oscuro es idéntico a `--border-control`
  (sin cambio visible). Se implementa C-2 literal (aprobado en Gate 1) y se mide sólo reposo/arrastre
  contra C-7; la decisión sobre el hover queda como gap para Carlos (propuesta: `--text-secondary`).

## 2. Componentes tocados

| Archivo | Cambio |
|---|---|
| `styles/global.css` | bloque «Barras de desplazamiento»: `::-webkit-scrollbar*` + `@supports not selector(...)` estándar |
| `styles/tokens.css` | `color-scheme: dark|light` en cada `:root[data-theme]` |
| `notes/notes.css` | `.vault-rail`: fuera `scrollbar-width: none`, entra `scrollbar-gutter: stable both-edges`; comentario actualizado |
| `styles/scrollbars.test.ts` | nuevo, mismo patrón que `layoutCss.test.ts` (parseo del CSS real) |

Sin backend, sin dependencias, sin hex nuevos (`layoutCss.test.ts` RF-006 ya lo exige en `notes.css`;
`scrollbars.test.ts` lo exige en el bloque nuevo de `global.css`). Sin impacto en `docs/` (Art. 11).

## 3. Pasos TDD (un commit atómico por paso, rojo → mínimo → verde)

1. **C-1/C-2 (WebKit):** test: `global.css` tiene `*::-webkit-scrollbar` 8 × 8 px, `-button` oculto,
   `-corner`/`-track` transparentes, pulgar `--border-control` con `--radius-xs`, `:hover` →
   `--text-muted`, `:active` → `--accent`, todo vía `var(--…)`. Código: bloque en `global.css`.
2. **C-4 (Firefox/estándar):** test: bajo `@supports not selector(::-webkit-scrollbar)`,
   `scrollbar-width: thin` y `scrollbar-color: var(--border-control) transparent`; y que fuera de ese
   `@supports` no hay `scrollbar-width`/`scrollbar-color` (si no, Chromium perdería hover/arrastre).
3. **C-3:** test: cada `:root[data-theme]` declara `color-scheme` de su propio tema. Código: `tokens.css`.
4. **C-5/C-1 (riel + unicidad):** test: `.vault-rail` sin `scrollbar-width`, con
   `scrollbar-gutter: stable both-edges` y `overflow-y: auto`; ningún `.css` de `src/` fuera de
   `global.css` declara `scrollbar-*`/`::-webkit-scrollbar`; y la aritmética sobre los valores del CSS
   real: contenido colapsado (56 − 2 × 8 de gutter = 40 px) ≥ chip de 34 px y la marca activa
   (`left: -10px` desde el chip centrado) cae dentro del riel. Código: `notes.css`.
5. **C-7:** test con `test-utils/wcag.ts`: `--border-control` y `--accent` (arrastre) ≥ 3:1 contra las
   tres superficies en ambos temas; comentario del POR QUÉ del hover excluido.
6. **Revisión final del diff:** buscar aserciones débiles / criterios sin cubrir (C-1…C-7), corregir.
   Resultado: C-6 (móvil) no estaba cubierto → test + bloque dentro de `@media (hover: hover) and
   (pointer: fine)`; helper `atRule` sustituye al `while` ilegible del test.

## 4. Verificación

Desde `frontend/`: `npx vitest run` ×2 limpias (intermitentes conocidos: NoteSidebar «Nueva carpeta»,
App.test «/vaults/new» — se reportan, no se tocan), `npm run typecheck`, `npm run build`. Lo que jsdom
no puede (render real de la barra, ambos temas) queda como checkpoint de Carlos.
