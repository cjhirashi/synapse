---
id: H-011
titulo: Wikilinks [[...]] — reconocerlos y mostrarlos como enlace en Visual (sin navegación todavía)
estado: pendiente # Gate 1 NO pasado — criterios redactados por AIRA desde la directiva de Carlos (2026-10-30); falta su "así es".
covers:
  - frontend/src/editor/MilkdownView.tsx
  - frontend/src/editor/MilkdownView.test.tsx
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

## 3. Preguntas de producto para Carlos (Gate 1 — EARS depende de estas respuestas)

**P-1 (resolución del destino):** un wikilink puede apuntar a una nota real
de la bóveda, o (como en tu ejemplo) a un archivo que Synapse no gestiona
(`.docx`, `.pdf` — Synapse no tiene adjuntos). Propuesta: resolver el
destino contra el **nombre de archivo de las notas** (`.md`) de **la misma
bóveda** (sin extensión, como Obsidian) — si no hay ninguna nota con ese
nombre (sea porque apunta a un `.docx` o porque la nota no existe), se
muestra como **enlace roto** (estilo visual distinto, p. ej. punteado/rojo
tenue) en vez de fallar o tratarlo como texto plano. ¿Así es, o lo quieres
distinto (p. ej. cruzar bóvedas, o tratar los `.docx/.pdf` de otra forma)?

**P-2 (mayúsculas/acentos):** ¿la coincidencia de nombre ignora mayúsculas/
minúsculas (como Obsidian), o debe ser exacta?

**P-3 (duplicados):** si dos notas de la bóveda tienen el mismo nombre de
archivo en carpetas distintas, ¿cuál se resuelve? Propuesta: la primera que
se encuentre (orden no garantizado) + ese caso límite documentado como
conocido, no bloqueante — no he visto evidencia de que te pase hoy.

**P-4 (base técnica):** existe un paquete ya hecho y mantenido,
`remark-wiki-link` (MIT, usado por proyectos como el propio Obsidian-adjacent
tooling), que resuelve el parseo de esta sintaxis a nivel remark. Milkdown no
lo integra de fábrica (no hay `@milkdown/plugin-wikilink`), así que de todas
formas hay que escribir el nodo/marca propio de Milkdown (`$NodeSchema` o
`$MarkSchema`, mismo patrón que ya usan `linkSchema`/`strongSchema` en
`MilkdownView.tsx`) — la pregunta es si ese nodo usa las reglas de regex de
`remark-wiki-link` como referencia (sin añadir la dependencia, total es poco
código) o si la instalamos como dependencia directa. Propuesta: sin
dependencia nueva — el patrón `[[...]]`/`[[...|...]]` es sencillo de
reconocer con una regla de input/parse propia, mismo tamaño de código que
integrar y adaptar un paquete externo al wrapper de Milkdown. ¿Así es?

## 4. Criterios de aceptación (EARS booleano) — pendientes de P-1..P-4

- **C-1:** CUANDO el contenido de una nota tiene `[[Destino]]` o
  `[[Destino|Alias]]`, el sistema DEBE reconocerlo como un nodo/marca propio
  al parsear a Milkdown (no como texto plano, no escapado).
- **C-2:** El sistema DEBE serializar ese nodo/marca de vuelta a
  `[[Destino]]`/`[[Destino|Alias]]` exacto (round-trip sin pérdida ni
  escape) al guardar.
- **C-3:** MIENTRAS la vista sea Visual, el sistema DEBE pintar el wikilink
  con un estilo distinguible del texto normal (color/subrayado, a definir en
  el plan con la paleta ya existente del proyecto) mostrando el **Alias** si
  existe, o el **Destino** si no.
- **C-4:** CUANDO el Destino no resuelve a ninguna nota de la bóveda (según
  P-1/P-2/P-3), el sistema DEBE pintarlo con un estilo distinto (enlace
  "roto") en vez de fallar, ocultarlo, o tratarlo como si resolviera.
- **C-5:** El wikilink NO DEBE ser clickeable/navegable todavía (fuera de
  alcance, H-012) — solo visual.
- **C-6:** En vista Código y en modo Lectura, el contenido DEBE seguir
  mostrando la sintaxis `[[...]]` tal cual está en el markdown (Código ya lo
  hace por ser texto plano; Lectura usa el render actual de markdown — a
  confirmar en el plan si Lectura también debe aplicar el estilo visual de
  C-3/C-4 o se deja para H-012 junto con la navegación).

`[NEEDS CLARIFICATION] = 4` (P-1 a P-4) + 1 menor (alcance de C-6 en modo
Lectura) — se resuelven con tu "así es".

## 5. Descartes (candidatos, a confirmar)

- Navegación por clic y creación de nota si no existe: historia aparte
  (H-012), por tamaño.
- Autocompletar al escribir `[[`: historia aparte (H-013), por tamaño y
  porque depende de tener el nodo base (H-011) ya funcionando.
- Wikilinks a secciones dentro de una nota (`[[Nota#Sección]]`, sintaxis
  también de Obsidian): no visto en el contenido real revisado; si lo usas,
  se agrega a una historia futura con su propio alcance.

## 6. Plan (de ESTA historia solamente) — borrador, se confirma al tomarla

- Nuevo módulo `frontend/src/editor/wikilink.ts`: resolución de un Destino
  contra la lista de notas de la bóveda abierta (nombre de archivo sin
  extensión, según P-2), función pura y testeable por separado del editor.
- `MilkdownView.tsx`: nuevo `$MarkSchema`/`$NodeSchema` para `[[...]]` con su
  `parseMarkdown`/`toMarkdown` (mismo patrón que `linkSchema` de
  `@milkdown/preset-commonmark`, referencia de archivo:
  `node_modules/@milkdown/preset-commonmark/lib/mark/link.d.ts`); NodeView o
  CSS por atributo (`data-resolved`/`data-broken`) para el estilo de C-3/C-4,
  reusando `wikilink.ts` para la resolución (necesita la lista de notas de
  la bóveda, que `Workspace`/`NoteEditor` ya tienen vía `useSync()`/`notes`).
- Estrategia de prueba: `wikilink.test.ts` (resolución pura: encuentra,
  ignora mayúsculas según P-2, no encuentra → roto, alias vs. sin alias);
  `MilkdownView.test.tsx` (round-trip markdown→doc→markdown conserva
  `[[...]]`, estilo correcto resuelto/roto).
- Pasos TDD: se detallan al tomar la historia (§3 del método).

## 7. Tabla de cobertura

(se llena al implementar)

## 8. Checkpoint demostrable

Carlos debe abrir una nota con `[[...]]` reales (p. ej. la de "El Juramento
del Aprendiz Masón" usada de ejemplo arriba) en modo Visual y confirmar que
ya no se escapa, se ve como enlace, y el que apunta al `.docx` se ve como
enlace roto (o lo que P-1 defina).

## 9. Session-End (al cerrar)

Pendiente — se completa al implementar.
