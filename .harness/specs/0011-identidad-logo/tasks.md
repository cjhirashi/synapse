---
id: TASKS-0011
tipo: tasks
feature: 0011-identidad-logo
estado: draft
actualizado: 2026-10-27
---

# TASKS-0011 · Identidad de marca: logo oficial de Synapse

> Desglose de PLAN-0011 (GATE 2 aprobado el 2026-10-27: P-1…P-14 y ajuste R-2).
> Orden de method.md v1.9 pedido por el coordinador: re-anclaje y línea base → `scripts/brand` y
> assets → cabecera y login → `theme-color` → iconos y manifest → `forced-colors`/RF-020 → e2e de
> fidelidad → regresión → documentación.

## Reglas
- Cada tarea: ≤ 30 min, un solo propósito, `(cubre RF-NNN)`, zona del patrón (o `[doc]`).
- **Test antes que código:** cada test rojo va justo antes de la tarea que lo pone en verde.
- Cada tarea lleva `CHECK:` (comando exacto, rutas relativas a la raíz del worktree
  `.claude/worktrees/0011-logo`) y `EXPECT:` (en un test rojo, el fallo esperado).
- **Servicios propios (P-14). Nunca :15984 ni :8010** (los usa 0010 en paralelo). En toda tarea
  que use CouchDB o el backend, exporta antes:
  `export COUCHDB_URL=http://localhost:15985 COUCHDB_USER=admin COUCHDB_PASSWORD=testpass VISUAL_PORT=8011 VISUAL_OUT_DIR=/tmp/s11/e2e`
  (abreviado `$E2E_ENV` en los CHECK). `backend/tests/conftest.py` **borra** bases
  `synapse_user_*` del CouchDB al que apunta: sin el `export` borraría las de 0010.
- Contenedor de CouchDB por **nombre** (`synapse-0011-couchdb`); nunca `pkill`/`killall`.
- **Tareas de percepción:** capturas y medidas en Chromium real (`npm run test:visual`), en
  `/tmp/s11/e2e/`. La línea base va a `/tmp/s11/ref/`.
- Cada test lleva su `RF-` en el nombre o en un comentario (Art. 9). Commits Conventional +
  `(RF-NNN)`/`(T-NNN)`. `git add` explícito, nunca `-A`.
- RF-018: ninguna aserción existente de 0002/0009 cambia (ninguna nombra `.app-brand-mark`).
- Paletas (`frontend/scripts/brand/palettes.json`, un canon; P-4 y R-2):

  | Paleta | Delantera | Trasera | Uso |
  |---|---|---|---|
  | `dark` | `#22d3ee` → `#0891b2` | `#0891b2` → `#0e7490` | cabecera/login oscuro; PNG opacos sobre `#12121a` |
  | `light` | `#0891b2` → `#0e7490` | `#155e75` → `#164e63` | cabecera/login claro; `favicon.svg` por defecto |
  | `favicon-dark` | `#22d3ee` → `#0891b2` | `#0891b2` → `#0b809f` | regla `@media (prefers-color-scheme: dark)` del favicon |
  | `neutral` | `#0899b9` → `#0891b2` | `#0891b2` → `#0b809f` | ICO y PNG `any` transparentes |

## Tareas

### 0 · Re-anclaje y línea base
- [ ] T-000 — Notas de re-anclaje al inicio en `0009-rediseno-visual-workspace/spec.md` y `0007-fastapi-sirve-spa/spec.md` (ambas `strict`): SPEC-0011 toca `index.html`, `theme/useTheme.ts(+test)`, `layout/AppLayout.css`, `e2e/**` (0009) y `frontend/README.md` (0007) sin cambiar sus RF. Formato de la nota de T-004 de TASKS-0009 [doc] [P-11]
  - CHECK: `git diff --name-only -- .harness/specs/0009-rediseno-visual-workspace/spec.md .harness/specs/0007-fastapi-sirve-spa/spec.md && bash .harness/gate/check.sh | grep -E "0007|0009"`
  - EXPECT: los dos archivos en el diff; las líneas de 0007 y 0009 en ✅ (sin "DRIFT").
