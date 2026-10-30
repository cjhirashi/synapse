---
id: H-021
titulo: Vista previa emergente de wikilinks en Lectura (y crear la nota faltante en la carpeta de origen)
estado: implemented # Gate 1 pasado (Carlos, 2026-10-30). Implementado por AIRA en Modo 2 (2026-10-30); desplegada y verificada por AIRA en navegador real (2026-10-30 14:22 CDMX); pendiente checkpoint de Carlos antes de 'verified'.
covers:
  - frontend/src/editor/MilkdownView.tsx
  - frontend/src/editor/MilkdownView.test.tsx
  - frontend/src/editor/WikilinkPreview.tsx
  - frontend/src/editor/WikilinkPreview.test.tsx
  - frontend/src/editor/NoteEditor.tsx
  - frontend/src/editor/NoteEditor.test.tsx
  - frontend/src/editor/editor.css
  - frontend/src/notes/VaultWorkspacePage.tsx
  - frontend/src/notes/VaultWorkspacePage.wikilink.test.tsx
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

| Criterio | Paso(s) de implementación | Prueba(s) |
|---|---|---|
| **C-1** (tarjeta con título + inicio renderizado tras ~400 ms, puntero sobre resuelto en Lectura) | `MilkdownView` plugin hover `onWikilinkHover`; `WikilinkPreview` (retardo, título, cuerpo); `NoteEditor` lo monta en Lectura | `MilkdownView.test.tsx` «hover · C-1»; `WikilinkPreview.test.tsx` «C-1/P-3», «C-1/P-1»; `NoteEditor.test.tsx` «vista previa · C-1» |
| **C-2** (~320 px, ~12 líneas máx, desvanecido si sigue) | `WikilinkPreview` ancho 320 + `data-more`; `editor.css` `.wikilink-preview*` (max-height 18em, mask) | `WikilinkPreview.test.tsx` «C-1/P-1» (cuerpo truncado); verificación visual AIRA (geometría, jsdom no mide) |
| **C-3** (se oculta al salir del enlace y de la tarjeta; no bloquea el clic; dentro de la ventana, sin scroll) | `MilkdownView` `mouseout`→null (no consume el evento); `WikilinkPreview` periodo de gracia + `mouseenter/leave`; `position: fixed` con reposición arriba | `MilkdownView.test.tsx` «hover · C-3»; `WikilinkPreview.test.tsx` «C-3» (×2); reposición/scroll: verificación AIRA |
| **C-4** (RNF-003 sin HTML crudo; wikilinks internos no navegables) | `WikilinkPreview` reusa la vista de sólo lectura SIN `onWikilinkClick`/`onWikilinkHover`; sin `innerHTML` | `WikilinkPreview.test.tsx` «C-4»; `securityGuard.test.ts` (RNF-003, verde) |
| **C-5** (nada en Visual, Código ni sin puntero) | plugin hover sólo en `readOnly`; `NoteEditor` gatea por `matchMedia("(hover: hover) and (pointer: fine)")` y sólo en `mode==="read"` | `MilkdownView.test.tsx` «hover · C-5»; `NoteEditor.test.tsx` «C-5 edición», «C-5 sin puntero» |
| **C-6** (roto sin extensión → aviso; con extensión ajena → sin tarjeta) | `WikilinkPreview` rama `resolvedId===null` con `hasUnmanagedExtension` | `MilkdownView.test.tsx` «hover · C-6»; `WikilinkPreview.test.tsx` «C-6» (×2) |
| **C-7** (crear la nota en la carpeta de origen, o desde raíz si trae `/`, y abrir en edición) | `VaultWorkspacePage.openWikilink` usa `parentFolder(openPathRef)`; `/` → carpeta `""`; `WikilinkPreview.onCreate`→`onOpenWikilink` | `VaultWorkspacePage.wikilink.test.tsx` «C-7 carpeta de origen», «C-7 destino con `/`»; `NoteEditor.test.tsx` «C-7 crear desde la tarjeta» |
| **C-8** (nota vacía → título + «Nota vacía») | `WikilinkPreview` rama `body.trim()===""` | `WikilinkPreview.test.tsx` «C-8» |
| **C-9** (contraste mínimo del texto en ambos temas) | `editor.css` usa `--text-primary`/`--text-secondary` sobre `--bg-secondary`; sin `--text-muted`/`--accent` como texto | `contrast.test.ts` (RNF-004: `--text-primary`/`--text-secondary` ≥ 4,5:1 sobre las superficies; P-2 en `editor.css`, verde) |

