---
id: PLAN-0009
tipo: plan
feature: 0009-rediseno-visual-workspace
estado: draft
aprobaciones:
  fase_2: pendiente
actualizado: 2026-10-23
---

# PLAN-0009 · Rediseño visual del workspace de bóvedas y notas

> El *cómo* de SPEC-0009 en el patrón por-capas con puertos (ADR-001):
> `routers → services → core/ports ← adapters`, y en el cliente módulos puros + componentes.
> Es una feature **de vestido**: misma lógica, mismas rutas, mismos datos; el único cambio de
> modelo es `Vault.icon` (spec §3/§6). Las decisiones de producto de spec §6 no se reabren;
> lo que este plan decide y necesita el visto bueno del GATE 2 está en §7 (P-1…P-12).
> **Orden (method.md v1.9, Fase 2):** primero la **maquetación contra el mockup** con datos
> simulados para el ícono; después el **backend funcional** de `Vault.icon`; al final el
> cableado funcional del cliente y la **verificación de fidelidad** con capturas reales.
>
> **Referencias de diseño** (fuera del repo: `diseño/` está en `.gitignore`; se leen en el
> checkout principal `/mnt/disco2/cjhirashi-data/proyectos/synapse/diseño/1.1.4 - Diseño UI-UX/`):
> `1.1.4.1 - Sistema de Diseño.md`, `1.1.4.2 - Navegación y Responsividad.md`,
> `1.1.4.4 - Vista - Editor Principal.{md,html}`. Las medidas que este plan exige se
> **congelan aquí** (§5.4, tabla R-n), medidas en Chromium sobre el mockup el 2026-10-23
> (capturas en `/tmp/s9/ref/mockup-{dark,light}-{1440,1024}.png`, geometría en
> `/tmp/s9/ref/mockup-geometry.json`); así la verificación no depende de un archivo no versionado.

## 0. Gates de simplicidad
- [x] Simplicity — ningún componente de layout nuevo salvo los que el mockup exige (chip de
  bóveda, tooltip del riel, selector de ícono); el resto es CSS sobre los componentes de 0008.
  Un solo campo nuevo (`Vault.icon`, string) que codifica ícono **y** color (P-1): sin columna,
  colección ni migración nuevas.
- [x] Anti-Abstraction — sin librería de UI ni sistema de temas nuevo; el catálogo de íconos es
  un mapa estático de ~24 componentes de `lucide-react` (ya dependencia), no un registro dinámico.
  La regla de `icon` existe una vez en Python (`core/schemas.py`) y una vez en TS
  (`sync/vaultRules.ts`), atadas por la batería común que ya usan `name`/`description`/`tags`.
- [x] Integration-First — `contracts/vault-icon.schema.json` (gramática del campo) se fija en este
  plan; el delta del OpenAPI de 0003 (§4) se escribe primero como test rojo de esquema y se
  re-exporta en la Fase 4.

## 1. Cumplimiento constitucional
| Artículo | Cómo lo respeta este plan |
|---|---|
| Art. 1–2 (patrón) | La regla de `icon` es un tipo anotado de `core/schemas.py` (núcleo); `services/vault_service.py` lo persiste y `services/sync_push.py` lo valida con la **misma** regla (`_FIELD_RULES`); `routers/vaults.py` no gana lógica; `adapters/vault_repository.py` no cambia (guarda el documento tal cual). En el cliente la lógica pura (gramática, catálogo, paleta, color derivado, tema por defecto) vive en módulos sin React (`sync/vaultRules.ts`, `vaults/vaultIcon.ts`, `theme/useTheme.ts`); los componentes sólo la llaman. |
| Art. 1 (dependencias nuevas) | Una, de desarrollo: `@playwright/test` **1.56.0** (P-9) para versionar las pruebas de fidelidad en navegador real que exige Gate 4. Ninguna dependencia de ejecución nueva (`lucide-react` 1.61.0 ya está). |
| Art. 3 (testing) | TDD por zona (§5); ≥ 80 % por módulo tocado; push y REST de `icon` contra **CouchDB real** (P5); fidelidad y RNF-001 medidos en **Chromium real** (contenedor Playwright), no en jsdom. |
| Art. 5 (seguridad) / P2–P3 | `icon` es texto ASCII acotado (≤ 64, gramática cerrada `[a-z0-9-]` y un `:`), validado en REST y en el push; el cliente **nunca** lo interpreta como HTML, SVG, URL ni CSS crudo: el glifo se busca en un mapa estático (desconocido → iniciales) y el color en un mapa de claves → `var(--token)` (desconocido → derivado), así que no hay inyección de marcado ni de estilo. La lista blanca de claves del push gana **sólo** `icon` para `vault:*`; notas, reservas y aislamiento por usuario no cambian. |
| Art. 6 (contratos/errores) | JSON Schema del campo en `contracts/`; OpenAPI de 0003 re-exportado (cambio aditivo, no destructivo: oasdiff). Errores: 422 RFC 9457 por el traductor de SPEC-0004 (la clave `pattern` ya es segura en `SAFE_CTX_KEYS`); en el push, `validation-error:icon` (el patrón `validation-error:.+` del contrato de 0005 ya lo admite: 0005 **no** se re-exporta, lo confirma `test_contract.py`). |
| Art. 10 (raíz) | El riel deja de “cortar” su altura con `sticky + max-height` (parche de U-7) y pasa a un **marco de altura fija** donde cada columna tiene su propio scroll (P-5); el tema por defecto se cambia en su origen (constante única + script previo al primer pintado), no con un `setAttribute` por ruta. |
| Art. 11 (docs) | §8. |
| Art. 12 | Sin artefactos nuevos fuera de `spec/plan/tasks/contracts`; la tabla de medidas de referencia vive en este plan (§5.4), no en un documento aparte. |

## 2. Arquitectura de la feature (por-capas con puertos)

### 2.1 Núcleo
- **Backend — `core/schemas.py` (0003/0002):** `VaultIcon = Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)?$")]`.
  Sin `strip_whitespace` ni `to_lower`: el valor llega en su forma final (un espacio o una
  mayúscula es inválido, no "no normalizado"). `VaultCreate.icon: VaultIcon | None = None`;
  `VaultUpdate.icon: VaultIcon | None = None` (`null` explícito borra, como `description`);
  `VaultOut.icon: str | None` (obligatorio y anulable en la salida; `VaultListItem` lo hereda).
- **Cliente — `sync/vaultRules.ts` (0005):** `VaultField` gana `"icon"`; `VaultFields.icon: string | null`;
  `checkIcon(value)` (mismo patrón, longitud en puntos de código, sin normalizar); `ICON_MAX = 64`.