- [ ] T-001 — Dependencias y build del worktree limpio; números de la suite anotados en `history.md` (cubre RF-018: línea base) [zona: sistema]
  - CHECK: `cd frontend && npm ci && npm run build && npx vitest run`
  - EXPECT: `build` exit 0; `Tests N passed (N)` con 0 failed (N anotado).
- [ ] T-002 — CouchDB propio en :15985 con `_users` y `_replicator` (P-14) [zona: sistema]
  - CHECK: `docker run -d --name synapse-0011-couchdb -p 127.0.0.1:15985:5984 -e COUCHDB_USER=admin -e COUCHDB_PASSWORD=testpass couchdb:3 && sleep 5 && for db in _users _replicator; do curl -fsS -u admin:testpass -X PUT http://localhost:15985/$db; done; curl -fsS http://localhost:15985/_up`
  - EXPECT: `{"status":"ok"}`.
- [ ] T-003 — B-0: `frontend/e2e/brand-header.spec.ts` con la prueba "B-0 línea base" (alto de `.app-header` a 390/1024/1440 × oscuro/claro, escribe `/tmp/s11/ref/header-baseline.json`), corrida **sobre el HEAD sin tocar `AppLayout`**; después se congelan los 6 valores como constante `HEADER_BASELINE` en el mismo archivo (cubre RF-010) [zona: test]
  - CHECK: `$E2E_ENV; cd frontend && npm run test:visual -- --grep "B-0" && cat /tmp/s11/ref/header-baseline.json`
  - EXPECT: 1 passed; JSON con 6 altos (1024/1440 ≈ 70).
- [ ] T-004 — Línea base de la frontera HTTP de 0007 con el CouchDB propio (cubre RF-005: no regresión) [zona: sistema]
  - CHECK: `$E2E_ENV; cd backend && python3 -m pytest -q tests/test_spa.py`
  - EXPECT: todos passed, 0 failed.

### A · `scripts/brand` y assets SVG
- [ ] T-005 — Versionar el original: copiar `.harness/assets/logo-synapse.svg` del checkout principal a `frontend/scripts/brand/source/logo-synapse.original.svg` con permisos 644 (cubre RF-015) [zona: sistema] [P-7]
  - CHECK: `sha256sum /mnt/disco2/cjhirashi-data/proyectos/synapse/.harness/assets/logo-synapse.svg frontend/scripts/brand/source/logo-synapse.original.svg && stat -c %a frontend/scripts/brand/source/logo-synapse.original.svg`
  - EXPECT: mismo hash; `644`; 125 570 B.
- [ ] T-006 — `frontend/scripts/brand/package.json` + `package-lock.json` (`svgo` 4.0.0, `playwright-core` 1.56.0, versiones exactas) y `requirements.txt` (`Pillow==12.3.0`) (cubre RNF-001) [zona: sistema] [P-6]
  - CHECK: `npm ci --prefix frontend/scripts/brand && frontend/scripts/brand/node_modules/.bin/svgo --version && python3 -c "import PIL; print(PIL.__version__)"`
  - EXPECT: `4.0.0`; `12.3.0`; `frontend/package.json` sin cambios (`git diff --quiet frontend/package.json`).
- [ ] T-007 — Test (rojo) `frontend/src/test-utils/wcag.ts` (luminancia y contraste WCAG 2.x) + `frontend/src/brand/palettes.test.ts`: cada parada de las 4 paletas con tono HSL en [180°, 200°] y sin `#001430`/`#0f3ab5`/`#2643d4`; `dark` ≥ 3:1 vs `#1a1a24` y vs `#12121a`; `light` ≥ 3:1 vs `#f8fafc` y vs `#ffffff`; `favicon-dark` ≥ 3:1 vs `#202124`; `neutral` ≥ 3:1 vs `#ffffff`, `#202124`, `#f8fafc`, `#1a1a24`; los fondos de los temas se leen de `tokens.css` (cubre RF-007, RF-013, RF-014) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/brand/palettes.test.ts`
  - EXPECT: falla: no existe `scripts/brand/palettes.json`.
- [ ] T-008 — `frontend/scripts/brand/palettes.json` con las 4 paletas de la tabla de Reglas (cubre RF-007, RF-013, RF-014) [zona: sistema]
  - CHECK: `cd frontend && npx vitest run src/brand/palettes.test.ts`
  - EXPECT: passed; contraste mínimo de `favicon-dark` vs `#202124` = 3,53.
