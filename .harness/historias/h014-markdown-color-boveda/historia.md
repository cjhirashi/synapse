---
id: H-014
titulo: Rediseño de color tipográfico del markdown renderizado — jerarquía con el color de la bóveda
estado: tomada # Gate 1 pasado — Carlos confirmó "así es" (2026-10-30) a P-1, P-3, P-4, P-5, P-6 tal como se propusieron, y corrigió P-2 (negrita 100%, cursiva más tenue, mismo color complementario) delegando el resto del detalle fino a criterio de AIRA ("tú decide con lógica... armonía visual"). En implementación vía Claude Code (Modo 2).
covers:
  - frontend/src/editor/editor.css
  - frontend/src/vaults/vaultIcon.ts
  - frontend/src/vaults/vaultIcon.test.ts
origen: backlog
---

# H-014 — Rediseño de color tipográfico del markdown renderizado

## 1. Intención (lenguaje de usuario)

Pedido de Carlos (2026-10-30), inmediatamente después de confirmar H-012
(navegación de wikilinks): rediseñar los colores del contenido markdown
renderizado (modo Visual y Lectura) para que se vea más estético — H1-H4
con el color de la bóveda en distintas variantes para jerarquizarlos,
negritas/cursivas con su propio tratamiento, viñetas/números de listas con
algún tratamiento de color, y las líneas divisorias (separador horizontal,
bordes de tabla, borde de cita) más delgadas y en escala de gris puro —
contraste entre contenido (con el color de la bóveda) y estructura
(neutra).

**Lo que existe hoy, confirmado leyendo el código real** (no inventado):
- H1-H3 (`editor.css` línea 955): sólo tienen margen, **sin color propio**
  — heredan `--text-primary` (blanco/negro según tema) de `.ProseMirror`.
  H4 no tiene ninguna regla — usa el tamaño/peso por defecto del navegador.
- Negritas/cursivas: **sin ninguna regla propia** — el navegador aplica
  `font-weight`/`font-style` por defecto, mismo color que el texto normal.
- Listas (`ul`/`ol`/`li`): sólo margen/sangría — viñetas y números en el
  color por defecto del navegador (= color del texto, `--text-primary`).
- Cita (`blockquote`, línea 1265): ya tiene un diseño con color — barra
  izquierda de **3px en `--accent`** (el cian fijo de la app, NO el color de
  la bóveda) + fondo `--accent-soft` + texto `--text-secondary` en cursiva.
  Es un diseño deliberado de SPEC-0010 (R-5), no un olvido — este pedido lo
  reemplaza a propósito.
- Tabla (línea 1306): borde en `var(--border)` (gris neutro ya existente),
  sin grosor especial declarado (1px por defecto).
- Línea horizontal (`<hr>`, recién creable desde H-010): **sin ninguna
  regla propia** — grosor/color por defecto del navegador (suele ser 1-2px
  gris oscuro sólido, inconsistente con el resto del tema).

Cada bóveda ya tiene UN color propio resuelto (`vaultColor`, uno de 17 —
`frontend/src/vaults/vaultIcon.ts`), ya usado en el riel (H-008) y los
iconos de la sidebar (H-006), pero **nunca dentro del documento**. Ya viaja
hasta el editor (`VaultWorkspacePage.tsx` → `NoteEditor` → `MilkdownView`,
mismo mecanismo que resuelve wikilinks) — no hace falta threading nuevo; es
leerlo como variable CSS en el contenedor `.milkdown-view`.

## 2. Alcance / fuera de alcance

- Dentro: color de H1-H4, negritas, cursivas, enlaces (markdown normal
  `[texto](url)` y wikilink), cabecera de tabla, viñetas/números de lista,
  cita, línea horizontal y bordes de tabla — **sólo color/grosor**, no
  tamaño de fuente ni estructura (no se toca el tamaño de los encabezados,
  pedido explícito: "jerarquizar con color", no con tamaño).
- Fuera: bloque de código y código en línea (ya tienen su propio
  tratamiento de `--bg-tertiary`/`--accent-hover`, no mencionado por
  Carlos); estructura de tabla (sólo color/grosor entra, no layout).

## 2.1 Color complementario — calculado, no a ojo (actualización 2026-10-30)

Carlos corrigió P-2: negritas, cursivas y enlaces SÍ quieren color, uno
**complementario** al de la bóveda (no el mismo, para que destaquen sin
competir con los encabezados). Un complementario real requiere el matiz
(hue) exacto de cada color — lo calculé desde los valores hexadecimales de
`tokens.css` (HSL, tema oscuro) y busqué, para cada uno, el color de la
MISMA paleta de 17 más cercano a su opuesto en el círculo cromático (+180°)
— así no se inventa ningún color nuevo, todo sigue siendo un token que ya
existe en los dos temas:

