---
id: TASKS-0010
tipo: tasks
feature: 0010-contenido-markdown-completo
estado: approved          # la Fase 3 no tiene gate humano propio (method.md §3 Fase 3, §7 Gate 3: chequeo mayormente automático); se aprueba al cerrar el GATE 2
actualizado: 2026-10-24
---

# TASKS-0010 · Contenido Markdown completo

> Desglose de PLAN-0010 (GATE 2 aprobado por AIRA con autoridad delegada, commit 03f20c2: P-1, P-2,
> P-7 y **P-17** tal cual; el resto de P-n con la recomendación del plan). La Fase 3 **no tiene gate
> humano propio**: el Gate 3 es el chequeo automático de cobertura, orden y `CHECK`/`EXPECT`.
> **Orden de method.md v1.9 (maquetación primero):** 0 línea base → A re-anclajes → B capturas de
> referencia → C comprobaciones visuales en rojo + `test:bundle` → D tokens y maquetación de los 7
> componentes con notas sembradas → **E revisión visual temprana (T-047…T-050)** → F lógica
> (desde T-051) → G RNF → H validación del experto-ux-ui → I documentación → J verificación final.
> **Ninguna tarea de lógica ni de backend antes de T-051** (la revisión temprana T-047…T-050 la precede).

## Reglas
- Cada tarea: ≤ 30 min, un solo propósito, `(cubre RF-NNN)`, zona del patrón (o `[doc]`).
- **Test antes que código:** cada test rojo va justo antes de la tarea que lo pone en verde; su
  `EXPECT` dice cómo falla.
- Cada tarea lleva `CHECK:` (comando exacto; rutas relativas a la raíz del worktree
  `.claude/worktrees/0010-contenido-markdown`) y `EXPECT:`.
- **Tareas de percepción** (layout, iconografía, densidad, tema, foco visible): no se cierran sólo
  con DOM de jsdom; su `CHECK` incluye capturas o medidas en **Chromium real**:
  `VISUAL_OUT_DIR=/tmp/s10/e2e npm run test:visual -- <spec> --grep "<título>"` (contenedor
  Playwright 1.56.0, backend del worktree en `:8010`, `frontend/scripts/visual.sh` de 0009) y la
  captura PNG **leída** y descrita en `history.md`. Los títulos de las pruebas de esta feature
  empiezan por `0010 V-n` (las de 0009 son `V-n` a secas).
- Atajo usado abajo: `CV` = `cd frontend && VISUAL_OUT_DIR=/tmp/s10/e2e npm run test:visual -- e2e/content-visual.spec.ts`.
- La suite del backend tarda **~17 min**, se corre **sola** contra CouchDB `:15984` (nada más
  usando esa base a la vez: ni `test:visual`, ni `test:sync`, ni otro pytest) y no se corta.
- career-admin (`http://localhost:8002`, contenedor `cjhirashi-career-admin` en producción del
  usuario): **sólo navegar y capturar**; ningún clic que guarde, ningún formulario enviado.
- Cada test lleva en un comentario el `RF-` que cubre (Art. 9). `git add` explícito, nunca `-A`.
- RF-041: los únicos tests de 0008/0009 que cambian son los de PLAN-0010 §9 RF-041 (nombre del
  `h2`, fila "Raíz", y el botón "Editar/Leer" convertido en lápiz por P-17, que conserva el nombre
  accesible "Editar"/"Leer").
- **P-17 (GATE 2):** migas con separador `/`, truncado **por segmento** con "…", lápiz de
  edición/lectura en la barra (sustituye al botón de texto "Editar/Leer"), menú **⋮**
  (`ellipsis-vertical`), "Adelante" atenuada sin historial. Donde el plan dice `›`, colapso de
  intermedios o `⋯`, manda P-17 (T-011 enmienda el plan).

## Tareas

### 0 · Línea base
- [x] T-000 — Instalar dependencias y compilar el worktree limpio (cubre RNF-002: línea base) [zona: sistema]
  - CHECK: `cd frontend && npm ci && npm run build`
  - EXPECT: `npm ci` sin errores; `build` exit 0 ("built in").
- [x] T-001 — Medir la línea base del *bundle* y anotarla en `history.md` (cubre RNF-002) [zona: sistema]
  - CHECK: `cd frontend/dist/assets && for f in index-*.js NoteEditor-*.js; do echo "$f $(gzip -9c $f | wc -c)"; done`
  - EXPECT: entrada `141660`, editor `316428` (PLAN-0010 §2.5); si difieren, se anota la cifra real como base y se corrige el presupuesto (base + 15 360 / + 40 960).
- [x] T-002 — Suites del frontend en verde (cubre RF-041: línea base de 0008/0009) [zona: sistema]
  - CHECK: `cd frontend && npx vitest run && npm run typecheck && npm run test:perf && npm run test:sync`
  - EXPECT: `Tests 946 passed (946)` (o el número vigente) con 0 failed; typecheck exit 0; `test:perf` p95 < 300 ms; `test:sync` 27/27.
- [x] T-003 — Verificación visual de 0009 en verde (cubre RF-041, RF-064: R-12 de 0009) [zona: sistema]
  - CHECK: `cd frontend && VISUAL_OUT_DIR=/tmp/s10/base npm run test:visual`
  - EXPECT: `42 passed` (V-1…V-10 de 0009, regresión, RNF-001 p95 ≤ 150 ms).
- [x] T-004 — Suite del backend en verde, **sola** contra `:15984` (cubre RF-007: línea base de la regla de ruta) [zona: sistema]
  - CHECK: `bash .harness/gate/check.sh && (cd backend && python3 -m pytest -q)`
  - EXPECT: gate "Compuerta abierta"; `1135 passed` (o el vigente), 0 failed, ~17 min.

### A · Re-anclajes al inicio (PLAN-0010 P-15)
- [x] T-005 — Nota de re-anclaje en `0008-vault-editor/spec.md` (`strict`): 0010 toca `notes/**`, `editor/**`, `note.schema.json` y la batería sin cambiar sus RF [doc] [P-15]
  - CHECK: `git diff --name-only -- .harness/specs/0008-vault-editor/spec.md && bash .harness/gate/check.sh | grep 0008-vault`
  - EXPECT: el archivo en el diff; la línea de 0008 en ✅ (no "DRIFT").
- [x] T-006 — Nota de re-anclaje en `0009-rediseno-visual-workspace/spec.md` (`strict`: `tokens.css`, `notes.css`, `editor.css`, `NoteSidebar`, `VaultWorkspacePage`, `e2e/**`) [doc] [P-15]
  - CHECK: `git diff --name-only -- .harness/specs/0009-rediseno-visual-workspace/spec.md && bash .harness/gate/check.sh | grep 0009-rediseno`
  - EXPECT: el archivo en el diff; 0009 en ✅.
- [x] T-007 — Nota de re-anclaje en `0007-fastapi-sirve-spa/spec.md` (`strict`, dueña de `backend/README.md` y `frontend/README.md`) [doc] [P-15]
  - CHECK: `git diff --name-only -- .harness/specs/0007-fastapi-sirve-spa/spec.md && bash .harness/gate/check.sh | grep 0007-fastapi`
  - EXPECT: el archivo en el diff; 0007 en ✅.

### B · Capturas de referencia
- [x] T-008 — career-admin en **sólo lectura** (`http://localhost:8002`): script Playwright **fuera del repo** (`/tmp/s10/ref/career-capture.ts`, contenedor 1.56.0 con `--network host`) que navega a un recurso con tabla, bloque de código resaltado y Mermaid, y captura claro/oscuro a 1440 (y el Mermaid tras "acercar") (cubre RF-026, RF-033, RF-046, RF-052, RNF-005) [zona: sistema]
  - CHECK: `ls /tmp/s10/ref/career-{table,code,mermaid,mermaid-zoom}-{dark,light}.png | wc -l && python3 -I -c "import json;print(sorted(json.load(open('/tmp/s10/ref/career-geometry.json'))))"`
  - EXPECT: `8`; `career-geometry.json` con alto de fila de tabla, padding de celda, tamaño de etiqueta de lenguaje, fuente del `pre`, alto del área Mermaid y tamaño de los controles de zoom; el script no hace ningún `POST/PUT/PATCH/DELETE` (registro de red del script: 0 peticiones de escritura).
- [x] T-009 — Mockup 1.1.4.4 renderizado en el contenedor (claro/oscuro, 1440/1024) y geometría de `.frontmatter`, `blockquote`, `code`, `.edit-view-code`/`.cm-*`, `.editor-topbar` (cubre RF-009, RF-029, RF-037, RF-038, RNF-005) [zona: sistema]
  - CHECK: `ls /tmp/s10/ref/mockup-{read,code}-{dark,light}-{1440,1024}.png | wc -l && test -s /tmp/s10/ref/mockup-geometry.json && echo ok`
  - EXPECT: `8` y `ok`; los valores coinciden con PLAN-0010 §5.4 (R-3, R-5, R-6, R-9; topbar 43 ± 2).
- [x] T-010 — Medidas de referencia copiadas: career-admin y mockup a `history.md`, y las de career-admin a la columna "Mockup / referencia" de PLAN-0010 §5.4 (R-7, R-8, R-11) [doc]
  - CHECK: `git diff -- .harness/specs/0010-contenido-markdown-completo/plan.md | grep -c "career"`
  - EXPECT: ≥ 3 líneas cambiadas con las cifras medidas en T-008.
- [x] T-011 — Enmienda del plan por **P-17**: §2.3-i (separador `/`, truncado por segmento con "…", lápiz en la barra en lugar de "Editar/Leer", menú ⋮), §5.3 V-10/V-11 y §5.4 R-12/R-13 medidos contra `reference/obsidian-breadcrumb.png` (alturas, separación, color atenuado de "Adelante"), §9 RF-054/RF-061/RF-063 (cubre RF-054, RF-056, RF-061, RF-063) [doc] [P-17]
  - CHECK: `grep -c "P-17" .harness/specs/0010-contenido-markdown-completo/plan.md && grep -n "obsidian-breadcrumb" .harness/specs/0010-contenido-markdown-completo/plan.md | wc -l`
  - EXPECT: ≥ 5 menciones de P-17; ≥ 3 referencias a la captura (V-10, R-12, §2.3-i).