- [ ] T-009 — Mover `reference/build/build_logo.py` y `svgo.config.mjs` a `frontend/scripts/brand/`; `build_logo.py` lee `palettes.json` y el original versionado, comentado (qué capas, por qué se descartan los rellenos navy y el sombreado), y `build.sh` (pasos 1–2: `build_logo.py` → `svgo` a `public/`); retirar `reference/build/` (cubre RF-011, RF-013, RF-015) [zona: sistema]
  - CHECK: `bash frontend/scripts/brand/build.sh --svg-only && git status --short frontend/public && ls .harness/specs/0011-identidad-logo/reference`
  - EXPECT: `logo-synapse-dark.svg` y `logo-synapse-light.svg` **sin diff** respecto a 6b64875; `reference/` sin `build/`.
- [ ] T-010 — Test (rojo) `frontend/src/brand/brandAssets.test.ts`, parte SVG: `public/favicon.svg` existe; colores de los 3 SVG con tono en [180°, 200°] y ≥ 1 degradado de ≥ 2 paradas distintas; paradas de las variantes = `palettes.json` (`dark`/`light`); favicon: paradas por defecto = `light` (≥ 3:1 vs `#ffffff`) y la regla `@media (prefers-color-scheme: dark)` existe con las de `favicon-dark` (≥ 3:1 vs `#202124`); sin `<script`, `<foreignObject`, atributos `on…=` ni `href` externos; cada SVG ≤ 10 KB `gzip -9` (`zlib.gzipSync` nivel 9) y ≤ 30 KB en bruto (cubre RF-001, RF-007, RF-013, RF-014, RNF-001) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/brand/brandAssets.test.ts`
  - EXPECT: falla sólo por `favicon.svg` ausente; las aserciones de las dos variantes pasan.
- [ ] T-011 — `build_logo.py` emite el favicon (clases en los `<stop>`, `<style>` con la regla `@media` de `favicon-dark`) y `build.sh` lo optimiza a `public/favicon.svg` (cubre RF-001, RF-007) [zona: sistema] [P-3, R-2, R-4]
  - CHECK: `bash frontend/scripts/brand/build.sh --svg-only && grep -c "prefers-color-scheme" frontend/public/favicon.svg && cd frontend && npx vitest run src/brand/brandAssets.test.ts`
  - EXPECT: `1`; passed; favicon ≈ 7,7 KB en bruto.
- [ ] T-012 — `frontend/scripts/brand/rasterize.mjs` (en `mcr.microsoft.com/playwright:v1.56.0-jammy`, `playwright-core` de `scripts/brand`): `neutral` a 16/32/48 y 192/512 transparentes a lo ancho; `dark` a 180 y 512 *maskable* sobre `#12121a` con el logo al 72 % centrado; PNG sin pérdida a un directorio temporal; paso 3 de `build.sh` (cubre RF-002, RF-003, RF-004, RF-006) [zona: sistema] [P-5, P-9]
  - CHECK: `bash frontend/scripts/brand/build.sh --raster-only --keep-tmp /tmp/s11/raster && ls /tmp/s11/raster`
  - EXPECT: 7 PNG: `ico-16`, `ico-32`, `ico-48`, `any-192`, `any-512`, `apple-180`, `maskable-512`.
