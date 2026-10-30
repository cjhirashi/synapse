---
id: H-012
titulo: Wikilinks — navegar al hacer clic (y crear la nota si el destino no existe)
estado: implemented # Gate 1 pasado (Carlos "así es" 2026-10-30); implementado en Modo 2 vía Claude Code 2026-10-30. Falta checkpoint demostrable para pasar a verified.
covers:
  - frontend/src/editor/wikilink.ts
  - frontend/src/editor/wikilink.test.ts
  - frontend/src/editor/MilkdownView.tsx
  - frontend/src/editor/MilkdownView.test.tsx
  - frontend/src/editor/NoteEditor.tsx
  - frontend/src/editor/NoteEditor.test.tsx
  - frontend/src/editor/editor.css
  - frontend/src/notes/VaultWorkspacePage.tsx
  - frontend/src/notes/VaultWorkspacePage.wikilink.test.tsx
origen: backlog
---

# H-012 — Wikilinks: navegar al hacer clic

## 1. Intención (lenguaje de usuario)

Pedido de Carlos (2026-10-30), inmediatamente después de confirmar el
checkpoint de H-011 (los wikilinks ya se ven como enlace en Lectura y
Visual): "si presiono el link, me debe abrir el documento al que está
linkeado, de nada me sirve que solo muestre el link pero no haga nada al
presionarlo". Es la pieza (3) que H-011 dejó fuera a propósito por tamaño
(ver `historias/h011-wikilinks-reconocer-mostrar/historia.md` §1/§5).

El wikilink ya resuelve y guarda el `id` de la nota destino como atributo
interno de la marca (`resolvedId`, C-7 de H-011) — esta historia usa ese
dato para navegar, sin tener que volver a buscar por nombre.

## 2. Alcance / fuera de alcance

- Dentro: clic en un wikilink **resuelto**, SÓLO en modo Lectura, abre esa
  nota en el workspace; clic en un wikilink **roto** en Lectura — crea+abre
  si el destino no tiene extensión de archivo, no hace nada si la tiene;
  estilo de cursor que indique que el enlace resuelto es clickeable.
- Fuera: cualquier navegación por clic en edición Visual o Código (el clic
  ahí nunca navega, ver P-2 resuelto); autocompletar al escribir `[[`
  (H-013); navegar a una sección dentro de la nota (`[[Nota#Sección]]`, no
  visto en el contenido real); navegación programática por agentes vía API
  REST (ver Descartes — probablemente ya cubierto sin código nuevo).

## 3. Decisiones de producto (Gate 1, Carlos, 2026-10-30 — "así es")

**P-1 (clic en wikilink roto) — resuelto:** si el destino **no tiene
extensión** de archivo y no existe ninguna nota con ese nombre, el clic
**crea una nota nueva vacía** con ese nombre en la raíz de la bóveda y la
abre en edición — como Obsidian. Si el destino tiene una extensión que
Synapse no gestiona (`.docx`, `.pdf`, etc.), el clic no hace nada.

**P-2 (clic en modo edición Visual) — resuelto, más simple que mi
propuesta:** el wikilink **sólo ejecuta la navegación en modo Lectura**. En
edición Visual (y en Código, que ni siquiera tiene la marca) el clic
**nunca navega** — ni con modificador. El clic ahí se comporta como
siempre: coloca el cursor para editar. No hace falta distinguir Ctrl/Cmd+clic
de clic simple; basta con que el handler de clic exista sólo cuando
`readOnly` es `true`.

**P-3 (abre en qué modo) — resuelto:** la nota destino abre en **Lectura**,
igual que el resto de la navegación de la app, salvo la nota recién creada
por un wikilink roto (P-1), que abre en edición.

## 4. Criterios de aceptación (EARS booleano)

- **C-1:** MIENTRAS la nota esté en modo Lectura, CUANDO el usuario hace
  clic sobre un wikilink **resuelto**, el sistema DEBE abrir la nota de
  `resolvedId` en Lectura (misma bóveda), sin perder el estado de la nota
  de origen si el usuario regresa (Atrás/Adelante ya existente).
