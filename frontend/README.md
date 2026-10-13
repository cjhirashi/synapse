# frontend/

React + TypeScript + Vite. Sincronización offline-first con CouchDB/PouchDB (sprints posteriores).

## Comandos

```bash
npm install
npm run dev        # Vite; /auth, /admin y /vaults (fetch) van por proxy al backend
                   # (localhost:8000, o BACKEND_URL si está definida)
npm test           # vitest + Testing Library
npm run typecheck  # src/ (tsconfig.json) y vite.config.ts (tsconfig.node.json)
npm run build      # typecheck + build
```

## Contenedor

- `Dockerfile` — etapa `build` (Node: compila la SPA) y etapa final (nginx en el puerto 3000).
- `nginx.conf` — réplica del proxy de `vite.config.ts`: misma tabla de rutas, mismo
  origen para la SPA y la API. Si cambia una, cambia la otra.
- `docker-compose.dev.yml` usa la etapa `build` con `npm run dev` y `BACKEND_URL=http://backend:8000`.

## Autenticación (SPEC-0002, RF-020)

- `src/api/auth.ts` — cliente de `/auth/*` con `credentials: 'include'` (las cookies
  httpOnly las gestiona el navegador; el frontend nunca ve el token).
- `src/auth/RequireAuth.tsx` — guardia de rutas: sin sesión → `/login`; con
  `must_change_password` → `/settings/password`.
- `src/settings/ChangePasswordPage.tsx` — sección "Cambiar contraseña", accesible a todo
  usuario autenticado.

## Convenciones

- `PascalCase` para componentes (`EditorView.tsx`)
- `camelCase` para hooks (`usePouchSync.ts`) y utilidades
- Un componente por archivo; su test al lado (`*.test.tsx`)
