---
id: PLAN-0010
tipo: plan
feature: 0010-contenido-markdown-completo
estado: implemented
aprobaciones:
  fase_2: { por: "AIRA en nombre de Carlos Jiménez (cjhirashi), autoridad delegada", fecha: 2026-10-24, nota: "P-1, P-2, P-7 y P-17 aceptados tal cual; resto de P-n con la recomendación del plan; captura de career-admin autorizada sólo lectura sobre :8002" }
actualizado: 2026-10-24
---

# PLAN-0010 · Contenido Markdown completo

> El *cómo* de SPEC-0010 (aprobada en GATE 1: 65 RF + 5 RNF, RF-052 incluido) en el patrón
> por-capas con puertos (ADR-001): en el servidor `core (reglas puras) → services → routers`, y en
> el cliente **módulos puros sin React** (reglas, conversión YAML, historial, carpetas, migas) +
> componentes que sólo los llaman. Las decisiones de producto de spec §6 no se reabren; lo que este
> plan decide y necesita el visto bueno del GATE 2 está en §7 (P-1…P-16).
>
> **Orden (method.md v1.9, Fase 2): maquetación primero.** (A) estilos y estructura de todos los
> componentes con datos simulados (notas sembradas por `/sync` con `frontmatter`, tablas, código,
> Mermaid, rutas profundas); (B) revisión visual temprana con capturas; (C) lógica: frontmatter de
> ida y vuelta, carpetas y bug `.md` en servidor y cliente, portapapeles, resaltado real, Mermaid,
> historial; (D) verificación completa con el experto-ux-ui usando otra vez `ui-ux-pro-max` como
> validador; (E) documentación. Ver §6.
>
> **Entradas de diseño.**
> - Requisitos UX del experto-ux-ui con la skill `ui-ux-pro-max` (ADR-005):
>   `/tmp/s10/ux/ux-0010.md` (2026-10-24, 663 líneas, cálculo de contraste reproducible en
>   `/tmp/s10/ux/contrast.py`). **`/tmp` no es persistente:** todo lo que se verificará (tokens,
>   medidas, estados, contrastes, teclado, lector de pantalla, responsive, reduced-motion y sus
>   14 conflictos) está **copiado** en §2.3, §5.4, §5.5 y §7 de este plan; el archivo sólo se cita.
> - Mockup `diseño/1.1.4 - Diseño UI-UX/1.1.4.4 - Vista - Editor Principal.html` y sistema
>   `1.1.4.1 - Sistema de Diseño.md` (fuera de git: `diseño/` está en `.gitignore`; se leen en el
>   checkout principal). Valores CSS del mockup leídos del archivo el 2026-10-24 y congelados en §5.4.
> - Calidad de referencia: `cjhirashi-career/cjhirashi-career-admin`
>   (`src/components/career/CareerResourceView.tsx`: `CodeBlockPre`, `MermaidDiagram` con
>   `svg-pan-zoom`; `src/index.css` 278-560: tablas `width:max-content; min-width:100%`, celdas
>   `px-2 py-1`, envoltorio `.markdown-table-scroll`, `.mermaid-diagram`).
> - Estado actual en Chromium: `/tmp/s10/shots/` (filas de tabla ~62 px, 0 casillas de tarea, 0
>   `span` de resaltado en `pre` y en Código, YAML corrompido a `***`/`\[a, b]` tras guardar en
>   Visual, pegado de tabla como párrafos escapados, ruta `CarpetaVacia/.md`).

## 0. Gates de simplicidad
- [x] **Simplicity** — sin campo de modelo nuevo ni endpoint nuevo (spec §3); el `frontmatter` de
  0008 es la verdad (D1). Un solo cambio de regla compartida (`check_path`). Cada pieza nueva de UI
  la pide un RF; las bibliotecas nuevas son las mínimas medidas en §2.5.
- [x] **Anti-Abstraction** — un único registro de lenguajes (`editor/highlight/languages.ts`) sirve
  a las dos vistas (CodeMirror en Código y ProseMirror en lectura/Visual: mismas gramáticas Lezer,
  mismas clases); las *node views* son clases DOM simples de ProseMirror (sin `@milkdown/components`
  ni Vue, sin un puente React por bloque). Sin gestor de estado nuevo: el historial y la carpeta
  activa son estado del `Workspace` con un módulo puro.
- [x] **Integration-First** — `contracts/frontmatter-yaml.cases.json` (creado en este plan y
  validado contra una implementación de referencia con `yaml` 2.9.1: 0 fallos) fija la conversión
  YAML↔JSON antes del código; el delta del patrón de `path` de `note.schema.json` (§4) y los casos
  nuevos de `note_rules_cases.json` se escriben primero como tests rojos.

## 1. Cumplimiento constitucional
| Artículo | Cómo lo respeta este plan |
|---|---|
| Art. 1–2 (patrón) | Servidor: la regla nueva de ruta vive en `core/note_rules.py` (núcleo puro); `services/sync_push.py` ya la aplica (paso de validación) sin código nuevo; `routers/` no cambia. Cliente: la lógica pura vive en módulos sin React — `notes/noteRules.ts` (espejo), `notes/folders.ts`, `notes/noteHistory.ts`, `editor/frontmatter.ts`, `editor/properties.ts`, `editor/breadcrumb.ts`, `editor/highlight/*.ts`, `editor/mermaid/themeVariables.ts`; los componentes (`NoteEditor`, `NoteSidebar`, `PropertiesPanel/Form`, `NoteBreadcrumb`, `NoteMenu`) sólo los llaman; `notes/noteStore.ts` sigue siendo la única puerta de escritura a la réplica. |
| Art. 1 (dependencias nuevas, versión exacta) | Ejecución: `@milkdown/plugin-clipboard` **7.22.3** (mismo tren que Milkdown 7.22.3), `prosemirror-highlight` **0.16.0** (decoraciones; *peer* `prosemirror-view ^1.32.4`, se deduplica con el 1.42.7 de `@milkdown/prose`), `@codemirror/lang-yaml` **6.1.3**, `@codemirror/lang-python` **6.2.1**, `@codemirror/lang-sql` **6.10.0**, `@codemirror/lang-json` **6.0.2**, `@codemirror/legacy-modes` **6.5.5** (sólo `mode/shell`), `yaml` **2.9.1**, `mermaid` **11.17.2** (última 11.x; la spec fija 11.x, no 12.x), `svg-pan-zoom` **3.6.2**. Sin dependencias de desarrollo nuevas (Playwright 1.56.0 ya está, P-9 de 0009). Tamaños medidos en §2.5. |
| Art. 3 (testing) | TDD por zona (§5); ≥ 80 % por módulo tocado; regla de ruta en el push contra **CouchDB real**; fidelidad, rendimiento y red (carga diferida) medidos en **Chromium real** (contenedor Playwright 1.56.0, `npm run test:visual`), no en jsdom; presupuesto de *bundle* con un script que lee `dist/` (`npm run test:bundle`). |
| Art. 5 (seguridad) / P2–P3 | (1) Sin HTML crudo: el resaltado son `Decoration.inline` de ProseMirror y clases de CodeMirror (nodos de texto), los iconos de las *node views* se crean con `createElementNS` desde datos estáticos, propiedades y etiquetas se pintan como texto; guardián estático (`editor/securityGuard.test.ts`) prohíbe `innerHTML`, `outerHTML`, `insertAdjacentHTML` y `dangerouslySetInnerHTML` en `src/` (hoy hay 0). (2) **Única excepción (RNF-003): el SVG de Mermaid** en `securityLevel:"strict"`, `htmlLabels:false`, `secure` ampliado para que `%%{init}%%`/`config:` no cambien seguridad ni tema, `suppressErrorRendering:true`; el SVG se parsea con `DOMParser('image/svg+xml')` y se **verifica antes de insertarlo** (sin `script`, `foreignObject`, atributos `on*`, `href`/`xlink:href` navegables); si algo aparece, se descarta y se muestra el error (RF-049). (3) Enlaces e imágenes pegados pasan por los esquemas `safeLink`/`safeImage` existentes (el pegado crea nodos del esquema, que pintan con `safeUrl`). (4) `frontmatter` sigue validado en el push (`check_frontmatter`) y en el cliente (`checkFrontmatter`, RF-019). |
| Art. 6 (contratos/errores) | Sin errores HTTP nuevos (spec §3): el rechazo nuevo es `validation-error:path` del push, ya en el contrato de 0005. Delta del patrón `path` en `0008-vault-editor/contracts/note.schema.json` (§4). Contrato interno nuevo `contracts/frontmatter-yaml.cases.json` (tabla de tipos de RF-018). |
| Art. 10 (raíz) | La corrupción del YAML se corrige en su origen (D1: Milkdown nunca recibe el bloque; separación en `editor/frontmatter.ts`), no con un post-proceso del markdown; el bug `X/.md` se corrige en `titleToPath` **y** en la regla compartida (cliente y servidor), no con un `if` en el formulario; las filas altas de tabla se corrigen quitando el margen del párrafo de celda (causa medida), no fijando alturas. |
| Art. 11 (docs) | §8. |
| Art. 12 | Sin artefactos fuera de `spec/plan/tasks/contracts`; las medidas de referencia viven en §5.4; la extensión de tokens se registra en un ADR (`.harness/decisions/ADR-006-…`), P-1. |

## 2. Arquitectura de la feature (por-capas con puertos)

### 2.1 Núcleo (reglas puras)
**Servidor — `backend/app/core/note_rules.py`.** `check_path`: tras normalizar, además de lo actual,
el **último segmento no puede ser `.md` sin distinguir mayúsculas** (`segments[-1].lower() == ".md"`
→ `validation-error:path`). El orden no cambia: primero la validez sobre la forma normalizada,
después `not-normalized:path`; así `X/ .md` da `validation-error:path` (su forma normalizada
`X/.md` es inválida). `X/` ya era inválido (segmento vacío).

**Cliente — módulos puros:**
| Módulo | Contenido | RF |
|---|---|---|
| `notes/noteRules.ts` | `checkPath` con la misma regla (`/\.md$/i` sólo si el segmento **es** `.md`: `last.toLowerCase() === ".md"`). Batería común. | RF-007 |
| `notes/folders.ts` (nuevo) | `parentFolder(path)` (`""` = raíz), `ancestors(path)` (se mueve aquí desde `NoteSidebar`), `joinPath(folder, rel)`, `checkFolderName(name)` → `"empty" \| "empty-segment" \| "control" \| null` (trim de `White_Space` por segmento con `normalizePath`), `folderExists(summaries, parent, name)` (clave `pathKey` de `parent/name` contra los prefijos de carpeta de las notas activas). | RF-001, RF-003…RF-005, RF-042 |
| `notes/untitled.ts` | `nextUntitledPath(keys, folder = "")`: `"{folder}/Sin título.md"`, `"{folder}/Sin título 2.md"`… | RF-001, RF-003 |
| `notes/noteHistory.ts` (nuevo) | `History = {entries: string[]; index: number}`; `push(h, id)` (descarta "adelante", no duplica el actual, tope **50** quitando el más antiguo), `step(h, dir, isValid)` → `{history, target} \| null` (salta las entradas inválidas en esa dirección, RF-058), `canStep(h, dir, isValid)`; `load(storage, vaultId)` / `save(storage, vaultId, h)` en la clave `synapse:note-history:{vaultId}` de `sessionStorage` (forma validada al leer: ids de esa bóveda con `parseNoteId`; corrupta → historial vacío). | RF-056…RF-058 |
| `editor/frontmatter.ts` (nuevo, **chunk diferido**: única importación de `yaml`) | `splitFrontmatter(text)` → `{yaml: string \| null, body}` (línea 1 exactamente `---` hasta la siguiente exactamente `---`; `\n`/`\r\n`); `composeCode(fm, body)` (RF-014); `parseFrontmatterYaml(yaml)` → `{value} \| {error: code, line?}` con `parseDocument(src, {version:"1.2", schema:"core", uniqueKeys:true, intAsBigInt:true, strict:true})`: errores de sintaxis/duplicados del parser, *warnings* o etiquetas fuera del core → `unsupported-tag`, raíz no mapa → `not-a-map`, clave no escalar → `invalid-key`, clave vacía o nula → `empty-key`, `bigint` fuera de ±(2^53−1) → `unsafe-integer`, no finitos → `non-finite`, alias con `maxAliasCount:100`; `stringifyFrontmatter(fm)` con `{version:"1.2", schema:"core", lineWidth:0, minContentWidth:0}`; `classifyLegacy(fm, content)` → `none \| migrate \| looks-yaml` (regla de "corrompido" en el `_doc` del contrato). Contrato: `contracts/frontmatter-yaml.cases.json`. | RF-014…RF-019, RF-044, RF-045 |
| `editor/properties.ts` (nuevo) | Modelo del formulario: `toRows(fm)` (tipo inferido: `text`/`number`/`boolean`/`list`/`complex`), `fromRows(rows)` (orden de filas = orden de claves), `convert(value, from, to)` (reglas de §2.3-b; devuelve `{value, emptied}`), `validateRows(rows)` → errores por fila (`empty-key`, `duplicate-key` por igualdad exacta de clave, `invalid-number`), `parseNumberInput(text)` (`type="text" inputmode="decimal"`: decimal finito sin exponente; entero dentro del rango seguro). | RF-011…RF-013, RF-020 |
| `editor/breadcrumb.ts` (nuevo) | `crumbs(path)` → carpetas `{name, path}` + nombre de la nota (`displayName`); `fit(widths, available)` → anchos máximos por segmento (P-17: truncado **por segmento** con «…»; la primera carpeta y el nombre nunca desaparecen; se acortan antes las intermedias y por último el nombre), puro y probado sin *layout*. | RF-054, RF-063 |
| `editor/highlight/languages.ts` (nuevo) | **Registro único** de RF-030: `LanguageDescription.of({name, alias, load})` para `typescript`(`ts`), `javascript`(`js`), `tsx`, `python`(`py`), `json`, `shell`(`bash`,`sh`), `css`, `html`, `sql`, `yaml`(`yml`), `markdown`(`md`); `findLanguage(info)` sin distinguir mayúsculas (primera palabra de la info del bloque). Cargadores con `import()` (las gramáticas de js/ts/tsx/css/html/markdown ya van en el chunk del editor desde 0008 vía `@codemirror/lang-markdown`; python/sql/yaml/json/shell salen en chunks propios). | RF-027…RF-031 |
| `editor/highlight/highlighter.ts` (nuevo) | `tagHighlighter` de `@lezer/highlight` → clases `sx-keyword`, `sx-string`, `sx-number`, `sx-type`, `sx-function`, `sx-plain`, `sx-comment`, `sx-deletion`, `sx-heading1`, `sx-heading`, `sx-meta`, `sx-strong`, `sx-emphasis`, `sx-link`, `sx-url`, `sx-code`, `sx-quote`, `sx-atom` (tabla de §2.3-e). Lo usan **las dos** vistas. | RF-027…RF-029, RF-040 |
| `editor/mermaid/themeVariables.ts` (nuevo) | `themeVariables(read)` — lee los tokens resueltos (`getComputedStyle(documentElement)`), compone `--accent-soft` sobre `--bg-secondary` a hex opaco (`composite(rgba, bg)`) y devuelve el mapa de §2.3-f; `darkMode` según `data-theme`. | RF-050 |

### 2.2 Coordinación
| Módulo | Cambio | RF |
|---|---|---|
| `notes/noteStore.ts` | `titleToPath`: no añade `.md` si el último segmento queda vacío (`Carpeta/` sigue siendo `Carpeta/` y `checkPath` lo rechaza) — raíz del bug. `create(vaultId, title?, folder = "")`: título relativo a `folder` (`joinPath`), sin título → `nextUntitledPath(keys, folder)`. `save(id, content, baseRev, frontmatter?)`: `frontmatter` ausente = conserva el del documento; presente = se valida con `checkFrontmatter` (RF-019) y se escribe junto con `content` (también en `saveAsBranch`, que hoy copia el de la base). **Puerta RF-008:** `save` y `softDelete` rechazan con `NoteValidationError(["path"])` si la ruta guardada no pasa `checkPath` (P-12). | RF-001, RF-003, RF-007, RF-008, RF-012, RF-015, RF-019, RF-044 |
| `notes/messages.ts` | Mensajes: ruta inválida al guardar (RF-008, microcopy §2.3-h), carpeta vacía/tramo vacío/control/duplicada (RF-004/005), `frontmatter` > 64 KiB (RF-019), YAML inválido por código (RF-017). | RF-004, RF-005, RF-008, RF-017, RF-019 |
| `notes/VaultWorkspacePage.tsx` (`Workspace`) | Dueño de **carpeta activa** (`activeFolder`, raíz al montar: la `key` por bóveda ya lo garantiza) y del **historial** (`noteHistory` en `sessionStorage`). `onOpened(id, path)` del editor (cuando la nota **realmente** se abrió): fija la carpeta activa al padre (RF-042) y, si era un salto de historial pendiente, mueve la posición; si no, `push`. Atrás/Adelante: calcula el destino válido con los resúmenes (`notes.list`, índice en memoria) y pide abrirlo con el **mismo** cambio de `openId` de 0008: si hay borrador sucio, el editor muestra su diálogo; si el usuario cancela (`onCancelOpen`), la posición no se mueve (RF-060). No pasa por el router: `useBlocker` no interviene (no hay navegación de URL) y la decisión de "sucio" sigue siendo `hasUnsaved()`/`readDraft()` del editor. Atajo Alt+←/→ en `onKeyDown` del contenedor `.vault-workspace` si el foco no está en `input`, `textarea`, `select`, `[contenteditable=true]` ni `.cm-editor` (RF-059), con `preventDefault`. Conecta migas y menú con el árbol por `ref` (`NoteSidebarHandle`). | RF-042, RF-055…RF-060, RF-062 |
| `notes/NoteSidebar.tsx` | Fila **"Raíz"** (primer `treeitem`, `aria-current` si activa); filas de carpeta: clic/Enter despliega **y** activa (←/→ sólo pliegan/despliegan); indicador "Crear en: …" (`aria-live`); "Nueva nota" crea en la carpeta activa; botón y formulario **"Nueva carpeta"**; pista de `/` en los tres campos. `forwardRef` con `NoteSidebarHandle {startRename(id), remove(id), revealFolder(path)}`: el menú `⋯` y las migas reutilizan **los mismos** flujos (`startRename`, `remove` con `confirmDelete`) y el despliegue del árbol. `revealFolder` despliega ancestros y carpeta y desplaza **sólo** `.note-tree-panel` (`scrollTop`, `behavior:'auto'` con reduced-motion), sin mover el foco. | RF-001…RF-006, RF-042, RF-043, RF-055, RF-062 |
| `editor/NoteEditor.tsx` | **Sesión de edición** (D1): `body` (lo que ven Milkdown/CodeMirror, sin YAML) + `props` (objeto) en Visual; en Código el texto completo `composeCode(props, body)` es la verdad hasta salir de Código o guardar (RF-021). `frontmatter.ts` se carga con `import()` al pasar a edición (lectura no lo descarga). Al abrir en edición: `classifyLegacy` → `migrate` (RF-044: la sesión parte de `{props: parsed, body}`, aviso previo, Guardar habilitado sin ediciones, P-5) o `looks-yaml` (RF-045: aviso; el bloque estricto inicial queda **protegido**, P-6). Guardar: desde Código `split`+`parse` (RF-015/017: inválido → no guarda, no cambia de vista, aviso `role="alert"` con línea y "Ir a la línea N"); `checkFrontmatter` (RF-019); `notes.save(id, body, rev, props)`. "Sucio" = (`props`,`body`) ≠ base de la sesión, comparando `props` en forma canónica (`sync/canonical.ts`). Cabecera nueva: Atrás/Adelante, `NoteBreadcrumb`, controles existentes, "Insertar tabla" (sólo Visual), `NoteMenu`. Comandos de Milkdown por `registerCommands` (como `registerFlush`). | RF-009…RF-022, RF-025, RF-044, RF-045, RF-054, RF-056, RF-061…RF-065 |
| `editor/MilkdownView.tsx` | `.use(clipboard)` (+ envoltorio `vscode markdown`, P-8); *node views* `code_block` (`codeBlockView.ts`), `list_item` con `checked` (`taskItemView.ts`), `table` (`tableView.ts`); `createHighlightPlugin({parser})` de `prosemirror-highlight` con el *parser* Lezer diferido (`highlight/proseHighlight.ts`); `registerCommands({insertTable, addRowAfter, addColAfter})` y `onTableContext(inTable)`; prop `prefix?: string` para el bloque protegido (no entra al documento; se re-antepone al emitir, P-6). | RF-023…RF-028, RF-031…RF-039, RF-046, RF-047, RF-049…RF-053 |
| `editor/CodeView.tsx` | Extensiones: `yamlFrontmatter({content: markdown({codeLanguages: LANGUAGES})})` (el bloque YAML coloreado como YAML, RF-029), `syntaxHighlighting(synapseHighlighter)`, `lineNumbers()`, `highlightActiveLine()` (P-11), decoración de línea del bloque YAML y de las líneas dentro de cercados, decoración de **línea de error** (RF-017); `registerReveal(line)` para "Ir a la línea N". | RF-014, RF-017, RF-029, RF-048 |

