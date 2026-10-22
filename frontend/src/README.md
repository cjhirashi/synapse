# frontend/src/

Código fuente React.

```
src/
├── api/        # cliente HTTP de la sesión (auth.ts) y errores de la API (problems.ts)
├── auth/       # login y guardia de rutas
├── notes/      # notas sobre la réplica local: bóveda abierta, árbol, papelera, conflictos (SPEC-0008)
├── editor/     # editor de una nota: vistas Visual (Milkdown) y Código (CodeMirror) (SPEC-0008)
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

## Notas y editor (SPEC-0008)

**Ruta y marco.** `main.tsx` usa `createBrowserRouter` (una ruta comodín que monta `App`,
cuyas `<Routes>` no cambian) porque `useBlocker` sólo existe en data routers. `/vaults/:id`
(`notes/VaultWorkspacePage.tsx`) muestra a la izquierda el árbol de la bóveda y a la derecha el
editor; la nota abierta vive sólo en el estado de la página (ni URL ni almacenamiento: al
entrar el editor está vacío). `new` y `trash` ganan a `:id` por ser rutas estáticas. El
**riel** (`notes/VaultRail.tsx`, montado por `layout/AppLayout.tsx` a la izquierda de toda
pantalla privada) lista las bóvedas activas con sus iniciales y se relee con `dataVersion`.

Módulos de `notes/`:

| Módulo | Qué hace |
|---|---|
| `noteStore.ts` | operaciones sobre la réplica: crear (id `note:{vault}:{uuid v4}`, `Sin título.md` si no hay título), leer, guardar, renombrar/mover (mismo `_id`), borrar a la papelera (`deleted_at`, nunca lápida) y restaurar |
| `noteRules.ts` | espejo de `core/note_rules.py` (ruta, 2 MiB, frontmatter, `pathKey`) sobre la batería compartida `note_rules_cases.json` |
| `noteTree.ts`, `untitled.ts` | árbol a partir de las rutas (carpetas derivadas, sin carpetas vacías) y siguiente nombre libre por `pathKey` |
| `NoteSidebar.tsx`, `NoteTrash.tsx` | árbol accesible (`role="tree"`, teclado WAI-ARIA), «Nueva nota», renombrar, borrar; papelera **de la bóveda** con «Restaurar» (la ruta ocupada se avisa) |
| `mergeNote.ts`, `NoteConflictCard.tsx` | conflictos de nota: nunca se elige por fecha; sólo se cierra solo lo que difiere en `updated_at` y lo demás lo decide el usuario en `sync/ConflictView.tsx` |
| `repush.ts` | reintento dirigido de las notas rechazadas con `vault-not-found`: al quedar la bóveda activa (`sync/vaultActive.ts`: cuenta la ganadora o una perdedora activa), al abrir la app con rechazos persistidos y al reconectar tras un fallo de red; no escribe revisiones nuevas |
| `errors.ts`, `messages.ts` | errores de las operaciones y sus textos en español |

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

**Reparto de `_bulk_docs`:** una nota de 2 MiB hace que un lote de 50 supere cualquier tope.
`sync/remote.ts` parte un `POST _bulk_docs` de más de 8 MiB (`BULK_CHUNK_BYTES`) en
sub-peticiones secuenciales; el servidor admite hasta 16 MiB por petición.

**Pruebas:** `*.test.ts(x)` junto a cada módulo; integración con backend real en
`notes/notes.integration.test.ts` (`npm run test:sync`) y rendimiento de RNF-001 en
`notes/tree.perf.test.tsx` (`npm run test:perf`).

