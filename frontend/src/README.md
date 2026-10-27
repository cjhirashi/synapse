# frontend/src/

Código fuente React.

```
src/
├── api/        # cliente HTTP de la sesión (auth.ts) y errores de la API (problems.ts)
├── auth/       # login y guardia de rutas
├── notes/      # notas sobre la réplica local: bóveda abierta, árbol, papelera, conflictos (SPEC-0008)
├── editor/     # editor de una nota: vistas Visual (Milkdown) y Código (CodeMirror) (SPEC-0008)
├── brand/      # logo oficial (BrandLogo + brand.css) y sus pruebas de assets (SPEC-0011)
├── layout/     # marco de las rutas privadas (navegación, cuenta, barra de sincronización, cerrar sesión)
├── settings/   # ajustes de cuenta (cambiar contraseña)
├── sync/       # réplica local PouchDB, replicación con el servidor y su UI (SPEC-0005)
├── vaults/     # bóvedas sobre la réplica local: lista, formulario crear/editar, papelera (SPEC-0003)
├── test-utils/ # utilidades de prueba (réplica en memoria, contexto de sync, dispositivos simulados)
├── App.tsx     # rutas
└── main.tsx
```

`api/auth.ts` renueva la sesión sola: ante un 401 llama una vez a `/auth/refresh`
(serializado entre pestañas con Web Locks) y repite la petición; si falla, la sesión se da
por cerrada (`RequireAuth` y las páginas que reciben ese 401 llevan a `/login`).

Los errores de la API llegan como Problem Details (SPEC-0004): `api/problems.ts` define
`ApiError` (`status`, `type`, `title`, `detail`, `errors`) y `parseProblem`, que tolera
cuerpos no JSON. La UI decide por `type` —con las constantes `PROBLEM.*`— o por `status`
cuando basta (401), y muestra sus propios textos en español; `title`/`detail` vienen en inglés.

**Rutas privadas** (dentro de `RequireAuth`, `SyncProvider` y `AppLayout`):

| Ruta | Pantalla |
|---|---|
| `/` | redirige a `/vaults` |
| `/vaults` | `vaults/VaultListPage.tsx` — bóvedas activas, «Cargar más», borrar con confirmación |
| `/vaults/new` | `vaults/VaultForm.tsx` — crear |
| `/vaults/:id/edit` | `vaults/VaultForm.tsx` — editar (guarda sólo los campos cambiados) |
| `/vaults/:id` | `notes/VaultWorkspacePage.tsx` — la bóveda abierta: árbol de notas + editor; id inexistente, no canónico o borrado → 404 |
| `/vaults/trash` | `vaults/TrashPage.tsx` — borradas, con fecha de borrado, y restaurar |
| `/rejections` | `sync/RejectionsPage.tsx` — cambios que el servidor rechazó, con el motivo y «Corregir» |
| `/conflicts` | `sync/ConflictView.tsx` — conflictos que el usuario elige o combina |

**Sincronización (SPEC-0005):** `App.tsx` monta `sync/SyncProvider.tsx` con el usuario de
`useMe()` (una instancia por usuario; no replica mientras deba cambiar la contraseña). El
proveedor abre la réplica local (`sync/localDb.ts`, que la borra si era de otro usuario), el
replicador continuo con `/sync` y los almacenes de estado, rechazos y conflictos, y los
publica por `useSync()`. `layout/AppLayout.tsx` muestra `SyncStatusBar` y su «Cerrar
sesión» llama a `requestLogout()` (asíncrona), que decide con `unconfirmedState()` de
`sync/resources.ts`: espera las escrituras de rechazos en curso (`rejections.settled()`),
relee la secuencia local (`status.refresh()`) y, con cambios sin confirmar o rechazados
—o si la réplica no puede leerse, con un texto propio y sin «Sincronizar y salir»—, abre
`LogoutDialog`; al salir, `logout()` y, si el servidor cerró la sesión, se marca la réplica
como descartada (`markDiscarded`, en `localStorage`) y se borra. Si ese borrado falla, va
igualmente a `/login` y `sync/LocalCopyNotice.tsx` (montado por `App.tsx` junto a
`LoginPage`) avisa de que la copia sigue en el dispositivo; por la marca, el próximo inicio
de sesión la borra antes de abrirla, también si es el mismo usuario. `test-utils/sync.tsx`
da réplicas en memoria, un replicador falso y un contexto mínimo (`syncValue`, `WithSync`).
`sync/resources.ts` abre réplica, remota y replicador (lo comparten el proveedor y las
pruebas de integración). Éstas (`sync/*.integration.test.ts`, `npm run test:sync`) usan
`test-utils/device.ts`: cada `Device` es un navegador con sus cookies, su red simulable
(sin red, backend caído) y su réplica, contra el backend real.

