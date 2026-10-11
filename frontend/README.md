# frontend/

React + TypeScript + Vite. Sincronización offline-first con CouchDB/PouchDB (sprints posteriores).

## Comandos

```bash
npm install
npm run dev        # Vite; /auth y /admin se redirigen por proxy al backend (localhost:8000)
npm test           # vitest + Testing Library
npm run build      # typecheck + build
```

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
