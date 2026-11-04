---
id: H-014
titulo: Rediseño de color tipográfico del markdown renderizado — jerarquía con el color de la bóveda
estado: implemented # Implementada en ciclo Driver/Navigator (Modo 2, 2026-10-30): 6 commits atómicos citando H-014, 11 criterios con test. NO verified: falta el checkpoint visual de Carlos (§8) y el merge. Gate 1 pasado — Carlos confirmó "así es" (2026-10-30) a P-1, P-3, P-4, P-5, P-6 y corrigió P-2 (negrita 100%, cursiva más tenue, mismo complementario), delegando el detalle fino a AIRA.
covers:
  - frontend/src/editor/editor.css
  - frontend/src/vaults/vaultIcon.ts
  - frontend/src/vaults/vaultIcon.test.ts
  - frontend/src/editor/MilkdownView.tsx
  - frontend/src/editor/MilkdownView.test.tsx
  - frontend/src/editor/NoteEditor.tsx
  - frontend/src/editor/NoteEditor.test.tsx
  - frontend/src/notes/VaultWorkspacePage.tsx
  - frontend/src/notes/layoutCss.test.ts
  - frontend/src/editor/contrast.test.ts
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

Mecanismo común (C-8/C-9): `MilkdownView` publica en el contenedor `.milkdown-view`
dos variables CSS — `--vault-accent` (color de la bóveda) y `--vault-complement`
(resuelta con el mapa `COMPLEMENTARY` de §2.1) — que `VaultWorkspacePage →
NoteEditor → MilkdownView` cablean desde el color de la bóveda abierta. Todas las
reglas de `editor.css` las leen con `color-mix(in srgb, …)` nativo: cambiar de
bóveda o de tema recalcula los colores sin JS ni recarga (el efecto que crea el
editor no depende de `vaultColor`, así que sólo re-pinta, no recrea el documento).

| Criterio | Paso / código | Test(s) |
|---|---|---|
| C-1 (H1 100 %) | `editor.css` `h1` = `var(--vault-accent)` | `layoutCss` «C-1…C-4» |
| C-2 (H2 85 %) | `editor.css` `h2` color-mix 85/15 | `layoutCss` «C-1…C-4» |
| C-3 (H3 55 %) | `editor.css` `h3` color-mix 55/45 | `layoutCss` «C-1…C-4» |
| C-4 (H4 30 %, ≥ 4,5:1) | `editor.css` `h4` color-mix 30/70 | `layoutCss` «C-1…C-4» + `vaultIcon` «C-4/C-9» (contraste real ≥ 4,5:1, 17 colores × 2 temas) |
| C-5 (negrita/cursiva) | `editor.css` `strong`=complemento 100 %, `em`=70 %+`--text-secondary` | `layoutCss` «C-5» |
| C-6 (marcador de lista) | `editor.css` `li::marker` = intensidad H4 | `layoutCss` «C-6» |
| C-7 (cita/hr/tabla neutros) | `editor.css` `blockquote`/`hr` → `--border` 1px (quita `--accent` y relleno); celdas ya 1px `--border` | `layoutCss` «C-7» + `contrast` «cita» |
| C-8 (cambio de bóveda sin recarga) | `MilkdownView` publica las vars reactivas; threading `vaultColor` | `MilkdownView` «C-8» y «C-11/C-5»; `NoteEditor` «reenvía vaultColor» |
| C-9 (ambos temas) | `COMPLEMENTARY` + tokens que existen en claro/oscuro; color-mix | `vaultIcon` «C-4/C-9» (ambos temas) + `COMPLEMENTARY` |
| C-10 (enlaces/wikilink) | `editor.css` `a` y `a.wikilink` (resuelto) = complemento 100 %; roto sigue `--danger-text` | `layoutCss` «C-10» |
| C-11 (cabecera de tabla) | `editor.css` `th` fondo color-mix 15 % + texto `var(--vault-accent)` | `layoutCss` «C-11» + `MilkdownView` «C-11/C-5» |

Línea base → cierre: `npx vitest run` 1753 → **1763** verde (+10 tests nuevos);
`npm run typecheck` limpio. Sin regresiones.

## 8. Checkpoint demostrable