Módulos de `sync/`:

| Módulo | Qué hace |
|---|---|
| `localDb.ts` | réplica local PouchDB (IndexedDB); se borra si era de otro usuario o si quedó marcada como descartada (`markDiscarded`) |
| `remote.ts` | base remota `origin + "/sync/db"` con cookies; ante un 401 renueva la sesión una vez y, si sigue, avisa «sesión caducada». Contiene un defecto de PouchDB 9: las promesas derivadas de `info()` que nadie espera no acaban como rechazos sin manejar (`observeInfo`) |
| `replicator.ts` | replicación continua en ambos sentidos, lotes de 50, espera de 1 s doblando hasta 60 s; una sola pestaña replica (Web Lock `synapse-sync`) y difunde los eventos por `BroadcastChannel` |
| `status.ts` | estado (`online`, `offline`, `syncing`, `pending`, `session-expired`), «pendientes» (la secuencia local frente a la última que confirmó el servidor) y hora de la última sincronización, en `_local/synapse-sync-state`; `refresh()` relee la secuencia local |
| `rejections.ts` | cambios que el servidor rechazó (uno por documento, con su `reason`); se quitan cuando una revisión de ese documento se sube bien; `settled()` espera las escrituras en cola |
| `merge.ts`, `conflicts.ts` | conflictos: combinación automática por campos (ADR-003) o lista manual con las dos versiones; `resolve()` aplica la elección. Las revisiones que escribe son deterministas (SHA-256 del JSON canónico —`canonical()`, claves ordenadas— de la revisión madre y el contenido): dos réplicas que resuelven igual escriben las mismas |
| `vaultRules.ts` | réplica de las reglas del servidor (normalización y validación), para no escribir lo que el push rechazaría |
| `vaultStore.ts` | CRUD de bóvedas sobre la réplica (con `rev`) |
| `resources.ts` | abre réplica, remota y replicador; qué queda sin confirmar al pedir la salida (`unconfirmedState`: `none` / `pending` / `unreadable`); push único de «Sincronizar y salir» (`pushOnce`: confirma sólo sin fallos, sin rechazos y con la secuencia local recorrida) |
| `SyncProvider.tsx`, `useSync.ts` | ciclo de vida por usuario y contexto para la UI |
| `SyncStatusBar.tsx`, `RejectionsPage.tsx`, `ConflictView.tsx`, `LogoutDialog.tsx` | barra de estado, rechazos, conflictos y aviso al salir con cambios sin confirmar (o con la réplica ilegible) |
| `LocalCopyNotice.tsx` | aviso en el login si al salir la réplica no se pudo borrar (estado de navegación `LocalCopyState`, que quita de la entrada del historial al montarse) |

**Bóvedas (SPEC-0003 sobre la réplica, P-1):** las páginas leen y escriben
`useSync().vaults` (`sync/vaultStore.ts`) en lugar de la API REST, que sigue igual para los
agentes. Cada bóveda lleva su `rev`, que las escrituras mandan para no pisar un cambio
ajeno. `vaults/useVaultPages.ts` lee la lista o la papelera entera (ya ordenada), muestra
páginas de 50 en memoria y la vuelve a leer en silencio con cada `dataVersion` (cualquier
escritura en la réplica); una lectura de antes de la última se descarta. `vaults/errors.ts`
decide si un error es vista desfasada (otra revisión, o ya no está en esa lista), en cuyo
caso la pantalla avisa y recarga —el formulario descarta lo escrito y carga la versión
vigente—, o cuota agotada (R-11). `vaults/fields.ts` reúne los textos de las reglas de cada
campo y la lectura de etiquetas y descripción, compartidos con la vista de conflictos.