- **Cliente — `vaults/vaultIcon.ts` (nuevo, puro):**
  - `ICON_SET`: mapa estático `id → componente lucide` del **set curado** (24 glifos verificados en
    `lucide-react` 1.61.0: `folder`, `folder-heart`, `book`, `book-open`, `notebook`, `brain`,
    `briefcase`, `code`, `flask-conical`, `graduation-cap`, `heart`, `house`, `lightbulb`, `music`,
    `palette`, `pen-tool`, `rocket`, `star`, `target`, `users`, `camera`, `globe`, `leaf`, `dumbbell`).
    Importaciones nombradas (el *bundler* sólo incluye esos 24).
  - `PALETTE = ["accent", "info", "success", "warning", "danger"]`: **claves de tokens existentes**
    de `tokens.css` (spec §6: sin valores nuevos); `colorVar(key) = "var(--" + key + ")"` sólo para
    claves de la lista.
  - `parseIcon(icon: string | null | undefined): { glyph: string | null; color: PaletteKey | null }`
    (`initials`, glifo desconocido o `null` → `glyph: null`; color desconocido → `null`).
  - `formatIcon(glyph, color): string | null` (inverso; `glyph = null` y `color = null` → `null`;
    sólo color → `initials:{color}`).
  - `derivedColor(vaultId)`: índice estable (suma de códigos del UUID mod 5) sobre `PALETTE` —
    el "color derivado" de RF-001, estable al renombrar.
  - `initials(name)`: se **mueve** aquí desde `notes/VaultRail.tsx` (misma implementación y
    exportación re-exportada para no romper su test).
- **Cliente — `theme/useTheme.ts` (0002):** `DEFAULT_THEME_MODE: ThemeMode = "dark"` exportada;
  `readStored()` devuelve `DEFAULT_THEME_MODE` (antes `"system"`) cuando no hay valor guardado
  válido. **No** escribe `localStorage` al aplicar el defecto (la preferencia sólo se guarda cuando
  el usuario pulsa el control), así "sin preferencia guardada" sigue siendo distinguible (RF-006a).

### 2.2 Coordinación
| Módulo | Cambio | RF |
|---|---|---|
| `services/vault_service.py` (0003) | `create` escribe `"icon": data.icon`; `update` no cambia (ya fusiona `model_dump(exclude_unset=True)`, así que `icon` ausente conserva el valor y `null` lo borra); `_to_out` lee `doc.get("icon")` (documentos anteriores sin la clave → `null`). | RF-011, RF-012 |
| `services/sync_push.py` (0005) | `_VAULT_KEYS` (admitidas) gana `"icon"`; nueva tupla `_VAULT_REQUIRED` = las de antes (sin `icon`) para la columna `required` de `_KINDS["vault:"]`; `_FIELD_RULES["icon"] = TypeAdapter(VaultIcon \| None)`; `_check_vault_fields` sólo comprueba `icon` si la clave está (patrón de `frontmatter` en notas). Un valor inválido → `validation-error:icon`; como la regla no normaliza, `not-normalized:icon` no puede darse. | RF-012 |
| `routers/vaults.py` (0003) | Sin código nuevo: los modelos de §2.1 publican el campo. | RF-012 |
| `sync/vaultStore.ts` (0005) | `VaultDoc`/`Vault` ganan `icon`; `toVault` da `icon: doc.icon ?? null`; `create` escribe `icon` sólo si viene (por omisión `null`); `update` lo valida con `checkIcon` (entra en `FIELD_ORDER`/`FIELD_RULES`) y lo fusiona como los demás campos. | RF-011, RF-012 |
| `sync/merge.ts` + `sync/conflicts.ts` (0005) | `icon` entra en el cuerpo de fusión (`MergeBody`, lectura con `?? null`) y en `sameExceptUpdatedAt`. Fusión a 3 vías: si sólo un lado lo cambió, gana ese lado; **si ambos lo cambiaron distinto, gana el de W (ganadora) sin mandar el conflicto a resolución manual** (P-6). | RF-012 |
| `sync/ConflictView.tsx` (0005) | La resolución manual conserva el `icon` de la ganadora (no muestra selector; P-6). | RF-012 |
| `vaults/fields.ts`, `sync/RejectionsPage.tsx` (0003/0005) | Mensaje de `validation-error:icon` ("El ícono elegido no es válido.") en `FIELD_MESSAGES` (el `Record<VaultField,…>` lo exige al compilar). | RF-012 |

### 2.3 Componentes de interfaz (zona frontend — bloque de maquetación)
Medidas de referencia en §5.4 (R-n). Todo color, radio, sombra, espaciado y duración sale de
`tokens.css`; las **dimensiones de componente** (56, 240, 34, 780 px…) salen del mockup.

**a) Marco de la app (`layout/AppLayout.css`, 0002).** `.app-shell` pasa a columna flex de alto
`100dvh`; `.app-body` `flex: 1; min-height: 0`; el riel y `.app-main` tienen **cada uno su scroll**
(`overflow-y: auto`). Con `.vault-workspace` dentro, `.app-main` no tiene *padding* ni ancho
máximo y no hace scroll (lo hacen sus columnas). Cabecera y barra de sync de 0002/0005 no cambian
(P-4). Sustituye el `position: sticky; max-height: 100vh` del riel (U-7) — P-5.

**b) Riel (`notes/VaultRail.tsx`, `notes/notes.css`).**
- `.vault-rail`: ancho 56 px, `--bg-secondary`, borde derecho `--border`, *padding* `var(--space-3) 0`
  (mockup 10 px → token más cercano 12), `gap: var(--space-2)`, `overflow-y: auto`, alto completo.
- Cada bóveda es un `NavLink` con el chip `VaultChip` (nuevo `vaults/VaultChip.tsx`, estilos del chip y del selector en `vaults/VaultChip.css`): 34 × 34 px,
  **círculo** (`border-radius: 50%`) que al pasar el cursor o estar activo se vuelve `--radius-md`
  (transición `--dur-base`/`--ease-standard`, el gesto Discord del mockup); fondo
  `color-mix(in srgb, var(--{color}) 18%, var(--bg-tertiary))`, aro interior de 2 px del color
  elegido o derivado y glifo en `--text-primary` (ícono lucide 18 px, `stroke-width: 2`, o iniciales
  12 px/700). Contraste del glifo ≥ 8,5:1 en los 5 colores y ambos temas (medido en este plan;
  el test lo fija, §5.1). P-2 explica por qué no se copia el chip sólido con texto blanco del mockup.
- **Activa:** barra indicadora de 3 × 20 px en `--accent` pegada al borde izquierdo del riel
  (`::before`, como el mockup) + forma `--radius-md`. `aria-current="page"` lo pone `NavLink` (sin cambio).
