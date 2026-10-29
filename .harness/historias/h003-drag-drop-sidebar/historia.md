---
id: H-003
titulo: Drag & drop de notas/carpetas en la sidebar izquierda
estado: implemented # Gate 1 pasado (Carlos dijo "así es", 2026-10-29); implementado 2026-10-29, falta checkpoint demostrable.
covers:
  - frontend/src/notes/NoteSidebar.tsx
  - frontend/src/notes/NoteSidebar.test.tsx
  - frontend/src/notes/noteStore.ts
  - frontend/src/notes/noteStore.test.ts
  - frontend/src/notes/folders.ts
  - frontend/src/notes/folders.test.ts
anchor_commit: 593dc4f
origen: backlog
---

# H-003 — Drag & drop de notas/carpetas en la sidebar izquierda

## 1. Intención (lenguaje de usuario)

Pedido directo de Carlos (2026-10-27, refinado y confirmado 2026-10-29): poder
arrastrar una nota o una carpeta en el árbol de la sidebar izquierda
(`NoteSidebar.tsx`) para moverla, en vez de usar solo el formulario de
renombrado de ruta que ya existe hoy.

**No es una capacidad nueva de backend** — `PATCH /vaults/{vault_id}/notes/{note_id}`
con `path` ya mueve una nota de carpeta (es exactamente lo que hace el
renombrado actual, `notes.rename(id, path, rev)` en `NoteSidebar.tsx:308`).
Esta historia es la interacción de arrastre sobre esa misma operación, no un
endpoint nuevo.

## 2. Alcance / fuera de alcance

- Dentro: arrastrar una nota sobre una carpeta (o "Raíz") → la mueve; arrastrar
  una carpeta sobre otra (o "Raíz") → mueve todo su contenido; feedback visual
  del destino durante el arrastre; mismo manejo de conflicto de ruta que ya
  tiene el renombrado hoy (`note-path-taken` / mensaje de `folders.ts`).
- Fuera: mover entre bóvedas distintas; deshacer (undo) de un movimiento; el
  formulario de renombrado de ruta por teclado **no se toca ni se reemplaza**
  (sigue siendo la vía accesible sin mouse).

## 3. Criterios de aceptación (EARS booleano)

- **C-1:** CUANDO el usuario arrastra una fila de nota (`treeitem`) y la
  suelta sobre una fila de carpeta o sobre "Raíz", el sistema DEBE mover esa
  nota ahí (mismo efecto que editar su `path` completo vía renombrado:
  `notes.rename`).
- **C-2:** CUANDO el usuario arrastra una fila de carpeta y la suelta sobre
  otra carpeta o sobre "Raíz", el sistema DEBE mover **todas** las notas cuyo
  `path` empieza con el prefijo de esa carpeta al nuevo prefijo, preservando
  la subestructura relativa.
- **C-3:** MIENTRAS dura el arrastre, el sistema DEBE resaltar visualmente la
  fila de carpeta/"Raíz" que es destino válido bajo el cursor.
- **C-4:** SI se suelta fuera de una fila de carpeta o "Raíz" válida (p. ej.
  sobre otra nota, o fuera del árbol), ENTONCES el sistema NO DEBE mover nada.
- **C-5:** SI el destino ya tiene una nota o carpeta con el mismo nombre final
  (conflicto de ruta), ENTONCES el sistema DEBE mostrar el mismo error que ya
  usa el renombrado hoy (`note-path-taken` / `folderNameMessage`/`folderExists`
  de `folders.ts`), sin mover nada.
- **C-6:** El formulario de renombrado de ruta por teclado (ya existente) DEBE
  seguir funcionando sin cambios — el drag & drop es una vía adicional, no un
  reemplazo (requisito de accesibilidad: arrastrar con mouse no es la única
  forma de mover).
- **C-7:** Arrastrar un nodo sobre sí mismo, sobre su propio descendiente, o
  soltar sin desplazamiento real (mismo origen = mismo destino) NO DEBE hacer
  ninguna llamada de red.

`[NEEDS CLARIFICATION] = 0`.

## 4. Casos límite y errores

- Arrastrar una carpeta dentro de sí misma o de una de sus subcarpetas:
  bloqueado (C-7), evita mover una carpeta dentro de su propio contenido.
- Fallo de red al mover (nota o alguna nota del lote de una carpeta): error
  visible, estado del árbol no se dibuja como movido si la escritura falló
  (consistente con cómo `rename` ya maneja sus propios errores hoy).
- Mover una carpeta con muchas notas: operación secuencial reusando
  `notes.rename` por nota (no hay endpoint de "mover carpeta" en el backend,
  no se añade uno — fuera de alcance de esta historia; si el volumen real
  importa se mide y se abre historia aparte).

## 5. Descartes

Ninguno — Carlos aprobó la propuesta tal cual ("así es", 2026-10-29).

## 6. Plan (de ESTA historia solamente)

- No toca backend (reusa `PATCH .../notes/{note_id}` ya probado).
- Componentes: handlers de drag & drop nativos de HTML5
  (`draggable`, `onDragStart`, `onDragOver`, `onDrop`) sobre las filas
  `treeitem` ya existentes en `NoteSidebar.tsx` (nota: función de render de
  filas, buscar en el propio archivo durante el driver/navigator — no
  duplicar lógica de árbol ya hecha en `buildTree`/`noteTree.ts`).
  Reusa `notes.rename` (nota individual) y añade, si no existe ya un
  equivalente de lote en `noteStore.ts`, una función que itere las notas con
  el prefijo de la carpeta movida y llame `rename` por cada una.
