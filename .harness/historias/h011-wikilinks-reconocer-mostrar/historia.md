---
id: H-011
titulo: Wikilinks [[...]] — reconocerlos y mostrarlos como enlace en Visual (sin navegación todavía)
estado: implemented # Gate 1 pasado — Carlos confirmó "así es" (2026-10-30) a P-1..P-4: solo resuelven wikilinks a notas .md (lo demás, roto); coincidencia case-insensitive "como Obsidian"; duplicados sin bloquear; sin dependencia nueva. Implementado vía Claude Code (Modo 2) 2026-10-30; falta checkpoint demostrable de Carlos antes de 'verified'.
covers:
  - frontend/src/editor/MilkdownView.tsx
  - frontend/src/editor/MilkdownView.test.tsx
  - frontend/src/editor/NoteEditor.tsx
  - frontend/src/editor/wikilink.ts
  - frontend/src/editor/wikilink.test.ts
  - frontend/src/editor/editor.css
origen: backlog
---

# H-011 — Wikilinks: reconocerlos y mostrarlos (Fase 1 de la feature completa)

## 1. Intención (lenguaje de usuario)

Pedido de Carlos (2026-10-30): el contenido real que ya migró a Synapse usa
sintaxis `[[...]]` de Obsidian — confirmado leyendo notas reales de su
bóveda "Conocimientos de Oriente" durante la investigación anterior de esta
sesión, por ejemplo:

```
[[2.1.19 - El Juramento del Aprendiz Masón|Regresar a TR-19]]
- [[Trabajo 19 - El Juramento del Aprendiz Masón - v1.docx]]
```

Hoy, al editar esa nota en modo Visual, Milkdown no reconoce `[[...]]` como
sintaxis especial (no es Commonmark) y lo **escapa** a `\[\[...\]\]` al
guardar — decisión abierta sin resolver desde SPEC-0008 (2026-10-23,
`.harness/memory/state.md` punto 11a), nunca convertida en historia hasta
ahora.

**Alcance de la feature completa (Obsidian-like) vs. esta historia:**
convertir `[[...]]` en wikilinks reales de punta a punta implica 4 piezas
independientes: (1) reconocerlos al parsear/serializar sin escaparlos, (2)
mostrarlos visualmente distintos de texto plano, (3) clic para navegar a la
nota referida, (4) autocompletar notas existentes al escribir `[[`. Carlos
no especificó si las quiere todas de una — **propuesta de AIRA**: esta
historia (H-011) cubre solo (1) y (2), demostrable y completa por sí sola
(dejan de escaparse, se ven como enlaces); (3) y (4) quedan como historias
siguientes del backlog (H-012, H-013) una vez que el reconocimiento de base
esté sólido — evita una sola historia de varias sesiones con decisiones de
UX de navegación/autocompletado mezcladas con el parser base.

## 2. Alcance / fuera de alcance

- Dentro: reconocer `[[Destino]]` y `[[Destino|Alias]]` al parsear/serializar
  markdown en Milkdown (commonmark no define esto — hace falta un nodo/marca
  propia, ver §6); mostrarlo en modo Visual como enlace con estilo distinto
  del texto normal; que el round-trip markdown→editor→markdown conserve la
  sintaxis `[[...]]` exacta (hoy se pierde, queda escapada).
- Fuera (pasa a historias siguientes si Carlos las quiere): clic para
  navegar a la nota (H-012); crear la nota si no existe al hacer clic, estilo
  Obsidian (parte de H-012); autocompletar notas existentes al escribir `[[`
  (H-013); vista "Código" (ahí el markdown ya se ve literal, no aplica).

## 3. Decisiones de producto (Gate 1, Carlos, 2026-10-30 — "así es")

**P-1 (resolución del destino) — resuelto:** solo se resuelven wikilinks que
apuntan a una **nota `.md` de la misma bóveda**. Cualquier otro destino
(`.docx`, `.pdf`, nota inexistente) se muestra como **enlace roto** — no
falla, no se oculta, no se trata como texto plano.

**Detalle técnico añadido por Carlos (no estaba en mi propuesta original):**
el texto del wikilink se enlaza **al nombre** del documento (igual que hoy
se escribe en el markdown, `[[Nombre]]`/`[[Nombre|Alias]]`), pero **la
referencia interna, una vez resuelta, debe guardarse por el `id` de la
nota**, no por su nombre — el nodo/marca de Milkdown debe cargar un atributo
con el `note:<vault>:<id>` resuelto (ver §6), no solo el string de destino.
Esto deja la resolución lista para que H-012 (navegación) use el `id`
directo sin tener que volver a buscar por nombre, y es la base correcta para
que un futuro rename de nota no tenga que re-resolver todos los wikilinks
que la citan desde cero.

