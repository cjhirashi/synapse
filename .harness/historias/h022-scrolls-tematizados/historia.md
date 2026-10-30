---
id: H-022
titulo: Scrolls con el formato del tema en toda la app
estado: draft # pendiente Gate 1 (Carlos); pedido 2026-10-30
covers:
  - frontend/src/styles/global.css
  - frontend/src/styles/tokens.css
  - frontend/src/styles/scrollbars.test.ts
  - frontend/src/notes/notes.css
  - frontend/src/editor/editor.css
origen: pedido de Carlos 2026-10-30 (capturas: barra blanca por defecto en la sidebar, en bloques de código y en el panel del editor)
---

# H-022 — Scrolls con el formato del tema

## 1. Intención

Las barras de desplazamiento salen con el aspecto nativo del navegador (pista
blanca, flechas, pulgar gris) y desentonan con el tema oscuro. Todas las barras
de la app deben verse integradas con el tema, en claro y en oscuro.

## 2. Alcance / fuera de alcance

- Dentro: TODA barra de scroll de la app (sidebar, panel del editor, bloques
  de código, tablas, textareas, vista Código, menús, diálogos, tarjetas).
- Fuera: el riel de bóvedas, que oculta su barra a propósito
  (`scrollbar-width: none`, `notes.css`) por el mockup. [decisión de AIRA,
  se mantiene salvo que Carlos pida lo contrario]
- Fuera: el scroll horizontal y el ancho de la sidebar (H-023).

## 3. Criterios de aceptación (EARS booleano)

- **C-1:** El sistema DEBE aplicar un único estilo de barra a toda la app desde
  una regla global (`global.css`), sin duplicar reglas por componente.
- **C-2:** La barra DEBE ser delgada (~8 px), sin flechas, con pista
  transparente o `--bg-secondary`, y pulgar redondeado en `--border-control`
  que pasa a `--text-muted` al pasar el mouse y a `--accent` al arrastrar.
  Los colores DEBEN salir de los tokens del tema (nada de hex nuevos).
- **C-3:** La barra DEBE cambiar con el tema (claro/oscuro/sistema) sin
  recargar, y los controles nativos DEBEN heredar el esquema vía
  `color-scheme` en cada `data-theme`.
- **C-4:** DEBE funcionar en Chromium/Edge/Safari (`::-webkit-scrollbar`) y en
  Firefox (`scrollbar-width`/`scrollbar-color`); en navegadores con soporte
  de las propiedades estándar se usan estas y el WebKit queda como respaldo.
- **C-5:** El riel de bóvedas DEBE seguir sin barra visible (no regresión).
- **C-6:** NO DEBE cambiar el layout: las barras se mantienen en su lugar y
  no deben ocupar más espacio que hoy (en móvil, barras overlay del sistema
  se respetan).
- **C-7:** La pista DEBE mantener contraste de pulgar ≥ 3:1 contra el fondo
  en ambos temas (WCAG 1.4.11).

`[NEEDS CLARIFICATION] = 0` si Carlos confirma el riel (§2).

## 4. Plan (borrador, se confirma al tomarla)

1. Test (`scrollbars.test.ts`, estilo `layoutCss.test.ts`): `global.css`
   contiene regla global con tokens y `color-scheme` en ambos temas; el riel
   conserva `scrollbar-width: none`.
2. `global.css`: `*{scrollbar-width:thin; scrollbar-color: var(--border-control) transparent}`
   + bloque `::-webkit-scrollbar*` (ancho 8 px, thumb con `border-radius`,
   `:hover`/`:active`, `::-webkit-scrollbar-corner`, `-button{display:none}`).
3. `tokens.css`: `color-scheme: dark|light` por tema.
4. Revisar `notes.css`/`editor.css` por reglas que pisen (CodeMirror, bloques
   `pre`, tablas) y verificar en navegador real, ambos temas.