- Estrategia de prueba: `NoteSidebar.test.tsx` (drag nota→carpeta, drag
  carpeta→carpeta con varias notas hijas, C-3 resaltado, C-4 soltar fuera no
  mueve, C-5 conflicto muestra error, C-6 renombrado por teclado sigue
  intacto, C-7 self-drop no hace red) — Testing Library con eventos
  `fireEvent.dragStart/dragOver/drop`. `noteStore.test.ts` si se añade la
  función de mover-carpeta-en-lote.
- Pasos TDD ordenados:
  1. `CHECK:` si hace falta una función de mover-carpeta-en-lote en
     `noteStore.ts`, test rojo primero / `EXPECT:` verde con la función
     mínima (reusando `rename` existente, sin reinventar el PATCH).
  2. `CHECK:` `NoteSidebar.test.tsx` rojo para C-1/C-4/C-7 (drag de nota,
     fuera de destino válido, self-drop) / `EXPECT:` verde con los handlers
     de drag en la fila de nota.
  3. `CHECK:` `NoteSidebar.test.tsx` rojo para C-2 (drag de carpeta, varias
     notas hijas se mueven) / `EXPECT:` verde.
  4. `CHECK:` `NoteSidebar.test.tsx` rojo para C-3 (resaltado visual) y C-5
     (conflicto de ruta) / `EXPECT:` verde.
  5. `CHECK:` `NoteSidebar.test.tsx` rojo para C-6 (el renombrado por teclado
     sigue pasando sus tests ya existentes, sin romperse) / `EXPECT:` verde,
     regresión completa de frontend.
- Impacto en documentación (Art. 11): línea en `frontend/src/README.md`
  mencionando drag & drop en la sidebar, junto a la mención existente del
  renombrado.

## 7. Tabla de cobertura

| Criterio | Paso(s) | Test | Estado |
|---|---|---|---|
| C-1 | 2 | `NoteSidebar.test.tsx` («arrastrar una nota … sobre una carpeta»; «… sobre «Raíz»») | Done |
| C-2 | 1, 3 | `noteStore.test.ts` («moveFolder …»); `NoteSidebar.test.tsx` («arrastrar una carpeta sobre otra»; «… sobre «Raíz»») | Done |
| C-3 | 4 | `NoteSidebar.test.tsx` («el destino bajo el cursor se resalta»; «un destino no válido … no se resalta») | Done |
| C-4 | 2 | `NoteSidebar.test.tsx` («soltar una nota sobre otra nota … no mueve nada») | Done |
| C-5 | 1, 4 | `noteStore.test.ts` («una ruta de destino ya ocupada → NotePathTakenError»); `NoteSidebar.test.tsx` («… ya hay otra con ese nombre»; «… ya existe otra carpeta con ese nombre») | Done |
| C-6 | 5 | `NoteSidebar.test.tsx` («el drag & drop es aditivo … F2 sigue abriendo el renombrado») + suite de renombrado por teclado ya existente | Done |
| C-7 | 2, 3 | `NoteSidebar.test.tsx` («soltar una nota en la carpeta donde ya está …»; «arrastrar una carpeta sobre un descendiente …») | Done |

## 8. Checkpoint demostrable

Pendiente — Carlos debe abrir Synapse, arrastrar una nota a otra carpeta y
arrastrar una carpeta con varias notas, y confirmar que se movieron
correctamente, antes de marcar `verified`.

## 9. Session-End (al cerrar)

- **Claim:** implementado el drag & drop de notas/carpetas en la sidebar (C-1…C-7),
  reusando el PATCH de ruta existente (`notes.rename` por nota, nuevo `notes.moveFolder`
  en lote para carpetas); sin cambios de backend.
- **Evidencia:** 5 pasos TDD con commit atómico cada uno citando H-003
  (`noteStore.moveFolder`; nota→carpeta/Raíz; carpeta→carpeta/Raíz; resaltado+conflicto;
  C-6 aditivo). `npm run build` verde (typecheck + vite build). `npm run test:cov` verde:
  **1670 tests / 88 archivos**. Cobertura de lo tocado: `folders.ts` 100 %,
  `NoteSidebar.tsx` 98,34 % (líneas sin cubrir 571-573/613-616 son preexistentes:
  `revealFolder` raíz y el disclosure compacto, ajenas a esta historia),
  `noteStore.ts` 95,96 % (funciones 100 %).
- **Gaps:** mover una carpeta con muchas notas es secuencial (un `rename` por nota, igual
  que hoy el renombrado); si el volumen real importa se mide y se abre historia aparte
  (ya anotado en §4). Sin undo (fuera de alcance).
- **Riesgo residual:** los `event.dataTransfer` sólo se ejercen en navegador real (en jsdom
  `fireEvent` no lo puebla), de ahí el guard defensivo y la rama de branch-coverage no
  cubierta; la lógica de movimiento no depende de `dataTransfer`, usa el estado de React.
- **Próximo paso:** checkpoint demostrable (§8) — Carlos arrastra una nota y una carpeta en
  Synapse y confirma; luego `verified`, PR y merge (los hace Carlos; sin push/merge del agente).