**P-2 (mayúsculas/acentos) — resuelto:** coincidencia **insensible a
mayúsculas/minúsculas**, "como Obsidian justamente" — comparación
case-insensitive simple sobre el nombre de archivo (sin normalización de
acentos adicional más allá de la que ya implique una comparación
case-insensitive estándar; Obsidian tampoco pliega acentos).

**P-3 (duplicados) — resuelto, de acuerdo con la propuesta:** si dos notas
comparten nombre de archivo en carpetas distintas, resuelve la primera que
se encuentre (orden no garantizado); caso límite documentado, no
bloqueante.

**P-4 (base técnica) — resuelto, de acuerdo con la propuesta:** sin
dependencia nueva (`remark-wiki-link` no se instala); nodo/marca propio de
Milkdown con su `parseMarkdown`/`toMarkdown`, mismo patrón que `linkSchema`
de `@milkdown/preset-commonmark`.

## 4. Criterios de aceptación (EARS booleano)

- **C-1:** CUANDO el contenido de una nota tiene `[[Destino]]` o
  `[[Destino|Alias]]`, el sistema DEBE reconocerlo como un nodo/marca propio
  al parsear a Milkdown (no como texto plano, no escapado).
- **C-2:** El sistema DEBE serializar ese nodo/marca de vuelta a
  `[[Destino]]`/`[[Destino|Alias]]` exacto (round-trip sin pérdida ni
  escape) al guardar — el nombre escrito en el markdown nunca cambia a un
  id; el id resuelto vive solo como atributo interno del nodo (ver C-7).
- **C-3:** MIENTRAS la vista sea Visual, el sistema DEBE pintar el wikilink
  con un estilo distinguible del texto normal (color/subrayado, con la
  paleta ya existente del proyecto) mostrando el **Alias** si existe, o el
  **Destino** si no.
- **C-4:** CUANDO el Destino no resuelve a ninguna nota `.md` de la misma
  bóveda (comparación case-insensitive sobre el nombre de archivo, P-1/P-2),
  el sistema DEBE pintarlo con un estilo distinto (enlace "roto") en vez de
  fallar, ocultarlo, o tratarlo como si resolviera. Incluye explícitamente
  destinos a archivos no-`.md` (`.docx`, `.pdf`, etc.) — nunca resuelven.
- **C-5:** El wikilink NO DEBE ser clickeable/navegable todavía (fuera de
  alcance, H-012) — solo visual.
- **C-6:** En vista Código y en modo Lectura, el contenido DEBE seguir
  mostrando la sintaxis `[[...]]` tal cual está en el markdown.
- **C-7 (id interno, pedido por Carlos):** CUANDO un wikilink resuelve a una
  nota, el nodo/marca DEBE cargar el `id` de esa nota como atributo interno
  (no el nombre) — el texto en pantalla/markdown sigue siendo el nombre
  (C-2/C-3), pero la resolución ya hecha debe quedar disponible por `id` para
  que una historia futura (H-012, navegación) no tenga que re-buscar por
  nombre. Con un wikilink roto (C-4) este atributo queda vacío/ausente.

`[NEEDS CLARIFICATION] = 0` — Carlos confirmó "así es" (2026-10-30).

## 5. Descartes (candidatos, a confirmar)

- Navegación por clic y creación de nota si no existe: historia aparte
  (H-012), por tamaño.
- Autocompletar al escribir `[[`: historia aparte (H-013), por tamaño y
  porque depende de tener el nodo base (H-011) ya funcionando.
- Wikilinks a secciones dentro de una nota (`[[Nota#Sección]]`, sintaxis
  también de Obsidian): no visto en el contenido real revisado; si lo usas,
  se agrega a una historia futura con su propio alcance.

## 6. Plan (de ESTA historia solamente) — borrador, se confirma al tomarla

- Nuevo módulo `frontend/src/editor/wikilink.ts`: resolución pura de un
  Destino contra la lista de notas de la bóveda abierta — nombre de archivo
  sin extensión, comparación case-insensitive (P-2), primer match si hay
  duplicados (P-3); devuelve el `id` de la nota resuelta o `null` (roto).
  Testeable por separado del editor, sin Milkdown de por medio.
