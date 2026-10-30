---
id: H-012
titulo: Wikilinks — navegar al hacer clic (y crear la nota si el destino no existe)
estado: pendiente # Gate 1 NO pasado — criterios redactados por AIRA desde la directiva de Carlos (2026-10-30); falta su "así es".
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

- Dentro: clic (o Ctrl/Cmd+clic, según P-2) en un wikilink **resuelto**
  abre esa nota en el workspace; clic en un wikilink **roto** — decisión en
  P-1; estilo de cursor que indique que el enlace resuelto es clickeable.
- Fuera: autocompletar al escribir `[[` (H-013); navegar a una sección
  dentro de la nota (`[[Nota#Sección]]`, no visto en el contenido real);
  navegación programática por agentes vía API REST (anotado en H-011 como
  posible seguimiento — ver P-3, probablemente ya cubierto sin código nuevo).

## 3. Preguntas de producto para Carlos (Gate 1)

**P-1 (clic en wikilink roto):** hoy un wikilink roto (nota inexistente o
destino no-`.md`) sólo se ve distinto (subrayado punteado, color de
peligro). Propuesta, estilo Obsidian: si el destino **no tiene extensión**
(no es claramente un archivo que Synapse no maneja, como `.docx`/`.pdf`) y
no existe ninguna nota con ese nombre, el clic **crea una nota nueva vacía**
con ese nombre en la raíz de la bóveda y la abre en edición — como Obsidian.
Si el destino SÍ tiene una extensión de archivo que Synapse no gestiona
(`.docx`, `.pdf`, etc.), el clic no hace nada (no hay nota razonable que
crear con ese nombre). ¿Así es, o prefieres que **ningún** wikilink roto
haga nada al hacer clic (más simple, sin crear notas por accidente)?

**P-2 (clic en modo edición Visual):** en Lectura no hay ambigüedad (clic =
navegar). En edición Visual, un clic normal dentro de un wikilink hoy sólo
coloca el cursor para seguir escribiendo/corrigiendo el texto — si el clic
simple navegara ahí también, sería imposible editar el texto de un wikilink
sin salir de la nota sin querer. Propuesta (como Obsidian): en edición
Visual, **Ctrl/Cmd+clic** navega; el clic simple sigue colocando el cursor
normalmente. En Lectura, clic simple navega (no hay nada que editar). ¿Así
es, o prefieres que el clic simple navegue también en edición Visual?

**P-3 (abre en qué modo):** al navegar, ¿la nota destino abre en **Lectura**
(igual que el resto de la navegación de la app — clic en el árbol, Atrás/
Adelante) o en el mismo modo en que estaba la nota de origen? Propuesta:
Lectura siempre, igual que el resto de la navegación existente, salvo que
sea una nota recién creada por un wikilink roto (P-1), que abre en edición
(ahí sí hay algo que escribir).

## 4. Criterios de aceptación (EARS booleano) — pendientes de P-1..P-3

- **C-1:** CUANDO el usuario hace clic (o Ctrl/Cmd+clic según el modo, P-2)
  sobre un wikilink **resuelto**, el sistema DEBE abrir la nota de
  `resolvedId` en el workspace (misma bóveda), sin perder el estado de la
  nota de origen si el usuario regresa (Atrás/Adelante ya existente).
- **C-2:** El wikilink resuelto DEBE mostrar un cursor de puntero (no de
  texto) para indicar que es clickeable, distinto del wikilink roto.
- **C-3 (según P-1):** el comportamiento del clic sobre un wikilink roto
  queda definido por P-1 — crear+abrir, o no hacer nada.
- **C-4 (según P-2):** en Lectura, clic simple navega. En edición Visual, el
  gesto de navegar es el que P-2 defina (Ctrl/Cmd+clic u otro) — un clic
  simple sin ese modificador NUNCA debe navegar en edición Visual (rompería
  poder editar el texto del wikilink).
- **C-5:** El wikilink NUNCA DEBE navegar desde la vista Código (sigue sin
  marca ahí, herencia de H-011 C-6).

`[NEEDS CLARIFICATION] = 3` (P-1 a P-3) — se resuelven con tu "así es".

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
  (`handleClickOn`/`handleDOMEvents.click`), no un atributo DOM nuevo — en
  esa posición del documento ya se puede leer la marca `wikilink` y su
  `resolvedId` directo del nodo, sin viaje por el DOM. Expone un callback al
  padre (mismo patrón que `onRevealFolder`/`onRename` ya existentes en
  `NoteEditor.tsx`) con el `resolvedId` (resuelto) o el `target` (roto, para
  P-1 si aplica crear).
  - CSS: `cursor: pointer` sólo en wikilinks resueltos (`a.wikilink:not([data-broken])`).
- `NoteEditor.tsx` → `VaultWorkspacePage.tsx`: nuevo callback (p. ej.
  `onOpenWikilink`) que reusa la función `open(id)` ya existente para
  navegar (mismo mecanismo que usa el historial Atrás/Adelante); si P-1
  pide crear, reusa `notes.create(vaultId, "", target)` (ya usado por
  `NoteSidebar.tsx`) antes de abrir.
- Estrategia de prueba: `MilkdownView.test.tsx` (clic en resuelto dispara el
  callback con el id correcto; en edición Visual, clic simple NO dispara,
  Ctrl/Cmd+clic sí según P-2; clic en roto según P-1); `NoteEditor.test.tsx`/
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