### C · Comprobaciones visuales en rojo y presupuesto de *bundle*
- [x] T-012 — `e2e/fixtures.ts`: `seedContent()` siembra por el push de `/sync` las notas de PLAN-0010 §5.2 (frontmatter de todos los tipos y 12 propiedades, YAML heredado válido y corrompido, tabla ancha, 11 lenguajes + desconocido + sin lenguaje, cita, código en línea, tareas, Mermaid válido/inválido/ancho, ruta profunda, nota en la raíz, nota de ~200 KiB con 50 bloques y 5 Mermaid) + prueba de humo `0010 V-0 siembra` (cubre RNF-005) [zona: sistema]
  - CHECK: `CV --grep "0010 V-0"`
  - EXPECT: `1 passed`: las 14 notas aparecen en el árbol y 0 cambios rechazados.
- [x] T-013 [rojo] — `e2e/content-visual.spec.ts`: `0010 V-1` (panel en lectura), `0010 V-2` (formulario), `0010 V-3` (cita/código en línea/tareas), `0010 V-4` (tabla), en claro/oscuro a 1440/1024/390 con R-3…R-7, R-10, R-16 (cubre RF-009, RF-011, RF-026, RF-037, RF-038, RF-039) [zona: sistema]
  - CHECK: `CV --grep "0010 V-(1|2|3|4) "`
  - EXPECT: fallan por la causa esperada: sin `role="group"` "Propiedades" (V-1/V-2), 0 casillas de tarea (V-3), fila de tabla ~62 px > 40 (V-4).
- [x] T-014 [rojo] — `0010 V-5` (bloque de código), `0010 V-6` (vista Código), `0010 V-7` (Mermaid), `0010 V-8` (error y fallo de carga), `0010 V-9` (zoom) (cubre RF-027, RF-029, RF-033, RF-046, RF-049, RF-052, RF-053) [zona: sistema]
  - CHECK: `CV --grep "0010 V-(5|6|7|8|9) "`
  - EXPECT: fallan: sin cabecera de bloque ni `span.sx-*` (V-5), sin `sx-*` ni números de línea (V-6), sin `svg` de diagrama (V-7/V-8/V-9).
- [x] T-015 [rojo] — `0010 V-10` (encabezado contra la captura de Obsidian, P-17: separador `/`, truncado por segmento, lápiz, ⋮, "Adelante" atenuada, 43 px una línea a 1440/1024/390), `0010 V-11` (menú ⋮), `0010 V-12` (barra lateral: "Raíz", carpeta activa, "Crear en", "Nueva carpeta", pista) (cubre RF-002, RF-006, RF-043, RF-054, RF-056, RF-061, RF-063, RF-064) [zona: sistema]
  - CHECK: `CV --grep "0010 V-(10|11|12) "`
  - EXPECT: fallan: sin `nav[aria-label="Ruta"]`, sin "Opciones de la nota", sin fila "Raíz".
- [x] T-016 [rojo] — `0010 V-13` (todo color computado ∈ tokens del tema), `0010 V-14` (reduced-motion), `0010 V-15` (red: chunks pedidos según la nota) (cubre RF-040, RNF-002, RNF-004) [zona: sistema]
  - CHECK: `CV --grep "0010 V-(13|14|15) "`
  - EXPECT: V-13/V-14 fallan por ausencia de los componentes; V-15 falla porque no existen chunks de `mermaid`/`frontmatter`.
- [x] T-017 [rojo] — `frontend/scripts/check-bundle.mjs` + `build.manifest: true` en `vite.config.ts` + script `test:bundle`: entrada ≤ 157 020 B gzip, editor ≤ 357 388 B gzip, chunks separados de `mermaid`, `svg-pan-zoom`, `frontmatter` y gramáticas extra sin importación estática desde la entrada ni el editor (cubre RNF-002) [zona: sistema] [P-9]
  - CHECK: `cd frontend && npm run build && npm run test:bundle`
  - EXPECT: tamaños dentro (base 141 660 / 316 428) y **falla** "chunk mermaid ausente" (aún no existe).

### D · Tokens y maquetación de los 7 componentes (notas sembradas; sin persistencia nueva)
- [x] T-018 [rojo] — `editor/contrast.test.ts` (pares de PLAN-0010 §5.5, 6 tokens nuevos en ambos temas, `--text-muted`/`--accent` prohibidos como `color`) y `notes/layoutCss.test.ts` ampliado (sin literales de color en `editor.css`, `syntax.css`, `notes.css`) (cubre RF-040, RNF-004) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/contrast.test.ts src/notes/layoutCss.test.ts`
  - EXPECT: falla "--success-text no definido" (y los otros 5).
- [x] T-019 — Tokens de ADR-006 en `styles/tokens.css` (claro y oscuro) + `editor/syntax.css` con los alias `--syntax-*` y las clases `sx-*` (cubre RF-040, RNF-004) [zona: estilos] [P-1, P-2]
  - CHECK: `cd frontend && npx vitest run src/editor/contrast.test.ts src/notes/layoutCss.test.ts`
  - EXPECT: `passed`; mínimo verde/ámbar claro sobre T = 4,58.

**Componente 1 · Propiedades (panel, formulario, avisos)**
- [x] T-020 [rojo] — `editor/properties.test.ts` (`toRows`: inferencia de tipos y complejos) + `editor/PropertiesPanel.test.tsx` (`dl` por clave en orden, "Sí/No", chips, complejo con `lock`, "(vacío)", sin panel con `{}`/ausente, `<script>` y URLs como texto, "Mostrar n más" con ≥ 10) (cubre RF-009, RF-010, RF-013, RNF-003) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/properties.test.ts src/editor/PropertiesPanel.test.tsx`
  - EXPECT: falla al importar `./properties` / `./PropertiesPanel`.
- [x] T-021 — `editor/properties.ts` (`toRows`) + `editor/PropertiesPanel.tsx` + estilos (R-3, R-4) y montaje en lectura en `NoteEditor` (cubre RF-009, RF-010, RF-013) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor && CV --grep "0010 V-1 "`
  - EXPECT: vitest `passed`; V-1 `passed` en claro/oscuro y 3 anchos; capturas `props-read-*` leídas.
- [x] T-022 [rojo] — `properties.test.ts` (`convert`, `validateRows`, `parseNumberInput`, `fromRows` conserva complejos) + `editor/PropertiesForm.test.tsx` (columnas, nombres accesibles, añadir/quitar con foco y anuncios, cambio de tipo, errores con `aria-describedby`, resumen `role="alert"`, "Añadir propiedad" compacto sin propiedades) (cubre RF-010, RF-011, RF-013) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/properties.test.ts src/editor/PropertiesForm.test.tsx`
  - EXPECT: fallan `convert`/`validateRows` y la importación de `PropertiesForm`.
- [x] T-023 — `properties.ts` (resto) + `editor/PropertiesForm.tsx` con estado local (sin guardar) + estilos (R-16, 390 apilado, `pointer:coarse`) montado en Visual (cubre RF-010, RF-011, RF-013) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor && CV --grep "0010 V-2 "`
  - EXPECT: vitest `passed`; V-2 `passed`; capturas `props-form-*` (incl. 390) leídas.
- [x] T-024 [rojo] — `editor/Notice.test.tsx`: variantes info/advertencia/error (icono, borde 3 px, rol `status`/`alert`, "Cerrar aviso", acción opcional) con los textos de PLAN-0010 §2.3-d (cubre RF-008, RF-017, RF-019, RF-044, RF-045) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/Notice.test.tsx`
  - EXPECT: falla al importar `./Notice`.
- [x] T-025 — `editor/Notice.tsx` + estilos (variantes sobre `.note-editor-notice`) (cubre RF-008, RF-017, RF-019, RF-044, RF-045) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor/Notice.test.tsx src/editor/contrast.test.ts`
  - EXPECT: `passed`.

**Componente 2 · Bloque de código (chasis)**
- [x] T-026 [rojo] — `editor/codeBlockView.test.ts`: cabecera `contenteditable=false` con etiqueta tal cual o "texto", "Copiar" (`aria-label` fijo, éxito "Copiado", fallo sin excepción, región viva), `pre` como `contentDOM`; `MilkdownView.test.tsx`: serializar tras montar = entrada (cubre RF-033, RF-034, RF-035, RF-036) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/codeBlockView.test.ts src/editor/MilkdownView.test.tsx`
  - EXPECT: falla al importar `./codeBlockView`.
- [x] T-027 — `editor/icons.ts` (glifos Lucide con `createElementNS`) + `editor/codeBlockView.ts` + registro de la *node view* en `MilkdownView` (cubre RF-033, RF-034, RF-035, RF-036, RNF-003) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor`
  - EXPECT: `passed`.
- [x] T-028 — Estilos del chasis (caja, cabecera 36, "Copiar" 28 × ≥ 84 y estados, `pre` 12/16 mono 13/1,6) (cubre RF-033, RF-040) [zona: estilos]
  - CHECK: `cd frontend && npx vitest run src/notes/layoutCss.test.ts && CV --grep "0010 V-5 "`
  - EXPECT: layoutCss `passed`; V-5 pasa las medidas R-8 y la etiqueta; **siguen rojas** sólo las aserciones de `sx-*` (resaltado real en F); capturas `codeblock-*` leídas.

**Componente 3 · Mermaid (chasis con renderizador falso)**
- [x] T-029 [rojo] — `codeBlockView.test.ts`: rama `mermaid` con un renderizador inyectado falso: área `role="img"` con nombre, estados cargando/error/fallo de carga ("Reintentar")/vacío, "Ver código" con `aria-expanded`, en lectura el código oculto, en Visual vista previa debajo, controles de zoom sólo si el SVG fijo excede (cubre RF-046, RF-047, RF-049, RF-052, RF-053) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/codeBlockView.test.ts`
  - EXPECT: fallan las pruebas de la rama `mermaid`.