Carlos debe abrir una nota con encabezados H1-H4, negritas, cursivas, un
enlace, una tabla, una lista y una cita en dos bóvedas de colores
distintos, y confirmar: la jerarquía de color de los encabezados se ve
bien y cambia con la bóveda; negritas/cursivas/enlaces se ven en el color
complementario y se distinguen bien de los encabezados; la cabecera de
tabla se ve con el color de la bóveda; las líneas (cita/raya/borde de
tabla) se ven delgadas y grises, no coloreadas.

## 9. Session-End (2026-10-30, ciclo Driver/Navigator, Modo 2)

**Claim.** Los 11 criterios EARS (C-1…C-11) quedan implementados: el markdown
renderizado (Visual y Lectura) jerarquiza H1-H4 con el color de la bóveda,
negritas/cursivas/enlaces/wikilink resuelto con su complementario calculado,
cabecera de tabla y marcadores de lista con el color de la bóveda, y las líneas
divisorias (cita, raya, bordes de tabla) en gris neutro de 1px. Todo con
`color-mix` nativo, reactivo a la bóveda y al tema sin recarga ni JS.

**Evidencia.** 6 commits atómicos citando H-014 (mapa `COMPLEMENTARY`;
publicación de las vars + threading; encabezados; negrita/cursiva/enlaces;
cabecera de tabla + marcador; líneas neutras). Cada criterio con ≥ 1 test que
parsea el CSS real o computa contraste WCAG real (no snapshots). `npx vitest run`
= 1763 verde (línea base 1753 + 10); `npm run typecheck` limpio. Autorevisión
adversarial (Navigator §5): sin hallazgos Critical/High; especificidad de
selectores verificada (el wikilink roto conserva `--danger-text`; `.selectedCell`
gana sobre `th` en selección; `a.wikilink` ≥ `a`).

**Línea base.** Verde antes y después; sin regresiones. Se actualizó el test
`RF-037` de la cita (SPEC-0010 R-5 queda **supersedido** por C-7, documentado) y
la sub-aserción «cita» de `contrast.test.ts` (el texto va ahora sobre fondo
neutro, sigue ≥ 4,5:1).

**Gaps / riesgo residual.**
- **Medium — contraste de negrita/enlaces (C-5/C-10) en tema claro:** el
  complementario al 100 % cae bajo 4,5:1 como texto de cuerpo en varias
  combinaciones del tema CLARO (peor caso bóveda `indigo` → `yellow` = 2,94;
  `violet`/`purple`/`fuchsia` → `lime` = 3,09; `info`/`blue` → `orange` = 3,56).
  Los EARS mandan el COLOR (Carlos eligió 100 % complementario en P-2), no un
  ratio, así que se implementó fiel al criterio; en tema oscuro todas ≥ 6,25.
  Si molesta a la vista, la palanca natural sería mezclar el complementario con
  `--text-primary` como en los encabezados (decisión de producto, no la tomo en
  silencio).
- **Low — H1-H3 y `th` (100 % bóveda) en tema claro:** como encabezados (texto
  grande, umbral WCAG 3:1) casi todos cumplen; `yellow` (2,94) queda bajo incluso
  3:1 en claro. `th` es texto de 13px sobre tinte 15 %, rango ~3:1. Los EARS sólo
  exigen 4,5:1 a H4 — **cumplido con holgura** (mínimo real 11,0 en ambos temas).
- **Checkpoint demostrable (§8) PENDIENTE:** entorno headless sin navegador; no
  pude abrir dos bóvedas y mirar. Carlos debe hacer la verificación visual antes
  de pasar a `verified`.
- **Gate:** `.harness/gate/check.sh` tiene el bloque node inactivo (`services.txt`
  vacío) y su trazabilidad es solo-specs; evidencia equivalente = vitest +
  typecheck corridos a mano (arriba).

**Próximo paso.** Carlos: revisar el diff, hacer el checkpoint visual (§8),
decidir sobre el riesgo Medium de contraste del tema claro, y mergear +
reconstruir/redesplegar + push (yo no pusheo ni mergeo). Tras el checkpoint,
pasar `estado:` a `verified` y registrar en `memory/history.md`.

## 10. Cambio posterior: secundario análogo en vez de complementario (2026-10-30)

Carlos validó el complementario (§2.1) pero al verlo en uso no le gustó: el opuesto
se veía demasiado marcado (en una bóveda cian, negritas y enlaces salían en rojo).
Pidió un secundario **cercano** al primario, p. ej. azul → morado, para que el cambio
sea sutil. §2.1 queda superada por esta tabla (análogo: vecino de la misma paleta a
~20-40°, siempre en el mismo sentido de la rueda; `lime → success` a ~59° por el hueco
de la paleta):

