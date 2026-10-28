---
id: PLAN-0012
tipo: plan
feature: 0012-propiedades-estilo-obsidian
estado: draft
aprobaciones:
  fase_2: pendiente
actualizado: 2026-10-28
---

# PLAN-0012 · Panel de Propiedades con presentación estilo Obsidian

> El *cómo* de SPEC-0012 (GATE 1, 2026-10-28). Sólo cambia la **presentación** del panel
> (lectura y edición Visual). El modelo de datos, los tipos, las conversiones, la validación y el
> guardado de SPEC-0010 no cambian. Orden de trabajo de method.md v1.9 (SDD Anchored, que sigue
> siendo la referencia de las features `NNN-slug` con spec/plan/tasks; ver R-9): **maquetación
> primero** y fidelidad visual con **capturas reales** de Chromium contra
> `reference/propiedades-obsidian-referencia.png`, antes de cablear la edición.

## 0. Gates de simplicidad
- [x] **Simplicity** — sin tipos nuevos ni cambios de datos. Se cambia el marcado y el CSS de dos
  componentes que ya existen y se añade una pieza de fila compartida. El menú reutiliza el
  comportamiento APG de `NoteMenu`.
- [x] **Anti-Abstraction** — sólo hay dos abstracciones nuevas y cada una tiene dos consumidores
  reales: `PropertyRow` (lectura + edición) y `useMenu` (`NoteMenu` + `PropertyMenu`). No se crea
  ningún «componente de formulario genérico».
- [x] **Integration-First** — no cruza ningún contrato de E/S (spec §3). El contrato interno que
  se conserva son los **nombres accesibles** de los controles. Las pruebas de 0010 y
  `NoteEditorFrontmatter.test.tsx` dependen de ellos (§5.2).

## 1. Cumplimiento constitucional
| Artículo | Cómo lo respeta este plan |
|---|---|
| Art. 1–2 (patrón por capas, ADR-001) | En el cliente, la lógica pura sigue en módulos sin React: `editor/properties.ts` gana `isIsoDate` y `displayKind`. Los componentes sólo pintan y orquestan. `NoteEditor` sigue montando `PropertiesPanel` en lectura y `PropertiesForm` en Visual, con el mismo `key`/`onChange`. Sin cambios en el backend ni en `notes/noteStore.ts`, que sigue siendo la única puerta de escritura. |
| Art. 1 (dependencias) | Ninguna dependencia nueva. Sólo se importan 7 glifos más de `lucide-react` 1.61.0, que ya es dependencia (§2.2). |
| Art. 3 (testing) | TDD por zona (§5). Los tests de 0010 se adaptan **sin debilitar** ninguna aserción (cada cambio está en §5.2). La fidelidad y las medidas se toman en Chromium real (`npm run test:visual`), no en jsdom. |
| Art. 5 (seguridad) | Los valores siguen pintándose como nodos de texto de React: ni HTML ni enlaces (RNF-003 de 0010; el test se conserva). Los `title` de las elipsis reciben texto plano. El menú vive en un portal de React sin `innerHTML`. |
| Art. 6 (contratos) | Sin cambios en `note.schema.json` ni en OpenAPI. |
| Art. 9 (convenciones) | Los tests nombran su `RF-` (vitest en un comentario; e2e en el título `0012 PV-n … (RF-00n)`). Commits Conventional + `(RF-NNN)`/`(T-NNN)`. |
| Art. 10 (raíz) | La falta de validación al guardar (P-14) se corrige en su origen, `NoteEditor.save`, y no con un parche en el formulario. |
| Art. 11 (docs) | §8. |

## 2. Arquitectura de la feature (por capas, cliente)

### 2.1 Núcleo (módulo puro) — `editor/properties.ts`
Conserva `PropType`, `PropRow`, `inferType`, `toRows`, `fromRows`, `convert`, `validateRows` y
`parseNumberInput` **sin cambios de comportamiento**. Gana dos funciones:
- `isIsoDate(text: string): boolean`. Devuelve verdadero si `text` cumple exactamente
  `^\d{4}-\d{2}-\d{2}$` **y** es una fecha real del calendario gregoriano proléptico, con el año
  bisiesto y los días por mes correctos: `2026-02-29` es falso y `2024-02-29` es verdadero. No
  admite espacios, hora ni zona. Se valida con `Date.UTC` y una comparación de ida y vuelta (RF-010).
- `displayKind(row: PropRow): DisplayKind`, con
  `type DisplayKind = "text" | "date" | "number" | "boolean" | "list" | "complex"`. Devuelve `"date"`
  sólo si `row.type === "text"` y `isIsoDate(row.value)`; en otro caso devuelve `row.type`. **No cambia
  `type` ni `value`** (D-5). Es una proyección de presentación.

### 2.2 Presentación compartida — `editor/PropertyRow.tsx` (nuevo)
Es la **fila** común de lectura y edición. Sólo maqueta, sin estado:
```
<PropertyRow kind={DisplayKind} icon={ReactNode?} keyCell={ReactNode} value={ReactNode} as="div|dl-item" />
```
- La rejilla de la fila es `grid-template-columns: 28px var(--prop-key-w) minmax(0, 1fr)`, con
  `column-gap: 8px` y `min-height: 32px` (36 px con `pointer: coarse`). Así la geometría es
  **idéntica** en lectura y en edición y al pulsar «Editar» no salta nada (objetivo visual de RNF-001).
- La columna del icono (28 px) muestra en lectura el glifo de `PROPERTY_ICONS[kind]` a 16 px,
  `aria-hidden`, con `data-prop-kind={kind}`. En edición muestra el botón de `PropertyMenu`.
- `PROPERTY_ICONS: Record<DisplayKind, LucideIcon>` y `KIND_LABELS` («Texto», «Fecha», «Número»,
  «Sí/No», «Lista», «Complejo») se exportan desde aquí (un solo canon). Mapa propuesto (P-2):

| Tipo (`DisplayKind`) | Glifo Lucide 1.61.0 | Motivo |
|---|---|---|
| texto | `TextAlignStart` (alias `text`) | Es el glifo de texto de Obsidian. |
| fecha ISO (D-5, RF-010) | `Calendar` | Es el de Obsidian. Sólo presentación. |
| número | `Hash` | Es el signo universal de «número», más legible que `Binary`. |
| sí/no | `ToggleRight` | No es `SquareCheck`, que ya pinta el **valor** booleano en la misma fila: con él la fila mostraría ☑ ☑. |
| lista | `List` | La lista es genérica. `Tags` sugeriría que sólo sirve para etiquetas. |
| complejo | `Braces` | Representa un objeto o JSON. Va con el `Lock` actual del valor. |

  Del menú: `Check` (marca del tipo vigente) y `Trash2` (Quitar; ya existe en `NoteMenu`).
  **Ningún glifo del conjunto curado de la app representa un tipo de dato.** El conjunto curado son los
  24 de `vaults/vaultIcon.ts` más los 36 que ya se importan; por eso se añaden 7: `TextAlignStart`,
  `Calendar`, `Hash`, `ToggleRight`, `List`, `Braces` y `Check`. Pesan ≈ 0,8 KiB gzip en datos de
  glifo, medidos con `gzip -9` sobre los `__iconData` de los seis glifos de tipo (§2.5).