### 2.3 Componentes de interfaz (zona frontend — bloque de maquetación)
Todo color, radio, sombra, espaciado y duración sale de `tokens.css`; las dimensiones de
componente salen del mockup o del entregable UX. Reglas transversales copiadas de `ux-0010.md` §0.2:
**`--accent` nunca es color de texto** (texto de acento = `--accent-hover`); **`--text-muted` no se
usa en texto** de esta feature (sustituto `--text-secondary`); anillo de foco = el global de
`global.css` (`outline: 2px solid var(--accent); outline-offset: 2px`) y `outline-offset: -2px`
dentro de contenedores con `overflow` recortado; errores = icono `circle-alert` (`--danger-text`) +
texto `--text-primary` (el color nunca es el único portador); iconos Lucide (`lucide-react` 1.61.0
en React; en *node views* los mismos glifos desde `editor/icons.ts`) 14/16 px, `aria-hidden` si hay
texto; radios `--radius-sm` (cajas/botones), `--radius-xs` (≤ 24 px), `--radius-md` (menús);
movimiento sólo `--dur-fast`/`--dur-base` y nada que no sea CSS anima con
`prefers-reduced-motion: reduce` (svg-pan-zoom, `scrollTop`, foco con `preventScroll`); texto
12/13/14 px, mono 12/13, **nada < 12 px**; objetivos 28×28 en la barra (36×36 con
`pointer: coarse`), mínimo WCAG 2.2 de 24 px (excepción documentada a los 44 px, P-13).

**a) Tokens (`styles/tokens.css`, P-1).** Nuevos, en **ambos** temas (RF-040):
| Token | Oscuro | Claro | Uso |
|---|---|---|---|
| `--success-text` | `#4ade80` | `#15803d` | cadenas del resaltado, icono "Copiado" |
| `--warning-text` | `#fbbf24` | `#b45309` | números/literales, `` `código` `` en Código, aviso RF-045/RF-053 |
| `--info-text` | `#38bdf8` | `#0369a1` | tipos/atributos, enlaces en Código, claves YAML, aviso informativo |
| `--danger-text` | `#f87171` | `#b91c1c` | "Borrar" del menú, error de diagrama, borrado tachado |
| `--border-control` | `#6b6b7c` | `#64748b` | borde de los controles **nuevos** (formulario, casillas) ≥ 3:1 (C-14) |
| `--radius-xs` | `4px` | `4px` | casillas, chips, código en línea (el mockup usa 4 px) |
Las variables de resaltado (`--syntax-*`) son **alias** de tokens existentes o nuevos y viven en
`editor/syntax.css` (no son valores nuevos): keyword→`--accent-hover`, string→`--success-text`,
number→`--warning-text`, type→`--info-text`, function→`--text-primary`, plain→`--text-secondary`,
comment→`--text-secondary` (cursiva), deletion→`--danger-text` (tachado).

**b) Panel de propiedades — lectura (`editor/PropertiesPanel.tsx`, RF-009/RF-010/RF-013).**
`<div role="group" aria-label="Propiedades" class="note-properties">` con `<dl>`, arriba del
contenido en `.note-editor-column`; ausente si `frontmatter` está ausente o `{}`. Caja del mockup
(C-1): fondo `--bg-tertiary`, `1px solid var(--border)`, `--radius-sm`, padding `12px 16px`,
margen inferior total 24 px. Rejilla `minmax(80px,160px) 1fr`, `column-gap 16`, `row-gap 4`. Clave
`dt`: mono 12 px `--text-secondary`; valor `dd`: 13 px `--text-primary`, `overflow-wrap:anywhere`;
multilínea `white-space: pre-wrap`; número `tabular-nums`; string vacío "(vacío)" cursiva
`--text-secondary`; booleano: icono `square-check` (`--accent-hover`) / `square` (`--text-secondary`)
14 px + texto **"Sí"/"No"** (no `input disabled`); lista: chips 20 px de alto, padding `0 8px`,
fondo `--accent-soft`, texto `--text-primary` 12 px, `--radius-xs`, `flex-wrap` con `gap 4`; valor
complejo: `<code>` mono 12 px `--text-secondary` sobre `--bg-secondary`, `max-height:96px;
overflow:auto`, icono `lock` + texto sólo-lector "Sólo lectura: edítalo en Código"; URL = texto
plano. ≥ 10 propiedades: 6 visibles + "Mostrar n más" (`aria-expanded`, P-16). 390 px: una
columna (clave sobre valor), padding 12. Nada enfocable salvo "Mostrar n más".

**c) Formulario de propiedades — Visual (`editor/PropertiesForm.tsx`, RF-010…RF-013, RF-020).**
Sin propiedades: botón fantasma "Añadir propiedad" (`plus` 14 + texto 12 px, `--text-secondary`,
28 px, hover `--bg-tertiary` + `--text-primary`, active `--accent-soft`); al activarlo nace la caja
con una fila y el foco va a "Clave". Con propiedades: misma caja; cabecera de columnas visible
"Clave · Tipo · Valor" (12 px `--text-secondary`, `position: sticky`) y filas
`grid-template-columns: 160px 96px 1fr 28px`, controles 28 px, separación 8. Fila
`role="group" aria-label="Propiedad: {clave}"`: Clave `input` mono 12 px (`aria-label="Clave de la
propiedad {n}"`); Tipo `<select>` nativo Texto/Número/Sí-No/Lista (`"Tipo de «{clave}»"`); Valor por
tipo (Texto `input`, con `\n` → `textarea rows=3` máx. 8; Número `type="text" inputmode="decimal"`
`tabular-nums`; Sí/No `label > input[type=checkbox] + span "Sí|No"` con `min-height:28px`; Lista:
chips con botón `x` 20 px `aria-label="Quitar {valor}"` + `input` "Añadir elemento a «{clave}»",
Enter o coma añade, pegar con comas divide, Enter nunca guarda); Quitar: botón `x` 28×28
`aria-label="Quitar propiedad {clave}"`. Valor complejo: como en lectura, sin tipo ni control,
"Quitar" activo, ayuda "Sólo se edita en Código". Inputs: fondo `--bg-primary`, borde
`--border-control`, `--radius-sm`; hover borde `--text-secondary`; foco borde `--accent` + anillo
global; `aria-invalid` borde `--danger`; no hay `disabled`. **Cambio de tipo**
(`properties.convert`): texto→número sólo si es numérico válido; número→texto `String`; lista→texto
`", "`; texto→lista un elemento; Sí/No↔texto `"true"/"false"`; no representable → vacío + anuncio
"El valor de «x» se vació al cambiar de tipo". Quitar: anuncio "Propiedad «x» quitada" en
`role="status"`, foco a la clave siguiente (o anterior, o "Añadir propiedad"). Validación al salir
del campo y al guardar: "Escribe un nombre para la propiedad" / "Ya hay una propiedad llamada «x»" /
"Escribe un número válido, como 3 o 2.5" (12 px, `circle-alert`, `aria-describedby` +
`aria-invalid`); al guardar con errores: no guarda y el foco va a un resumen `role="alert"`
("No se pudo guardar: revisa 2 propiedades", un botón por error que enfoca su campo). Guardar no
se deshabilita por esto. > 8 filas: `max-height: min(50vh, 360px); overflow-y:auto`. 390 px: cada
fila es una tarjeta apilada con etiquetas visibles, controles 36 px con `pointer:coarse`. Fila nueva:
`opacity` 0→1 en `--dur-fast` (sin transición con reduced-motion).

**d) Avisos (`.note-editor-notice` existente + variantes, RF-017/RF-019/RF-044/RF-045/RF-008).**
Borde izquierdo 3 px + icono + texto `--text-primary`:
| Aviso | Variante | Rol | Texto |
|---|---|---|---|
| Previo de YAML heredado (P-5) | info, `info` (`--info-text`) | `status` | "Esta nota tiene propiedades escritas dentro del texto. Se moverán al panel de propiedades cuando guardes." |
| Tras guardar (RF-044) | info | `status` persistente + "Cerrar aviso" (`x`) | "Las propiedades se movieron fuera del texto. Ahora están en el panel de propiedades." |
| Parece YAML (RF-045, sólo Visual) | advertencia, `triangle-alert` (`--warning-text`) | `status` | "El inicio de la nota parece YAML, pero no se trata como propiedades. Edítalo en Código si quieres convertirlo." + el bloque protegido literal en mono 12 px (P-6) |
| YAML inválido (RF-017) | error, `circle-alert`, borde `--danger`, fondo `--danger-bg` | `alert` | "El bloque de propiedades no es YAML válido" + motivo ("Línea 3: …", "Clave duplicada: «tags»", "El bloque debe ser un mapa") + "No se guardó nada y tu texto sigue igual. Corrígelo y vuelve a guardar." + botón "Ir a la línea N" |
| > 64 KiB (RF-019) | error | `alert` | "Las propiedades ocupan {n} KiB y el límite es 64 KiB. Acorta o quita valores y vuelve a guardar." |
| Ruta inválida (RF-008) | error | `alert` + botón "Renombrar" | "Esta nota tiene un nombre no válido (termina en «/» o es «.md»). Renómbrala para guardar tus cambios; tu borrador se conserva." |
En Código, la línea del error lleva fondo `--danger-bg`, subrayado ondulado `--danger-text` y marca
`circle-alert` en el margen.

**e) Bloque de código (`editor/codeBlockView.ts`, `editor/syntax.css`, RF-027…RF-036).** Caja
`border 1px --border; --radius-sm; fondo --bg-tertiary; margin 12px 0`, **sin `overflow:hidden`**.
Cabecera propia de **36 px** (no superpuesta: C-5), `contenteditable=false`, borde inferior
`--border`: etiqueta mono 12 px `--text-secondary` **tal como se declaró** o "texto" (sin
`uppercase`), `user-select:none`; botón "Copiar" (`copy` 14 + texto 12 px, 28 px de alto,
`min-width:84px`, `aria-label="Copiar código"` fijo, siempre visible). Estados del botón: reposo
transparente/`--text-secondary`; hover `--bg-primary` + `--text-primary` + borde `--border`; active
`--accent-soft` + `scale(.97)`; foco anillo global; copiado 2 s ("Copiado", icono `check`
`--success-text`); error 4 s (`circle-alert` `--danger-text` + "No se pudo copiar"; región viva:
"No se pudo copiar. Selecciona el código y usa Ctrl+C."). Región `aria-live="polite"` oculta por
bloque. `pre`: padding `12px 16px`, mono 13 px/1,6, `white-space:pre`, `overflow-x:auto`,
`font-variant-ligatures:none`, `tabindex="0"` sólo si `scrollWidth > clientWidth`. Paleta (contraste
sobre T, oscuro / claro):
| Categoría | Etiquetas Lezer | Clase | Token | Contraste |
|---|---|---|---|---|
| keyword, tag | `keyword`, `controlKeyword`, `definitionKeyword`, `tagName` | `sx-keyword` | `--accent-hover` 600 | 6,47 / 4,89 |
| string, regexp | `string`, `regexp` | `sx-string` | `--success-text` | 9,02 / 4,58 |
| number, literal | `number`, `bool`, `null`, `atom` | `sx-number` | `--warning-text` | 9,41 / 4,58 |
| type, attr | `typeName`, `className`, `propertyName`, `attributeName` | `sx-type` | `--info-text` | 7,34 / 5,42 |
| function, heading | `function(variableName)`, `heading` | `sx-function` | `--text-primary` 600 | 12,89 / 16,30 |
| variable, operator, punctuation | `variableName`, `operator`, `punctuation`, `bracket` | `sx-plain` | `--text-secondary` | 5,68 / 6,92 |
| comment | `comment`, `lineComment`, `blockComment` | `sx-comment` | `--text-secondary` cursiva | 5,68 / 6,92 |
| deletion | `deleted` | `sx-deletion` | `--danger-text` tachado | 5,68 / 5,91 |
| por defecto | — | — | `--text-primary` | 12,89 / 16,30 |
Lenguaje no admitido o vacío: mono sin decoraciones (RF-031); carga fallida: igual, sin error en
consola (RF-032).

**f) Mermaid (`editor/codeBlockView.ts` + `editor/mermaid/*`, RF-046…RF-053).** Mismo chasis (cabecera
36 px con etiqueta `mermaid`, "Copiar" de la **fuente** y "Ver código" `code` con `aria-expanded`,
P-16). Área: fondo `--bg-secondary`, borde `--border` sin borde superior, radio inferior
`--radius-sm`, padding 12; `role="img"` + `aria-label` = `accTitle` o "Diagrama Mermaid"; SVG
`max-width:100%; height:auto`; alto = el del diagrama ajustado, **tope 420 px**, mínimo 96 px.
Cargando: `aria-busy`, "Dibujando diagrama…" 12 px `--text-secondary`. En lectura el bloque de
código se oculta (se ve el diagrama; "Ver código" lo muestra); en Visual el bloque sigue editable y
la vista previa va **debajo** (separador `--border`, rótulo "Vista previa"), se re-renderiza a
**400 ms** de la última tecla conservando el SVG anterior; en Código no hay diagrama (RF-048).
`themeVariables` (theme `base`, `fontFamily` = `--font-ui`, 13 px): `background`=`--bg-secondary`;
`primaryColor`/`mainBkg` = `--accent-soft` compuesto sobre `--bg-secondary` (`#172f3e` / `#e0f0f5`);
textos (`primaryTextColor`, `textColor`, `titleColor`, `noteTextColor`, `actorTextColor`,
`labelTextColor`, `loopTextColor`, `signalTextColor`) = `--text-primary`; bordes de nodo/actor =
`--accent`; líneas/flechas = `--text-secondary`; `secondaryColor`/`clusterBkg`/`noteBkgColor`/
`labelBoxBkgColor` = `--bg-tertiary`; `tertiaryColor` = `--bg-secondary`;
`edgeLabelBackground` = `--bg-primary`; `clusterBorder`/`noteBorderColor` = `--text-secondary`;
`errorTextColor` = `--danger-text`; `cScale0…5`/`pie1…6` = `--accent-hover`, `--info-text`,
`--success-text`, `--warning-text`, `--danger-text`, `--text-secondary`. Error (RF-049):
`role="group" aria-label="Error en el diagrama"` (no `alert` por bloque), fondo `--danger-bg`, borde
`--danger-border` + izquierdo 3 px `--danger`, título "No se pudo dibujar el diagrama", detalle mono
12 px (máx. 3 líneas), guía "Revisa la sintaxis del bloque mermaid (línea N) y vuelve a intentarlo.";
en lectura, la fuente debajo como bloque de código. Fallo de carga (RF-053): `triangle-alert`
"No se pudo cargar el diagrama" + "Reintentar" (`rotate-cw`) sobre el bloque de código. Vacío:
Visual "Escribe el diagrama en el bloque de arriba"; lectura sin área. **Zoom (RF-052):** grupo
`role="group" aria-label="Controles del diagrama"` abajo a la derecha (8 px): "Acercar"
(`zoom-in`), "Alejar" (`zoom-out`), "Reajustar vista" (`maximize`), 28×28, fondo `--bg-secondary`,
borde `--border`, `--shadow-panel`, gap 4; deshabilitados en los límites (zoom 0,2…10; reajustar
cuando ya está ajustado) con opacidad 0,5; **sólo si el diagrama excede** la columna o los 420 px;
rueda sólo con Ctrl/⌘ (C-6); área `tabindex=0` con ←↑→↓ (40 px, 160 con Mayús), `+`/`-`, `0`,
explicado por `aria-describedby`; `ResizeObserver` → `resize()+fit()+center()`; sin animación con
reduced-motion.