- [x] T-030 — Chasis Mermaid en `codeBlockView.ts` (interfaz `MermaidRenderer` inyectable; por defecto un renderizador que aún no carga nada) + estilos (R-11, controles 28 × 28) (cubre RF-046, RF-047, RF-049, RF-052, RF-053) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor && CV --grep "0010 V-(8|9) "`
  - EXPECT: vitest `passed`; en V-8 pasan las aserciones de layout del estado de error/fallo; las que exigen SVG real siguen rojas hasta F.

**Componente 4 · Prosa y tablas (cita, código en línea, tareas, tablas)**
- [x] T-031 [rojo] — `editor/taskItemView.test.ts` (lectura `role="img"` "Pendiente"/"Completada" sin foco; Visual `input` con nombre = texto) + `layoutCss.test.ts` (cita, código en línea, `td > p {margin:0}`, envoltorio de tabla) (cubre RF-026, RF-037, RF-038, RF-039) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/taskItemView.test.ts src/notes/layoutCss.test.ts`
  - EXPECT: falla al importar `./taskItemView` y las reglas CSS ausentes.
- [x] T-032 — Estilos de cita y código en línea (R-5, R-6) + `editor/tableView.ts` (`TableView` con envoltorio `note-table-scroll`, región en lectura) + CSS de tabla (R-7) (cubre RF-026, RF-037, RF-038) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor src/notes/layoutCss.test.ts && CV --grep "0010 V-(3|4) "`
  - EXPECT: vitest `passed`; V-4 fila ≤ 40 (≈ 31,4) y scroll dentro del envoltorio; V-3 cita/código en línea en verde (casillas aún rojas).
- [x] T-033 — `editor/taskItemView.ts` (presentación en lectura y Visual) + CSS de casillas (R-10) (cubre RF-039) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor/taskItemView.test.ts && CV --grep "0010 V-3 "`
  - EXPECT: `passed`; capturas `prose-*` leídas (casilla por tarea, tachado en hechas).

**Componente 5 · Vista Código**
- [x] T-034 [rojo] — `editor/CodeView.test.tsx`: números de línea, línea activa, clases `sx-*` en encabezados/negrita/enlace/código/marcas del markdown (cubre RF-029) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/CodeView.test.tsx`
  - EXPECT: fallan (sin `.cm-lineNumbers` ni `sx-*`).
- [x] T-035 — `editor/highlight/highlighter.ts` (`tagHighlighter` → `sx-*`) + `CodeView` con `syntaxHighlighting`, `lineNumbers`, `highlightActiveLine` + tema por variables (R-9) (cubre RF-029, RF-040) [zona: pantalla] [P-11]
  - CHECK: `cd frontend && npx vitest run src/editor && CV --grep "0010 V-6 "`
  - EXPECT: vitest `passed`; V-6 en verde salvo el bloque YAML (F); capturas `code-view-*` leídas frente a `mockup-code-*`.

**Componente 6 · Encabezado (migas, flechas, lápiz, ⋮) — P-17**
- [x] T-036 [rojo] — `editor/breadcrumb.test.ts`: `crumbs(path)`, raíz = sólo nombre, truncado **por segmento** con "…" según anchos simulados (primera carpeta y nombre nunca desaparecen) (cubre RF-054, RF-063) [zona: test] [P-17]
  - CHECK: `cd frontend && npx vitest run src/editor/breadcrumb.test.ts`
  - EXPECT: falla al importar `./breadcrumb`.
- [x] T-037 — `editor/breadcrumb.ts` (cubre RF-054, RF-063) [zona: núcleo]
  - CHECK: `cd frontend && npx vitest run src/editor/breadcrumb.test.ts`
  - EXPECT: `passed`.
- [x] T-038 [rojo] — `editor/NoteBreadcrumb.test.tsx`: `nav[aria-label="Ruta"] > ol`, separador `/` decorativo, carpetas como botones con `title`, `h2 aria-current="page"` con el nombre, `title` = ruta completa, segmentos truncados con "…" (cubre RF-054, RF-063) [zona: test] [P-17]
  - CHECK: `cd frontend && npx vitest run src/editor/NoteBreadcrumb.test.tsx`
  - EXPECT: falla al importar `./NoteBreadcrumb`.
- [x] T-039 — `editor/NoteBreadcrumb.tsx` (`ResizeObserver` + `breadcrumb.ts`, `onRevealFolder` inyectado) + estilos (cubre RF-054, RF-063) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor/NoteBreadcrumb.test.tsx`
  - EXPECT: `passed`.
- [x] T-040 [rojo] — `editor/NoteMenu.test.tsx`: botón ⋮ "Opciones de la nota" (`aria-haspopup`, `aria-expanded`), `role="menu"` en portal, orden P-4, teclado (Enter/Espacio/↓/↑/Inicio/Fin/Esc/Tab), "Ver en Código" `aria-disabled` en Código, acciones como *props* (cubre RF-061) [zona: test] [P-4, P-17]
  - CHECK: `cd frontend && npx vitest run src/editor/NoteMenu.test.tsx`
  - EXPECT: falla al importar `./NoteMenu`.
- [x] T-041 — `editor/NoteMenu.tsx` + estilos (R-13) (cubre RF-061) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor/NoteMenu.test.tsx`
  - EXPECT: `passed`.
- [ ] T-042 [rojo] — `editor/NoteEditor.test.tsx`: cabecera en el orden Atrás, Adelante, migas, Visual|Código, Insertar tabla (sólo Visual), Guardar, estado, **lápiz** (nombre "Editar"/"Leer"), ⋮; flechas con `canBack/canForward` de *props* (deshabilitadas y "Adelante" atenuada); ≤ 560 px sólo iconos con el mismo nombre; + actualización **explícita** RF-041 del nombre del `h2` en `NoteEditor.test.tsx`/`VaultWorkspacePage.test.tsx` (cubre RF-041, RF-054, RF-056, RF-064) [zona: test] [P-17]
  - CHECK: `cd frontend && npx vitest run src/editor/NoteEditor.test.tsx src/notes/VaultWorkspacePage.test.tsx`
  - EXPECT: fallan sólo las pruebas nuevas y las de nombre del `h2` actualizadas.
- [ ] T-043 — Cabecera nueva en `NoteEditor.tsx` (migas, flechas, lápiz, ⋮ con acciones *stub*, "Insertar tabla" inerte) + `editor.css` (43 px, `padding 0 16px`, 28 px, `pointer:coarse` 36) (cubre RF-054, RF-056, RF-061, RF-064) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src && CV --grep "0010 V-(10|11) "`
  - EXPECT: vitest `passed` (incluida toda la suite de 0008/0009); V-10/V-11 en verde en layout a 1440/1024/390 (43 ± 2, una línea, sin scroll horizontal); capturas `header-*`, `menu-*` leídas junto a `reference/obsidian-breadcrumb.png`.

**Componente 7 · Barra lateral de carpetas**
- [ ] T-044 [rojo] — `notes/NoteSidebar.test.tsx`: fila "Raíz" primer `treeitem`, carpeta activa con `aria-current` (estado local), "Crear en: …" con `aria-live`, botón y formulario "Nueva carpeta" (etiqueta, Esc, foco), pista con `aria-describedby` en los 3 campos; + actualización **explícita** RF-041 de las pruebas de orden/Inicio del árbol (cubre RF-002, RF-006, RF-041, RF-043) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/NoteSidebar.test.tsx`
  - EXPECT: fallan las pruebas nuevas.
- [ ] T-045 — `NoteSidebar.tsx` (fila "Raíz", estado visual de carpeta activa local, "Crear en", formulario "Nueva carpeta" sin persistir, pista) + `notes.css` (R-14) (cubre RF-002, RF-006, RF-043) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src && CV --grep "0010 V-12 "`
  - EXPECT: vitest `passed`; V-12 en verde salvo crear de verdad (F); capturas `sidebar-folders-*` leídas.
- [ ] T-046 — V-13/V-14 sobre todo lo maquetado (colores ∈ tokens, reduced-motion) (cubre RF-040, RNF-004) [zona: sistema]
  - CHECK: `CV --grep "0010 V-(13|14) "`
  - EXPECT: `passed` en claro/oscuro.

### E · Revisión visual temprana (antes de cualquier lógica o backend)
- [ ] T-047 — Corrida de percepción completa de lo maquetado: `CV --grep "0010 V-(1|2|3|4|5|6|10|11|12|13|14) "` en claro/oscuro a 1440/1024/390 y tabla de medidas R-1…R-16 en `history.md` (cubre RF-009, RF-026, RF-037, RF-054, RF-064, RNF-005) [zona: sistema]
  - CHECK: `CV --grep "0010 V-(1|2|3|4|5|6|10|11|12|13|14) " && cat /tmp/s10/e2e/measurements.json | python3 -I -m json.tool | head -80`
  - EXPECT: todo en verde salvo las aserciones de resaltado real (`sx-*` en V-5) y del bloque YAML (V-6), pendientes de F; medidas dentro de tolerancia.
- [ ] T-048 — Comparación lado a lado: capturas de la app frente a `mockup-*` (panel, cita, código en línea, vista Código, barra), `reference/obsidian-breadcrumb.png` (migas, flechas, lápiz, ⋮) y `career-*` (tabla, bloque de código, chasis Mermaid); revisión rápida del experto-ux-ui; hallazgos con severidad en `history.md` (cubre RNF-005) [zona: sistema]
  - CHECK: `ls /tmp/s10/e2e/*.png | wc -l && grep -c "T-048" .harness/memory/history.md`
  - EXPECT: ≥ 60 capturas; entrada en `history.md` con cada par comparado y los hallazgos (o "sin hallazgos").
- [ ] T-049 — Corregir los desvíos de T-048 desde la raíz (una sub-entrada por hallazgo, test o medida que lo fija) (cubre RNF-005) [zona: pantalla]
  - CHECK: `CV --grep "0010 V-(1|2|3|4|5|6|10|11|12|13|14) "`
  - EXPECT: mismo resultado que T-047 sin los desvíos; si no hubo hallazgos, se cierra con "sin hallazgos" en `history.md`.