### 2.3 Coordinación (componentes)

**a) `editor/PropertiesPanel.tsx` — lectura (RF-001, RF-002, RF-003, RF-004, RF-007, RF-010).**
Sigue sin estado salvo el plegado «Mostrar n más» (≥ 10, P-16 de 0010; se conserva).
- Estructura: `<div role="group" aria-labelledby={titleId} class="note-properties">`, después
  `<div id={titleId} class="note-properties-title">Propiedades</div>` (P-6), después `<dl>` y luego
  una `div.note-property` (`PropertyRow`) por clave.
- El **icono va dentro del `<dt>`**. Un `div` hijo de `dl` sólo admite `dt`/`dd`, así que dentro de la
  fila sólo van esos dos. El orden es `<dt><svg aria-hidden/><span class="note-prop-key" title={clave}>{clave}</span></dt><dd>…</dd>`.
  El `dt` usa `display: contents` para que el icono y la clave ocupen sus dos columnas de la rejilla.
  `dt.textContent` sigue siendo la clave completa: el nombre accesible está completo y el test de
  0010 no cambia.
- Clave: 13 px `--font-ui`, `--text-secondary` (P-7), `white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis` (RF-004). El texto entero queda en el árbol de accesibilidad y en `title`.
- Valor: 13 px `--text-primary`, `overflow-wrap: anywhere`, `white-space: pre-wrap` (sin cambios).
  Las listas son pastillas (§2.4-c). Los booleanos llevan `SquareCheck`/`Square` + «Sí»/«No», sin
  `input` (RF-007). Lo complejo se muestra en `<code>` con `Lock` y «Sólo lectura: edítalo en Código»
  (RF-007/RF-013 de 0010). El texto vacío se muestra como «(vacío)».
- No hay cabecera de columnas (RF-001). Nada es enfocable salvo «Mostrar n más» (RF-007).

**b) `editor/PropertiesForm.tsx` — edición Visual (RF-001…RF-006, RF-008, RF-010).**
Conserva **todo** su estado y su contrato: uncontrolled, `onChange` sólo con filas válidas,
`PropertiesFormHandle.validate()`, anuncios en `role="status"`, gestión de foco y resumen
`role="alert"`. Cambia el marcado de cada fila:
- La fila es `PropertyRow` dentro de `<div role="group" aria-label="Propiedad: {clave}" class="props-form-row">`.
  El nombre del grupo se conserva.
- Columna 1: botón de `PropertyMenu` (§2.3-c), siempre visible (no aparece sólo al pasar el ratón:
  ui-ux-pro-max, *Compact Control Semantics*, Critical). Es lo único que abre «Tipo» y «Quitar».
- Columna 2: `input.props-form-key` en línea con `aria-label="Clave de la propiedad {n}"`. El nombre
  se conserva. Muestra elipsis cuando no tiene el foco.
- Columna 3: el control del valor según el tipo. Los nombres de 0010 se conservan: «Valor de «k»»,
  «Añadir elemento a «k»», casilla con «Sí»/«No» y «Quitar {elemento}». Los inputs no tienen borde en
  reposo (P-5).
- **Sin `<select>` de tipo ni botón × de quitar en la fila** (RF-005). **Sin `props-form-head`**
  (RF-001). Desaparece la tarjeta apilada a 390 px (P-8).
- Los errores (`props-form-error`) ocupan `grid-column: 2 / -1`, bajo la clave y el valor, con el
  mismo texto, `aria-describedby` y `aria-invalid`.
- «Añadir propiedad» queda al final, con el `+` alineado a la columna del icono (como en la
  referencia).
- `.props-form-scroll` se conserva (máx. `min(50vh, 360px)` con sombras, M-2 de 0010; P-10).

**c) `editor/PropertyMenu.tsx` (nuevo) — menú del icono (RF-006, RF-008; P-3).**
Es el patrón APG *menu button* con un **menú plano**, sin submenú:
- Disparador: `<button class="prop-type-button" aria-haspopup="menu" aria-expanded aria-controls>`
  de 28 × 28 px (36 px con `pointer: coarse`, área de 44 px con `::after`; P-13 de 0010). Contiene
  el glifo de `displayKind` a 16 px. Su nombre accesible (P-11) es
  `Opciones de «{clave}», tipo {Tipo}`; en una fecha es `… tipo Texto (fecha)`; si la clave está
  vacía es `Opciones de la propiedad {n}, tipo {Tipo}`.
- Menú `role="menu"` en un portal, alineado al **borde izquierdo** del botón y 4 px por debajo.
  Contiene:
  1. `<div role="group" aria-labelledby={tipoId}>` con su rótulo visible «Tipo» (`role="presentation"`)
     y 4 `menuitemradio`: «Texto», «Número», «Sí/No» y «Lista», cada uno con su glifo de tipo y
     `aria-checked` (el vigente lleva además `Check`). **No existe en filas complejas** (RF-013 de
     0010: lo complejo no cambia de tipo).
  2. `role="separator"`.
  3. `menuitem` «Quitar» (`Trash2`, variante `note-menu-item-danger`).
- Teclado (el de `NoteMenu`, P-4): Enter, Espacio o ↓ abren en el primer ítem; ↑ abre en el
  último. ↑/↓ son cíclicas sobre **todos** los ítems; también Inicio/Fin. Esc cierra y devuelve el
  foco al icono. Tab cierra y deja el foco en el icono (APG, WCAG 2.4.3). Un clic fuera, el scroll
  de un ancestro o un cambio de tamaño cierran el menú sin mover el foco (R-4).
- Al elegir un tipo se llama a `onType(type)`, que ejecuta el `changeType` actual con `convert` y el
  anuncio de «se vació». El menú se cierra y el foco **vuelve al icono**. Si ese tipo ya era el
  vigente, sólo se cierra.
- Al pulsar «Quitar» se llama a `onRemove()`, que ejecuta el `remove(index)` actual con su anuncio y
  el foco a la clave siguiente, a la anterior o a «Añadir propiedad». El menú se cierra sin devolver
  el foco al icono, que ya no existe.