| Color de bóveda | Complementario calculado |
|---|---|
| `danger` | `teal` |
| `orange` | `blue` |
| `warning` | `blue` |
| `yellow` | `indigo` |
| `lime` | `purple` |
| `success` | `pink` |
| `emerald` | `pink` |
| `teal` | `rose` |
| `accent` (cian) | `danger` |
| `info` | `orange` |
| `blue` | `orange` |
| `indigo` | `yellow` |
| `violet` | `lime` |
| `purple` | `lime` |
| `fuchsia` | `lime` (hueco en la paleta entre lime y success; es la mejor opción disponible, a 29° del opuesto exacto — el resto del mapeo queda a menos de 12°) |
| `pink` | `success` |
| `rose` | `teal` |

## 3. Preguntas de producto para Carlos (Gate 1)

**P-1 (variantes de H1-H4):** con un solo color de bóveda, propongo
mezclarlo con el color de texto normal en proporción creciente según baja
el nivel — así H1 queda con el color más puro/intenso y H4 el más cercano
al texto normal pero sin perderse:

| Nivel | Mezcla propuesta | Efecto |
|---|---|---|
| H1 | 100% color de la bóveda | el más saturado, el ancla visual |
| H2 | ~85% color de la bóveda + 15% texto normal | casi tan vivo como H1 |
| H3 | ~55% color de la bóveda + 45% texto normal | con un tinte claro pero ya cerca del texto |
| H4 | ~30% color de la bóveda + 70% texto normal | apenas un matiz, no apagado ni ilegible |

Negrita en todos los niveles (ya es el peso por defecto de los
encabezados). **Confirmado tal como se propuso.**

**P-2 (negritas y cursivas) — resuelto (Carlos, 2026-10-30):** mismo color
complementario de §2.1 para ambas, distinguidas por INTENSIDAD, no por
matiz distinto — negrita al 100% (sin mezclar), cursiva mezclada con
`--text-secondary` al 70%/30% (mismo criterio de gradiente que ya usa P-1
para H1-H4, aplicado aquí a solo 2 niveles). Decisión de AIRA dentro del
margen que Carlos delegó ("tú decide con lógica... armonía visual"): usar
la MISMA fórmula `color-mix` en todo el documento (encabezados, negrita,
cursiva) es lo que da la coherencia visual que pidió, en vez de inventar
un mecanismo de intensidad distinto para cada tipo de texto.

**P-5 (enlaces) — resuelto:** también al color complementario, mismo
tratamiento que la negrita (100%, sin mezclar) — Carlos ya lo había
agrupado con negritas/cursivas ("así como links") y confirmó el paquete
completo. El wikilink **roto** no cambia (sigue en `--danger-text`/rojo,
es un estado de error, no de énfasis).

**P-6 (cabecera de tabla) — resuelto:** fondo tenue del color de la bóveda
(`color-mix` al ~15%) + texto en el color de la bóveda al 100%, confirmado
tal como se propuso.

**P-3 (viñetas/números de lista) — resuelto:** el marcador (el punto o el
número, NO el texto de cada ítem) en el color de la bóveda a la intensidad
de H4 (el tinte más sutil), confirmado tal como se propuso.

**P-4 (líneas) — resuelto:** cita, línea horizontal y bordes de tabla pasan
a `var(--border)` a 1px — la cita pierde el cian fijo que tiene hoy,
confirmado tal como se propuso.

## 4. Criterios de aceptación (EARS booleano) — pendientes de P-1..P-4

- **C-1:** H1 DEBE pintarse con el color de la bóveda abierta al 100 % de
  intensidad (sin mezclar con el texto normal).
- **C-2:** H2 DEBE pintarse con el color de la bóveda mezclado según P-1
  (más intenso que H3/H4, menos que H1).
- **C-3:** H3 DEBE pintarse con el color de la bóveda mezclado según P-1
  (intermedio entre H2 y H4).
- **C-4:** H4 DEBE pintarse con el color de la bóveda mezclado según P-1
  (el más sutil, pero DEBE seguir siendo legible — contraste mínimo 4.5:1
  contra el fondo del editor en ambos temas).
- **C-5:** Negrita DEBE pintarse con el color complementario de la bóveda
  (tabla de §2.1) al 100 %; cursiva DEBE pintarse con el mismo color
  complementario mezclado al 70 %/30 % con `--text-secondary` (más tenue
  que la negrita, mismo color, distinta intensidad).
- **C-6:** El marcador de viñeta/número de lista DEBE llevar el color de
  la bóveda a la intensidad de H4 (P-3); el texto del ítem NO cambia de
  color.
- **C-7:** La barra de cita, el `<hr>` y los bordes de tabla DEBEN usar
  `var(--border)` a 1px — ninguno DEBE usar `--accent` ni el color de la
  bóveda.
- **C-8:** Cambiar de bóveda (abrir otra) DEBE actualizar el color de
  H1-H4, negritas/cursivas/enlaces, cabecera de tabla y marcadores de lista
  de cualquier nota abierta, sin recargar la página (mismo criterio que
  H-006 C-5 para los iconos de la sidebar).