- **Tooltip (RF-002):** `RailTooltip` (en `VaultRail.tsx`) con el nombre completo, `position: fixed`
  y montado en `document.body` (portal) para que el `overflow` del riel no lo recorte; aparece a
  la derecha del ícono (x = borde derecho del riel + `--space-2`, centrado en vertical) al pasar el
  cursor **o** al enfocar con teclado (`:focus-visible`), con `--dur-fast`; fondo `--bg-tertiary`,
  borde `--border`, `--radius-sm`, `--shadow-panel`, texto 12 px `--text-primary`. `aria-hidden`
  (el nombre ya está en el nombre accesible). Se retira el `title` nativo (evita el doble tooltip).
- **Nombre accesible (RF-007):** con iniciales visibles sigue `"{iniciales} {nombre}"` (U-4,
  WCAG 2.5.3); con ícono (sin texto visible) es `"{nombre}"`.

**c) Barra lateral (`notes/VaultWorkspacePage.tsx`, `notes/NoteSidebar.tsx`, `notes/notes.css`).**
- Columna `.vault-workspace-side` de **240 px**, alto completo, `--bg-secondary`, borde derecho
  `--border`, sin *gap* exterior (pegada al riel, como el mockup).
- **Cabecera** (`.vault-workspace-header`, 51 px ± 2): ícono `folder-open` 14 px en `--accent` +
  el `h1` del nombre de la bóveda en 13 px/600 con elipsis (sigue siendo `h1`: RF-007), *padding*
  `var(--space-3) var(--space-4)`, borde inferior `--border`.
- **Formulario "Nueva nota"** (RF-003): bloque propio `.note-sidebar-new` con fondo
  `--bg-tertiary`, borde `--border`, `--radius-sm`, margen `var(--space-2)`; input + botón con
  ícono `plus` en una fila. Mismas etiquetas y botón (`Título de la nota nueva (opcional)`,
  `Nueva nota`).
- **Barra de acciones / renombrado:** igual que hoy, bajo el formulario, con los tokens actuales.
- **Panel del árbol** (`.note-tree-panel`, envoltorio nuevo del `role="tree"`): fondo
  `--bg-secondary`, separado del formulario por borde superior `--border`, scroll propio; el
  fondo del formulario (`--bg-tertiary`) ≠ el del árbol (`--bg-secondary`) es el criterio objetivo
  de RF-003.
- **Filas** (RF-004, RF-010): carpeta = chevron 12 px + `folder`/`folder-open` 13 px en `--warning`
  + nombre; nota = `file-text` 12 px en `--text-muted` + nombre. Alto 27 px (carpeta) / 25 px
  (nota) ± 1, texto 12 px `--text-secondary` (`--text-primary` al pasar el cursor), sin radio
  (filas a sangre como el mockup), sangría de **24 px por nivel** (`--space-6`) y la nota 20 px
  más adentro que la carpeta hermana para alinear su ícono con el de la carpeta. Elipsis (ya existe
  en `.note-tree-name`). **Seleccionada:** `--accent-soft` + barra izquierda 3 px `--accent` y texto
  `--text-primary` (desvío consciente del `--accent-hover` del mockup: P-3).
- **Pie:** "Papelera de la bóveda" como fila de pie (`margin-top: auto`, borde superior, ícono
  `trash-2`), mismo botón y nombre.

**d) Editor (`editor/NoteEditor.tsx`, `editor/editor.css`, `editor/MilkdownView.tsx`, `editor/CodeView.tsx`).**
- `.vault-workspace-main` = columna flex de alto completo.
- **Barra superior** (`.note-editor-header` → franja de 43 px ± 2): fondo `--bg-secondary`, borde
  inferior `--border`, *padding* `var(--space-2) var(--space-4)`; título (`h2`) 13 px/500
  `--text-secondary` con elipsis y `flex: 1`; estado y botones (Visual/Código, Guardar, Leer/Editar)
  a la derecha con separadores de 1 px `--border` (mismos roles, nombres y `aria-pressed`).
- **Cuerpo** (`.note-editor-body`): sin marco de tarjeta (se quitan borde, radio y fondo propios);
  el área hace scroll y dentro el contenido va en una **columna de 780 px de ancho máximo
  centrada** (`margin-inline: auto`) con *padding* `var(--space-8) var(--space-16)`; párrafos 14 px,
  `line-height: 1.8` (Milkdown), CodeMirror 13 px mono en la misma columna. Avisos y confirmaciones
  (`.note-editor-notice/-confirm`) dentro de la misma columna.
- **Estado vacío** (RF-008): `.vault-workspace-empty` centrado en ambos ejes del panel del editor
  (`display: grid; place-items: center`), ícono `file-text` 32 px `--text-muted` + el mismo texto
  ("Abre o crea una nota para empezar.") en 14 px `--text-secondary`. "Cargando el editor…" y la
  papelera de notas usan la misma columna centrada.

**e) Selector de ícono (RF-011) — `vaults/IconPicker.tsx` (nuevo) en `vaults/VaultForm.tsx`.**
- En "Nueva bóveda" y "Editar bóveda" (la "configuración" de la bóveda en esta app): vista previa
  con `VaultChip`; `role="radiogroup"` "Ícono" con la opción **Iniciales** + los 24 glifos
  (botones-radio 32 px, flechas para moverse, nombre accesible en español del glifo) y
  `role="radiogroup"` "Color" con **Automático** + las 5 claves de la paleta (muestras circulares
  de 24 px con nombre accesible: Cian, Azul, Verde, Ámbar, Rojo).
- `VaultForm` envía `icon` sólo si cambió (función `changes` existente).
- `VaultListPage` muestra el `VaultChip` junto al nombre (coherencia con el riel; ya se edita ahí).

### 2.4 Fronteras de salida
| Frontera | Para qué | Implementación concreta |
|---|---|---|
| `VaultPort` (existente) | guardar/leer el documento de bóveda con `icon` | `adapters/vault_repository.py` **sin cambios** (el documento se guarda tal cual; se cubre con test de ida y vuelta contra CouchDB real) |
| `ReplicationPort` (existente) | escritura `new_edits:false` del push | `adapters/replication_repository.py` sin cambios |
| Réplica PouchDB del navegador | escritura de `icon` desde la UI (P-1 de 0005) | `sync/vaultStore.ts` |
| `localStorage["synapse-theme"]` | preferencia de tema (sólo lectura del defecto) | `theme/useTheme.ts` + script de `frontend/index.html` |

## 3. Modelo de datos
- **CouchDB** (`synapse_user_{id}`), documento `vault:{uuid}`: clave **opcional** `icon`
  (`null` | cadena de `contracts/vault-icon.schema.json`). Sin migración: los documentos existentes
  no la tienen y se leen como `null` (spec §3: "no una migración de datos obligatoria").
