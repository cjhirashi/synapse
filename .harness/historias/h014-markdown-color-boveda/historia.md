---
id: H-014
titulo: Rediseño de color tipográfico del markdown renderizado — jerarquía con el color de la bóveda
estado: pendiente # Gate 1 NO pasado — criterios redactados por AIRA desde la directiva de Carlos (2026-10-30); falta su "así es".
covers:
  - frontend/src/editor/editor.css
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

- Dentro: color de H1-H4, negritas, cursivas, viñetas/números de lista,
  cita, línea horizontal y bordes de tabla — **sólo color/grosor**, no
  tamaño de fuente ni estructura (no se toca el tamaño de los encabezados,
  pedido explícito: "jerarquizar con color", no con tamaño).
- Fuera: bloque de código y código en línea (ya tienen su propio
  tratamiento de `--bg-tertiary`/`--accent-hover`, no mencionado por
  Carlos); tablas en sí (estructura, no color — sólo el GROSOR/color del
  borde entra); el wikilink (H-011/H-012, ya tiene su propio color).

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
encabezados). ¿Así es, o prefieres otra proporción (p. ej. un salto más
marcado entre niveles, o que H4 quede prácticamente neutro)?

**P-2 (negritas y cursivas):** propongo dejarlas **sin color del acento**
— negrita en `--text-primary` (el mismo color del texto, sólo el peso ya
las distingue) y cursiva en `--text-secondary` (un poco más tenue, como ya
hace el texto de la cita). Así el color queda reservado para la estructura
del documento (encabezados) y no compite por atención dentro de un párrafo
normal. ¿Así es, o quieres que lleven también un tinte del color de la
bóveda?

**P-3 (viñetas/números de lista):** propongo el marcador (el punto o el
número, NO el texto de cada ítem) en el color de la bóveda a la intensidad
de H4 (el tinte más sutil) — un detalle de color sin saturar la lista
completa. ¿Así es, o lo prefieres más intenso (como H2/H3) o sin color?

**P-4 (líneas — ya resuelto, confirmo el alcance):** cita, línea horizontal
y bordes de tabla pasan a `var(--border)` (el gris neutro que ya usa el
resto de la app, sin inventar un gris nuevo) y a 1px — la cita deja de usar
el cian fijo de `--accent` que tiene hoy (cambio consciente del diseño de
SPEC-0010 R-5, a tu pedido explícito). ¿Correcto que la cita también pierda
su color (hoy cian) y pase a esta misma línea gris?

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
- **C-5:** Negrita y cursiva DEBEN seguir el tratamiento de P-2 (sin color
  del acento, o con él, según lo que confirme Carlos).
- **C-6:** El marcador de viñeta/número de lista DEBE llevar el tratamiento
  de color de P-3; el texto del ítem NO cambia de color.
- **C-7:** La barra de cita, el `<hr>` y los bordes de tabla DEBEN usar
  `var(--border)` a 1px — ninguno DEBE usar `--accent` ni el color de la
  bóveda.
- **C-8:** Cambiar de bóveda (abrir otra) DEBE actualizar el color de H1-H4
  y de los marcadores de lista de cualquier nota abierta, sin recargar la
  página (mismo criterio que H-006 C-5 para los iconos de la sidebar).
- **C-9:** El tratamiento DEBE funcionar en ambos temas (claro/oscuro) sin
  perder contraste — los 17 colores de la paleta (`vaultIcon.ts`) ya están
  definidos como tokens en los dos temas.

`[NEEDS CLARIFICATION] = 4` (P-1 a P-4) — se resuelven con tu "así es".

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
- `editor.css`: reglas nuevas para `h1`/`h2`/`h3`/`h4` dentro de
  `.milkdown-view .ProseMirror` usando `color-mix(in srgb, var(--vault-accent)
  X%, var(--text-primary) Y%)` según las proporciones de P-1 (función CSS
  nativa, sin JS de por medio, ya se calcula sola al cambiar el tema o la
  bóveda); `strong`/`em` según P-2; marcador de `li`::marker según P-3 (con
  `color` en el propio selector `li` o `::marker`, sin tocar el texto);
  `blockquote`/`hr`/`table` borde → `var(--border)` 1px (quita `--accent` de
  la cita, C-7).
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

Carlos debe abrir una nota con encabezados H1-H4, negritas, cursivas, una
lista y una cita en dos bóvedas de colores distintos, y confirmar: la
jerarquía de color de los encabezados se ve bien y cambia con la bóveda;
negritas/cursivas se ven como P-2 definió; las líneas (cita/raya/tabla) se
ven delgadas y grises, no coloreadas.

## 9. Session-End (al cerrar)

Pendiente — se completa al implementar.