En desarrollo, `vite.config.ts` reenvía `/vaults` al backend salvo las navegaciones del
navegador (`Accept: text/html`), que reciben `index.html` para que React Router pinte la ruta,
y `/sync` siempre (no es ruta de la SPA). En producción ese papel es del Caddy externo, en el
mismo origen que la SPA y sin búfer ni tiempos límite menores de 90 s en `/sync`
(`backend/README.md`, «Despliegue»).

## Identidad de marca (SPEC-0011)

`brand/BrandLogo.tsx` es un `<span aria-hidden>` sin props con el logo como imagen de fondo
(`brand.css`): `logo-synapse-dark.svg` por defecto y `logo-synapse-light.svg` bajo
`:root[data-theme="light"]`, así que sigue al tema sin estado de React; el tamaño lo pone el contexto con
`--brand-logo-size` (cabecera 28 px, login 32 px). Con `forced-colors: active` pasa a una silueta
monocroma (`CanvasText` + máscara). Si el asset no carga no se pinta nada (sin icono roto, a diferencia
de un `<img>`). El nombre accesible del bloque de marca es el texto «Synapse», no el logo.

`theme/useTheme.ts` exporta `THEME_COLOR` (el `--bg-secondary` de cada tema) y `applyResolvedTheme`, el
único punto que escribe `data-theme` y el `<meta name="theme-color">`; `index.html` repite la tabla en
su script previo al pintado y `useTheme.test.tsx` vigila que coincidan con `tokens.css`.
Los assets de `public/` los genera `scripts/brand/build.sh` (ver `frontend/README.md`).

## Rediseño visual del workspace (SPEC-0009)

Vestido nuevo (riel, barra lateral, editor) sobre la misma lógica; las medidas salen del mockup 1.1.4.4
(PLAN-0009 §5.4) y todo color, radio, sombra y espaciado, de `styles/tokens.css`.

- **Marco de altura fija** (`layout/AppLayout.css`): `.app-shell` mide `100dvh` y no hace scroll;
  cabecera y barra de sincronización ocupan lo suyo y cada columna tiene el suyo (el riel, sin
  barra visible; `.app-main` con el contenido centrado a 880 px; el workspace de una bóveda no
  tiene padding ni scroll de página y sus columnas hacen el suyo). Por debajo de 800 px el
  workspace se apila y vuelve a hacer scroll como página. Sustituye al riel `sticky` de U-7.
- **Tema oscuro por defecto** (`theme/useTheme.ts` y el script de `index.html`): sin preferencia
  guardada se usa el tema oscuro (`DEFAULT_THEME_MODE`); el defecto no se escribe en `localStorage`.
  Una preferencia guardada (claro/sistema/oscuro) se respeta. Los estilos base de `button` de
  `global.css` están en `:where()` (especificidad 0) para que los de componente ganen.
- **Íconos de bóveda** (`vaults/`): `vaultIcon.ts` (puro) es dueño de la gramática `glifo[:color]`
  (`parseIcon`/`formatIcon`), del set curado de 24 glifos de `lucide-react` (`ICON_SET`), de la
  paleta de 5 claves de tokens (`PALETTE`) y del color derivado del id (`derivedColor`, nunca
  `danger`). `VaultChip.tsx` dibuja el chip de 34 px (círculo; `--radius-md` al pasar el cursor,
  enfocar o estar activo) con el ícono o las iniciales; sólo pinta lo que sale de esas listas
  cerradas (un glifo o color desconocido cae a iniciales/color derivado), nunca `icon` como
  URL, marcado o estilo (`iconSafety.test.ts`). `IconPicker.tsx` (dos `radiogroup`, «Ícono» y
  «Color») está en `VaultForm`, que guarda `icon` sólo si cambió; `VaultListPage` muestra el chip.
  La regla de `icon` vive una vez en TS (`sync/vaultRules.ts`, `checkIcon`) y una en Python.