- **C-2:** El wikilink resuelto DEBE mostrar un cursor de puntero (no de
  texto) para indicar que es clickeable, distinto del wikilink roto.
- **C-3:** MIENTRAS la nota esté en modo Lectura, CUANDO el usuario hace
  clic sobre un wikilink **roto** cuyo destino no tiene extensión de
  archivo, el sistema DEBE crear una nota vacía con ese nombre en la raíz
  de la bóveda y abrirla en edición. CUANDO el destino SÍ tiene extensión
  de archivo (`.docx`, `.pdf`, etc.), el clic NO DEBE hacer nada.
- **C-4:** En edición Visual, el clic sobre un wikilink NUNCA DEBE navegar
  ni crear nada — se comporta como clic en texto normal (coloca el cursor).
- **C-5:** El wikilink NUNCA DEBE navegar desde la vista Código (sigue sin
  marca ahí, herencia de H-011 C-6).

`[NEEDS CLARIFICATION] = 0` — Carlos confirmó "así es" (2026-10-30).

## 5. Descartes (candidatos, a confirmar)

- Navegar a una sección dentro de la nota (`[[Nota#Sección]]`): no visto en
  el contenido real; historia aparte si Carlos lo pide.
- Exponer `resolvedId` por la API REST para que agentes naveguen
  programáticamente: probablemente innecesario como código nuevo — un
  agente que ya lee el contenido de una nota (H-004.1) ve el texto
  `[[Destino]]` tal cual y puede resolverlo él mismo listando las notas de
  la bóveda (mismo algoritmo de `wikilink.ts`, documentado y reproducible).
  Si Carlos quiere que el agente no tenga que reimplementar esa lógica, es
  una historia aparte (exponer un endpoint de resolución).

## 6. Plan (de ESTA historia solamente) — borrador, se confirma al tomarla

- `MilkdownView.tsx`: handler de clic a nivel de plugin ProseMirror
  (`handleClickOn`/`handleDOMEvents.click`), registrado **sólo cuando
  `readOnly` es `true`** (P-2: en edición no existe el handler, así que un
  clic ahí nunca navega — no hace falta detectar modificadores). En esa
  posición del documento ya se puede leer la marca `wikilink` y su
  `resolvedId` directo del nodo, sin viaje por el DOM. Expone un callback al
  padre (mismo patrón que `onRevealFolder`/`onRename` ya existentes en
  `NoteEditor.tsx`) con el `resolvedId` (resuelto) o el `target`+`broken`
  (roto, para que el padre decida crear según P-1 si el target no trae
  extensión de archivo).
  - CSS: `cursor: pointer` sólo en wikilinks resueltos (`a.wikilink:not([data-broken])`).
- `NoteEditor.tsx` → `VaultWorkspacePage.tsx`: nuevo callback (p. ej.
  `onOpenWikilink`) que reusa la función `open(id)` ya existente para
  navegar (mismo mecanismo que usa el historial Atrás/Adelante, abre en
  Lectura); si el wikilink es roto y el target no tiene extensión (P-1),
  reusa `notes.create(vaultId, "", target)` (ya usado por
  `NoteSidebar.tsx`) y abre el resultado en edición.
- Estrategia de prueba: `MilkdownView.test.tsx` (clic en resuelto, en
  Lectura, dispara el callback con el id correcto; en edición Visual el
  handler ni se registra — clic no dispara nada; roto sin extensión pide
  crear, roto con extensión no hace nada); `NoteEditor.test.tsx`/
  `VaultWorkspacePage.test.tsx` si hace falta probar la navegación real.
- Pasos TDD: se detallan al tomar la historia (§3 del método).

## 7. Tabla de cobertura