- **Postgres/alembic:** sin cambios. El `covers` borrador `backend/alembic/versions/*vault_icon*`
  se retira: `Vault` vive en CouchDB, alembic es sólo de auth (0002).
- Sin índices nuevos; `list_page` (REST) devuelve el documento completo, así que `icon` sale en los
  listados sin tocar el adaptador.

## 4. Contratos
| Archivo | Frontera | Gate(s) de CI |
|---|---|---|
| `0009-rediseno-visual-workspace/contracts/vault-icon.schema.json` (creado en este plan) | gramática de `icon` en REST y en el documento replicado | `test_vault_schemas.py` (los `examples` y casos límite contra `VaultIcon`); `vaultRules.test.ts` (misma batería) |
| `0003-vault-crud/contracts/openapi.yaml` | **delta** (re-exportar en Fase 4 con `backend/scripts/export_openapi.py`): `VaultCreate.icon` y `VaultUpdate.icon` = `anyOf[{type: string, minLength: 1, maxLength: 64, pattern: …}, {type: null}]`, opcionales; `VaultOut.icon` y `VaultListItem.icon` = `anyOf[string, null]` **obligatorios**. Rutas y errores sin cambios. | `test_contract.py` (contrato = app), Spectral, oasdiff (aditivo: campo opcional en peticiones y campo nuevo en respuestas → no destructivo) |
| `0005-sync/contracts/openapi.yaml` | sin cambios (el `reason` ya admite `validation-error:.+`) | `test_contract.py` lo confirma |

## 5. Estrategia de pruebas (por zona, TDD)

### 5.1 Pruebas por zona
| Zona | Qué se prueba | Herramienta / archivo |
|---|---|---|
| Núcleo backend | `VaultIcon`: válidos (`folder`, `folder-heart`, `book-open:success`, `initials:warning`, 64 chars), inválidos (vacío, 65 chars, mayúsculas, espacios, `a::b`, `a:`, `:a`, `-a`, `a-`, `a_b`, `<svg>`, `javascript:x`, no ASCII, número, lista); `null` válido | `backend/tests/test_vault_schemas.py` + casos `icon` en `backend/tests/fixtures/vault_rules_cases.json` (los consume `test_sync_rules_mirror.py`) |
| Servicio | `create` con y sin `icon`; `update` con `icon` ausente (conserva), valor (cambia), `null` (borra); `_to_out` de documento antiguo sin clave → `null` | `backend/tests/test_vault_service.py` |
| Push (CouchDB real) | revisión con `icon` válido aceptada; sin clave aceptada (documentos antiguos); inválido → `validation-error:icon`; `icon` en una nota sigue siendo `validation-error:icon` de nota (clave no admitida); el resto de la batería de 0005/0008 verde sin tocarla | `backend/tests/test_sync_push.py` |
| Ruta (CouchDB real) | `POST`/`PATCH`/`GET`/listado con `icon`; 422 RFC 9457 con `pointer` `/icon` y mensaje del catálogo; `PATCH {"icon": null}` borra | `backend/tests/test_vaults_api.py` |
| Contrato | OpenAPI re-exportado = app | `backend/tests/test_contract.py` (existente) |
| Núcleo cliente | `checkIcon` contra la batería común; `parseIcon`/`formatIcon` (ida y vuelta, desconocidos), `derivedColor` estable y en `PALETTE`, `initials`; **contraste**: glifo `--text-primary` sobre `color-mix(18 %)` de cada clave de `PALETTE` sobre `--bg-tertiary` ≥ 4,5:1 en claro y oscuro (calculado desde `tokens.css`, mismo método que `accentContrast.test.ts`) | `frontend/src/sync/vaultRules.test.ts`, `frontend/src/vaults/vaultIcon.test.ts` |
| Almacén / fusión | `vaultStore` crea/actualiza/lee `icon` (documento sin clave → `null`); `mergeVault` con `icon` (un lado, ambos iguales, choque → W) | `frontend/src/sync/vaultStore.test.ts`, `frontend/src/sync/merge.test.ts` |
| Tema | sin `localStorage` → `data-theme="dark"` y el segmento "Tema oscuro" `aria-pressed=true`, **sin** escribir `localStorage`; con `light`/`system`/`dark` guardado → se respeta; el script de `index.html` usa el mismo defecto que `DEFAULT_THEME_MODE` (lee el archivo) | `frontend/src/theme/useTheme.test.tsx` (nuevo) |
| Componentes (jsdom) | riel: chip con ícono / iniciales / glifo desconocido → iniciales / color desconocido → derivado; tooltip al `hover` y al foco con el nombre completo; nombre accesible (iniciales: igual que hoy); bóveda actualizada por la réplica cambia el chip sin recargar (RF-012); árbol: ícono de carpeta (abierta/cerrada) y de nota con `data-icon`; panel del árbol separado del formulario; estado vacío; `IconPicker` (teclado de `radiogroup`, selección, "Automático", "Iniciales"); `VaultForm` envía `icon` sólo si cambió | `notes/VaultRail.test.tsx`, `notes/NoteSidebar.test.tsx`, `notes/VaultWorkspacePage.test.tsx`, `vaults/IconPicker.test.tsx` (nuevo), `vaults/VaultChip.test.tsx` (nuevo), `vaults/VaultForm.test.tsx`, `vaults/VaultListPage.test.tsx` |
| Estructura CSS | sólo `var(--…)`/`color-mix` de tokens (sin literales hex/rgb) en `notes.css`, `editor.css` y `vaults/VaultChip.css`; riel y columnas con `overflow-y: auto` en el marco de alto fijo (sustituye las aserciones de U-7 de `layoutCss.test.ts` **explícitamente**, RF-007); columna del editor `max-width: 780px` + `margin-inline: auto` | `notes/layoutCss.test.ts`, `notes/accentContrast.test.ts` (sin cambios: la fila seleccionada sigue en `--text-primary`) |
| Integración cliente–servidor | dos réplicas reales: `icon` escrito en una llega a la otra y el push lo acepta; uno inválido forzado en la réplica → rechazo `validation-error:icon` visible en `/rejections` | `frontend/src/sync/vaultIcon.integration.test.ts` (nuevo, `npm run test:sync`) |
| **Sistema — fidelidad visual** | §5.3 | `frontend/e2e/workspace-visual.spec.ts` (nuevo, `npm run test:visual`) |
| **Sistema — rendimiento** | RNF-001 en navegador real (§5.5) + `tree.perf.test.tsx` en jsdom (sin cambios, < 300 ms) | `frontend/e2e/workspace-perf.spec.ts` (nuevo), `notes/tree.perf.test.tsx` |

