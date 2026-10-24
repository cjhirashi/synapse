---
id: SPEC-0010
tipo: spec
feature: 0010-contenido-markdown-completo
estado: draft            # draft | in-review | approved | implemented | verified | deprecated
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: 09bd982   # HEAD de feature/sprint-1-auth al abrir la Fase 1 (2026-10-24)
anchor_mode: advisory
covers:                  # BORRADOR: lo fija el PLAN-0010 (archivos con dueño anterior: 0008/0009)
  # frontend — editor (propiedades, tablas, resaltado, estilos)
  - frontend/src/editor/**
  - frontend/src/styles/tokens.css
  # frontend — carpetas y reglas de ruta
  - frontend/src/notes/NoteSidebar.tsx
  - frontend/src/notes/noteStore.ts
  - frontend/src/notes/noteRules.ts
  - frontend/src/notes/messages.ts
  - frontend/src/notes/untitled.ts
  - frontend/src/notes/notes.css
  - frontend/src/notes/*.test.ts
  - frontend/src/notes/*.test.tsx
  # dependencias nuevas (plugin de portapapeles, YAML, resaltador)
  - frontend/package.json
  - frontend/package-lock.json
  # sistema — fidelidad visual y rendimiento en navegador real
  - frontend/e2e/**
  # backend — regla de ruta compartida (RF-007)
  - backend/app/core/note_rules.py
  - backend/tests/test_note_rules.py
  - backend/tests/fixtures/note_rules_cases.json
  # contratos
  - .harness/specs/0010-contenido-markdown-completo/contracts/**
  - .harness/specs/0008-vault-editor/contracts/note.schema.json
  # documentación
  - frontend/README.md
  - frontend/src/README.md
  - backend/app/core/README.md
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: pendiente
  fase_2: pendiente
actualizado: 2026-10-24
---

# SPEC-0010 · Contenido Markdown completo

> Redactada a partir de la evidencia en Chromium real (capturas en `/tmp/s10/shots/`)
> sobre el editor de SPEC-0008/0009, con `cjhirashi-career-admin`
> (`CareerResourceView.tsx:483-489`, `index.css:278-560`) como referencia de calidad y el
> mockup `diseño/1.1.4 - Diseño UI-UX/1.1.4.4 - Vista - Editor Principal.html` como
> referencia visual. Las decisiones de producto D1…D5 las tomó **AIRA con autoridad
> delegada por Carlos (2026-10-24)** y están en §6 con su descarte. Quedan
> **2 marcadores abiertos** nuevos (NC-1, NC-2) que esas decisiones no resuelven (ver al final).

## 1. Contexto del dominio

Un usuario de Synapse no puede usar sus notas "como Obsidian": las carpetas existen pero
no se descubren, las propiedades (frontmatter) se corrompen al editar en Visual, las
tablas no se pueden pegar ni insertar y el código no se resalta.

- **Corrupción de datos (prioridad):** el objeto `frontmatter` de SPEC-0008 §3 existe en
  el modelo y viaja por `/sync`, pero ninguna vista lo muestra. Si el usuario escribe un
  bloque YAML `---…---` en el contenido, Milkdown (sin soporte de frontmatter) lo lee
  como regla horizontal + H2 y al guardar desde Visual lo destruye (`***`,
  `tags: \[a, b]`).
- **Bug de rutas:** el título `CarpetaVacia/` produce la ruta `CarpetaVacia/.md`
  (`noteStore.ts:105` `titleToPath` añade `.md` a un último segmento vacío y
  `noteRules.ts:72` `checkPath` lo acepta porque el segmento ya no está vacío), y esa nota
  se sincroniza.
- **Límites:** frontend (Milkdown 7.22.3 + CodeMirror 6, ADR-010), reglas compartidas de
  nota cliente/servidor (`noteRules.ts` ↔ `core/note_rules.py`, batería común
  `note_rules_cases.json`) y el contrato `note.schema.json` de 0008. Sin endpoints nuevos:
  las notas siguen viajando sólo por `/sync` (P-1 de 0008).

## 2. Alcance

### En alcance
- **Carpetas (D3):** "Nueva nota" dentro de la carpeta de destino, acción "Nueva carpeta",
  pista visible de que `/` anida, corrección del bug de `.md` en cliente y servidor.
- **Propiedades (D1, D2):** panel en lectura, formulario clave/valor en Visual, bloque
  YAML en Código; el `frontmatter` (objeto JSON) es la única fuente de verdad y `content`
  nunca guarda el YAML.
- **Tablas (D4c):** pegar markdown de tabla en Visual, comando/botón "Insertar tabla",
  filas compactas.
- **Resaltado de sintaxis** de bloques de código en lectura, Visual y Código, más el
  coloreado del propio markdown en Código (como el mockup, `.cm-h1`…`.cm-code`).
- **Bloques de código (D4b):** etiqueta de lenguaje y botón "Copiar", como career-admin.
- **Estilos del mockup (D4a):** cita, código en línea, casillas de tareas.
- Tema claro y oscuro sólo con tokens de `tokens.css`.

### Fuera de alcance
- Mermaid y cualquier diagrama renderizado (D4).
- Migrar de Milkdown/CodeMirror: ADR-010 se mantiene (D4).
- Subir imágenes (D4).
- Wikilinks `[[…]]` (pendiente aparte de 0008, backlog 11a).
- Carpetas vacías o documento `folder:*` (D3; 0008 §6).
- Conservar comentarios y formato literal del YAML: la verdad es el objeto JSON (D1), el
  YAML se regenera al mostrarlo (ver §5 y §6).
- Validar el tipo de las propiedades en el push del servidor (ver §3 y §6).
- Fusión automática de conflictos en `frontmatter`: sigue manual (RF-009 de 0008).
- Enlaces automáticos dentro de los valores de propiedades (se muestran como texto).

## 3. Modelo de datos y contratos de E/S

**Sin campo nuevo en el modelo.** Se reutiliza `frontmatter` (objeto JSON opcional,
≤ 64 KiB en JSON compacto UTF-8, PLAN-0008 P-4) de `note:{vault}:{uuid}`.

| Frontera | Dirección | Tipo | Contrato en `contracts/` |
|---|---|---|---|
| `note.frontmatter` (objeto; sin cambio de forma) | entrada/salida | `/sync` (push validado, pull) | `0008-vault-editor/contracts/note.schema.json#/properties/frontmatter` (sin cambio) |
| `note.path`: se añade "último segmento ≠ `.md`" (sin distinguir mayúsculas) | entrada | `/sync` (push validado) | `0008-vault-editor/contracts/note.schema.json#/properties/path` (patrón ampliado; re-export) |
| Bloque YAML de la vista Código ↔ `frontmatter` | interna (cliente) | conversión YAML 1.2 (esquema core) ↔ JSON | por crear en Fase 2 (tabla de tipos de RF-018); hasta entonces, RF-018 es el contrato |

- **Tipos de valor que la UI edita en el formulario:** string, número finito, booleano y
  lista de strings. Cualquier otro valor JSON válido (`null`, objeto anidado, lista con
  elementos que no son string) es un **valor complejo**: se conserva sin cambios, se
  muestra en sólo lectura y sólo se edita desde Código (RF-013).
- **Validación de tipos en el push: NO se añade.** El servidor sigue aceptando un objeto
  JSON libre ≤ 64 KiB sin números no finitos ni sustitutos sueltos (regla actual de
  `check_frontmatter`). Justificación: (1) las propiedades son del usuario y de sus
  agentes (OpenClaw, P-1), no un esquema del sistema; (2) el cliente ya trata de forma
  segura cualquier valor (valor complejo = texto, RF-013/RNF-003); (3) restringir tipos
  convertiría en rechazos los documentos ya replicados con objetos anidados, sin
  migración posible desde el servidor. El riesgo que mitiga una validación (inyección al
  renderizar) se cubre en el cliente con RNF-003.
- **Regla de ruta (RF-007):** cambio de contrato compartido; la batería común
  `note_rules_cases.json` añade los casos `X/.md`, `X/.MD`, `.md`, `X/ .md` (rechazados)
  y `X/a.md`, `.md/a.md` (aceptados: sólo cuenta el último segmento).
- Errores: sin errores HTTP nuevos; los rechazos del push siguen siendo
  `validation-error:path` / `validation-error:frontmatter` (SPEC-0005/0008).

## 4. Criterios de aceptación (EARS)

### Carpetas
- **RF-001** — CUANDO el usuario crea una nota con "Nueva nota" y hay una carpeta de
  destino (definición pendiente: NC-1 en Marcadores abiertos), el sistema DEBE crearla con
  `path = "<carpeta>/<título>.md"` (el título se interpreta relativo a esa carpeta; un `/`
  en el título anida dentro de ella) o `"<carpeta>/Sin título.md"`/`"Sin título n"` libre
  si no hay título (RF-012 de 0008), y abrirla en edición.
- **RF-002** — MIENTRAS haya una carpeta de destino, el formulario "Nueva nota" DEBE
  mostrar de forma visible en qué carpeta se creará la nota.
- **RF-003** — CUANDO el usuario usa "Nueva carpeta" e introduce un nombre válido, el
  sistema DEBE crear la nota `"<destino>/<nombre>/Sin título.md"` (o el siguiente
  "Sin título n" libre en esa carpeta), mostrar la carpeta en el árbol desplegada y abrir
  la nota en edición; sin carpeta de destino, `<destino>/` es la raíz.
- **RF-004** — SI el nombre de "Nueva carpeta" queda vacío tras quitar espacios, contiene
  un segmento vacío o caracteres de control ENTONCES el sistema DEBE rechazarlo con un
  mensaje junto al campo y no crear nada.
- **RF-005** — SI ya existe una carpeta con el mismo nombre en el destino (comparación
  NFKC + casefold, igual que `pathKey`) ENTONCES "Nueva carpeta" DEBE rechazarlo con el
  mensaje "Ya existe una carpeta con ese nombre" y no crear nada.
- **RF-006** — Los campos de título de "Nueva nota", "Renombrar" y "Nueva carpeta" DEBEN
  mostrar una pista visible de que `/` crea subcarpetas, asociada al campo con
  `aria-describedby`.
- **RF-007** — SI una ruta, tras normalizar, tiene el último segmento vacío o igual a
  `.md` (sin distinguir mayúsculas) ENTONCES el cliente DEBE rechazarla al crear o
  renombrar sin escribir en la réplica, y el push DEBE rechazarla con
  `validation-error:path` (misma batería común en ambos lados).
- **RF-008** — SI una nota ya existente tiene una ruta que RF-007 rechaza ENTONCES el
  sistema DEBE listarla en el árbol, permitir abrirla y renombrarla, y al guardar su
  contenido sin renombrar DEBE mostrar un mensaje que pida renombrarla, sin perder el
  borrador.

### Propiedades
- **RF-009** — CUANDO se abre en lectura una nota con `frontmatter` no vacío, el sistema
  DEBE mostrar encima del contenido un panel de propiedades con el estilo del mockup
  (`.frontmatter` de 1.1.4.4: superficie `--surface2`, borde, radio y tipografía de
  tokens) con un par clave/valor legible por propiedad, en el orden de las claves; las
  listas de strings como elementos separados y los booleanos como casilla no interactiva;
  nunca YAML crudo.
- **RF-010** — SI `frontmatter` está ausente o es `{}` ENTONCES el sistema NO DEBE mostrar
  el panel en lectura, y en Visual DEBE mostrar sólo una acción compacta
  "Añadir propiedad".
- **RF-011** — MIENTRAS la nota esté en edición Visual, el sistema DEBE ofrecer un
  formulario de propiedades que permita añadir, quitar y editar la clave y el valor de
  cada propiedad, eligiendo el tipo entre string, número, booleano y lista de strings.
- **RF-012** — CUANDO el usuario cambia una propiedad en el formulario, el sistema DEBE
  marcar la nota con cambios sin guardar (mismas guardas de salida de 0008) y persistir el
  `frontmatter` sólo con el guardado explícito, junto con `content`.
- **RF-013** — SI una propiedad tiene un valor complejo (§3) ENTONCES el sistema DEBE
  mostrarlo como texto en sólo lectura en el panel y en el formulario, permitir quitarlo,
  y conservarlo sin cambios al guardar desde Visual.
- **RF-014** — MIENTRAS la nota esté en edición Código, el sistema DEBE presentar las
  propiedades no vacías como un bloque YAML `---`…`---` al inicio del texto, seguido del
  cuerpo; sin propiedades, el texto DEBE ser sólo el cuerpo.
- **RF-015** — CUANDO el usuario guarda desde Código, el sistema DEBE separar el bloque
  YAML inicial (línea 1 exactamente `---` hasta la siguiente línea exactamente `---`),
  guardarlo en `frontmatter` y guardar en `content` sólo el resto, sin el bloque.
- **RF-016** — CUANDO una nota con `frontmatter` F y `content` C se abre en Código (o se
  alterna Visual↔Código) y se guarda sin cambios, el sistema DEBE dejar `frontmatter`
  igual a F (mismas claves, mismo orden, mismos valores y tipos, incluidos los valores
  complejos) y `content` igual a C.
- **RF-017** — SI al guardar o al pasar de Código a Visual el bloque YAML es inválido
  (sintaxis, no es un mapa, clave duplicada, clave vacía, número no finito o entero fuera
  del rango seguro) ENTONCES el sistema NO DEBE guardar ni cambiar de vista, DEBE
  conservar todo el texto tal cual y DEBE mostrar un aviso accesible con el motivo y, si
  se conoce, la línea.
- **RF-018** — El sistema DEBE convertir el YAML con el esquema core de YAML 1.2: `true`/
  `false` → booleano; números → número; secuencias de escalares string → lista de strings;
  fechas sin comillas y `yes`/`no`/`on`/`off` → string; cualquier otro nodo → valor
  complejo equivalente en JSON.
- **RF-019** — SI el `frontmatter` resultante supera 64 KiB (regla actual) ENTONCES el
  sistema DEBE rechazar el guardado con un mensaje, conservar el texto en edición y no
  modificar la versión guardada.
- **RF-020** — Las vistas Visual y lectura NO DEBEN leer, escribir ni serializar el YAML
  dentro de `content`; guardar desde Visual DEBE cambiar `frontmatter` sólo con lo
  editado en el formulario.
- **RF-021** — CUANDO el usuario alterna Visual↔Código en edición, el sistema DEBE
  conservar las propiedades y el cuerpo no guardados entre ambas vistas.
- **RF-022** — CUANDO una nota se sincroniza (push/pull), el sistema DEBE conservar su
  `frontmatter` sin cambios; un conflicto que afecte a `frontmatter` DEBE seguir
  exponiéndose para decisión manual (RF-009 de 0008), nunca fusionarse en silencio.

### Tablas
- **RF-023** — CUANDO el usuario pega texto plano en markdown en Visual (incluida una
  tabla GFM), el sistema DEBE insertarlo como su estructura (tabla, listas, énfasis…) y no
  como texto escapado.
- **RF-024** — SI el texto pegado parece una tabla pero no es una tabla GFM válida
  ENTONCES el sistema DEBE insertarlo como texto sin perder ningún carácter.
- **RF-025** — MIENTRAS la nota esté en edición Visual, el sistema DEBE ofrecer un
  comando con botón accesible "Insertar tabla" que inserte en el cursor una tabla con
  fila de encabezado, 2 columnas y 1 fila de cuerpo.
- **RF-026** — Las filas de tabla en lectura y Visual DEBEN medir ≤ 40 px de alto con una
  sola línea de texto por celda (sin el margen de párrafo dentro de las celdas).

### Resaltado de sintaxis
- **RF-027** — CUANDO se muestra en lectura un bloque de código con un lenguaje admitido
  (RF-030), el sistema DEBE resaltar su sintaxis.
- **RF-028** — MIENTRAS la nota esté en edición Visual, el sistema DEBE resaltar los
  bloques de código con lenguaje admitido y actualizar el resaltado al editarlos.
- **RF-029** — MIENTRAS la nota esté en edición Código, el sistema DEBE resaltar los
  bloques de código cercados con lenguaje admitido y colorear la sintaxis del propio
  markdown (encabezados, negrita, enlaces, código, marcas y el bloque YAML), como el
  mockup 1.1.4.4.
- **RF-030** — El sistema DEBE admitir como mínimo `ts`/`typescript`, `js`/`javascript`,
  `tsx`, `py`/`python`, `json`, `bash`/`sh`/`shell`, `css`, `html`, `sql`, `yaml`/`yml` y
  `markdown`/`md` (sin distinguir mayúsculas).
- **RF-031** — SI un bloque no declara lenguaje o declara uno no admitido ENTONCES el
  sistema DEBE mostrarlo en monoespaciado sin resaltar, sin errores en consola ni
  excepciones.
- **RF-032** — SI la carga diferida del resaltador falla ENTONCES el sistema DEBE mostrar
  los bloques legibles sin resaltar y no bloquear la lectura ni la edición.

### Bloques de código: etiqueta y copiar
- **RF-033** — En lectura y en Visual, cada bloque de código DEBE mostrar una etiqueta con
  su lenguaje tal como está declarado, o "texto" si no declara ninguno.
- **RF-034** — CUANDO el usuario activa "Copiar" en un bloque, el sistema DEBE copiar al
  portapapeles exactamente el código del bloque (sin etiqueta) y anunciar "Copiado" en una
  región `aria-live`.
- **RF-035** — SI el portapapeles no está disponible o falla ENTONCES el sistema DEBE
  mostrar un mensaje de error en el bloque sin lanzar excepción.
- **RF-036** — La etiqueta y el botón "Copiar" NO DEBEN formar parte del markdown: guardar
  desde Visual DEBE dejar `content` sin rastro de ellos.

### Estilos del mockup y temas
- **RF-037** — Las citas en lectura y Visual DEBEN mostrarse con borde izquierdo de 3 px
  en `--accent`, fondo `--accent-soft`, cursiva y radio `--radius-sm` en el lado derecho
  (`.read-view blockquote` de 1.1.4.4).
- **RF-038** — El código en línea en lectura y Visual DEBE mostrarse con fondo
  `--surface2`, color `--accent-hover` y fuente monoespaciada (`.read-view code`).
- **RF-039** — Las tareas GFM (`- [ ]`, `- [x]`) DEBEN mostrarse con casilla; en lectura
  la casilla NO DEBE ser interactiva; en Visual, CUANDO el usuario la alterna, el sistema
  DEBE cambiar el estado de la tarea y marcar la nota con cambios sin guardar.
- **RF-040** — DONDE el tema activo sea claro u oscuro, todo color de esta feature
  (panel, formulario, tablas, resaltado, etiqueta, cita, código, casillas) DEBE salir de
  propiedades de `tokens.css` definidas en ambos temas, sin literales de color.

### No regresión
- **RF-041** — El cambio NO DEBE alterar ningún `role`/`aria-*` ni selector usado por los
  tests de SPEC-0008 y SPEC-0009 salvo que la tarea correspondiente actualice ese test
  explícitamente, y las suites de ambas (vitest, `test:sync`, `test:visual`, backend)
  DEBEN seguir en verde.

## 5. Casos límite y manejo de errores

- **Claves duplicadas en YAML** (`a: 1` dos veces): inválido, no "gana la última" en
  silencio → RF-017.
- **Claves vacías:** en YAML (`"": x`) → RF-017; en el formulario, una fila con clave
  vacía o repetida bloquea el guardado con mensaje en la fila (mismo criterio que RF-017).
- **Valores multilínea** (`|`, `>` o string con `\n`): son strings; el panel conserva los
  saltos de línea y el formulario los edita sin perderlos (RF-016).
- **`---` en el cuerpo que no es frontmatter:** sólo cuenta como frontmatter un bloque
  que empieza en la línea 1 exacta (RF-015); un `---` posterior es una regla horizontal
  del cuerpo y queda en `content`. Visual serializa las reglas como `***`, así que un
  cuerpo editado en Visual no empieza por `---`.
- **Comentarios y formato del YAML:** se pierden al guardar (el YAML se regenera desde el
  objeto, D1); los datos no (RF-016). Fuera de alcance conservarlos.
- **Notas con YAML ya dentro de `content`** (escrito en Código antes de esta feature, o
  ya corrompido a `***`/`\[…]`): ver NC-2 en Marcadores abiertos. El texto ya
  corrompido no se puede reconstruir de forma fiable y queda como cuerpo.
- **Pegar una tabla mal formada** (filas con distinto número de celdas, sin separador
  `|---|`): RF-024.
- **Lenguaje desconocido o vacío** (` ```foo `, ` ``` `): RF-031; etiqueta según RF-033.
- **Código con `<script>` o HTML** dentro de un bloque o una propiedad: se muestra
  literal (RNF-003).
- **Ruta `Carpeta/` o `Carpeta/.md`:** RF-007; notas antiguas con esa ruta: RF-008.
- **`frontmatter` > 64 KiB al editar:** RF-019; números `.inf`/`.nan`/`1e999`: RF-017.
- **Carga del resaltador fallida u offline sin caché:** RF-032.

## 6. Registro de decisiones y descartes

| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| D1 · `frontmatter` (objeto JSON de 0008) es la única fuente de verdad; Código lo presenta como YAML, al guardar se separa y `content` nunca guarda el YAML; Visual y lectura no tocan el YAML | Corrige la corrupción desde la raíz (Milkdown no entiende frontmatter); una sola verdad. AIRA por delegación de Carlos, 2026-10-24 | Guardar el YAML dentro de `content` (duplica la verdad) | — |
| D2 · Panel de propiedades: caja con el estilo del mockup y pares legibles en lectura; formulario clave/valor en Visual (como Obsidian); YAML en Código; sin propiedades, sin panel | Legible y editable sin YAML para el usuario medio. AIRA, 2026-10-24 | YAML literal de sólo lectura | — |
| D3 · Carpetas = prefijos de `path` (0008 §6); "Nueva carpeta" crea `Carpeta/Sin título.md`; "Nueva nota" dentro de la carpeta seleccionada; pista de `/`; rechazar último segmento vacío o `.md` | No toca `/sync` ni reabre 0008. AIRA, 2026-10-24 | Documento `folder:*` (toca `/sync` y revierte 0008) | — |
| D4 · Incluidos estilos del mockup, etiqueta + copiar, pegar/insertar tablas; fuera Mermaid, migrar de editor, imágenes, wikilinks | Cerrar las brechas vistas en navegador sin abrir frentes nuevos; ADR-010 se mantiene. AIRA, 2026-10-24 | Incluir Mermaid/diagramas o cambiar de editor | ADR-010 |
| D5 · No `verified` sin comparación por capturas contra 1.1.4.4 en ambos temas (RNF-005) | Pedido explícito de Carlos; `method.md` v1.9 Fase 4/Gate 4 | Cerrar sólo con tests funcionales | — |
| Valores complejos (`null`, objeto anidado, lista no-string) se conservan y se editan sólo en Código (RF-013) | Ninguna vista destruye datos que no sabe editar; los agentes pueden escribir cualquier JSON | Rechazar o aplanar los valores complejos | — |
| Sin validación de tipos de `frontmatter` en el push (§3) | Propiedades del usuario/agentes, no esquema del sistema; evita rechazar documentos ya replicados; el riesgo de render lo cubre RNF-003 | Validar los 4 tipos en `check_frontmatter` | — |
| YAML 1.2 core (fechas y `yes`/`no` → string) (RF-018) | JSON no tiene fecha; YAML 1.1 convertiría `no` (p. ej. un código de país) en `false` en silencio | YAML 1.1 por defecto de muchas librerías | — |
| Claves duplicadas = YAML inválido (RF-017) | "Gana la última" pierde datos sin avisar | Aceptar la última clave | — |
| "Nueva carpeta" con nombre existente se rechaza (RF-005) | La intención "nueva" no se cumple en silencio; como Obsidian | Crear "Sin título" en la carpeta existente | — |
| Título de "Nueva nota" relativo a la carpeta de destino (RF-001) | Coherente con "crear dentro de la carpeta seleccionada" | Título siempre absoluto desde la raíz | — |
| La regla del `.md` va también al servidor (RF-007) y las notas antiguas afectadas se renombran (RF-008) | Cliente y servidor comparten reglas y batería (0008); sólo cliente dejaría pasar a otros clientes | Corregir sólo `titleToPath` en el cliente | — |
| Pegar markdown en Visual lo interpreta en general, no sólo tablas (RF-023) | El plugin de portapapeles de Milkdown interpreta todo el markdown pegado; tratar sólo tablas sería un caso especial artificial | Interpretar sólo tablas | ADR-010 |
| Casillas no interactivas en lectura, interactivas en Visual (RF-039) | Lectura nunca modifica la nota (RF-007 de 0008) | Casillas interactivas en lectura con guardado implícito | — |
| Topes medibles de RNF-002 (entrada +≤ 15 KiB gzip) y RF-026 (≤ 40 px) | Propuesta del autor de spec para que sean comprobables; el plan puede afinarlos con medición | Requisitos sin cifra | — |

## 7. Requisitos no funcionales (RNF)

- **RNF-001** — Rendimiento: la feature NO DEBE degradar RNF-001 de 0009 (árbol de 1000
  notas, p95 ≤ 150 ms en Chromium real). Además, una nota de referencia de ~200 KiB con 50
  bloques de código DEBE mostrarse legible en lectura en p95 ≤ 150 ms (el resaltado puede
  llegar después) y el resaltado no DEBE producir tareas largas > 200 ms en el hilo
  principal.
- **RNF-002** — Carga diferida: el resaltador y sus gramáticas DEBEN ir en chunks
  separados que sólo se cargan al mostrar un bloque con lenguaje admitido; el chunk de
  entrada NO DEBE crecer más de 15 KiB gzip respecto a la línea base de 0009 por toda la
  feature.
- **RNF-003** — Seguridad: todo enlace e imagen, incluidos los pegados (RF-023), DEBE
  pasar por `safeUrl`; ninguna vista DEBE renderizar HTML crudo del markdown, de las
  propiedades ni del resaltador (el resaltado se construye con nodos de texto, sin
  `innerHTML`/`dangerouslySetInnerHTML` sobre contenido del usuario); los valores de
  propiedades se muestran como texto, sin enlazar.
- **RNF-004** — Accesibilidad: los colores del resaltado y del código en línea DEBEN tener
  contraste ≥ 4,5:1 sobre su fondo en ambos temas; panel, formulario, "Insertar tabla" y
  "Copiar" DEBEN ser operables con teclado y tener nombre accesible.
- **RNF-005** — Fidelidad visual (D5, criterio de cierre): capturas en Chromium real, en
  tema claro y oscuro, del panel de propiedades, cita, código en línea, vista Código
  coloreada, bloque de código con etiqueta/copiar, tabla y tareas, comparadas contra el
  mockup 1.1.4.4 (y contra career-admin para lo que el mockup no dibuja: tablas y bloques
  de código) en la revisión de Fase 4/Gate 4. La feature NO pasa a `verified` sin esa
  comparación aprobada.

## Marcadores abiertos

- `[NEEDS CLARIFICATION: NC-1 — ¿Qué es la "carpeta seleccionada" (destino de RF-001/RF-003)?
  Hoy el árbol sólo despliega carpetas; no tiene selección de carpeta. **Recomendación:**
  destino = la última carpeta activada en el árbol (clic o Enter en su fila); al abrir una
  nota, el destino pasa a ser su carpeta padre; una fila "Raíz" (o el encabezado del
  árbol) devuelve el destino a la raíz; RF-002 muestra siempre el destino actual. Es el
  modelo de Obsidian ("misma carpeta que el archivo actual").]`
- `[NEEDS CLARIFICATION: NC-2 — Notas existentes con YAML dentro de `content`: ¿migración?
  **Recomendación:** sin migración automática ni en segundo plano. Al abrir en edición una
  nota con `frontmatter` vacío cuyo `content` empieza por un bloque `---…---` que es un
  mapa YAML válido, el editor lo trata en esa sesión como propiedades (panel/Código) y lo
  separa sólo si el usuario guarda (RF-015), con un aviso "Las propiedades se movieron
  fuera del texto". Si `frontmatter` ya tiene datos, o el bloque no es YAML válido, o ya
  está corrompido (`***`, `\[…]`), se deja como cuerpo sin tocarlo y en Visual se avisa
  de que el inicio de la nota parece YAML.]`

Marcadores abiertos: 2 (NC-1, NC-2). Gate 1 bloqueado hasta resolverlos.
