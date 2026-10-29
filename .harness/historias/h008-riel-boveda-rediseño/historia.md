---
id: H-008
titulo: Riel de bóvedas expandible + chips rellenos con degradado + paleta Tailwind extendida
estado: implemented # Gate 1 pasado (2026-10-29); 6 pasos TDD en verde, build + suite completa OK. Falta checkpoint demostrable (§8) para verified.
covers:
  - frontend/src/notes/VaultRail.tsx
  - frontend/src/notes/VaultRail.test.tsx
  - frontend/src/notes/notes.css
  - frontend/src/vaults/VaultChip.tsx
  - frontend/src/vaults/VaultChip.css
  - frontend/src/vaults/vaultIcon.ts
  - frontend/src/vaults/vaultIcon.test.ts
  - frontend/src/vaults/IconPicker.tsx
  - frontend/src/vaults/IconPicker.test.tsx
  - frontend/src/styles/tokens.css
anchor_commit: ef8feb4
origen: backlog
---

# H-008 — Riel de bóvedas expandible + chips rellenos con degradado + paleta extendida

## 1. Intención (lenguaje de usuario)

Pedido directo de Carlos (2026-10-29, por captura del riel lateral de
bóvedas). Tres piezas confirmadas con él, una por una:

1. El riel (`VaultRail.tsx`) siempre carga **colapsado** (botones redondos,
   como hoy); un botón nuevo arriba lo **expande** a píldoras icono+nombre.
   Igual en móvil/tableta/escritorio — no depende de viewport, es un toggle
   manual, sin recordar el estado entre cargas.
2. El chip de bóveda (`VaultChip`) hoy solo tiñe el 18 % del fondo y pone un
   aro de 2 px del color — Carlos lo quiere **relleno** con el color de la
   bóveda, con un **degradado sutil** (no plano), y el ícono/iniciales en el
   color de **fondo de la app** (se leen "recortados" sobre el relleno).
   Confirmado que aplica **en todos lados** donde aparece `VaultChip`: el
   riel, la lista de bóvedas (`VaultListPage`) y la vista previa del
   selector de ícono (`IconPicker`).
3. La paleta de colores elegibles para una bóveda (`PALETTE` en
   `vaultIcon.ts`) solo tiene 5 (`accent/info/success/warning/danger`).
   Carlos pidió extenderla con una paleta más amplia, sugirió Tailwind.
   Confirmado con él: los 5 colores actuales **ya son** shades exactos de
   Tailwind (`--accent: #0891b2` = cian-600, `--success: #4ade80` = verde-400,
   etc. — shade 400 en tema oscuro, 600 en tema claro, mismo patrón en
   `tokens.css`). Se extiende con las 12 familias de Tailwind que faltan,
   mismo patrón de shade: naranja, amarillo, lima, esmeralda, verde azulado,
   azul, índigo, violeta, púrpura, fucsia, rosa y rosado — **17 colores en
   total**.

## 2. Alcance / fuera de alcance

- Dentro: toggle expandir/colapsar del riel; rediseño relleno+degradado+
  ícono invertido de `VaultChip` (global, las 3 superficies que ya lo usan);
  12 colores nuevos en `PALETTE` con sus tokens en `tokens.css` (ambos
  temas) y su entrada en `COLOR_LABELS`.
- Fuera: cambiar el selector de ícono/glifo (`ICON_SET`, 24 iconos) — solo
  se toca la paleta de **colores**; cambiar el comportamiento de
  `derivedColor` (sigue derivando de entre los colores "derivables" — ver
  §6, decidir si los 12 nuevos entran al set derivable o quedan solo como
  elección manual); tocar la semántica de `accent/info/success/warning/
  danger` en el resto de la UI (botones, alertas, etc.) — esos 5 tokens
  siguen siendo los mismos, solo se les suman 12 compañeros nuevos
  **dedicados a bóvedas**, no reusados como semántica general de la app.

## 3. Criterios de aceptación (EARS booleano)

### Riel expandible
- **C-1:** El riel (`VaultRail`) DEBE mostrar un botón al inicio (antes de
  la lista de bóvedas) que alterna entre colapsado y expandido.
