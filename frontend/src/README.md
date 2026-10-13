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
sesión» llama a `requestLogout()`: con cambios sin confirmar abre `LogoutDialog`; al salir,
`logout()` y, si el servidor cerró la sesión, se borra la réplica. `test-utils/sync.tsx`
da réplicas en memoria, un replicador falso y un contexto mínimo (`syncValue`, `WithSync`).
`sync/resources.ts` abre réplica, remota y replicador (lo comparten el proveedor y las
pruebas de integración). Éstas (`sync/*.integration.test.ts`, `npm run test:sync`) usan
`test-utils/device.ts`: cada `Device` es un navegador con sus cookies, su red simulable
(sin red, backend caído) y su réplica, contra el backend real.

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
navegador (`Accept: text/html`), que reciben `index.html` para que React Router pinte la ruta.

El resto de la estructura (editor) se define en su propia spec.