- [ ] T-050 — Sonda de rendimiento: abrir en lectura la nota de ~200 KiB (sin resaltado ni Mermaid todavía), 30 aperturas a 1440 (`e2e/content-perf.spec.ts`, prueba `0010 RNF-001 sonda`) (cubre RNF-001) [zona: sistema]
  - CHECK: `cd frontend && VISUAL_OUT_DIR=/tmp/s10/e2e npm run test:visual -- e2e/content-perf.spec.ts --grep "sonda"`
  - EXPECT: imprime mediana y p95; p95 ≤ 150 ms. Si Milkdown solo ya supera 150 ms, se **detiene** el avance y se eleva como hallazgo (riesgo de PLAN-0010 §7), sin parche.

### F · Lógica
**F.0 · Dependencias**
- [ ] T-051 — Instalar con versión exacta: `@milkdown/plugin-clipboard@7.22.3 prosemirror-highlight@0.16.0 @codemirror/lang-yaml@6.1.3 @codemirror/lang-python@6.2.1 @codemirror/lang-sql@6.10.0 @codemirror/lang-json@6.0.2 @codemirror/legacy-modes@6.5.5 yaml@2.9.1 mermaid@11.17.2 svg-pan-zoom@3.6.2` (cubre RF-023, RF-027, RF-046, RF-052, RNF-002) [zona: sistema]
  - CHECK: `cd frontend && npm install -E <lista> && npm ls prosemirror-view | grep -c "prosemirror-view@" && npm ls prosemirror-view | grep -v deduped | grep -c "prosemirror-view@" && npm run build`
  - EXPECT: versiones exactas en `package.json`; una sola instancia de `prosemirror-view` no deduplicada (`1`); build exit 0.

**F.1 · Frontmatter de ida y vuelta (D1) y YAML heredado (NC-2)**
- [ ] T-052 [rojo] — `editor/frontmatter.test.ts` recorre **todo** `contracts/frontmatter-yaml.cases.json` (`split`, `compose`, `parse`, `roundtrip`, `legacy`) (cubre RF-014, RF-015, RF-016, RF-017, RF-018, RF-044, RF-045) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/frontmatter.test.ts`
  - EXPECT: falla al importar `./frontmatter`.
- [ ] T-053 — `editor/frontmatter.ts` con `yaml` 2.9.1 (opciones de PLAN-0010 §2.1) (cubre RF-014…RF-018, RF-044, RF-045) [zona: núcleo]
  - CHECK: `cd frontend && npx vitest run src/editor/frontmatter.test.ts`
  - EXPECT: `passed` (11 + 3 + 28 + 22 + 10 casos).
- [ ] T-054 [rojo] — `notes/noteStore.test.ts`: `save(id, content, rev, frontmatter)` escribe ambos; sin `frontmatter` conserva el anterior; rama de conflicto con el nuevo `frontmatter`; > 64 KiB rechazado sin escribir (cubre RF-012, RF-019, RF-022) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/noteStore.test.ts`
  - EXPECT: fallan las pruebas nuevas (`frontmatter` no se escribe).
- [ ] T-055 — `notes/noteStore.ts` (`save` y `saveAsBranch` con `frontmatter`, `checkFrontmatter`) (cubre RF-012, RF-019, RF-022) [zona: almacén]
  - CHECK: `cd frontend && npx vitest run src/notes`
  - EXPECT: `passed`.
- [ ] T-056 [rojo] — `editor/NoteEditorFrontmatter.test.tsx` (sesión): Visual = `{props, body}`, Código = texto compuesto; alternar sin guardar conserva todo; abrir en Código y guardar sin cambios deja `frontmatter` y `content` idénticos (complejos incluidos); guardar desde Visual sólo cambia `frontmatter` por el formulario; cambiar una propiedad marca "sucio"; `frontmatter.ts` no se pide en lectura (cubre RF-012, RF-014, RF-016, RF-020, RF-021) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/NoteEditorFrontmatter.test.tsx`
  - EXPECT: fallan (la sesión aún no existe).
- [ ] T-057 — Sesión de edición en `NoteEditor.tsx` (carga diferida de `./frontmatter`, `composeCode`, conversión al alternar, "sucio" canónico) y formulario conectado (cubre RF-012, RF-014, RF-016, RF-020, RF-021) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor`
  - EXPECT: `passed`, incluidas las suites de 0008 (`NoteEditor*.test.tsx`).
- [ ] T-058 [rojo] — Guardar desde Código: separa el bloque a `frontmatter` y el resto a `content`; YAML inválido (cada código del contrato) no guarda ni cambia de vista, aviso `alert` con motivo y línea, "Ir a la línea N"; > 64 KiB con KiB en el aviso; `CodeView.test.tsx`: decoración de la línea de error y bloque YAML con `yamlFrontmatter` (cubre RF-015, RF-017, RF-019, RF-029) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/NoteEditorFrontmatter.test.tsx src/editor/CodeView.test.tsx`
  - EXPECT: fallan las pruebas nuevas.
- [ ] T-059 — Guardado desde Código en `NoteEditor.tsx` + `CodeView.tsx` (`yamlFrontmatter`, decoración de error, `registerReveal`) + mensajes en `notes/messages.ts` (cubre RF-015, RF-017, RF-019, RF-029) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor src/notes && CV --grep "0010 V-6 "`
  - EXPECT: vitest `passed`; V-6 completa en verde (bloque YAML con fondo `--bg-secondary`).
- [ ] T-060 [rojo] — NC-2: `migrate` (aviso previo P-5, Guardar habilitado sin ediciones, guardar mueve el bloque y muestra "Las propiedades se movieron fuera del texto", salir sin guardar no cambia nada ni pregunta) y `looks-yaml` (aviso en Visual; bloque estricto protegido byte a byte tras editar en Visual, P-6; forma corrompida = punto fijo) (cubre RF-020, RF-044, RF-045) [zona: test] [P-5, P-6]
  - CHECK: `cd frontend && npx vitest run src/editor/NoteEditorFrontmatter.test.tsx src/editor/MilkdownView.test.tsx`
  - EXPECT: fallan las pruebas NC-2.
- [ ] T-061 — `classifyLegacy` en `NoteEditor` + `prefix` en `MilkdownView` + avisos (cubre RF-020, RF-044, RF-045) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor && CV --grep "0010 V-(1|2) "`
  - EXPECT: vitest `passed`; V-1/V-2 siguen en verde con la nota heredada sembrada.
- [ ] T-062 — `notes/notes.integration.test.ts`: `frontmatter` editado sobrevive a push/pull entre dos réplicas reales y un choque de `frontmatter` queda para decisión manual (cubre RF-022) [zona: test]
  - CHECK: `cd frontend && npm run test:sync`
  - EXPECT: `27 + n passed`, 0 failed (nada más usando `:15984`).

**F.2 · Bug `.md` en servidor y cliente (batería común + delta del contrato de 0008)**
- [ ] T-063 [rojo] — `backend/tests/fixtures/note_rules_cases.json`: `X/.md`, `X/.MD`, `.md`, `X/ .md` → `validation-error:path`; `X/a.md`, `.md/a.md` → `null` (cubre RF-007) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_rules.py`
  - EXPECT: 4 casos fallan (hoy `check_path` los acepta).
- [ ] T-064 [rojo] — `test_note_contract.py`: el patrón `path` de `note.schema.json` coincide con `check_path` en todos los casos `path` de la batería (cubre RF-007) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_contract.py`
  - EXPECT: falla en `X/.md` (el patrón actual lo acepta).
- [ ] T-065 [rojo] — `test_note_sync_push.py` (CouchDB real): revisión con `path` `X/.md` → `validation-error:path` y la anterior intacta; `X/a.md` aceptada (cubre RF-007) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_sync_push.py -k "md"`
  - EXPECT: falla (el push hoy la acepta).
- [ ] T-066 — `core/note_rules.py` `check_path`: último segmento `.md` sin mayúsculas → inválido (cubre RF-007) [zona: núcleo]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_rules.py tests/test_note_sync_push.py`
  - EXPECT: `passed`.
- [ ] T-067 — Delta de `0008-vault-editor/contracts/note.schema.json` (patrón y descripción de `path`, PLAN-0010 §4) (cubre RF-007) [doc] [zona: contrato]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_note_contract.py && bash ../.harness/gate/check.sh | grep 0008-vault`
  - EXPECT: `passed`; 0008 en ✅ (re-anclado en T-005).
- [ ] T-068 [rojo] — `notes/noteRules.test.ts` con la batería ampliada (cubre RF-007) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/noteRules.test.ts`
  - EXPECT: fallan los 4 casos nuevos.
- [ ] T-069 — `notes/noteRules.ts` `checkPath` (cubre RF-007) [zona: núcleo]
  - CHECK: `cd frontend && npx vitest run src/notes/noteRules.test.ts`
  - EXPECT: `passed`.

**F.3 · Carpetas y destino**
- [ ] T-070 [rojo] — `notes/folders.test.ts` (`parentFolder`, `ancestors`, `joinPath`, `checkFolderName`, `folderExists` con NFKC+casefold) + `notes/untitled.test.ts` (por carpeta) (cubre RF-001, RF-003, RF-004, RF-005, RF-042) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/folders.test.ts src/notes/untitled.test.ts`
  - EXPECT: falla al importar `./folders` y el caso de carpeta de `untitled`.
- [ ] T-071 — `notes/folders.ts` + `notes/untitled.ts` (cubre RF-001, RF-003, RF-004, RF-005, RF-042) [zona: núcleo]
  - CHECK: `cd frontend && npx vitest run src/notes/folders.test.ts src/notes/untitled.test.ts`
  - EXPECT: `passed`.
- [ ] T-072 [rojo] — `noteStore.test.ts`: `create` en carpeta (título relativo, `/` anida, sin título → "Sin título n" de esa carpeta), `Carpeta/` rechazada sin escribir, puerta RF-008 en `save` y `softDelete` (P-12) (cubre RF-001, RF-003, RF-007, RF-008) [zona: test] [P-12]
  - CHECK: `cd frontend && npx vitest run src/notes/noteStore.test.ts`
  - EXPECT: fallan las pruebas nuevas (hoy crea `Carpeta/.md`).
