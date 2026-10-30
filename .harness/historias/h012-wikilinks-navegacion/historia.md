---
id: H-012
titulo: Wikilinks — navegar al hacer clic (y crear la nota si el destino no existe)
estado: tomada # Gate 1 pasado — Carlos confirmó "así es" (2026-10-30) a P-1..P-3: roto sin extensión crea+abre en edición, con extensión no hace nada; el clic SOLO navega en Lectura (en edición Visual nunca navega, sin excepción de modificador); abre en Lectura. En implementación vía Claude Code (Modo 2).
covers:
  - frontend/src/editor/MilkdownView.tsx
  - frontend/src/editor/MilkdownView.test.tsx
  - frontend/src/editor/NoteEditor.tsx
  - frontend/src/editor/NoteEditor.test.tsx
  - frontend/src/notes/VaultWorkspacePage.tsx
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

(se llena al implementar)

## 8. Checkpoint demostrable

Carlos debe hacer clic en un wikilink resuelto en Lectura y confirmar que
abre la nota correcta; probar el gesto de P-2 en edición Visual; y probar
un wikilink roto según lo que P-1 defina.

## 9. Session-End (al cerrar)

Pendiente — se completa al implementar.