| Criterio | Paso/implementación | Prueba(s) |
|---|---|---|
| **C-1** (Lectura: clic en resuelto abre destino en Lectura, sin perder Atrás/Adelante) | `MilkdownView.tsx` plugin `handleClickOn` (sólo si `readOnly`) lee la marca `wikilink` del nodo y avisa `onWikilinkClick({resolvedId, target})`; `NoteEditor.tsx` lo reenvía como `onOpenWikilink`; `VaultWorkspacePage.tsx` `openWikilink` llama al `open(id)` ya existente (mismo mecanismo que el historial) | `MilkdownView.test.tsx` → "C-1: … clic en un wikilink resuelto avisa con su `resolvedId`"; `NoteEditor.test.tsx` → "reenvía el clic de wikilink de la vista (Lectura) a `onOpenWikilink`"; `VaultWorkspacePage.wikilink.test.tsx` → "C-1: clic en wikilink resuelto abre esa nota en Lectura" |
| **C-2** (resuelto con cursor de puntero, distinto del roto) | `editor.css` → `.milkdown-view[data-mode="read"] … a.wikilink:not([data-broken]) { cursor: pointer }`; la distinción se apoya en el atributo `data-broken` (ausente en resuelto, presente en roto) | `MilkdownView.test.tsx` → "C-6 (corregido): … resuelto o roto" y "C-4: … (.docx) nunca resuelve (roto)" fijan la ausencia/presencia de `data-broken` que gobierna el cursor (el valor de cursor es CSS, se confirma en el checkpoint) |
| **C-3** (roto sin extensión crea+abre edición; con extensión ajena no hace nada) | `wikilink.ts` `hasUnmanagedExtension` (`.md` sí la gestiona → crea); `VaultWorkspacePage.tsx` `openWikilink` → `notes.create(vaultId, target)` + `open(id,{edit:true})`, o retorno temprano | `wikilink.test.ts` → "hasUnmanagedExtension …" (5 casos); `VaultWorkspacePage.wikilink.test.tsx` → "C-3: … sin extensión crea la nota en la raíz y la abre en edición" y "C-3: … con extensión ajena (.docx) no hace nada" |
| **C-4** (edición Visual: el clic nunca navega ni crea) | El plugin `handleClickOn` se añade SÓLO en la rama `readOnly` del `concat` de plugins de `MilkdownView.tsx`; en edición ni existe | `MilkdownView.test.tsx` → "C-4: en edición Visual el handler no se registra, así que un clic no avisa nada" |
| **C-5** (nunca navega desde Código) | Código es `CodeView` (texto plano, sin marca `wikilink`); `NoteEditor.tsx` sólo pasa `onWikilinkClick` a la vista Visual en Lectura, nunca a `Code` | `NoteEditor.test.tsx` → "C-5: la vista Código no recibe `onWikilinkClick`" (+ herencia de H-011: Código muestra `[[...]]` literal) |

(Nota: el gesto de clic real atraviesa `posAtCoords` de ProseMirror, que jsdom no soporta; los tests invocan el `handleClickOn` ya registrado como lo haría ProseMirror. El clic físico se valida en el checkpoint demostrable.)

## 8. Checkpoint demostrable

Carlos debe hacer clic en un wikilink resuelto en Lectura y confirmar que
abre la nota correcta; probar el gesto de P-2 en edición Visual; y probar
un wikilink roto según lo que P-1 defina.

## 9. Session-End (al cerrar) — 2026-10-30 (Modo 2, Claude Code)

**Claim:** en modo **Lectura**, hacer clic en un wikilink **resuelto** abre la nota destino (por el
`resolvedId` ya guardado en H-011) en Lectura, usando el mismo `open(id)` del árbol/historial; el clic en
un wikilink **roto** crea una nota vacía con ese nombre en la raíz y la abre en edición si el destino no
trae extensión de archivo ajena, y no hace nada si la trae (`.docx`, `.pdf`…). En edición Visual y en
Código el clic nunca navega. Cubre C-1..C-5.

**Evidencia (archivos tocados + pasos TDD):**
- `frontend/src/editor/wikilink.ts` (+ `wikilink.test.ts`, 5 casos nuevos): `hasUnmanagedExtension` —
  distingue el destino roto creable (sin extensión o `.md`, que Synapse sí gestiona) del no-creable
  (extensión ajena); ignora puntos internos seguidos de espacio (C-3/P-1).