- Reutiliza las clases visuales `.note-menu`/`.note-menu-item` de `NoteMenu` (mismo chasis:
  `--radius-md`, `--shadow-panel`). Así no hay CSS duplicado.

**d) `editor/useMenu.ts` (nuevo, extraído de `NoteMenu`; P-4).**
Hook con el estado y el teclado del patrón APG: `open`, `active`, `openAt(i)`, `close(restore)`,
foco itinerante, clic fuera, `onTriggerKeyDown`, `onMenuKeyDown` y la posición (`align: "end" |
"start"`). `NoteMenu` pasa a usarlo **sin cambiar su comportamiento**: sus 11 tests y la e2e V-11 de
0010 se ejecutan sin cambios antes y después.

**e) `editor/NoteEditor.tsx` — validación al guardar (P-14, opcional sujeto a GATE 2).**
Hoy el guardado desde Visual **no llama** a `PropertiesFormHandle.validate()`: `PropertiesForm` se
monta sin `ref`. Una fila con la clave vacía o repetida, o con un número inválido, no se emite, y
«Guardar» guarda las últimas propiedades válidas **en silencio**. Contradice PLAN-0010 §2.3-c («al
guardar con errores no guarda y el foco va al resumen»). Con la clave editable en línea (sin
cabecera) este caso es más probable. La corrección de raíz es dar al formulario un `ref` y, en
`save()` desde Visual, ejecutar `if (!formRef.current?.validate()) return;` antes de componer.

### 2.4 Estilos — `editor/editor.css` (P-13)
Todo con tokens de 1.1.4.1 en los dos temas. Regla P-2 de 0010: `--text-muted` y `--accent` **nunca**
como color de texto (lo vigila `contrast.test.ts`).

**a) Caja (sin cambios, R-3 de 0010):** `--bg-tertiary`, `1px solid var(--border)`, `--radius-sm`,
padding `12px 16px` (12 px a ≤ 560 px). Título «Propiedades»: 13 px, 600, `--text-secondary`
(5,68:1 en oscuro y 6,92:1 en claro sobre `--bg-tertiary`), con `margin-bottom: 4px`.

**b) Fila:** la descrita en §2.2, con `--prop-key-w: clamp(96px, 30%, 176px)` sobre el ancho de la
fila (P-8). A 1440 da 176 px; a 390, con la columna de 358 px y la caja de 334 px, da ≈ 100 px de
clave y ≈ 190 px de valor. `row-gap` entre filas: 0; separa el `min-height`. En edición, la fila
tiene `--bg-secondary` al pasar el ratón (Obsidian). Todo hijo tiene `min-width: 0`: **ningún**
`overflow-x` propio (RF-004).

**c) Pastillas (`.note-chip`, RF-003; P-9):** alto 24 px, padding `0 8px`, `--radius-xs`, fondo
`--accent-soft` y texto `--text-primary` 12 px, peso 500. Contraste sobre la caja: **10,32:1**
(oscuro) y **14,58:1** (claro). Se descarta el texto de acento de Obsidian: con `--accent-hover`
daría 5,18 en oscuro pero **4,37 en claro**, por debajo de 4,5 (calculado con la mezcla de
`--accent-soft` sobre `--bg-tertiary`). `flex-wrap: wrap; gap: 4px`. Una pastilla larga lleva
`max-width: 100%` y el texto con elipsis, `title` y el texto entero en el DOM. La «×»
(`.note-chip-remove`) mide 20 × 20 con un `::after` de 24 × 24 (44 en estrecho o táctil) y su glifo
es `--text-secondary`: no texto, 4,55:1 y 6,19:1. El campo «Añadir elemento» va en línea tras la
última pastilla (`flex: 1 1 6ch`).

**d) Controles en línea (P-5):** `.props-form input/textarea` con borde `1px solid transparent` y
fondo transparente en reposo. Al pasar el ratón: `--bg-secondary`. Con el foco: borde `--accent` +
anillo global (`outline 2px --accent`, `outline-offset: -2px` dentro del scroller). Con
`aria-invalid`: borde `--danger` **siempre visible**, también en reposo. Alto 28 px y padding
`0 6px`. La clave usa la fuente UI 13 px `--text-secondary` en reposo y `--text-primary` con el foco.

**e) Botón del icono:** transparente, glifo `--text-secondary`. Al pasar el ratón o con
`aria-expanded="true"`: `--bg-tertiary` → `--bg-secondary` y glifo `--text-primary`. Foco: anillo
global.

**f) Táctil y estrecho:** `.prop-type-button` y `.note-chip-remove` entran en el bloque
`@media (max-width: 480px), (pointer: coarse)` del `::after` de 44 px (UX-H6 de 0010; se extiende
`layoutCss.test.ts`).

**g) Movimiento:** la fila nueva conserva `props-form-in` (`--dur-fast`). Con `reduced-motion` no
hay animación (V-14 de 0010).

### 2.5 Fronteras de salida
| Frontera | Para qué | Implementación concreta |
|---|---|---|
| DOM (portal del menú) | Que ningún `overflow` (caja o `.props-form-scroll`) recorte el menú | `createPortal(…, document.body)` dentro de `useMenu`, como hoy `NoteMenu`. |
| *Bundle* (RNF-002) | No superar los presupuestos de 0010 | Todo el código nuevo va en el chunk `NoteEditor` (lo importan `PropertiesPanel`/`Form`); la entrada no cambia. |

**Presupuestos (RNF-002 = P-9 de 0010, sin tocar `check-bundle.mjs`):** entrada ≤ **157 020 B** gzip
y editor ≤ **357 388 B** gzip. Última medida registrada (`50a5bec`, cierre de 0010): entrada
147 600 B y editor 346 952 B, con ≈ 10,2 KiB de margen en el editor. Estimación para 0012:
**+3 a +5 KiB** en el editor (7 glifos ≈ 0,8 KiB, `PropertyMenu` + `useMenu` + `PropertyRow` ≈ 2–3
KiB; se eliminan `props-form-head` y el CSS apilado) y **+0** en la entrada. T-001 mide la línea
base real en el HEAD de la rama, que ya incluye 0011. Si el editor quedara a menos de 2 KiB del
tope, es un hallazgo y se aplica la Directiva de Pausa (no se sube el umbral).

## 3. Modelo de datos
Sin cambios (spec §3). `frontmatter` mantiene tipos, orden, 64 KiB y 32 niveles. `displayKind`
**nunca** se persiste.

