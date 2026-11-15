# frontend/

React + TypeScript + Vite. SPA offline-first: PouchDB replica contra CouchDB por el canal `/sync` del backend. Estado a 2026-11-05: 125 archivos de prueba y 2.850 pruebas en verde (`npm test`).

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

## Verificación e2e de historias recientes

Mismas reglas que `test:visual` (`scripts/visual.sh`; se filtran con `-- e2e/<archivo>`):

- `e2e/h025-enlaces.spec.ts` — H-025: pegado de enlaces, aviso «Deshacer», captura pegada y diálogo «Subir o pegar URL»
  (los eventos de pegado se simulan; la reproducción real del vídeo es del checkpoint de Carlos).
- `e2e/h029-meta.spec.ts` y `e2e/h029-tipos.spec.ts` — H-029: sección META de la nota, Código sin YAML, fechas selladas,
  estados de la bóveda y atributos tipados (fecha, select, multiselect).
- `e2e/h037-plotly.spec.ts` — H-037: gráficos Plotly (línea SVG, WebGL 2D y 3D) subidos como archivo y embebidos en una nota.
  Los HTML (~4,8 MB) viven en `e2e/.fixtures-h037/`, fuera del repositorio.

- `e2e/h030-meta.spec.ts`, `e2e/h030b.spec.ts` y `e2e/h031-indices.spec.ts` — H-030, H-030b y H-031: sección META plegable sobre la raíz, carpetas reservadas sin menú ni arrastre, BITACORA y PLANTILLAS de solo lectura o con formulario, ÍNDICES generados con su vista.
- `e2e/h041-sistema.spec.ts` y `e2e/h041-gestor.spec.ts` — H-041: documentos de sistema con candado y vista de solo lectura; pantalla «Skills sin propietario» y reasignación al salir un gestor (`/settings/agent-access`).
- `e2e/h042-mensajes.spec.ts` — H-042: `AG - MENSAJES` solo lectura para el usuario (sin controles de creación; conversaciones y mensajes en vista de lectura).

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

## Identidad de marca (SPEC-0011)

El logo oficial (cerebro cian con degradado) se publica desde `public/`: `logo-synapse-{dark,light}.svg`
(cabecera y login, uno por tema), `favicon.svg` (con `@media (prefers-color-scheme: dark)`), `favicon.ico`
(16/32/48), `apple-touch-icon.png` (180), `icons/icon-{192,512,maskable-512}.png` y `manifest.webmanifest`
(sólo iconos y colores: la app no es instalable). Están **generados**: no se editan a mano.

```
bash scripts/brand/build.sh   # regenera todo desde scripts/brand/source/ y palettes.json (colores)
```

Requisitos: Docker con la imagen `mcr.microsoft.com/playwright:v1.56.0-jammy` (Chromium rasteriza los PNG),
`npm ci --prefix scripts/brand` (svgo 4.0.0) y `pip install -r scripts/brand/requirements.txt` (Pillow 12.3.0);
`build.sh` falla con un mensaje si las versiones no coinciden. Opciones: `--svg-only`, `--raster-only`,
`--keep-tmp <dir>`. Correrlo dos veces no cambia ningún byte. Las pruebas son `src/brand/*.test.*`, 
`backend/tests/test_brand_assets.py` y, en navegador real, `e2e/brand-header.spec.ts` y
`e2e/brand-assets.spec.ts` dentro de `npm run test:visual` (`-- --grep "B-|A-"`); usa `VISUAL_PORT` y
`COUCHDB_URL` propios si otra suite comparte el puerto o el CouchDB.

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

## Riel principal (H-028)

- `src/notes/VaultRail.tsx` — riel lateral dividido en dos zonas:
  - **Superior:** lista de bóvedas con scroll vertical (ocupa el espacio disponible).
  - **Inferior:** dos enlaces fijos (Papelera, Usuario) + foto/iniciales del usuario. Desde H-052 Archivos es una pestaña de cada
    bóveda y ya no hay ventana global.
