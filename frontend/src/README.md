# frontend/src/

Código fuente React.

```
src/
├── api/        # clientes HTTP del backend (auth.ts, vaults.ts) y errores de la API (problems.ts)
├── auth/       # login y guardia de rutas
├── layout/     # marco de las rutas privadas (navegación Bóvedas/Papelera, cuenta, cerrar sesión)
├── settings/   # ajustes de cuenta (cambiar contraseña)
├── vaults/     # bóvedas: lista, formulario crear/editar, papelera (SPEC-0003)
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

**Rutas privadas** (dentro de `RequireAuth` y `AppLayout`):

| Ruta | Pantalla |
|---|---|
| `/` | redirige a `/vaults` |
| `/vaults` | `vaults/VaultListPage.tsx` — bóvedas activas, «Cargar más», borrar con confirmación |
| `/vaults/new` | `vaults/VaultForm.tsx` — crear |
| `/vaults/:id/edit` | `vaults/VaultForm.tsx` — editar (envía sólo los campos cambiados) |
| `/vaults/trash` | `vaults/TrashPage.tsx` — borradas, con fecha de borrado, y restaurar |

**Bóvedas (SPEC-0003):** `api/vaults.ts` envuelve `/vaults/**` sobre `request` de
`api/auth.ts` (hereda la renovación de sesión) y define `VAULT_PROBLEM` (`nameTaken`,
`preconditionFailed`, `notFound`). Toda bóveda lleva su `etag`: el de la cabecera `ETag` en
las respuestas de una bóveda y el del elemento en los listados; las escrituras lo mandan en
`If-Match`. `vaults/useVaultPages.ts` pagina la lista o la papelera; `vaults/errors.ts`
decide si un error es sesión cerrada (401) o vista desfasada (412 o 404 de bóveda), en cuyo
caso la pantalla avisa y recarga: el formulario descarta lo escrito y carga la versión
vigente (guardarlo encima pisaría el cambio ajeno).

En desarrollo, `vite.config.ts` reenvía `/vaults` al backend salvo las navegaciones del
navegador (`Accept: text/html`), que reciben `index.html` para que React Router pinte la ruta.

El resto de la estructura (editor, sync) se define en sus propias specs.