- [ ] T-073 — `notes/noteStore.ts` (`titleToPath`, `create(…, folder)`, puerta RF-008) + `notes/messages.ts` (carpeta y ruta inválida) (cubre RF-001, RF-003, RF-004, RF-005, RF-007, RF-008) [zona: almacén]
  - CHECK: `cd frontend && npx vitest run src/notes`
  - EXPECT: `passed`.
- [ ] T-074 [rojo] — `VaultWorkspacePage.test.tsx` + `NoteSidebar.test.tsx`: carpeta activa real (raíz al entrar, padre al abrir, clic/Enter en carpeta, "Raíz"; ←/→ no la cambian), "Nueva nota" en la carpeta activa, "Nueva carpeta" (crea `…/Sin título.md`, despliega, abre en edición; vacío/tramo vacío/control/duplicada con su mensaje y sin escribir), `revealFolder` (despliega y desplaza sólo el panel) (cubre RF-001, RF-002, RF-003, RF-004, RF-005, RF-042, RF-043, RF-055) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/VaultWorkspacePage.test.tsx src/notes/NoteSidebar.test.tsx`
  - EXPECT: fallan las pruebas nuevas.
- [ ] T-075 — `activeFolder` en `Workspace`, `NoteSidebarHandle` (`startRename`, `remove`, `revealFolder`) y formulario "Nueva carpeta" persistente (cubre RF-001…RF-005, RF-042, RF-043, RF-055) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src && CV --grep "0010 V-12 "`
  - EXPECT: vitest `passed`; V-12 completa en verde (crear carpeta real, error de duplicada).
- [ ] T-076 [rojo] — RF-008: una nota existente con ruta inválida (sembrada directamente en la réplica) se lista, se abre, guardar pide renombrar con "Renombrar" y conserva el borrador; borrar también lo pide (cubre RF-008) [zona: test] [P-12]
  - CHECK: `cd frontend && npx vitest run src/editor/NoteEditorFrontmatter.test.tsx src/notes/VaultWorkspacePage.test.tsx -t "RF-008"`
  - EXPECT: fallan.
- [ ] T-077 — Aviso RF-008 en `NoteEditor` (botón → `startRename`) y en el flujo de borrar (cubre RF-008) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src`
  - EXPECT: `passed`.

**F.4 · Portapapeles, insertar tabla, fila/columna, tareas**
- [ ] T-078 [rojo] — `MilkdownView.test.tsx`: pegar `text/plain` con tabla GFM → `table`; listas/énfasis → estructura; tabla mal formada → texto carácter a carácter; `vscode-editor-data` con modo `markdown` → estructura (P-8); enlace `javascript:` pegado sin `href` (cubre RF-023, RF-024, RNF-003) [zona: test] [P-8]
  - CHECK: `cd frontend && npx vitest run src/editor/MilkdownView.test.tsx -t "pegar"`
  - EXPECT: fallan (hoy se pega como párrafos escapados).
- [ ] T-079 — `.use(clipboard)` + `handlePaste` previo para VS Code `markdown` en `MilkdownView.tsx` (cubre RF-023, RF-024) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor`
  - EXPECT: `passed`.
- [ ] T-080 [rojo] — "Insertar tabla" inserta cabecera + 1 fila × 2 columnas en el cursor; con el cursor en una tabla aparecen "Añadir fila debajo" y "Añadir columna a la derecha" y funcionan; en Código no hay botón (cubre RF-025) [zona: test] [P-7]
  - CHECK: `cd frontend && npx vitest run src/editor/MilkdownView.test.tsx src/editor/NoteEditor.test.tsx -t "tabla"`
  - EXPECT: fallan.
- [ ] T-081 — `registerCommands` (`insertTableCommand({row:2,col:2})`, `addRowAfterCommand`, `addColAfterCommand`), `onTableContext` y botones de la barra (cubre RF-025) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor && CV --grep "0010 V-4 "`
  - EXPECT: vitest `passed`; V-4 en verde incluida la tabla insertada desde la UI.
- [ ] T-082 [rojo] — Alternar una casilla en Visual cambia `checked`, serializa `- [x]`/`- [ ]` y marca la nota con cambios; en lectura no cambia nada (cubre RF-039) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/taskItemView.test.ts src/editor/MilkdownView.test.tsx -t "tarea"`
  - EXPECT: fallan.
- [ ] T-083 — Alternado en `taskItemView.ts` (`setNodeMarkup`, anuncio "Marcada"/"Sin marcar") (cubre RF-039) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor && CV --grep "0010 V-3 "`
  - EXPECT: `passed`.

**F.5 · Resaltado real**
- [ ] T-084 [rojo] — `editor/highlight/languages.test.ts` (los 11 lenguajes y alias de RF-030 sin mayúsculas; desconocido → `null`) + `editor/highlight/proseHighlight.test.ts` (clases `sx-*` en lectura y Visual, se actualizan al editar, carga diferida, fallo de carga sin clases ni excepción) (cubre RF-027, RF-028, RF-030, RF-031, RF-032) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/highlight`
  - EXPECT: falla al importar `./languages`/`./proseHighlight`.
- [ ] T-085 — `highlight/languages.ts` + `highlight/proseHighlight.ts` (`prosemirror-highlight/lezer` con *parser* diferido) + registro en `MilkdownView` (cubre RF-027, RF-028, RF-030, RF-031, RF-032) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor && CV --grep "0010 V-5 "`
  - EXPECT: vitest `passed`; V-5 completa en verde (un `sx-*` por lenguaje, colores = tokens, contraste ≥ 4,5; desconocido sin `sx-*` ni errores de consola).
- [ ] T-086 [rojo] — `CodeView.test.tsx`: bloques cercados con lenguaje admitido coloreados (`markdown({codeLanguages})`) (cubre RF-029, RF-030) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/CodeView.test.tsx -t "cercado"`
  - EXPECT: falla.
- [ ] T-087 — `codeLanguages: LANGUAGES` en `CodeView.tsx` (cubre RF-029, RF-030) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor && CV --grep "0010 V-6 "`
  - EXPECT: `passed`.

**F.6 · Mermaid y zoom**
- [ ] T-088 [rojo] — `editor/mermaid/themeVariables.test.ts` (composición de `--accent-soft`, mapa completo de PLAN-0010 §2.3-f en ambos temas) (cubre RF-050) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/mermaid/themeVariables.test.ts`
  - EXPECT: falla al importar.
- [ ] T-089 — `editor/mermaid/themeVariables.ts` (cubre RF-050) [zona: núcleo]
  - CHECK: `cd frontend && npx vitest run src/editor/mermaid/themeVariables.test.ts`
  - EXPECT: `passed`.
- [ ] T-090 [rojo] — `editor/mermaid/renderMermaid.test.ts` (módulo `mermaid` simulado): `import()` sólo con bloque `mermaid`; configuración `strict`/`htmlLabels:false`/`secure` ampliado/`suppressErrorRendering`/`theme:"base"`; verificación del SVG (rechaza `script`, `foreignObject`, `on*`, `href`); fuentes hostiles (`%%{init}%%`, `click … call`, `click … href "javascript:…"`, `config:` de tema) sin efecto; error por bloque; fallo de carga; re-render al cambiar `data-theme`; render en serie (cubre RF-046, RF-049, RF-050, RF-051, RF-053, RNF-003) [zona: test] [P-10]
  - CHECK: `cd frontend && npx vitest run src/editor/mermaid/renderMermaid.test.ts`
  - EXPECT: falla al importar.
- [ ] T-091 — `editor/mermaid/renderMermaid.ts` conectado como renderizador por defecto de la *node view* (cubre RF-046, RF-049, RF-050, RF-051, RF-053) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor && CV --grep "0010 V-(7|8) "`
  - EXPECT: vitest `passed`; V-7/V-8 en verde (SVG real, 0 `script`/`foreignObject`/`on*`/`a[href]`, colores del tema, cambio de tema sin recargar, error y fallo de carga); capturas leídas frente a `career-mermaid-*`.
- [ ] T-092 [rojo] — Vista previa en Visual: se actualiza ≤ 500 ms tras la última tecla (temporizadores falsos, *debounce* 400) y conserva el SVG anterior; en Código no hay diagrama (cubre RF-047, RF-048) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/codeBlockView.test.ts src/editor/CodeView.test.tsx -t "RF-04(7|8)"`
  - EXPECT: fallan.
- [ ] T-093 — *Debounce* y vista previa en `codeBlockView.ts` (cubre RF-047, RF-048) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor`
  - EXPECT: `passed`.
- [ ] T-094 [rojo] — Zoom: `svg-pan-zoom` diferido sólo si excede; ajuste al ancho; botones con límites deshabilitados; teclado (flechas, `+`/`-`, `0`); rueda sólo con Ctrl/⌘; sin animación con reduced-motion (cubre RF-052) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/codeBlockView.test.ts -t "zoom"`
  - EXPECT: fallan.
- [ ] T-095 — `editor/mermaid/panZoom.ts` (cubre RF-052) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/editor && CV --grep "0010 V-9 "`
  - EXPECT: vitest `passed`; V-9 en verde; capturas `mermaid-zoom-*` leídas frente a `career-mermaid-zoom-*`.

**F.7 · Historial y breadcrumb**
- [ ] T-096 [rojo] — `notes/noteHistory.test.ts`: `push` (descarta adelante, sin duplicar el actual, tope 50), `step` saltando inválidos, renombrada navegable por id, `load`/`save` por bóveda, forma corrupta → vacío (cubre RF-057, RF-058) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/noteHistory.test.ts`
  - EXPECT: falla al importar.
- [ ] T-097 — `notes/noteHistory.ts` (cubre RF-057, RF-058) [zona: núcleo]
  - CHECK: `cd frontend && npx vitest run src/notes/noteHistory.test.ts`
  - EXPECT: `passed`.
