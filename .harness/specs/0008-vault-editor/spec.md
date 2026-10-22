---
id: SPEC-0008
tipo: spec
feature: 0008-vault-editor
estado: draft            # draft | in-review | approved | implemented | verified | deprecated
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: a88424e
anchor_mode: advisory    # pasa a strict en implemented/verified
covers:
  - backend/app/routers/notes.py
  - backend/app/services/note_service.py
  - backend/app/services/sync_filter.py
  - backend/app/services/sync_push.py
  - backend/tests/test_note*.py
  - backend/tests/test_sync*.py
  - frontend/src/notes/**
  - frontend/src/editor/**
  - frontend/src/vaults/VaultListPage.tsx
  - frontend/src/layout/AppLayout.tsx
  - .harness/specs/0008-vault-editor/contracts/**
  - .harness/specs/0008-vault-editor/diagrams/**
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: pendiente
  fase_2: pendiente
actualizado: 2026-10-22
---

# SPEC-0008 · Editor de documentos dentro de una bóveda

> **Borrador seedeado por AIRA, no Fase 1 cerrada.** Carlos pidió (2026-10-22) que abrir
> una bóveda deje de ser solo una tarjeta y dé una UX estilo Obsidian: riel de bóvedas +
> sidebar con árbol + editor, **sin el panel de agente/chat por ahora** ("sin considerar
> la ventana del chat que por ahora no la ocupamos"). Existe diseño original completo de
> agosto 2026 en `diseño/1.1.4 - Diseño UI-UX/1.1.4.4` (vista), `diseño/1.1.2.../ADR-010`
> (stack del editor) y `diseño/1.1.5.../1.1.5.2` (modelo de datos), escrito **antes** de
> que existiera el modelo de seguridad actual (SPEC-0003/0005: aislamiento por bóveda vía
> lista blanca de ids en `/sync`). Este spec reconcilia ambos. Carlos ya respondió una
> pregunta de alcance (ver §6, decisión "Conflictos"); **el resto de §4 sigue sin pasar por
> la elicitación interactiva de Fase 1 (`method.md §3`)** — quien tome esta spec (Claude
> Code) debe cerrarla con Carlos antes de Fase 2, en particular los `[NEEDS CLARIFICATION]`
> de la sección final.

## 1. Contexto del dominio
- **Problema:** hoy una bóveda (SPEC-0003) es solo metadatos — nombre, descripción, tags.
  No hay forma de abrirla ni de crear/editar documentos markdown dentro. Carlos quiere usar
  Synapse como lo usaría con Obsidian: abrir una bóveda y trabajar con sus notas.
- **Límites:** sigue sin existir IA interna en esta feature — el Panel de Agente (ADR-011)
  queda fuera, igual que RAG (ADR-003), voz (ADR-006) y orquestación multi-agente
  (ADR-026/027). Esta feature es, estrictamente, el editor de notas y su sincronización.
- **Dependencias:**
  - SPEC-0003 (CRUD de bóvedas): el documento `vault:{uuid}` ya existe; esta feature
    cuelga notas de él.
  - SPEC-0005 (sincronización): `sync_filter.py::is_replicable_id()` y
    `sync_push.py::_check_shape()` hoy sólo aceptan `vault:{uuid}` — es una lista blanca de
    seguridad explícita (SPEC-0005 RF-007), no un límite por defecto. Esta feature la
    **extiende** a propósito (no la bordea) para aceptar también el nuevo tipo `note`.
  - **Diseño original** (agosto 2026, pre-SPEC-0003/0005): `1.1.4.4` (vista), `1.1.4.1`
    (sistema de diseño — ya implementado hoy, coincide), `1.1.4.2` (navegación/responsive),
    ADR-010 (Milkdown + CodeMirror 6), `1.1.5.2` (modelo de datos original), `1.1.5.5`
    (sincronización + editor, con la decisión de conflicto de ADR-001).
- **Almacenamiento:** cada nota es un documento `type: "note"` en la misma base CouchDB
  `synapse_user_{id}` del usuario — ninguna base ni colección nueva.

## 2. Alcance
### En alcance
- Riel de bóvedas (icono por bóveda, click cambia la bóveda activa) en las rutas privadas.
- Ruta `/vaults/{vault_id}` — abre la bóveda: sidebar con árbol de carpetas/notas + editor.
- `VaultListPage` gana una acción "Abrir" hacia `/vaults/{vault_id}` (además de "Editar",
  que sigue yendo a los metadatos de SPEC-0003).
- CRUD de notas dentro de una bóveda: crear, renombrar/mover (cambia `path`), editar
  contenido, borrar con papelera (mismo patrón que bóvedas), restaurar.
- Editor con modo lectura (por defecto al abrir) y modo edición; en edición, alternar
  Visual (Milkdown/WYSIWYG) y Código (CodeMirror 6) sobre el mismo markdown, sin
  guardar/recargar al cambiar. Disponible a cualquier usuario sobre sus propias notas, no
  exclusivo de administrador (igual que hoy con bóvedas).
- Estructura de carpetas vía `path` (p. ej. `Carpeta/Subcarpeta/Nota.md`) — el árbol la
  respeta tal cual, sin aplanar. Las carpetas no son documentos propios, son prefijos de
  `path` (si una carpeta queda sin notas, desaparece del árbol).
- Sincronización PouchDB ↔ CouchDB de notas por el mismo canal `/sync` ya existente,
  extendiendo la lista blanca (SPEC-0005) para el tipo `note`.
- Conflictos de contenido: expuestos al usuario (nunca resueltos en silencio por
  timestamp, ADR-001) con una UI mínima — reutiliza el patrón de `ConflictView` que ya
  existe para bóvedas, mostrando ambas versiones en texto plano para elegir una. La UI
  fina (diff visual, merge campo a campo) queda explícitamente para después (decisión de
  Carlos, 2026-10-22 — ver §6).
### Fuera de alcance
- **Panel de Agente / chat** (ADR-011) — excluido a petición explícita de Carlos.
- RAG y memoria de agentes (ADR-003/ADR-005), voz (ADR-006), orquestación multi-agente
  (ADR-026/027), Gateway MCP (ADR-013/014) — módulos aparte del diseño original, ninguno
  tocado aquí.
- Editor Visual / canvas (ADR-025, `1.1.4.11`) — vista distinta del diseño original, no es
  este editor de notas.
- Adjuntos binarios (imágenes/PDF como attachments de CouchDB, mencionados en el diseño
  original `1.1.5.2`) — notas de solo texto markdown en esta primera versión.
- Importación de bóvedas existentes vía carpeta/zip (ADR-002) — feature aparte.
- Panel de Administración, Notificaciones, Workspace de Desarrollo, Gestión de Agentes,
  Gestor de Tareas, Aprobación de Aprendizaje (`1.1.4.6/.7/.8/.10/.12/.13`) — vistas
  propias del diseño original, no tocadas por esta spec.
- Purga automática de la papelera de notas a 30 días — igual que RF-016 de SPEC-0003,
  diferido.

## 3. Modelo de datos y contratos de E/S
| Frontera | Dirección | Tipo | Contrato en `contracts/` |
|---|---|---|---|
| `/sync/…` (mismo proxy de SPEC-0005, ahora acepta `note:*` además de `vault:*`) | entrada/salida | HTTP CouchDB | `openapi.yaml` (Fase 2) |
| Base CouchDB `synapse_user_{id}` | salida | HTTP CouchDB | — (puerto existente, sin base nueva) |

**Nota (documento CouchDB, campos — adapta el modelo de `1.1.5.2` original al esquema de
id vault-scoped que exige la lista blanca de SPEC-0005):**

| Campo | Tipo | Regla |
|---|---|---|
| `_id` | string | `note:{vault_id}:{note_uuid}` — `note_uuid` generado por el cliente (UUID v4), igual que hoy las bóvedas lo exigen en forma canónica; el id NO cambia al renombrar/mover (eso solo cambia `path`) |
| `type` | string | constante `"note"` |
| `vault_id` | string (UUID) | debe ser una bóveda no borrada del propio usuario — si no, el push la rechaza (RF- a definir en Fase 1, mismo criterio que RF-008 de SPEC-0005 para bóvedas) |
| `path` | string | ruta completa con carpetas, p. ej. `Carpeta/Nota.md`; único entre notas no borradas de la misma bóveda (reserva igual que `vault-name:*`, a definir el nombre exacto del documento de reserva en Fase 1) |
| `frontmatter` | object | opcional, YAML-como-JSON (claves libres) — igual que el diseño original |
| `content` | string | markdown crudo |
| `created_at`, `updated_at` | string (RFC 3339, UTC) | igual criterio que bóvedas |
| `deleted_at` | string \| null | soft delete + papelera, igual patrón que bóvedas (propuesta AIRA — el diseño original de agosto no lo decidía explícitamente; `[NEEDS CLARIFICATION]`, ver abajo) |

- Nada de adjuntos binarios en esta versión (fuera de alcance).
- Errores: `application/problem+json` (RFC 9457), igual que el resto de la API.

## 4. Criterios de aceptación (EARS)
> **Placeholder de alcance, no Fase 1 cerrada.** Los números de RF son provisionales — se
> fijan en la elicitación interactiva con Carlos. Lista aquí para que Claude Code no
> arranque de cero:

- **RF-◻︎** — CUANDO un usuario abre `/vaults/{vault_id}` de una bóveda propia no borrada
  el sistema DEBE mostrar el riel de bóvedas, la sidebar con el árbol de notas de esa
  bóveda y el editor (vacío o con la última nota abierta — a decidir en Fase 1).
- **RF-◻︎** — SI `vault_id` no existe, está borrada o no es del usuario ENTONCES el
  sistema DEBE responder/mostrar 404, igual criterio que RF-014 de SPEC-0003.
- **RF-◻︎** — CUANDO el usuario crea una nota el sistema DEBE guardarla como `note:*` con
  `vault_id` de la bóveda activa y abrirla en modo edición.
- **RF-◻︎** — SI el push de `/sync` trae un documento `note:*` cuyo `vault_id` no
  corresponde a una bóveda no borrada del propio usuario ENTONCES el sistema DEBE
  rechazarlo (mismo mecanismo de validación que RF-005/RF-006 de SPEC-0005 para `vault:*`).
- **RF-◻︎** — CUANDO el push trae un documento `note:*` el sistema DEBE validarle forma
  (type/vault_id/path/content) igual que `_check_shape()` ya hace para `vault:*`.
- **RF-◻︎** — El sistema DEBE extender `is_replicable_id()` (SPEC-0005 RF-007) para aceptar
  también `note:{vault_id}:{uuid}` canónico, sin abrir el canal a ningún otro tipo de id.
- **RF-◻︎** — CUANDO el usuario abre una nota en modo lectura el sistema DEBE mostrarla
  renderizada, sin cursores visibles; el botón "Editar" DEBE activar el modo edición.
- **RF-◻︎** — MIENTRAS esté en modo edición el sistema DEBE ofrecer alternar Visual/Código
  sobre el mismo contenido, sin pérdida de cambios al cambiar de modo.
- **RF-◻︎** — CUANDO el cliente detecta una nota con revisiones en conflicto el sistema
  DEBE mostrar ambas versiones (texto plano) y dejar que el usuario elija una — nunca
  resolver automático por timestamp (ADR-001; decisión de Carlos 2026-10-22, §6: la UI
  fina queda para después, pero la exposición del conflicto no).
- **RF-◻︎** — CUANDO el usuario borra una nota el sistema DEBE soft-delete (papelera) igual
  que bóvedas — `[NEEDS CLARIFICATION]`, ver abajo.
- **RF-◻︎** — CUANDO el usuario renombra/mueve una nota (cambia `path`) el sistema DEBE
  actualizar el árbol sin cambiar el `_id`.

## 5. Casos límite y manejo de errores
- Bóveda borrada mientras el usuario tiene notas suyas abiertas: igual criterio que
  bóveda ajena, 404 (a confirmar si se "archivan" sus notas o quedan huérfanas visibles
  solo en la papelera de la bóveda — `[NEEDS CLARIFICATION]`).
- Dos ediciones simultáneas del mismo `path` en dispositivos distintos: conflicto expuesto
  (RF de conflictos arriba), nunca silencioso.
- Nota sin `path` o con `path` vacío tras recortar espacios: a rechazar igual que un
  `name` de bóveda vacío (RF-005 de SPEC-0003) — `[NEEDS CLARIFICATION]`: ¿título por
  defecto tipo "Sin título" o 422?
- Dos notas con el mismo `path` en la misma bóveda (carrera de creación): solo una gana,
  igual patrón de reserva que nombres de bóveda (RF-021 de SPEC-0003).

## 6. Registro de decisiones y descartes
| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| Sin Panel de Agente en esta feature | Pedido explícito de Carlos (2026-10-22) | Incluirlo de una (lo que decía el diseño original) | ADR-011 (diferido) |
| Conflictos: se exponen siempre al usuario; la UI de resolución fina queda para después, no en esta versión | Decisión de Carlos (2026-10-22): "La UI final queda para después, ya completa Synapse" — pero nunca se acordó resolver en silencio, eso violaría ADR-001 | Last-write-wins silencioso | ADR-001 |
| Id de nota `note:{vault_id}:{uuid}`, no `notes/{slug}.md` del diseño original | El diseño de agosto es anterior al modelo de seguridad de SPEC-0005 (lista blanca por prefijo); el id debe traer el `vault_id` para que el push pueda validar pertenencia sin consultar la bóveda en cada doc | Mantener `notes/{slug}.md` y validar `vault_id` solo por campo (más débil: el id no ata la nota a su bóveda) | — |
| Carpetas como prefijos de `path`, no documentos propios | Así lo decidía ya el diseño original (`1.1.5.2`, `1.1.4.4`); evita un tipo de documento extra y conflictos de sync sobre "la carpeta" | Documento `folder:*` propio | — |
| Editor Milkdown + CodeMirror 6, PWA, sin librería de diseño de terceros | Ya decidido en ADR-010, Carlos no lo cuestionó | Monaco, editor propio desde cero | ADR-010 |
| Soft-delete + papelera para notas, igual que bóvedas | Consistencia de UX con SPEC-0003; el diseño original no lo decidía explícitamente | Borrado definitivo inmediato | — (propuesta AIRA, confirmar en Fase 1) |

## 7. Requisitos no funcionales (RNF)
- *(a definir en Fase 1 — candidato: latencia de apertura del árbol de una bóveda con
  varios cientos de notas, por analogía con RNF-001 de SPEC-0003).*

## Marcadores abiertos
- `[NEEDS CLARIFICATION: nombre exacto del documento de reserva de `path` — análogo a
  `vault-name:*` pero con el `vault_id` incluido para no colisionar entre bóvedas]`
- `[NEEDS CLARIFICATION: soft-delete de notas con papelera — ¿se confirma el mismo patrón
  que bóvedas, o algo más simple para la primera versión?]`
- `[NEEDS CLARIFICATION: nota sin título/path — "Sin título" por defecto o 422?]`
- `[NEEDS CLARIFICATION: qué pasa con las notas de una bóveda que se borra — se ocultan
  junto con la bóveda (recuperables si se restaura la bóveda) o tienen su propio ciclo?]`
- `[NEEDS CLARIFICATION: nota por defecto al abrir `/vaults/{vault_id}` — vacío, última
  abierta, o la primera del árbol?]`
- `[NEEDS CLARIFICATION: límite de tamaño de `content` — SPEC-0003 limita `description` a
  2000 caracteres; una nota markdown puede ser mucho más larga, ¿qué tope es razonable?]`

**Antes de Fase 2 (Plan):** cerrar todos los marcadores de arriba con Carlos y pasar
`aprobaciones.fase_1` a `{por: "Carlos Jiménez (cjhirashi)", fecha: ...}` con el "así es".