- `MilkdownView.tsx`: nuevo `$MarkSchema` para `[[...]]` con su
  `parseMarkdown`/`toMarkdown` (mismo patrón que `linkSchema` de
  `@milkdown/preset-commonmark`, referencia de archivo:
  `node_modules/@milkdown/preset-commonmark/lib/mark/link.d.ts`); atributos
  del mark: `target` (el string del Destino, lo que viaja en el markdown),
  `alias` (si hay `|Alias`), y `resolvedId` (el `id` de `wikilink.ts`, C-7 —
  se recalcula al (re)resolver, no se serializa al markdown). CSS por
  atributo (`data-broken` cuando `resolvedId` es `null`) para el estilo de
  C-3/C-4.
- `NoteEditor.tsx`/`MilkdownView.tsx`: la resolución necesita la lista de
  notas de la bóveda — ya disponible vía `useSync()`/`notes` en
  `VaultWorkspacePage.tsx` (`Workspace`), pasar hacia abajo igual que
  `vaultColor`/`parseCache` hoy.
- Estrategia de prueba: `wikilink.test.ts` (resolución pura: encuentra,
  case-insensitive, duplicados→primera, no-`.md`/inexistente→`null`, alias
  vs. sin alias); `MilkdownView.test.tsx` (round-trip markdown→doc→markdown
  conserva `[[...]]` exacto sin filtrar `resolvedId`, estilo
  resuelto/roto, `resolvedId` correcto tras resolver).
- Pasos TDD: se detallan al tomar la historia (§3 del método).

## 7. Tabla de cobertura

| Criterio | Paso/implementación | Prueba(s) |
|---|---|---|
| **C-1** (reconocer `[[...]]` al parsear) | `wikilink.ts` `splitWikiLinks`/`parseWikiLinkBody`; transformador remark `wikilinkRemark` + `parseMarkdown` del `$MarkSchema` en `MilkdownView.tsx` | `wikilink.test.ts` → "splitWikiLinks …", "parseWikiLinkBody …"; `MilkdownView.test.tsx` → "C-1/C-3: `[[Nota A]]` se pinta como enlace …" |
| **C-2** (round-trip sin escapar; id nunca en el markdown) | `toMarkdown` del `$MarkSchema` + handler `wikiLink` de `remark-stringify` en `wikilinkRemark` | `MilkdownView.test.tsx` → "C-2: el round-trip conserva `[[Destino]]` y `[[Destino\|Alias]]` sin escapar" |
| **C-3** (estilo distinguible, alias o destino) | `toDOM` (`a.wikilink`) + `editor.css` (`.wikilink`) | `MilkdownView.test.tsx` → "C-1/C-3 …", "C-3: con alias muestra el alias, no el destino" |
| **C-4** (destino sin nota `.md` → roto; incluye no-`.md`) | `resolveWikiLink` (`wikilink.ts`) + `data-broken` en `toDOM` + `editor.css` (`.wikilink[data-broken]`) | `wikilink.test.ts` → ".docx nunca resuelve", "inexistente → null"; `MilkdownView.test.tsx` → "C-4: … enlace roto", "C-4: … (.docx) nunca resuelve" |
| **C-5** (no navegable aún) | `toDOM` sin `href`; `editor.css` `cursor: text` | `MilkdownView.test.tsx` → "C-1/C-3 … y sin href (C-5)" |
| **C-6** (Código y Lectura: `[[...]]` literal) | En `MilkdownView.tsx` la marca/transformador SÓLO se añaden cuando `!readOnly`; Código es `CodeView` (markdown crudo) | `MilkdownView.test.tsx` → "C-6: en modo Lectura … `[[...]]` literal" |
| **C-7** (id interno resuelto en la marca) | atributo `resolvedId` del `$MarkSchema`, recalculado por `wikilinkResolverCtx`; cableado `VaultWorkspacePage → NoteEditor(vaultNotes) → MilkdownView(notes)` | `wikilink.test.ts` → "coincidencia exacta → id", "duplicado → primero"; `MilkdownView.test.tsx` → "C-7: la marca carga el `id` resuelto"; `NoteEditor.test.tsx` → "reenvía `vaultNotes` a la vista Visual" |

## 8. Checkpoint demostrable

