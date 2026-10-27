---
id: SPEC-0012
tipo: spec
feature: 0012-propiedades-estilo-obsidian
estado: approved
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: df0e255   # feature/sprint-1-auth con 0010 y 0011 fusionadas
anchor_mode: strict
covers:                  # provisional; lo fija la Fase 2
  - frontend/src/editor/PropertiesPanel.tsx
  - frontend/src/editor/PropertiesPanel.test.tsx
  - frontend/src/editor/PropertiesForm.tsx
  - frontend/src/editor/PropertiesForm.test.tsx
  - frontend/src/editor/properties.ts
  - frontend/src/editor/properties.test.ts
  - frontend/e2e/properties*
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: { por: "AIRA en nombre de Carlos Jiménez (cjhirashi), autoridad delegada", fecha: 2026-10-28, nota: "NC-1 = sí (icono de calendario sólo presentación, sin tipo fecha); D-3 y D-4 aprobadas tal cual" }
  fase_2: pendiente
actualizado: 2026-10-28
---

# SPEC-0012 · Panel de Propiedades con presentación estilo Obsidian

## 1. Contexto
Petición de Carlos vía AIRA (2026-10-28). El panel de propiedades de SPEC-0010 funciona,
pero en edición se ve como un generador de formularios: cabecera de columnas
«Clave/Tipo/Valor», selector de tipo siempre visible, inputs de ancho fijo con scroll
horizontal y una X por fila (`reference/propiedades-synapse-actual.png`). El objetivo es la
presentación compacta de Obsidian (`reference/propiedades-obsidian-referencia.png`): una
fila por propiedad con icono de tipo, nombre y valor; listas como pastillas; sin cabecera
de columnas; sin scroll horizontal.

**Revisa una decisión ya tomada:** D2 de SPEC-0010 ("lectura = caja, edición =
formulario"). Esta spec sustituye la *presentación* de RF-009 y RF-011 de SPEC-0010; su
*funcionalidad* (tipos, añadir/quitar, validación, guardado explícito, valores complejos,
round-trip) no cambia.

## 2. Alcance
**Dentro:** presentación del panel en lectura y en edición Visual; elección de tipo desde
el icono; listas como pastillas editables; responsive (390–1440) en ambos temas.
**Fuera:** tipos nuevos de dato (fecha real, enlace, multiselección) — el modelo sigue
siendo string · número · booleano · lista de strings · complejo (SPEC-0010 §3); vista
Código (RF-014…RF-017 de 0010 intactos); backend y contratos (sin cambios).

## 3. Modelo de datos y contratos de E/S
Sin cambios. `frontmatter` y sus reglas (64 KiB, 32 niveles, tipos) siguen como en
SPEC-0010 y `note.schema.json`.

## 4. Criterios de aceptación (EARS)
- **RF-001** — CUANDO se muestra el panel (lectura o edición Visual) con propiedades, el
  sistema DEBE presentar una fila por propiedad, en el orden de las claves, con: icono
  Lucide según el tipo, el nombre de la clave y el valor; SIN cabecera de columnas.
- **RF-002** — El icono DEBE corresponder al tipo: texto, número, booleano, lista y
  complejo, cada uno con un icono distinto (mapa fijado en la Fase 2).
- **RF-003** — Las listas de strings DEBEN mostrarse como pastillas en línea que hacen
  salto de línea dentro de la fila; en edición cada pastilla DEBE poder quitarse y DEBE
  poder añadirse una nueva.
- **RF-004** — El panel NO DEBE producir scroll horizontal propio a 390, 1024 ni 1440 px;
  claves largas se truncan con elipsis y nombre completo accesible; valores largos hacen
  salto de línea.
- **RF-005** — MIENTRAS la nota esté en edición Visual, el sistema DEBE permitir editar la
  clave y el valor en la propia fila, añadir propiedad («Añadir propiedad» al final) y
  quitarla, sin selector de tipo ni botón de quitar visibles en reposo.
- **RF-006** — MIENTRAS la nota esté en edición Visual, al activar el icono de una
  propiedad (clic, Enter o Espacio) el sistema DEBE abrir un menú con «Tipo» (texto,
  número, sí/no, lista) y «Quitar»; las conversiones de tipo y sus avisos siguen las
  reglas de SPEC-0010.
- **RF-007** — En lectura el panel NO DEBE ofrecer controles de edición; los booleanos se
  muestran como casilla no interactiva y los complejos como texto de sólo lectura.
- **RF-008** — Accesibilidad: todo control con nombre accesible; el menú de tipo sigue el
  patrón APG de menú (flechas, Esc devuelve el foco al icono, Tab no pierde el foco);
  foco visible; objetivos táctiles ≥ 24 px (44 px en táctil); contraste según P-2 de
  0010.
- **RF-009** — No regresión funcional: RF-009…RF-018 y RF-044/RF-045 de SPEC-0010 siguen
  pasando con sus pruebas (con selectores adaptados, sin debilitar aserciones).

## 5. Requisitos no funcionales
- **RNF-001** — Fidelidad visual (method.md §3 v1.9): capturas reales en Chromium del
  panel en lectura y edición, claro/oscuro, 390/1440, comparadas con la referencia de
  Obsidian; dentro de la identidad 1.1.4.1 (acento cian, tokens, Lucide).
- **RNF-002** — Presupuestos de 0010 sin superar (bundle de entrada y editor, RNF-001 de
  0010 en tiempo de apertura).

## 6. Registro de decisiones y descartes
| Decisión | Por qué | Descartado | Marcador |
|---|---|---|---|
| D1 *(AIRA/Carlos)*: presentación estilo Obsidian en lectura y edición | Petición explícita con referencia | Mantener el formulario | — |
| D2 *(AIRA/Carlos)*: mantener funcionalidad (añadir/quitar/tipo) | Petición explícita | Recortar funciones | — |
| D-3: el tipo se elige desde el icono (menú), como en Obsidian | Quita el selector siempre visible sin perder la función | Selector visible por fila | — |
| D-4: sin tipo «fecha» nuevo | Cambiaría el modelo de datos y los contratos de 0008/0010 | Añadir tipo fecha | — |
| D-5 *(AIRA, cierra NC-1)*: textos con forma de fecha ISO (AAAA-MM-DD) se muestran con icono de calendario, sólo presentación; el dato sigue siendo texto y se edita como texto; sin icono de enlace | Parecido a Obsidian sin tocar el modelo | Tipo fecha real; icono de enlace sin equivalente | — |

## 7. Marcadores abiertos
Ninguno (NC-1 cerrado por D-5, GATE 1 2026-10-28).

- **RF-010** — SI el valor de una propiedad de tipo texto tiene forma de fecha ISO
  (AAAA-MM-DD, fecha válida) ENTONCES el sistema DEBE mostrar icono de calendario en la
  fila (lectura y edición) sin cambiar el tipo ni el valor guardado (D-5).