### 5.2 Cómo se corre la verificación en navegador real
- Contenedor `mcr.microsoft.com/playwright:v1.56.0-jammy --network host --ipc=host` con el
  `frontend/` del worktree montado; `@playwright/test` 1.56.0 (misma versión que la imagen: los
  navegadores ya están). Configuración en `frontend/playwright.config.ts`: Chromium,
  `deviceScaleFactor: 1`, `reducedMotion: "reduce"` (capturas estables sin transiciones), *baseURL*
  del backend del worktree que sirve la SPA (SPEC-0007, p. ej. `http://127.0.0.1:8010`).
- Datos: usuario y bóvedas sembrados por la API REST (incluido `icon`, que ya existirá en ese punto)
  y notas por la UI/réplica, como el recorrido de 0008. Tres bóvedas: `folder-heart:accent`,
  `initials:success`, `null`; árbol con 2 niveles de carpetas, 4 notas y un nombre de 120 caracteres.
- Salida: capturas PNG y `measurements.json` en `/tmp/s9/e2e/` (fuera del repo); el test **falla**
  si una medida sale de tolerancia. La comparación humana lado a lado es contra
  `/tmp/s9/ref/mockup-{tema}-{ancho}.png` (Gate 4).
- No entra en `npm test` (necesita backend y contenedor); se corre en las tareas de verificación de
  la Fase 4 y en Converge, con la salida pegada en `history.md` (Art. 3).

### 5.3 Fidelidad visual: capturas y criterio objetivo
Cada escenario se captura en **tema oscuro y tema claro**, a **1440 × 900** y **1024 × 768**
(mismo tamaño que las capturas del mockup), más un **390 × 844** de humo (sólo "nada se desborda").

| # | Captura (`/tmp/s9/e2e/…`) | Se compara con | Criterio objetivo (falla si no se cumple) |
|---|---|---|---|
| V-1 | `rail-{tema}-{ancho}.png` (recorte del riel) | mockup `.vault-rail`/`.vault-icon` | R-1…R-5 de §5.4; `border-radius` computado del chip inactivo = 50 %; del activo = `--radius-md`; barra activa 3 × 20 px `--accent`; color de fondo del riel = `--bg-secondary` del tema |
| V-2 | `rail-tooltip-{tema}.png` (hover sobre la 2.ª bóveda) | spec RF-002 | tooltip visible, texto = nombre completo, caja a la derecha del riel (x ≥ 56 px) sin recorte (cabe entera en el *viewport*) |
| V-3 | `sidebar-{tema}-{ancho}.png` | mockup `.sidebar`/`.sidebar-header`/`.tree-*` | R-6…R-11; fondo del formulario (`--bg-tertiary`) ≠ fondo del panel del árbol (`--bg-secondary`); cada fila con su `svg` de carpeta o nota (`data-icon`); fila larga: `scrollWidth` del árbol = `clientWidth` y la fila con elipsis (`text-overflow` y ancho ≤ panel) |
| V-4 | `editor-read-{tema}-{ancho}.png`, `editor-visual-…`, `editor-code-…` | mockup `.editor-topbar`/`.read-view` | R-12…R-15; columna del contenido centrada: \|margen izq. − margen der.\| ≤ 2 px dentro del panel; ancho de columna = min(780, ancho del panel) ± 2 px |
| V-5 | `empty-{tema}-{ancho}.png` | RF-008 | centro del bloque vacío a ≤ 4 px del centro del panel del editor en ambos ejes |
| V-6 | `rail-overflow-{tema}.png` (40 bóvedas) | RF-009 | `scrollHeight > clientHeight` del riel; el documento no hace scroll (`scrollingElement.scrollHeight = innerHeight`); la última bóveda se alcanza con el scroll del riel |
| V-7 | `picker-{tema}.png` (formulario de bóveda) | spec RF-011 | 25 opciones de ícono y 6 de color presentes; tras guardar, el chip del riel cambia sin recargar (misma `page`, sin navegación de documento) |
| V-8 | `theme-default.png` (contexto nuevo, `localStorage` vacío) | RF-006a | `documentElement[data-theme] = "dark"` antes y después de montar React; `localStorage["synapse-theme"]` sigue ausente |
| V-9 | todas las anteriores | RF-006 | color de fondo, borde y texto computados de riel, cabecera, panel, filas, barra y cuerpo del editor ∈ valores del tema activo en `tokens.css` (lista leída del archivo, no copiada) |
| V-10 | `mobile-390-{tema}.png` | 0008 (apilado ≤ 800 px) | sin scroll horizontal del documento; riel, árbol y editor visibles |

### 5.4 Medidas de referencia del mockup (congeladas, Chromium 1440 × 900, ambos temas)
| R | Elemento | Medida del mockup | Objetivo en la app | Tolerancia |
|---|---|---|---|---|
| R-1 | ancho del riel | 56 px | 56 px | 0 |
| R-2 | chip de bóveda | 34 × 34 px | 34 × 34 px | 0 |
| R-3 | x del chip en el riel | 10 px (centrado) | centrado: (56 − 34) / 2 = 11 px | ± 1 |
| R-4 | separación vertical entre chips | 6 px | `--space-2` = 8 px (token más cercano) | ± 2 |
| R-5 | barra de activa | 3 × 20 px, `--accent`, borde izq. | igual | ± 1 |
| R-6 | ancho de la barra lateral | 240 px | 240 px | ± 1 |
| R-7 | alto de la cabecera de la barra | 51 px | 51 px | ± 2 |
| R-8 | fila de carpeta / de nota | 27 / 25 px, 12 px de texto | igual | ± 1 |
| R-9 | sangría por nivel | 24 px | 24 px | ± 1 |
| R-10 | fondo riel / barra lateral / barra del editor | `--bg-secondary` | igual | exacto |
| R-11 | fila seleccionada | fondo `--accent-soft` | `--accent-soft` + barra 3 px `--accent`, texto `--text-primary` (P-3) | exacto |
| R-12 | barra superior del editor | 43 px, `--bg-secondary`, borde inf. `--border` | igual | ± 2 |
| R-13 | columna del contenido | 780 px máx., centrada | 780 px máx., centrada | ± 2 |
| R-14 | tipografía del cuerpo | 14 px, `line-height` 1.8 | igual | exacto |
| R-15 | x del panel del editor | 296 px (= 56 + 240) | 296 px | ± 1 |

Lo que el mockup tiene y esta spec **no** pide no se mide (Panel de Agente, buscador, "+" del riel,
ícono de Workspace de Desarrollo, campana, cabecera global ausente): ver P-4.

### 5.5 RNF-001 (rendimiento)
- **Umbral medido: p95 ≤ 150 ms en Chromium real** (el literal de la spec 0009), tiempo desde la
  navegación SPA a `/vaults/{id}` hasta que el árbol de una bóveda con **1 000 notas** está en el
  DOM (mismo método `MutationObserver` + `performance.now()` que T-126 de 0008), **30 medidas**,
  a 1440 × 900. `frontend/e2e/workspace-perf.spec.ts` falla si p95 > 150 ms e imprime mediana y p95.