**g) Tablas, cita, código en línea, tareas (CSS en `editor/editor.css` + `tableView.ts`/`taskItemView.ts`,
RF-026, RF-037…RF-039).**
- Tabla: `border-collapse:collapse; width:max-content; min-width:100%`, 14 px/1,6; celda
  `padding 4px 12px`, `border 1px --border`, `min-width:80px`, alineación GFM, **`td > p, th > p
  {margin:0}`** (causa de los ~62 px medidos); `th` fondo `--bg-tertiary` 13 px/600; sin cebra ni
  hover; envoltorio `div.note-table-scroll` (`overflow-x:auto; max-width:100%`) — en lectura
  `role="region" aria-label="Tabla" tabindex="0"`; en Visual el `TableView` de
  `@milkdown/prose/tables` (gfm 7.22.3 no trae `columnResizing`, así que hoy no hay envoltorio:
  hallazgo resuelto con esta *node view*); celda seleccionada `--accent-soft`. Altura objetivo de
  fila ≈ 31,4 px.
- Cita (RF-037): `border-left:3px solid var(--accent); padding:8px 16px; margin:16px 0;
  background:var(--accent-soft); border-radius:0 var(--radius-sm) var(--radius-sm) 0;
  color:var(--text-secondary); font-style:italic`; anidada sin fondo; 390 px padding `8px 12px`.
- Código en línea (RF-038): `background:--bg-tertiary; color:--accent-hover; font-family:--font-mono;
  font-size:.857em (12 px sobre 14); padding:2px 6px; border-radius:--radius-xs`.
- Tareas (RF-039): `li` sin viñeta, `display:flex; gap:8px`; caja 16×16, borde 2 px
  `--text-secondary`, `--radius-xs`; marcada fondo y borde `--accent`, marca `--bg-primary`; hecha
  `--text-secondary` + tachado; zona de clic ≥ 24×24 (`::before{inset:-4px}`). Lectura:
  `span role="img" aria-label="Pendiente"|"Completada"`, sin foco ni hover. Visual: `input
  type=checkbox` (`contenteditable=false`), hover borde `--accent`, active `scale(.92)`, Espacio
  alterna, nombre accesible = texto de la tarea, anuncio "Marcada"/"Sin marcar"; alternar =
  `setNodeMarkup(checked)` → la nota queda sucia.