- **C-9:** El tratamiento DEBE funcionar en ambos temas (claro/oscuro) sin
  perder contraste — los 17 colores de la paleta (`vaultIcon.ts`) ya están
  definidos como tokens en los dos temas.
- **C-10:** Los enlaces normales (`a`) y el wikilink resuelto DEBEN usar el
  color complementario al 100 % (mismo tratamiento que la negrita). El
  wikilink roto NO cambia (sigue en `--danger-text`/rojo).
- **C-11:** La cabecera de tabla (`th`) DEBE tener fondo
  `color-mix(in srgb, var(--vault-accent) 15%, transparent)` y texto
  `var(--vault-accent)` al 100 %; el cuerpo de la tabla no cambia.

`[NEEDS CLARIFICATION] = 0` — Carlos confirmó "así es" (2026-10-30).

## 5. Descartes (candidatos, a confirmar)

- Cambiar el tamaño de fuente de los encabezados: fuera de alcance, el
  pedido es jerarquizar con color, no con tamaño.
- Tocar el bloque de código o el código en línea: ya tienen su propio
  tratamiento visual, no mencionado en el pedido.
- Un gris nuevo dedicado a las líneas en vez de reusar `var(--border)`:
  innecesario, ya existe y ya se usa para esto mismo en tabla/sidebar.

## 6. Plan (de ESTA historia solamente) — borrador, se confirma al tomarla

- `VaultWorkspacePage.tsx`/`NoteEditor.tsx`/`MilkdownView.tsx`: publicar
  `vaultColor` (ya threaded, usado hoy para el wikilink resuelto/H-006) como
  variable CSS en el contenedor `.milkdown-view` (p. ej.
  `style={{ "--vault-accent": colorVar(vaultColor) }}`, mismo patrón que
  `VaultChip`/`NoteSidebar` ya usan) — una sola fuente para que H1-H4 y los
  marcadores de lista lean el mismo valor.
- `vaultIcon.ts`: nuevo mapa estático `COMPLEMENTARY` (`Record<PaletteKey,
  PaletteKey>`, tabla de §2.1) junto a `PALETTE`/`COLOR_TOKEN` — mismo
  archivo que ya es la única fuente de verdad del color de bóveda, para no
  duplicar la tabla en CSS y en TS por separado.
- Publicar DOS variables CSS en `.milkdown-view` (no sólo una): la del color
  de bóveda ya planeada (`--vault-accent`) y una nueva `--vault-complement`
  (resuelta con `COMPLEMENTARY`) — mismo mecanismo, mismo contenedor.
- `editor.css`: reglas nuevas para `h1`/`h2`/`h3`/`h4` dentro de
  `.milkdown-view .ProseMirror` usando `color-mix(in srgb, var(--vault-accent)
  X%, var(--text-primary) Y%)` según las proporciones de P-1 (función CSS
  nativa, sin JS de por medio, ya se calcula sola al cambiar el tema o la
  bóveda); `strong` y `a`/`a.wikilink:not([data-broken])` en
  `var(--vault-complement)` al 100 % (C-5/C-10); `em` en
  `color-mix(in srgb, var(--vault-complement) 70%, var(--text-secondary) 30%)`
  (C-5); `th` con fondo `color-mix(in srgb, var(--vault-accent) 15%,
  transparent)` + texto `var(--vault-accent)` (C-11); marcador de
  `li`::marker a la intensidad de H4 (C-6, con `color` en el propio
  selector `li` o `::marker`, sin tocar el texto); `blockquote`/`hr`/`table`
  borde → `var(--border)` 1px (quita `--accent` de la cita, C-7).
- Estrategia de prueba: `layoutCss.test.ts` (o un test nuevo específico) que
  lea las reglas CSS generadas y confirme las fórmulas `color-mix` esperadas
  por nivel, que `blockquote`/`hr`/`table` usan `var(--border)` y no
  `--accent`, y que el marcador de lista usa el tono de P-3 — mismo patrón
  que ya usa `layoutCss.test.ts` para otras reglas (parsear el CSS real, no
  un snapshot visual). Verificación visual real (captura o navegador) en el
  checkpoint, igual que toda tarea de UI.
- Pasos TDD: se detallan al tomar la historia (§3 del método).

## 7. Tabla de cobertura

(se llena al implementar)

## 8. Checkpoint demostrable

Carlos debe abrir una nota con encabezados H1-H4, negritas, cursivas, un
enlace, una tabla, una lista y una cita en dos bóvedas de colores
distintos, y confirmar: la jerarquía de color de los encabezados se ve
bien y cambia con la bóveda; negritas/cursivas/enlaces se ven en el color
complementario y se distinguen bien de los encabezados; la cabecera de
tabla se ve con el color de la bóveda; las líneas (cita/raya/borde de
tabla) se ven delgadas y grises, no coloreadas.

## 9. Session-End (al cerrar)

Pendiente — se completa al implementar.
