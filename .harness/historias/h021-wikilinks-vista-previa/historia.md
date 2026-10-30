---
id: H-021
titulo: Vista previa emergente de wikilinks en Lectura (y crear la nota faltante en la carpeta de origen)
estado: tomada # Gate 1 pasado — Carlos respondió P-1..P-4 (2026-10-30); se implementa DESPUÉS de mergear H-015 (ambas tocan MilkdownView.tsx y NoteEditor.tsx).
covers:
  - frontend/src/editor/MilkdownView.tsx
  - frontend/src/editor/MilkdownView.test.tsx
  - frontend/src/editor/WikilinkPreview.tsx
  - frontend/src/editor/NoteEditor.tsx
  - frontend/src/editor/editor.css
  - frontend/src/notes/VaultWorkspacePage.tsx
origen: backlog
---

# H-021 — Vista previa emergente de wikilinks (estilo Obsidian)

## 1. Intención (lenguaje de usuario)

Pedido de Carlos (2026-10-30): en modo Lectura, al pasar el mouse sobre un
wikilink, una ventana emergente con una vista rápida del inicio del documento
enlazado, sin ir a él (como Obsidian). Base existente: el wikilink resuelto
guarda el `resolvedId` (H-011 C-7), es clickeable en Lectura (H-012) y la nota
se lee de la réplica local, sin red.

## 2. Alcance / fuera de alcance

- Dentro: tarjeta emergente sobre wikilinks en Lectura (resueltos y rotos sin
  extensión); crear la nota faltante, desde el clic (H-012) y desde la
  tarjeta, en la carpeta de la nota de origen.
- Fuera: edición Visual y Código; enlaces normales `[](url)`; editar desde la
  tarjeta; adjuntos (historias de archivos); accesibilidad por teclado.
- Orden: se toma después de mergear H-015.

## 3. Decisiones de producto (Carlos, 2026-10-30)

- **P-1:** la tarjeta muestra SOLO el título de la nota y el comienzo de su
  contenido **renderizado** (encabezados, negritas, listas con los colores de
  la bóveda). **No se muestran las propiedades/metadatos YAML** del inicio.
- **P-2:** ~320 px de ancho, ~12 líneas, con desvanecido al final si hay más.
- **P-3:** retardo de ~400 ms al pasar el mouse; se cierra al salir. En
  celular NO hay vista previa y el toque sigue navegando como hoy.
- **P-4:** el wikilink roto muestra una nota del tipo "Esta nota no existe.
  Clic para crearla". Para un destino con extensión de archivo ajena
  (`.docx`, `.pdf`…) no se muestra tarjeta (decisión de AIRA, coherente con
  H-012 donde ese clic no hace nada).
- **Dónde se crea la nota (pregunta de Carlos, adoptada):** en la **carpeta
  de la nota donde está el enlace**, no en la raíz. Si el destino trae ruta
  (`[[Carpeta/Nota]]`) la ruta cuenta desde la raíz de la bóveda. Esto
  **cambia el comportamiento ya desplegado de H-012** (hoy crea en la raíz).

## 4. Criterios de aceptación (EARS booleano)

- **C-1:** MIENTRAS la nota esté en Lectura y el dispositivo tenga puntero
  (mouse), CUANDO el puntero permanece ~400 ms sobre un wikilink resuelto, el
  sistema DEBE mostrar una tarjeta junto al enlace con el título de la nota
  destino y el inicio de su contenido renderizado, sin el bloque de
  propiedades YAML.
- **C-2:** La tarjeta DEBE medir ~320 px de ancho y ~12 líneas de alto máximo,
  con desvanecido si el contenido continúa.
- **C-3:** La tarjeta DEBE ocultarse al salir el puntero del enlace y de la
  tarjeta, NO DEBE impedir el clic de navegación de H-012 y DEBE quedar dentro
  de la ventana (se reposiciona si no cabe) sin provocar scroll.
- **C-4:** El contenido de la tarjeta DEBE cumplir RNF-003 (sin HTML crudo,
  enlaces/imágenes por `safeUrl`) y los wikilinks dentro de ella NO DEBEN ser
  navegables.
- **C-5:** En edición Visual, en Código y en pantallas sin puntero NO DEBE
  aparecer ninguna tarjeta.
- **C-6:** CUANDO el puntero está sobre un wikilink roto sin extensión de
  archivo, el sistema DEBE mostrar "Esta nota no existe. Clic para crearla";
  con extensión ajena NO DEBE mostrar tarjeta.
- **C-7:** CUANDO el usuario crea una nota desde un wikilink roto (clic o
  tarjeta), el sistema DEBE crearla en la carpeta de la nota de origen (o en
  la ruta indicada por el destino, desde la raíz) y abrirla en edición.
- **C-8:** Una nota enlazada vacía (o sin cuerpo tras las propiedades) DEBE
  mostrar la tarjeta con el título y "Nota vacía", sin errores.
- **C-9:** La tarjeta DEBE tener el contraste mínimo de texto del proyecto en
  ambos temas.

`[NEEDS CLARIFICATION] = 0` — Carlos confirmó P-1..P-4 (2026-10-30).

## 5. Plan (borrador, se confirma al tomarla)

- `MilkdownView.tsx`: en el plugin de Lectura de H-012, `handleDOMEvents`
  mouseover/mouseout que detectan la marca `wikilink` por POSICIÓN (lección de
  H-012: no por el nodo ancestro) y avisan al padre con `resolvedId`/`target` y
  el rectángulo del enlace.
- `WikilinkPreview.tsx`: tarjeta flotante (portal); carga la nota por
  `resolvedId` desde la réplica local, quita el frontmatter (utilidades de
  `frontmatter.ts`/`legacyBlock.ts` existentes), trunca el cuerpo y lo muestra
  con una instancia de `MilkdownView` de solo lectura (wikilinks inertes).
- Carpeta de creación: `NoteEditor` conoce `note.path`; se pasa la carpeta de
  origen a `openWikilink` en `VaultWorkspacePage.tsx` y se resuelve el destino
  contra ella (hoy `notes.create(vault.id, target)` crea en la raíz).
- Pruebas: componente (retardo, cierre, reposicionado, nota vacía, solo
  Lectura/mouse), resolución de ruta de creación, y verificación real en
  navegador con usuario y bóveda desechables (hover real vía CDP).

## 6. Tabla de cobertura

(se llena al implementar)

## 7. Checkpoint demostrable

Carlos pasa el mouse sobre un wikilink resuelto y ve la tarjeta (título e
inicio renderizado, sin metadatos); sobre uno roto ve el aviso y, al hacer
clic, la nota se crea en la misma carpeta del documento y se abre en edición.

## 8. Session-End

Pendiente.