danger→orange, orange→yellow, warning→lime, yellow→lime, lime→success, success→teal,
emerald→accent, teal→info, accent→blue, info→indigo, blue→indigo, indigo→violet,
violet→fuchsia, purple→fuchsia, fuchsia→pink, pink→rose, rose→orange.

Implementado por AIRA directo (Gate 0, cambio chico): `COMPLEMENTARY` pasó a `SECONDARY` y
`--vault-complement` a `--vault-secondary` (mismos usos: negrita 100 %, cursiva al 70 %,
enlaces y wikilink resuelto). Sin cambios en H1-H4, cabecera de tabla, marcadores ni líneas.

**Hallazgo de contraste (no resuelto aquí):** en el tema oscuro todos los pares cumplen
≥ 4,5:1 sobre el fondo; en el tema claro varios colores de la paleta NO llegan a 4,5:1 como
texto (amarillo 2,94, lima 3,09, verde 3,30, naranja 3,56, cian 3,68, verde azulado 3,74,
azul cielo 4,10). Afecta igual al color primario de los encabezados y ya existía con el
complementario. Pendiente: aclarar el texto de esos colores en tema claro (mezcla con
`--text-primary`) si Carlos usa o va a usar el tema claro.

## Enmienda 2026-11-04 (Carlos): escala de tamaños, tonos de énfasis y color terciario

Carlos vio que H2 salía más chico que H3 (H2 heredaba 15 px del `h2` global y H3 el 1,17 em del navegador)
y que los encabezados H2-H4 casi no se distinguían del texto ni de la negrita. También que negrita, cursiva y
negrita-cursiva se veían del mismo tono. Cambios (`editor.css`, `vaultIcon.ts`, `MilkdownView.tsx`):

- **Tamaño:** H1 2,1 em, H2 1,7 em, H3 1,4 em, H4 1,2 em sobre los 14 px del documento (≈ 29, 24, 20 y 17 px);
  H1-H2 en peso 700 y H3-H4 en 600; interlineado 1,3. El color de H1-H4 no cambia.
- **Terciario:** `TERTIARY` (17 claves, a ~120-170° del color de la bóveda, nunca `danger`) publicado como
  `--vault-tertiary`. Lo usan enlaces, wikilinks resueltos y código en línea.
- **Tonos** (`--md-*`, por tema): negrita = secundario (en claro 85 % + texto, para llegar a 3,4:1); cursiva =
  secundario 40 % + texto; negrita-cursiva = secundario 55 % + terciario. Enlace URL (subrayado), wikilink
  (más claro, subrayado) y código (más oscuro, chip `--bg-tertiary`) separados por tono.
- **Límite conocido:** en el tema oscuro, oscurecer el código más allá de 90 % del terciario baja el contraste
  bajo 3,4:1 (el chip es `--bg-tertiary`); por eso la separación entre enlace, wikilink y código es menor en
  oscuro que en claro. `vaultIcon.test.ts` fija el piso de contraste y la separación para los 17 colores.
- Supersede C-5 (cursiva 70 % + `--text-secondary`) y C-10 (enlaces en el secundario) y la regla «jerarquizar
  con color, no con tamaño». Verificado en Chromium real (tamaños y colores calculados, 3 bóvedas, oscuro y claro).

## Enmienda 2026-11-04 (2): color de los encabezados en tonos 600/400

Carlos no veía diferencia de tono entre encabezados. Nuevo esquema (supersede C-1…C-4): H1 con el primario de la
bóveda en tono 600, H2 con el secundario en 600, H3 con el terciario en 600 y H4 con el primario en 400
(tonos Tailwind, `--shade-400-*`/`--shade-600-*` en `tokens.css`, iguales en los dos temas; `shadeVar` en `vaultIcon.ts`;
`MilkdownView` publica `--vault-accent-600`, `--vault-secondary-600`, `--vault-tertiary-600` y `--vault-accent-400`).
Contraste: el 600 sobre el fondo oscuro llega a 2,96:1 (índigo) y sobre blanco a 2,9:1 (amarillo); son títulos de
≥ 20 px. En el tema claro el 400 puro daría 1,5:1 (amarillo), así que H4 se mezcla 60/40 con el texto (≥ 3,6:1); en
oscuro va tal cual (≥ 6:1). Verificado en Chromium con tres bóvedas.