- **Además** se mantiene `notes/tree.perf.test.tsx` (jsdom) con su umbral de 0008 (< 300 ms) como
  regresión rápida en `npm run test:perf`.
- La discrepancia de umbrales (300 ms en 0008, 150 ms citado en 0009) queda en §7 (P-8).

## 6. Secuenciación (tests antes que código; maquetación primero)
**Antes de la Fase 4:** el worktree no tiene `node_modules` → `npm ci` en `frontend/`, entorno del
backend, línea base limpia (pytest, vitest, typecheck, test:sync, test:perf, gate) **antes** de
la primera tarea.

0. **[doc] Re-anclaje preventivo** de las specs dueñas de archivos que esta feature toca (P-10):
   nota en `0008-vault-editor/spec.md` (modo `strict`: sin ella el primer cambio en `notes/**`
   cierra la compuerta) y en `0007-fastapi-sirve-spa/spec.md` (también `strict`, dueña de los README).
1. **A · Maquetación (frontend, datos simulados para el ícono).** El campo aún no existe en el
   servidor: el tipo `Vault` del cliente gana `icon?: string | null` sólo de **lectura**; los tests
   siembran documentos de réplica con `icon` directamente (`seedStore`), y una página de prueba no
   hace falta. El `IconPicker` se construye con `onChange` controlado sin persistir.
   1. Tema por defecto oscuro (test → `useTheme.ts`, `index.html`).
   2. Núcleo de presentación `vaults/vaultIcon.ts` (test de catálogo, paleta, color derivado y contraste → código).
   3. `VaultChip` + riel (círculo, activa, tooltip en portal, nombre accesible) — tests → código.
   4. Marco de altura fija + scroll propio por columna (`AppLayout.css`, `notes.css`) con la
      actualización **explícita** de las aserciones de U-7 en `layoutCss.test.ts`.
   5. Barra lateral: cabecera, formulario como bloque, panel del árbol, filas con íconos, sangría, pie.
   6. Editor: barra superior, columna centrada de 780 px, estado vacío.
   7. `IconPicker` (sin persistir) en `VaultForm`; chip en `VaultListPage`.
   8. **Revisión visual temprana** (method.md v1.9): `test:visual` con datos sembrados en la réplica
      (V-1…V-6, V-8…V-10) — aquí se corrige el desvío antes de construir el backend.
2. **B · Backend funcional de `Vault.icon`.**
   1. Casos de `icon` en `vault_rules_cases.json` + `test_vault_schemas.py` (rojos) → `VaultIcon` en `core/schemas.py`.
   2. `test_vault_service.py` → `vault_service.py`.
   3. `test_sync_push.py` (CouchDB real) → `sync_push.py`.
   4. `test_vaults_api.py` → (sin código de ruta) → re-export del OpenAPI de 0003 (`test_contract.py` verde).
3. **C · Cableado funcional del cliente.**
   1. `vaultRules.test.ts` (batería con `icon`) → `checkIcon`.
   2. `vaultStore.test.ts`, `merge.test.ts` → `vaultStore.ts`, `merge.ts`, `conflicts.ts`, `ConflictView.tsx`.
   3. `VaultForm.test.tsx` (persistir `icon`) y `VaultRail.test.tsx` (reflejo sin recargar) → cableado.
   4. `fields.ts`/`RejectionsPage.tsx` (mensaje `validation-error:icon`).
   5. `vaultIcon.integration.test.ts` (`test:sync`).
4. **D · Verificación de sistema.** `test:visual` completo (V-1…V-10, incl. V-7 con persistencia
   real), `workspace-perf.spec.ts` (RNF-001), capturas lado a lado con el mockup.
5. **E · Documentación** (§8) y notas de re-anclaje de cierre.