- `src/layout/AppLayout.tsx` — contenedor principal: navbar (marca + «Bóvedas») + riel +
  contenido. H-028 A7: salen de la navbar los enlaces Archivos/Papelera (al riel), el
  `ThemeToggle` (a `src/settings/ThemePage.tsx`) y el `AccountMenu`, que se elimina (su
  «Cerrar sesión» pasa a `src/settings/SettingsPage.tsx`). `LogoutDialog` sigue montado.
- La entrada «Usuario» del riel usa `useMe()`: muestra la foto (`photo_url`) o las iniciales
  del nombre/correo, y enlaza a `/settings`.

## Despliegue

**FastAPI sirve la SPA (SPEC-0007).** Ya no hay contenedor `frontend`/nginx: el build de
`npm run build` (`frontend/dist`) lo monta el backend con `StaticFiles` y lo entrega junto
a la API en su puerto 8000. El `Dockerfile` multi-stage que compila esta SPA y la copia a la
imagen del backend vive en `backend/Dockerfile` (ver `backend/README.md`).

- **Producción:** el backend (8000) sirve API + SPA. El enrutado (assets directos, `/vaults` por `Accept`, fallback a
  `index.html`) lo hace `backend/app/spa.py`.
- **Desarrollo:** `npm run dev` en el host levanta Vite con el proxy de `vite.config.ts`
  (`/auth`, `/admin`, `/vaults`, `/sync` → backend). El backend en dev
  (`docker-compose.dev.yml`) corre como API pura; la SPA la sirve Vite con hot-reload.

## Autenticación (SPEC-0002, RF-020)

- `src/api/auth.ts` — cliente de `/auth/*` con `credentials: 'include'` (las cookies
  httpOnly las gestiona el navegador; el frontend nunca ve el token).
  - Métodos `updateDisplayName`, `uploadPhoto`, `deletePhoto` para el perfil del usuario (H-028).
- `src/auth/RequireAuth.tsx` — guardia de rutas: sin sesión → `/login`; con
  `must_change_password` → `/settings/password`.
  - Exporta `MeContext`, `useMe()`, `useRefreshMe()` y `RefreshMeContext` (RF-021, RF-023).

## Pantalla de usuario (H-028)

- `src/settings/SettingsPage.tsx` — tarjeta de identidad arriba (avatar, nombre o correo en el único `h1`,
  correo, rol y «Cerrar sesión») y debajo navegación de secciones con iconos + `<Outlet>`. Rutas anidadas:
  `/settings/profile`, `/settings/password`, `/settings/api-keys`, `/settings/theme`, `/settings/agent-access`.
  En ≤ 800 px la navegación pasa a pestañas con scroll horizontal. Las secciones llevan su título en `h2`.
- `src/settings/avatarImage.ts` — `squareAvatar()`: recorte cuadrado centrado y reducción a 512 px en WebP (JPEG si no hay WebP),
  con orientación EXIF; si el navegador no puede, sube el original. Evita el tope de 2 MB con fotos de celular.
- `src/settings/UserAvatar.tsx` — avatar redondo: foto o iniciales sobre el acento (hero y Perfil).
- `src/settings/ProfilePage.tsx` — sección «Perfil» en dos tarjetas: foto (un solo paso: al elegirla se recorta,
  se sube y se refresca el riel; «Quitar foto»; el selector nativo queda oculto tras «Elegir foto») e información personal (nombre máx. 80 con contador, correo de solo
  lectura; «Guardar» se activa solo si el nombre cambió).
- `src/settings/ThemePage.tsx` — sección «Tema»: tres tarjetas con vista previa (Claro, Oscuro, Sistema).
- Estilos en `settings.css` y `profile.css`: solo tokens de `styles/tokens.css` (nunca `--surface*` ni
  `--accent-rgb`, que no existen). Los formularios heredados (Contraseña, API keys) toman el estilo de tarjeta
  con `.settings-content .card-form`.