- [ ] T-013 — Test (rojo) `brandAssets.test.ts`, parte raster: dimensiones por `IHDR` (`apple-touch-icon.png` 180, `icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`); 180 y *maskable* sin alfa ni `tRNS`; `favicon.ico` con entradas 16/32/48 y carga útil PNG; topes RNF-001 (ICO ≤ 15 KB, 180 ≤ 15 KB, 192 ≤ 15 KB, cada 512 ≤ 50 KB, conjunto `favicon.*` + `apple-touch-icon.png` + `icons/*` + `manifest.webmanifest` ≤ 150 KB) (cubre RF-002, RF-003, RF-004, RF-006, RNF-001) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/brand/brandAssets.test.ts`
  - EXPECT: falla: no existen `favicon.ico`, `apple-touch-icon.png` ni `icons/`.
- [ ] T-014 — `frontend/scripts/brand/pack_icons.py` (Pillow: cuantiza 180/192/512 a 256 colores con alfa, `FASTOCTREE`, sin *dithering*; ICO con `append_images` de las 3 entradas exactas, sin cuantizar) y `build.sh` completo (pasos 1–4, comprueba versiones de svgo y Pillow) (cubre RF-002, RF-003, RF-004, RNF-001) [zona: sistema] [P-5]
  - CHECK: `bash frontend/scripts/brand/build.sh && bash frontend/scripts/brand/build.sh && git status --short frontend/public && cd frontend && npx vitest run src/brand`
  - EXPECT: la segunda corrida no cambia nada (determinista); passed; ICO ≈ 6 KB, 512 *any* ≈ 14 KB.

### B · Cabecera y login
- [ ] T-015 — Test (rojo) e2e B-1, B-2, B-3 en `brand-header.spec.ts`: a 390/1024/1440 × oscuro/claro, `.app-brand .brand-logo` antes del texto, caja 28×28, centro vertical del logo vs `Range` del texto ≤ 1 px, alto 70 ± 1 (1024/1440) y `HEADER_BASELINE` ± 1 (390), `scrollWidth ≤ clientWidth`; silueta ≥ 90 % de 28 px; URL del `background-image` computado → paradas ≥ 3:1 vs el fondo computado de `.app-header`; capturas `header-{tema}-{ancho}.png` (cubre RF-008, RF-009, RF-010, RF-011, RF-014) [zona: test]
  - CHECK: `$E2E_ENV; cd frontend && npm run test:visual -- --grep "B-1|B-2|B-3"`
  - EXPECT: falla: no existe `.brand-logo`.
- [ ] T-016 — Test (rojo) e2e B-8 (login a 390/1440 × temas: logo 32 px antes de «Synapse», `aria-hidden`, contraste vs `.auth-card`; capturas `login-*.png`) y B-9 (una sola marca en `/vaults`, `/vaults/:id`, `/vaults/trash`, ajustes) (cubre RF-017, RF-018) [zona: test]
  - CHECK: `$E2E_ENV; cd frontend && npm run test:visual -- --grep "B-8|B-9"`
  - EXPECT: falla: no existe `.brand-logo` en login ni en la cabecera.
- [ ] T-017 — Test (rojo) `frontend/src/brand/BrandLogo.test.tsx` (un `span.brand-logo` con `aria-hidden="true"`, sin texto, sin rol ni `tabindex`) y `brandCss.test.ts` (`background` con `/logo-synapse-dark.svg` por defecto, `:root[data-theme="light"] .brand-logo` con `/logo-synapse-light.svg`, tamaño por `--brand-logo-size` con defecto 28px) (cubre RF-009, RF-012, RF-014, RF-016) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/brand/BrandLogo.test.tsx src/brand/brandCss.test.ts`
  - EXPECT: falla: no existen `BrandLogo.tsx` ni `brand.css`.
- [ ] T-018 — `frontend/src/brand/BrandLogo.tsx` y `brand.css` (PLAN-0011 §2.3a, sin la regla `forced-colors`, que va en T-031) (cubre RF-009, RF-012, RF-014, RF-016) [zona: frontend] [P-2]
  - CHECK: `cd frontend && npx vitest run src/brand`
  - EXPECT: passed.
- [ ] T-019 — Test (rojo) `layout/AppLayout.test.tsx`: en `.app-brand` primero `.brand-logo` y después el texto; `textContent` exacto «Synapse»; ningún `a`/`button`/`[tabindex]` dentro; no hay `.app-brand-mark`; una sola `.brand-logo` (cubre RF-008, RF-012, RF-018) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/layout/AppLayout.test.tsx`
  - EXPECT: falla: existe `.app-brand-mark`, no hay `.brand-logo`.
- [ ] T-020 — `AppLayout.tsx` (`<BrandLogo />` + «Synapse») y `AppLayout.css` (borra `.app-brand-mark`; `.app-brand { --brand-logo-size: 28px; }`) (cubre RF-008, RF-009) [zona: frontend] [P-8]
  - CHECK: `cd frontend && npx vitest run && grep -rn "app-brand-mark" src || echo limpio`
  - EXPECT: toda la suite passed (mismo N de T-001 + los nuevos); `limpio`.
- [ ] T-021 — Test (rojo) `auth/LoginPage.test.tsx`: `.auth-logo` con `.brand-logo` antes de «Synapse», decorativo, sin `.auth-logo-mark` (cubre RF-017) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/auth/LoginPage.test.tsx`
  - EXPECT: falla: existe `.auth-logo-mark`.