## 7. Checkpoint demostrable

Carlos pasa el mouse sobre un wikilink resuelto y ve la tarjeta (título e
inicio renderizado, sin metadatos); sobre uno roto ve el aviso y, al hacer
clic, la nota se crea en la misma carpeta del documento y se abre en edición.

## 8. Session-End

**Claim.** Implementada la vista previa emergente de wikilinks en Lectura (C-1…C-6,
C-8, C-9) y el cambio de C-7 (la nota rota se crea en la carpeta de la nota de
origen, no en la raíz). 9/9 criterios con ≥1 paso y ≥1 prueba (tabla §6).

**Evidencia.** 4 commits atómicos citando H-021 (ciclo Driver/Navigator, un paso TDD
por commit, test rojo→código→verde):
- `H-021 C-7: crear la nota rota en la carpeta de la nota de origen` — `VaultWorkspacePage.tsx` + tests.
- `H-021 C-1/C-5/C-6: detectar hover sobre wikilinks en Lectura` — plugin `MilkdownView.tsx` + tests.
- `H-021 C-1/C-2/C-3/C-4/C-6/C-8: componente WikilinkPreview` — `WikilinkPreview.tsx` + tests.
- `H-021 C-2/C-5/C-7/C-9: montar la tarjeta en Lectura + estilos` — `NoteEditor.tsx` + `editor.css` + tests.

Suites tocadas en verde (177/177): `MilkdownView.test.tsx` (56), `NoteEditor.test.tsx`
(80), `WikilinkPreview.test.tsx` (8), `VaultWorkspacePage.wikilink.test.tsx` (4),
`contrast.test.ts`, `securityGuard.test.ts`. `npm run typecheck` limpio.

**Línea base.** Antes de empezar: `npx vitest run` → 1773/1774; el único fallo
(`App.test.tsx` «/vaults/new») es intermitente por timing bajo carga (pasa aislado:
19/19), NO introducido por H-021. Igual naturaleza que el intermitente de NoteSidebar
«Nueva carpeta» (H-007) que se indicó ignorar.

**Gaps / verificación pendiente (NO marcar `verified`).** jsdom no ejerce el hover real,
`posAtCoords`/`posAtDOM` con geometría, ni `getBoundingClientRect` (devuelve ceros): la
posición de la tarjeta (reposición arriba/lado, «sin provocar scroll», ~320 px/~12 líneas
con desvanecido) y el hover real con puntero quedan para verificación en navegador por AIRA
(usuario + bóveda desechables, hover vía CDP) — lección H-012. Los tests simulan lo que
ProseMirror entrega de verdad (evento DOM real sobre `<a.wikilink>`, marca resuelta por
posición), no el nodo ideal.

**Riesgo residual.** Bajo. El hover usa `view.posAtDOM(link.firstChild ?? link, 0)` (no
`posAtCoords`): elegido porque el evento DOM ya trae el elemento del enlace (de ahí sale su
rectángulo) y porque es ejercitable en jsdom; resuelve la marca POR POSICIÓN como exige la
lección H-012. Si en navegador `posAtDOM` fallara en algún borde, el síntoma sería una
tarjeta que no aparece (no un error), fácil de detectar en la verificación.

**Próximo paso.** AIRA: revisar el diff, verificar en navegador real (hover sobre resuelto,
roto, nota vacía; crear nota rota y comprobar que cae en la carpeta de origen), y si pasa el
checkpoint demostrable marcar `verified`, mergear, desplegar. No hice push ni merge.

### Verificación en navegador real (AIRA, 2026-10-30 14:22 CDMX, producción)
- Tarjeta de nota resuelta: título «Destino» + cuerpo renderizado (H1, negrita/cursiva con colores de la bóveda, lista), sin el bloque YAML (`tags`, `estado`), desvanecido al final; aparece tras ~0,4 s con hover real.
- Enlace roto: tarjeta «Esta nota no existe. Clic para crearla»; clic crea `Carpeta/Nota faltante` en la carpeta de la nota de origen (C-7) y la abre en edición.
- Enlace con extensión ajena (`Informe.docx`): no hay tarjeta.
- Limitación del entorno de prueba: el navegador headless reporta `(hover: hover) and (pointer: fine)` = falso, así que la tarjeta no aparece por el gate C-5 (correcto en táctil). Para probar se sobrescribió `window.matchMedia` en la página. No se verificó con un puntero físico real ni en celular.
- Observación no reproducida: una vez, Código→Leer mostró la nota en blanco justo tras guardarla; no se repitió en 2 intentos posteriores.