**h) Vista Código (`editor/CodeView.tsx`, `editor/editor.css`, RF-029).** Sobre `--bg-primary`,
mono 13 px / 1,8; base `--text-primary`; `# h1` 700 y `## h2…` 600 en `--text-primary`; marcas
(`#`, `>`, `-`, `---`, `|`, `[ ]`, `` ` ``) `--text-secondary`; `**negrita**` `--accent-hover` 600;
cursiva `--text-primary`; enlace texto `--info-text` subrayado, URL `--text-secondary`;
`` `código` `` `--warning-text`; cita `--text-secondary` cursiva; `[x]` `--accent-hover`; números de
línea 12 px `--text-secondary` (activa `--text-primary`); línea activa fondo `--bg-secondary` (no el
literal del mockup, C-3); cursor 2 px `--accent`; selección `color-mix(in srgb, var(--accent) 30%,
transparent)`; bloque YAML: fondo `--bg-secondary`, `---` `--text-secondary`, claves `--info-text`,
cadenas `--syntax-string`, números/booleanos `--syntax-number`; líneas dentro de cercados: fondo
`--bg-tertiary` + paleta de (e); foco del editor: se conserva el de 0008.

**i) Encabezado (`editor/NoteEditor.tsx`, `editor/NoteBreadcrumb.tsx`, `editor/NoteMenu.tsx`,
RF-054…RF-065).** `header.note-editor-header` mantiene **43 px** pero pasa a `padding: 0 16px`
(con 8 px verticales los controles de 28 px no caben), controles centrados, `gap 8` (390 px: `gap 4`,
`padding 0 8px`). Orden DOM = visual = tabulación: Atrás, Adelante, migas, [Visual|Código], Insertar
tabla (y, con el cursor en una tabla, Añadir fila/columna, P-7), Guardar, estado, **lápiz** (Editar/Leer), `⋮`.
**Enmienda P-17 (T-011, GATE 2): este apartado sigue `reference/obsidian-breadcrumb.png`** (captura de
Obsidian de 1073×84 px medida con Chromium: texto de cabecera con altura de versal ≈ 12 px; separador `/`
más tenue que los segmentos y pegado al siguiente (≈ 8 px) y más lejos del anterior (≈ 18 px); cada
segmento se trunca **por sí mismo** con «…» (`2 - SECCIÓ…`, `2.1 - SECCIÓN - Gr…`); el último se ve completo;
«Atrás» activa, «Adelante» atenuada sin historial; lápiz y `⋮` a la derecha). Donde este plan decía `›`,
colapso de intermedios o `⋯`, manda la captura.
- Atrás/Adelante: 28×28, `arrow-left`/`arrow-right` 16 px `--text-secondary`, `aria-label`
  "Atrás"/"Adelante", `aria-keyshortcuts="Alt+ArrowLeft"|"Alt+ArrowRight"`, tooltip "Atrás · Alt+←"
  al hover y al foco; `disabled` en los extremos; tras cancelar el aviso de cambios el foco vuelve
  al botón pulsado.
- `nav[aria-label="Ruta"] > ol` (`flex:1; min-width:0; white-space:nowrap`): carpeta = `<button>`
  13 px `--text-secondary`, 28 px, padding `0 8px`, `--radius-sm`, `max-width:24ch` con elipsis,
  `title="Mostrar «{carpeta}» en el árbol"`; hover `--bg-tertiary` + `--text-primary`; foco anillo con
  `outline-offset:-2px`; active `--accent-soft`; separador **`/`** (texto decorativo, `aria-hidden`, 13 px
  `--text-secondary`, margen `0 4px`; P-17, como la captura de Obsidian); nombre
  = `<h2 aria-current="page">` 13 px/**600** `--text-primary`, `min-width:6ch`, elipsis, `title` =
  ruta completa; nota en la raíz: sólo el `h2`.
- Truncado **por segmento** (RF-063, P-17): `ResizeObserver` sobre la lista + `breadcrumb.fit` (puro):
  cada carpeta recibe un ancho máximo y se corta con «…» (elipsis de CSS, el `title` conserva el nombre);
  la primera carpeta y el nombre nunca desaparecen; si aun así no cabe, primero se acortan las carpetas
  intermedias (mínimo «…» sola, 3ch) y por último el nombre (`min-width:6ch`). Sin menú de ocultos.
  Resultado esperado: 1440 (≈630 px para migas) ruta completa hasta ~5 niveles; 1024 (≈214 px) todos
  los segmentos con «…»; 390 (≈114 px) `Carpeta… / Nota…` con el nombre prioritario.
- Menú `⋮` (`NoteMenu`, P-4, P-17): botón 28×28 `ellipsis-vertical`, `aria-label="Opciones de la nota"`,
  `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`; menú en **portal** (no lo recorta
  ningún `overflow`), `role="menu"` `aria-labelledby`, fondo `--bg-secondary`, borde `--border`,
  `--radius-md`, `--shadow-panel`, padding 4, `min-width:200px`, alineado a la derecha, 4 px debajo;
  ítems `role="menuitem"` 32 px (40 con `pointer:coarse`), 13 px, icono 14 px, foco itinerante:
  Renombrar/mover (`pencil`) · Copiar ruta (`copy`) · Ver en Código (`code`; `aria-disabled` si ya
  está en Código) · separador · **Borrar** (`trash-2`, `--danger-text`); hover/foco `--bg-tertiary` +
  `--text-primary` (+ anillo `-2px` en foco); teclado: Enter/Espacio/↓ abren y enfocan el primero,
  ↑ el último, ↑/↓ cíclico, Inicio/Fin, Esc cierra y devuelve el foco, Tab cierra, clic fuera cierra;
  apertura `opacity`+`translateY(-4px)` 120 ms, cierre sin animación. "Copiar ruta" anuncia "Ruta
  copiada" (o "No se pudo copiar la ruta") en la región `role="status"` de la barra
  (`.note-editor-state`; con texto `min-width:12ch`, vacía sin reserva como en 0009 A1-4).
- Lápiz (P-17): el botón «Editar/Leer» de 0008 pasa a icono (`pencil` en lectura, `book-open` en
  edición, 16 px `--text-secondary`, 28×28) **conservando** su nombre accesible «Editar»/«Leer»; va a la
  derecha, antes de `⋮`, como en la captura de Obsidian.
- ≤ 560 px: Visual/Código/Guardar pasan a sólo icono (`eye`/`code`, `save`; el lápiz ya lo es) con el **mismo nombre accesible**; el texto del estado se oculta visualmente
  (sigue en el árbol de accesibilidad). Siempre **una línea**, sin scroll horizontal.

**j) Barra lateral (`notes/NoteSidebar.tsx`, `notes/notes.css`, RF-001…RF-006, RF-042, RF-043).**
- "Crear en" (primera fila de `.note-sidebar-new`): `folder-open` 14 (`--warning`, decorativo, igual
  que el árbol) o `house` en raíz + "Crear en:" 12 px `--text-secondary` + nombre `<strong>`
  `--text-primary` 600 con elipsis y `title`; `<p id aria-live="polite" aria-atomic="true">`
  referenciado por `aria-describedby` del título.
- Pista (RF-006): 12 px `--text-secondary`, `corner-down-right` 12: "Usa / para crear subcarpetas
  (por ejemplo, Proyectos/Ideas)", `id` propio en `aria-describedby` de Nueva nota, Renombrar y
  Nueva carpeta (junto con el error cuando exista).
- "Nueva carpeta": botón secundario (`folder-plus` 14, 12 px) bajo "Nueva nota", ambos a 224 px; el
  formulario (mismo marco): etiqueta "Nombre de la carpeta", `input` 28 px, pista, error, "Crear
  carpeta" (submit) y "Cancelar"; foco al `input`; Esc cancela y devuelve el foco. Errores
  `<p role="alert">` con `circle-alert`: "Escribe un nombre. No puede estar vacío ni tener tramos
  vacíos (a//b)." · "El nombre tiene caracteres no permitidos. Quítalos e inténtalo de nuevo." ·
  "Ya existe una carpeta con ese nombre" + "Elige otro nombre o abre la carpeta desde el árbol.".
- Fila "Raíz": primer `treeitem`, 27 px, `house` 14 `--text-secondary`, 12 px, sin chevron.
  Carpeta activa (y "Raíz" activa): `aria-current="true"`, fondo `--bg-tertiary`, `--text-primary`
  **600**, `box-shadow: inset 3px 0 0 var(--text-secondary)`, icono `folder-open`; distinta de la
  nota seleccionada (`--accent-soft` + barra `--accent`, `aria-selected`); ambas pueden coexistir.
- 390 px: controles 36 px con `pointer:coarse`; el árbol conserva `max-height:50vh` (0009).

### 2.4 Fronteras de salida
| Frontera | Para qué | Implementación concreta |
|---|---|---|
| Réplica PouchDB (P-1 de 0005) | escribir `content` + `frontmatter`, crear en carpeta | `notes/noteStore.ts` (única puerta) |
| `/sync` push validado | rechazar `X/.md` | `services/sync_push.py` → `core/note_rules.check_path` (sin código nuevo en el servicio) |
| `sessionStorage` | historial por bóveda y pestaña | `notes/noteHistory.ts` (`load`/`save`, clave `synapse:note-history:{vaultId}`) |
| Portapapeles del navegador | "Copiar" de bloque y "Copiar ruta" (escritura); pegar en Visual (lectura del evento) | `navigator.clipboard.writeText` (fallo → RF-035/RF-062); `@milkdown/plugin-clipboard` |
| Carga diferida (red) | gramáticas extra, `yaml`, `mermaid`, `svg-pan-zoom` | `import()` en `highlight/languages.ts`, `NoteEditor` (`./frontmatter`), `mermaid/renderMermaid.ts`, `mermaid/panZoom.ts` |
| DOM (inserción de marcado) | SVG de Mermaid | `mermaid/renderMermaid.ts` (`DOMParser` + verificación, §1 Art. 5) |

### 2.5 Decisiones técnicas con medición (2026-10-24)
Medido con `vite build` 5.4.8 (esbuild) y `gzip -9`, en `/tmp/s10/measure` (proyecto de medición,
fuera del repo) y sobre `npm run build` del worktree en `29470e0`.

**Línea base (0009, `29470e0`):** entrada `index-*.js` 432 980 B / **141 660 B gzip** (138,34 KiB;
Vite informa 142,28 kB), `index-*.css` 5 228 B gzip; chunk diferido `NoteEditor-*.js` 974 786 B /
**316 428 B gzip** (309,01 KiB), `NoteEditor-*.css` 1 193 B gzip.

| Decisión | Opción elegida | Medida (gzip) | Alternativas medidas | Por qué |
|---|---|---|---|---|
| D-T1 Resaltado en lectura/Visual | `prosemirror-highlight` 0.16.0 con su *parser* `prosemirror-highlight/lezer` + `tagHighlighter` propio; gramáticas del registro único | núcleo 1,8 KiB (chunk del editor); python 22,8 · sql 7,0 · yaml 5,9 · json 1,4 · shell 1,4 KiB en chunks propios; js/ts/tsx/css/html/markdown **+0** (ya en el chunk del editor desde 0008 por `@codemirror/lang-markdown` → `lang-html` → `lang-javascript`/`lang-css`) | lowlight 3.3.0 + 10 gramáticas highlight.js 32,8 KiB (lo que usa career-admin vía `rehype-highlight`); refractor 5.0.0 + 11 gramáticas 30,6 KiB; *node view* con CodeMirror por bloque (un `EditorView` por bloque: 50 instancias en la nota de RNF-001) | Mismas gramáticas y mismas clases en las tres vistas (fidelidad: un `const` se colorea igual en Código y en lectura); decoraciones de ProseMirror = nodos de texto (RNF-003); el *parser* admite `Promise` (carga diferida nativa, RF-032). |
| D-T2 Markdown coloreado en Código | `yamlFrontmatter({content: markdown({codeLanguages})})` de `@codemirror/lang-yaml` 6.1.3 + `syntaxHighlighting(synapseHighlighter)` | +5,9 KiB (yaml de Lezer, compartido con D-T1) | `@codemirror/language-data` 6.5.2 (≈150 descripciones: 502,8 KiB en chunks si se emiten todas) | Sólo RF-030; `yamlFrontmatter` colorea el bloque YAML como YAML sin código propio. |
| D-T3 Pegar | `@milkdown/plugin-clipboard` 7.22.3 | 1,3 KiB | `handlePaste` propio | Es el plugin oficial del tren 7.22.3; con `text/plain` usa el *parser* de markdown del editor (RF-023). Ajuste P-8 (VS Code). |
| D-T4 Insertar tabla | `insertTableCommand` de `@milkdown/preset-gfm` 7.22.3 con `{row: 2, col: 2}` (cabecera + 1 fila, 2 columnas); filas/columnas con `addRowAfterCommand`/`addColAfterCommand` (P-7) | 0 (ya en el *bundle*) | `insertTableInputRule` (sólo tecleando `|`) | Ya está en el preset; Tab/Mayús+Tab recorren celdas (`goToNextTableCellCommand`, no añade filas: verificado en la fuente). |
| D-T5 YAML del frontmatter | `yaml` 2.9.1, YAML 1.2 core, `uniqueKeys`, `intAsBigInt`, `strict`; chunk propio cargado al pasar a edición | 37,1 KiB (diferido; lectura no lo pide) | YAML a mano (subconjunto) | Corrección de YAML 1.2 y errores con línea; contrato validado contra él (0 fallos). |
| D-T6 Mermaid | `mermaid` 11.17.2 con `import()` desde la *node view* sólo si hay un bloque `mermaid` | núcleo 167,6 KiB + chunk por tipo de diagrama (flowchart, sequence…); 61 chunks / 954,9 KiB si se usaran todos los tipos | `mermaid` 12.2.0 (la spec fija 11.x, validada en career-admin) | Paridad con career-admin; nada en la entrada ni en el chunk del editor. |
| D-T7 Zoom/arrastre | `svg-pan-zoom` 3.6.2 con `import()` sólo cuando un diagrama excede | 10,5 KiB | — | Paridad con career-admin (RF-052). |
| D-T8 Encabezado e historial | React + módulos puros en el chunk del editor (migas, menú); historial y carpeta activa en la entrada | estimado entrada +4–6 KiB | — | La entrada sólo gana `noteHistory`, `folders`, la fila "Raíz", "Crear en", "Nueva carpeta" y 3 iconos. |

**Presupuestos (P-9):** entrada ≤ **+15 KiB** gzip sobre 141 660 B (≤ 157 020 B; RNF-002);
chunk `NoteEditor` ≤ **+40 KiB** gzip sobre 316 428 B (propuesta: el editor gana *node views*,
formulario, migas, menú, clipboard y núcleo del resaltador); `yaml`, gramáticas extra, `mermaid` y
`svg-pan-zoom` en chunks propios que la entrada y el chunk del editor **no** importan estáticamente.
Lo comprueba `frontend/scripts/check-bundle.mjs` (`npm run test:bundle`) sobre `dist/` y, en red,
V-15.

## 3. Modelo de datos
- **Sin cambios de forma** (spec §3): `note:{vault}:{uuid}` sigue con `frontmatter` (objeto JSON
  opcional ≤ 64 KiB) y `content`. El cliente escribe ahora `frontmatter` además de `content` al
  guardar; nunca guarda el bloque YAML dentro de `content` (D1).
- Sin migración: las notas con YAML en `content` se separan sólo cuando el usuario guarda (RF-044).
- Postgres/alembic: sin cambios. CouchDB: sin índices nuevos.
- `sessionStorage` (cliente): `synapse:note-history:{vaultId}` = `{"entries": [id…≤50], "index": n}`.

## 4. Contratos
| Archivo | Frontera | Gate(s) |
|---|---|---|
| `0010-contenido-markdown-completo/contracts/frontmatter-yaml.cases.json` (**creado en este plan**) | conversión YAML↔`frontmatter` del cliente: `split` (11), `compose` (3), `parse` (28, con códigos de error y línea), `roundtrip` (22), `legacy` (10) | `frontend/src/editor/frontmatter.test.ts` recorre todas las secciones; validado hoy contra una implementación de referencia con `yaml` 2.9.1 → `fails 0` |
| `0008-vault-editor/contracts/note.schema.json` — **delta** (se aplica en la Fase 4, con re-anclaje de 0008, P-15) | `properties.path.pattern` pasa de `^(?!/)(?!.*//)(?!.*/$)[^\u0000-\u001F\u007F-\u009F]+$` a `^(?!/)(?!.*//)(?!.*/$)(?!(?:.*/)?\.[mM][dD]$)[^\u0000-\u001F\u007F-\u009F]+$` y la `description` añade "el último segmento no puede ser `.md` (sin distinguir mayúsculas)". Probado hoy en Python `re` y en JS (`u`): rechaza `X/.md`, `X/.MD`, `.md`, `.Md`, `a/b/.md`; acepta `X/a.md`, `.md/a.md`, `a.md.md`, `X/..md`, `X/.mdx`. | `backend/tests/test_note_contract.py` (nuevo test: el patrón y `check_path` coinciden en los casos `path` de la batería); `test_note_rules.py` / `noteRules.test.ts` (batería) |
| `backend/tests/fixtures/note_rules_cases.json` (batería común de 0008) | casos nuevos de `path`: `X/.md`, `X/.MD`, `.md`, `X/ .md` → `validation-error:path`; `X/a.md`, `.md/a.md` → `null` | `test_note_rules.py`, `noteRules.test.ts` |
| `0005-sync/contracts/openapi.yaml` | sin cambios (`validation-error:.+` ya admitido) | `test_contract.py` lo confirma |

## 5. Estrategia de pruebas (por zona, TDD)

### 5.1 Pruebas por zona
| Zona | Qué se prueba | Herramienta / archivo |
|---|---|---|
| Núcleo servidor | `check_path` con los casos nuevos | `backend/tests/test_note_rules.py` + `fixtures/note_rules_cases.json` |
| Push (CouchDB real) | revisión con `X/.md` → `validation-error:path` y la anterior intacta; `X/a.md` aceptada; el resto de 0005/0008 sin tocar | `backend/tests/test_note_sync_push.py` |
| Contrato | patrón de `note.schema.json` ≡ `check_path` en la batería | `backend/tests/test_note_contract.py` |
| Núcleo cliente | batería de rutas; `folders` (nombres, duplicados NFKC+casefold, `joinPath`, `parentFolder`); `untitled` por carpeta; `noteHistory` (push/descartar adelante/tope 50/salto de inválidos/renombrada por id/clave por bóveda/forma corrupta); `frontmatter` (contrato completo); `properties` (inferencia, conversiones, validación, números); `breadcrumb` (migas y colapso); `highlight/languages` (alias de RF-030 sin mayúsculas, desconocidos → `null`); `themeVariables` (composición, mapa completo, ambos temas) | `notes/noteRules.test.ts`, `notes/folders.test.ts`, `notes/untitled.test.ts`, `notes/noteHistory.test.ts`, `editor/frontmatter.test.ts`, `editor/properties.test.ts`, `editor/breadcrumb.test.ts`, `editor/highlight/languages.test.ts`, `editor/mermaid/themeVariables.test.ts` |
| Contraste y tokens | todos los pares de §5.5 ≥ 4,5:1 (texto) / ≥ 3:1 (no texto) leyendo `tokens.css` (patrón de `accentContrast.test.ts`); los 6 tokens nuevos definidos en ambos temas; ningún literal de color (`#…`, `rgb(`, `rgba(`) en `editor.css`, `syntax.css`, `notes.css` | `editor/contrast.test.ts` (nuevo), `notes/layoutCss.test.ts` (ampliado) |
| Almacén | `create` en carpeta, sin título en carpeta, `Carpeta/` rechazada sin escribir, `save` con `frontmatter` (y en rama de conflicto), `save` sin `frontmatter` conserva el anterior, > 64 KiB rechazado sin escribir, puerta RF-008 en `save`/`softDelete` | `notes/noteStore.test.ts` |
| Componentes (jsdom) | panel (tipos, vacío, complejo, sin YAML crudo, sin enlaces); formulario (añadir/quitar/editar, tipos, conversión, validación, resumen de errores, foco, anuncios); avisos RF-017/019/044/045/008; editor: ida y vuelta Visual↔Código sin guardar (RF-021), guardar desde Código separa (RF-015), sin cambios = mismos datos (RF-016), YAML inválido bloquea guardar y cambiar de vista (RF-017), RF-044/045 (incl. bloque protegido byte a byte), "sucio" por propiedades (RF-012); migas (segmentos, raíz, `aria-current`, `title`, colapso con anchos simulados, RF-065 al renombrar); menú (roles, teclado, portal, flujos reutilizados, "Copiar ruta" y su fallo); atrás/adelante (deshabilitados, saltos, aviso de cambios y cancelación, Alt+←/→ dentro y fuera de un editor); barra lateral ("Raíz", carpeta activa, "Crear en", "Nueva carpeta" y errores, pista con `aria-describedby`, revelar carpeta) | `editor/PropertiesPanel.test.tsx`, `editor/PropertiesForm.test.tsx`, `editor/NoteEditorFrontmatter.test.tsx`, `editor/NoteBreadcrumb.test.tsx`, `editor/NoteMenu.test.tsx`, `editor/NoteEditor.test.tsx`, `notes/NoteSidebar.test.tsx`, `notes/VaultWorkspacePage.test.tsx` |
| Milkdown (jsdom) | pegar `text/plain` con tabla GFM → nodo `table`; tabla mal formada → texto sin perder caracteres; `vscode-editor-data` con modo `markdown` → estructura (P-8); "Insertar tabla" 2×(1+1); añadir fila/columna; *node views*: etiqueta, copiar (éxito/fallo), **serializar tras montar = entrada** (RF-036), casilla en Visual cambia `checked` y marca sucio, en lectura no interactiva; resaltado con *parser* falso síncrono (clases `sx-*` en el DOM) y con carga fallida (sin clases, sin excepción) | `editor/MilkdownView.test.tsx`, `editor/codeBlockView.test.ts`, `editor/taskItemView.test.ts`, `editor/highlight/proseHighlight.test.ts` |
| Código (jsdom) | YAML al inicio con propiedades; clases `sx-*` en markdown y en cercados; decoración de línea de error; "Ir a la línea N" | `editor/CodeView.test.tsx` |
| Mermaid (jsdom, módulo falso) | carga diferida sólo con bloque `mermaid`; configuración (`strict`, `htmlLabels:false`, `secure` ampliado, `suppressErrorRendering`, `theme:"base"` + variables); verificación del SVG (rechaza `script`, `foreignObject`, `on*`, `href`); error por bloque sin afectar a otros; fallo de carga → aviso + reintentar; re-render al cambiar `data-theme`; *debounce* de 400 ms en Visual | `editor/mermaid/renderMermaid.test.ts`, `editor/codeBlockView.test.ts` |
| Seguridad (estático) | ninguna escritura de HTML crudo en `src/` | `editor/securityGuard.test.ts` (nuevo) |
| No regresión | suites de 0008/0009 verdes; cambios de tests sólo los de §9 RF-041 | `npm test`, `test:sync`, `test:visual` (V-1…V-10 de 0009), backend |
| **Sistema — fidelidad** | §5.3 | `frontend/e2e/content-visual.spec.ts` (nuevo) |
| **Sistema — rendimiento y red** | §5.6 | `frontend/e2e/content-perf.spec.ts` (nuevo), `frontend/scripts/check-bundle.mjs` |

### 5.2 Cómo se corre la verificación en navegador real
Se **reutiliza** la infraestructura de 0009: `scripts/visual.sh` (build, backend del worktree en
`VISUAL_PORT`, CouchDB de test aislado, contenedor `mcr.microsoft.com/playwright:v1.56.0-jammy`) y
`e2e/fixtures.ts` (`newSession` con `reducedMotion:"reduce"`, `measure`, `tokens`/`tokenColor`/
`themeColors` leídos de `tokens.css`, `shot`, `expectMeasure`/`expectExact`). Salida en
`VISUAL_OUT_DIR=/tmp/s10/e2e`. `fixtures.ts` gana `seedContent()`: notas sembradas por el push de
`/sync` (como `seedNotesBulk`) con `frontmatter` de todos los tipos (string, número, booleano, lista,
complejo, multilínea, 12 propiedades), YAML heredado válido y corrompido, tabla ancha, bloques de
código en los 11 lenguajes + desconocido + sin lenguaje, cita, código en línea, tareas, Mermaid válido
(flowchart y secuencia), inválido y ancho (para zoom), ruta profunda (`Proyectos/Clientes/2026/
Trimestre 4/Acuerdos/Plan de entregas.md`) y una nota en la raíz. Captura y medidas en claro y oscuro
a **1440×900, 1024×768 y 390×844**. No entra en `npm test`.

**Referencias de comparación (RNF-005, Gate 4):** mockup 1.1.4.4 renderizado en el mismo contenedor
(`/tmp/s10/ref/mockup-{tema}-{ancho}.png`, como 0009); career-admin y la captura de Obsidian según
P-14.

### 5.3 Fidelidad visual: comprobaciones objetivas (V-*)
Cada V-* corre en tema oscuro y claro a 1440, 1024 y 390 salvo que diga otra cosa; falla si una
medida sale de tolerancia (§5.4) o un color computado no es el token esperado del tema activo.
| # | Escenario (`/tmp/s10/e2e/…`) | Se compara con | Criterio objetivo |
|---|---|---|---|
| V-1 | `props-read-{tema}-{ancho}.png` | mockup `.frontmatter` | R-3, R-4; un `dt`/`dd` por clave en orden; booleano con texto "Sí"/"No"; chips por elemento; complejo como `code`; **ningún** `---` ni `clave:` crudo en el texto del panel; sin panel en la nota sin propiedades |
| V-2 | `props-form-{tema}-{ancho}.png` | `ux-0010` §1.2 (copiado en §2.3-c) | R-16; nombres accesibles de cada control; foco visible al tabular; a 390 filas apiladas sin scroll horizontal del documento |
| V-3 | `prose-{tema}-{ancho}.png` (cita, código en línea, tareas) | mockup `.read-view blockquote`/`code` | R-5, R-6, R-10; casilla presente por tarea (`checkboxes` = nº de tareas; hoy 0); en lectura sin `tabindex` |
| V-4 | `table-{tema}-{ancho}.png` | career-admin (tablas) | R-7: alto de cada fila de una línea ≤ 40 px (objetivo 31,4 ± 2); tabla ancha: el envoltorio hace scroll (`scrollWidth > clientWidth`) y el documento no |
| V-5 | `codeblock-{tema}-{ancho}.png` | career-admin (`CodeBlockPre`) | R-8; etiqueta = lenguaje declarado / "texto"; por cada lenguaje de RF-030 ≥ 1 `span.sx-*`; color computado de `sx-keyword`/`sx-string`/`sx-number`/`sx-type`/`sx-comment` = token esperado y contraste ≥ 4,5 sobre el fondo del bloque; desconocido/sin lenguaje: 0 `sx-*` y 0 errores de consola |
| V-6 | `code-view-{tema}-{ancho}.png` | mockup `.edit-view-code`/`.cm-*` | R-9; `#`/`##` con 700/600; `**` `--accent-hover`; `` ` `` `--warning-text`; enlace `--info-text`; bloque YAML con fondo `--bg-secondary`; números de línea presentes |
| V-7 | `mermaid-{tema}-{ancho}.png` | career-admin (`MermaidDiagram`) | R-11; `svg` dentro de `role="img"` con nombre; 0 `script`/`foreignObject`/`[on*]`/`a[href]` en el SVG; relleno de nodo = `--accent-soft` compuesto del tema; tras cambiar de tema el relleno cambia sin recargar |
| V-8 | `mermaid-error-{tema}.png`, `mermaid-loadfail-{tema}.png` (chunk abortado con `page.route`) | RF-049/RF-053 | el resto de la nota renderizado; mensaje y fuente visibles; "Reintentar" presente; 0 excepciones no capturadas (`pageerror`) |
| V-9 | `mermaid-zoom-{tema}.png` | career-admin | diagrama ancho: controles visibles, `aria-label` correctos; `+` por teclado cambia el `transform`; "Reajustar" deshabilitado al estar ajustado; diagrama que cabe: sin controles |
| V-10 | `header-{tema}-{ancho}.png`, `header-collapsed-{tema}-{ancho}.png` | `reference/obsidian-breadcrumb.png` (P-17) + R-12 de 0009 | R-1, R-2, R-12; una sola línea (todos los controles con el mismo `top` ± 1) y sin scroll horizontal; separador `/` tenue; ruta profunda: 1440 completa, 1024 y 390 con cada segmento truncado por «…» (`text-overflow`); primera carpeta y nombre siempre visibles; lápiz (nombre «Editar»/«Leer») y `⋮` a la derecha; «Adelante» sin historial con menor contraste que «Atrás» activa; `title` = ruta |
| V-11 | `menu-{tema}.png` | `ux-0010` §5.4 (copiado en §2.3-i) y el `⋮` de `reference/obsidian-breadcrumb.png` (P-17) | R-13; menú en portal, dentro del *viewport*, no recortado; orden de ítems (P-4); flechas/Esc devuelven el foco; "Copiar ruta" anuncia "Ruta copiada" |
| V-12 | `sidebar-folders-{tema}-{ancho}.png` | R-6…R-11 de 0009 + `ux-0010` §6 | R-14; "Raíz" primera fila; carpeta activa con `aria-current` y barra; "Crear en: …" cambia al activar una carpeta; pista visible; error de carpeta duplicada visible y asociado |
| V-13 | todas | RF-040 | color de fondo, borde y texto computados de todos los componentes nuevos ∈ valores del tema activo en `tokens.css` (o composición `color-mix`/alias de ellos) |
| V-14 | `reduced-motion` (contexto ya emulado) | `ux-0010` §8.5 | `transition-duration`/`animation-duration` computados = 0 en menú, copiar, filas y casillas; `scrollTop` de revelar sin animación |
| V-15 | red | RNF-002 | abrir una nota sin bloques de código ni Mermaid: 0 peticiones a chunks de gramáticas extra, `mermaid`, `svg-pan-zoom` ni `frontmatter`; abrir en lectura una con `python`: se pide sólo la gramática de python; con `mermaid`: `mermaid` sí; pasar a edición: se pide `frontmatter` |
| V-16 | 0009 | RF-041 | `workspace-visual.spec.ts` (V-1…V-10 de 0009) y `regression.spec.ts` siguen verdes |

### 5.4 Medidas de referencia (congeladas 2026-10-24)
Fuente: CSS del mockup 1.1.4.4 leído del archivo (líneas 68, 80, 95-97, 108-117, 172) y el
entregable UX (`ux-0010.md` §1–§7). Donde el plan se desvía del mockup, la columna "Objetivo" lo
dice y §7 lo justifica.
| R | Elemento | Mockup / referencia | Objetivo en la app | Tolerancia |
|---|---|---|---|---|
| R-1 | barra superior del editor | 43 px (R-12 de 0009), `--bg-secondary`, borde inf. `--border` | 43 px con migas, flechas, `⋯` y controles, una línea, a 1440/1024/390 | ± 2 |
| R-2 | controles nuevos de la barra | `.mode-btn` 11 px (desvío: nada < 12) | 28 × 28 (36 × 36 con `pointer:coarse`) | ± 1 |
| R-3 | panel de propiedades | `.frontmatter`: `--surface2`, borde 1 `--border`, radio 6, padding 12/16, margen inf. 24 | igual (`--bg-tertiary`) | ± 1 |
| R-4 | texto del panel | mono 11 px `--text-muted` (C-1, falla 4,5:1) | clave mono 12 `--text-secondary`; valor 13 `--text-primary` | exacto |
| R-5 | cita | borde izq. 3 `--accent`, padding 8/16, margen 16 0, `--accent-soft`, radio 0 6 6 0, `--text-dim`, cursiva | igual (`--text-secondary`) | ± 1 / exacto en color |
| R-6 | código en línea | `--surface2`, padding 2/6, radio 4, mono 12, `--accent-hover` | igual (`--bg-tertiary`, `--radius-xs`, `.857em` = 12 sobre 14) | ± 1 |
| R-7 | fila de tabla (una línea) | hoy ~62 px (`/tmp/s10/shots`); career-admin (render local de su fuente, `/tmp/s10/ref/career/`): fila 29 px, celda padding 4/8, `th` 700 | ≤ 40 (objetivo 31,4); celda padding 4/12; `th` `--bg-tertiary` 13/600 | ≤ 40; ± 2 sobre 31,4 |
| R-8 | bloque de código | career-admin: etiqueta superpuesta 10 px mayúsculas en (12,8), `pre` padding superior 28 con lenguaje, mono 12/16, radio 8, «Copiar» 26 × 26 siempre visible (C-5) | cabecera 36; etiqueta mono 12 `--text-secondary`; "Copiar" 28 de alto, ≥ 84 de ancho; `pre` padding 12/16, mono 13/1,6; caja borde 1 `--border`, radio 6, `--bg-tertiary` | ± 1 |
| R-9 | vista Código | mono 13 / 1,8; `.cm-linenum` 28 px `--text-muted`; `.cm-cursor-line` `rgba(255,255,255,.03)` | mono 13 / 1,8; números 12 `--text-secondary`; línea activa `--bg-secondary` (C-2, C-3) | exacto |
| R-10 | casilla de tarea | — | 16 × 16, borde 2 `--text-secondary`, radio 4; zona de clic ≥ 24 × 24 | ± 1 |
| R-11 | área de Mermaid | career-admin: contenedor de 352 px fijo, controles acercar/alejar/restablecer de 26 × 26 abajo a la derecha (C-6) | 96 ≤ alto ≤ 420; `svg` ≤ ancho de columna; controles 28 × 28 a 8 px de la esquina | ± 2 |
| R-12 | migas | `reference/obsidian-breadcrumb.png` (P-17): separador `/` más tenue que el texto, cada segmento truncado con «…», lápiz y `⋮` a la derecha, «Adelante» atenuada | carpeta 13 px `--text-secondary`, 28 de alto; nombre `h2` 13/600 `--text-primary`; separador `/` 13 px `--text-secondary`; «Adelante» sin historial opacidad .5; lápiz y `⋮` 28 × 28 | ± 1 |
| R-13 | menú `⋮` | `⋮` vertical de `reference/obsidian-breadcrumb.png` (P-17) | ancho ≥ 200, ítem 32 (40 táctil), radio 10, `--bg-secondary`, `--shadow-panel` | ± 1 |
| R-14 | barra lateral | 0009 R-8 (fila 27/25) | "Raíz" 27; "Crear en" 12 px; carpeta activa `--bg-tertiary` + 600 + barra inset 3 `--text-secondary` | ± 1 |
| R-15 | columna y cuerpo | 0009 R-13/R-14 | sin cambio: 780 máx. centrada; 14 px / 1,8 | ± 2 / exacto |
| R-16 | formulario de propiedades | `ux-0010` §1.2 | columnas 160 / 96 / 1fr / 28; controles 28; separación 8 | ± 1 |

### 5.5 Contrastes que fija `editor/contrast.test.ts` (WCAG 2.x, desde `tokens.css`)
Copiados de `ux-0010.md` (Apéndice B y tablas §1–§7; oscuro / claro, sobre P=`--bg-primary`,
S=`--bg-secondary`, T=`--bg-tertiary`). Texto ≥ 4,5; no texto ≥ 3.
| Par | Mínimo medido | Umbral |
|---|---|---|
| `--success-text` / `--warning-text` sobre T (claro, el peor caso) | 4,58 / 4,58 | 4,5 (margen 0,08: el test lo fija) |
| `--info-text`, `--danger-text` sobre P/S/T | ≥ 5,42 claro, ≥ 5,68 oscuro | 4,5 |
| `--accent-hover` sobre T (texto de acento, keyword) | 6,47 / 4,89 | 4,5 |
| `--text-secondary` sobre P/S/T | ≥ 5,68 / ≥ 6,92 | 4,5 |
| `--text-primary` sobre `--accent-soft` (chips) | 10,32 / 14,58 | 4,5 |
| `--text-secondary` sobre `--accent-soft` compuesto sobre P (cita) | 5,45 / 6,73 | 4,5 |
| `--text-primary` sobre `--danger-bg` (avisos de error) | 14,37 / 15,82 | 4,5 |
| Mermaid: `--text-primary` sobre `--accent-soft` compuesto sobre S (nodo) | 11,38 / 15,26 | 4,5 |
| Mermaid: borde `--accent` vs relleno de nodo / vs fondo S | 3,77 / 3,15 · 4,69 / 3,52 | 3 |
| `--border-control` sobre P/S/T (controles nuevos) | 3,57/3,30/3,01 · 4,76/4,55/4,34 | 3 |
| borde de casilla `--text-secondary` y foco `--accent` sobre P/S/T | ≥ 4,27 / ≥ 3,36 | 3 |
| **Prohibidos como texto** (el test falla si un selector nuevo los usa en `color`) | `--text-muted` 3,01 / 2,34 sobre T; `--accent` 4,27 / 3,36 sobre T | — |

### 5.6 RNF-001 y RNF-002 en navegador real
- `content-perf.spec.ts`: nota de referencia de ~200 KiB con 50 bloques de código (los 11 lenguajes)
  y 5 Mermaid; **30 aperturas** en lectura a 1440×900; tiempo desde el clic en el árbol hasta que el
  primer y el último párrafo del cuerpo están en el DOM (`MutationObserver` + `performance.now()`,
  método de 0009) → **p95 ≤ 150 ms**; `PerformanceObserver('longtask')` durante resaltado y
  diagramas → ninguna tarea > 200 ms atribuible a un bloque (render de Mermaid en serie, un diagrama
  por tarea, cediendo el hilo entre diagramas). RNF-001 de 0009 (árbol de 1000 notas p95 ≤ 150 ms):
  `workspace-perf.spec.ts` sin cambios.
  **Sustituido por la Enmienda 1 (§10.8):** la sonda de reaperturas se retira; RNF-001 se mide sobre la
  primera apertura de notas precalculadas (a), con la apertura en frío informada aparte (b, B-1).
- `check-bundle.mjs` (`npm run test:bundle`, tras `vite build`): entrada ≤ 157 020 B gzip; editor ≤
  357 388 B gzip; existen chunks separados para `mermaid`, `svg-pan-zoom`, `frontmatter` (yaml) y
  cada gramática extra; ninguno es importación estática de la entrada ni del editor (lee el
  `manifest` de Vite: `build.manifest: true`).

## 6. Secuenciación (tests antes que código; maquetación primero)
**Antes de la Fase 4:** worktree con `npm ci` (hecho para medir), entorno del backend y línea base
limpia (pytest, vitest, typecheck, `test:sync`, `test:perf`, `test:visual` de 0009, gate) **antes**
de la primera tarea; `npm run build` reproduce 141 660 B / 316 428 B.

0. **[doc] Re-anclaje preventivo** (P-15): nota en `0008-vault-editor/spec.md`,
   `0009-rediseno-visual-workspace/spec.md` y `0007-fastapi-sirve-spa/spec.md` (`strict`: sin ella el
   primer cambio en sus `covers` cierra la compuerta). ADR-006 de tokens en borrador (P-1).
1. **A · Maquetación y estilos de todos los componentes, con datos simulados.** Dependencias
   instaladas con versión exacta; datos = notas sembradas por `/sync` (`seedContent`) y, en jsdom,
   objetos fijos. Ninguna persistencia nueva todavía: el formulario de propiedades edita un estado
   local; el menú y las migas llaman a *stubs*; las flechas reciben `canBack/canForward` fijos.
   1. Tokens nuevos + `syntax.css` (test de contraste y de "sin literales" → CSS).
   2. Panel de propiedades de lectura (tests → `PropertiesPanel`).
   3. Formulario de propiedades (tests de estructura, nombres, foco, validación visual → `PropertiesForm`
      con `properties.ts`).
   4. Avisos (variantes y textos).
   5. Cita, código en línea, tareas (`taskItemView`), tabla (`tableView` + `td > p`).
   6. Chasis del bloque de código (`codeBlockView`: cabecera 36, etiqueta, "Copiar" con sus estados) y
      paleta `sx-*` con un *parser* de prueba síncrono.
   7. Chasis de Mermaid: área, estados cargando/error/fallo/vacío, controles de zoom (con un SVG fijo
      de prueba y el módulo falso).
   8. Vista Código: tema, números de línea, línea activa, colores del markdown (Lezer real: ya está).
   9. Encabezado: flechas, `NoteBreadcrumb` (con `breadcrumb.ts`), "Insertar tabla", `NoteMenu`,
      ≤ 560 px sólo icono, 43 px.
   10. Barra lateral: "Raíz", carpeta activa (estado local), "Crear en", "Nueva carpeta" (formulario y
      errores visuales), pista.
2. **B · Revisión visual temprana** (method.md v1.9): `test:visual --grep "V-(1|2|3|4|5|6|7|10|11|12|13)"`
   con los datos sembrados + capturas lado a lado con el mockup 1.1.4.4 (renderizado en el mismo
   contenedor), career-admin y Obsidian (P-14); revisión rápida del experto-ux-ui sobre las capturas.
   Aquí se corrige el desvío antes de cablear la lógica. Sonda temprana de RNF-001 (sólo apertura en
   lectura de la nota de 200 KiB) para detectar a tiempo si Milkdown por sí solo supera 150 ms (§7).
3. **C · Lógica.**
   1. **Frontmatter de ida y vuelta:** `frontmatter.test.ts` (contrato, rojo) → `frontmatter.ts`;
      `noteStore.test.ts` (`save` con `frontmatter`, rama, 64 KiB) → `noteStore.save`;
      `NoteEditorFrontmatter.test.tsx` (RF-012…RF-022, RF-044, RF-045, bloque protegido) → sesión de
      edición de `NoteEditor` y `CodeView` (YAML, error de línea); formulario conectado a la sesión.
   2. **Carpetas y bug `.md` en servidor y cliente:** casos nuevos en `note_rules_cases.json` +
      `test_note_rules.py`, `test_note_contract.py` y `test_note_sync_push.py` (rojos) →
      `note_rules.check_path` → delta de `note.schema.json`; `noteRules.test.ts` → `checkPath`;
      `untitled.test.ts`, `folders.test.ts`, `noteStore.test.ts` (crear en carpeta, `Carpeta/`, puerta
      RF-008) → `untitled.ts`, `folders.ts`, `noteStore.ts`; `NoteSidebar.test.tsx`/
      `VaultWorkspacePage.test.tsx` (carpeta activa real, "Nueva carpeta", revelar) → cableado.
   3. **Portapapeles:** `MilkdownView.test.tsx` (pegado de tabla, mal formada, VS Code) →
      `.use(clipboard)` + ajuste P-8; "Insertar tabla" y filas/columnas reales (P-7).
   4. **Resaltado real:** `languages.test.ts`, `proseHighlight.test.ts` (carga diferida, fallo) →
      `highlight/*`; `CodeView` con `codeLanguages`.
   5. **Mermaid:** `renderMermaid.test.ts`, `themeVariables.test.ts` → `mermaid/*` (carga real,
      verificación del SVG, tema, *debounce*, `panZoom`).
   6. **Historial:** `noteHistory.test.ts` → `noteHistory.ts`; `VaultWorkspacePage.test.tsx`
      (atrás/adelante, saltos, aviso de cambios, Alt+←/→, recarga de pestaña) → `Workspace`; menú `⋯`
      conectado a los flujos reales; "Copiar ruta".
   7. `securityGuard.test.ts`, `check-bundle.mjs`, `content-perf.spec.ts`.
4. **D · Verificación completa:** `test:visual` completo (V-1…V-16) en ambos temas y tres anchos,
   `test:bundle`, `content-perf.spec.ts`, suites de 0008/0009, backend; **experto-ux-ui con
   `ui-ux-pro-max` como validador** (WCAG 2.x AA: contraste, foco visible, teclado, nombres
   accesibles, lector de pantalla con el árbol de accesibilidad de Chromium, responsive 1440/1024/390,
   reduced-motion), con su evidencia de la skill pegada; comparación de capturas aprobada (RNF-005).
5. **E · Documentación** (§8) y notas de re-anclaje de cierre.

## 7. Seguimiento de complejidad, riesgos y decisiones para el GATE 2
| Decisión / riesgo | Justificación y recomendación |
|---|---|
| **P-1 · Extensión del sistema de diseño (ADR-006):** 6 tokens nuevos en ambos temas: `--success-text`, `--warning-text`, `--info-text`, `--danger-text` (Tailwind 700 de la misma familia en claro; = token actual en oscuro), `--border-control`, `--radius-xs` | En claro **ningún** color semántico actual llega a 4,5:1 sobre T (`--success` 3,01, `--warning` 2,91, `--info` 3,74, `--danger` 4,41); RNF-004 lo exige al resaltado. `tokens.css` dice "no inventar valores: 1.1.4.1 es la fuente": por eso ADR + actualización de 1.1.4.1. **Alternativa:** resaltar sólo con `--text-primary`/`--text-secondary`/`--accent-hover` (cadenas y números sin color) y sin `--border-control` (inputs nuevos a 1,2–1,4:1 como los actuales). **Recomendación:** aceptar los 6. |
| **P-2 · `--text-muted` y `--accent` prohibidos como color de texto** en esta feature (C-1, C-2, C-4) | `--text-muted` 3,01/2,34 sobre T y `--accent` 4,27/3,36 no cumplen 4,5:1; el mockup los usa en `.frontmatter`, `.cm-meta`, `.cm-linenum`, `.cm-link`(`--info`), `.cm-code`(`--warning`), `.mode-btn`. Se sustituyen por `--text-secondary`, `--accent-hover` y los `-text`. Desvío visible frente al mockup (más contraste). **Recomendación:** aceptar (RNF-004 manda). |
| **P-3 · Resaltador = gramáticas Lezer** (las de CodeMirror) en las tres vistas, vía `prosemirror-highlight` 0.16.0, en vez de highlight.js (career-admin) | §2.5 D-T1: +1,8 KiB en el editor y gramáticas nuevas diferidas frente a 30–33 KiB de lowlight/refractor; coloreado idéntico en Código y lectura. **Interpretación de RNF-002 a confirmar:** "el resaltador sólo se descarga al mostrar un bloque con lenguaje admitido" se cumple para el *parser* y las gramáticas **nuevas** (chunks propios); las de js/ts/tsx/css/html/markdown ya viajan en el chunk del editor desde 0008 (las trae `@codemirror/lang-markdown`) y no son una descarga nueva. **Recomendación:** aceptar. |
| **P-4 · Orden del menú `⋯`** (C-9): Renombrar/mover · Copiar ruta · Ver en Código · separador · Borrar | RF-061 fija el conjunto, no el orden; la regla `destructive-nav-separation` separa lo destructivo. **Recomendación:** aceptar. |
| **P-5 · Aviso previo del YAML heredado** (RF-044): al abrir en edición una nota `migrate` se muestra un `status` informativo ("Se moverán al panel de propiedades cuando guardes"), "Guardar" queda habilitado sin ediciones (para poder migrar) y salir sin editar **no** pide confirmación ni cambia la nota | La spec sólo exige el aviso posterior; sin el previo, el usuario no sabe que guardar moverá texto. Habilitar Guardar sin "sucio" evita tener que editar algo para migrar. **Recomendación:** aceptar. |
| **P-6 · Bloque `---…---` heredado protegido** en Visual y lectura (RF-045, RF-020): el bloque estricto inicial que **no** se migra (ya hay `frontmatter` o no es un mapa válido) no se entrega a Milkdown; se muestra literal en mono dentro del aviso y se re-antepone byte a byte al emitir desde Visual. Formas ya corrompidas (`***`, `\[…]`) sí van a Milkdown (no tienen límite fiable) y el test exige que su ida y vuelta por Visual sea un punto fijo | "Dejarlo como cuerpo **sin modificarlo**": entregado a Milkdown, cualquier edición en Visual lo reescribiría a `***` y `\[`. En lectura, el mismo tratamiento evita pintar el YAML como regla + H2. **Alternativa:** entregarlo a Milkdown (se corrompe al editar). **Recomendación:** aceptar. |
| **P-7 · Añadir filas y columnas** tras "Insertar tabla" | RF-025 sólo crea 2×(1+1); en 7.22.3 Tab en la última celda **no** añade fila (verificado). Propuesta: con el cursor en una tabla, junto a "Insertar tabla" aparecen "Añadir fila debajo" (`between-horizontal-end`) y "Añadir columna a la derecha" (`between-vertical-end`), 28×28, `addRowAfterCommand`/`addColAfterCommand`. Es UI no pedida por un RF (se anotaría como ampliación de RF-025). **Alternativa:** limitación documentada (filas/columnas en Código). **Recomendación:** incluir los dos botones. |
| **P-17 · Breadcrumb fiel a la captura de Obsidian** (`reference/obsidian-breadcrumb.png`, aportada por Carlos) | La captura difiere de la redacción de RF-054…RF-065 en cuatro detalles: separador `/` (no `›`); truncado **por segmento** con "…" (no colapso de intermedios); un **lápiz** a la derecha que alterna edición/lectura (en Synapse: el botón "Editar/Leer" existente se mueve a la barra); menú **⋮ vertical** (no ⋯). La flecha "adelante" sin historial se ve atenuada. **Decisión (GATE 2):** seguir la captura en los cuatro puntos; V-* del breadcrumb se miden contra ella. |
| **P-18 · Parseo precalculado (Enmienda 1, Directiva de Pausa)** | La sonda T-050 dio p95 204,4 ms con la nota de 181 KiB. Decisión de AIRA: ids de encabezado al parsear, `content-visibility:auto` en lectura y caché de mdast por `(id, rev)` calculada en un Worker con el mismo pipeline. Diseño, medidas y tareas en §10. **BLOQUEADOR B-1** (§10.7): la apertura en frío de notas ≳ 100 KiB sigue en ≈ 194 ms p95 → decisión de producto pendiente. |
| **P-8 · Pegado desde VS Code** | `@milkdown/plugin-clipboard` 7.22.3 convierte todo pegado con `vscode-editor-data` en **un bloque de código** del lenguaje de VS Code: una tabla copiada de un `.md` en VS Code llegaría como bloque `markdown`, contra RF-023. Ajuste: un `handlePaste` previo (más prioridad) que, si el modo es `markdown`, interpreta el `text/plain` como markdown; el resto sigue igual. **Recomendación:** aceptar. |
| **P-9 · Presupuestos de *bundle*** | Entrada ≤ +15 KiB gzip sobre **141 660 B** (RNF-002, medido hoy); propuesta nueva: chunk del editor ≤ +40 KiB sobre **316 428 B**; chunks propios para `yaml` (37,1), `mermaid` (167,6 + diagramas), `svg-pan-zoom` (10,5) y gramáticas extra. Script `test:bundle` con el *manifest* de Vite. **Recomendación:** aceptar (afinar tras C si el editor se acerca al tope). |
| **P-10 · Mermaid 11.17.2 y comportamiento** | Versión exacta 11.x (12.2.0 existe; la spec fija 11.x). `secure` ampliado (`theme`, `themeVariables`, `themeCSS`, `darkMode`, `fontFamily`, `htmlLabels`, `flowchart`, `look`, `securityLevel`…); rueda sólo con Ctrl/⌘ y alto tope 420 px (C-6, desvío de career-admin); render en serie con cesión del hilo (RNF-001); *debounce* 400 ms (≤ 500 de RF-047). **Recomendación:** aceptar. |
| **P-11 · Vista Código con números de línea y línea activa** | El mockup los dibuja (`.cm-linenum`, `.cm-cursor-line`) y RF-029 pide "como el mockup"; 0008 no los tenía. Cambio visible de la vista Código. **Recomendación:** aceptar. |
| **P-12 · Borrar una nota con ruta inválida heredada** (RF-008) | El push rechazaría también la revisión de papelera (`validation-error:path`), dejando un rechazo pendiente. Propuesta: la puerta de RF-008 cubre `save` **y** `softDelete` (mensaje "Renómbrala…" con botón "Renombrar"). **Alternativa:** dejar borrar y que el rechazo aparezca en "Cambios rechazados". **Recomendación:** aceptar la puerta. |
| **P-13 · Objetivos táctiles 28/36 px** (C-8) | WCAG 2.2 AA web = 24 px; la barra de 43 px (R-12 de 0009) no admite 44 px. 28 px en escritorio, 36 px con `pointer: coarse`. **Recomendación:** aceptar como excepción documentada. |
| **P-14 · Referencias de comparación** (RNF-005) | Mockup: renderizado en el contenedor (como 0009). **career-admin:** no hay capturas versionadas; propuesta: capturar `CareerResourceView` con un recurso que tenga tabla, bloque de código y Mermaid (en producción de cjhirashi-career o con su `npm run dev`, sin tocar ese repo) y guardarlas en `/tmp/s10/ref/career-*.png`. **Obsidian:** la captura que Carlos dio a AIRA debe quedar en `/tmp/s10/ref/obsidian-breadcrumb.png` antes del bloque B. **Pedido al GATE 2:** confirmar quién aporta ambas y de dónde. |
| **P-15 · Tocar archivos de features cerradas** | `notes/**`, `editor/**` (0008, `strict`), `tokens.css`, `notes.css`, `editor.css`, `e2e/**`, `NoteSidebar`, `VaultWorkspacePage` (0009, `strict`), READMEs (0007, `strict`), `note.schema.json` y batería (0008). Ningún RF de esas specs cambia salvo lo de RF-041; nota de re-anclaje **al inicio** (tarea 0) y al cierre (procedimiento de 0009 P-10). |
| **P-16 · Recomendaciones "debería" del experto** | Se incluyen: "Ver código" en Mermaid (sin él el contenido del SVG no llega al lector de pantalla), resumen de errores del formulario, "Mostrar n más" con ≥ 10 propiedades, "Reintentar" en el fallo de carga. Fuera: "Deshacer" de 8 s al quitar propiedad, 4 botones de desplazamiento del diagrama (WCAG 2.2 2.5.7; el proyecto cita 2.1 AA y el teclado ya lo cubre), salto por letra en el menú. **Recomendación:** aceptar ese reparto. |
| C-13 / C-14 preexistentes (backlog) | Botón primario global blanco sobre `--accent` 3,68:1 y bordes de input globales 1,18–1,40:1: fuera de alcance (no los introduce 0010). Se abre ítem de backlog; los controles **nuevos** usan `--border-control` (P-1). |
| C-11, C-12 (skill vs sistema) | La skill propuso paleta verde/slate, estilo OLED, IBM Plex y Phosphor: **rechazado** (gana 1.1.4.1: cian, MD3, Inter/JetBrains Mono, Lucide). Duraciones: tokens 120/200 ms. Sin decisión pendiente. |
| Riesgo · RNF-001 con Milkdown | Abrir 200 KiB de markdown en Milkdown (remark + ProseMirror) puede rondar por sí solo los 150 ms en lectura; la sonda del bloque B lo mide antes de cablear. Si la línea base ya lo supera, se eleva como hallazgo (no se "arregla" con *lazy rendering* sin una decisión). |
| Riesgo · Mermaid y `foreignObject` | Algunos tipos de diagrama podrían emitir `foreignObject` aun con `htmlLabels:false`; la verificación del SVG los convierte en error de diagrama (seguro por defecto). V-7 cubre flowchart y secuencia. |
| Riesgo · instancia única de `prosemirror-view` | `prosemirror-highlight` crea `Decoration` de su `prosemirror-view`; si no se deduplica con el de `@milkdown/prose`, las decoraciones no se aplican. Test: `npm ls prosemirror-view` con una sola versión + test de clases en el DOM. |
| Riesgo · `diseño/` no versionado | Medidas congeladas en §5.4; ADR-006 registra los tokens (P-1). |
| Configuración compartida sin `covers` | `vite.config.ts` (`build.manifest: true`), `package.json`/`package-lock.json` (scripts y dependencias): precedente PLAN-0003 §14 / 0008 §7 / 0009 §7. |

## 8. Impacto en documentación (Art. 11)
> Mapa efectivo: `AGENTS.md` + README por capa; `docs/API.md` no existe (canon = `contracts/`).
> `diseño/` está en `.gitignore`: **no se versiona**; su actualización se hace en el checkout
> principal y queda registrada en el ADR (versionado) y en `history.md` con el diff pegado.

| Documento | Qué cambia | Acción |
|---|---|---|
| `0010-…/contracts/frontmatter-yaml.cases.json` | tabla de tipos de RF-018 y reglas de separación | creado en este plan |
| `0008-vault-editor/contracts/note.schema.json` | patrón y descripción de `path` (último segmento ≠ `.md`) | actualizar (Fase 4, C.2) |
| `.harness/decisions/ADR-006-extension-tokens-contenido.md` (nuevo) | 6 tokens nuevos, motivo (contraste del claro), alternativa descartada, efecto en 1.1.4.1 | crear (tras GATE 2) |
| `diseño/1.1.4 - Diseño UI-UX/1.1.4.1 - Sistema de Diseño.md` (no versionado) | tabla de color con los 4 `-text`, `--border-control`, `--radius-xs` y la regla "`--accent`/`--text-muted` no son color de texto" | actualizar en el checkout principal; diff en `history.md` |
| `backend/README.md` | §Sincronización: regla de `path` (último segmento ≠ `.md`) en la lista de validaciones del push | actualizar |
| `backend/app/core/README.md` | `check_path`: regla nueva | actualizar |
| `backend/tests/README.md` | casos nuevos de `path` en `note_rules_cases.json` | actualizar |
| `frontend/README.md` | dependencias nuevas, `npm run test:bundle`, `VISUAL_OUT_DIR=/tmp/s10/e2e`, `content-visual`/`content-perf` | actualizar |
| `frontend/src/README.md` | módulos nuevos (`folders`, `noteHistory`, `frontmatter`, `properties`, `breadcrumb`, `highlight/`, `mermaid/`, *node views*), sesión de edición D1, carpeta activa e historial, carga diferida | actualizar |
| `0007`, `0008`, `0009` `spec.md` | nota de re-anclaje (sin cambio de requisitos) al inicio y al cierre | actualizar |
| `0008-vault-editor/diagrams/`, `ARCHIFY.md` | el flujo de datos de nota no cambia (`frontmatter` ya viajaba por `/sync`) → **sin cambio**, verificado contra el mapa | ninguna |
| `.harness/memory/state.md` | estado de 0010 y backlog C-13/C-14 | actualizar en el cierre |

## 9. Implementación por requisito
Rutas relativas a `frontend/src/` salvo indicación. Fidelidad = V-* de §5.3.

### Implementación de RF-001
`notes/noteStore.ts` (`create(vaultId, title, folder)`, `titleToPath`), `notes/folders.ts` (`joinPath`), `notes/untitled.ts` (por carpeta), `notes/NoteSidebar.tsx` (usa la carpeta activa), `notes/VaultWorkspacePage.tsx` (la provee). Tests: `notes/noteStore.test.ts`, `notes/untitled.test.ts`, `notes/folders.test.ts`, `notes/NoteSidebar.test.tsx`; V-12.

### Implementación de RF-002
`notes/NoteSidebar.tsx` ("Crear en: …" con `aria-live` y `aria-describedby`), `notes/notes.css`. Tests: `notes/NoteSidebar.test.tsx`; V-12.

### Implementación de RF-003
`notes/NoteSidebar.tsx` (botón y formulario "Nueva carpeta", despliegue y apertura en edición), `notes/noteStore.ts` (`create(vaultId, "", folder)`), `notes/untitled.ts`. Tests: `notes/NoteSidebar.test.tsx`, `notes/noteStore.test.ts`; V-12.

### Implementación de RF-004
`notes/folders.ts` (`checkFolderName`), `notes/messages.ts`, `notes/NoteSidebar.tsx` (error junto al campo). Tests: `notes/folders.test.ts`, `notes/NoteSidebar.test.tsx`.

### Implementación de RF-005
`notes/folders.ts` (`folderExists` con `pathKey`), `notes/messages.ts` ("Ya existe una carpeta con ese nombre"). Tests: `notes/folders.test.ts`, `notes/NoteSidebar.test.tsx`; V-12.

### Implementación de RF-006
`notes/NoteSidebar.tsx` (pista con `id` en `aria-describedby` de Nueva nota, Renombrar y Nueva carpeta), `notes/notes.css`. Tests: `notes/NoteSidebar.test.tsx`; V-12.

### Implementación de RF-007
`backend/app/core/note_rules.py` (`check_path`), `notes/noteRules.ts` (`checkPath`), `notes/noteStore.ts` (`titleToPath` sin `.md` tras segmento vacío); contrato `0008-vault-editor/contracts/note.schema.json` (delta §4). Tests: `backend/tests/fixtures/note_rules_cases.json`, `backend/tests/test_note_rules.py`, `backend/tests/test_note_contract.py`, `backend/tests/test_note_sync_push.py` (CouchDB real), `notes/noteRules.test.ts`, `notes/noteStore.test.ts` (rechazo sin escribir).

### Implementación de RF-008
`notes/noteStore.ts` (puerta en `save`/`softDelete`, P-12), `notes/messages.ts`, `editor/NoteEditor.tsx` (aviso con "Renombrar" → `NoteSidebarHandle.startRename`, borrador conservado), `notes/NoteSidebar.tsx` (la nota se lista y se abre). Tests: `notes/noteStore.test.ts`, `editor/NoteEditorFrontmatter.test.tsx`, `notes/VaultWorkspacePage.test.tsx`.

### Implementación de RF-009
`editor/PropertiesPanel.tsx`, `editor/properties.ts` (`toRows`), `editor/editor.css`, `editor/NoteEditor.tsx` (lo monta en lectura). Tests: `editor/PropertiesPanel.test.tsx`, `editor/properties.test.ts`; V-1.

### Implementación de RF-010
`editor/PropertiesPanel.tsx` (nada si vacío), `editor/PropertiesForm.tsx` ("Añadir propiedad" compacto). Tests: `editor/PropertiesPanel.test.tsx`, `editor/PropertiesForm.test.tsx`; V-1, V-2.

### Implementación de RF-011
`editor/PropertiesForm.tsx`, `editor/properties.ts` (tipos, `convert`, `validateRows`, `parseNumberInput`). Tests: `editor/PropertiesForm.test.tsx`, `editor/properties.test.ts`; V-2.

### Implementación de RF-012
`editor/NoteEditor.tsx` (sucio por propiedades con `sync/canonical.ts`, mismas guardas de 0008, guardado explícito con `frontmatter`), `notes/noteStore.ts` (`save(…, frontmatter)`). Tests: `editor/NoteEditorFrontmatter.test.tsx`, `notes/noteStore.test.ts`.

### Implementación de RF-013
`editor/properties.ts` (tipo `complex`, conservado por `fromRows`), `editor/PropertiesPanel.tsx`, `editor/PropertiesForm.tsx` (sólo lectura + "Quitar"). Tests: `editor/properties.test.ts`, `editor/PropertiesForm.test.tsx`, `editor/NoteEditorFrontmatter.test.tsx` (guardar desde Visual conserva el valor).

### Implementación de RF-014
`editor/frontmatter.ts` (`composeCode`, `stringifyFrontmatter`), `editor/CodeView.tsx`, `editor/NoteEditor.tsx`. Tests: `editor/frontmatter.test.ts` (sección `compose`), `editor/NoteEditorFrontmatter.test.tsx`; contrato `contracts/frontmatter-yaml.cases.json`.

### Implementación de RF-015
`editor/frontmatter.ts` (`splitFrontmatter`), `editor/NoteEditor.tsx` (guardar desde Código), `notes/noteStore.ts`. Tests: `editor/frontmatter.test.ts` (sección `split`), `editor/NoteEditorFrontmatter.test.tsx`.

### Implementación de RF-016
`editor/frontmatter.ts` (stringify/parse sin pérdida), `editor/NoteEditor.tsx` (sin cambios = mismos `frontmatter` y `content`). Tests: `editor/frontmatter.test.ts` (sección `roundtrip`), `editor/NoteEditorFrontmatter.test.tsx` (abrir en Código, alternar, guardar sin cambios → documento idéntico, incluidos complejos).

### Implementación de RF-017
`editor/frontmatter.ts` (`parseFrontmatterYaml`: códigos y línea), `editor/NoteEditor.tsx` (no guarda ni cambia de vista, aviso `alert`, "Ir a la línea"), `editor/CodeView.tsx` (decoración de línea), `notes/messages.ts`. Tests: `editor/frontmatter.test.ts` (sección `parse`), `editor/NoteEditorFrontmatter.test.tsx`, `editor/CodeView.test.tsx`.

### Implementación de RF-018
`editor/frontmatter.ts` (YAML 1.2 core con `yaml` 2.9.1). Tests: `editor/frontmatter.test.ts`; contrato `contracts/frontmatter-yaml.cases.json` (fechas, `yes`/`no`/`on`, números, listas, complejos).

### Implementación de RF-019
`notes/noteRules.ts` (`checkFrontmatter`, existente), `notes/noteStore.ts` (lo aplica en `save`), `editor/NoteEditor.tsx` (aviso con KiB, texto conservado), `notes/messages.ts`. Tests: `notes/noteStore.test.ts`, `editor/NoteEditorFrontmatter.test.tsx`.

### Implementación de RF-020
`editor/NoteEditor.tsx` (Milkdown recibe sólo `body`; bloque protegido fuera del documento, P-6), `editor/MilkdownView.tsx` (`prefix`), `editor/PropertiesForm.tsx` (única fuente de cambios de `frontmatter` en Visual). Tests: `editor/NoteEditorFrontmatter.test.tsx` (guardar desde Visual no toca el YAML de `content`; `frontmatter` cambia sólo por el formulario), `editor/MilkdownView.test.tsx`.

### Implementación de RF-021
`editor/NoteEditor.tsx` (sesión: Visual = `{props, body}`, Código = texto compuesto; conversión al alternar). Tests: `editor/NoteEditorFrontmatter.test.tsx`.

### Implementación de RF-022
Sin cambio de sincronización: `frontmatter` viaja como hasta ahora; `notes/mergeNote.ts`/`sync/conflicts.ts` ya mandan a manual un choque de `frontmatter` (0008 RF-009). `notes/noteStore.ts` (`saveAsBranch` escribe el `frontmatter` nuevo). Tests: `notes/noteStore.test.ts` (rama con `frontmatter`), `notes/mergeNote.test.ts` y `sync/conflicts.test.ts` (existentes, sin cambios: lo confirma `git diff --stat`), `notes/notes.integration.test.ts` (`test:sync`: `frontmatter` sobrevive a push/pull).

### Implementación de RF-023
`editor/MilkdownView.tsx` (`@milkdown/plugin-clipboard` + ajuste VS Code, P-8). Tests: `editor/MilkdownView.test.tsx` (tabla, listas, énfasis pegados como estructura; enlace pegado con `javascript:` sin `href`).

### Implementación de RF-024
`editor/MilkdownView.tsx` (mismo *parser*: lo que no es tabla queda como párrafo). Tests: `editor/MilkdownView.test.tsx` (texto pegado = texto del documento, carácter a carácter, para filas desiguales y sin separador).

### Implementación de RF-025
`editor/MilkdownView.tsx` (`registerCommands.insertTable` → `insertTableCommand({row: 2, col: 2})`; `addRowAfter`/`addColAfter`, P-7), `editor/NoteEditor.tsx` (botón "Insertar tabla" sólo en Visual + contextuales). Tests: `editor/MilkdownView.test.tsx`, `editor/NoteEditor.test.tsx`; V-4.

### Implementación de RF-026
`editor/editor.css` (`td > p, th > p {margin:0}`, padding 4/12), `editor/tableView.ts` (envoltorio). Tests: `notes/layoutCss.test.ts` (regla presente); V-4 (≤ 40 px medido).

### Implementación de RF-027
`editor/highlight/proseHighlight.ts`, `editor/highlight/languages.ts`, `editor/highlight/highlighter.ts`, `editor/MilkdownView.tsx`, `editor/syntax.css`. Tests: `editor/highlight/proseHighlight.test.ts`, `editor/MilkdownView.test.tsx`; V-5.

### Implementación de RF-028
Mismo plugin en Visual (las decoraciones se recalculan en cada transacción que toca un bloque). Tests: `editor/highlight/proseHighlight.test.ts` (editar actualiza clases); V-5.

### Implementación de RF-029
`editor/CodeView.tsx` (`yamlFrontmatter` + `markdown({codeLanguages})` + `syntaxHighlighting`), `editor/highlight/highlighter.ts`, `editor/editor.css`. Tests: `editor/CodeView.test.tsx`; V-6.

### Implementación de RF-030
`editor/highlight/languages.ts` (11 lenguajes y sus alias, sin mayúsculas). Tests: `editor/highlight/languages.test.ts`; V-5 (un `sx-*` por lenguaje).

### Implementación de RF-031
`editor/highlight/languages.ts` (`findLanguage` → `null`), `editor/highlight/proseHighlight.ts` (sin decoraciones). Tests: `editor/highlight/proseHighlight.test.ts` (sin excepción, sin `console.error`); V-5.

### Implementación de RF-032
`editor/highlight/proseHighlight.ts` (promesa rechazada → se recuerda el fallo, sin decoraciones, sin reintentos en bucle), `editor/CodeView.tsx` (`codeLanguages` con carga fallida = texto). Tests: `editor/highlight/proseHighlight.test.ts`; V-15 (chunk abortado).

### Implementación de RF-033
`editor/codeBlockView.ts` (etiqueta = `node.attrs.language` tal cual, o "texto"). Tests: `editor/codeBlockView.test.ts`; V-5, V-7.

### Implementación de RF-034
`editor/codeBlockView.ts` ("Copiar" → `navigator.clipboard.writeText(node.textContent)`, región viva "Copiado"). Tests: `editor/codeBlockView.test.ts` (texto exacto, `mermaid` copia la fuente).

### Implementación de RF-035
`editor/codeBlockView.ts` (sin API o rechazo → mensaje en el bloque, sin excepción). Tests: `editor/codeBlockView.test.ts`.

### Implementación de RF-036
`editor/codeBlockView.ts` (cabecera, botón y diagrama fuera de `contentDOM`, `contenteditable=false`). Tests: `editor/MilkdownView.test.tsx` (serializar tras montar y tras editar otra parte = entrada, sin rastro de etiqueta/botón/SVG).

### Implementación de RF-037
`editor/editor.css` (`blockquote` del mockup, anidada sin fondo). Tests: `notes/layoutCss.test.ts`, `editor/contrast.test.ts`; V-3 (R-5).

### Implementación de RF-038
`editor/editor.css` (`code` en línea). Tests: `notes/layoutCss.test.ts`, `editor/contrast.test.ts`; V-3 (R-6).

### Implementación de RF-039
`editor/taskItemView.ts` (lectura `role="img"`; Visual `input` que hace `setNodeMarkup`), `editor/editor.css`. Tests: `editor/taskItemView.test.ts`, `editor/MilkdownView.test.tsx` (alternar marca sucio; serializa `- [x]`); V-3 (R-10).

### Implementación de RF-040
`styles/tokens.css` (P-1), `editor/syntax.css`, `editor/editor.css`, `notes/notes.css`, `editor/mermaid/themeVariables.ts`. Tests: `editor/contrast.test.ts`, `notes/layoutCss.test.ts` (sin literales), `editor/mermaid/themeVariables.test.ts`; V-13, V-7.

### Implementación de RF-041
Cambios **explícitos** de tests de 0008/0009 (los únicos permitidos): (1) el `h2` del editor pasa de la ruta sin `.md` (`Carpeta/Nota`) al **nombre** (`Nota`) dentro de `nav[aria-label="Ruta"]` — se actualizan las aserciones de nombre en `editor/NoteEditor.test.tsx` y `notes/VaultWorkspacePage.test.tsx` que usen rutas con carpeta; (2) el primer `treeitem` del árbol es "Raíz" — se actualizan en `notes/NoteSidebar.test.tsx` las aserciones de orden/Inicio que daban por hecho otra fila; (3) `.note-editor-header` cambia su *padding* vertical (R-12 de 0009 sigue: 43 px) — `e2e/workspace-visual.spec.ts` no cambia. Todo lo demás de 0008/0009 (`vitest`, `test:sync`, `test:visual`, backend) pasa sin tocarse; la tarea de verificación lo comprueba con `git diff --stat` sobre los tests y V-16.

### Implementación de RF-042
`notes/VaultWorkspacePage.tsx` (`activeFolder`: raíz al entrar, padre al abrir, carpeta activada en árbol o migas), `notes/folders.ts` (`parentFolder`), `notes/NoteSidebar.tsx` (clic/Enter activa). Tests: `notes/VaultWorkspacePage.test.tsx`, `notes/NoteSidebar.test.tsx`, `notes/folders.test.ts`.

### Implementación de RF-043
`notes/NoteSidebar.tsx` (fila "Raíz", `aria-current`), `notes/notes.css`. Tests: `notes/NoteSidebar.test.tsx`; V-12 (R-14).

### Implementación de RF-044
`editor/frontmatter.ts` (`classifyLegacy` → `migrate`), `editor/NoteEditor.tsx` (sesión con propiedades separadas, aviso previo P-5, aviso posterior, salir sin guardar no cambia nada), `notes/noteStore.ts`. Tests: `editor/frontmatter.test.ts` (sección `legacy`), `editor/NoteEditorFrontmatter.test.tsx`.

### Implementación de RF-045
`editor/frontmatter.ts` (`looks-yaml`), `editor/NoteEditor.tsx` (aviso en Visual, bloque protegido P-6), `editor/MilkdownView.tsx` (`prefix`). Tests: `editor/frontmatter.test.ts` (sección `legacy`), `editor/NoteEditorFrontmatter.test.tsx` (byte a byte tras editar en Visual; corrompido = punto fijo).

### Implementación de RF-046
`editor/codeBlockView.ts` (lenguaje `mermaid` en lectura → área de diagrama), `editor/mermaid/renderMermaid.ts`. Tests: `editor/codeBlockView.test.ts`, `editor/mermaid/renderMermaid.test.ts`; V-7.

### Implementación de RF-047
`editor/codeBlockView.ts` (Visual: bloque editable + vista previa debajo, *debounce* 400 ms, conserva el SVG anterior). Tests: `editor/codeBlockView.test.ts` (temporizadores falsos: ≤ 500 ms); V-7.

### Implementación de RF-048
`editor/CodeView.tsx` (texto plano, sin *node views*). Tests: `editor/CodeView.test.tsx` (sin `svg` ni carga de `mermaid`).

### Implementación de RF-049
`editor/mermaid/renderMermaid.ts` (`suppressErrorRendering`, limpieza del nodo temporal, error por bloque), `editor/codeBlockView.ts` (caja de error + fuente en lectura). Tests: `editor/mermaid/renderMermaid.test.ts`, `editor/codeBlockView.test.ts`; V-8.

### Implementación de RF-050
`editor/mermaid/themeVariables.ts`, `editor/mermaid/renderMermaid.ts` (`theme:"base"`, re-render con `MutationObserver` de `data-theme`). Tests: `editor/mermaid/themeVariables.test.ts`, `editor/mermaid/renderMermaid.test.ts`; V-7 (cambio de tema sin recargar).

### Implementación de RF-051
`editor/mermaid/renderMermaid.ts` (`securityLevel:"strict"`, `htmlLabels:false`, `secure` ampliado, verificación del SVG antes de insertar). Tests: `editor/mermaid/renderMermaid.test.ts` (fuentes con `%%{init: {"securityLevel":"loose"}}%%`, `click A call f()`, `click A href "javascript:…"`, `config:` de tema → sin efecto), `editor/securityGuard.test.ts`; V-7 (0 `script`/`foreignObject`/`on*`/`a[href]`).

### Implementación de RF-052
`editor/mermaid/panZoom.ts` (`svg-pan-zoom` diferido, ajuste al ancho, controles, teclado, rueda con Ctrl, reduced-motion), `editor/codeBlockView.ts`, `editor/editor.css`. Tests: `editor/codeBlockView.test.ts` (controles sólo si excede, límites deshabilitan); V-9.

### Implementación de RF-053
`editor/mermaid/renderMermaid.ts` (`import()` rechazado → estado `load-failed`), `editor/codeBlockView.ts` (aviso + "Reintentar" + bloque de código). Tests: `editor/mermaid/renderMermaid.test.ts`; V-8.

### Implementación de RF-054
`editor/NoteBreadcrumb.tsx` (`nav[aria-label="Ruta"]`, `ol`, separador `/`, `h2 aria-current="page"`; P-17), `editor/breadcrumb.ts`, `editor/NoteEditor.tsx`, `editor/editor.css`. Tests: `editor/NoteBreadcrumb.test.tsx`, `editor/breadcrumb.test.ts`; V-10.

### Implementación de RF-055
`editor/NoteBreadcrumb.tsx` (botón de carpeta → `onRevealFolder`), `notes/VaultWorkspacePage.tsx` (carpeta activa), `notes/NoteSidebar.tsx` (`revealFolder`: desplegar, desplazar sólo el panel, sin mover foco). Tests: `notes/VaultWorkspacePage.test.tsx`, `notes/NoteSidebar.test.tsx`; V-10, V-12.

### Implementación de RF-056
`editor/NoteEditor.tsx` (botones Atrás/Adelante con `disabled` según `canStep`), `notes/VaultWorkspacePage.tsx`. Tests: `notes/VaultWorkspacePage.test.tsx`, `editor/NoteEditor.test.tsx`; V-10.

### Implementación de RF-057
`notes/noteHistory.ts` (tope 50, descarta adelante, `sessionStorage` por bóveda), `notes/VaultWorkspacePage.tsx` (`onOpened`). Tests: `notes/noteHistory.test.ts`, `notes/VaultWorkspacePage.test.tsx` (sobrevive a desmontar/montar con el mismo `sessionStorage`; otra bóveda, otra clave).

### Implementación de RF-058
`notes/noteHistory.ts` (`step` con `isValid`), `notes/VaultWorkspacePage.tsx` (validez = nota activa en los resúmenes, por id). Tests: `notes/noteHistory.test.ts`, `notes/VaultWorkspacePage.test.tsx` (borrada se salta; renombrada navegable).

### Implementación de RF-059
`notes/VaultWorkspacePage.tsx` (`onKeyDown` del workspace, exclusión de editores en edición y campos, `preventDefault`). Tests: `notes/VaultWorkspacePage.test.tsx`; comprobación en Chromium real dentro de V-10 (el documento no navega hacia atrás).

### Implementación de RF-060
`notes/VaultWorkspacePage.tsx` (la posición sólo se mueve en `onOpened`; `onCancelOpen` no la toca), `editor/NoteEditor.tsx` (diálogo existente de 0008, foco de vuelta al botón). Tests: `notes/VaultWorkspacePage.test.tsx`, `editor/NoteEditorLeave.test.tsx` (sin cambios de lo existente).

### Implementación de RF-061
`editor/NoteMenu.tsx` (botón `⋮`, menú en portal, roles, teclado, orden P-4; P-17), `editor/editor.css`. Tests: `editor/NoteMenu.test.tsx`; V-11.

### Implementación de RF-062
`editor/NoteMenu.tsx` → `notes/NoteSidebar.tsx` (`startRename`, `remove` con `confirmDelete`: mismos flujos y mensajes), `editor/NoteEditor.tsx` ("Ver en Código" → edición + Código; "Copiar ruta" → `path` completo + "Ruta copiada"). Tests: `editor/NoteMenu.test.tsx`, `notes/VaultWorkspacePage.test.tsx`; V-11.

### Implementación de RF-063
`editor/breadcrumb.ts` (`fit`: truncado por segmento, P-17), `editor/NoteBreadcrumb.tsx` (`ResizeObserver`, elipsis por segmento y `title`). Tests: `editor/breadcrumb.test.ts`, `editor/NoteBreadcrumb.test.tsx` (anchos simulados); V-10 (1440/1024/390).

### Implementación de RF-064
`editor/editor.css` (43 px, `padding 0 16px`, controles 28, ≤ 560 px sólo icono), `editor/NoteEditor.tsx`. Tests: `notes/layoutCss.test.ts`; V-10 (R-1, una línea a 1440/1024/390), V-16 (R-12 de 0009).

### Implementación de RF-065
`editor/NoteEditor.tsx` (las migas leen `note.path`, que ya se actualiza con la revisión renombrada — incluido el rebase con borrador de 0008 VF-3). Tests: `editor/NoteBreadcrumb.test.tsx`, `notes/VaultWorkspacePage.test.tsx` (renombrar desde el menú o el árbol actualiza las migas sin recargar).

### Implementación de RNF-001
`frontend/e2e/content-perf.spec.ts` (nota de 200 KiB, 50 bloques, 5 Mermaid; p95 ≤ 150 ms legible; tareas largas ≤ 200 ms por bloque), `editor/mermaid/renderMermaid.ts` (render en serie cediendo el hilo); `frontend/e2e/workspace-perf.spec.ts` (RNF-001 de 0009, sin cambios). Sonda temprana en el bloque B. **Enmienda 1 (§10):** `editor/markdown/headingIds.ts`, `editor/markdown/parseStage.ts`, `editor/markdown/parseWorker.ts`, `editor/markdown/parseCache.ts`, `editor/markdown/precompute.ts`, `editor/markdown/cachedParser.ts`, `notes/noteStore.ts` (`size`), `content-visibility` en lectura (`editor/editor.css`); medición (a) precalculada / (b) en frío / (c) con puntero en `e2e/content-perf.spec.ts`; B-1 pendiente.

### Implementación de RNF-002
`frontend/scripts/check-bundle.mjs` (`npm run test:bundle`, `vite.config.ts` con `build.manifest: true`), cargas `import()` en `editor/highlight/languages.ts`, `editor/NoteEditor.tsx` (`./frontmatter`), `editor/mermaid/renderMermaid.ts`, `editor/mermaid/panZoom.ts`; V-15 (red).

### Implementación de RNF-003
Sin HTML crudo: `editor/highlight/proseHighlight.ts` (decoraciones), `editor/icons.ts` (`createElementNS`), `editor/PropertiesPanel.tsx` (texto), `editor/MilkdownView.tsx` (pegado → esquemas `safeLink`/`safeImage`); única inserción de marcado: `editor/mermaid/renderMermaid.ts` (verificada). Tests: `editor/securityGuard.test.ts`, `editor/mermaid/renderMermaid.test.ts`, `editor/MilkdownView.test.tsx`, `editor/PropertiesPanel.test.tsx` (`<script>` y URLs como texto); V-7.

### Implementación de RNF-004
Contraste: `editor/contrast.test.ts` (§5.5); teclado y nombres: tests de componentes con `getByRole`; diagramas con `role="img"` + nombre (`editor/codeBlockView.test.ts`); verificación del experto-ux-ui con `ui-ux-pro-max` en el bloque D; V-2, V-9, V-10, V-11, V-14.

### Implementación de RNF-005
`frontend/e2e/content-visual.spec.ts` (V-1…V-16, claro/oscuro, 1440/1024/390) + `frontend/e2e/fixtures.ts` (`seedContent`) + capturas de referencia (§5.2, P-14) comparadas en el bloque B (temprana) y en el D (Gate 4). La feature no pasa a `verified` sin esa comparación aprobada.

`covers` de `spec.md` (fijado en este plan): los archivos de §9 y §8; ver el front-matter de `spec.md`.
Archivos compartidos con dueño anterior: P-15.

## 10. Enmienda 1 (2026-10-24) — parseo precalculado (Directiva de Pausa, RNF-001)
> **Origen.** La sonda T-050 falló: abrir en lectura la nota sembrada de 181 KiB da p95 **204,4 ms**
> (mediana 166, máx. 268) frente a RNF-001 ≤ 150 ms. El perfilado en un clon aislado
> (`/tmp/s10/perf-out/prof.json`, `final.json`; scripts en `/tmp/s10/scripts/`) da, en mediana:
> `remark.parse` (micromark) **103,6 ms**, `runSync` (transformadores de Milkdown) 2,5 ms,
> mdast→ProseMirror 2,1 ms, `EditorState` 9,7 ms, `EditorView` 6,2 ms, y 57 ms de layout forzado tras
> construir la vista (`syncHeadingIdPlugin` hace `dispatch` al montar). El parseo escala lineal
> (~1 ms/KiB): p95 51 KiB → 98 ms, 101 KiB → 158 ms, 181 KiB → 245 ms.
> **Decisión de AIRA (opción 2):** cumplir RNF-001 **tal cual**, con (1) ids de encabezado al parsear,
> (2) `content-visibility:auto` y (3) el parseo fuera de la ruta crítica mediante una caché por
> `(id, rev)` calculada fuera del hilo principal con **el mismo** pipeline de remark. Esta sección lo
> concreta; RNF-001 no se relaja. Lo que exige decisión nueva de producto es **B-1** (§10.7).

### 10.1 Corrección de raíz del layout forzado (ids de encabezado al parsear)
- El `dispatch` de `syncHeadingIdPlugin` existe porque el documento nace con `heading.attrs.id = ""`
  y el plugin los rellena **después** de montar la vista, lo que invalida estilo y layout de todo el
  documento. Raíz: el documento debe nacer con los ids ya puestos.
- `editor/markdown/headingIds.ts` (nuevo, puro sobre el `Node` de ProseMirror): recorre el documento
  recién parseado y fija `id` con **el mismo** `headingIdGenerator` del contexto de Milkdown
  (`ctx.get(headingIdGenerator.key)`) y la **misma** regla de duplicados del plugin (`-#n`), omitiendo
  los encabezados vacíos; se aplica en el envoltorio del *parser* (§10.3), en frío y desde la caché.
  El plugin de Milkdown no se quita (sigue manteniendo los ids al editar): al montar ya no encuentra
  nada que cambiar y **no despacha** (medido en el clon: −60 ms en la sonda).
- Criterio: 0 transacciones despachadas al montar en lectura (espía sobre `view.dispatch`) y DOM de
  encabezados idéntico al de hoy (ids iguales, incluidos duplicados) en todo el corpus de pruebas.

### 10.2 `content-visibility:auto` en lectura
- `.milkdown-view[data-mode="read"] .ProseMirror > * { content-visibility: auto;
  contain-intrinsic-size: auto 3em; }` — sólo en **lectura** (RNF-001 habla de lectura): en Visual el
  caret, la selección y `coordsAtPos` sobre bloques omitidos son un riesgo sin beneficio medido.
  Medido: −56 ms de pintado (`baseline+H+CV`: p95 de pintado 206 ms frente a 255 sin CV).
- Efectos y cómo se cubren: los bloques fuera de pantalla conservan su contenido en el árbol de
  accesibilidad y en la búsqueda del navegador (Chromium); las medidas V-* de elementos fuera de la
  vista se toman tras `scrollIntoViewIfNeeded` (ajuste del *helper* `measure` de `fixtures.ts`); los
  `ResizeObserver` de Mermaid/zoom disparan al entrar en vista (comportamiento deseado).

### 10.3 Qué se cachea (medido)
**Elección: el mdast de la etapa de parseo (micromark + `mdast-util-from-markdown` + extensiones
GFM), con `position`, serializado como cadena JSON; en el hilo principal se hace `runSync` +
mdast→ProseMirror con el procesador real del editor (~5 ms).**
| Opción | Coste en el hilo principal al abrir | Memoria por nota de 181 KiB | Por qué sí / no |
|---|---|---|---|
| **mdast JSON (elegida)** | `JSON.parse` 0,4 ms + `runSync` 2,5 ms + mdast→PM 2,1 ms ≈ **5 ms** | cadena de 216 KiB (≈ 0,29 MiB en el *heap*) | La etapa cara (103,6 ms) es exactamente la que sale del hilo; las etapas que dependen de Milkdown (`runSync` con `remarkMarker`, `remarkInlineLink`, `remarkHtmlTransformer`, `remarkLineBreak`, `remarkPreserveEmptyLine`… y el `ParserState` de `@milkdown/transformer` con el esquema real) siguen corriendo con **las instancias del editor**, sin copia. Cadena inmutable: `runSync` **muta** el árbol (p. ej. `remarkMarker` añade `marker`), así que cachear objetos obligaría a clonarlos; la cadena se re-hidrata fresca en 0,4 ms. |
| mdast como objeto (`structuredClone`) | similar, pero clon obligatorio por la mutación | ≈ 0,30 MiB | sin ventaja y con riesgo de compartir un árbol mutado |
| Documento ProseMirror (JSON) | `Node.fromJSON` ≈ 2–4 ms | similar | exige el esquema de Milkdown **en el Worker** (contexto completo, `$remark`/`$node` con *timers*): duplicaría el pipeline y rompería "el mismo pipeline" |
| HTML estático (`DOMSerializer`) | — | mayor | medido en el clon: sólo −10 ms adicionales; además requiere sincronizar HTML con el documento |
- `position` se conserva: `remarkMarker` lee `file.value.charAt(node.position.start.offset)`; sin
  posiciones el resultado divergiría. `runSync(tree, text)` recibe el **mismo** texto de la nota.
- Medidas (Node 24, la misma nota): parseo 97,1 ms; mdast JSON con `position` 216,4 KiB (189,5 sin);
  `JSON.parse` 0,40 ms; `structuredClone` de la cadena (paso por `postMessage`) 0,13 ms.

**Mismo pipeline, por construcción y por prueba.**
- El Worker (`editor/markdown/parseWorker.ts`, `new Worker(new URL(...), {type: "module"})`) importa
  `unified` 11.0.5, `remark-parse` 11.0.0 y `remark-gfm` 4.0.1 — **las mismas instancias** que resuelve
  Milkdown 7.22.3 (`@milkdown/core` construye `unified().use(remarkParse)` y `@milkdown/preset-gfm`
  registra `remarkGFM`; los demás `$remark` de commonmark son transformadores sin extensiones de
  parseo). La función pura `parseMarkdownToJson(text)` (`editor/markdown/parseStage.ts`) es la que
  usan el Worker y las pruebas.
- Pruebas de equivalencia (bloqueantes): (1) para todo el corpus (`e2e/content-notes.ts`, casos del
  contrato `frontmatter-yaml.cases.json`, notas de las pruebas de 0008) el documento obtenido desde
  la caché es `eq` al de `ctx.get(parserCtx)(text)` del editor; (2) las extensiones de parseo
  (`data('micromarkExtensions')`, `data('fromMarkdownExtensions')`) del procesador del editor son las
  mismas, en número y origen, que las de `parseStage`; (3) `npm ls unified remark-parse remark-gfm
  micromark` sin duplicados. Si una actualización de Milkdown añade una extensión de parseo, (2) falla.

### 10.4 Dónde vive la caché, tamaño e invalidación
- **Sólo memoria**, en `editor/markdown/parseCache.ts`: `Map` LRU de clave `"{id}@{rev}"` → cadena
  mdast, con tope de **24 MiB** de cadenas (≈ 80 notas de 181 KiB) y sólo para notas de
  **≥ 32 KiB** de `content` (por debajo, el camino en frío ya cumple con holgura: 51 KiB → p95 106 ms
  con ids + `content-visibility`, `final.json`). Peticiones en vuelo deduplicadas por clave.
- **No** en IndexedDB ni `sessionStorage`: `sessionStorage` sólo guarda cadenas y tiene ~5 MiB; una
  copia persistente en IndexedDB sería una **segunda copia del contenido** del usuario fuera de la
  réplica que habría que cifrar/borrar en el logout, y su lectura (deserialización de ~0,3 MiB) se
  comería buena parte de la ganancia. La réplica sigue siendo la única persistencia (P-1 de 0005).
- **Invalidación por `rev`:** la clave incluye la revisión ganadora; una revisión nueva (guardado,
  pull, otra pestaña) es otra clave y la anterior se descarta al reconciliar con los resúmenes
  (`notesVersion`). Además se verifica `text.length` guardado con la entrada antes de usarla.
- **Ciclo de vida:** la caché y el Worker pertenecen al `Workspace` de la bóveda abierta (se crean al
  montarlo y se destruyen al desmontarlo: cambiar de bóveda, ir a `/vaults`, **cerrar sesión** —0005
  destruye la réplica en el logout y el `Workspace` se desmonta antes—): `dispose()` termina el
  Worker y vacía el `Map`. Ningún dato sobrevive a la sesión.
- Sólo se usa la caché si el texto que se abre **es** el `content` guardado de esa revisión (lectura y
  apertura en Visual); un borrador o el texto compuesto de Código se parsean como hoy.

### 10.5 Cuándo se precalcula (sin degradar RNF-001 de 0009)
`editor/markdown/precompute.ts` (programador, en el chunk de entrada, ~2 KiB) dentro del `Workspace`:
- **Candidatas:** notas activas de la bóveda con `content` ≥ 32 KiB. El índice de resúmenes de
  `noteStore` gana `size` (longitud de `content`, calculada al indexar: el índice ya lee el documento
  completo), así el programador no lee cuerpos para decidir.
- **Prioridad:** (1) la fila del árbol bajo el puntero o con el foco (`pointerenter`/`focus`, petición
  inmediata: el clic suele llegar cientos de ms después y la tecla Enter tras el foco); (2) las notas
  del historial de la bóveda (RF-057), más recientes primero; (3) las de carpetas desplegadas; (4) el
  resto, en orden de árbol.
- **Cuándo:** tras montar el `Workspace` y tras cada `notesVersion` (sync/pull/otra pestaña) se
  reconcilian las candidatas; el trabajo en el hilo principal (leer el cuerpo con `notes.get`,
  `postMessage`) va en `requestIdleCallback` (una nota por franja, `timeout` 2 s), **una sola nota en
  el Worker a la vez**, y se pausa mientras se abre una nota o el árbol se re-renderiza. Al vaciarse la
  cola se emite `performance.mark("synapse:precompute-idle")` (señal para las pruebas; sin efecto
  funcional).
- **No degradación:** el parseo nunca corre en el hilo principal fuera de la apertura en frío; T-139
  mide RNF-001 de 0009 (1000 notas, p95 ≤ 150 ms) **con el precálculo activo** sobre una bóveda con 40
  notas ≥ 32 KiB y exige 0 `longtask` > 50 ms atribuibles al programador.

### 10.6 Apertura en frío (nota no precalculada)
- Si el parseo de esa clave está **en vuelo** en el Worker (p. ej. empezó al pasar el puntero), el
  editor espera esa promesa en vez de repetir el parseo en el hilo principal.
- Si no está ni en caché ni en vuelo, se parsea en el hilo principal como hoy (con §10.1 y §10.2), sin
  esperar a la cola. Coste medido con ids + `content-visibility` (`final.json`, `baseline+H+CV`):
  p95 **106 ms** a 51 KiB, **154 ms** a 101 KiB, **194 ms** a 181 KiB. Por tanto una apertura en frío
  de una nota ≳ 100 KiB **no** cumple 150 ms → **B-1**.
- Cuándo hay frío en la práctica: primeros segundos tras cargar la página antes de que termine el
  precálculo, una nota grande recién llegada por el pull, o una apertura programática (rechazo →
  "Corregir") de una nota que no estaba en cola.

### 10.7 BLOQUEADOR B-1 — apertura en frío de notas ≳ 100 KiB
RNF-001 dice "una nota de referencia de ~200 KiB … DEBE mostrarse legible en lectura en p95 ≤ 150 ms"
sin distinguir si estaba precalculada. Con este diseño se cumple para la nota **precalculada tras un
sync realista** (estimado con el clon: 168,5 − 108,6 + 5 ≈ **65 ms** de mediana y ≈ **90 ms** de p95;
el techo con caché total medido fue `static+CV+C` p95 32 ms), pero la apertura **en frío** de una nota
de 181 KiB queda en ≈ 194 ms p95. Ninguna corrección de raíz restante la baja de 150 ms sin cambiar
qué significa "legible" (el render progresivo no cumple el RNF tal como está escrito, ya medido).
**Decisión de producto pedida a AIRA/Carlos:** **Recomendación:** (i) RNF-001 se verifica sobre la
apertura de una nota precalculada tras un sync realista (§10.8 a), p95 ≤ 150 ms, **sin cambio de
umbral**; (ii) la apertura en frío se informa aparte con dos topes de no regresión: notas ≤ 64 KiB
p95 ≤ 150 ms también en frío y la nota de referencia de ~200 KiB p95 ≤ 220 ms en frío; (iii) la
redacción de RNF-001 se enmienda en spec §7 para decirlo. Alternativa: exigir 150 ms también en frío
(no alcanzable con Milkdown 7.22.3 y ADR-010 sin cambiar de editor o de definición de "legible").
**Hasta la decisión, T-138 (b) sólo informa** y T-050 cierra con (a).

### 10.8 Medición honesta (sustituye a la sonda de T-050)
La sonda actual reabre la misma nota 30 veces: con caché se "aprobaría" midiendo sólo aciertos
calientes de la misma página. `e2e/content-perf.spec.ts` pasa a tres pruebas; cada muestra es la
**primera** apertura de esa nota en esa página, y la ruta tomada se demuestra con marcas
(`synapse:parse:cache-hit` / `synapse:parse:cold` / `synapse:parse:inflight`) leídas de
`performance.getEntriesByType("mark")`:
- **(a) `0010 RNF-001 precalculada` (criterio de RNF-001):** bóveda sembrada con 200 notas (3 de
  181/120/64 KiB, el resto ~4 KiB). 10 contextos de navegador **nuevos** (sesión recién abierta, réplica
  vacía → pull completo); en cada uno se espera "Sincronizado" y la marca `synapse:precompute-idle`
  (tope 5 s: si no llega, falla) y se abren las 3 notas grandes una vez cada una → 30 muestras, todas
  con `cache-hit`. **p95 ≤ 150 ms** (clic → primer y último párrafo en el DOM), tareas largas ≤ 200 ms.
- **(b) `0010 RNF-001 en frío` (informe aparte, umbral según B-1):** contexto nuevo; clic en la nota de
  181 KiB en cuanto el árbol aparece, antes de `precompute-idle`, exigiendo la marca `cold`; 30
  contextos. Se imprime mediana/p95; y lo mismo para la nota de 64 KiB.
- **(c) `0010 RNF-001 con puntero` (informe):** apertura con 150 ms de *hover* previo en contexto nuevo
  sin esperar al precálculo; registra qué ruta se tomó (`inflight`/`cache-hit`/`cold`) y la cifra.
- La sonda antigua (misma nota reabierta) se **retira**; T-050 queda abierta hasta que (a) pase.

### 10.9 ADR-010, seguridad y presupuesto
- **ADR-010:** se mantiene Milkdown 7.22.3 + CodeMirror 6. No se sustituye ni se bifurca ninguna pieza
  de Milkdown: se usa su API pública (`parserCtx`, `remarkCtx`, `schemaCtx`, `ParserState` de
  `@milkdown/transformer`, `headingIdGenerator`) desde un plugin propio (`editor/markdown/cachedParser.ts`)
  que envuelve `parserCtx` entre `ParserReady` y `EditorStateReady`. La serialización (`remark-stringify`)
  no cambia.
- **Seguridad (Art. 5, RNF-003):** el Worker es un módulo del mismo origen, sin acceso al DOM; recibe
  sólo el texto de la nota y devuelve JSON que el hilo principal re-hidrata con `JSON.parse` y pasa por
  el **mismo** esquema y los mismos `toDOM` (`safeLink`/`safeImage`): no hay ruta nueva hacia el DOM.
  La caché no persiste nada y se destruye con el `Workspace` (logout incluido). Hoy no hay CSP en el
  backend; si se añade, necesitará `worker-src 'self'` (anotado en `frontend/src/README.md`).
- **Presupuesto (RNF-002):** chunk propio del Worker **44,4 KiB gzip** (medido: `unified` +
  `remark-parse` + `remark-gfm` + micromark; duplica código que ya está en el chunk del editor, pero
  fuera de la entrada y del editor); entrada +~2 KiB (caché + programador, sin Milkdown); editor
  +~1 KiB (`cachedParser`, `headingIds`). `check-bundle.mjs` gana: chunk del Worker ≤ 46 KiB gzip y
  ninguna importación estática de él desde la entrada o el editor.

### 10.10 Archivos y tareas
Archivos nuevos (todos dentro de `covers`: `frontend/src/editor/**`, `frontend/src/notes/noteStore.ts`,
`frontend/e2e/**` de 0010): `editor/markdown/headingIds.ts`, `editor/markdown/parseStage.ts`,
`editor/markdown/parseWorker.ts`, `editor/markdown/parseCache.ts`, `editor/markdown/precompute.ts`,
`editor/markdown/cachedParser.ts` y sus tests; cambios en `notes/noteStore.ts` (`size` en el resumen),
`notes/VaultWorkspacePage.tsx` y `notes/NoteSidebar.tsx` (propiedad y *hover/focus*),
`editor/MilkdownView.tsx`, `editor/editor.css`, `e2e/content-perf.spec.ts`, `e2e/fixtures.ts`,
`scripts/check-bundle.mjs`. Tareas T-124…T-139 (bloque "E2" de `tasks.md`), que se ejecutan **antes**
de seguir con F.

## 11. Enmienda 2 (2026-10-27) — Mermaid y resaltado fuera del camino crítico (Directiva de Pausa, RNF-001)

**Estado:** aprobada por AIRA (autoridad delegada) el 2026-10-27. **El umbral de RNF-001 (tier B-1b) NO cambia**
(≤ 150 ms hasta 120 KiB, ≤ 250 ms ~181–200 KiB); se corrige la causa.

### 11.1 Causa medida (Slice 5, Chromium real, `content-perf` «precalculada», p95 de 10 aperturas `cache-hit`)
| configuración | 64 KiB | 120 KiB (≤ 150) | 181 KiB (≤ 250) |
|---|---|---|---|
| sin resaltado ni Mermaid | 29,8 | 46,5 | 242,9 |
| sólo Mermaid | 110,0 | 127,5 | 247,7 |
| resaltado + Mermaid (T-085/T-091) | ~56 (mediana) | **187,3 ✘** | 247,1 |
Mermaid ≈ +80 ms (import del chunk + 5 dibujos arrancan al abrir) y el resaltado ≈ +60 ms (parseo Lezer de los 50 bloques
y un refresco por cada gramática que llega) sobre el camino crítico «clic → legible» a 120 KiB.

### 11.2 Decisión
Nada de lo decorativo corre antes de «legible» (primer `<p>` y último encabezado en el DOM):
1. **Mermaid por visibilidad.** Cada bloque dibuja sólo al entrar a (o acercarse a) el viewport (`IntersectionObserver`,
   `rootMargin` 300 px verticales) **y** en idle (`requestIdleCallback`, `timeout` 300 ms, respaldo `setTimeout`),
   uno a uno (la cola en serie de `renderMermaid` ya existe). `mermaid` se importa en ese momento, no al abrir. Mientras
   tanto el bloque muestra su chasis y un área reservada (alto mínimo 160 px, «Dibujando diagrama…») para no saltar
   bruscamente. Sin `IntersectionObserver` (jsdom, navegadores sin él) dibuja sin esperar a la visibilidad. Un bloque
   fuera de pantalla marcado «sucio» (cambio de tema, edición) se redibuja cuando entra. `strict`, `htmlLabels:false`,
   `secure`, tema, zoom/pan y la fuente hostil no cambian.
2. **Resaltado por tandas.** `highlight/highlightScheduler.ts`: los bloques sin resultado se piden a una cola ordenada por
   **distancia al viewport**; en idle se procesan por **tandas con presupuesto de 10 ms** (≥ 1 bloque) y se entrega **una sola
   promesa por tanda** compartida por todos los bloques pendientes, de modo que `prosemirror-highlight` hace **un único
   refresco por tanda** (no uno por bloque ni uno por gramática de cada bloque). Un bloque cercano al viewport y ya con
   vista se resuelve síncrono (teclear no pierde color). El resultado se guarda **relativo al bloque** (`[from,to,clase]`),
   clave `lenguaje + texto`, y se vuelve a anclar a la posición actual; caché acotada (200). Bloques > 100 KiB no se
   resaltan (acota una tarea larga; RF-031 los deja legibles).
3. **Sin tocar** fixtures, tamaños ni umbrales.

### 11.3 Medición (T-146/T-147)
`0010 RNF-001 precalculada` sigue midiendo hasta «legible» con ambos activos. Aparte, sonda `0010 RNF-001 diferidos`:
(a) tareas largas durante el resaltado y los diagramas ≤ 200 ms; (b) tiempo hasta el primer diagrama visible (sólo informe,
sin umbral).

### 11.4 Archivos y tareas
Nuevos: `editor/deferred/idle.ts` (`whenIdle`, `observeVisibility`), `editor/highlight/highlightScheduler.ts`; cambios:
`editor/highlight/proseHighlight.ts`, `editor/MilkdownView.tsx`, `editor/codeBlockView.ts`, `editor/editor.css`,
`e2e/content-perf.spec.ts`. Tareas T-140…T-149 (bloque «F.6b» de `tasks.md`).

### 11.5 Nota de Converge 1 (2026-10-27) — el camino crítico a 181 KiB era el chunk del editor
Con la Enmienda 2 aplicada el 181 KiB seguía en p95 ≈ 240–283 ms (límite 250, intermitente). Perfil CPU y traza de Chromium de
la apertura: ~170 ms eran «program» nativo y `v8.parseOnBackground` ≈ 62 ms: la primera nota de cada sesión (la de 181 KiB
es siempre la primera de su contexto) pagaba la descarga, el análisis y la compilación del chunk `NoteEditor` (~1 MB) dentro
de «clic → legible». Corrección de raíz: `Workspace` precarga el chunk del editor en idle al abrir la bóveda
(`whenIdle(loadEditor)`), sin importarlo estáticamente (sigue siendo un chunk aparte; `/vaults` no lo descarga).
Medido en 3 corridas de 20 contextos: 181 KiB p95 121,7 / 119,5 / 114,9 ms (antes 235–257), 120 KiB 40–43 ms, 64 KiB 30–35 ms.

## 12. Enmienda 3 (2026-10-28) — tablas con líneas en blanco entre filas (RF-066)

**Estado:** decisión de producto de AIRA (autoridad delegada de Carlos), 2026-10-28; implementada en la rama
`fix/0010-tablas-tolerantes` (worktree `.claude/worktrees/0010-tablas`) sobre `feature/sprint-1-auth` (0010 ya mergeado).

**Diagnóstico (con evidencia, clon desechable):** con el contenido exacto de «Prueba» (cabecera, separadora y fila de datos
separadas por líneas en blanco) el DOM de `.ProseMirror` tenía `<table>` = 0 y 12 pipes literales, en lectura y en Visual.
Las variantes con las filas consecutivas daban `<table>` = 1. La causa es de GFM (`micromark-extension-gfm-table`, sin
opciones: `gfmTable()` no recibe ninguna; las de `remark-gfm` son sólo de serialización), no de código de 0010.

**Diseño:** `editor/markdown/looseTables.ts` → `joinLooseTableRows(markdown)`, pura, ANTES del parseo, en el ÚNICO punto de
entrada: `cachedParser` envuelve `parserCtx` (apertura, reemplazo y pegado) y `parseStage.parseMarkdownToJson` la aplica
dentro del Worker de la caché precalculada, así el hilo principal, el Worker y la lectura ven el mismo árbol. El mdast
cacheado refiere al texto normalizado, que es el que se pasa a `docFromMdastJson`; las claves `(id, rev)` no cambian.
Reglas (bajo riesgo): sólo una tabla GFM válida (cabecera con pipes, separadora con el MISMO número de columnas saltando
SÓLO líneas en blanco, filas de datos con ese número de columnas); para ante cualquier otra línea o separadora; una fila
seguida de su separadora es la cabecera de otra tabla (no se fusionan); nunca en YAML inicial, código cercado (``` y ~~~),
código indentado ni citas; el resto queda byte a byte igual (CRLF incluido). Código no cambia el texto; guardar desde
Visual serializa la tabla compacta (aceptado).

**Riesgos revisados:** un único punto de entrada existe (sin él se habría parado); ids de encabezado y detección de «sucio»
se calculan sobre el documento ya construido; el cursor no depende de posiciones del texto original en Visual.