## 7. Seguimiento de complejidad / riesgos y decisiones para el GATE 2
| Decisión / riesgo | Justificación |
|---|---|
| **P-1 · Ícono y color en un solo string** (`icon = "{glifo}[:{color}]"`, gramática en `contracts/vault-icon.schema.json`) | RF-011 pide color de acento elegible y §3/§6 limitan el modelo a `Vault.icon` string nullable. Codificar ambos en el mismo campo cumple las dos cosas sin un campo nuevo; el servidor valida sólo la gramática (no el catálogo ni la paleta, coherente con spec §3); `initials:{color}` permite "iniciales con color elegido". **Alternativa:** campo `Vault.color` aparte (más limpio de leer, pero **reabre §6** "único cambio: `Vault.icon`" → requeriría enmendar la spec). **Recomendación:** aceptar el string compuesto. |
| **P-2 · Chip con fondo tintado y glifo `--text-primary`**, no el chip sólido con texto blanco del mockup | El chip del mockup (texto blanco sobre `#0891b2`, `#8b5cf6`, `#10b981`) da 3,68:1 con el cian y usa dos colores que **no están** en `tokens.css` (violeta, esmeralda). Con la paleta limitada a tokens (spec §6), texto blanco o del fondo sobre el color sólido falla 4,5:1 en el tema claro (3,2–4,1:1); el tinte del 18 % (= opacidad de `--accent-soft` en oscuro) con glifo `--text-primary` da ≥ 8,5:1 en los 5 colores y ambos temas, y el aro de 2 px conserva la identidad de color. `color-mix()` deriva de tokens (no es un valor nuevo); Chromium ≥ 111. **Alternativa:** añadir colores al `tokens.css` (reabre §6). |
| **P-3 · Fila seleccionada con texto `--text-primary`** (el mockup usa `--accent-hover`) | `--accent-hover` sobre `--accent-soft` da 4,37:1 en claro sobre `--bg-tertiary` (< 4,5:1); `accentContrast.test.ts` (U-2 de 0008) lo prohíbe y RF-007 no permite regresiones de accesibilidad. Se mantiene la barra izquierda de acento como indicador. |
| **P-4 · Alcance de la fidelidad** | Se comparan sólo los tres bloques de la spec (riel, barra lateral, editor). La cabecera global (marca, Bóvedas/Papelera, tema, cuenta) y la barra de sync de 0002/0005 se conservan (el mockup no las tiene: su tema flota arriba a la derecha); el Panel de Agente (ADR-011 descartado), el buscador, el "+" del riel, el Workspace de Desarrollo y la campana no se construyen. Los *drawers* de tablet/móvil de `1.1.4.2` quedan fuera (spec RF-005 sólo exige ≥ 1024 px); ≤ 800 px se mantiene el apilado de 0008, restilizado. |
| **P-5 · Marco de altura fija (`100dvh`) con scroll por columna** en todas las rutas privadas | Es el modelo del mockup (`body { height: 100vh; overflow: hidden }`) y de Obsidian, y resuelve de raíz RF-009 (el riel tiene su scroll sin `sticky + max-height`). Efecto colateral: en `/vaults`, `/vaults/trash`, etc. hace scroll `.app-main` en lugar de la ventana (visualmente igual). Se sustituyen explícitamente las aserciones de U-7 en `layoutCss.test.ts`. **Alternativa:** marco fijo sólo en `/vaults/:id` (`:has(.vault-workspace)`), con el riel sticky en las demás (dos modelos de scroll). |
| **P-6 · `icon` en la fusión de conflictos: choque → gana la ganadora** | `icon` es cosmético; mandar a resolución manual un choque de ícono obligaría a añadir un selector a `ConflictView` (más superficie) para un dato sin pérdida relevante. Un solo lado cambiado se fusiona como cualquier campo (sin pérdida). **Alternativa:** tratarlo como `name`/`description` (choque → manual). |
| **P-7 · Tema oscuro por defecto global** (no sólo en `/vaults*`) | RF-006a nombra `/vaults` y `/vaults/:id`. El defecto se aplica antes del primer pintado (script de `index.html`) para todas las rutas, login incluido: un defecto por ruta haría parpadear el tema al pasar de login a `/vaults` y duplicaría la lógica. La preferencia guardada se respeta siempre y el defecto no se escribe en `localStorage`. Archivos de 0002 (`theme/`, `index.html`) que no estaban en el `covers` borrador: se añaden. **Alternativa:** defecto oscuro sólo dentro de `AppLayout` (login seguiría en "sistema"). |
| **P-8 · RNF-001: umbral 150 ms en Chromium real** | La spec 0009 cita "RNF-001 original… p95 ≤ 150 ms", pero el RNF-001 de 0008 era **< 300 ms** (jsdom p95 62 ms; navegador 108–132 ms). Se mide el literal de 0009 (más estricto, 150 ms en navegador real, 30 muestras, §5.5) y se conserva el de 0008 (< 300 ms en jsdom). **Discrepancia visible para el GATE 2:** si Carlos prefiere el umbral original, basta cambiar la constante del test. |
| **P-9 · Dependencia de desarrollo `@playwright/test` 1.56.0** + `frontend/playwright.config.ts` + `frontend/e2e/` | Gate 4 exige capturas reales contra la referencia; en 0008 eran scripts en `/tmp` (no versionados, no repetibles por el verificador). Misma versión que la imagen del contenedor (navegadores incluidos, nada que descargar). **Alternativa:** scripts Python en `/tmp` como 0008 (sin dependencia, sin trazabilidad). |
| **P-10 · Tocar archivos de features cerradas** | `notes/**`, `editor/**` (0008, `strict`); `layout/**`, `theme/**`, `core/schemas.py`, `index.html` (0002); `vaults/**`, `vault_service.py`, `routers/vaults.py`, `test_vault*.py`, contrato 0003 (0003); `sync/**`, `sync_push.py`, `test_sync*.py`, `vault_rules_cases.json` (0005); READMEs (0007, `strict`). Ningún RF de esas specs cambia; nota de re-anclaje **al inicio** en 0008/0007 (si no, el gate da error por *drift strict*) y en todas al cierre (procedimiento de PLAN-0008 P-2). |
| **P-11 · Supuesto de AIRA a confirmar: set curado de `lucide-react` + color, sin subida de imagen** | La spec lo marca como interpretación de "elegir ícono" no confirmada explícitamente por Carlos. Este plan lo asume (24 glifos + 5 colores de token). **Si Carlos quería subir una imagen propia, el plan no sirve**: haría falta almacenamiento de archivos, validación y moderación (spec nueva). Confirmar en el GATE 2. |
| **P-12 · Chip circular (spec) vs. cuadrado redondeado (mockup)** | RF-001 dice "ícono circular"; el mockup usa 34 px con radio 10 px que se reduce al pasar el cursor. Se sigue la spec (círculo) con la transformación Discord a `--radius-md` en *hover*/activa, que recoge el gesto del mockup. |
| Riesgo · `diseño/` no versionado | Las medidas de referencia se congelan en §5.4; si el mockup cambia, se re-mide y se enmienda este plan. |
| Riesgo · capturas sensibles a fuentes | `Inter` no se carga por red en la app ni en el mockup (cae a `system-ui`); los criterios son geométricos y de color computado, no comparación píxel a píxel, así que la fuente no rompe los tests. |
| Configuración compartida sin `covers` | `package.json`, `package-lock.json`, `vite.config.ts`, `test-setup.ts`: precedente PLAN-0003 §14 / PLAN-0008 §7. |

## 8. Impacto en documentación (Art. 11)
> El mapa de la Constitución Art. 11 sigue con marcadores de la plantilla; el efectivo es el de
> `AGENTS.md` más los README por capa. `docs/API.md` no existe: el canon de la API son los
> `contracts/` por feature.

| Documento del mapa | Qué cambia | Acción |
|---|---|---|
| `0009-rediseno-visual-workspace/contracts/vault-icon.schema.json` | gramática de `Vault.icon` | creado en este plan |
| `0003-vault-crud/contracts/openapi.yaml` | `icon` en `VaultCreate`/`VaultUpdate`/`VaultOut`/`VaultListItem` | re-exportar |
| `backend/README.md` | §Bóvedas: campo `icon` (gramática, `null`, `PATCH` con `null` borra, sin catálogo en el servidor); §Sincronización: clave opcional `icon` en `vault:*` y motivo `validation-error:icon` | actualizar |
| `backend/app/core/README.md` | `VaultIcon` en `schemas.py` | actualizar |
| `backend/app/services/README.md` | `sync_push`: claves admitidas vs. obligatorias de bóveda | actualizar |
| `backend/tests/README.md` | casos `icon` en `vault_rules_cases.json` | actualizar |
| `frontend/README.md` | `npm run test:visual` y `test:perf` en navegador (contenedor Playwright, `@playwright/test`), dónde quedan las capturas | actualizar |
| `frontend/src/README.md` | `vaults/vaultIcon.ts`, `VaultChip`, `IconPicker`; riel con tooltip; marco de altura fija con scroll por columna; tema oscuro por defecto; `e2e/` | actualizar |
| `0008-vault-editor/diagrams/` | el flujo de nota no cambia de datos; la tarjeta "riel" no nombra el ícono → **sin cambio** (verificado: el diagrama es de datos, no de layout) | ninguna |
| `ARCHIFY.md` | sin diagrama nuevo (feature visual sin flujo de datos nuevo) | ninguna |
| `0002`, `0003`, `0005`, `0007`, `0008` `spec.md` | nota de re-anclaje (sin cambio de requisitos); 0007 y 0008 al inicio (P-10) | actualizar |
| `.harness/memory/state.md` | estado de 0009 | actualizar en el cierre |