## Enmienda 2026-11-04 (3): primario, secundario y terciario como vecinos a 20°

Carlos no quedó conforme con la selección de colores (el secundario y el terciario eran vecinos elegidos de la
paleta de 17, a 20-60° según el hueco, y el terciario iba a ~150°). Nuevo esquema, supersede la tabla `SECONDARY`
de la enmienda de 2026-10-30 y la `TERTIARY` de la enmienda (1): el **secundario es el primario girado +20° y el
terciario el secundario girado +20° (+40° del primario)**, en OKLCH (`oklch(from var(--vault-accent) l c calc(h + 20))`
en `editor.css`; también para los tonos 600 de los encabezados). Rotar en OKLCH conserva la luminosidad del primario,
así que el contraste no cambia (en HSL el amarillo o el naranja a +40° caían a 1,3:1). Los mapas `SECONDARY` y
`TERTIARY` de `vaultIcon.ts` se eliminan y `MilkdownView` solo publica el primario y sus tonos 600 y 400.
Consecuencia: con secundario y terciario a solo 20° no hay otro matiz para separar la negrita-cursiva; pasa a ser un
punto intermedio de luminosidad (`--md-strongem`: negrita 100 % > negrita-cursiva 70/60 % > cursiva 40 %). Requiere
color relativo de CSS (Chrome 119, Safari 16.4, Firefox 128). Verificado en Chromium (3 bóvedas, claro y oscuro).

## Enmienda 2026-11-04 (4): paso de 30° en lugar de 20°

Carlos pidió que los vecinos estén a **30°**: secundario = primario +30° y terciario = secundario +30° (+60° del primario),
misma rotación OKLCH de la enmienda (3). Los pisos de contraste y de separación de las pruebas se mantienen y se cumplen
con 30° para los 17 colores, en claro y oscuro.

## Enmienda 2026-11-04 (5): H3 primario 400 y H4 secundario 400

Con la relación a 30° aprobada por Carlos, los encabezados quedan: H1 primario 600, H2 secundario 600, H3 primario 400 y
H4 secundario 400 (el secundario es el primario girado +30° en OKLCH; `--vault-secondary-400` nuevo, `--vault-tertiary-600`
retirado por sin uso). En el tema claro H3 y H4 se mezclan 60/40 con el texto (el 400 puro da 1,5:1 en amarillo); en oscuro van
tal cual. El terciario sigue en enlaces, wikilinks y código. Verificado en Chromium (azul y naranja, claro y oscuro).

## Enmienda 2026-11-04 (6): filas pares de tabla y enlaces rotos

- **Tablas:** las filas pares (la cabecera cuenta como fila 1) llevan el primario de la bóveda al 7 % sobre transparente, el
  mismo color de la cabecera, solo para seguir cada fila.
- **Wikilink roto:** deja de usar el color de peligro; toma el color del wikilink (`--md-wikilink`) al 50 % de opacidad con
  subrayado punteado, para que se vea inactivo (supersede el «H-014 NO lo cambia» de H-011). Verificado en Chromium, claro y oscuro.

## Enmienda 2026-11-04 (7): esquinas de tabla redondeadas y cita en secundario 600

- **Tablas:** esquinas redondeadas (`--radius-sm`, 6 px). `border-radius` no se aplica con `border-collapse: collapse`, así que la
  tabla usa bordes separados (`border-spacing: 0`): cada celda dibuja derecha e inferior y la primera fila y columna ponen arriba e
  izquierda, sin líneas dobles. El tinte de las filas pares va en las celdas, no en la fila, para respetar el redondeo.
- **Cita:** barra izquierda de 3 px en el secundario 600 (`--vault-secondary-600`) y fondo del mismo color al 20 % de opacidad
  (antes línea gris de 1 px sin fondo; supersede la parte de la cita de H-014 C-7). Verificado en Chromium, claro y oscuro.

## Enmienda 2026-11-04 (8): fondo de la cita al 5 %

El fondo de la cita (secundario 600) baja de 20 % a **5 %** de opacidad; la barra izquierda no cambia. Supersede el 20 % de la enmienda (7).

## Enmienda 2026-11-04 (9): fondo de la cita al 8 %

Al 5 % el fondo casi no se veía; sube a **8 %**. Supersede la enmienda (8).