- [ ] T-022 — `LoginPage.tsx` (`<BrandLogo />`) y `AuthShell.css` (borra `.auth-logo-mark`; `.auth-logo { --brand-logo-size: 32px; }`) (cubre RF-017) [zona: frontend]
  - CHECK: `cd frontend && npx vitest run && grep -rn "auth-logo-mark" src || echo limpio`
  - EXPECT: passed; `limpio`.
- [ ] T-023 — **Revisión visual temprana** (method.md v1.9): B-1, B-2, B-3, B-8, B-9 en verde; leer las capturas de cabecera y login junto a `reference/logo-final-opcion-b.png`; si B-1 falla a 390 px por el tamaño, bajar a 26 px (P-8) y repetir (cubre RF-008…RF-011, RF-014, RF-017, RF-018, RNF-002) [zona: sistema]
  - CHECK: `$E2E_ENV; cd frontend && npm run test:visual -- --grep "B-1|B-2|B-3|B-8|B-9" && ls /tmp/s11/e2e/header-* /tmp/s11/e2e/login-*`
  - EXPECT: todo passed; 6 capturas de cabecera y 4 de login, descritas en `history.md`.

### C · `theme-color`
- [ ] T-024 — Test (rojo) `theme/useTheme.test.tsx`: `THEME_COLOR` = `--bg-secondary` de cada tema en `tokens.css`; con `<meta name="theme-color">` en el documento, al montar `ThemeToggle` vale `#1a1a24`, al pulsar "Tema claro" `#f8fafc`; en modo "sistema" un cambio de `prefers-color-scheme` cambia `data-theme` **y** el meta; el script de `index.html` contiene los mismos dos valores y existe el meta estático (cubre RF-016) [zona: test] [P-10]
  - CHECK: `cd frontend && npx vitest run src/theme/useTheme.test.tsx`
  - EXPECT: falla: `THEME_COLOR` no exportado; el meta no cambia.
- [ ] T-025 — Test (rojo) e2e B-4 (cambio de tema sin recarga: `window.__noReload` sobrevive, cambian URL del fondo y meta, logo pintado ≤ 500 ms) y B-5 (meta al cargar: oscuro sin preferencia, claro con `synapse-theme=light`, "sistema" con `colorScheme` emulado) (cubre RF-016) [zona: test] [P-12]
  - CHECK: `$E2E_ENV; cd frontend && npm run test:visual -- --grep "B-4|B-5"`
  - EXPECT: falla: no hay `meta[name=theme-color]`.
- [ ] T-026 — `useTheme.ts`: `THEME_COLOR` y `applyResolvedTheme(resolved)` (escribe `data-theme` y el meta), usada por el efecto de `mode` y por el oyente de "sistema"; `index.html`: `<meta name="theme-color" content="#1a1a24">` y el script previo al pintado fija el meta con la misma tabla (comentario que remite al test) (cubre RF-016) [zona: frontend]
  - CHECK: `cd frontend && npx vitest run src/theme && $E2E_ENV && npm run test:visual -- --grep "B-4|B-5"`
  - EXPECT: passed en ambos.

