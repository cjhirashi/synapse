---
id: SPEC-0010
tipo: spec
feature: 0010-contenido-markdown-completo
estado: verified         # 2026-10-27: T-111 aplicado a mano, T-123 aprobado por AIRA (capturas vs mockup/Obsidian). Lista para merge/deploy
# --- piloto slice-development (2026-10-25) ---
# Tareas restantes (desde T-050) migradas a `backlog.md` de esta misma carpeta como
# slices verticales; las tareas ya [x] en tasks.md quedan tal cual, no se re-documentan.
# Fuente de verdad del trabajo pendiente: backlog.md, no tasks.md. Detalle de la
# migración y su motivo en synthesis.planes-de-ejecución-pendientes (wiki de AIRA).
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: de8d0d7   # cierre de la implementación (2026-10-27)
anchor_mode: strict
covers:                  # fijado en PLAN-0010 §9 (archivos con dueño anterior 0007/0008/0009: PLAN-0010 P-15)
  # frontend — editor (sesión de frontmatter, propiedades, node views, resaltado, Mermaid, migas, menú)
  - frontend/src/editor/**
  - frontend/src/styles/tokens.css
  # frontend — carpetas, carpeta activa, historial y reglas de ruta
  - frontend/src/notes/NoteSidebar.tsx
  - frontend/src/notes/VaultWorkspacePage.tsx
  - frontend/src/notes/noteStore.ts
  - frontend/src/notes/noteRules.ts
  - frontend/src/notes/folders.ts
  - frontend/src/notes/noteHistory.ts
  - frontend/src/notes/untitled.ts
  - frontend/src/notes/messages.ts
  - frontend/src/notes/notes.css
  - frontend/src/notes/*.test.ts
  - frontend/src/notes/*.test.tsx
  # dependencias y presupuesto de bundle (RNF-002)
  - frontend/package.json
  - frontend/package-lock.json
  - frontend/scripts/check-bundle.mjs
  # sistema — fidelidad visual y rendimiento en navegador real (reutiliza la infraestructura de 0009)
  - frontend/e2e/content-visual.spec.ts
  - frontend/e2e/content-perf.spec.ts
  - frontend/e2e/fixtures.ts
  # backend — regla de ruta compartida (RF-007)
  - backend/app/core/note_rules.py
  - backend/tests/test_note_rules.py
  - backend/tests/test_note_contract.py
  - backend/tests/test_note_sync_push.py
  - backend/tests/fixtures/note_rules_cases.json
  # contratos
  - .harness/specs/0010-contenido-markdown-completo/contracts/**
  - .harness/specs/0008-vault-editor/contracts/note.schema.json
  # decisiones y documentación
  - .harness/decisions/ADR-006-extension-tokens-contenido.md
  - frontend/README.md
  - frontend/src/README.md
  - backend/README.md
  - backend/app/core/README.md
  - backend/tests/README.md
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: { por: "AIRA en nombre de Carlos Jiménez (cjhirashi), autoridad delegada", fecha: 2026-10-24, nota: "incluye RF-052 (zoom/pan con svg-pan-zoom en carga diferida) por paridad con career-admin" }
  fase_2: { por: "AIRA en nombre de Carlos (autoridad delegada)", fecha: 2026-10-24 }
actualizado: 2026-10-24
---

# SPEC-0010 · Contenido Markdown completo

> Redactada a partir de la evidencia en Chromium real (capturas en `/tmp/s10/shots/`)
> sobre el editor de SPEC-0008/0009. Referencias: `cjhirashi-career-admin`
> (`CareerResourceView.tsx`: `CodeBlockPre`, `MermaidDiagram`; `index.css:278-560`) para la
> calidad, el mockup `diseño/1.1.4 - Diseño UI-UX/1.1.4.4 - Vista - Editor Principal.html`
> para lo visual y una captura real de Obsidian para el breadcrumb. Las decisiones D1…D5
> las tomó **AIRA con autoridad delegada por Carlos (2026-10-24)**. Las correcciones
> C1…C4 (Mermaid dentro del alcance, breadcrumb, NC-1 y NC-2 resueltos) llegaron de Carlos
> vía AIRA ese mismo día. Todas están en §6 con su descarte. Marcadores abiertos: 0.
> **Sigue en `draft`: falta la aprobación de la Fase 1.**

## 1. Contexto del dominio

Un usuario de Synapse no puede usar sus notas "como Obsidian": las carpetas existen pero
no se descubren, las propiedades (frontmatter) se corrompen al editar en Visual, las
tablas no se pueden pegar ni insertar, el código no se resalta, los diagramas Mermaid no
se ven y el encabezado del documento no dice dónde está la nota ni permite volver atrás.

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
  las notas siguen viajando sólo por `/sync` (P-1 de 0008). La nota abierta no está en la
  URL (estado de `VaultWorkspacePage`), así que el historial de notas es propio de la app.

## 2. Alcance

### En alcance
- **Carpetas (D3, C3):** carpeta activa como destino de creación, "Nueva nota" dentro de
  ella, acción "Nueva carpeta", fila "Raíz", pista visible de que `/` anida, corrección
  del bug de `.md` en cliente y servidor.
- **Propiedades (D1, D2, C4):** panel en lectura, formulario clave/valor en Visual,
  bloque YAML en Código; el `frontmatter` (objeto JSON) es la única fuente de verdad y
  `content` nunca guarda el YAML; separación al guardar, con aviso, del YAML heredado que
  esté dentro de `content`.
- **Tablas (D4c):** pegar markdown de tabla en Visual, comando/botón "Insertar tabla",
  filas compactas.
- **Resaltado de sintaxis** de bloques de código en lectura, Visual y Código, más el
  coloreado del propio markdown en Código (como el mockup, `.cm-h1`…`.cm-code`).
- **Bloques de código (D4b):** etiqueta de lenguaje y botón "Copiar", como career-admin.
- **Diagramas Mermaid (C1):** bloques ```` ```mermaid ```` renderizados como diagrama en
  lectura y con vista previa en Visual, con colores de tokens, modo estricto de seguridad
  y carga diferida.
- **Encabezado del documento estilo Obsidian (C2):** breadcrumb
  `carpeta › subcarpeta › … › nota` clicable, flechas atrás/adelante con historial de
  navegación entre notas y menú de opciones `⋯`, en la barra de 43 px de 0009.
- **Estilos del mockup (D4a):** cita, código en línea, casillas de tareas.
- Tema claro y oscuro sólo con tokens de `tokens.css`.

### Fuera de alcance
- Diagramas que no sean Mermaid (PlantUML, Graphviz, etc.) y edición gráfica de
  diagramas.
- Migrar de Milkdown/CodeMirror: ADR-010 se mantiene (D4).
- Subir imágenes (D4).
- Wikilinks `[[…]]` (pendiente aparte de 0008, backlog 11a).
- Carpetas vacías o documento `folder:*` (D3; 0008 §6).
- Migración automática o en segundo plano de notas con YAML dentro de `content` (C4).
- Conservar comentarios y formato literal del YAML: la verdad es el objeto JSON (D1), el
  YAML se regenera al mostrarlo (ver §5 y §6).
- Validar el tipo de las propiedades en el push del servidor (ver §3 y §6).
- Fusión automática de conflictos en `frontmatter`: sigue manual (RF-009 de 0008).
- Enlaces automáticos dentro de los valores de propiedades (se muestran como texto).
- Llevar la nota abierta a la URL o al historial del navegador (el historial de C2 es
  de la app; ver §6).
- Acciones nuevas en el menú `⋯` que no existan ya (sólo se reutilizan, ver RF-062).

## 3. Modelo de datos y contratos de E/S

**Sin campo nuevo en el modelo.** Se reutiliza `frontmatter` (objeto JSON opcional,
≤ 64 KiB en JSON compacto UTF-8, PLAN-0008 P-4) de `note:{vault}:{uuid}`.

| Frontera | Dirección | Tipo | Contrato en `contracts/` |
|---|---|---|---|
| `note.frontmatter` (objeto; sin cambio de forma) | entrada/salida | `/sync` (push validado, pull) | `0008-vault-editor/contracts/note.schema.json#/properties/frontmatter` (sin cambio) |
| `note.path`: se añade "último segmento ≠ `.md`" (sin distinguir mayúsculas) | entrada | `/sync` (push validado) | `0008-vault-editor/contracts/note.schema.json#/properties/path` (patrón ampliado; re-export) |
| Bloque YAML de la vista Código ↔ `frontmatter` | interna (cliente) | conversión YAML 1.2 (esquema core) ↔ JSON | por crear en Fase 2 (tabla de tipos de RF-018); hasta entonces, RF-018 es el contrato |
| Historial de navegación de notas (C2) | interna (cliente) | `sessionStorage` de la pestaña, por bóveda: lista de ids de nota + posición | sin contrato externo; RF-057 es el contrato |

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
- **Mermaid:** el diagrama no se guarda; `content` guarda sólo el bloque cercado con su
  fuente. Dependencia `mermaid` 11.x (la que valida cjhirashi-career-admin, `^11.16.1`).
- Errores: sin errores HTTP nuevos; los rechazos del push siguen siendo
  `validation-error:path` / `validation-error:frontmatter` (SPEC-0005/0008).

## 4. Criterios de aceptación (EARS)

### Carpetas
- **RF-001** — CUANDO el usuario crea una nota con "Nueva nota" y la carpeta activa
  (RF-042) no es la raíz, el sistema DEBE crearla con `path = "<carpeta>/<título>.md"` (el
  título se interpreta relativo a esa carpeta; un `/` en el título anida dentro de ella) o
  `"<carpeta>/Sin título.md"`/`"Sin título n"` libre si no hay título (RF-012 de 0008), y
  abrirla en edición.
- **RF-002** — El formulario "Nueva nota" DEBE mostrar siempre de forma visible la
  carpeta activa en la que se creará la nota, o "Raíz" si es la raíz.
- **RF-003** — CUANDO el usuario usa "Nueva carpeta" e introduce un nombre válido, el
  sistema DEBE crear la nota `"<activa>/<nombre>/Sin título.md"` (o el siguiente
  "Sin título n" libre en esa carpeta), mostrar la carpeta en el árbol desplegada y abrir
  la nota en edición; si la carpeta activa es la raíz, `<activa>/` se omite.
- **RF-004** — SI el nombre de "Nueva carpeta" queda vacío tras quitar espacios, contiene
  un segmento vacío o caracteres de control ENTONCES el sistema DEBE rechazarlo con un
  mensaje junto al campo y no crear nada.
- **RF-005** — SI ya existe una carpeta con el mismo nombre en la carpeta activa
  (comparación NFKC + casefold, igual que `pathKey`) ENTONCES "Nueva carpeta" DEBE
  rechazarlo con el mensaje "Ya existe una carpeta con ese nombre" y no crear nada.
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
- **RF-042** — El sistema DEBE mantener una carpeta activa por bóveda que es: la última
  carpeta activada en el árbol (clic o Enter en su fila) o en el breadcrumb (RF-055); al
  abrir una nota, su carpeta padre (la raíz si la nota está en la raíz); y la raíz al
  entrar en la bóveda.
- **RF-043** — El árbol DEBE ofrecer una fila "Raíz" al inicio; CUANDO el usuario la
  activa, el sistema DEBE dejar la raíz como carpeta activa. La fila de la carpeta activa
  DEBE distinguirse visualmente y llevar un estado accesible (`aria-current="true"`).

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
  > **Aclaración de RF-019 / RF-016 (enmienda menor, Converge 1, 2026-10-27):** además del tamaño, el `frontmatter`
  > DEBE tener como máximo **32 niveles de anidamiento** (el objeto raíz cuenta como 1; objetos y listas). Es un tope
  > explícito del servidor (`FRONTMATTER_MAX_DEPTH` en `core/note_rules.py`, `validation-error:frontmatter`), no una
  > consecuencia de capturar `RecursionError`: sin él, ~950 niveles pasaban `json.loads` y reventaban `json.dumps`
  > (500 sin problem+json) y entre 400 y 940 se almacenaban sin límite. El cliente usa el mismo tope
  > (`FRONTMATTER_MAX_DEPTH` en `noteRules.ts`; el YAML que lo supere se rechaza con `too-deep`), para no generar un
  > documento que el servidor rechace. Además todo cuerpo JSON de `/sync/**` admite como máximo 64 niveles
  > (`MAX_JSON_DEPTH`, Converge 2): un frontmatter de 33 a 61 niveles se rechaza con `validation-error:frontmatter`
  > (rechazo del documento); con 62 o más es el CUERPO el que supera el tope y lo rechaza el decodificador con un 422
  > `validation-error` de la petición entera (la misma vía cubre `_local`, `_bulk_docs`, `_revs_diff`, `_bulk_get` y
  > `_all_docs`). Las claves `__proto__`, `constructor` y `prototype` son claves ordinarias.
  > Además (L4) el último segmento `.md` de RF-007 se compara por NFKC + casefold, igual que `path_key`.
- **RF-020** — Las vistas Visual y lectura NO DEBEN leer, escribir ni serializar el YAML
  dentro de `content`; guardar desde Visual DEBE cambiar `frontmatter` sólo con lo
  editado en el formulario.
- **RF-021** — CUANDO el usuario alterna Visual↔Código en edición, el sistema DEBE
  conservar las propiedades y el cuerpo no guardados entre ambas vistas.
- **RF-022** — CUANDO una nota se sincroniza (push/pull), el sistema DEBE conservar su
  `frontmatter` sin cambios; un conflicto que afecte a `frontmatter` DEBE seguir
  exponiéndose para decisión manual (RF-009 de 0008), nunca fusionarse en silencio.
- **RF-044** — CUANDO se abre en edición una nota con `frontmatter` ausente o `{}` cuyo
  `content` empieza por un bloque `---…---` (RF-015) que es un mapa YAML válido, el
  sistema DEBE tratar ese bloque como propiedades en la sesión de edición (panel,
  formulario y Código) y, sólo si el usuario guarda, DEBE moverlo a `frontmatter`,
  quitarlo de `content` y mostrar el aviso "Las propiedades se movieron fuera del texto";
  si el usuario sale sin guardar, la nota NO DEBE cambiar.
- **RF-045** — SI el `content` empieza por un bloque que parece frontmatter pero
  `frontmatter` ya tiene datos, o el bloque no es un mapa YAML válido, o está corrompido
  (`***`, `\[…]`) ENTONCES el sistema DEBE dejarlo como cuerpo sin modificarlo y, en
  Visual, DEBE avisar de que el inicio de la nota parece YAML y no se trata como
  propiedades.

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
- **RF-033** — En lectura y en Visual, cada bloque de código (incluidos los `mermaid`)
  DEBE mostrar una etiqueta con su lenguaje tal como está declarado, o "texto" si no
  declara ninguno.
- **RF-034** — CUANDO el usuario activa "Copiar" en un bloque, el sistema DEBE copiar al
  portapapeles exactamente el código fuente del bloque (sin etiqueta; en `mermaid`, la
  fuente y no el SVG) y anunciar "Copiado" en una región `aria-live`.
- **RF-035** — SI el portapapeles no está disponible o falla ENTONCES el sistema DEBE
  mostrar un mensaje de error en el bloque sin lanzar excepción.
- **RF-036** — La etiqueta, el botón "Copiar" y el diagrama Mermaid NO DEBEN formar parte
  del markdown: guardar desde Visual DEBE dejar `content` sin rastro de ellos.

### Diagramas Mermaid
- **RF-046** — CUANDO se muestra en lectura un bloque cercado con lenguaje `mermaid`, el
  sistema DEBE renderizarlo como diagrama SVG en lugar del bloque de código.
- **RF-047** — MIENTRAS la nota esté en edición Visual, un bloque `mermaid` DEBE seguir
  siendo un bloque de código editable con una vista previa del diagrama debajo, que se
  actualiza ≤ 500 ms después de que el usuario deja de escribir.
- **RF-048** — MIENTRAS la nota esté en edición Código, un bloque `mermaid` DEBE
  mostrarse como texto, sin diagrama.
- **RF-049** — SI la fuente de un bloque `mermaid` es inválida ENTONCES el sistema DEBE
  mostrar en ese bloque el mensaje de error y el código fuente, renderizar el resto de la
  nota con normalidad, no perder texto y no dejar escapar excepciones.
- **RF-050** — DONDE el tema activo sea claro u oscuro, los colores del diagrama DEBEN
  derivarse de propiedades de `tokens.css` de ese tema; CUANDO el usuario cambia de
  tema, el sistema DEBE volver a renderizar los diagramas visibles con los nuevos colores.
- **RF-051** — El sistema DEBE renderizar Mermaid con `securityLevel: "strict"` y
  etiquetas sin HTML (`htmlLabels: false`); el SVG resultante NO DEBE contener
  `<script>`, `foreignObject`, atributos `on*` ni enlaces navegables, y las directivas
  `click`/`href` y `%%{init}%%` de la fuente NO DEBEN poder relajar la seguridad, cambiar
  el tema ni ejecutar acciones.
- **RF-052** — CUANDO un diagrama es más ancho que la columna del editor, el sistema DEBE
  ajustarlo al ancho disponible y ofrecer botones accesibles para acercar, alejar y
  reajustar, con desplazamiento por arrastre (como career-admin).
- **RF-053** — SI la carga diferida de Mermaid falla ENTONCES el sistema DEBE mostrar el
  bloque como código con un aviso "No se pudo cargar el diagrama", sin bloquear la nota.

### Encabezado del documento (breadcrumb)
- **RF-054** — CUANDO hay una nota abierta, el encabezado del editor DEBE mostrar, en
  lugar del título suelto, un `nav` con `aria-label="Ruta"` que contiene la lista de
  segmentos `carpeta › subcarpeta › … › nombre` del `path` (nombre sin `.md`); el nombre
  de la nota DEBE seguir siendo el encabezado de nivel 2 del editor y llevar
  `aria-current="page"`.
- **RF-055** — CUANDO el usuario activa un segmento de carpeta del breadcrumb, el sistema
  DEBE revelar esa carpeta en el árbol (desplegar ella y sus ancestros, desplazarla a la
  vista) y dejarla como carpeta activa (RF-042), sin cambiar la nota abierta.
- **RF-056** — El encabezado DEBE ofrecer botones "Atrás" y "Adelante" con nombre
  accesible que navegan por el historial de notas (RF-057), deshabilitados cuando no hay
  entrada en esa dirección.
- **RF-057** — El sistema DEBE llevar un historial de notas abiertas por bóveda y por
  pestaña (se conserva al recargar la pestaña, no se comparte entre pestañas) de hasta 50
  entradas por id de nota: abrir una nota la añade tras la posición actual y descarta las
  entradas "adelante"; atrás/adelante mueven la posición sin añadir entradas.
- **RF-058** — SI la entrada de destino del historial es una nota borrada o inexistente
  ENTONCES el sistema DEBE saltarla y seguir a la siguiente válida en esa dirección; una
  nota renombrada DEBE seguir siendo navegable (se identifica por id).
- **RF-059** — CUANDO el usuario pulsa Alt+← o Alt+→ con el foco en el workspace y fuera
  de un editor de texto en edición, el sistema DEBE ir atrás o adelante en el historial
  e impedir la navegación del navegador.
- **RF-060** — SI hay cambios sin guardar y el usuario navega con atrás/adelante (botón o
  atajo), ENTONCES el sistema DEBE mostrar el mismo aviso de cambios sin guardar de 0008
  y, si lo cancela, conservar la nota, el borrador y la posición del historial.
- **RF-061** — El encabezado DEBE terminar en un botón `⋯` con nombre accesible
  "Opciones de la nota" que abre un menú (`role="menu"`, operable con flechas, Enter y
  Esc) con: "Renombrar/mover", "Borrar", "Copiar ruta" y "Ver en Código".
- **RF-062** — "Renombrar/mover" y "Borrar" del menú DEBEN ejecutar los mismos flujos,
  reglas y mensajes que las acciones existentes de la barra lateral; "Ver en Código" DEBE
  pasar la nota a edición en la vista Código; "Copiar ruta" DEBE copiar el `path`
  completo (con `.md`) y anunciar "Ruta copiada" en una región `aria-live`.
- **RF-063** — SI el breadcrumb no cabe en el ancho del encabezado ENTONCES el sistema
  DEBE colapsar los segmentos intermedios en un botón "…" que lista los ocultos (cada uno
  activable como RF-055), mantener siempre visibles la primera carpeta y el nombre de la
  nota, y truncar con elipsis un nombre que aún no quepa, con la ruta completa como
  tooltip.
- **RF-064** — La barra superior del editor DEBE mantener los 43 px de alto de SPEC-0009
  (R-12) en una sola línea, con breadcrumb, flechas, menú y los controles existentes
  (Visual/Código, Guardar, Editar/Leer).
- **RF-065** — CUANDO la nota abierta se renombra o se mueve, el breadcrumb DEBE
  reflejar la nueva ruta sin recargar.

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
  (panel, formulario, tablas, resaltado, etiqueta, cita, código, casillas, diagramas,
  breadcrumb y menú) DEBE salir de propiedades de `tokens.css` definidas en ambos temas,
  sin literales de color.

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
- **Notas con YAML ya dentro de `content`:** mapa válido con `frontmatter` vacío → se
  separa al guardar, con aviso (RF-044); `frontmatter` ya con datos, YAML inválido o ya
  corrompido a `***`/`\[…]` → queda como cuerpo, con aviso en Visual (RF-045). El texto
  corrompido no se reconstruye.
- **Pegar una tabla mal formada** (filas con distinto número de celdas, sin separador
  `|---|`): RF-024.
- **Lenguaje desconocido o vacío** (` ```foo `, ` ``` `): RF-031; etiqueta según RF-033.
- **Código con `<script>` o HTML** dentro de un bloque o una propiedad: se muestra
  literal (RNF-003).
- **Ruta `Carpeta/` o `Carpeta/.md`:** RF-007; notas antiguas con esa ruta: RF-008.
- **`frontmatter` > 64 KiB al editar:** RF-019; números `.inf`/`.nan`/`1e999`: RF-017.
- **Carga del resaltador o de Mermaid fallida u offline sin caché:** RF-032, RF-053.
- **Mermaid:** bloque vacío o fuente inválida → RF-049; directiva
  `%%{init: {"securityLevel": "loose"}}%%`, `click A call f()` o `click A href
  "javascript:…"` → ignorados (RF-051); diagrama enorme → RF-052; varias decenas de
  diagramas en una nota → se renderizan sin bloquear la lectura (RNF-001); cambio de tema
  con diagramas abiertos → RF-050; un diagrama en error no afecta a los demás bloques ni
  al resto de la nota (RF-049).
- **Breadcrumb:** nota en la raíz → sólo el nombre, sin segmentos de carpeta; ruta muy
  profunda o nombres largos → RF-063; nota abierta renombrada o movida → RF-065; nota del
  historial borrada (en papelera o purgada) → RF-058; historial vacío o en un extremo →
  flechas deshabilitadas (RF-056); atrás/adelante con borrador sucio → RF-060; cambio de
  bóveda → el historial y la carpeta activa son de la otra bóveda (RF-042, RF-057).

## 6. Registro de decisiones y descartes

| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| D1 · `frontmatter` (objeto JSON de 0008) es la única fuente de verdad; Código lo presenta como YAML, al guardar se separa y `content` nunca guarda el YAML; Visual y lectura no tocan el YAML | Corrige la corrupción desde la raíz (Milkdown no entiende frontmatter); una sola verdad. AIRA por delegación de Carlos, 2026-10-24 | Guardar el YAML dentro de `content` (duplica la verdad) | — |
| D2 · Panel de propiedades: caja con el estilo del mockup y pares legibles en lectura; formulario clave/valor en Visual (como Obsidian); YAML en Código; sin propiedades, sin panel | Legible y editable sin YAML para el usuario medio. AIRA, 2026-10-24 | YAML literal de sólo lectura | — |
| D3 · Carpetas = prefijos de `path` (0008 §6); "Nueva carpeta" crea `Carpeta/Sin título.md`; "Nueva nota" dentro de la carpeta seleccionada; pista de `/`; rechazar último segmento vacío o `.md` | No toca `/sync` ni reabre 0008. AIRA, 2026-10-24 | Documento `folder:*` (toca `/sync` y revierte 0008) | — |
| D4 · Incluidos estilos del mockup, etiqueta + copiar, pegar/insertar tablas; fuera migrar de editor, imágenes, wikilinks (Mermaid: ver C1) | Cerrar las brechas vistas en navegador sin abrir frentes nuevos; ADR-010 se mantiene. AIRA, 2026-10-24 | Cambiar de editor | ADR-010 |
| D5 · No `verified` sin comparación por capturas contra 1.1.4.4 en ambos temas (RNF-005) | Pedido explícito de Carlos; `method.md` v1.9 Fase 4/Gate 4 | Cerrar sólo con tests funcionales | — |
| C1 · Mermaid dentro del alcance (RF-046…RF-053), con `mermaid` 11.x | Carlos (vía AIRA, 2026-10-24): pedir career-admin como referencia incluye Mermaid, que allí renderiza `CodeBlockPre` → `MermaidDiagram`; la dependencia ya está validada en producción en cjhirashi-career | Dejar Mermaid fuera de alcance (lo que decía D4) | — |
| Mermaid en Visual = bloque de código editable + vista previa debajo (RF-047) | Milkdown no puede editar un SVG; sustituir el bloque por el diagrama impediría editar la fuente en Visual | Mostrar sólo el diagrama en Visual (edición sólo en Código) | ADR-010 |
| Colores de Mermaid desde tokens (`themeVariables` derivadas de `tokens.css`), re-render al cambiar de tema (RF-050) | Mermaid hornea los colores en el SVG; los temas `default`/`dark` de Mermaid (los de career-admin) no siguen la paleta MD3+Cyan | Temas integrados `default`/`dark` de Mermaid | — |
| Mermaid estricto: `securityLevel: "strict"`, `htmlLabels: false`, sin `click`/`href`, directivas `init` sin poder relajar seguridad ni tema (RF-051); su SVG es la única inserción de marcado permitida (RNF-003) | El diagrama sale de texto del usuario o de sus agentes; el modo estricto sanea el SVG y sin `foreignObject` no hay HTML embebido | `securityLevel: "loose"`/`antiscript` con etiquetas HTML | — |
| Zoom/ajuste/arrastre en diagramas grandes (RF-052), con `svg-pan-zoom` en carga diferida | Paridad con career-admin; un diagrama ancho no debe romper la columna de 780 px de 0009 | Diagrama a tamaño natural con scroll horizontal | — |
| C2 · Encabezado estilo Obsidian: breadcrumb clicable + atrás/adelante + menú `⋯` (RF-054…RF-065) | Carlos (vía AIRA, 2026-10-24) con captura real de Obsidian; es el mismo encabezado del editor que toca esta feature | Mantener el título suelto en el encabezado | — |
| Clic en carpeta del breadcrumb = revelar en el árbol + carpeta activa, sin cambiar de nota (RF-055) | Une breadcrumb y destino de creación (C3); no hay "vista de carpeta" a la que navegar | Filtrar el árbol a esa carpeta / abrir una vista de carpeta | — |
| Historial propio de la app, por bóveda y pestaña, en `sessionStorage`, 50 entradas, por id (RF-057) | La nota abierta no está en la URL (0008); meterla en la URL cambia rutas y el comportamiento del botón atrás del navegador, verificados en 0008/0009 | Nota en la URL e historial del navegador; historial sólo en memoria (se pierde al recargar) | — |
| Atajos Alt+←/Alt+→ sólo fuera de un editor de texto en edición (RF-059) | Dentro de CodeMirror/Milkdown esas teclas tienen uso de edición (p. ej. moverse por palabras en macOS); fuera, se evita que el navegador salga de la bóveda | Atajo global incluso dentro del editor; Ctrl+Alt+← de Obsidian | — |
| Menú `⋯` sólo con acciones existentes: Renombrar/mover, Borrar, Copiar ruta, Ver en Código (RF-061/062) | No inventar acciones; reutilizar flujos ya verificados de 0008 | Añadir duplicar, exportar, abrir en panel nuevo | — |
| El nombre de la nota sigue siendo el `h2` del editor, dentro del breadcrumb (RF-054) | No regresión de accesibilidad y de tests que buscan el encabezado (RF-041) | Breadcrumb sin encabezado de documento | — |
| Altura de 43 px de 0009 se respeta (RF-064); en estrecho se colapsa el breadcrumb (RF-063) | R-12 de 0009 está verificado contra el mockup; cabe en una línea con colapso | Barra de dos líneas o más alta | — |
| C3 (= NC-1) · Carpeta activa: última carpeta activada; al abrir nota, su carpeta padre; fila "Raíz"; destino siempre visible (RF-042, RF-043, RF-002) | Recomendación del autor de spec aceptada por Carlos vía AIRA, 2026-10-24; modelo de Obsidian ("misma carpeta que el archivo actual") | Carpeta sólo por selección explícita; crear siempre en la raíz | — |
| C4 (= NC-2) · YAML heredado en `content`: se separa sólo al guardar, con aviso; nada automático; si ya hay `frontmatter`, es inválido o está corrompido, queda como cuerpo con aviso (RF-044, RF-045) | Recomendación del autor de spec aceptada por Carlos vía AIRA, 2026-10-24; ningún dato cambia sin un guardado del usuario | Migración automática al abrir o en segundo plano; fusionar ambos bloques | — |
| Valores complejos (`null`, objeto anidado, lista no-string) se conservan y se editan sólo en Código (RF-013) | Ninguna vista destruye datos que no sabe editar; los agentes pueden escribir cualquier JSON | Rechazar o aplanar los valores complejos | — |
| Sin validación de tipos de `frontmatter` en el push (§3) | Propiedades del usuario/agentes, no esquema del sistema; evita rechazar documentos ya replicados; el riesgo de render lo cubre RNF-003 | Validar los 4 tipos en `check_frontmatter` | — |
| YAML 1.2 core (fechas y `yes`/`no` → string) (RF-018) | JSON no tiene fecha; YAML 1.1 convertiría `no` (p. ej. un código de país) en `false` en silencio | YAML 1.1 por defecto de muchas librerías | — |
| Claves duplicadas = YAML inválido (RF-017) | "Gana la última" pierde datos sin avisar | Aceptar la última clave | — |
| "Nueva carpeta" con nombre existente se rechaza (RF-005) | La intención "nueva" no se cumple en silencio; como Obsidian | Crear "Sin título" en la carpeta existente | — |
| Título de "Nueva nota" relativo a la carpeta activa (RF-001) | Coherente con "crear dentro de la carpeta seleccionada" | Título siempre absoluto desde la raíz | — |
| La regla del `.md` va también al servidor (RF-007) y las notas antiguas afectadas se renombran (RF-008) | Cliente y servidor comparten reglas y batería (0008); sólo cliente dejaría pasar a otros clientes | Corregir sólo `titleToPath` en el cliente | — |
| Pegar markdown en Visual lo interpreta en general, no sólo tablas (RF-023) | El plugin de portapapeles de Milkdown interpreta todo el markdown pegado; tratar sólo tablas sería un caso especial artificial | Interpretar sólo tablas | ADR-010 |
| Casillas no interactivas en lectura, interactivas en Visual (RF-039) | Lectura nunca modifica la nota (RF-007 de 0008) | Casillas interactivas en lectura con guardado implícito | — |
| Topes medibles de RNF-002 (entrada +≤ 15 KiB gzip), RF-026 (≤ 40 px) y RF-047 (≤ 500 ms) | Propuesta del autor de spec para que sean comprobables; el plan puede afinarlos con medición | Requisitos sin cifra | — |

## 7. Requisitos no funcionales (RNF)

- **RNF-001** — Rendimiento: la feature NO DEBE degradar RNF-001 de 0009 (árbol de 1000
  notas, p95 ≤ 150 ms en Chromium real). Además, abrir en lectura una nota grande
  **precalculada** (la ruta normal: el precálculo en Worker ya cacheó su mdast) DEBE ser
  legible con p95 ≤ 150 ms hasta ~120 KiB; para la nota de referencia extrema de ~181–200 KiB
  (50 bloques de código + 5 Mermaid) DEBE ser legible con p95 ≤ 250 ms. En ningún caso el
  resaltado ni el render de diagramas DEBEN producir tareas largas > 200 ms en el hilo
  principal por bloque. (El resaltado y los diagramas pueden llegar después.)
  > **Enmienda B-1b (Directiva de Pausa, 2026-10-25; aceptada por AIRA con autoridad delegada el 2026-10-26, sin revisión línea por línea de Carlos).** El plan
  > §10.7 (B-1) ya tiered la apertura **en frío** por tamaño (≤ 150 ms hasta 64 KiB, ≤ 220 ms a
  > ~200 KiB). La medición real de T-138 en Chromium mostró que el supuesto del plan para la ruta
  > precalculada (cache-hit ≈ 90 ms para 181 KiB) no se sostiene: con el micromark ya cacheado, el
  > residuo `JSON.parse`+`runSync`+`toDoc`+node-views de una nota de ~200 KiB es ~150–240 ms (crece
  > con el tamaño, no con el parseo). Se extiende el mismo tiering por tamaño a la ruta
  > precalculada: ≤ 150 ms hasta 120 KiB (medido 64 KiB 29 ms, 120 KiB 52 ms) y ≤ 250 ms para el
  > extremo ~181–200 KiB (medido 238 ms). Reducirlo más exige render diferido de node-views (trabajo
  > de resaltado de código, Slice 5). Evidencia en `memory/history.md` 2026-10-25.
- **RNF-002** — Carga diferida: el resaltador y sus gramáticas, `mermaid` y
  `svg-pan-zoom` DEBEN ir en chunks separados del de entrada; el resaltador sólo se
  descarga al mostrar un bloque con lenguaje admitido y `mermaid`/`svg-pan-zoom` sólo si
  la nota mostrada tiene un bloque `mermaid` (abrir una nota sin él no los pide a la
  red). El chunk de entrada NO DEBE crecer más de 15 KiB gzip respecto a la línea base de
  0009 por toda la feature (incluidos el breadcrumb, el historial y el punto de carga
  de Mermaid).
- **RNF-003** — Seguridad: todo enlace e imagen, incluidos los pegados (RF-023), DEBE
  pasar por `safeUrl`; ninguna vista DEBE renderizar HTML crudo del markdown, de las
  propiedades ni del resaltador (el resaltado se construye con nodos de texto, sin
  `innerHTML`/`dangerouslySetInnerHTML` sobre contenido del usuario); los valores de
  propiedades se muestran como texto, sin enlazar. **Única excepción:** el SVG que
  devuelve Mermaid en modo estricto (RF-051), que además NO DEBE contener `<script>`,
  `foreignObject`, atributos `on*` ni `href` navegables.
- **RNF-004** — Accesibilidad: los colores del resaltado, del código en línea y de los
  diagramas DEBEN tener contraste ≥ 4,5:1 (texto) sobre su fondo en ambos temas; panel,
  formulario, "Insertar tabla", "Copiar", controles de zoom, breadcrumb, flechas y menú
  `⋯` DEBEN ser operables con teclado y tener nombre accesible; cada diagrama DEBE tener
  un nombre accesible (`role="img"` con `aria-label` "Diagrama Mermaid" o su título).
- **RNF-005** — Fidelidad visual (D5, criterio de cierre): capturas en Chromium real, en
  tema claro y oscuro, del panel de propiedades, cita, código en línea, vista Código
  coloreada, bloque de código con etiqueta/copiar, tabla, tareas, diagrama Mermaid
  (válido y en error) y encabezado con breadcrumb, flechas y menú (ancho normal y
  colapsado), comparadas contra el mockup 1.1.4.4, contra career-admin para lo que el
  mockup no dibuja (tablas, bloques de código, Mermaid) y contra la captura de Obsidian
  para el breadcrumb, en la revisión de Fase 4/Gate 4. La feature NO pasa a `verified`
  sin esa comparación aprobada.

## Marcadores abiertos

Ninguno: NC-1 y NC-2 los resolvió Carlos vía AIRA el 2026-10-24 con la recomendación del
autor de spec (C3 → RF-042/RF-043/RF-002; C4 → RF-044/RF-045). Mermaid (C1) y el
breadcrumb (C2) entraron con decisiones registradas en §6. **La Fase 1 sigue pendiente de
aprobación** (`estado: draft`, `fase_1: pendiente`).
