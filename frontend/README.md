# frontend/

React + TypeScript + Vite. Sincronización offline-first con CouchDB/PouchDB (sprints posteriores).

## Comandos

```bash
npm install
npm run dev        # Vite; /auth, /admin y /vaults (fetch) van por proxy al backend
                   # (localhost:8000, o BACKEND_URL si está definida)
npm test           # vitest + Testing Library (sin las pruebas de integración)
npm run test:sync  # sincronización real (SPEC-0005): levanta uvicorn con SQLite temporal
                   # contra la CouchDB de test (COUCHDB_URL, por defecto localhost:15984)
                   # y corre src/sync/*.integration.test.ts con réplicas en memoria
npm run test:sync:perf  # igual, sólo la prueba de rendimiento (p95 ≤ 5 s, RNF-001)
npm run test:cov   # con cobertura v8 (umbral 80 %; informe HTML en coverage/)
npm run typecheck  # src/ (tsconfig.json) y vite.config.ts (tsconfig.node.json)
npm run build      # typecheck + build
```

## Despliegue

**FastAPI sirve la SPA (SPEC-0007).** Ya no hay contenedor `frontend`/nginx: el build de
`npm run build` (`frontend/dist`) lo monta el backend con `StaticFiles` y lo entrega junto
a la API en su puerto 8000. El `Dockerfile` multi-stage que compila esta SPA y la copia a la
imagen del backend vive en `backend/Dockerfile` (ver `backend/README.md`).

- **Producción:** el reverse proxy externo (Caddy, fuera del repo) apunta al backend (8000),
  que sirve API + SPA. El enrutado (assets directos, `/vaults` por `Accept`, fallback a
  `index.html`) lo hace `backend/app/spa.py`.
- **Desarrollo:** `npm run dev` en el host levanta Vite con el proxy de `vite.config.ts`
  (`/auth`, `/admin`, `/vaults`, `/sync` → backend). El backend en dev
  (`docker-compose.dev.yml`) corre como API pura; la SPA la sirve Vite con hot-reload.

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