- **Riel con tooltip** (`notes/VaultRail.tsx`): `RailTooltip` se monta en `document.body` (el riel
  hace scroll y recortaría) al pasar el cursor o enfocar con el teclado; sin `title` nativo. El
  nombre accesible es el nombre con ícono y «iniciales nombre» con iniciales.
- **Barra lateral de 240 px** (`notes/notes.css`, `NoteSidebar.tsx`): cabecera con la carpeta abierta y
  el nombre, formulario «Nueva nota» como bloque propio, panel del árbol con scroll propio (filas de
  27/25 px, íconos de carpeta/nota, sangría de 24 px), barra de acciones de la nota **bajo** el
  árbol (si fuera sobre él, al enfocar una fila se desplazaría y el clic no la abriría) y pie con la
  papelera de la bóveda.
- **Editor** (`editor/editor.css`): barra superior fija de 43 px y cuerpo sin tarjeta con una
  columna centrada de 780 px (`.note-editor-column`; avisos y confirmaciones dentro). El estado
  vacío (`.vault-workspace-empty`) va centrado en el panel.
- **Verificación visual:** `e2e/` (Playwright 1.56.0; ver `frontend/README.md`, `npm run test:visual`).

## Contenido markdown completo (SPEC-0010)

Módulos nuevos (el detalle de requisitos está en `.harness/specs/0010-contenido-markdown-completo/`):

| Módulo | Qué hace |
|---|---|
| `notes/folders.ts`, `notes/untitled.ts` | carpetas (validación, duplicados NFKC+casefold, `joinPath`, `parentFolder`) y nombre libre por carpeta; «Crear en» la carpeta activa |
| `notes/noteHistory.ts` | historial de notas abiertas por bóveda y pestaña (ids, tope 50, `sessionStorage` `synapse:note-history:{vault}`); `Workspace` lo mueve sólo cuando el editor **abrió** la nota (`onOpened`); Alt+←/→ fuera de los editores |
| `editor/frontmatter.ts` (chunk diferido, única importación de `yaml`), `editor/properties.ts`, `PropertiesPanel/Form.tsx` | frontmatter editable: sesión de edición `{props, body}` (Visual) o texto compuesto (Código); YAML 1.2 core validado con línea; YAML heredado (migrar / protegido) |
| `editor/NoteBreadcrumb.tsx`, `breadcrumb.ts`, `NoteMenu.tsx`, `Notice.tsx` | encabezado de 43 px: Atrás/Adelante, migas truncadas por segmento, lápiz Editar/Leer y menú ⋮ (renombrar, borrar, copiar ruta, ver en Código) con los flujos del árbol |
| `editor/codeBlockView.ts`, `taskItemView.ts`, `tableView.ts` | *node views*: bloque con cabecera (etiqueta + Copiar) y rama Mermaid, casillas alternables, tabla con scroll |
| `editor/highlight/` | `languages.ts` (registro único de 11 lenguajes con alias), `highlighter.ts` (clases `sx-*` con tokens), `proseHighlight.ts` + `highlightScheduler.ts` (decoraciones por tandas en idle, cercanos al viewport primero), usados también por `CodeView` |
| `editor/mermaid/` | `renderMermaid.ts` (strict, `htmlLabels:false`, `secure` ampliado, fuente saneada, SVG verificado como DOM antes de insertarlo, dibujos en serie), `themeVariables.ts` (colores de los tokens), `panZoom.ts` (svg-pan-zoom diferido: botones, teclado, rueda con Ctrl/⌘) |
| `editor/deferred/idle.ts` | `whenIdle` y `observeVisibility`: lo decorativo (resaltado, diagramas) no compite con «clic → legible» |
| `editor/markdown/` | caché de parseo por `(id, rev)` en memoria, Worker de parseo, programador de precálculo y `cachedParser` (RNF-001). Si algún día hay CSP, el Worker necesita `worker-src 'self'` |

