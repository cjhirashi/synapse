---
id: SPEC-0008
tipo: spec
feature: 0008-vault-editor
estado: draft            # draft | in-review | approved | implemented | verified | deprecated
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: f8c3a4e
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
  fase_1: { por: "Carlos Jiménez (cjhirashi), vía AIRA (delegación explícita 2026-10-22: \"Tú dirige a Claude Code\")", fecha: 2026-10-22 }
actualizado: 2026-10-22
---

# SPEC-0008 · Editor de documentos dentro de una bóveda

> Fase 1 (Specify) cerrada por AIRA a partir de: (a) el diseño original de agosto 2026
> en `diseño/1.1.4 - Diseño UI-UX/1.1.4.4` (vista), `diseño/1.1.2.../ADR-010` (stack del
> editor) y `diseño/1.1.5.../1.1.5.2`/`1.1.5.5` (modelo de datos y sincronización); (b) la
> conversación directa con Carlos del 2026-10-22, incluida su decisión explícita sobre
> conflictos (§6) y su delegación explícita para que AIRA dirija esta implementación
> ("Tú dirige a Claude Code, para que implemente lo que te pedí y quede Synapse
> funcional"). Todo el diseño original es anterior al modelo de seguridad actual
> (SPEC-0003/0005: aislamiento por bóveda vía lista blanca de ids en `/sync`); este spec
> lo reconcilia. **GATE 1 lo aprueba AIRA en nombre de Carlos para esta feature
> puntual** — no es licencia para que Claude Code se autoapruebe fases futuras sin que
> AIRA o Carlos lo autoricen explícitamente cada vez.

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
- "Última nota abierta" recordada entre sesiones — v1 abre siempre en estado vacío (§6).

## 3. Modelo de datos y contratos de E/S
| Frontera | Dirección | Tipo | Contrato en `contracts/` |
|---|---|---|---|
| `/sync/…` (mismo proxy de SPEC-0005, ahora acepta `note:*` además de `vault:*`) | entrada/salida | HTTP CouchDB | `openapi.yaml` (Fase 2) |
| Base CouchDB `synapse_user_{id}` | salida | HTTP CouchDB | — (puerto existente, sin base nueva) |

**Nota (documento CouchDB, campos — adapta el modelo de `1.1.5.2` original al esquema de
id vault-scoped que exige la lista blanca de SPEC-0005):**

| Campo | Tipo | Regla |
|---|---|---|
| `_id` | string | `note:{vault_id}:{note_uuid}` — `note_uuid` UUID v4 generado por el cliente, en forma canónica; el id NO cambia al renombrar/mover (eso solo cambia `path`) |
| `type` | string | constante `"note"` |
| `vault_id` | string (UUID) | debe ser una bóveda no borrada del propio usuario |
| `path` | string | ruta completa con carpetas, p. ej. `Carpeta/Nota.md`; 1–300 caracteres tras quitar espacios a los lados, sin caracteres de control (`Cc`); único entre notas no borradas de la misma bóveda |
| `frontmatter` | object | opcional, claves libres (equivalente JSON del YAML del diseño original) |
| `content` | string | markdown crudo; ≤ 2 MiB (RF-016) |
| `created_at`, `updated_at` | string (RFC 3339, UTC) | igual criterio que bóvedas |
| `deleted_at` | string \| null | `null` salvo en la papelera (soft delete, mismo patrón que bóvedas) |

- Unicidad de `path` por bóveda: documento de reserva `note-path:{vault_id}:{path normalizado NFKC+casefold}` en la misma base — mismo mecanismo que `vault-name:{...}` de SPEC-0003 (§7 de PLAN-0003), aplicado por bóveda en vez de por usuario.
- Nada de adjuntos binarios en esta versión (fuera de alcance).
- Errores: `application/problem+json` (RFC 9457), igual que el resto de la API.

## 4. Criterios de aceptación (EARS)

**Apertura de bóveda**
- **RF-001** — CUANDO un usuario abre `/vaults/{vault_id}` de una bóveda propia no
  borrada el sistema DEBE mostrar el riel de bóvedas, la sidebar con el árbol de notas
  de esa bóveda (carpetas vía `path`, sin aplanar) y el editor en estado vacío (RF-015).
- **RF-002** — SI `vault_id` no existe, está borrada o no es del usuario ENTONCES el
  sistema DEBE responder/mostrar 404, igual criterio que RF-014 de SPEC-0003.
- **RF-015** — El editor DEBE abrir sin ninguna nota seleccionada al entrar a
  `/vaults/{vault_id}`; no se recuerda la última nota abierta entre sesiones (v1).

**Crear, renombrar, mover**
- **RF-003** — CUANDO el usuario crea una nota el sistema DEBE guardarla como `note:*`
  con `vault_id` de la bóveda activa, `path` igual al título capturado (o "Sin título",
  RF-012, si no captura ninguno) y abrirla en modo edición.
- **RF-011** — CUANDO el usuario renombra o mueve una nota (cambia `path`) el sistema
  DEBE actualizar el árbol sin cambiar el `_id`; la reserva de `path` (§3) libera el
  nombre anterior y toma el nuevo, mismo mecanismo de RF-021/RF-027 de SPEC-0003.
- **RF-012** — SI el usuario crea una nota sin indicar título/`path` ENTONCES el sistema
  DEBE asignarle `path = "Sin título.md"`, o si ya existe una no borrada con ese nombre
  en la bóveda, `"Sin título {n}.md"` con el menor `n` libre — nunca 422 por falta de
  título.
- **RF-013** — SI al crear, renombrar o restaurar una nota ya existe otra no borrada en
  la misma bóveda con un `path` equivalente (NFKC + casefold, §3) ENTONCES el sistema
  DEBE responder 409 sin guardar nada.

**Edición**
- **RF-007** — CUANDO el usuario abre una nota el sistema DEBE mostrarla primero en
  modo lectura (renderizada, sin cursores visibles); el botón "Editar" DEBE activar el
  modo edición y "Leer" debe volver a renderizarla.
- **RF-008** — MIENTRAS esté en modo edición el sistema DEBE ofrecer alternar Visual
  (Milkdown) y Código (CodeMirror 6) sobre el mismo contenido, sin pérdida de cambios ni
  recarga al cambiar de modo.
- **RF-016** — SI el `content` enviado supera 2 MiB ENTONCES el sistema DEBE rechazar el
  guardado (413 o 422 vía el push) sin perder la versión previa.

**Borrar, papelera, restaurar**
- **RF-010** — CUANDO el usuario borra una nota el sistema DEBE marcar `deleted_at` (soft
  delete), conservar el contenido y quitarla del árbol activo — mismo patrón que RF-011
  de SPEC-0003 para bóvedas; la papelera de notas vive dentro de la bóveda (no mezclada
  con la papelera de bóvedas).
- **RF-017** — CUANDO el usuario restaura una nota de la papelera el sistema DEBE poner
  `deleted_at = null`, sujeto a RF-013 (409 si el `path` quedó ocupado mientras tanto).
- **RF-014** — CUANDO una bóveda se borra (soft delete, SPEC-0003) sus notas DEBEN dejar
  de ser visibles/editables mientras la bóveda esté borrada, sin moverlas a su propia
  papelera de notas; CUANDO la bóveda se restaura sus notas DEBEN reaparecer tal como
  estaban — las notas no tienen ciclo de vida independiente del de su bóveda.

**Sincronización y aislamiento (extiende SPEC-0005)**
- **RF-004** — SI el push de `/sync` trae un documento `note:*` cuyo `vault_id` no
  corresponde a una bóveda no borrada del propio usuario ENTONCES el sistema DEBE
  rechazarlo, mismo mecanismo de validación que RF-005/RF-006 de SPEC-0005 usan para
  `vault:*`.
- **RF-005** — CUANDO el push trae un documento `note:*` el sistema DEBE validarle forma
  (`type`, `vault_id`, `path`, `content`, límites de §3) igual que `_check_shape()` ya
  hace para `vault:*`; cualquier campo fuera de esa lista rechaza el documento completo.
- **RF-006** — El sistema DEBE extender `is_replicable_id()` (SPEC-0005 RF-007) para
  aceptar también `note:{vault_id}:{uuid}` canónico (ambos UUID en forma canónica), sin
  abrir el canal a ningún otro tipo de id.

**Conflictos**
- **RF-009** — CUANDO el cliente detecta una nota con revisiones en conflicto el sistema
  DEBE mostrar ambas versiones (texto plano, sin diff visual en esta versión) y dejar
  que el usuario elija una — nunca resolver automático por timestamp (ADR-001). La UI
  fina de resolución (diff, merge campo a campo) queda fuera de esta versión (decisión
  de Carlos, 2026-10-22).

**UI**
- **RF-018** — `VaultListPage` DEBE ofrecer, junto a "Editar", una acción "Abrir" que
  lleve a `/vaults/{vault_id}`.
- **RF-019** — La sidebar DEBE listar las notas de la bóveda activa en árbol según su
  `path`; un click sobre una nota DEBE abrirla en modo lectura (RF-007) en el editor.

## 5. Casos límite y manejo de errores
- Bóveda borrada mientras el usuario tiene notas suyas abiertas: la vista de la bóveda
  responde 404 (RF-002) como si la bóveda no existiera; las notas reaparecen intactas si
  se restaura (RF-014).
- Edición concurrente del mismo `path` en dispositivos distintos: conflicto expuesto
  (RF-009), nunca silencioso.
- Creación sin título: `"Sin título.md"`, `"Sin título 2.md"`, … (RF-012), nunca 422.
- Dos notas con el mismo `path` en la misma bóveda (carrera de creación/renombrado):
  sólo una gana, 409 a la otra (RF-013), igual patrón que RF-021 de SPEC-0003.
- `content` que supera 2 MiB: rechazado sin perder la versión previa (RF-016).
- `vault_id` ajeno o inexistente en un documento `note:*` que llega por push: rechazado
  (RF-004), igual criterio de aislamiento que bóvedas (SPEC-0005 RF-005/RF-006).

## 6. Registro de decisiones y descartes
| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| Sin Panel de Agente en esta feature | Pedido explícito de Carlos (2026-10-22) | Incluirlo de una (lo que decía el diseño original) | ADR-011 (diferido) |
| Conflictos: se exponen siempre al usuario; la UI de resolución fina queda para después | Decisión de Carlos (2026-10-22): "La UI final queda para después, ya completa Synapse" — pero nunca se acordó resolver en silencio, eso violaría ADR-001 | Last-write-wins silencioso | ADR-001 |
| Id de nota `note:{vault_id}:{uuid}`, no `notes/{slug}.md` del diseño original | El diseño de agosto es anterior al modelo de seguridad de SPEC-0005 (lista blanca por prefijo); el id debe traer el `vault_id` para que el push valide pertenencia sin una consulta extra por documento | Mantener `notes/{slug}.md` y validar `vault_id` solo por campo (más débil: el id no ata la nota a su bóveda) | — |
| Carpetas como prefijos de `path`, no documentos propios | Así lo decidía ya el diseño original (`1.1.5.2`, `1.1.4.4`); evita un tipo de documento extra y conflictos de sync sobre "la carpeta" | Documento `folder:*` propio | — |
| Editor Milkdown + CodeMirror 6, PWA, sin librería de diseño de terceros | Ya decidido en ADR-010, Carlos no lo cuestionó | Monaco, editor propio desde cero | ADR-010 |
| Soft-delete + papelera para notas, igual que bóvedas, papelera por bóveda | Consistencia de UX con SPEC-0003; el diseño original no lo decidía explícitamente; mezclar con la papelera de bóvedas confundiría dos jerarquías distintas | Borrado definitivo inmediato; una papelera global | — (decisión AIRA, delegada por Carlos 2026-10-22) |
| Reserva de `path` con documento `note-path:{vault_id}:{path normalizado}` | Mismo mecanismo ya probado para nombres de bóveda (SPEC-0003 §7); evita duplicados en la carrera de creación | Comprobar-y-luego-escribir (admite duplicados raros) | — |
| Nota sin título → `"Sin título.md"` + sufijo numérico si colisiona | Menor fricción, estilo Obsidian: crear primero, titular después; nunca bloquear con 422 por algo tan común | 422 si falta título | — (decisión AIRA, delegada por Carlos 2026-10-22) |
| Notas de una bóveda borrada: ocultas junto con la bóveda, reaparecen si se restaura; sin papelera propia en ese caso | Evita una tercera jerarquía de borrado (bóveda + papelera de bóveda + papelera de notas simultánea); la bóveda ya es la unidad de soft-delete | Mover las notas a su papelera individual al borrar la bóveda | — (decisión AIRA, delegada por Carlos 2026-10-22) |
| `/vaults/{vault_id}` abre siempre en estado vacío (sin "última nota abierta") en v1 | Evita decidir ahora dónde persistir esa preferencia (¿local, por dispositivo, en el server?); se puede añadir después sin romper nada | Recordar la última nota por dispositivo (localStorage) | — (decisión AIRA, delegada por Carlos 2026-10-22) |
| Límite de `content`: 2 MiB por nota | Generoso para texto markdown real (una nota de 2 MiB son cientos de páginas); evita abuso del almacén sin estorbar el uso normal | Sin límite; límite más ajustado tipo `description` (2000 caracteres, insuficiente para una nota) | — (decisión AIRA, delegada por Carlos 2026-10-22) |

## 7. Requisitos no funcionales (RNF)
- **RNF-001** — Abrir `/vaults/{vault_id}` con 1 000 notas en la bóveda DEBE renderizar
  el árbol de la sidebar en p95 < 300 ms, por analogía con RNF-001 de SPEC-0003.

## Marcadores abiertos
- Ninguno. Decisiones de producto cerradas por AIRA bajo delegación explícita de Carlos
  (2026-10-22). El detalle técnico de implementación (contratos exactos de `/sync` para
  `note:*`, estructura de componentes del editor, nombres de archivos) se fija en
  Fase 2 (Plan), no aquí.
