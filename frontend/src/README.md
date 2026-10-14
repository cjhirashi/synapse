# frontend/src/

Código fuente React.

```
src/
├── api/        # cliente HTTP de la sesión (auth.ts) y errores de la API (problems.ts)
├── auth/       # login y guardia de rutas
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
| `/vaults/trash` | `vaults/TrashPage.tsx` — borradas, con fecha de borrado, y restaurar |
| `/rejections` | `sync/RejectionsPage.tsx` — cambios que el servidor rechazó, con el motivo y «Corregir» |
| `/conflicts` | `sync/ConflictView.tsx` — conflictos que el usuario elige o combina |

**Sincronización (SPEC-0005):** `App.tsx` monta `sync/SyncProvider.tsx` con el usuario de
`useMe()` (una instancia por usuario; no replica mientras deba cambiar la contraseña). El
proveedor abre la réplica local (`sync/localDb.ts`, que la borra si era de otro usuario), el
replicador continuo con `/sync` y los almacenes de estado, rechazos y conflictos, y los
publica por `useSync()`. `layout/AppLayout.tsx` muestra `SyncStatusBar` y su «Cerrar
sesión» llama a `requestLogout()` (asíncrona), que decide con `hasUnconfirmed()` de
`sync/resources.ts`: espera las escrituras de rechazos en curso (`rejections.settled()`),
relee la secuencia local (`status.refresh()`) y, con cambios sin confirmar o rechazados
—o si la réplica no puede leerse—, abre `LogoutDialog`; al salir,
`logout()` y, si el servidor cerró la sesión, se borra la réplica. `test-utils/sync.tsx`
da réplicas en memoria, un replicador falso y un contexto mínimo (`syncValue`, `WithSync`).
`sync/resources.ts` abre réplica, remota y replicador (lo comparten el proveedor y las
pruebas de integración). Éstas (`sync/*.integration.test.ts`, `npm run test:sync`) usan
`test-utils/device.ts`: cada `Device` es un navegador con sus cookies, su red simulable
(sin red, backend caído) y su réplica, contra el backend real.

Módulos de `sync/`:

| Módulo | Qué hace |
|---|---|
| `localDb.ts` | réplica local PouchDB (IndexedDB); se borra si era de otro usuario |
| `remote.ts` | base remota `origin + "/sync/db"` con cookies; ante un 401 renueva la sesión una vez y, si sigue, avisa «sesión caducada». Contiene un defecto de PouchDB 9: las promesas derivadas de `info()` que nadie espera no acaban como rechazos sin manejar (`observeInfo`) |
| `replicator.ts` | replicación continua en ambos sentidos, lotes de 50, espera de 1 s doblando hasta 60 s; una sola pestaña replica (Web Lock `synapse-sync`) y difunde los eventos por `BroadcastChannel` |
| `status.ts` | estado (`online`, `offline`, `syncing`, `pending`, `session-expired`), «pendientes» (la secuencia local frente a la última que confirmó el servidor) y hora de la última sincronización, en `_local/synapse-sync-state`; `refresh()` relee la secuencia local |
| `rejections.ts` | cambios que el servidor rechazó (uno por documento, con su `reason`); se quitan cuando una revisión de ese documento se sube bien; `settled()` espera las escrituras en cola |
| `merge.ts`, `conflicts.ts` | conflictos: combinación automática por campos (ADR-003) o lista manual con las dos versiones; `resolve()` aplica la elección. Las revisiones que escribe son deterministas (SHA-256 del JSON canónico —`canonical()`, claves ordenadas— de la revisión madre y el contenido): dos réplicas que resuelven igual escriben las mismas |
| `vaultRules.ts` | réplica de las reglas del servidor (normalización y validación), para no escribir lo que el push rechazaría |
| `vaultStore.ts` | CRUD de bóvedas sobre la réplica (con `rev`) |
| `resources.ts` | abre réplica, remota y replicador; push único de «Sincronizar y salir» (`pushOnce`: confirma sólo sin fallos, sin rechazos y con la secuencia local recorrida) |
| `SyncProvider.tsx`, `useSync.ts` | ciclo de vida por usuario y contexto para la UI |
| `SyncStatusBar.tsx`, `RejectionsPage.tsx`, `ConflictView.tsx`, `LogoutDialog.tsx` | barra de estado, rechazos, conflictos y aviso al salir con cambios sin confirmar |

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

El resto de la estructura (editor) se define en su propia spec.