- [ ] T-098 [rojo] — `VaultWorkspacePage.test.tsx`: abrir notas llena el historial; Atrás/Adelante navegan y se deshabilitan en los extremos; nota borrada saltada; con borrador sucio aparece el aviso de 0008 y cancelar conserva nota, borrador y posición (foco al botón); Alt+←/→ fuera de un editor navega con `preventDefault`, dentro de Milkdown/CodeMirror en edición no; recarga (mismo `sessionStorage`) conserva el historial; otra bóveda, otro historial (cubre RF-056, RF-057, RF-058, RF-059, RF-060) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/VaultWorkspacePage.test.tsx -t "historial"`
  - EXPECT: fallan.
- [ ] T-099 — Historial en `Workspace` (`onOpened`, `onCancelOpen`, atajo) y flechas reales en la cabecera (cubre RF-056, RF-057, RF-058, RF-059, RF-060) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src`
  - EXPECT: `passed`, sin regresión de `NoteEditorLeave.test.tsx`.
- [ ] T-100 [rojo] — Migas y menú reales: clic en carpeta de la miga la revela y la deja activa sin cambiar de nota; "Renombrar/mover" y "Borrar" del ⋮ ejecutan los flujos del árbol con sus mensajes; "Ver en Código" pasa a edición + Código; "Copiar ruta" copia el `path` con `.md` y anuncia "Ruta copiada" (o el fallo); renombrar/mover la nota abierta actualiza las migas sin recargar; el lápiz alterna lectura/edición como el botón de 0008 (cubre RF-055, RF-062, RF-065) [zona: test] [P-17]
  - CHECK: `cd frontend && npx vitest run src/notes/VaultWorkspacePage.test.tsx src/editor/NoteMenu.test.tsx -t "RF-0(55|62|65)"`
  - EXPECT: fallan.