## 4. Contratos
| Archivo en `contracts/` | Frontera | Gate(s) de CI |
|---|---|---|
| — (ninguno) | Sin cambios de E/S | — |

Contrato interno que se conserva y que vigilan los tests: los nombres accesibles «Propiedades»
(grupo), «Propiedad: {k}», «Clave de la propiedad {n}», «Valor de «k»», «Añadir elemento a «k»»,
«Quitar {elemento}», «Añadir propiedad», «Mostrar n más» y la casilla «Sí|No».
`NoteEditorFrontmatter.test.tsx` y los e2e de 0010 dependen de ellos.

## 5. Estrategia de pruebas (por zona)

### 5.1 Tabla por zona
| Zona | Qué se prueba | Herramienta / archivo |
|---|---|---|
| Núcleo | `isIsoDate` (válidas, bisiesto, mes 13, día 31 de abril, `2026-1-01`, espacios, hora, `""`); `displayKind` en los 6 tipos y en que no muta `row` | vitest `editor/properties.test.ts` |
| Componente — fila | Un glifo **distinto** por `DisplayKind`: los 6 `innerHTML` de SVG son distintos entre sí; `data-prop-kind`; columnas en el orden icono → clave → valor | vitest `editor/PropertyRow.test.tsx` (nuevo) |
| Componente — lectura | Tests de 0010 adaptados (§5.2) + icono por fila y fecha ISO con `Calendar` + sin cabecera + clave con `title` | vitest `editor/PropertiesPanel.test.tsx` |
| Componente — menú | APG: `aria-haspopup`/`expanded`/`controls`; Enter, Espacio y ↓ abren en el primero; ↑ en el último; ciclo; Inicio y Fin; Esc y Tab devuelven el foco al icono; clic fuera; `menuitemradio` con `aria-checked`; sin grupo «Tipo» en lo complejo; scroll y resize cierran | vitest `editor/PropertyMenu.test.tsx` (nuevo) |
| Componente — hook | El comportamiento de `NoteMenu`, sin cambios | vitest `editor/NoteMenu.test.tsx` (**sin cambios**, red de seguridad) |
| Componente — edición | Tests de 0010 adaptados (§5.2) + menú por fila + ausencia de `combobox` y de × de fila + icono que sigue al valor (fecha ↔ texto) | vitest `editor/PropertiesForm.test.tsx` |
| Componente — editor | P-14: guardar con una clave vacía **no** guarda y enfoca el resumen | vitest `editor/NoteEditorFrontmatter.test.tsx` (test nuevo; los existentes no cambian) |
| Estilos (estático) | Contraste de pastilla, «×», iconos y fila con hover; sin `--text-muted`/`--accent` como texto; `::after` de 44 px para `.prop-type-button` y `.note-chip-remove` | vitest `editor/contrast.test.ts`, `notes/layoutCss.test.ts` (sólo **se añaden** casos) |
| Sistema — fidelidad y medidas | §5.3 | Chromium `e2e/properties-visual.spec.ts` (nuevo) |
| Sistema — regresión 0010 | V-1/V-2/M-2 adaptados (§5.2), V-13 de colores, V-14 de movimiento, V-11 del menú ⋮, **RF-044 de migración sin cambios** | Chromium `e2e/content-visual.spec.ts` |
| Sistema — rendimiento | RNF-001 de 0010 (p95 64/120/181 KiB) y del *bundle* | `e2e/content-perf.spec.ts`, `npm run test:bundle` |

### 5.2 Adaptación de los tests de 0010: cada cambio de selector
Regla: un selector puede cambiar porque cambió el marcado; una aserción **nunca** se quita ni se
relaja. Donde el control desaparece (cabecera, `select`, × de fila), la aserción se **invierte** a
«no existe», que es más estricta, y su función se prueba por la vía nueva.

**`PropertiesPanel.test.tsx`**
| Test (RF de 0010) | Cambio | Por qué no se debilita |
|---|---|---|
| dt/dd en orden (RF-009) | Ninguno (`dt.textContent` sigue siendo la clave). **Se añade:** cada `dt` contiene un `svg[data-prop-kind]` y la `.note-prop-key` tiene `title` = clave. | Igual + más. |
| booleano Sí/No (RF-009) | `panel().querySelectorAll("svg[aria-hidden='true']").length === 2` → `panel().querySelectorAll("dd svg[aria-hidden='true']").length === 2`. Hay que acotarlo a los `dd` porque ahora cada `dt` lleva el icono de tipo. **Se añade:** los 2 `dt` llevan `data-prop-kind="boolean"`. | Sin acotar, el recuento sería 4 y el test cambiaría de significado. Acotado conserva el «2 iconos de valor». |
| lista en chips (RF-009) | Ninguno (`.note-chip` se conserva). | — |
| complejo (RF-013) | `panel().querySelector("svg[aria-hidden='true']")` no nulo → `panel().querySelector("dd svg[aria-hidden='true']")` no nulo (el `Lock`). | **Sin acotar el test pasaría siempre** por el icono de tipo `Braces`: eso sí sería debilitarlo. Acotado prueba el candado. |
| (vacío), sin panel, RNF-003, «Mostrar n más», nada enfocable | Ninguno. | — |

**`PropertiesForm.test.tsx`**
| Test (RF de 0010) | Cambio | Por qué no se debilita |
|---|---|---|
| fila con controles nombrados y cabecera (RF-011) | `combobox "Tipo de «titulo»"` con valor `text` → `button "Opciones de «titulo», tipo Texto"` (`aria-haspopup="menu"`); al abrirlo, el `menuitemradio "Texto"` lleva `aria-checked="true"`. Opciones: los nombres de los `menuitemradio` = `["Texto","Número","Sí/No","Lista"]` (antes `option`). `button "Quitar propiedad titulo"` → el `menuitem "Quitar"` del menú de esa fila. Cabecera: `getByText("Clave"/"Tipo"/"Valor")` presente → **ausente** (RF-001 de 0012). **Se añade:** `queryByRole("combobox")` y `queryByRole("button", {name: /^Quitar propiedad/})` son nulos en reposo (RF-005). | La lista de tipos, el tipo vigente y la disponibilidad de «Quitar» siguen comprobados con igual precisión. La cabecera pasa de «existe» a «no existe» porque la spec la sustituye. |
| controles por tipo (RF-011) | Ninguno (número `inputmode=decimal`, casilla «Sí», «Quitar a», «Añadir elemento a «etiquetas»»). | — |
| sin propiedades → «Añadir propiedad» (RF-010) | Ninguno. | — |
| editar clave y valor emite (RF-011) | Ninguno. | — |
| quitar → anuncio y foco a la clave siguiente (RF-011) | `click(button "Quitar propiedad a")` → `click(button "Opciones de «a», tipo Texto")` + `click(menuitem "Quitar")`. Mismas 5 aserciones. **Se añade:** el menú ya no está en el DOM. | Mismas aserciones; sólo cambia cómo se llega. |
| quitar la última → foco en «Añadir propiedad» (RF-011) | Igual que el anterior. | Idem. |
| cambiar de tipo convierte y anuncia (RF-011) | `selectOptions(combobox "Tipo de «n»", "number")` → abrir «Opciones de «n», tipo Texto» + `click(menuitemradio "Número")`. Mismas 3 aserciones. **Se añade:** el foco vuelve al icono y su nombre pasa a «…, tipo Número». | Idem + más. |
| lista: Enter, coma, pegar, sin enviar (RF-011) | Ninguno (`.note-chip`, «Quitar b»). | — |
| complejo: sólo lectura, sin tipo, Quitar activo (RF-013) | `row.queryByRole("combobox")` nulo → al abrir «Opciones de «config», tipo Complejo» **no** hay `menuitemradio` ni grupo «Tipo». `button "Quitar propiedad config"` habilitado → `menuitem "Quitar"` sin `aria-disabled`. | Mismo significado («no se puede cambiar el tipo; sí se puede quitar»). |
| errores al salir del campo, `validate()` ×2, Sí/No alterna | Ninguno (nombres de clave, valor y casilla conservados). | — |