- **C-2:** CUANDO se carga la app (en cualquier viewport: móvil, tableta,
  escritorio), el riel DEBE iniciar siempre colapsado — botones redondos,
  igual que hoy — sin importar el estado que tuviera en una carga anterior.
- **C-3:** CUANDO el usuario expande el riel, cada bóveda DEBE mostrarse
  como una píldora icono+nombre completo de la bóveda (no solo iniciales/
  ícono), en el mismo orden que en colapsado.
- **C-4:** El tooltip de nombre completo (`RailTooltip`, hoy aparece al
  pasar el cursor/enfocar) DEBE seguir funcionando en colapsado; en
  expandido no hace falta (el nombre ya es texto visible) — no debe
  duplicarse información para lectores de pantalla (revisar `aria-label`
  del enlace cuando el nombre ya es contenido visible).
- **C-5:** El toggle DEBE ser operable por teclado y tener nombre accesible
  claro ("Expandir riel de bóvedas" / "Colapsar riel de bóvedas").

### Chip relleno con degradado
- **C-6:** `VaultChip` DEBE pintar su fondo **relleno** con el color de la
  bóveda (elegido o `derivedColor`), con un degradado sutil del mismo color
  (p. ej. `linear-gradient` entre dos tonos derivados del mismo token vía
  `color-mix`, no un token nuevo por color) — ya no el tinte del 18 % + aro
  de hoy.
- **C-7:** El glifo/iniciales dentro del chip DEBEN tomar el color de fondo
  de la app (el token de fondo correspondiente al contexto — revisar cuál
  usa cada superficie: riel vs. tarjeta de la lista vs. vista previa del
  selector), no `--text-primary` como hoy.
- **C-8:** El contraste entre el glifo (color de fondo) y el punto **más
  claro** del degradado DEBE ser ≥ 4,5:1 en ambos temas, para los 17
  colores — extender el test de contraste ya existente
  (`vaultIcon.test.ts`, función `ratio`/`luminance` ya escritas, RF-006) en
  vez de reescribirlo.
- **C-9:** El rediseño se aplica igual en las 3 superficies que usan
  `VaultChip` hoy (`VaultRail`, `VaultListPage`, vista previa de
  `IconPicker`) — un solo componente, no una variante nueva por pantalla.

### Paleta extendida
- **C-10:** `PALETTE` (`vaultIcon.ts`) DEBE tener 17 claves: las 5 actuales
  más `orange/yellow/lime/emerald/teal/blue/indigo/violet/purple/fuchsia/
  pink/rose`. Cada una con su token en `tokens.css` en **ambos** temas,
  mismo patrón de shade que los 5 actuales (400 oscuro / 600 claro,
  valores reales de la paleta Tailwind para esa familia).
- **C-11:** Cada color nuevo DEBE tener su etiqueta en español en
  `COLOR_LABELS` (mismo patrón que los 5 actuales: "Cian", "Azul", etc.).
- **C-12:** El selector de color (`IconPicker`) DEBE mostrar los 17 sin
  cambios de código ahí (ya itera `PALETTE` — confirmar que lo sigue
  haciendo bien con 17 en vez de 5, sin romper el layout del selector).

`[NEEDS CLARIFICATION] = 0`.

## 4. Casos límite y errores

- Bóveda con un color de los 12 nuevos creada antes de esta historia: no
  aplica (no existen aún, es alcance nuevo) — nada que migrar.
