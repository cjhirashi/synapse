---
id: SPEC-0009
tipo: spec
feature: 0009-rediseno-visual-workspace
estado: implemented      # 2026-10-23: Fase 4 completa, Converge 2/2 limpio. NO verified
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: 42225d0   # cierre de la implementación (2026-10-23)
anchor_mode: strict
covers:                  # fijado en PLAN-0009 §9 (archivos con dueño anterior: PLAN-0009 P-10)
  # frontend — maquetación (bloque A)
  - frontend/index.html
  - frontend/src/theme/useTheme.ts
  - frontend/src/theme/useTheme.test.tsx
  - frontend/src/layout/AppLayout.css
  - frontend/src/notes/notes.css
  - frontend/src/notes/VaultRail.tsx
  - frontend/src/notes/VaultWorkspacePage.tsx
  - frontend/src/notes/NoteSidebar.tsx
  - frontend/src/notes/*.test.tsx
  - frontend/src/notes/*.test.ts
  - frontend/src/editor/editor.css
  - frontend/src/editor/NoteEditor.tsx
  - frontend/src/editor/CodeView.tsx
  - frontend/src/editor/MilkdownView.tsx
  - frontend/src/editor/*.test.tsx
  - frontend/src/vaults/vaultIcon.ts
  - frontend/src/vaults/vaultIcon.test.ts
  - frontend/src/vaults/VaultChip.tsx
  - frontend/src/vaults/VaultChip.css
  - frontend/src/vaults/VaultChip.test.tsx
  - frontend/src/vaults/IconPicker.tsx
  - frontend/src/vaults/IconPicker.test.tsx
  - frontend/src/vaults/VaultForm.tsx
  - frontend/src/vaults/VaultForm.test.tsx
  - frontend/src/vaults/VaultListPage.tsx
  - frontend/src/vaults/VaultListPage.test.tsx
  - frontend/src/vaults/fields.ts
  # frontend — cableado funcional (bloque C)
  - frontend/src/sync/vaultRules.ts
  - frontend/src/sync/vaultRules.test.ts
  - frontend/src/sync/vaultStore.ts
  - frontend/src/sync/vaultStore.test.ts
  - frontend/src/sync/merge.ts
  - frontend/src/sync/merge.test.ts
  - frontend/src/sync/conflicts.ts
  - frontend/src/sync/ConflictView.tsx
  - frontend/src/sync/RejectionsPage.tsx
  - frontend/src/sync/vaultIcon.integration.test.ts
  # sistema — fidelidad visual y RNF-001 en navegador real
  - frontend/playwright.config.ts
  - frontend/e2e/**
  - frontend/scripts/visual.sh
  # backend — Vault.icon (bloque B)
  - backend/app/core/schemas.py
  - backend/app/services/vault_service.py
  - backend/app/services/sync_push.py
  - backend/app/routers/vaults.py
  - backend/tests/test_vault*.py
  - backend/tests/test_sync_push.py
  - backend/tests/test_sync_rules_mirror.py
  - backend/tests/fixtures/vault_rules_cases.json
  # contratos
  - .harness/specs/0009-rediseno-visual-workspace/contracts/**
  - .harness/specs/0003-vault-crud/contracts/openapi.yaml
  # documentación (PLAN-0009 §8)
  - backend/README.md
  - backend/app/core/README.md
  - backend/app/services/README.md
  - backend/tests/README.md
  - frontend/README.md
  - frontend/src/README.md
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-23 }
  fase_2: { por: "AIRA en nombre de Carlos (autoridad delegada)", fecha: 2026-10-23 }
actualizado: 2026-10-23
---

> **Re-anclaje 2026-10-24** (T-006 de TASKS-0010, P-15): SPEC-0010 (contenido Markdown completo) toca
> `tokens.css` (seis tokens nuevos, ADR-006), `notes.css`, `editor.css`, `NoteSidebar`,
> `VaultWorkspacePage` y `e2e/**` (nuevas specs `content-*`). Sin cambio de los RF de esta spec:
> la maquetación de 0009 (43 px de barra, columna de 780 px, marco fijo) se conserva y V-1…V-10
> siguen en verde (RF-041 de SPEC-0010).

# SPEC-0009 · Rediseño visual del workspace de bóvedas y notas

> Redactada por AIRA a partir de la evaluación directa de Carlos sobre la app ya
> desplegada (2026-10-23): "no se parece en nada al mockup que te mostré ayer... ni a
> la app de Obsidian". Confirmado con capturas reales contra `diseño/1.1.4.4 - Vista -
> Editor Principal`. **Fase 1 cerrada (2026-10-23)** — Carlos respondió las 3
> decisiones abiertas directamente: (1) tema oscuro por defecto, (2) ícono elegible
> por bóveda con iniciales como respaldo si no se elige uno, (3) ancho del editor
> limitado estilo Obsidian. `[NEEDS CLARIFICATION] = 0`.

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
  a iconos circulares por bóveda, estilo Discord, con **selector de ícono por
  bóveda** (ver §3 y §6) y respaldo automático de iniciales si no se elige uno;
  tooltip del nombre completo al pasar el cursor y estado activo claramente
  distinguible.
- Barra lateral de notas: separarla visualmente del formulario "Nueva nota" — panel
  propio con su propio fondo/borde, iconografía de carpeta/nota, indentación clara
  del árbol, igual que un explorador de archivos real (Obsidian como referencia).
- Editor central: columna de ancho limitado y centrada (estilo Obsidian, ver RF-005),
  no una franja angosta pegada a un borde con el resto de la pantalla vacío.
- Aplicar con más densidad los tokens ya existentes en `tokens.css` (sombras
  `--shadow-panel`, radios, espaciado) a estos tres bloques — no inventar valores
  nuevos fuera de ese archivo.
- Tema **oscuro por defecto** al cargar el workspace (RF-006a).

### Fuera de alcance
- Cambios de comportamiento, API o modelo de datos **no relacionados con el ícono de
  bóveda** (RF-011/012) — todo lo demás que SPEC-0008 cerró y verificó queda intacto;
  esta spec no reabre esa fase salvo el campo nuevo explícitamente listado abajo.
- Subida de imágenes propias como ícono — el selector usa un **set curado de íconos
  SVG** (ya hay `lucide-react` como dependencia, visto en el fix del toggle de tema
  de SPEC-0008) + un color de acento por bóveda, no upload de archivos arbitrarios
  (evita el alcance de almacenamiento/validación/moderación de imágenes).
- Panel de Agente / chat (ADR-011, descartado por decisión de Carlos — Synapse sigue
  sin IA interna).
- Nueva paleta de color o tipografía fuera de la ya aprobada en
  `diseño/1.1.4.1 - Sistema de Diseño.md` — este rediseño aplica mejor ese sistema,
  no define uno nuevo.
- Las 5 decisiones de producto listadas en el Session-End de SPEC-0008 (wikilinks
  escapados, tope de reservas, contraste de la hora de sync, API de notas para
  agentes, URLs peligrosas en markdown crudo) — pendientes aparte, no son visuales.

## 3. Modelo de datos y contratos de E/S

Casi sin cambios — un campo nuevo, no una feature funcional nueva:

| Frontera | Dirección | Tipo | Contrato en `contracts/` |
|---|---|---|---|
| `Vault.icon` (nullable, string — id de un ícono del set curado, p. ej. `"folder-heart"`) | entrada/salida | REST (extiende `POST/PATCH /vaults` existentes) | `openapi.yaml#/components/schemas/Vault` |

- Sin valor elegido → `icon: null` → el frontend renderiza iniciales (comportamiento
  actual), no una migración de datos obligatoria para bóvedas existentes.
- El set curado de íconos vive en el frontend (nombres de `lucide-react` ya
  instalado) — el backend solo guarda el identificador como string, no valida contra
  una lista cerrada en esta spec (evita acoplar backend/frontend a un catálogo que
  cambiará); si el id no existe en el set del frontend, cae a iniciales igual que
  `null`.
- Todo lo demás (canal `/sync`, modelo de notas, reservas, conflictos) sin cambios —
  SPEC-0008 ya lo verificó.

## 4. Criterios de aceptación (EARS)

- **RF-001** — El riel de bóvedas DEBE mostrar un ícono circular por bóveda (no un
  rectángulo): el ícono elegido en `Vault.icon` si existe, o las iniciales del
  nombre sobre un color derivado si no, consistente con `diseño/1.1.4.4` ("un icono
  por bóveda, estilo Discord").
- **RF-002** — CUANDO el usuario pasa el cursor sobre un icono del riel, el sistema
  DEBE mostrar el nombre completo de la bóveda en un tooltip.
- **RF-003** — La barra lateral de notas (árbol de carpetas/notas) DEBE presentarse
  en un panel visualmente distinto del formulario de creación de nota, con su propio
  fondo/borde definido en `tokens.css`.
- **RF-004** — Cada nodo del árbol de notas DEBE llevar un icono distinguible entre
  carpeta y nota.
- **RF-005** — El panel del editor DEBE mostrar el contenido en una columna de ancho
  máximo fijo (estilo Obsidian, no estirada a todo el viewport) y centrada dentro
  del área disponible, en viewports ≥ 1024px.
- **RF-006** — DONDE el tema activo sea oscuro, el workspace DEBE usar
  `:root[data-theme="dark"]` de `tokens.css` sin colores fuera de esa paleta.
- **RF-006a** — CUANDO un usuario entra a `/vaults` o `/vaults/:id` sin preferencia
  de tema ya guardada, el sistema DEBE aplicar `data-theme="dark"` por defecto (no
  `light`/`system`); si ya hay preferencia guardada (`ThemeToggle` existente), esa
  preferencia DEBE respetarse sin cambios de este RF.
- **RF-007** — El cambio no DEBE alterar ningún atributo `role`/`aria-*` ni selector
  usado por los tests existentes de SPEC-0008 salvo que la tarea correspondiente
  actualice ese test explícitamente (no regresión silenciosa de accesibilidad).
- **RF-011** — El sistema DEBE ofrecer un selector de ícono por bóveda (al crearla o
  después, desde su configuración) sobre el set curado de `lucide-react`, con un
  color de acento elegible junto al ícono.
- **RF-012** — CUANDO el usuario guarda un ícono para una bóveda, el sistema DEBE
  persistirlo en `Vault.icon` y reflejarlo en el riel sin recargar la página.

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
| Ícono elegible por bóveda sobre set curado SVG (`lucide-react`) + color de acento; iniciales como respaldo | Decisión directa de Carlos (2026-10-23): "elegir ícono y si no se elige ícono, iniciales" | Solo iniciales/color automático (propuesta inicial de AIRA, descartada por Carlos) | — |
| Set curado, no subida de imágenes propias | Evita alcance de almacenamiento/validación/moderación de archivos; coherente con "estilo Discord" sin ser una feature de upload | Subida libre de imagen como ícono | — |
| Reutilizar `tokens.css` tal cual, sin nuevos valores | Ya existe un sistema de diseño aprobado (2026-08-12); duplicarlo o desviarse crea inconsistencia con login/lista de bóvedas | Paleta nueva específica del workspace | — |
| Tema oscuro por defecto (RF-006a) | Decisión directa de Carlos (2026-10-23): "sí" a abrir en oscuro como Obsidian | Respetar únicamente la preferencia ya guardada, sin default propio | — |
| Editor con columna de ancho limitado, no a todo el viewport (RF-005) | Decisión directa de Carlos (2026-10-23): "como Obsidian" | Editor a ancho completo del viewport (propuesta inicial de AIRA, descartada) | — |
| Único cambio de modelo de datos: `Vault.icon` nullable | El resto del modelo/API/sync de SPEC-0008 ya está verificado exhaustivamente (23 enmiendas); reabrirlo de más mezclaría riesgo funcional innecesario con una feature visual | Ampliar el modelo para más personalización de bóveda en esta misma spec | — |

## 7. Requisitos no funcionales (RNF)

- **RNF-001** — El rediseño NO DEBE degradar el rendimiento ya medido en SPEC-0008
  (RNF-001 original: árbol de 1000 notas, p95 ≤ 150ms en navegador real — el margen
  actual es 108-132ms, hay holgura pero no para gastarla sin medir de nuevo).

## Marcadores abiertos

Ninguno — `[NEEDS CLARIFICATION] = 0`. Las 3 decisiones (tema por defecto, selector
de ícono, ancho del editor) quedaron resueltas por Carlos el 2026-10-23 y están
reflejadas en RF-005, RF-006a, RF-011/012 y §6.

**Un supuesto de AIRA sin confirmar explícitamente** (no bloquea Fase 1, pero el
Plan debe dejarlo visible): el selector de ícono usa un set curado de `lucide-react`
+ color de acento, no subida de imagen propia — interpretación razonable de "elegir
ícono" dado el alcance y la ausencia de gestión de archivos para avatares en
Synapse, pero si Carlos quería subida de imagen libre, corregir antes de Fase 2.