**`NoteEditorFrontmatter.test.tsx`**: sin cambios en los tests existentes (sólo usa «Valor de «k»»).
Se añade el test de P-14.

**`notes/layoutCss.test.ts`** (UX-H6): la lista `[".note-crumb-more", ".code-block-copy",
".props-form-bool"]` **gana** `.prop-type-button` y `.note-chip-remove`; no se quita nada.

**`e2e/content-visual.spec.ts`** (0010, P-12): se adapta en su sitio.
- **V-1** (×6): R-3 sin cambios. El orden de los `dt` sigue igual. «Sí/No», el recuento de chips,
  `code`, «(vacío)» y «nada enfocable» no cambian. R-4k: «tamaño de la clave 12px» → **13px** (P-7);
  el color sigue en `--text-secondary`. R-4v sin cambios. A 390: «valor bajo su clave»
  (`dd.y > dt.y + dt.h - 1`) → **misma fila** (`|dd.y − dt.y| ≤ 8`), como ya se exige en escritorio
  (P-8).
- **V-2** (×6): `combobox /^Tipo de «/` visible → `button /^Opciones de «/` visible y
  **`combobox` con recuento 0**. `button /^Quitar propiedad /` visible → **recuento 0**, y «Quitar»
  aparece al abrir el menú. R-16 (160/96/1fr/28, controles de 28 y separación de 8) → R-16′: icono
  28 × 28, clave = `clamp(96px, 30%, 176px)` ±1, controles de 28 ±1, separación icono → clave 8 ±1.
  A 390 se sustituye «el tipo va bajo la clave» por «icono, clave y valor en la misma fila». El foco
  visible no cambia. `expectNoPageScroll` no cambia.
- **M-2**: sin cambios (`.props-form-scroll` se conserva).
- **V-13 / V-14 / V-11 / V-2 RF-044**: **sin cambios**. Se vuelven a ejecutar.

### 5.3 E2E nuevo — `frontend/e2e/properties-visual.spec.ts` (Chromium, RNF-001)
Siembra: se añade a `e2e/content-notes.ts` la nota `props-obsidian`, que imita la referencia:
`título` largo, `fecha_creación: "2026-10-27"`,
`última_actualización_del_documento_maestro: "2026-10-27"` (clave larga para la elipsis), `tipo`,
`tags` con 6 pastillas (una de 60 caracteres), `status`, `paginas: 12`, `publicado: true` y
`meta: {a: 1}`. La V-0 de 0010 la cuenta sola (`CONTENT_NOTES.length`).

Combinaciones: `THEMES × [1440, 1024, 390]`. Las capturas son de 1440 y 390 en los dos temas, en
lectura y en edición: 8 capturas en `/tmp/s12/e2e/props-{read|edit}-{theme}-{w}.png`.

| Prueba | Medidas (todas con `expectMeasure`/`expectExact`) | RF |
|---|---|---|
| **PV-1 lectura** ×6 | Una fila por clave en orden, con `data-prop-kind` = `[text, date, date, text, list, text, number, boolean, complex]`. **Sin cabecera**: ningún texto «Clave», «Tipo» ni «Valor» en el panel. Fila de una línea con alto **32 ±1**. Columna de la clave = `clamp(96, 30 % de la fila, 176)` ±1. Clave larga: `scrollWidth > clientWidth`, `text-overflow: ellipsis`, `textContent` y `title` iguales a la clave completa. Valor largo: alto > 32 (salta de línea) y `right` ≤ `right` de la caja. Pastillas: todas dentro de la caja; a 390, ≥ 2 líneas de pastillas. **Sin scroll horizontal**: `panel.scrollWidth ≤ panel.clientWidth` y `expectNoPageScroll`. Captura. | RF-001, RF-002, RF-003, RF-004, RF-007, RF-010 |
| **PV-2 edición** ×6 | Igual que PV-1 sobre las filas `group "Propiedad: …"`. 0 `combobox`. 0 `button /^Quitar propiedad/`. Icono 28 × 28 ±1. Controles con alto 28 ±1. Fila de 32 ±1. Sin scroll horizontal. Al pulsar «Editar» la columna de clave **no se mueve** (Δx ≤ 1 respecto a la lectura). Captura. | RF-001, RF-003, RF-004, RF-005 |
| **PV-3 menú y teclado** (oscuro 1440 + claro 390) | Tab hasta el icono y Enter: foco en «Texto». ↓↓: «Sí/No». Esc: foco en el icono. Reabrir y Tab: menú cerrado y foco en el icono. Elegir «Número» en «paginas» con el valor «12»: el icono pasa a `number` y el nombre a «…, tipo Número». «Quitar» en `status`: fila fuera y foco en la clave siguiente. Caja del menú dentro del *viewport* a 390. | RF-005, RF-006, RF-008 |
| **PV-4 pastillas en edición** (oscuro 1440) | Quitar `tags[1]` con su ×, añadir «nuevo» con Enter, **Guardar**, reabrir en lectura: tags = esperado. | RF-003, RF-009 |
| **PV-5 contraste y tokens** (×2 temas) | Color calculado: clave = `--text-secondary`, valor = `--text-primary`, texto de la pastilla = `--text-primary` y fondo = `--accent-soft`. Contraste de la pastilla ≥ 4,5 con la fórmula de la spec. Iconos y × ≥ 3 sobre su fondo. Ningún elemento de `.note-properties` con `color` = `--accent` o `--text-muted`. Anillo de foco 2 px `--accent` en el icono, la clave y el valor. | RF-008, RNF-001 |
| **PV-6 táctil** (`touch: true`, 390) | `.prop-type-button` de 36 ±1 y área de golpe ≥ 44 (el `::after`, medido con `elementFromPoint` en el borde). | RF-008 |
| **PV-7 fecha ISO** (oscuro 1440) | Lectura: `fecha_creación` → `date`. Edición: escribir «hola» en su valor → `text`; volver a «2026-10-27» → `date`. El menú marca «Texto». Guardar y pasar a Código: la línea YAML es `fecha_creación: 2026-10-27` y el valor sigue siendo string (lo garantiza RF-018 de 0010; se comprueba con el `frontmatter` del documento leído por la API de test). | RF-010 |