- `frontend/src/editor/MilkdownView.tsx` (+ 3 casos en `MilkdownView.test.tsx`): nueva prop
  `onWikilinkClick` y un `Plugin` de ProseMirror con `handleClickOn` añadido SÓLO en la rama `readOnly`
  del `concat` de plugins; lee `resolvedId`/`target` de la marca del nodo (sin viaje por el DOM) y consume
  el clic. En edición ni se registra (C-1/C-3/C-4/C-5).
- `frontend/src/editor/NoteEditor.tsx` (+ 2 casos en `NoteEditor.test.tsx`): prop `onOpenWikilink`,
  reenviada como `onWikilinkClick` a la vista Visual **sólo en Lectura**; test de que la vista Código
  nunca la recibe (C-5).
- `frontend/src/notes/VaultWorkspacePage.tsx` (+ nuevo `VaultWorkspacePage.wikilink.test.tsx`, 3 casos):
  `openWikilink` navega con `open(resolvedId)` (resuelto) o crea con `notes.create(vaultId, target)` +
  `open(id,{edit:true})` (roto creable) o retorna sin hacer nada (extensión ajena). (C-1/C-3)
- `frontend/src/editor/editor.css`: `cursor: pointer` en el wikilink resuelto SÓLO en Lectura
  (`data-mode="read"`), el roto conserva el de texto (C-2).
- Corrección respecto al borrador del plan: el plan §6 sugería `notes.create(vaultId, "", target)` (esa
  forma crea una CARPETA llamada `target` con una nota «Sin título» dentro, como en `NoteSidebar`); para
  cumplir C-3 ("nota con ESE nombre en la raíz") se usó `notes.create(vaultId, target)` (nombre como
  título, carpeta raíz → `target.md`). Es detalle de implementación dentro de C-3, no una decisión de
  producto nueva.

**Línea base:** `npx vitest run` (desde `frontend/`) — Converge: 2 corridas consecutivas limpias (suite
completa + las 5 suites tocadas juntas, 204/204). **90 archivos, 1752 tests, 0 fallos** (baseline previa
1740 + 12 nuevos). `npm run typecheck` (3 proyectos tsc) sin errores. El test intermitente preexistente
de `NoteSidebar` «Nueva carpeta» (H-007) no falló; no se tocó.

**Gaps / riesgo residual:**
- **Gesto de clic real no probado en jsdom (Low):** ProseMirror calcula la posición del clic con
  `posAtCoords`, que jsdom no implementa; los tests invocan el `handleClickOn` ya registrado como lo hace
  ProseMirror (posición de la marca + `direct=true`). El clic físico del usuario se valida en el
  checkpoint demostrable. El cursor de puntero (C-2) es CSS puro: tampoco se computa en jsdom; se afirma
  vía el atributo `data-broken` que lo gobierna y se confirma visualmente en el checkpoint.
- **Destino con `/` (Low):** `[[A/B]]` roto creable crearía `A/B.md` (bajo la carpeta `A`), no en la raíz
  estricta, porque `target` se pasa como título y `titleToPath` anida con `/`. El contenido real revisado
  usa sólo nombres cortos; no lo pide ningún criterio. Documentado.
- **Destino resuelto a una nota luego enviada a la papelera (Low):** `open(resolvedId)` cargaría una nota
  inexistente y el editor mostraría "en la papelera"; es el comportamiento ya existente de `open`, no un
  camino nuevo. El `resolvedId` se recalcula contra las notas vivas al reparsear.

**Próximo paso:** checkpoint demostrable — Carlos abre una nota con `[[...]]` reales en Lectura, hace clic
en uno resuelto (abre la nota correcta), prueba el clic en edición Visual (no navega) y un roto sin
extensión (crea y abre). Con su "ok" → `verified` (§5). **Pendiente de Carlos (yo NO lo hago):** revisar el
*git diff*, mergear la rama, reconstruir el contenedor, redesplegar y hacer push a origin.
