---
id: SPEC-0009
tipo: spec
feature: 0009-rediseno-visual-workspace
estado: draft            # draft | in-review | approved | implemented | verified | deprecated
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: b8f2838   # HEAD de feature/sprint-1-auth al redactar esta spec
anchor_mode: advisory
covers:
  - frontend/src/notes/notes.css
  - frontend/src/notes/VaultRail.tsx
  - frontend/src/notes/VaultWorkspacePage.tsx
  - frontend/src/notes/NoteSidebar.tsx
  - frontend/src/editor/editor.css
  - frontend/src/editor/NoteEditor.tsx
  - frontend/src/editor/CodeView.tsx
  - frontend/src/editor/MilkdownView.tsx
  - frontend/src/notes/*.test.tsx
  - frontend/src/editor/*.test.tsx
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: pendiente
  fase_2: pendiente
actualizado: 2026-10-23
---

# SPEC-0009 · Rediseño visual del workspace de bóvedas y notas

> Redactada por AIRA a partir de la evaluación directa de Carlos sobre la app ya
> desplegada (2026-10-23): "no se parece en nada al mockup que te mostré ayer... ni a
> la app de Obsidian". Confirmado con capturas reales contra `diseño/1.1.4.4 - Vista -
> Editor Principal`. Fase 1 (Specify) sigue abierta — los `[NEEDS CLARIFICATION]` del
> final son las decisiones reales que faltan antes del "así es" de Carlos.

## 1. Contexto del dominio

SPEC-0008 entregó el editor de bóvedas **funcionalmente completo y verificado**
(1054 tests backend, 799 frontend, recorrido real en Chromium 19/19) pero sin que
ningún revisor de sus 23 enmiendas de Converge comparara el resultado contra el
mockup de agosto 2026 ni contra el sistema de diseño MD3+Cyan ya aprobado y en uso
en login/lista de bóvedas — el método no lo exigía (corregido hoy en `method.md`
v1.9, Fase 4/Gate 4). Esta spec cierra esa brecha: mismo comportamiento, mismos
datos, mismas rutas — solo el **vestido visual**.

## 2. Alcance

### En alcance
- Riel de bóvedas (`VaultRail.tsx`/`.vault-rail`): de rectángulos planos con 2 letras
  a iconos circulares por bóveda, estilo Discord (ver §6), con tooltip del nombre
  completo al pasar el cursor y estado activo claramente distinguible.
- Barra lateral de notas: separarla visualmente del formulario "Nueva nota" — panel
  propio con su propio fondo/borde, iconografía de carpeta/nota, indentación clara
  del árbol, igual que un explorador de archivos real (Obsidian como referencia).
- Editor central: eliminar el espacio en blanco sin usar; la caja de contenido ocupa
  el ancho disponible con márgenes consistentes al sistema de diseño (no un ancho
  fijo angosto con el resto de la pantalla vacío).
- Aplicar con más densidad los tokens ya existentes en `tokens.css` (sombras
  `--shadow-panel`, radios, espaciado) a estos tres bloques — no inventar valores
  nuevos fuera de ese archivo.
- Tema por defecto al cargar el workspace (ver `[NEEDS CLARIFICATION]` §Marcadores).

### Fuera de alcance
- Cualquier cambio de comportamiento, API, modelo de datos o lógica de sync — SPEC-
  0008 ya la cerró y verificó; esta spec no reabre esa fase.
- Panel de Agente / chat (ADR-011, descartado por decisión de Carlos — Synapse sigue
  sin IA interna).
- Nueva paleta de color o tipografía fuera de la ya aprobada en
  `diseño/1.1.4.1 - Sistema de Diseño.md` — este rediseño aplica mejor ese sistema,
  no define uno nuevo.
- Las 5 decisiones de producto listadas en el Session-End de SPEC-0008 (wikilinks
  escapados, tope de reservas, contraste de la hora de sync, API de notas para
  agentes, URLs peligrosas en markdown crudo) — pendientes aparte, no son visuales.

## 3. Modelo de datos y contratos de E/S

Sin cambios. Esta feature es puramente de presentación (CSS + estructura DOM/JSX);
no toca `openapi.yaml`, el canal `/sync`, ni ningún contrato existente.

## 4. Criterios de aceptación (EARS)

- **RF-001** — El riel de bóvedas DEBE mostrar un icono circular por bóveda (no un
  rectángulo), con las iniciales o un color derivado del nombre, consistente con
  `diseño/1.1.4.4` ("un icono por bóveda, estilo Discord").
- **RF-002** — CUANDO el usuario pasa el cursor sobre un icono del riel, el sistema
  DEBE mostrar el nombre completo de la bóveda en un tooltip.
- **RF-003** — La barra lateral de notas (árbol de carpetas/notas) DEBE presentarse
  en un panel visualmente distinto del formulario de creación de nota, con su propio
  fondo/borde definido en `tokens.css`.
- **RF-004** — Cada nodo del árbol de notas DEBE llevar un icono distinguible entre
  carpeta y nota.
- **RF-005** — El panel del editor DEBE ocupar el ancho disponible del área de
  contenido (sin una franja angosta fija rodeada de espacio vacío) en viewports
  ≥ 1024px.
- **RF-006** — DONDE el tema activo sea oscuro, el workspace DEBE usar
  `:root[data-theme="dark"]` de `tokens.css` sin colores fuera de esa paleta.
- **RF-007** — El cambio no DEBE alterar ningún atributo `role`/`aria-*` ni selector
  usado por los tests existentes de SPEC-0008 salvo que la tarea correspondiente
  actualice ese test explícitamente (no regresión silenciosa de accesibilidad).

## 5. Casos límite y manejo de errores

- **RF-008** — SI una bóveda no tiene notas, ENTONCES el estado vacío ("Abre o crea
  una nota para empezar") DEBE mantenerse centrado y legible con el nuevo layout, no
  solo el estado con contenido.
- **RF-009** — SI hay más bóvedas de las que caben en el alto del viewport, ENTONCES
  el riel DEBE seguir con scroll propio (no regresión de T-156/U-7, ya resuelto en
  SPEC-0008).
- **RF-010** — SI el nombre de una nota es muy largo, ENTONCES el árbol DEBE truncarlo
  con ellipsis sin romper el layout del panel.

## 6. Registro de decisiones y descartes

| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| Riel de iconos circulares con iniciales/color, no fotos/subida de imagen | Synapse no tiene gestión de avatares de bóveda; menor alcance, coherente con "estilo Discord" sin requerir una feature nueva de subida de archivos | Iconos subidos por el usuario | — |
| Reutilizar `tokens.css` tal cual, sin nuevos valores | Ya existe un sistema de diseño aprobado (2026-08-12); duplicarlo o desviarse crea inconsistencia con login/lista de bóvedas | Paleta nueva específica del workspace | — |
| No tocar el modelo de datos ni el canal de sync | SPEC-0008 ya lo verificó exhaustivamente (23 enmiendas); reabrirlo aquí mezclaría una feature visual con riesgo funcional innecesario | Aprovechar para ajustes funcionales adicionales | — |

## 7. Requisitos no funcionales (RNF)

- **RNF-001** — El rediseño NO DEBE degradar el rendimiento ya medido en SPEC-0008
  (RNF-001 original: árbol de 1000 notas, p95 ≤ 150ms en navegador real — el margen
  actual es 108-132ms, hay holgura pero no para gastarla sin medir de nuevo).

## Marcadores abiertos

- `[NEEDS CLARIFICATION: tema por defecto]` — ¿el workspace abre en oscuro por
  defecto (como Obsidian) o respeta la preferencia ya guardada del usuario/sistema
  (comportamiento actual del `ThemeToggle`)? Afecta RF-006.
- `[NEEDS CLARIFICATION: fidelidad de los iconos del riel]` — ¿iniciales sobre un
  color derivado del nombre de la bóveda (determinista, sin input nuevo del usuario)
  es suficiente, o quieres poder elegir/subir un icono por bóveda (alcance mayor,
  requeriría su propio RF- y posiblemente tocar el modelo de datos)?
- `[NEEDS CLARIFICATION: ancho máximo del editor]` — Obsidian limita el ancho de
  línea del contenido aun en pantallas anchas (columna centrada ~700-900px) en vez de
  estirar el texto a todo el viewport. ¿Igual aquí, o el editor sí debe usar todo el
  ancho disponible como dice RF-005?