## 6. Secuenciación (tests antes que código; maquetación primero)
1. **Línea base** (T-001…T-003): instalar, suites de editor, *bundle*, capturas «antes».
2. **Núcleo** (rojo → verde): `isIsoDate`, `displayKind`.
3. **Maquetación de lectura** (rojo → verde): `PropertyRow` + mapa de iconos → `PropertiesPanel`
   (tests adaptados primero) → CSS → `content-notes` + PV-1 en Chromium → **checkpoint visual
   temprano** (T-017): AIRA compara las capturas de lectura con la referencia **antes** de tocar la
   edición.
4. **Menú** (rojo → verde): extraer `useMenu` (con `NoteMenu.test.tsx` en verde antes y después) →
   `PropertyMenu`.
5. **Edición** (rojo → verde): `PropertiesForm` (tests adaptados primero, uno por cambio de §5.2) →
   CSS → PV-2…PV-7 → **checkpoint visual de edición** (T-035).
6. **P-14** (si GATE 2 lo acepta): test rojo en `NoteEditorFrontmatter` → `ref` + `validate()`.
7. **Regresión de 0010**: V-1/V-2 adaptados, `contrast`/`layoutCss` ampliados, suite completa,
   `test:bundle`, Chromium completo, `content-perf`, RF-044.
8. **Documentación y re-anclaje**: §8, `covers`, re-anclaje de 0010 y gate.

## 7. Seguimiento de complejidad
| Excepción a la simplicidad | Justificación |
|---|---|
| Hook `useMenu` extraído de `NoteMenu` | Hay dos menús APG con teclado idéntico. Duplicar unas 70 líneas crearía dos canónicos que se desviarían (Art. 12.4). El riesgo de regresión lo cubren los 11 tests de `NoteMenu` y la V-11, que no cambian. |
| `dt { display: contents }` | Mantiene un `dl` válido (sin un `svg` hijo del `div` de la fila) y a la vez la rejilla de 3 columnas compartida con la edición. |

## 8. Impacto en documentación (Constitución Art. 11; mapa en `AGENTS.md`)
| Documento del mapa | Qué cambia | Acción |
|---|---|---|
| `frontend/src/README.md` (fila de `editor/properties.ts`, `PropertiesPanel/Form.tsx`) | Módulos nuevos `PropertyRow`, `PropertyMenu` y `useMenu`; `displayKind`/`isIsoDate`; la presentación de fila (icono · clave · valor) y el menú de tipo | actualizar (tarea `[doc]`) |
| `frontend/README.md` (sección `e2e/`) | Nueva `e2e/properties-visual.spec.ts` y su comando (`VISUAL_OUT_DIR=/tmp/s12/e2e … -- e2e/properties-visual.spec.ts`) | actualizar (tarea `[doc]`) |
| `.harness/specs/0010-contenido-markdown-completo/spec.md` | Nota en RF-009/RF-011 y en D2: «presentación sustituida por SPEC-0012 (D1)»; re-anclaje (`anchor_commit`) porque 0012 toca archivos de su `covers` (`frontend/src/editor/**`, `e2e/content-visual.spec.ts`, `src/notes/*.test.ts`; P-15) | actualizar (tarea `[doc]`) |
| `.harness/specs/0010-contenido-markdown-completo/plan.md` §2.3-b/c | Nota «sustituido por PLAN-0012 §2.3» (la regla P-2 y los tokens siguen vigentes) | actualizar (tarea `[doc]`) |
| `docs/API.md`, `ARCHIFY.md` y diagramas | Sin cambios: ni endpoints ni flujo de datos | verificado: sin acción |
| `.harness/decisions/ADR-*` | Sin decisión de arquitectura nueva (D2 de 0010 se revisa en la spec, no en un ADR) | verificado: sin acción |

## 9. Implementación por requisito

### Implementación de RF-001
Una fila por propiedad (icono · clave · valor), sin cabecera, en lectura y en edición.
`editor/PropertyRow.tsx`, `editor/PropertiesPanel.tsx`, `editor/PropertiesForm.tsx` (se quita
`props-form-head`), `editor/editor.css`. Tests: `PropertyRow.test.tsx`, `PropertiesPanel.test.tsx`,
`PropertiesForm.test.tsx`; e2e PV-1, PV-2 y V-1/V-2 adaptados.

### Implementación de RF-002
Glifo distinto por tipo: `PROPERTY_ICONS`/`KIND_LABELS` en `editor/PropertyRow.tsx`; `displayKind`
en `editor/properties.ts`. Tests: `PropertyRow.test.tsx` (6 SVG distintos), `properties.test.ts`; e2e
PV-1.

### Implementación de RF-003
Pastillas en línea con salto de línea; × y «Añadir elemento» en edición. `PropertiesPanel.tsx`
(`Value`), `PropertiesForm.tsx` (`ListControl`), `editor.css` (`.note-chip*`). Tests:
`PropertiesPanel.test.tsx`, `PropertiesForm.test.tsx` (test de lista sin cambios); e2e PV-1, PV-2 y
PV-4.

### Implementación de RF-004
Sin scroll horizontal; elipsis + nombre completo. `editor.css` (`--prop-key-w`, `min-width: 0`,
elipsis, `overflow-wrap`), `PropertiesPanel.tsx` (`title`), `PropertiesForm.tsx`. Tests:
`PropertiesPanel.test.tsx` (`title`); e2e PV-1/PV-2 a 390, 1024 y 1440.

### Implementación de RF-005
Edición en línea sin selector ni × visibles; «Añadir propiedad» al final. `PropertiesForm.tsx`,
`editor.css`. Tests: `PropertiesForm.test.tsx` (ausencias + flujos); e2e PV-2 y V-2 adaptado.

