---
id: H-021
titulo: Vista previa emergente al pasar el mouse sobre un wikilink en modo Lectura
estado: pendiente # Gate 1 NO pasado — borrador de AIRA desde el pedido de Carlos (2026-10-30); falta su "así es".
covers:
  - frontend/src/editor/MilkdownView.tsx
  - frontend/src/editor/MilkdownView.test.tsx
  - frontend/src/editor/WikilinkPreview.tsx
  - frontend/src/editor/NoteEditor.tsx
  - frontend/src/editor/editor.css
origen: backlog
---

# H-021 — Vista previa emergente de wikilinks (estilo Obsidian)

## 1. Intención (lenguaje de usuario)

Pedido de Carlos (2026-10-30): en modo Lectura, al pasar el mouse sobre un
wikilink, que aparezca una ventana emergente con una vista rápida del inicio
del documento enlazado, para previsualizarlo sin ir a él (como Obsidian).

Base ya existente: el wikilink resuelto guarda el `resolvedId` de la nota
destino (H-011 C-7) y en Lectura es clickeable (H-012). La nota se lee de la
réplica local (PouchDB), así que la vista previa no necesita red.

## 2. Alcance / fuera de alcance

- Dentro: tarjeta emergente al pasar el mouse sobre un wikilink **resuelto**
  en Lectura, con el título de la nota y el inicio de su contenido; se oculta
  al sacar el mouse; no bloquea el clic de navegación de H-012.
- Fuera: vista previa en edición Visual o Código (ahí el wikilink no navega);
  wikilinks rotos; vista previa de enlaces normales `[](url)`; editar desde la
  tarjeta; archivos adjuntos (imágenes/PDF) — historias de archivos.
- Dependencia de orden: H-015 (en curso) también modifica `MilkdownView.tsx`
  y `NoteEditor.tsx`; H-021 se toma DESPUÉS de mergear H-015 para evitar
  conflictos.

## 3. Preguntas de producto para Carlos (Gate 1)

**P-1 (qué se ve en la tarjeta):** propongo el título de la nota y las
primeras líneas **renderizadas** (encabezados, negritas, listas, con los
colores de la bóveda de H-014), saltando el bloque de propiedades YAML del
inicio (tus notas empiezan con `título/ruta/tags`, que no sirven de vista
previa). Alternativa más simple: texto plano sin formato. ¿Renderizado o texto
plano?

**P-2 (tamaño):** propongo una tarjeta de ~320 px de ancho y alto máximo
~240 px con las primeras ~12 líneas y un desvanecido al final si hay más.
¿Te sirve ese tamaño?

**P-3 (cuándo aparece):** propongo un retardo de ~400 ms al pasar el mouse
(para que no salte al cruzar el texto) y que se cierre al salir. En táctil
(celular) no hay "pasar el mouse": propongo **no mostrar vista previa en
celular** y que el toque siga navegando como hoy. ¿De acuerdo, o prefieres
mantener pulsado para ver la vista previa en celular?

**P-4 (wikilink roto):** propongo que NO muestre nada (ya se ve distinto, con
subrayado punteado). ¿O prefieres un aviso tipo "Esta nota no existe, clic
para crearla"?

## 4. Criterios de aceptación (EARS booleano) — pendientes de P-1..P-4

- **C-1:** MIENTRAS la nota esté en Lectura, CUANDO el puntero permanece sobre
  un wikilink resuelto durante el retardo de P-3, el sistema DEBE mostrar una
  tarjeta junto al enlace con el título de la nota destino y el inicio de su
  contenido (sin el bloque de propiedades YAML).
- **C-2:** La tarjeta DEBE ocultarse al salir el puntero del enlace y de la
  tarjeta, y NO DEBE impedir que el clic en el enlace abra la nota (H-012).
- **C-3:** La tarjeta DEBE quedar dentro de la ventana (se reposiciona arriba
  o a un lado si no cabe debajo) y NO DEBE provocar scroll del documento.
- **C-4:** El contenido de la tarjeta DEBE seguir las reglas de seguridad del
  proyecto (RNF-003: sin HTML crudo; enlaces/imágenes por `safeUrl`) y los
  wikilinks dentro de la tarjeta NO DEBEN ser navegables.
- **C-5:** En edición Visual y en Código NO DEBE aparecer ninguna tarjeta.
- **C-6 (según P-4):** el wikilink roto no muestra tarjeta, salvo que P-4
  defina otra cosa.
- **C-7:** Una nota enlazada vacía o sin cuerpo tras las propiedades DEBE
  mostrar la tarjeta con el título y un texto "Nota vacía", sin errores.
- **C-8:** La tarjeta DEBE verse correcta en ambos temas con el contraste
  mínimo de texto del proyecto.

`[NEEDS CLARIFICATION] = 4` (P-1 a P-4).

## 5. Descartes (candidatos)

- Vista previa por teclado/foco: los wikilinks en Lectura no son enfocables
  hoy; se evalúa en una historia de accesibilidad si lo pides.

## 6. Plan (borrador, se confirma al tomarla)

- `MilkdownView.tsx`: en el plugin de Lectura de H-012, añadir
  `handleDOMEvents.mouseover/mouseout` que detecta la marca `wikilink` en la
  posición del puntero (misma lección que H-012: resolver por posición, no por
  el nodo ancestro) y avisa al padre con `resolvedId` y el rectángulo del
  enlace.
- `WikilinkPreview.tsx`: tarjeta flotante (portal) posicionada con el
  rectángulo del enlace; carga la nota por `resolvedId` desde la réplica local
  (`notes.get`), quita el frontmatter (`splitLegacyBlock`/`frontmatter.ts` ya
  existentes) y trunca el cuerpo; render según P-1 (una instancia de
  `MilkdownView` de solo lectura con el texto truncado, o texto plano).
- Pruebas: componente (retardo, ocultar, reposicionar, nota vacía, solo
  Lectura), detección por posición como H-012; verificación real con usuario y
  bóveda desechables en navegador (hover real vía CDP), por la lección de
  H-012: jsdom no ejercita `posAtCoords`.

## 7. Tabla de cobertura

(se llena al implementar)

## 8. Checkpoint demostrable

Carlos pasa el mouse sobre un wikilink en Lectura y ve la tarjeta con el
inicio de la nota destino; sale el mouse y se cierra; el clic sigue abriendo
la nota.

## 9. Session-End

Pendiente.
