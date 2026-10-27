# frontend/

React + TypeScript + Vite. Sincronización offline-first con CouchDB/PouchDB (sprints posteriores).

## Comandos

```bash
npm install
npm run dev        # Vite; /auth, /admin y /vaults (fetch) van por proxy al backend
                   # (localhost:8000, o BACKEND_URL si está definida)
npm test           # vitest + Testing Library (sin las pruebas de integración)
npm run test:sync  # sincronización real (SPEC-0005 y SPEC-0008): levanta uvicorn con SQLite
                   # temporal contra la CouchDB de test (COUCHDB_URL, por defecto
                   # localhost:15984) y corre src/{sync,notes}/*.integration.test.ts con
                   # réplicas en memoria (las notas incluidas)
npm run test:sync:perf  # igual, sólo la prueba de rendimiento (p95 ≤ 5 s, RNF-001)
npm run test:perf  # RNF-001 de SPEC-0008: abrir una bóveda de 1 000 notas (p95 < 300 ms);
                   # las pruebas *.perf.test.tsx quedan fuera de `npm test` salvo con NOTES_PERF=1
npm run test:visual  # SPEC-0009: fidelidad visual y RNF-001 en Chromium real. Compila la SPA, levanta el
                   # backend del worktree en :8010 (VISUAL_PORT) sobre SQLite temporal y el CouchDB de
                   # test (COUCHDB_URL, por defecto localhost:15984; usa otro si otra suite lo comparte,
                   # porque su limpieza borra las bases de usuario) y corre `playwright test` dentro del
                   # contenedor mcr.microsoft.com/playwright:v1.56.0-jammy (misma versión que
                   # @playwright/test; hace falta Docker). Capturas y measurements.json en /tmp/s9/e2e
                   # (VISUAL_OUT_DIR), a comparar con las del mockup en /tmp/s9/ref. Los argumentos van a
                   # playwright: `-- --grep "V-3"`, `-- --grep-invert "V-7"`, `-- --list`.
                   # VISUAL_SKIP_BUILD=1 reutiliza dist/; REGRESS_TAG=antes|despues etiqueta las capturas
                   # de no regresión; RNF001_P95_MS cambia el umbral de RNF-001 (150 ms)
npm run test:cov   # con cobertura v8 (umbral 80 %; informe HTML en coverage/)
npm run typecheck  # src/ (tsconfig.json), vite.config.ts (tsconfig.node.json) y e2e/ (tsconfig.e2e.json)
npm run build      # typecheck + build
```

## Verificación en navegador real (SPEC-0009)

`e2e/` (no entra en `npm test`: Vitest lo excluye) tiene dos especificaciones de Playwright:
`workspace-visual.spec.ts` (V-1…V-10: riel, tooltip, barra lateral, editor, vacío, scroll, tema por
defecto, colores de tokens, móvil de 390 px y selector de ícono; cada medida R-n de PLAN-0009 §5.4 se
afirma y se guarda en `measurements.json`) y `workspace-perf.spec.ts` (RNF-001: abrir una bóveda de
1 000 notas en Chromium, 30 navegaciones tras el calentamiento, p95 ≤ 150 ms). Los datos se siembran
por la API REST (usuario, bóvedas con `icon`) y por la UI/CouchDB (notas). `regression.spec.ts` saca
capturas de login, lista, papelera, diálogo y menú de cuenta para comparar antes/después de un cambio
de estilos globales. `test:perf` sigue midiendo RNF-001 de SPEC-0008 en jsdom (p95 < 300 ms).

## Contenido markdown completo (SPEC-0010)

Dependencias nuevas (versión exacta): `@milkdown/plugin-clipboard` 7.22.3, `prosemirror-highlight` 0.16.0,
`@codemirror/lang-{javascript,css,html,yaml,python,sql,json}`, `@codemirror/legacy-modes` (sólo `shell`), `yaml` 2.9.1,
`mermaid` 11.17.2 y `svg-pan-zoom` 3.6.2. Mermaid, svg-pan-zoom, `yaml` y cada gramática extra van en chunks propios
(`import()`); la entrada y el chunk del editor no los importan.

```bash
npm run test:bundle   # tras `npm run build`: entrada ≤ 157 020 B y editor ≤ 357 388 B gzip, chunks propios presentes y
                      # sin importación estática, Worker de parseo ≤ 46 KiB (scripts/check-bundle.mjs, lee dist/.vite/manifest.json)
VISUAL_OUT_DIR=/tmp/s10/e2e npm run test:visual -- e2e/content-visual.spec.ts   # V-0…V-15 de 0010 (capturas en /tmp/s10/e2e)
VISUAL_OUT_DIR=/tmp/s10/e2e npm run test:visual -- e2e/content-perf.spec.ts     # RNF-001 de 0010 (p95 por tamaño de nota)
```

## Editor de notas (SPEC-0008)

El editor usa dependencias fijadas a versión exacta, sin `@milkdown/react` (un envoltorio
propio en `src/editor/MilkdownView.tsx`):

| Paquete | Versión | Uso |
|---|---|---|
| `@milkdown/core`, `ctx`, `prose`, `plugin-history`, `plugin-listener`, `preset-commonmark`, `preset-gfm` | 7.22.3 | vista Visual (WYSIWYG, markdown con tablas y tareas) |
| `@codemirror/state` 6.7.6, `view` 6.43.15, `commands` 6.11.1, `language` 6.13.1, `lang-markdown` 6.5.2 | — | vista Código (markdown crudo) |
| `react-router-dom` | 6.26.2 | `createBrowserRouter` en `main.tsx`: `useBlocker` sólo existe en data routers |

El editor se carga con `React.lazy` al abrir una bóveda: Milkdown y CodeMirror van en un
*chunk* aparte y `/vaults` no los descarga. Detalle de módulos en `src/README.md`.

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