### Implementación de RF-006
Menú del icono con «Tipo» y «Quitar»; conversiones de 0010. `editor/PropertyMenu.tsx`,
`editor/useMenu.ts`, `editor/NoteMenu.tsx` (refactor sin cambio de comportamiento),
`PropertiesForm.tsx` (`changeType`/`remove` desde el menú). Tests: `PropertyMenu.test.tsx`,
`PropertiesForm.test.tsx`, `NoteMenu.test.tsx` (sin cambios); e2e PV-3.

### Implementación de RF-007
Lectura sin controles: la casilla no es interactiva y lo complejo es texto de sólo lectura.
`PropertiesPanel.tsx`. Tests: `PropertiesPanel.test.tsx` («nada enfocable», booleano, complejo);
e2e PV-1.

### Implementación de RF-008
Nombres accesibles, APG, foco visible, objetivos ≥ 24/44 y contraste P-2. `PropertyMenu.tsx`,
`useMenu.ts`, `editor.css`. Tests: `PropertyMenu.test.tsx`, `contrast.test.ts` (pares nuevos),
`layoutCss.test.ts` (`::after`); e2e PV-3, PV-5 y PV-6.

### Implementación de RF-009
No regresión funcional de 0010 (RF-009…RF-018, RF-044, RF-045). Tests de 0010 adaptados según §5.2
**sin debilitar**; `NoteEditorFrontmatter.test.tsx`, `frontmatter.test.ts` y `properties.test.ts`
sin cambios en lo existente; e2e V-1/V-2 adaptados, V-2 RF-044 sin cambios, PV-4; P-14 en
`NoteEditor.tsx` si se acepta.

### Implementación de RF-010
Icono de calendario en los textos con forma de fecha ISO. `isIsoDate`/`displayKind` en
`properties.ts`, `PropertyRow.tsx` (`Calendar`) y `PropertyMenu.tsx` (nombre «… (fecha)»). Tests:
`properties.test.ts`, `PropertiesPanel.test.tsx`, `PropertiesForm.test.tsx`; e2e PV-7.

### Implementación de RNF-001
Capturas reales de Chromium, lectura y edición, claro y oscuro, a 390 y 1440, comparadas con
`reference/propiedades-obsidian-referencia.png` en dos checkpoints (T-017 y T-035). Se comparan la
maquetación, la densidad y la iconografía, no la paleta: la de Synapse es la de 1.1.4.1. Archivos:
`e2e/properties-visual.spec.ts` y `e2e/content-notes.ts`.

### Implementación de RNF-002
`npm run build && npm run test:bundle` (sin cambiar los umbrales de `check-bundle.mjs`) y
`e2e/content-perf.spec.ts` (RNF-001 de 0010) en la regresión.