### D · Iconos y manifest
- [ ] T-027 — Test (rojo) `brandAssets.test.ts`, parte manifest e `index.html`: `public/manifest.webmanifest` igual al JSON de PLAN-0011 §3 (sin `start_url`/`scope`/`display`), cada `src` existe en `public/`; `index.html` con los 4 `<link>` de §2.4 (`icon` ICO `sizes="32x32"`, `icon` SVG `type="image/svg+xml"`, `apple-touch-icon`, `manifest`) (cubre RF-001, RF-002, RF-003, RF-004) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/brand/brandAssets.test.ts`
  - EXPECT: falla: no existe el manifest ni los `<link>`.
- [ ] T-028 — Test (rojo) `backend/tests/test_brand_assets.py` sobre el build real (patrón de `test_spa.py`): `200` y `Content-Type` de `/favicon.svg` (`image/svg+xml`), `/favicon.ico`, `/apple-touch-icon.png`, `/icons/*.png` (`image/png`), `/logo-synapse-{dark,light}.svg`, `/manifest.webmanifest` (`application/manifest+json`); los archivos de `dist/` = los de `public/` (bytes) (cubre RF-001…RF-005, RNF-001) [zona: test]
  - CHECK: `$E2E_ENV; cd frontend && npm run build && cd ../backend && python3 -m pytest -q tests/test_brand_assets.py`
  - EXPECT: falla sólo `/manifest.webmanifest` (404).
- [ ] T-029 — `frontend/public/manifest.webmanifest` y los `<link>` en `index.html` (cubre RF-001…RF-005) [zona: frontend]
  - CHECK: `$E2E_ENV; cd frontend && npx vitest run src/brand && npm run build && cd ../backend && python3 -m pytest -q tests/test_brand_assets.py tests/test_spa.py`
  - EXPECT: todo passed, sin cambios en `backend/app/spa.py`.
- [ ] T-030 — e2e `frontend/e2e/brand-assets.spec.ts` A-2 (180 y *maskable* servidos: todos los píxeles opacos; píxeles ≠ `#12121a` a ≤ 0,4·lado del centro) y A-4 (`request.get` de cada archivo contra uvicorn: `200` y MIME) (cubre RF-001…RF-006) [zona: sistema]
  - CHECK: `$E2E_ENV; cd frontend && npm run test:visual -- --grep "A-2|A-4"`
  - EXPECT: passed; radio máximo *maskable* ≈ 185 px anotado.

### E · `forced-colors` y fallo de carga
- [ ] T-031 — Test (rojo) `brandCss.test.ts` (regla `@media (forced-colors: active)` con `forced-color-adjust: none`, `background` `CanvasText` y `mask` con la silueta) y e2e B-6 (`emulateMedia({ forcedColors: "active" })`: logo monocromo, contraste píxel/`Canvas` ≥ 3:1, «Synapse» visible; captura) y B-7 (`page.route("**/logo-synapse-*.svg", r => r.abort())`: «Synapse» visible, caja 28×28, alto de cabecera de B-1, caja del color de fondo sin marco gris, sin texto alternativo; captura) (cubre RF-019, RF-020) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/brand/brandCss.test.ts; $E2E_ENV; npm run test:visual -- --grep "B-6|B-7"`
  - EXPECT: vitest falla (sin regla `forced-colors`); B-6 falla (el degradado claro sobre `Canvas` negro no llega a 3:1 o sin máscara); B-7 **pasa ya** por construcción (P-2), se deja constancia.
- [ ] T-032 — Regla `forced-colors` en `brand/brand.css` (cubre RF-019) [zona: frontend] [P-2]
  - CHECK: `cd frontend && npx vitest run src/brand && $E2E_ENV && npm run test:visual -- --grep "B-6|B-7" && ls /tmp/s11/e2e/forced-* /tmp/s11/e2e/broken-*`
  - EXPECT: passed; capturas `forced-{tema}.png` y `broken-{tema}.png`.

### F · E2E de fidelidad
- [ ] T-033 — e2e A-1 (RF-015): los dos SVG de cabecera y `favicon.svg` con `colorScheme` claro y oscuro, y el original versionado con su `viewBox` sustituido por `146 213 1205 1073`, pintados a 256 px en `<canvas>`; máscara alfa > 0; diferencia ≤ 1 %; silueta del variante 256×228 (cubre RF-011, RF-015) [zona: sistema] [P-1]
  - CHECK: `$E2E_ENV; cd frontend && npm run test:visual -- --grep "A-1"`
  - EXPECT: passed; diferencias ≈ 0,17 % anotadas en `measurements.json`.
- [ ] T-034 — e2e A-3, pestaña simulada (P-13): `favicon.svg` a 16 px y 32 px (DPR 2) sobre `#ffffff` con `colorScheme: "light"` y sobre `#202124` con `"dark"`; el color muestreado cambia de paleta entre esquemas; capturas `tab-{light,dark}.png` (cubre RF-007, RNF-002) [zona: sistema]
  - CHECK: `$E2E_ENV; cd frontend && npm run test:visual -- --grep "A-3" && ls /tmp/s11/e2e/tab-*`
  - EXPECT: passed; 2 capturas.