Reglas: sin `innerHTML` y similares (guarda `editor/securityGuard.test.ts`); el único marcado externo es el SVG de Mermaid, ya verificado;
color de texto sólo con `--*-text`/`--text-*` (ADR-006), nunca `--accent`/`--text-muted`.

## Notas y editor (SPEC-0008)

**Ruta y marco.** `main.tsx` usa `createBrowserRouter` (una ruta comodín que monta `App`,
cuyas `<Routes>` no cambian) porque `useBlocker` sólo existe en data routers. `/vaults/:id`
(`notes/VaultWorkspacePage.tsx`) muestra a la izquierda el árbol de la bóveda y a la derecha el
editor; la nota abierta vive sólo en el estado de la página (ni URL ni almacenamiento: al
entrar el editor está vacío). `new` y `trash` ganan a `:id` por ser rutas estáticas. El
**riel** (`notes/VaultRail.tsx`, montado por `layout/AppLayout.tsx` a la izquierda de toda
pantalla privada) lista las bóvedas activas con su ícono (o sus iniciales) y se relee con `dataVersion`.

Módulos de `notes/`:

| Módulo | Qué hace |
|---|---|
| `noteStore.ts` | operaciones sobre la réplica: crear (id `note:{vault}:{uuid v4}`, `Sin título.md` si no hay título), leer, guardar, renombrar/mover (mismo `_id`), borrar a la papelera (`deleted_at`, nunca lápida) y restaurar. **`titleToPath`** es la única regla título→ruta (añade `.md` si falta) y la usan `create` y `rename`. Un **índice de resumen** en memoria (`{id, path, rev, deleted_at, updated_at}`, sin `content`) se construye una vez y se actualiza con `changes` desde la última secuencia: `list`, la unicidad de rutas y «Sin título n» no releen el cuerpo de las notas (S-1) |
| `noteRules.ts` | espejo de `core/note_rules.py` (ruta, 2 MiB, frontmatter, `pathKey`) sobre la batería compartida `note_rules_cases.json` |
| `noteTree.ts`, `untitled.ts` | árbol a partir de las rutas (carpetas derivadas, sin carpetas vacías) y siguiente nombre libre por `pathKey` |
| `NoteSidebar.tsx`, `NoteTrash.tsx` | árbol accesible (`role="tree"` que sólo contiene `treeitem`s: una parada de Tab, teclado WAI-ARIA) y «Nueva nota». **«Renombrar»/«Borrar»** viven en la barra «Acciones de la nota» (`role="toolbar"`, siempre visible, fuera del árbol y bajo él) para la nota seleccionada; **F2** y **Supr** las atajan desde el `treeitem` enfocado (Supr respeta la confirmación de borrador sucio; ambas comparten la guarda de operación en curso). **Foco:** tras borrar va a la fila vecina que sobrevive en el árbol resultante (o a «Nueva nota»); tras guardar o cancelar (también con Escape) el renombrado vuelve al `treeitem`. Papelera **de la bóveda** con «Restaurar» (la ruta ocupada se avisa) |
| `mergeNote.ts`, `NoteConflictCard.tsx` | conflictos de nota: nunca se elige por fecha; sólo se cierra solo lo que difiere en `updated_at` y lo demás lo decide el usuario en `sync/ConflictView.tsx` |
| `repush.ts` | reintento dirigido de las notas rechazadas con `vault-not-found`: al quedar la bóveda activa (`sync/vaultActive.ts`: cuenta la ganadora o una perdedora activa), al abrir la app con rechazos persistidos y al reconectar tras un fallo de red; no escribe revisiones nuevas |
| `errors.ts`, `messages.ts` | errores de las operaciones y sus textos en español |