## 10. Decisiones abiertas (P-n) — para el GATE 2
| P-n | Decisión | Alternativas | Recomendación |
|---|---|---|---|
| **P-1 · Arquitectura** | Mantener **dos contenedores** (`PropertiesPanel` sin estado y `PropertiesForm` con estado, `validate()` y anuncios) que comparten `PropertyRow` (maquetación) y el mapa de iconos | (a) Un solo componente `mode="read"/"edit"`; (b) dos componentes sin pieza compartida | **Dos contenedores + fila compartida.** Los contratos difieren: la lectura no tiene estado ni nada enfocable; la edición tiene estado no controlado, `ref` y foco. `NoteEditor` los monta con `key`s distintas. Unirlos metería estado en la ruta de lectura. La fila compartida garantiza la misma geometría, que es el objetivo visual, sin mezclar estados. |
| **P-2 · Mapa de iconos** | texto `TextAlignStart`, fecha `Calendar`, número `Hash`, sí/no `ToggleRight`, lista `List`, complejo `Braces`; menú `Check` + `Trash2` | `Binary` para número (Obsidian); `SquareCheck` para sí/no; `Tags` para lista | **El de la izquierda.** Son 7 glifos nuevos que ningún icono curado cubre, ≈ 0,8 KiB. `SquareCheck` se descarta porque duplica el icono del valor booleano. |
| **P-3 · Forma del menú** | Menú plano: grupo «Tipo» con 4 `menuitemradio` + separador + «Quitar» | Submenú «Tipo ›» (APG *menubar*/submenu); `listbox` | **Plano.** Un nivel de teclado, igual que `NoteMenu`; `menuitemradio` expone el tipo vigente. Un submenú añade ←/→ y focos anidados sin ganar nada con 5 ítems. |
| **P-4 · `useMenu` compartido** | Extraer el comportamiento APG de `NoteMenu` a `editor/useMenu.ts` y usarlo en los dos menús | Duplicar la lógica en `PropertyMenu` | **Extraer** (un canon; §7). `NoteMenu.test.tsx` y la V-11 no cambian y se ejecutan antes y después. |
| **P-5 · Inputs en línea** | Sin borde ni fondo en reposo; `--bg-secondary` al pasar el ratón; borde `--accent` + anillo con el foco; `aria-invalid` con el borde siempre visible | Borde `--border-control` siempre (≥ 3:1, como 0010) | **Sin borde en reposo** (es lo que pide la referencia). Se está en edición explícita (botón «Editar»); el icono-menú y «Añadir propiedad» son controles visibles; el error nunca depende del hover. Riesgo R-1 (WCAG 1.4.11 discutible): si el GATE 2 lo prefiere, la alternativa sólo cambia CSS. |
| **P-6 · Título visible «Propiedades»** | Rótulo de 13 px y 600 `--text-secondary` arriba de la caja, que da nombre al grupo (`aria-labelledby`) | Sin título (como 0010, sólo `aria-label`) | **Con título**, como la referencia. No es una cabecera de columnas (RF-001) y el nombre del grupo sigue siendo «Propiedades». No se pliega: plegar está fuera de alcance. |
| **P-7 · Tipografía de la clave** | Fuente UI 13 px `--text-secondary` | Mono 12 px (R-4 de 0010) | **UI 13 px**, como la referencia. Cambia R-4k de V-1 (§5.2). |
| **P-8 · 390 px** | Misma fila de 3 columnas con la clave `clamp(96px, 30%, 176px)`; alto mínimo 32 (36 táctil) | Apilar clave sobre valor (0010) | **Una fila**, como Obsidian en móvil. Con ≈ 100 px de clave y elipsis, el valor conserva ≈ 190 px. Cambia la aserción de 390 de V-1/V-2 (§5.2). |
| **P-9 · Pastillas** | Texto `--text-primary` sobre `--accent-soft` (10,3/14,6:1), 24 px, `--radius-xs`, elipsis en las largas, × con área de 24 (44 táctil) | Texto de acento como Obsidian (`--accent-hover`: 4,37:1 en claro, **no cumple**) | **`--text-primary`.** Mantiene P-2 de 0010 y el contraste en los dos temas. |
| **P-10 · Muchas propiedades** | Conservar «Mostrar n más» (≥ 10) en lectura y el scroll interno de > 8 filas con sombras en edición | Quitar ambos (Obsidian lo enseña todo) | **Conservar.** No es presentación de fila, M-2/P-16 de 0010 ya están probados y quitarlos sería otra decisión. |
| **P-11 · Nombres accesibles** | Icono: `Opciones de «k», tipo T` (con «(fecha)» si aplica); el resto, los de 0010 | `Tipo de «k»` (reusar el nombre del `select`) | **«Opciones de…»**: el botón abre tipo **y** quitar. Incluir el tipo hace que el lector de pantalla lo anuncie sin abrir el menú. |
| **P-12 · E2E de 0010** | Adaptar V-1/V-2 **en su sitio** (lista §5.2) y crear `properties-visual.spec.ts` sólo para lo nuevo; sembrar `props-obsidian` en `content-notes.ts` | Mover V-1/V-2 al archivo nuevo | **Adaptar en su sitio.** La trazabilidad de RF-009/RF-011 de 0010 sigue donde estaba; el archivo nuevo sólo tiene lo de 0012. |
| **P-13 · Dónde va el CSS** | Seguir en `editor/editor.css` | `editor/properties.css` propio | **`editor.css`.** Así las guardas estáticas existentes (`contrast.test.ts`: sin `--text-muted`/`--accent` como texto; `layoutCss.test.ts`: sin colores literales y `::after` de 44) cubren el CSS nuevo sin tocarlas. |
| **P-14 · Validar al guardar (defecto de 0010)** | Pasar un `ref` a `PropertiesForm` y llamar a `validate()` en `NoteEditor.save` desde Visual; con errores no guarda y el foco va al resumen | Registrarlo en el *backlog* de 0010 y no tocarlo aquí | **Incluir en 0012** (T-036/T-037, dos tareas). Hoy una clave vacía o repetida se descarta **en silencio** al guardar, y la edición en línea lo hace más probable. Es la raíz (Art. 10). Si el GATE 2 lo rechaza, esas dos tareas pasan al *backlog* y lo demás no cambia. |
| **P-15 · Re-anclaje de 0010** | 0012 toca archivos del `covers` estricto de 0010 (`frontend/src/editor/**`, `e2e/content-visual.spec.ts`, `e2e/content-notes.ts` por `fixtures`, `src/notes/layoutCss.test.ts`). Al cerrar se anota en la spec de 0010 que su presentación de RF-009/RF-011 la sustituye SPEC-0012 y se actualiza `anchor_commit` | Quitar de `covers` de 0010 los archivos de propiedades | **Nota + re-anclaje** (T-046). La propiedad de 0010 sobre `editor/**` se queda; 0012 declara sus archivos. |
| **P-16 · Servicios e2e** | `COUCHDB_URL=http://localhost:15999` (contenedor `synapse-0012-couchdb`), `VISUAL_PORT=8022`, `VISUAL_OUT_DIR=/tmp/s12/e2e`, referencia en `/tmp/s12/ref/` | Los de 0010/0011 (:15984/:15985, :8010/:8011) | **Propios.** `conftest.py` y `visual.sh` borran bases `synapse_user_*` del CouchDB al que apuntan. |
| **P-17 · Formato de la fecha** | El valor se muestra tal como se guarda (`2026-10-27`); sólo cambia el icono | Localizarlo (`27/10/2026`, como Obsidian) | **Tal cual.** D-5 dice «sólo presentación del icono, se edita como texto». Mostrar otro texto distinto del que se edita confunde. |
| **P-18 · Icono de tipo en lectura** | `aria-hidden` (decorativo); el tipo no se anuncia en lectura | `role="img"` con `aria-label` = tipo | **Decorativo.** Leer «Texto, título, …» por fila es ruido; el valor ya transmite el tipo (Sí/No, lista, número). En edición el tipo sí se anuncia (P-11). |

## 11. Riesgos
| Riesgo | Mitigación |
|---|---|
| **R-1 · Inputs sin borde (P-5)**: un revisor puede leerlo como incumplimiento de WCAG 1.4.11 (identificar el componente) | P-5 queda explícita para el GATE 2. La alternativa (borde `--border-control`) es un cambio sólo de CSS y PV-2 mide ambas. |
| **R-2 · Margen del chunk del editor ≈ 10 KiB** | T-001 mide la línea base real (con 0011). Estimación +3–5 KiB. Si el margen restante baja de 2 KiB, se aplica la Directiva de Pausa; nunca se sube el umbral. |
| **R-3 · Regresión de `NoteMenu` al extraer `useMenu`** | Los 11 tests de `NoteMenu` y la V-11 se ejecutan sin cambios antes (T-018) y después (T-020). |
| **R-4 · Menú en un portal desde un scroller** (`.props-form-scroll`): queda desanclado al hacer scroll | `useMenu` cierra el menú con `scroll` (captura) y `resize`, con su test en `PropertyMenu.test.tsx`. |
| **R-5 · Drift estricto de 0010** (P-15) | Tarea explícita de re-anclaje + nota en spec y plan de 0010; el gate la verifica. |
| **R-6 · P-14 cambia el guardado** | Es un cambio de comportamiento: con errores ya no se guarda. Se prueba en rojo primero; los tests de guardado de `NoteEditorFrontmatter` siguen en verde. |
| **R-7 · Fidelidad subjetiva**: la referencia es de Obsidian, con otra paleta y otra tipografía | Se compara maquetación (fila, columnas, alto, pastillas, iconos), no colores. Las medidas objetivas de PV-1/PV-2 son la evidencia; el checkpoint T-017 es temprano para corregir antes de la edición. |
| **R-8 · Elipsis en `<input>`** | Chromium aplica `text-overflow` al `input` sin foco; con foco se ve el texto entero desplazable. El nombre accesible y el valor siempre están completos. PV-2 lo mide sin foco. |
| **R-9 · Método**: el `method.md` del worktree es *Slice Development* v0.1 (piloto), no SDD Anchored v1.9 | Por instrucción del coordinador, esta feature sigue la estructura spec/plan/tasks y el orden de v1.9 (maquetación primero, capturas reales). Si la decisión es pasarla a historia, se reetiqueta sin rehacer el contenido. |