Carlos debe abrir una nota con `[[...]]` reales (p. ej. la de "El Juramento
del Aprendiz Masón" usada de ejemplo arriba) en modo Visual y confirmar que
ya no se escapa, se ve como enlace, y el que apunta al `.docx` se ve como
enlace roto (o lo que P-1 defina).

## 9. Session-End (al cerrar) — 2026-10-30 (Modo 2, Claude Code)

**Claim:** los wikilinks `[[Destino]]`/`[[Destino|Alias]]` dejan de escaparse y, en edición
Visual, se reconocen y pintan como enlace (resuelto o roto); el round-trip markdown→editor→
markdown conserva la sintaxis exacta; la nota resuelta queda disponible por `id` en la marca.
Cubre C-1..C-7. No incluye navegación (C-5, va en H-012) ni autocompletar (H-013).

**Evidencia:**
- `frontend/src/editor/wikilink.ts` (+ `wikilink.test.ts`, 18 casos): resolución pura —
  `parseWikiLinkBody`, `resolveWikiLink` (case-insensitive P-2, duplicados→primero P-3, no-`.md`/
  inexistente→`null` P-1/C-4), `splitWikiLinks` (reconocimiento C-1).
- `frontend/src/editor/MilkdownView.tsx` (+ 7 casos nuevos en `MilkdownView.test.tsx`): `$MarkSchema`
  `wikilink` con `parseMarkdown`/`toMarkdown` propios (patrón `linkSchema`), transformador remark
  `wikilinkRemark` (texto→nodo `wikiLink` + handler de `remark-stringify`, sin dependencia nueva P-4),
  rebanada `wikilinkResolverCtx`. Marca/transformador SÓLO en `!readOnly` (C-6). `toDOM` sin `href`
  (C-5) y con `data-broken` (C-4); atributo interno `resolvedId` (C-7).
- `frontend/src/editor/editor.css`: estilo `.wikilink` (acento + subrayado, C-3) y `.wikilink[data-broken]`
  (peligro + punteado, C-4).
- Cableado `frontend/src/notes/VaultWorkspacePage.tsx` → `NoteEditor.tsx` (`vaultNotes`) → `MilkdownView`
  (`notes`), reutilizando el listado de notas vivas que ya se calcula para Atrás/Adelante (+ 1 caso en
  `NoteEditor.test.tsx`).
- Verificación empírica previa del parseo/serializado de `[[...]]` con remark real (texto plano ↔
  `[[...]]` sin escape) antes de codificar.

**Línea base:** `npx vitest run` (desde `frontend/`) — Converge: 2 corridas consecutivas limpias,
89 archivos, **1740 tests, 0 fallos** (baseline previa 1714 + 26 nuevos). `tsc --noEmit -p tsconfig.json`
sin errores. El test intermitente preexistente de `NoteSidebar` «Nueva carpeta» (H-007) pasó en ambas
corridas; no se tocó.

**Gaps / riesgo residual:**
- **Interpretación de C-6 a confirmar en el checkpoint (Medium):** se implementó literalmente —en modo
  **Lectura** y en vista **Código** el wikilink se muestra como texto `[[...]]`; el pintado como enlace
  ocurre sólo en edición Visual (C-3). Si Carlos esperaba verlo pintado también en Lectura, es un cambio
  de una línea (añadir la marca/transformador también en `readOnly`); se decidió seguir el texto EARS.
- **Reconocimiento sólo al parsear (Low):** escribir `[[` nuevo a mano en Visual no lo convierte en vivo
  (no hay *input rule*); se reconoce al abrir/reparsear la nota. No lo pide ningún criterio de H-011;
  encaja mejor con H-013 (autocompletar).
- **Paste interno de un wikilink dentro del editor (Low):** `parseDOM` recupera destino/alias desde los
  `data-*`, pero `resolvedId` queda `null` hasta el próximo reparse por markdown (no se expone el id al
  DOM a propósito, C-7 «atributo interno»). Sin impacto en el round-trip markdown.
- **Resolución por nombre de archivo (Low):** un `[[folder/Nota]]` con ruta no casa con el *basename*
  `Nota` (el contenido real revisado usa sólo nombres cortos). Documentado; no es criterio.
- **Commits (proceso):** el entorno headless bloquea todo `git` (requiere aprobación interactiva), así que
  NO se pudieron hacer los commits atómicos por paso ni dejar la historia commiteada; todos los cambios
  quedan en el árbol de trabajo para revisión por *git diff* y commit/merge de Carlos.

**Próximo paso:** checkpoint demostrable (Carlos abre una nota con `[[...]]` reales en Visual: ya no se
escapan, se ven como enlace, el `.docx` como roto) y, con su «ok», marcar `verified` (§5). Luego H-012
(navegación por clic usando el `resolvedId` ya guardado) y H-013 (autocompletar).