- [ ] T-035 — RNF-002: corrida `brand` completa; `measurements.json` con RF-009/RF-010/RF-014 por ancho y tema; leer las capturas de cabecera (390/1024/1440 × temas), login, pestaña, `forced` y `broken` junto a `reference/logo-original.png` (forma) y `tokens.css` (color) y describirlas en `history.md` para la aprobación de Carlos (cubre RNF-002) [zona: sistema]
  - CHECK: `$E2E_ENV; cd frontend && npm run test:visual -- --grep "B-|A-" && ls /tmp/s11/e2e/*.png | wc -l && cat /tmp/s11/e2e/measurements.json`
  - EXPECT: todo passed; ≥ 20 capturas; medidas dentro de tolerancia.

### G · Regresión
- [ ] T-036 — Frontend completo: typecheck, build y vitest (cubre RF-018) [zona: sistema]
  - CHECK: `cd frontend && npm run build && npx vitest run`
  - EXPECT: exit 0; `Tests M passed (M)`, M = N de T-001 + los nuevos, 0 failed, sin aserciones previas modificadas (`git diff 6b64875 --stat -- frontend/src/**/*.test.* ` sólo muestra los tests de T-017/T-019/T-021/T-024 y los nuevos).
- [ ] T-037 — Backend completo, **solo**, contra el CouchDB propio (cubre RF-005, RF-018) [zona: sistema]
  - CHECK: `$E2E_ENV; cd backend && python3 -m pytest -q`
  - EXPECT: todos passed (≈ 16 min), 0 failed; no se corta.
- [ ] T-038 — `test:visual` completo: V-1…V-10 de 0009 y `brand*` (cubre RF-018, RNF-002) [zona: sistema]
  - CHECK: `$E2E_ENV; cd frontend && npm run test:visual`
  - EXPECT: todo passed, 0 failed.
- [ ] T-039 — Gate verde (cubre RF-018) [zona: sistema]
  - CHECK: `bash .harness/gate/check.sh`
  - EXPECT: "Compuerta abierta", 0 error.

### H · Documentación y cierre
- [ ] T-040 — `frontend/README.md`: sección "Identidad de marca" (archivos de `public/`, regeneración con `scripts/brand/build.sh` y sus requisitos: Docker + imagen Playwright 1.56.0, `npm ci --prefix scripts/brand`, `pip install -r scripts/brand/requirements.txt`) y `brand*.spec.ts` en `test:visual` con `VISUAL_PORT`/`COUCHDB_URL` propios [doc]
  - CHECK: `grep -nE "scripts/brand|brand\*?\.spec|manifest" frontend/README.md`
  - EXPECT: ≥ 3 líneas.
- [ ] T-041 — `frontend/src/README.md`: módulo `brand/` (`BrandLogo`, variante por `data-theme`, `forced-colors`, carga fallida silenciosa) y `theme-color` en `useTheme` (`applyResolvedTheme`, `THEME_COLOR`) [doc]
  - CHECK: `grep -nE "BrandLogo|applyResolvedTheme|theme-color" frontend/src/README.md`
  - EXPECT: las 3 apariciones.
- [ ] T-042 — Verificar sin cambio `backend/README.md` (no enumera archivos raíz ni MIME) y `ARCHIFY.md` [doc]
  - CHECK: `grep -n -i "favicon\|manifest" backend/README.md; git diff --stat 6b64875 -- backend/README.md ARCHIFY.md`
  - EXPECT: sin coincidencias que queden obsoletas; diff vacío.
- [ ] T-043 — Notas de re-anclaje de cierre en `0002`, `0007` y `0009` `spec.md` (sin cambio de requisitos) [doc] [P-11]
  - CHECK: `bash .harness/gate/check.sh | grep -E "0002|0007|0009"`
  - EXPECT: las tres en ✅.
- [ ] T-044 — `.harness/memory/state.md`: estado de 0011 y backlog "migrar `notes/accentContrast.test.ts` a `test-utils/wcag.ts` tras fusionar 0010" (PLAN-0011 §7) [doc]
  - CHECK: `grep -n "0011\|wcag.ts" .harness/memory/state.md`
  - EXPECT: ambas entradas.