## 9. Implementación por requisito

### Implementación de RF-001
Chip circular por bóveda: `vaults/vaultIcon.ts` (`parseIcon`, `ICON_SET`, `PALETTE`, `derivedColor`, `initials`), `vaults/VaultChip.tsx`, `notes/VaultRail.tsx`, `notes/notes.css`. Tests: `vaults/vaultIcon.test.ts`, `vaults/VaultChip.test.tsx`, `notes/VaultRail.test.tsx`; fidelidad V-1 (R-1…R-5).

### Implementación de RF-002
`RailTooltip` en `notes/VaultRail.tsx` (portal, `position: fixed`, hover y foco), estilos en `notes/notes.css`; se retira `title`. Tests: `notes/VaultRail.test.tsx` (hover/foco/salida); fidelidad V-2.

### Implementación de RF-003
`notes/NoteSidebar.tsx` (bloque `.note-sidebar-new`, envoltorio `.note-tree-panel`, pie de papelera), `notes/VaultWorkspacePage.tsx` (cabecera de la barra), `notes/notes.css`. Tests: `notes/NoteSidebar.test.tsx` (estructura), `notes/layoutCss.test.ts` (fondos de tokens distintos); fidelidad V-3 (R-6, R-7, R-10).

### Implementación de RF-004
`notes/NoteSidebar.tsx` (`Folder`/`FolderOpen`/`FileText` de `lucide-react` con `data-icon`), `notes/notes.css` (sangría, alto de fila). Tests: `notes/NoteSidebar.test.tsx`; fidelidad V-3 (R-8, R-9).

### Implementación de RF-005
`editor/NoteEditor.tsx` (barra superior), `editor/editor.css` (columna de 780 px centrada, sin tarjeta), `editor/MilkdownView.tsx`/`editor/CodeView.tsx` (clases de columna si hace falta), `notes/notes.css` (panel del editor a alto completo). Tests: `notes/layoutCss.test.ts` (`max-width: 780px`, `margin-inline: auto`), `editor/NoteEditor.test.tsx` (roles y nombres intactos); fidelidad V-4 (R-12…R-15) a 1440 y 1024.

### Implementación de RF-006
Sólo tokens: aserción estática en `notes/layoutCss.test.ts` (sin literales de color en `notes.css`, `editor.css` y `vaults/VaultChip.css`) y contraste en `vaults/vaultIcon.test.ts`; fidelidad V-9 (colores computados ∈ tema activo de `tokens.css`) en oscuro y claro.

### Implementación de RF-006a
`theme/useTheme.ts` (`DEFAULT_THEME_MODE = "dark"`, sin escribir `localStorage`), `frontend/index.html` (mismo defecto en el script previo al pintado). Tests: `theme/useTheme.test.tsx` (sin preferencia → oscuro; con preferencia → se respeta; `index.html` coherente); fidelidad V-8.

### Implementación de RF-007
Sin cambios de `role`/`aria-*`/nombres accesibles existentes salvo los dos explícitos de este plan: (1) nombre accesible del chip **con ícono** = nombre de la bóveda (con iniciales no cambia), en `notes/VaultRail.test.tsx`; (2) aserciones de U-7 sustituidas por las del marco de altura fija en `notes/layoutCss.test.ts`. La suite de 0008 (`notes/*.test.tsx`, `editor/*.test.tsx`, `App.test.tsx`, `layout/AppLayout.test.tsx`) debe pasar sin otros cambios; la tarea de verificación lo comprueba con `git diff --stat` sobre los tests.

### Implementación de RF-008
`notes/VaultWorkspacePage.tsx` (`.vault-workspace-empty` con ícono), `notes/notes.css`. Tests: `notes/VaultWorkspacePage.test.tsx` (texto y estructura); fidelidad V-5.

### Implementación de RF-009
Marco de altura fija y scroll propio del riel: `layout/AppLayout.css`, `notes/notes.css`. Tests: `notes/layoutCss.test.ts`; fidelidad V-6 (40 bóvedas).

### Implementación de RF-010
`.note-tree-name` con elipsis (existente) dentro de filas a ancho del panel (`min-width: 0`), `notes/notes.css`. Tests: `notes/NoteSidebar.test.tsx` (nombre completo en `title` de la fila); fidelidad V-3 (fila de 120 caracteres, `scrollWidth = clientWidth`).

### Implementación de RF-011
`vaults/IconPicker.tsx` (dos `radiogroup`: ícono con "Iniciales" + 24 glifos; color con "Automático" + 5 claves), `vaults/VaultForm.tsx`, `vaults/VaultListPage.tsx` (chip), `vaults/vaultIcon.ts` (`formatIcon`). Tests: `vaults/IconPicker.test.tsx`, `vaults/VaultForm.test.tsx`, `vaults/VaultListPage.test.tsx`; fidelidad V-7.

### Implementación de RF-012
Persistencia: `backend/app/core/schemas.py` (`VaultIcon`), `backend/app/services/vault_service.py`, `backend/app/services/sync_push.py`, `backend/app/routers/vaults.py` (modelos), `frontend/src/sync/vaultRules.ts`, `frontend/src/sync/vaultStore.ts`, `frontend/src/sync/merge.ts`, `frontend/src/sync/conflicts.ts`, `frontend/src/sync/ConflictView.tsx`, `frontend/src/vaults/fields.ts`, `frontend/src/sync/RejectionsPage.tsx`; reflejo sin recargar por `dataVersion` (existente) en `notes/VaultRail.tsx`. Tests: `backend/tests/test_vault_schemas.py`, `test_vault_service.py`, `test_vaults_api.py`, `test_sync_push.py`, `test_sync_rules_mirror.py` + `fixtures/vault_rules_cases.json`, `test_contract.py`; `frontend/src/sync/vaultRules.test.ts`, `vaultStore.test.ts`, `merge.test.ts`, `sync/vaultIcon.integration.test.ts`, `notes/VaultRail.test.tsx`; fidelidad V-7. Contratos: `contracts/vault-icon.schema.json`, `0003-vault-crud/contracts/openapi.yaml`.

### Implementación de RNF-001
`frontend/e2e/workspace-perf.spec.ts` (Chromium real, 1 000 notas, 30 medidas, p95 ≤ 150 ms) + `notes/tree.perf.test.tsx` (jsdom, < 300 ms, sin cambios). Los íconos por fila no aumentan el DOM inicial (carpetas plegadas, 0008).

`covers` de `spec.md` (fijado en este plan): código, tests, contratos y docs de las listas de
arriba; ver el front-matter de `spec.md`. Archivos compartidos con dueño anterior: P-10.