- `derivedColor` (color automático sin elección): hoy solo deriva entre
  `accent/info/success/warning` (`danger` excluido a propósito, "lee como
  alerta"). Para los 12 nuevos: **no entran al set derivable** por defecto
  (evita que `derivedColor` se vuelva impredecible con 16 opciones); quedan
  disponibles solo por elección manual en el selector. Si Carlos los quiere
  en el set derivable después, es una corrección aparte — no asumir aquí.
- Contraste insuficiente de algún color Tailwind elegido en algún tema: si
  el shade 400/600 estándar no alcanza 4,5:1 contra el fondo elegido para
  el glifo, ajustar el shade de ESE color específico (p. ej. 500 en vez de
  400) documentándolo en el commit — no bajar el umbral de contraste.

## 5. Descartes

Ninguno — Carlos aprobó el riel+chip ("así es") y confirmó Tailwind como
fuente de la paleta extendida, con el mismo patrón de shade que ya usa el
proyecto (no se le pidió elegir colores uno por uno; se le presenta el
resultado para su checkpoint, §8).

## 6. Plan (de ESTA historia solamente)

- No toca backend ni el modelo de datos de `Vault.icon` (`glifo:color`
  sigue siendo el mismo formato de texto; `color` ahora acepta 17 valores
  en vez de 5, el backend no valida el valor de `color` — solo el frontend,
  confirmar en `vaultIcon.ts`/`parseIcon` que no hay una lista cerrada en
  otro lado que haya que tocar también, p. ej. contratos backend).
- **Tokens:** `styles/tokens.css`, bloque `:root`/tema oscuro y el bloque
  del tema claro — añadir 12 pares de variables nuevas (p. ej.
  `--vault-orange`, `--vault-yellow`, …) con los valores reales de Tailwind
  para shade 400 (oscuro) y 600 (claro) de cada familia. Revisar la
  paleta oficial de Tailwind (no inventar hex a ojo).
- **`vaultIcon.ts`:** `PALETTE` pasa de 5 a 17 claves (los 12 nuevos
  apuntando a los tokens `--vault-*` recién creados); `COLOR_LABELS` con
  las 12 etiquetas en español; `DERIVABLE` sin cambios (solo los 4 de
  siempre, ver §4).
- **`VaultChip.tsx`/`VaultChip.css`:** cambiar `background` de la mezcla al
  18 % a un `linear-gradient` entre dos tonos del mismo `--chip-color` (vía
  `color-mix`, sin tokens nuevos por color); quitar el `box-shadow` de aro;
  `color` del glifo pasa del `--text-primary` al token de fondo que
  corresponda al contexto (revisar `--bg-primary`/`--bg-secondary`/
  `--bg-tertiary` y cuál da mejor contraste de forma consistente en las 3
  superficies — puede requerir que `VaultChip` reciba el token de fondo
  como prop si cada superficie usa uno distinto, en vez de fijarlo a ciegas).
- **`vaultIcon.test.ts`:** extender `RF-006` (hoy prueba el tinte del 18 %)
  para probar el degradado nuevo contra las 17 claves en los 2 temas,
  reusando `parse`/`luminance`/`ratio` ya escritas.
- **`VaultRail.tsx`/`notes.css`:** estado `expanded` (local, `useState`,
  sin persistencia — C-2); botón de toggle al inicio del `<nav>`; en
  expandido, cada `NavLink` muestra `<VaultChip/>` + `<span>{vault.name}</span>`
  en vez de solo el chip; ancho del riel pasa de 56px fijo a un ancho mayor
  cuando está expandido (CSS, transición suave si es barato).
- Estrategia de prueba: `VaultRail.test.tsx` (toggle, estado inicial
  siempre colapsado, píldoras con nombre en expandido, accesibilidad del
  botón), `vaultIcon.test.ts` (17 claves, contraste del degradado en los 2
  temas), `VaultChip.test.tsx` si existe o se crea (relleno+degradado
  aplicado), `IconPicker.test.tsx` (17 opciones visibles, layout no roto).
- Pasos TDD ordenados (de más aislado a más integrado):
  1. `CHECK:` `vaultIcon.test.ts` rojo — 17 claves en `PALETTE`, tokens
     existen en los 2 temas (extiende el test RF-006 ya existente que
     verifica esto para 5) / `EXPECT:` verde con los tokens en `tokens.css`
     + `PALETTE`/`COLOR_LABELS` ampliados.
  2. `CHECK:` `vaultIcon.test.ts` rojo — contraste del degradado nuevo
     (glifo vs. punto más claro) ≥ 4,5:1 para las 17, en los 2 temas /
     `EXPECT:` verde, ajustando shades puntuales si algún color no alcanza
     (ver §4).
  3. `CHECK:` `VaultChip` (test propio o el de sus consumidores) rojo —
     relleno+degradado, glifo en color de fondo / `EXPECT:` verde con
     `VaultChip.tsx`/`.css` reescritos.
  4. `CHECK:` `IconPicker.test.tsx` rojo si hace falta (17 opciones,
     layout) / `EXPECT:` verde.
  5. `CHECK:` `VaultRail.test.tsx` rojo — toggle, colapsado por defecto
     siempre, expandido muestra nombre, accesibilidad / `EXPECT:` verde.
  6. Build de frontend, regresión completa de frontend (`npm run test:cov`).
- Impacto en documentación (Art. 11): línea en `frontend/src/README.md`
  (riel expandible + paleta de 17) junto a la mención de `vaultIcon.ts`.

## 7. Tabla de cobertura

| Criterio | Paso(s) | Test | Estado |
|---|---|---|---|
| C-1…C-5 (riel) | 5 | `VaultRail.test.tsx` (C-1/C-5 toggle+a11y, C-2 colapsado por defecto, C-3 píldoras con nombre, C-4 sin duplicar nombre ni tooltip) | Done |
| C-6, C-7, C-8, C-9 (chip) | 1, 2, 3 | `vaultIcon.test.ts` (C-8 contraste del degradado 17×2 temas), `VaultChip.test.tsx` (C-6 relleno+degradado sin aro, C-7 glifo=`--bg-secondary`); un solo componente en las 3 superficies (C-9) | Done |
| C-10, C-11, C-12 (paleta) | 1, 4 | `vaultIcon.test.ts` (C-10 17 claves+tokens, C-11 etiquetas únicas), `IconPicker.test.tsx` (C-12 18 radios de color, layout) | Done |

## 8. Checkpoint demostrable

Pendiente — Carlos debe: (1) abrir la app y ver los chips rellenos con
degradado en el riel, la lista de bóvedas y el selector de ícono; (2)
expandir/colapsar el riel y confirmar que siempre carga colapsado; (3)
crear o editar una bóveda y ver los 17 colores disponibles en el selector.
Antes de marcar `verified`.

## 9. Session-End (al cerrar)

- **Claim:** implementados los 12 criterios (C-1…C-12) en 6 pasos TDD (test rojo →
  código mínimo → verde → commit atómico citando H-008): paleta de 17 colores con
  sus tokens `--vault-*`, chip relleno con degradado y glifo recortado, selector con
  17, riel expandible. `estado: implemented` (falta checkpoint demostrable §8 para
  `verified`).
- **Evidencia:**
  - Suite completa de frontend en verde: `node_modules/.bin/vitest run` → **88
    archivos, 1692 tests**; `npm run test:cov` igual, sin fallos de umbral.
  - `npm run build` OK (17,6 s; los avisos de tamaño de chunk son preexistentes).
  - Cobertura de los archivos tocados: `vaultIcon.ts`, `VaultChip.tsx`,
    `IconPicker.tsx` 100 %; `VaultRail.tsx` 100 % líneas / 97,4 % ramas.
  - C-8 verificado numéricamente antes de codificar: los 17 colores con sus shades
    Tailwind estándar (400 oscuro / 600 claro) superan 4,5:1 contra el glifo
    (`--bg-secondary`) en el extremo más claro del degradado; **mínimos: claro 5,28 /
    oscuro 5,83** → §4 (ajuste puntual de shade) **no se activó**.
  - Commits: paso 1 (paleta 17), paso 2 (contraste C-8), paso 3 (chip C-6/C-7),
    fix (degradado sin literales, mezcla hacia `--text-primary`), paso 4 (selector
    C-12), paso 5 (riel C-1…C-5).
- **Gaps:** checkpoint demostrable (§8) pendiente — lo hace Carlos. No se tocó
  backend. `git push`/merge los hace Carlos.
- **Riesgo residual:**
  - El glifo usa `--bg-secondary` porque **las 3 superficies** (riel, `.card-list`,
    `.card-form`) comparten ese fondo (verificado en `global.css`); por eso **no hizo
    falta** la prop de fondo que el plan §6 anticipaba como posible. Si una superficie
    futura monta `VaultChip` sobre otro fondo, el recorte perdería el efecto (no el
    contraste) y habría que introducir esa prop.
  - En tema claro el relleno queda notablemente oscuro (jewel tones): es inherente a
    un glifo claro recortado sobre color sólido con WCAG 4,5:1; §4 prohíbe bajar el
    umbral.
- **Próximo paso:** Carlos abre la app y valida el checkpoint §8 (chips en las 3
  superficies, expandir/colapsar el riel, 17 colores en el selector); luego
  `verified`, push y merge.