**Estilos de lista:** `styles/global.css` no estiliza `ul`/`li` sueltos; la tarjeta de la lista de
bóvedas, de la papelera, de los rechazos y de la papelera de notas es **`.card-list`** y las
etiquetas son **`.chip-list`**. El árbol (`notes.css`) y el markdown renderizado (`editor.css`)
tienen sus propios estilos; el texto de acento no se usa sobre `--accent-soft` (3,15:1): la fila
seleccionada y la vista activa usan `--text-primary` más un indicador de acento. El nombre
accesible de cada icono del riel empieza por sus iniciales visibles.

**Editor** (`editor/`, cargado con `React.lazy`): `NoteEditor.tsx` es dueño del `draft`
(markdown) y del modo; abre en **lectura** y «Editar»/«Leer» alterna. `MilkdownView.tsx`
(Visual) y `CodeView.tsx` (Código) comparten el contrato `{value, onChange}` y el mismo
`draft`: alternar de vista no escribe ni relee, y sólo una edición real reserializa el
markdown. `safeUrl.ts` deja pasar enlaces `http`, `https`, `mailto` y relativos (imágenes sólo
`http(s)`) y el HTML crudo se pinta como texto.

**Guardado explícito:** «Guardar» y Ctrl/Cmd+S escriben una revisión; «Leer» con cambios guarda
antes. Con un borrador sucio hay aviso al cerrar la pestaña (`beforeunload`), al abrir otra
nota, al borrar la abierta y al navegar dentro de la app (riel, «Bóvedas»…, por `useBlocker`).
El **cierre de sesión** también avisa: el editor se registra en `useSync().unsavedDrafts`
mientras está sucio y `requestLogout()` lo consulta antes de cerrar nada (`LogoutDialog`,
razón `draft`). La navegación a `/login` no se bloquea.

**Estado «sucio» síncrono y lector único (E-6, E-7):** el listener de Milkdown emite el markdown con un
debounce de 200 ms y su `destroy` descarta lo pendiente, así que `draft` va con retraso respecto de lo
que el usuario ve. `MilkdownView` informa «sucio» (`onDirty`) en la misma transacción que cambia el
documento y expone un vaciado síncrono que serializa y emite YA, sólo si el documento cambió respecto
del último emitido (abrir sin editar nunca reserializa). `NoteEditor` lo usa a través de un único
lector, `readDraft()` (vacía y devuelve el markdown vigente): guardar, alternar vista, los diálogos,
`confirmDiscard`, el cambio de nota, la revisión nueva, el cierre de sesión, `beforeunload` y el
bloqueo de navegación deciden con él y con `hasUnsaved()`, nunca leyendo `draft` directamente.

Los guardados se **serializan** (E-1): un guardado en vuelo absorbe un doble Ctrl+S o el
auto-repeat y, si el borrador cambió mientras tanto, se guarda después sobre la revisión nueva
(nunca dos veces con la misma, que crearía una rama de conflicto idéntica). Los tres diálogos de
confirmación del editor (`ConfirmDialog`) atrapan el foco, cierran con Escape como «Seguir
editando» y lo devuelven al disparador. El foco inicial es configurable con `data-autofocus`
(por omisión, el primer botón): el diálogo de descarte («Borrar y descartar cambios») enfoca
«Seguir editando». Si la bóveda pasa a la papelera por sync con un borrador sucio, el 404 lo
muestra en sólo lectura con «Copiar texto» (E-2; RF-014: no se edita ni se guarda); ese
borrador se suelta si la nota se cerró a propósito (p. ej. «Borrar y descartar cambios», E-3), y
sin API de portapapeles se avisa «No se pudo copiar; selecciona el texto.» y el textarea queda
seleccionado (E-4).

**Reparto de `_bulk_docs`:** una nota de 2 MiB hace que un lote de 50 supere cualquier tope.
`sync/remote.ts` parte un `POST _bulk_docs` de más de 8 MiB (`BULK_CHUNK_BYTES`) en
sub-peticiones secuenciales; el servidor admite hasta 16 MiB por petición.

**Pruebas:** `*.test.ts(x)` junto a cada módulo; integración con backend real en
`notes/notes.integration.test.ts` (`npm run test:sync`) y rendimiento de RNF-001 en
`notes/tree.perf.test.tsx` (`npm run test:perf`).