- [ ] T-101 — Cableado de migas (`onRevealFolder` → `revealFolder` + carpeta activa) y del menú ⋮ a los flujos reales (cubre RF-055, RF-062, RF-065) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src && CV --grep "0010 V-(10|11|12) "`
  - EXPECT: vitest `passed`; V-10/V-11/V-12 en verde con acciones reales (incluido Alt+← en Chromium sin salir de la bóveda).

### G · Requisitos no funcionales
- [ ] T-102 [rojo] — `e2e/content-perf.spec.ts` prueba `0010 RNF-001`: nota de ~200 KiB con 50 bloques y 5 Mermaid, 30 aperturas en lectura, p95 ≤ 150 ms hasta que el cuerpo es legible y `longtask` ≤ 200 ms por bloque (cubre RNF-001) [zona: sistema]
  - CHECK: `cd frontend && VISUAL_OUT_DIR=/tmp/s10/e2e npm run test:visual -- e2e/content-perf.spec.ts --grep "0010 RNF-001"`
  - EXPECT: imprime mediana, p95 y la tarea larga máxima; si falla, falla por la cifra (se corrige en T-103).
- [ ] T-103 — Corrección de raíz de lo que T-102 mida fuera de umbral (p. ej. render de Mermaid en serie cediendo el hilo, resaltado por lotes), sin cambiar umbrales (cubre RNF-001) [zona: pantalla]
  - CHECK: mismo que T-102 + `cd frontend && VISUAL_OUT_DIR=/tmp/s10/e2e npm run test:visual -- e2e/workspace-perf.spec.ts`
  - EXPECT: `0010 RNF-001` p95 ≤ 150 ms y ninguna `longtask` > 200 ms por bloque; RNF-001 de 0009 p95 ≤ 150 ms. Si T-102 ya pasó, se cierra con "sin cambios".
- [ ] T-104 — Presupuesto de *bundle* y red (cubre RNF-002) [zona: sistema] [P-9]
  - CHECK: `cd frontend && npm run build && npm run test:bundle && CV --grep "0010 V-15 "`
  - EXPECT: entrada ≤ 157 020 B, editor ≤ 357 388 B, chunks separados presentes y sin importación estática; V-15 en verde. Cifras en `history.md`.
- [ ] T-105 [rojo→verde] — `editor/securityGuard.test.ts`: ningún `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`dangerouslySetInnerHTML` en `src/`; mutante (no commiteado) con `innerHTML` en `codeBlockView.ts` lo detecta (cubre RNF-003) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/securityGuard.test.ts src/editor/mermaid src/editor/PropertiesPanel.test.tsx src/editor/MilkdownView.test.tsx`
  - EXPECT: `passed`; con el mutante, 1 failed (salida pegada en `history.md`).

### H · Validación del experto-ux-ui con `ui-ux-pro-max`
- [ ] T-106 — El experto-ux-ui ejecuta la skill `ui-ux-pro-max` (ruta absoluta del checkout principal, ADR-005) como validador: `python3 /mnt/disco2/cjhirashi-data/proyectos/synapse/.claude/skills/ui-ux-pro-max/scripts/search.py "<consulta>" --domain ux -n 3` para contraste, foco visible, teclado, objetivos táctiles, reduced-motion, tablas con scroll, migas, menús y errores de formulario; contrasta cada regla con las capturas `/tmp/s10/e2e/*` (claro/oscuro, 1440/1024/390), el árbol de accesibilidad de Chromium (`page.accessibility.snapshot()` de cabecera, panel, formulario, bloque, diagrama, menú, árbol) y un recorrido sólo con teclado (cubre RNF-004, RNF-005, RF-061, RF-063) [zona: sistema]
  - CHECK: `grep -c "search.py" .harness/memory/history.md && ls /tmp/s10/ux/validacion-0010.md`
  - EXPECT: cada comando de la skill con su **salida literal** pegada en `history.md` (≥ 8 consultas) y el informe con hallazgos por severidad Critical/High/Medium/Low (o "sin hallazgos") por componente.
- [ ] T-107 — Corregir desde la raíz los hallazgos de T-106 (uno por sub-entrada, con test o medida que lo fija) y re-validación del experto sobre lo corregido (cubre RNF-004) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src && CV`
  - EXPECT: todo en verde; el experto confirma en `history.md` 0 Critical/High abiertos.

### I · Documentación (PLAN-0010 §8, una tarea por fila)
- [ ] T-108 — `contracts/frontmatter-yaml.cases.json`: confirmar que el contrato del plan sigue siendo el que recorre `frontmatter.test.ts` (o actualizarlo si F encontró un caso nuevo, con su test) [doc]
  - CHECK: `git diff --stat 03f20c2 -- .harness/specs/0010-contenido-markdown-completo/contracts/ && cd frontend && npx vitest run src/editor/frontmatter.test.ts`
  - EXPECT: diff vacío o justificado en `history.md`; `passed`.
- [ ] T-109 — Fila `note.schema.json`: comprobar que el delta de T-067 es exactamente el de PLAN-0010 §4 [doc]
  - CHECK: `git diff 03f20c2 -- .harness/specs/0008-vault-editor/contracts/note.schema.json | grep -c "\[mM\]\[dD\]"`
  - EXPECT: `1` (patrón nuevo) y la descripción ampliada.
- [ ] T-110 — `.harness/decisions/ADR-006-extension-tokens-contenido.md`: 6 tokens, motivo (contraste del claro), valores, alternativa descartada, regla "`--accent`/`--text-muted` no son texto", efecto en 1.1.4.1, aprobación GATE 2 (P-1) [doc]
  - CHECK: `grep -c -- "--success-text\|--warning-text\|--info-text\|--danger-text\|--border-control\|--radius-xs" .harness/decisions/ADR-006-extension-tokens-contenido.md`
  - EXPECT: ≥ 6.
- [ ] T-111 — `diseño/1.1.4 - Diseño UI-UX/1.1.4.1 - Sistema de Diseño.md` (no versionado) actualizado en el **checkout principal** con los 6 tokens y la regla de texto; diff pegado en `history.md` [doc]
  - CHECK: `grep -c -- "--success-text" "/mnt/disco2/cjhirashi-data/proyectos/synapse/diseño/1.1.4 - Diseño UI-UX/1.1.4.1 - Sistema de Diseño.md" && grep -c "1.1.4.1" .harness/memory/history.md`
  - EXPECT: ≥ 1 en ambos.
- [ ] T-112 — `backend/README.md` §Sincronización: regla del último segmento ≠ `.md` [doc]
  - CHECK: `grep -n "\.md" backend/README.md | grep -ci "segmento"`
  - EXPECT: ≥ 1.
- [ ] T-113 — `backend/app/core/README.md`: `check_path` con la regla nueva [doc]
  - CHECK: `grep -n "check_path" backend/app/core/README.md | grep -c "\.md"`
  - EXPECT: ≥ 1.
- [ ] T-114 — `backend/tests/README.md`: casos nuevos de `path` en `note_rules_cases.json` [doc]
  - CHECK: `grep -c "X/.md\|\.md" backend/tests/README.md`
  - EXPECT: ≥ 1 línea nueva (diff no vacío).
- [ ] T-115 — `frontend/README.md`: dependencias nuevas, `npm run test:bundle`, `VISUAL_OUT_DIR=/tmp/s10/e2e`, `content-visual`/`content-perf` [doc]
  - CHECK: `grep -c "test:bundle\|content-visual\|content-perf" frontend/README.md`
  - EXPECT: ≥ 3.
- [ ] T-116 — `frontend/src/README.md`: módulos nuevos (`folders`, `noteHistory`, `frontmatter`, `properties`, `breadcrumb`, `highlight/`, `mermaid/`, *node views*, `Notice`, `NoteMenu`, `NoteBreadcrumb`), sesión D1, carpeta activa, historial, carga diferida [doc]
  - CHECK: `grep -c "noteHistory\|frontmatter.ts\|NoteBreadcrumb\|codeBlockView\|highlight/" frontend/src/README.md`
  - EXPECT: ≥ 5.
- [ ] T-117 — Re-anclajes de cierre en `0007`, `0008` y `0009` `spec.md` (ancla al commit de cierre) [doc] [P-15]
  - CHECK: `bash .harness/gate/check.sh | grep -E "0007-fastapi|0008-vault|0009-rediseno"`
  - EXPECT: las tres en ✅ "sin cambios en covers desde <commit de cierre>".
- [ ] T-118 — `0008-vault-editor/diagrams/` y `ARCHIFY.md`: verificar que no cambian (el flujo de datos de nota es el mismo) [doc]
  - CHECK: `git diff --stat 03f20c2 -- .harness/specs/0008-vault-editor/diagrams/ ARCHIFY.md`
  - EXPECT: sin cambios; entrada en `history.md` con la verificación.
- [ ] T-119 — `.harness/memory/state.md`: estado de 0010 y backlog C-13/C-14 (botón primario 3,68:1, bordes de input globales) [doc]
  - CHECK: `grep -c "0010\|C-13\|C-14" .harness/memory/state.md`
  - EXPECT: ≥ 3.

### J · Verificación completa y suites finales
- [ ] T-120 — Verificación en navegador completa: `content-visual` (0010 V-0…V-15) + suite de 0009 (V-16) en claro/oscuro a 1440/1024/390; capturas finales leídas lado a lado con `mockup-*`, `obsidian-breadcrumb.png` y `career-*` (cubre RF-041, RNF-005 y todos los RF de percepción) [zona: sistema]
  - CHECK: `cd frontend && VISUAL_OUT_DIR=/tmp/s10/e2e npm run test:visual`
  - EXPECT: `passed` en todo (42 de 0009 + los de 0010), 0 failed; comparación descrita en `history.md`.
- [ ] T-121 — Suites finales del frontend: vitest, typecheck, `test:sync`, `test:perf`, `test:bundle`, y `git diff --stat 03f20c2` sobre tests de 0008/0009 limitado a los cambios explícitos de RF-041 (cubre RF-041, RNF-001, RNF-002) [zona: sistema]
  - CHECK: `cd frontend && npx vitest run && npm run typecheck && npm run test:sync && npm run test:perf && npm run build && npm run test:bundle && git diff --stat 03f20c2 -- src/editor/NoteEditor*.test.tsx src/notes/*.test.tsx src/notes/*.test.ts`
  - EXPECT: 0 failed en todo; el diff de tests de 0008/0009 sólo en `NoteEditor.test.tsx`, `VaultWorkspacePage.test.tsx`, `NoteSidebar.test.tsx`, `noteRules.test.ts`, `noteStore.test.ts`, `layoutCss.test.ts`, `untitled.test.ts`, `notes.integration.test.ts` (ampliaciones o cambios de RF-041).
- [ ] T-122 — Suite final del backend, **sola** contra `:15984`, y gate (cubre RF-007) [zona: sistema]
  - CHECK: `(cd backend && python3 -m pytest -q) && bash .harness/gate/check.sh`
  - EXPECT: `1135 + n passed`, 0 failed, cobertura ≥ 80 %; gate "Compuerta abierta" con 0 error.
- [ ] T-123 — Comparación de capturas RNF-005 presentada a AIRA para su aprobación (no la marca el agente) y entrada Session-End en `history.md` (cubre RNF-005) [zona: sistema]
  - CHECK: `grep -c "RNF-005" .harness/memory/history.md`
  - EXPECT: entrada con el veredicto de AIRA; sin él la feature no pasa de `implemented`.

## Cobertura (el gate exige 100 %; `Estado` lo rellena el gate)
| RF / doc | Tareas | Test(s) | Estado |
|---|---|---|---|
| RF-001 | T-070, T-071, T-072, T-073, T-074, T-075, T-120, T-121 | notes/noteStore.test.ts, notes/untitled.test.ts, notes/folders.test.ts, notes/NoteSidebar.test.tsx; V-12. | Pendiente |
| RF-002 | T-015, T-044, T-045, T-074, T-075, T-120, T-121 | notes/NoteSidebar.test.tsx; V-12. | Pendiente |
| RF-003 | T-070, T-071, T-072, T-073, T-074, T-075, T-120, T-121 | notes/NoteSidebar.test.tsx, notes/noteStore.test.ts; V-12. | Pendiente |
| RF-004 | T-070, T-071, T-073, T-074, T-075, T-120, T-121 | notes/folders.test.ts, notes/NoteSidebar.test.tsx. | Pendiente |
| RF-005 | T-070, T-071, T-073, T-074, T-075, T-120, T-121 | notes/folders.test.ts, notes/NoteSidebar.test.tsx; V-12. | Pendiente |
| RF-006 | T-015, T-044, T-045, T-120, T-121 | notes/NoteSidebar.test.tsx; V-12. | Pendiente |
| RF-007 | T-004, T-063, T-064, T-065, T-066, T-067, T-068, T-069, T-072, T-073, T-120, T-121, T-122 | backend/tests/fixtures/note_rules_cases.json, backend/tests/test_note_rules.py, backend/tests/test_note_contract.py, backend/tests/test_note_sync_push… | Pendiente |
| RF-008 | T-024, T-025, T-072, T-073, T-076, T-077, T-120, T-121 | notes/noteStore.test.ts, editor/NoteEditorFrontmatter.test.tsx, notes/VaultWorkspacePage.test.tsx. | Pendiente |
| RF-009 | T-009, T-013, T-020, T-021, T-047, T-120, T-121 | editor/PropertiesPanel.test.tsx, editor/properties.test.ts; V-1. | Pendiente |
| RF-010 | T-020, T-021, T-022, T-023, T-120, T-121 | editor/PropertiesPanel.test.tsx, editor/PropertiesForm.test.tsx; V-1, V-2. | Pendiente |
| RF-011 | T-013, T-022, T-023, T-120, T-121 | editor/PropertiesForm.test.tsx, editor/properties.test.ts; V-2. | Pendiente |
| RF-012 | T-054, T-055, T-056, T-057, T-120, T-121 | editor/NoteEditorFrontmatter.test.tsx, notes/noteStore.test.ts. | Pendiente |
| RF-013 | T-020, T-021, T-022, T-023, T-120, T-121 | editor/properties.test.ts, editor/PropertiesForm.test.tsx, editor/NoteEditorFrontmatter.test.tsx (guardar desde Visual conserva el valor). | Pendiente |
| RF-014 | T-052, T-053, T-056, T-057, T-120, T-121 | editor/frontmatter.test.ts (sección compose), editor/NoteEditorFrontmatter.test.tsx; contrato contracts/frontmatter-yaml.cases.json. | Pendiente |
| RF-015 | T-052, T-053, T-058, T-059, T-120, T-121 | editor/frontmatter.test.ts (sección split), editor/NoteEditorFrontmatter.test.tsx. | Pendiente |
| RF-016 | T-052, T-053, T-056, T-057, T-120, T-121 | editor/frontmatter.test.ts (sección roundtrip), editor/NoteEditorFrontmatter.test.tsx (abrir en Código, alternar, guardar sin cambios → documento idén… | Pendiente |
| RF-017 | T-024, T-025, T-052, T-053, T-058, T-059, T-120, T-121 | editor/frontmatter.test.ts (sección parse), editor/NoteEditorFrontmatter.test.tsx, editor/CodeView.test.tsx. | Pendiente |
| RF-018 | T-052, T-053, T-120, T-121 | editor/frontmatter.test.ts; contrato contracts/frontmatter-yaml.cases.json (fechas, yes/no/on, números, listas, complejos). | Pendiente |
| RF-019 | T-024, T-025, T-054, T-055, T-058, T-059, T-120, T-121 | notes/noteStore.test.ts, editor/NoteEditorFrontmatter.test.tsx. | Pendiente |
| RF-020 | T-056, T-057, T-060, T-061, T-120, T-121 | editor/NoteEditorFrontmatter.test.tsx (guardar desde Visual no toca el YAML de content; frontmatter cambia sólo por el formulario), editor/MilkdownVie… | Pendiente |
| RF-021 | T-056, T-057, T-120, T-121 | editor/NoteEditorFrontmatter.test.tsx. | Pendiente |
| RF-022 | T-054, T-055, T-062, T-120, T-121 | notes/noteStore.test.ts (rama con frontmatter), notes/mergeNote.test.ts y sync/conflicts.test.ts (existentes, sin cambios: lo confirma git diff --stat… | Pendiente |
| RF-023 | T-051, T-078, T-079, T-120, T-121 | editor/MilkdownView.test.tsx (tabla, listas, énfasis pegados como estructura; enlace pegado con javascript: sin href). | Pendiente |
| RF-024 | T-078, T-079, T-120, T-121 | editor/MilkdownView.test.tsx (texto pegado = texto del documento, carácter a carácter, para filas desiguales y sin separador). | Pendiente |
| RF-025 | T-080, T-081, T-120, T-121 | editor/MilkdownView.test.tsx, editor/NoteEditor.test.tsx; V-4. | Pendiente |
| RF-026 | T-008, T-013, T-031, T-032, T-047, T-120, T-121 | notes/layoutCss.test.ts (regla presente); V-4 (≤ 40 px medido). | Pendiente |
| RF-027 | T-014, T-051, T-084, T-085, T-120, T-121 | editor/highlight/proseHighlight.test.ts, editor/MilkdownView.test.tsx; V-5. | Pendiente |
| RF-028 | T-084, T-085, T-120, T-121 | editor/highlight/proseHighlight.test.ts (editar actualiza clases); V-5. | Pendiente |
| RF-029 | T-009, T-014, T-034, T-035, T-058, T-059, T-086, T-087, T-120, T-121 | editor/CodeView.test.tsx; V-6. | Pendiente |
| RF-030 | T-084, T-085, T-086, T-087, T-120, T-121 | editor/highlight/languages.test.ts; V-5 (un sx-* por lenguaje). | Pendiente |
| RF-031 | T-084, T-085, T-120, T-121 | editor/highlight/proseHighlight.test.ts (sin excepción, sin console.error); V-5. | Pendiente |
| RF-032 | T-084, T-085, T-120, T-121 | editor/highlight/proseHighlight.test.ts; V-15 (chunk abortado). | Pendiente |
| RF-033 | T-008, T-014, T-026, T-027, T-028, T-120, T-121 | editor/codeBlockView.test.ts; V-5, V-7. | Pendiente |
| RF-034 | T-026, T-027, T-120, T-121 | editor/codeBlockView.test.ts (texto exacto, mermaid copia la fuente). | Pendiente |
| RF-035 | T-026, T-027, T-120, T-121 | editor/codeBlockView.test.ts. | Pendiente |
| RF-036 | T-026, T-027, T-120, T-121 | editor/MilkdownView.test.tsx (serializar tras montar y tras editar otra parte = entrada, sin rastro de etiqueta/botón/SVG). | Pendiente |
| RF-037 | T-009, T-013, T-031, T-032, T-047, T-120, T-121 | notes/layoutCss.test.ts, editor/contrast.test.ts; V-3 (R-5). | Pendiente |
| RF-038 | T-009, T-013, T-031, T-032, T-120, T-121 | notes/layoutCss.test.ts, editor/contrast.test.ts; V-3 (R-6). | Pendiente |
| RF-039 | T-013, T-031, T-033, T-082, T-083, T-120, T-121 | editor/taskItemView.test.ts, editor/MilkdownView.test.tsx (alternar marca sucio; serializa - [x]); V-3 (R-10). | Pendiente |
| RF-040 | T-016, T-018, T-019, T-028, T-035, T-046, T-120, T-121 | editor/contrast.test.ts, notes/layoutCss.test.ts (sin literales), editor/mermaid/themeVariables.test.ts; V-13, V-7. | Pendiente |
| RF-041 | T-002, T-003, T-042, T-044, T-120, T-121 | Cambios **explícitos** de tests de 0008/0009 (los únicos permitidos): (1) el h2 del editor pasa de la ruta sin .md (Carpeta/Nota) al **nombre** (Nota)… | Pendiente |
| RF-042 | T-070, T-071, T-074, T-075, T-120, T-121 | notes/VaultWorkspacePage.test.tsx, notes/NoteSidebar.test.tsx, notes/folders.test.ts. | Pendiente |
| RF-043 | T-015, T-044, T-045, T-074, T-075, T-120, T-121 | notes/NoteSidebar.test.tsx; V-12 (R-14). | Pendiente |
| RF-044 | T-024, T-025, T-052, T-053, T-060, T-061, T-120, T-121 | editor/frontmatter.test.ts (sección legacy), editor/NoteEditorFrontmatter.test.tsx. | Pendiente |
| RF-045 | T-024, T-025, T-052, T-053, T-060, T-061, T-120, T-121 | editor/frontmatter.test.ts (sección legacy), editor/NoteEditorFrontmatter.test.tsx (byte a byte tras editar en Visual; corrompido = punto fijo). | Pendiente |
| RF-046 | T-008, T-014, T-029, T-030, T-051, T-090, T-091, T-120, T-121 | editor/codeBlockView.test.ts, editor/mermaid/renderMermaid.test.ts; V-7. | Pendiente |
| RF-047 | T-029, T-030, T-092, T-093, T-120, T-121 | editor/codeBlockView.test.ts (temporizadores falsos: ≤ 500 ms); V-7. | Pendiente |
| RF-048 | T-092, T-093, T-120, T-121 | editor/CodeView.test.tsx (sin svg ni carga de mermaid). | Pendiente |
| RF-049 | T-014, T-029, T-030, T-090, T-091, T-120, T-121 | editor/mermaid/renderMermaid.test.ts, editor/codeBlockView.test.ts; V-8. | Pendiente |
| RF-050 | T-088, T-089, T-090, T-091, T-120, T-121 | editor/mermaid/themeVariables.test.ts, editor/mermaid/renderMermaid.test.ts; V-7 (cambio de tema sin recargar). | Pendiente |
| RF-051 | T-090, T-091, T-120, T-121 | editor/mermaid/renderMermaid.test.ts (fuentes con %%{init: {"securityLevel":"loose"}}%%, click A call f(), click A href "javascript:…", config: de tem… | Pendiente |
| RF-052 | T-008, T-014, T-029, T-030, T-051, T-094, T-095, T-120, T-121 | editor/codeBlockView.test.ts (controles sólo si excede, límites deshabilitan); V-9. | Pendiente |
| RF-053 | T-014, T-029, T-030, T-090, T-091, T-120, T-121 | editor/mermaid/renderMermaid.test.ts; V-8. | Pendiente |
| RF-054 | T-011, T-015, T-036, T-037, T-038, T-039, T-042, T-043, T-047, T-120, T-121 | editor/NoteBreadcrumb.test.tsx, editor/breadcrumb.test.ts; V-10. | Pendiente |
| RF-055 | T-074, T-075, T-100, T-101, T-120, T-121 | notes/VaultWorkspacePage.test.tsx, notes/NoteSidebar.test.tsx; V-10, V-12. | Pendiente |
| RF-056 | T-011, T-015, T-042, T-043, T-098, T-099, T-120, T-121 | notes/VaultWorkspacePage.test.tsx, editor/NoteEditor.test.tsx; V-10. | Pendiente |
| RF-057 | T-096, T-097, T-098, T-099, T-120, T-121 | notes/noteHistory.test.ts, notes/VaultWorkspacePage.test.tsx (sobrevive a desmontar/montar con el mismo sessionStorage; otra bóveda, otra clave). | Pendiente |
| RF-058 | T-096, T-097, T-098, T-099, T-120, T-121 | notes/noteHistory.test.ts, notes/VaultWorkspacePage.test.tsx (borrada se salta; renombrada navegable). | Pendiente |
| RF-059 | T-098, T-099, T-120, T-121 | notes/VaultWorkspacePage.test.tsx; comprobación en Chromium real dentro de V-10 (el documento no navega hacia atrás). | Pendiente |
| RF-060 | T-098, T-099, T-120, T-121 | notes/VaultWorkspacePage.test.tsx, editor/NoteEditorLeave.test.tsx (sin cambios de lo existente). | Pendiente |
| RF-061 | T-011, T-015, T-040, T-041, T-043, T-106, T-120, T-121 | editor/NoteMenu.test.tsx; V-11. | Pendiente |
| RF-062 | T-100, T-101, T-120, T-121 | editor/NoteMenu.test.tsx, notes/VaultWorkspacePage.test.tsx; V-11. | Pendiente |
| RF-063 | T-011, T-015, T-036, T-037, T-038, T-039, T-106, T-120, T-121 | editor/breadcrumb.test.ts, editor/NoteBreadcrumb.test.tsx (anchos simulados); V-10 (1440/1024/390). | Pendiente |
| RF-064 | T-003, T-015, T-042, T-043, T-047, T-120, T-121 | notes/layoutCss.test.ts; V-10 (R-1, una línea a 1440/1024/390), V-16 (R-12 de 0009). | Pendiente |
| RF-065 | T-100, T-101, T-120, T-121 | editor/NoteBreadcrumb.test.tsx, notes/VaultWorkspacePage.test.tsx (renombrar desde el menú o el árbol actualiza las migas sin recargar). | Pendiente |
| RNF-001 | T-050, T-102, T-103, T-120, T-121 | frontend/e2e/content-perf.spec.ts (nota de 200 KiB, 50 bloques, 5 Mermaid; p95 ≤ 150 ms legible; tareas largas ≤ 200 ms por bloque), editor/mermaid/re… | Pendiente |
| RNF-002 | T-000, T-001, T-016, T-017, T-051, T-104, T-120, T-121 | frontend/scripts/check-bundle.mjs (npm run test:bundle, vite.config.ts con build.manifest: true), cargas import() en editor/highlight/languages.ts, ed… | Pendiente |
| RNF-003 | T-020, T-027, T-078, T-090, T-105, T-120, T-121 | editor/securityGuard.test.ts, editor/mermaid/renderMermaid.test.ts, editor/MilkdownView.test.tsx, editor/PropertiesPanel.test.tsx (<script> y URLs com… | Pendiente |
| RNF-004 | T-016, T-018, T-019, T-046, T-106, T-107, T-120, T-121 | Contraste: editor/contrast.test.ts (§5.5); teclado y nombres: tests de componentes con getByRole; diagramas con role="img" + nombre (editor/codeBlockV… | Pendiente |
| RNF-005 | T-008, T-009, T-012, T-047, T-048, T-049, T-106, T-120, T-121, T-123 | frontend/e2e/content-visual.spec.ts (V-1…V-16, claro/oscuro, 1440/1024/390) + frontend/e2e/fixtures.ts (seedContent) + capturas de referencia (§5.2, P… | Pendiente |
| doc: contracts/frontmatter-yaml.cases.json | T-052, T-108 | frontmatter.test.ts | Pendiente |
| doc: 0008 note.schema.json (delta de path) | T-064, T-067, T-109 | test_note_contract.py | Pendiente |
| doc: ADR-006 extensión de tokens | T-019, T-110 | contrast.test.ts | Pendiente |
| doc: diseño/1.1.4.1 (no versionado) | T-111 | — | Pendiente |
| doc: backend/README.md | T-112 | — | Pendiente |
| doc: backend/app/core/README.md | T-113 | — | Pendiente |
| doc: backend/tests/README.md | T-114 | — | Pendiente |
| doc: frontend/README.md | T-115 | — | Pendiente |
| doc: frontend/src/README.md | T-116 | — | Pendiente |
| doc: 0007/0008/0009 spec.md (re-anclajes) | T-005, T-006, T-007, T-117 | gate (drift) | Pendiente |
| doc: 0008 diagrams / ARCHIFY.md (sin cambio) | T-118 | — | Pendiente |
| doc: .harness/memory/state.md | T-119 | — | Pendiente |
| doc: plan.md (enmienda P-17 y medidas de referencia) | T-010, T-011 | — | Pendiente |

> Esta tabla **es** la trazabilidad de la feature (no hay `traceability-matrix.md`).
> Fila sin test, en `Fail` o `Pendiente` → el gate no abre cuando la spec pase a `implemented`.
> T-120/T-121 (verificación final en navegador y suites) cubren todos los requisitos como no regresión.