- [ ] T-045 — Parar y borrar el CouchDB propio por nombre (P-14) [zona: sistema]
  - CHECK: `docker rm -f synapse-0011-couchdb && docker ps --format '{{.Names}}' | grep -c synapse-0011 || true`
  - EXPECT: `0`; `synapse-test-couchdb` (:15984) sigue en marcha.

## Cobertura (el gate exige 100 %; `Estado` lo rellena el gate)
| RF / doc | Tareas | Test(s) | Estado |
|---|---|---|---|
| RF-001 | T-010, T-011, T-027, T-028, T-029, T-030 | brandAssets.test (favicon, `<link>`), test_brand_assets.py, e2e A-4 | Pendiente |
| RF-002 | T-012, T-013, T-014, T-027, T-028, T-029, T-030 | brandAssets.test (ICO), test_brand_assets.py, e2e A-4 | Pendiente |
| RF-003 | T-012, T-013, T-014, T-027, T-028, T-029, T-030 | brandAssets.test (IHDR, sin alfa), test_brand_assets.py, e2e A-2 | Pendiente |
| RF-004 | T-012, T-013, T-014, T-027, T-028, T-029, T-030 | brandAssets.test (manifest), test_brand_assets.py, e2e A-4 | Pendiente |
| RF-005 | T-004, T-028, T-029, T-030, T-037 | test_brand_assets.py (Content-Type), e2e A-4 | Pendiente |
| RF-006 | T-012, T-013, T-030 | brandAssets.test (opaco), e2e A-2 (radio) | Pendiente |
| RF-007 | T-007, T-008, T-010, T-011, T-034 | palettes.test, brandAssets.test (favicon), e2e A-3 | Pendiente |
| RF-008 | T-015, T-019, T-020, T-023 | AppLayout.test, e2e B-1 | Pendiente |
| RF-009 | T-015, T-017, T-018, T-020, T-023 | brandCss.test, e2e B-1 | Pendiente |
| RF-010 | T-003, T-015, T-023 | e2e B-0, B-1 | Pendiente |
| RF-011 | T-009, T-015, T-023, T-033 | e2e B-2, A-1 | Pendiente |
| RF-012 | T-017, T-018, T-019 | BrandLogo.test, AppLayout.test | Pendiente |
| RF-013 | T-007, T-008, T-009, T-010 | palettes.test, brandAssets.test (colores) | Pendiente |
| RF-014 | T-007, T-008, T-010, T-015, T-017, T-018, T-023 | palettes.test, brandAssets.test, brandCss.test, e2e B-3, B-8 | Pendiente |
| RF-015 | T-005, T-009, T-033 | e2e A-1 | Pendiente |
| RF-016 | T-017, T-018, T-024, T-025, T-026 | brandCss.test, useTheme.test, e2e B-4, B-5 | Pendiente |
| RF-017 | T-016, T-021, T-022, T-023 | LoginPage.test, e2e B-8 | Pendiente |
| RF-018 | T-001, T-016, T-019, T-023, T-036, T-037, T-038, T-039 | AppLayout.test, e2e B-9, suites completas | Pendiente |
| RF-019 | T-031, T-032 | brandCss.test (forced-colors), e2e B-6 | Pendiente |
| RF-020 | T-031, T-032 | e2e B-7 | Pendiente |
| RNF-001 | T-006, T-010, T-013, T-014, T-028 | brandAssets.test (topes), test_brand_assets.py (dist = public) | Pendiente |
| RNF-002 | T-023, T-034, T-035, T-038 | e2e B-1/B-6/B-7/B-8/A-3 (capturas) | Pendiente |
| doc: re-anclajes 0002/0007/0009 | T-000, T-043 | gate (sin DRIFT) | Pendiente |
| doc: frontend/README.md | T-040 | — | Pendiente |
| doc: frontend/src/README.md | T-041 | — | Pendiente |
| doc: backend/README.md, ARCHIFY.md (sin cambio) | T-042 | — | Pendiente |
| doc: state.md | T-044 | — | Pendiente |

> Esta tabla **es** la trazabilidad de la feature. Fila sin test, en `Fail` o `Pendiente` → el
> gate no abre.