- `src/settings/ChangePasswordPage.tsx` — sección "Cambiar contraseña", accesible a todo
  usuario autenticado (reutilizada de SPEC-0002).
- Rutas en `src/App.tsx`: `/settings` redirige a `/settings/profile`; las demás son
  sub-rutas bajo `<SettingsPage>` (Outlet de React Router dentro de `<AppLayout>`).

## PDF de documentos (H-036)

La plantilla define el formato en su sección «Diseño del PDF» (`notes/PdfStyleSection.tsx`) y, si lo activa, sus documentos muestran el botón «PDF» junto a «Editar».
El cliente manda al servidor el HTML que ya dibuja en Lectura (`notes/pdfHtml.ts`: iframes, videos y audio pasan a un recuadro con título y enlace) y descarga el PDF
que el servidor genera con el formato de la plantilla. Requiere conexión; sin ella el botón avisa.

**Marcas de formato** (`editor/markdown/pdfBlocks.ts`): portada (`<!-- pdf:portada -->`…`<!-- /pdf:portada -->`), índice (`<!-- pdf:indice -->`), salto de página (`<!-- pdf:salto -->`),
alineación (`<div align="center">…</div>`) y columnas (`<div class="cols-2">…</div>`) viven en el Markdown como HTML. Un transformador remark agrupa cada pareja apertura/cierre
en un nodo contenedor (`pdf_block`) y las marcas de una línea en `pdf_mark`; al guardar se escriben igual. Sus botones están en la barra del editor
(`editor/markdown/pdfBlockCommands.ts`) y `notes/pdfHtml.ts` pasa el índice y el salto al servidor como marcadores.

## Tareas, avisos y app instalable (H-053)

- `src/tasks/` — pestaña «Tareas» de cada bóveda (`VaultTasks.tsx`): `taskModel.ts` (reglas puras: estados, filas del Gantt, calendario,
  arrastre de barras), `tasksApi.ts` (cliente de `/vaults/{id}/tasks`), `TaskViews.tsx` (Lista y Kanban), `TaskCalendar.tsx` (año, mes,
  semana y día), `TaskGantt.tsx` (línea de tiempo: solo dibuja las tareas con inicio y vencimiento; barras arrastrables con puntero y
  con Alt + flechas), `TaskForm.tsx`, `TaskDetail.tsx`, `TaskFilters.tsx` y `ReminderEditor.tsx`. El Kanban no se ofrece en móvil.
- `src/agents/` — `AgentBadge`/`UserBadge` (foto y nombre de agentes y personas), `AgentSelect` y el editor de perfil de agente
  (nombre visible y foto por `agent_id`).
- `src/notes/DocAside.tsx` — barra derecha del documento: pestañas «Índice» (encabezados) y «Tareas» (las ligadas por su `path`).
- `src/notifications/` — campana, bandeja `/avisos` (tarjetas agrupadas por día con título, descripción, estado, responsable y bóveda de la tarea; filtro «Sin leer» y botón para marcar como leído sin abrir la tarea) y cliente de Web Push; `src/settings/NotificationsSettingsPage.tsx` en
  `/settings/notifications` (tipos, horas silenciosas, dispositivos, aviso de prueba).
- `src/pwa/` y `public/sw.js` — service worker propio (sin Workbox) que guarda solo los assets con huella y atiende los push; cada
  build sella `sw.js` con su versión y la app ofrece «Actualizar» sin recarga automática; busca versiones nuevas al volver a ella y
  cada 10 minutos.

## Convenciones

- `PascalCase` para componentes (`EditorView.tsx`)
- `camelCase` para hooks (`usePouchSync.ts`) y utilidades
- Un componente por archivo; su test al lado (`*.test.tsx`)
