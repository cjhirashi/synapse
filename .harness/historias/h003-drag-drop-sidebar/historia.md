---
id: H-003
titulo: Drag & drop de notas/carpetas en la sidebar izquierda
estado: refinando # Gate 1 pasado (Carlos dijo "así es", 2026-10-29); falta implementar.
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
| C-1 | 2 | `NoteSidebar.test.tsx` (drag nota→carpeta) | Pending |
| C-2 | 1, 3 | `noteStore.test.ts`, `NoteSidebar.test.tsx` (drag carpeta) | Pending |
| C-3 | 4 | `NoteSidebar.test.tsx` (resaltado) | Pending |
| C-4 | 2 | `NoteSidebar.test.tsx` (soltar fuera) | Pending |
| C-5 | 4 | `NoteSidebar.test.tsx` (conflicto de ruta) | Pending |
| C-6 | 5 | `NoteSidebar.test.tsx` (renombrado por teclado intacto) | Pending |
| C-7 | 2 | `NoteSidebar.test.tsx` (self-drop sin red) | Pending |

## 8. Checkpoint demostrable

Pendiente — Carlos debe abrir Synapse, arrastrar una nota a otra carpeta y
arrastrar una carpeta con varias notas, y confirmar que se movieron
correctamente, antes de marcar `verified`.

## 9. Session-End (al cerrar)

- **Claim:** pendiente.
- **Evidencia:** pendiente.
- **Gaps:** ninguno todavía.
- **Riesgo residual:** ninguno todavía.
- **Próximo paso:** tomar la historia, ciclo driver/navigator §4.
