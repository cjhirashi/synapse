---
id: PLAN-0011
tipo: plan
feature: 0011-identidad-logo
estado: implemented
aprobaciones:
  fase_2: { por: "AIRA en nombre de Carlos Jiménez (cjhirashi), autoridad delegada", fecha: 2026-10-27, nota: "P-1…P-14 aceptados tal cual; ajuste R-2: en el favicon oscuro la capa trasera termina en #0b809f (los SVG de cabecera no cambian)" }
actualizado: 2026-10-27
---

# PLAN-0011 · Identidad de marca: logo oficial de Synapse

> El *cómo* de SPEC-0011 en el patrón por-capas con puertos (ADR-001). Es una feature **de
> vestido y de archivos estáticos**: sin núcleo de negocio nuevo, sin API, sin `contracts/`.
> Las decisiones de producto de spec §6 (D1–D4, D-5…D-16) no se reabren. Lo que este plan
> decide está en §7 (**P-1…P-14**). **GATE 2 aprobado el 2026-10-27** por AIRA en nombre de
> Carlos: P-1…P-14 tal cual y el ajuste de R-2 (la trasera del favicon oscuro termina en
> `#0b809f`, 3,53:1 vs `#202124`; los SVG de cabecera no cambian).
>
> **Entrada ya producida (commit `6b64875`, no se rehace):** `frontend/public/logo-synapse-dark.svg`
> y `logo-synapse-light.svg` (opción B, D-15), generados con
> `reference/build/build_logo.py` + `svgo.config.mjs` (svgo 4.0.0, `floatPrecision: 1`) desde el
> original de Carlos. `viewBox` recortado `146 213 1205 1073`; a 256 px la silueta mide 256×228
> (RF-011). 7 360 B / 3 370 B con `gzip -9`. **Dos variantes por tema** (decisión del
> coordinador sobre D3): para que un solo SVG pase RF-014 en ambos temas cada parada tendría que
> quedar en luminancia ≈ [0,13; 0,285], y en ese rango no cabe la diferencia de profundidad
> entre capas.
>
> | Variante | Delantera inicio → fin | Trasera inicio → fin | CR de cada parada vs `--bg-secondary` |
> |---|---|---|---|
> | oscuro | `#22d3ee` → `#0891b2` | `#0891b2` → `#0e7490` | 9,55 / 4,69 / 4,69 / 3,22 (vs `#1a1a24`) |
> | claro | `#0891b2` → `#0e7490` | `#155e75` → `#164e63` | 3,52 / 5,12 / 6,95 / 8,71 (vs `#f8fafc`) |
>
> Tonos 188–196°. Las dos variantes comparten la parada `#0891b2` (= `--accent`): la marca
> conserva su cian constante entre temas, como pide `1.1.4.1 - Sistema de Diseño` ("`--accent`
> es el único valor que no cambia entre temas"), y lo que varía es el resto del degradado, con
> la misma lógica con la que varía `--accent-hover` para sostener el contraste.
>
> **Orden (method.md v1.9, Fase 2):** primero la **maquetación** (logo en cabecera y login) con
> los dos SVG ya existentes y capturas reales; después la **tubería de assets** (favicon, ICO,
> PNG, manifest); después el **cableado funcional** de `theme-color`; al final la frontera HTTP
> y la verificación de sistema.
>
> **Evidencia medida para este plan** (Chromium 1.56.0 del contenedor Playwright y Pillow 12.3.0,
> 2026-10-27, en `/tmp/s11plan/`, fuera del repo): ver §5.4.

## 0. Gates de simplicidad
- [x] Simplicity — el logo es un `<span aria-hidden>` con `background-image` por tema (P-2): sin
  JS de tema nuevo para el logo, sin `onError`, sin SVG inline. Un componente (`BrandLogo`) que
  usan cabecera y login. `theme-color` reutiliza el único punto donde ya se aplica el tema.
- [x] Anti-Abstraction — sin librería de iconos ni de favicons; la tubería de assets son 4
  scripts cortos en `frontend/scripts/brand/` que se ejecutan a mano cuando cambia el logo, y
  los archivos generados se versionan en `frontend/public/`.
- [x] Integration-First — no hay API ni `contracts/` (spec §3). Las "fronteras" son archivos
  estáticos: sus contratos (nombre, tipo MIME, tamaño en píxeles, peso, campos del manifest) se
  fijan en §3 y se escriben primero como tests rojos (vitest, pytest y e2e).

## 1. Cumplimiento constitucional
| Artículo | Cómo lo respeta este plan |
|---|---|
| Art. 1–2 (patrón) | Sin lógica de negocio. En el cliente, la presentación vive en componentes (`brand/BrandLogo.tsx`) y CSS; la única lógica (qué color de `theme-color` corresponde al tema resuelto) se suma a `theme/useTheme.ts`, que ya es el dueño de aplicar el tema. En el servidor no hay código nuevo: `spa.py` (0007) ya sirve los archivos raíz del build con su MIME (verificado, §5.4). |
| Art. 1 (dependencias nuevas) | Ninguna de ejecución ni en `frontend/package.json`. Herramientas de generación **aisladas** en `frontend/scripts/brand/` (P-6): `svgo` 4.0.0 y `playwright-core` 1.56.0 en su propio `package.json` + `package-lock.json`, y `Pillow==12.3.0` en su `requirements.txt`. No entran al bundle ni a la imagen Docker. |
| Art. 3 (testing) | TDD por zona (§5). Lo que depende del render (silueta, máscara, *maskable*, `forced-colors`, carga fallida, capturas) se mide en **Chromium real** (contenedor Playwright), no en jsdom. HTTP de los archivos raíz con `TestClient` sobre el build real. |
| Art. 5 (seguridad) | Los SVG son propios y se sirven como imagen (`<span>` con `background-image`, `<link rel=icon>`), nunca inline ni como documento: un SVG como imagen no ejecuta scripts. Aun así, un test exige que ningún SVG publicado tenga `<script>`, `<foreignObject>`, atributos `on*` ni referencias externas (`href` a `http`/`//`/`data:` ajenos). El manifest no declara `start_url`/`scope`/`display`: no hay instalación (D-11). Sin secretos ni datos de usuario. |
| Art. 6 (contratos/errores) | Sin API nueva ni Problem Details nuevos: un archivo inexistente sigue siendo el `404` de 0007 RF-004. |
| Art. 10 (raíz) | La carga fallida del logo (RF-020) se resuelve por construcción (una imagen de fondo que no carga no pinta nada), no con un `onError` que oculte el `<img>` roto (P-2). `theme-color` se actualiza en la **misma función** que aplica `data-theme` (incluido el oyente de "sistema" que hoy lo escribe aparte), no con un segundo efecto que intente seguirle. |
| Art. 11 (docs) | §8. |
| Art. 12 | Sin artefactos nuevos del arnés. Las paletas viven una vez (`frontend/scripts/brand/palettes.json`) y las leen el script de generación y los tests. |

## 2. Arquitectura de la feature (por-capas con puertos)

### 2.1 Núcleo
- Sin cambios. La feature no tiene reglas de dominio.

### 2.2 Coordinación (cliente)
| Módulo | Cambio | RF |
|---|---|---|
| `theme/useTheme.ts` (0002/0009) | Nuevo `THEME_COLOR: Record<"light" \| "dark", string> = { dark: "#1a1a24", light: "#f8fafc" }` (el `--bg-secondary` de cada tema) y `applyResolvedTheme(resolved)`, que escribe `data-theme` en `<html>` **y** el `content` de `<meta name="theme-color">`. La usan el efecto de `mode` y el oyente de `prefers-color-scheme` del modo "sistema" (hoy cada uno hace su `setAttribute`). | RF-016 |
| `index.html` (0002/0009) | `<meta name="theme-color" content="#1a1a24">` estático + el script previo al pintado lo fija al tema resuelto con la misma tabla (duplicado a propósito, como `DEFAULT_THEME_MODE`: el script corre antes de cargar el JS; un test vigila que coincidan, P-10). `<link>`s de iconos y manifest (§2.4). | RF-001…RF-004, RF-016 |

### 2.3 Componentes de interfaz (zona frontend — bloque de maquetación)
**a) `brand/BrandLogo.tsx` + `brand/brand.css` (nuevos).**
- `BrandLogo()` devuelve `<span className="brand-logo" aria-hidden="true" />`. Sin props: el
  tamaño lo pone el contexto con `--brand-logo-size`.
- `brand.css`:
  - `.brand-logo`: `display: inline-block; inline-size/block-size: var(--brand-logo-size, 28px);
    flex-shrink: 0; background: url("/logo-synapse-dark.svg") center / contain no-repeat;`
  - `:root[data-theme="light"] .brand-logo { background-image: url("/logo-synapse-light.svg"); }`
    — el tema lo decide `data-theme`, que ya fija el script previo al pintado y `useTheme`; el
    logo no necesita estado de React (P-2).
  - `@media (forced-colors: active) { .brand-logo { forced-color-adjust: none; background: CanvasText;
    mask: url("/logo-synapse-dark.svg") center / contain no-repeat; } }` — silueta monocroma en
    el color de texto del sistema (D-13, RF-019). La máscara usa la silueta (las dos variantes
    tienen la misma); si no carga, la capa de máscara es transparente y no se pinta nada (RF-020).
  - Las URL absolutas de `public/` no las reescribe Vite: llegan tal cual a `dist/` y las sirve
    `spa.py`.
- Tamaños (P-8): cabecera **28 px** (silueta 28×24,9; RF-009 24–32, RF-011 100 % del lado mayor);
  login **32 px** (el `.logo-mark` de `1.1.4.3 - Vista - Login` mide 32).

**b) Cabecera (`layout/AppLayout.tsx`, `layout/AppLayout.css`, 0002/0009).**
- `<div className="app-brand"><BrandLogo />Synapse</div>`: logo y luego texto (D-5), mismo
  `gap: 10px`, mismo `<div>` sin rol ni enlace (D-6). Se borra `.app-brand-mark` (TSX y CSS).
- `.app-brand { --brand-logo-size: 28px; }`.

**c) Login (`auth/LoginPage.tsx`, `auth/AuthShell.css`, 0002).**
- `<div className="auth-logo"><BrandLogo /><div className="auth-logo-text">Synapse</div></div>`.
  Se borra `.auth-logo-mark` (TSX y CSS). `.auth-logo { --brand-logo-size: 32px; }`.

### 2.4 Fronteras de salida (archivos estáticos del build)
| Frontera | Para qué | Implementación concreta |
|---|---|---|
| `GET /logo-synapse-dark.svg`, `/logo-synapse-light.svg` | logo de cabecera y login | ya en `public/` (6b64875); `image/svg+xml` |
| `GET /favicon.svg` | favicon moderno (RF-001, RF-007) | **un** SVG con ambas paletas: por defecto la clara; `@media (prefers-color-scheme: dark)` cambia `stop-color` a `favicon-dark` (P-3, R-2) |
| `GET /favicon.ico` | respaldo y petición implícita (RF-002, D-12) | ICO con entradas PNG de 16, 32 y 48 px (paleta neutra N, P-4) |
| `GET /apple-touch-icon.png` | iOS (RF-003) | 180×180 opaco: fondo `#12121a` (D-10), paleta oscura, logo al 72 % del lado (P-9). En la raíz porque iOS también lo pide sin declarar |
| `GET /icons/icon-192.png`, `/icons/icon-512.png` | manifest `purpose: "any"` (RF-004) | transparentes, paleta N, silueta a lo ancho del lienzo |
| `GET /icons/icon-maskable-512.png` | manifest `purpose: "maskable"` (RF-004, RF-006) | opaco `#12121a`, paleta oscura, logo al 72 % (radio máximo de la silueta ≈ 185 px ≤ 204,8) |
| `GET /manifest.webmanifest` | iconos y colores (RF-004, RF-005, D-11) | JSON de §3; `application/manifest+json` |
| `<head>` de `index.html` | declaraciones | ver abajo |

```html
<meta name="theme-color" content="#1a1a24" />
<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/manifest.webmanifest" />
```
`sizes="32x32"` en el ICO evita que Chromium lo prefiera al SVG (con `sizes="any"` lo elige).

### 2.5 Generación reproducible de los assets (`frontend/scripts/brand/`, nuevo)
Se ejecuta a mano cuando cambia el logo; los resultados se versionan. Sin binarios ausentes:
usa la imagen `mcr.microsoft.com/playwright:v1.56.0-jammy` (ya la usa `test:visual`) y Python
con Pillow.

| Archivo | Qué hace |
|---|---|
| `source/logo-synapse.original.svg` | el original de Carlos, versionado (P-7) |
| `palettes.json` | las paletas `dark`, `light`, `favicon-dark` (R-2) y `neutral` (4 paradas cada una): **un canon** que leen el generador y los tests |
| `build_logo.py` | movido desde `reference/build/` y ampliado: además de `dark`/`light`, emite `favicon` (ambas paletas, por clase de `<stop>` y `@media`) y `neutral` (sólo para rasterizar). Lee `palettes.json` |
| `svgo.config.mjs` | movido desde `reference/build/`; `floatPrecision: 1`, `preset-default` |
| `rasterize.mjs` | en el contenedor Playwright (`playwright-core` 1.56.0): pinta cada SVG en Chromium a su tamaño exacto (16/32/48 transparentes; 180 y 512 *maskable* sobre `#12121a` al 72 %; 192/512 *any* transparentes) y guarda PNG sin pérdida en un directorio temporal |
| `pack_icons.py` | Pillow: cuantiza a paleta de 256 colores con alfa (`FASTOCTREE`, sin *dithering*, determinista) los 180/192/512, escribe `favicon.ico` con las tres entradas PNG exactas (`append_images`, no reescaladas) y deja todo en `public/` |
| `build.sh` | orquesta: `build_logo.py` → `svgo` → `rasterize.mjs` (Docker) → `pack_icons.py`; comprueba versiones (svgo, Pillow) y falla con mensaje claro si no coinciden |
| `package.json`, `package-lock.json`, `requirements.txt` | dependencias de la herramienta, fijadas (P-6) |

`reference/build/` se retira (un canon); `reference/*.png` se quedan como referencia visual.
Reproducibilidad: correr `build.sh` sobre la rama debe dejar `git diff --stat frontend/public`
**vacío** para los dos SVG ya entregados (prueba de que el generador movido es el mismo).

## 3. Modelo de datos
Sin datos persistidos. Contrato de los archivos (lo fijan los tests de §5):

- **Manifest** (`public/manifest.webmanifest`):
  ```json
  { "name": "Synapse", "short_name": "Synapse",
    "icons": [
      { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
      { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
      { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
    ],
    "theme_color": "#12121a", "background_color": "#12121a" }
  ```
  Sin `start_url`, `scope` ni `display` (D-11: no instalable; `display` por defecto es `browser`).
- **Paleta N** (rasters transparentes, P-4): delantera `#0899b9` → `#0891b2`, trasera `#0891b2` →
  `#0b809f` (tonos 190,8–192,6°).

## 4. Contratos
| Archivo en `contracts/` | Frontera | Gate(s) de CI |
|---|---|---|
| — | ninguna API nueva (spec §3) | — |

Los contratos de §3 los fijan tests, no archivos de esquema: un JSON Schema para un manifest de
6 campos sería un artefacto sin consumidor (Art. 12).

## 5. Estrategia de pruebas (por zona del patrón)

### 5.1 Tabla por zona
| Zona | Qué se prueba | Herramienta / archivo |
|---|---|---|
| componentes (jsdom) | `BrandLogo` decorativo; bloque de marca: orden logo→texto, texto exacto «Synapse», una vez, sin enlace ni `tabindex`, sin `.app-brand-mark`; login igual sin `.auth-logo-mark` | vitest: `brand/BrandLogo.test.tsx`, `layout/AppLayout.test.tsx`, `auth/LoginPage.test.tsx` |
| estilos (texto CSS) | `brand.css` usa la variante oscura por defecto y la clara bajo `[data-theme="light"]`; regla `forced-colors` con `CanvasText` + máscara; tamaños 28/32 dentro de 24–32 | vitest: `brand/brandCss.test.ts` (lee el CSS, patrón de `layoutCss.test.ts`) |
| assets (archivos) | RF-001…RF-007, RF-013, RF-014, RNF-001 y seguridad de los SVG (§5.2) | vitest: `brand/brandAssets.test.ts` (lee `public/`, `palettes.json`, `tokens.css`, `index.html` con `node:fs`) |
| coordinación | `applyResolvedTheme` escribe `data-theme` y `theme-color`; al cambiar con `ThemeToggle` y al cambiar el SO en modo "sistema"; `THEME_COLOR` = `--bg-secondary` de `tokens.css`; el script de `index.html` usa los mismos valores | vitest: `theme/useTheme.test.tsx` |
| frontera HTTP | `200` y `Content-Type` de cada archivo raíz y de `/icons/*` sobre el build real; `/manifest.webmanifest` → `application/manifest+json` | pytest: `backend/tests/test_brand_assets.py` (`TestClient`, mismo patrón que `test_spa.py`) |
| sistema (Chromium real) | medidas, render, máscara, `forced-colors`, carga fallida, cambio de tema, capturas (§5.3) | Playwright: `e2e/brand-header.spec.ts`, `e2e/brand-assets.spec.ts` |
| no regresión | suites de 0002 y 0009: vitest completo y `test:visual` completo (V-1…V-10) en verde | `npm test`, `npm run test:visual` |

Anotación: cada test lleva su `RF-` en el nombre o en un comentario (Art. 9).

### 5.2 `brandAssets.test.ts` (vitest, sin navegador)
- **Colores** (RF-013): extrae todo `stop-color`/`fill` hexadecimal de cada SVG publicado y de
  `palettes.json`; cada uno con tono HSL en [180°, 200°]; ninguno de `#001430`, `#0f3ab5`,
  `#2643d4`; al menos un `<linearGradient>` con ≥ 2 paradas distintas.
- **Contraste** (RF-014, RF-007): con `test-utils/wcag.ts` (luminancia relativa WCAG 2.x):
  variante oscura vs `--bg-secondary` oscuro y clara vs claro, leyendo los fondos de
  `tokens.css`; `favicon.svg`: paradas por defecto vs `#ffffff` y paradas de la regla
  `@media (prefers-color-scheme: dark)` vs `#202124` (la regla debe existir tras svgo, R-4);
  paleta N vs `#ffffff` y `#202124`; paleta oscura vs `#12121a` (fondo de 180 y *maskable*).
- **Peso** (RNF-001): `zlib.gzipSync(buf, { level: 9 })` y tamaño en bruto (§5.5).
- **PNG/ICO** (RF-002…RF-004, RF-006): dimensiones por cabecera `IHDR`; 180 y *maskable* sin
  canal alfa ni `tRNS` (opacos); directorio del ICO con 16, 32 y 48 y carga útil PNG.
- **Manifest** (RF-004): JSON de §3 exacto; cada `src` existe en `public/`.
- **`index.html`** (RF-001…RF-004, RF-016): los cinco elementos de §2.4.
- **Seguridad** (Art. 5): sin `<script`, `<foreignObject`, ` on…=`, `href`/`xlink:href` externos.
- **Ids** (riesgo de inserción inline): documentado; el logo no se inserta inline (P-2).

### 5.3 E2E en Chromium real (`brand*.spec.ts`)
Reutilizan `e2e/fixtures.ts` **sin modificarlo** (sesión sembrada, `THEMES`, `SIZES`, `MOBILE`,
`OUT_DIR`). Capturas y `measurements.json` en `VISUAL_OUT_DIR=/tmp/s11/e2e`.

| Id | Prueba | RF |
|---|---|---|
| B-0 | **Línea base antes del cambio** (se corre sobre el HEAD previo a tocar `AppLayout`): alto de `.app-header` a 390/1024/1440 en ambos temas → `/tmp/s11/ref/header-baseline.json`; los valores se congelan como constantes en `brand-header.spec.ts` | RF-010 |
| B-1 | cabecera a 390/1024/1440 × oscuro/claro: logo a la izquierda del texto, caja cuadrada 28 px, centro vertical del logo vs del texto (`Range` del nodo de texto) ≤ 1 px, alto 70 ± 1 (1024/1440) y línea base ± 1 (390), `scrollWidth ≤ clientWidth`; capturas `header-{tema}-{ancho}.png` (recorte de cabecera y pantalla completa) | RF-008…RF-010, RNF-002 |
| B-2 | silueta: píxeles del recorte del logo distintos del fondo de la cabecera; caja envolvente ≥ 90 % de 28 px | RF-011 |
| B-3 | color en uso: la URL del `background-image` computado en cada tema; se descarga, se leen sus paradas y se comparan con el `background-color` **computado** de `.app-header` (≥ 3:1) | RF-014 |
| B-4 | cambio de tema sin recarga: marca `window.__noReload`, clic en `ThemeToggle`, la URL del fondo y `meta[name=theme-color]` pasan al otro tema, el logo vuelve a estar pintado ≤ 500 ms (P-12), la marca sigue | RF-016 |
| B-5 | `theme-color` al cargar = `--bg-secondary` del tema resuelto (oscuro sin preferencia; claro con `synapse-theme=light`; "sistema" con `colorScheme` emulado) | RF-016 |
| B-6 | `emulateMedia({ forcedColors: "active" })`: el logo se pinta monocromo; contraste entre su píxel y el `Canvas` ≥ 3:1; «Synapse» visible; captura | RF-019 |
| B-7 | `page.route("**/logo-synapse-*.svg", r => r.abort())`: «Synapse» visible, caja 28×28 conservada, alto de cabecera igual que B-1, la caja tiene el color del fondo (sin marco gris de imagen rota) y no hay texto alternativo; captura | RF-020 |
| B-8 | login a 390 y 1440 × oscuro/claro: logo 32 px antes de «Synapse», decorativo, contraste como B-3 contra `.auth-card`; capturas `login-{tema}-{ancho}.png` | RF-017, RNF-002 |
| B-9 | una sola marca por pantalla privada (`/vaults`, `/vaults/:id`, `/vaults/trash`, ajustes) | RF-018 |
| A-1 | máscara RF-015: cada SVG publicado (dos variantes, `favicon.svg` en ambos esquemas) y el original con su `viewBox` sustituido por el recorte, pintados a 256 px en `<canvas>`; máscara **alfa > 0** (P-1); diferencia ≤ 1 % | RF-015 |
| A-2 | *maskable* y 180: `getImageData` del PNG servido; todos los píxeles opacos; píxeles distintos de `#12121a` a ≤ 0,4·lado del centro | RF-003, RF-006 |
| A-3 | pestaña simulada (P-13): `favicon.svg` a 16 px y 32 px (DPR 2) sobre `#ffffff` con `colorScheme: "light"` y sobre `#202124` con `"dark"`; el color pintado cambia de paleta; capturas `tab-{esquema}.png` | RF-007, RNF-002 |
| A-4 | `request.get` de cada archivo de §2.4 contra el backend real: `200` y tipo MIME | RF-001…RF-005 |

Servicios para e2e y pytest (P-14): **nunca** :15984 ni :8010 (los usa 0010 en paralelo).
CouchDB propio `synapse-0011-couchdb` (`couchdb:3`) en `127.0.0.1:15985` con `_users` y
`_replicator` creadas; backend del worktree en `VISUAL_PORT=8011`. Sin cambios en `visual.sh`:
ya lee `VISUAL_PORT`, `COUCHDB_URL` y `VISUAL_OUT_DIR`. El contenedor se para y borra por
nombre al terminar (`docker rm -f synapse-0011-couchdb`), nunca con `pkill`.

### 5.4 Evidencia medida para este plan (2026-10-27)
| Medida | Resultado | Consecuencia |
|---|---|---|
| Máscara del SVG optimizado vs original a 256 px (coordinador) | alfa ≥ 128: exacta 0,966 %, optimizada 1,053 %; alfa > 0: exacta 0,027 %, optimizada 0,174 % | P-1 |
| `<img alt="" src=roto>` de 28×28 en Chromium | pinta un marco gris `#c0c0c0` de 28×28 (108 px de perímetro) | P-2: `<img>` incumpliría RF-020 sin parche |
| SVG con `@media (prefers-color-scheme)` como imagen en Chromium | sigue al esquema emulado y cambia en vivo sin recargar | P-3 y A-3 son medibles |
| `emulateMedia({ forcedColors: "active" })` | Chromium aplica de verdad la paleta forzada (fondo → `Canvas`, `CanvasText` negro) y respeta `forced-color-adjust: none` + máscara | B-6 es medible |
| `mimetypes.guess_type` en `python:3.11-slim` (imagen de producción) | `.webmanifest` → `application/manifest+json`; `.ico` → `image/vnd.microsoft.icon`; `.svg`/`.png` correctos | RF-005 sin tocar `spa.py` |
| PNG sin pérdida (Chromium, paleta oscura) | *any* 512: 79,8 KB; *any* 192: 20,3 KB; *maskable* 512: 41,7 KB; 180: 12,4 KB | 512 y 192 superan RNF-001 → P-5 |
| PNG cuantizado a 256 colores (Pillow `FASTOCTREE`) | 512: 13,5 KB; 192: 5,1 KB; *maskable*: 8,5 KB; 180: 3,7 KB; error p99 (premultiplicado) ≤ 9/255, medio ≤ 1,2/255 | P-5 |
| ICO 16/32/48 con entradas PNG exactas | 6 194 B | RNF-001 ✓ |
| *Maskable* con el logo al 62 % | radio máximo de la silueta 159,5 px (0,503 × ancho del logo) | P-9: 72 % → ≈ 185 px ≤ 204,8 |
| Contrastes (WCAG 2.x) | paleta oscura vs `#202124`: 8,91 / 4,37 / 4,37 / **3,005**; clara vs `#ffffff`: 3,68 / 5,36 / 7,27 / 9,11; oscura vs `#ffffff`: `#22d3ee` 1,81 ✗; clara vs `#202124`: `#164e63` 1,77 ✗; N vs `#ffffff` ≥ 3,35, vs `#202124` ≥ 3,53, vs `#f8fafc` ≥ 3,20, vs `#1a1a24` ≥ 3,78; oscura vs `#12121a`: 10,31 / 5,06 / 5,06 / 3,48 | P-3, P-4, R-2 |

### 5.5 Presupuestos RNF-001 (medibles)
Medidos sobre `frontend/public/` (Vite lo copia tal cual a `dist/`; un test compara ambos tras
`npm run build`). `gzip -9` ≡ `zlib.gzipSync(…, { level: 9 })` (± 20 B de cabecera).

| Archivo | Tope | Hoy / estimado |
|---|---|---|
| `logo-synapse-dark.svg`, `logo-synapse-light.svg` | ≤ 10 KB gzip y ≤ 30 KB en bruto, cada uno | 3 370 B / 7 360 B ✓ |
| `favicon.svg` | ≤ 10 KB gzip y ≤ 30 KB en bruto | ≈ 3,5 KB / ≈ 7,7 KB (misma geometría + 4 paradas y una regla `@media`) |
| `favicon.ico` | ≤ 15 KB | ≈ 6,2 KB |
| `apple-touch-icon.png` | ≤ 15 KB | ≈ 3,7 KB |
| `icons/icon-192.png` | ≤ 15 KB | ≈ 5,1 KB |
| `icons/icon-512.png`, `icons/icon-maskable-512.png` | ≤ 50 KB cada uno | ≈ 13,5 KB / ≈ 8,5 KB |
| conjunto de iconos + manifest (`favicon.*`, `apple-touch-icon.png`, `icons/*`, `manifest.webmanifest`) | ≤ 150 KB en bruto | ≈ 45 KB |

## 6. Secuenciación de archivos (tests antes que código; frontend primero)
0. **Preparación.** `npm ci` en `frontend/` del worktree (no tiene `node_modules`); CouchDB propio
   :15985 (P-14); **notas de re-anclaje al inicio** en 0009 y 0007 (`strict`, P-11), si no el
   gate da error por *drift*; **B-0** (línea base de la cabecera) sobre el HEAD sin tocar.
1. **A · Maquetación del logo** (con los dos SVG ya existentes).
   1. `brand/BrandLogo.test.tsx`, `brand/brandCss.test.ts` (rojos) → `BrandLogo.tsx`, `brand.css`.
   2. `layout/AppLayout.test.tsx` (marca: orden, texto, sin `.app-brand-mark`) → `AppLayout.tsx/.css`.
   3. `auth/LoginPage.test.tsx` (ídem) → `LoginPage.tsx`, `AuthShell.css`.
   4. `e2e/brand-header.spec.ts` B-1…B-3, B-6…B-9 + capturas → **revisión visual temprana con
      Carlos** (method.md v1.9): el desvío se corrige aquí, antes de la tubería de assets.
2. **B · Tubería de assets.**
   1. Versionar el original y mover `build_logo.py`/`svgo.config.mjs` (P-7); `palettes.json`;
      `build.sh` reproduce los dos SVG **sin diff**.
   2. `test-utils/wcag.ts`; `brand/brandAssets.test.ts` (rojo: faltan favicon, ICO, PNG, manifest).
   3. `build_logo.py` (favicon + N) → `rasterize.mjs` → `pack_icons.py` → archivos de `public/`.
   4. `manifest.webmanifest` y los `<link>` de `index.html` → `brandAssets.test.ts` verde.
   5. `e2e/brand-assets.spec.ts` A-1…A-3 + capturas de la pestaña simulada.
3. **C · Cableado funcional: `theme-color`.**
   1. `theme/useTheme.test.tsx` (rojo: meta al cargar, al alternar, en "sistema"; tabla = tokens;
      script = tabla) → `useTheme.ts` (`THEME_COLOR`, `applyResolvedTheme`) + script de `index.html`.
   2. B-4, B-5 en `brand-header.spec.ts`.
4. **D · Frontera HTTP.** `backend/tests/test_brand_assets.py` (con `COUCHDB_URL` :15985) y A-4.
   Sin código de backend (si fallara RF-005, la raíz es `spa.py` y entra por P-n nueva, no por parche).
5. **E · Verificación de sistema y no regresión.** `npm test`, `npm run typecheck`, pytest
   completo con CouchDB propio, `test:visual` completo (V-1…V-10 de 0009 + `brand*`), capturas
   lado a lado con `reference/logo-original.png` y `tokens.css` para Carlos (RNF-002).
6. **F · Documentación** (§8) y notas de re-anclaje de cierre.

## 7. Decisiones para el GATE 2 y seguimiento de complejidad
| Decisión | Justificación | Recomendación |
|---|---|---|
| **P-1 · Umbral de la máscara de RF-015: alfa > 0** | RF-015 no fija el umbral. Con alfa ≥ 128 hasta la geometría **exacta** sin optimizar difiere 0,966 % (y la optimizada 1,053 %, fuera de tope): en el original se apilan 2–3 capas antialiaseadas sobre el mismo borde, lo que sube el alfa del borde; es efecto del apilado, no un cambio de forma. Con alfa > 0 la máscara es la unión de las formas, insensible al apilado: exacta 0,027 %, optimizada 0,174 % (holgura ×5,7). Sigue detectando lo que importa: una forma que falta o sobra cambia miles de píxeles a 256 px. **Alternativas:** alfa ≥ 128 con tope 1,5 % (mide el apilado y deja menos margen); comparar alfa continuo (mismo problema). | Enmendar el texto de RF-015 a "máscaras de opacidad **alfa > 0**", con esta evidencia. |
| **P-2 · Logo como `<span aria-hidden>` con `background-image` por `[data-theme]`** (no `<img>`) | (1) RF-020: un `<img alt="">` roto de 28×28 pinta un marco gris en Chromium (medido); arreglarlo exige `onError` + estado, un parche alrededor del síntoma. Una imagen de fondo que no carga no pinta nada. (2) RF-016: el tema lo decide `data-theme`, que también escribe el oyente de "sistema" fuera de React; con CSS el logo lo sigue sin estado nuevo. (3) RF-012: decorativo por construcción. (4) Los ids internos `a/b/c` no colisionan (nunca inline). **Alternativa:** `<img>` con `src` según el tema resuelto y `onError` que lo oculte. | Aceptar el `<span>` con CSS. |
| **P-3 · Favicon SVG único con `@media (prefers-color-scheme: dark)`** | En la pestaña no existe el tema de la app: el navegador pinta la barra según el esquema del SO/navegador, que es justo lo que ve `prefers-color-scheme` dentro del SVG. Ninguna de las dos paletas pasa RF-007 en ambos fondos (oscura vs `#ffffff`: 1,81; clara vs `#202124`: 1,77), y cada una pasa en el suyo. Por defecto la clara (navegadores sin la consulta: barras claras mayoritarias). Chromium la evalúa en vivo (medido). **Alternativas:** (B) una sola paleta N en el favicon (pasa ambos fondos, menos profundidad entre capas); (C) dos `<link rel=icon media=…>` (Firefox lo ignora). | Aceptar la opción con `@media`. |
| **P-4 · Paleta N para los rasters transparentes** (`favicon.ico`, `icon-192`, `icon-512` *any*) y paleta oscura para los opacos (180, *maskable*, sobre `#12121a`) | Un raster transparente no puede cambiar de paleta y el fondo donde se pinta es desconocido (pestaña clara u oscura, lanzador). N (`#0899b9→#0891b2` / `#0891b2→#0b809f`, luminancia 0,18–0,26) pasa ≥ 3:1 contra `#ffffff`, `#202124`, `#f8fafc` y `#1a1a24`; conserva la parada `#0891b2`. Los opacos tienen fondo fijo `#12121a` (D-10): la paleta oscura da 3,48–10,31. **Alternativa:** *any* opacos sobre `#12121a` (deja de ser "any" transparente; pesa más sin cuantizar). | Aceptar N para transparentes; oscura para opacos. |
| **P-5 · Rasterizado en Chromium + cuantización a 256 colores** | Sin `rsvg`/`inkscape`/`cairosvg` en la máquina; Chromium del contenedor Playwright ya es parte de las pruebas y pinta el SVG igual que el navegador. Sin pérdida, *any* 512 pesa 79,8 KB y 192 pesa 20,3 KB: incumplen RNF-001 (50/15 KB). Cuantizados: 13,5 / 5,1 KB con error p99 ≤ 9/255 (invisible a esos tamaños; capturas para Carlos). El ICO no se cuantiza (6,2 KB sin pérdida). **Alternativa:** relajar RNF-001 (enmienda de spec) y servir PNG sin pérdida. | Aceptar la cuantización. |
| **P-6 · Herramientas aisladas en `frontend/scripts/brand/`** (`package.json` propio con `svgo` 4.0.0 y `playwright-core` 1.56.0; `requirements.txt` con `Pillow==12.3.0`) | Son herramientas de generación, no de la app ni de las pruebas de la app; aisladas no engordan el `npm ci` diario ni chocan con `frontend/package.json`, que 0010 modifica en paralelo. Versiones fijadas con *lockfile*. **Alternativas:** `svgo` como `devDependency` de `frontend/` (conflicto con 0010); `npx svgo@4.0.0` (sin integridad fijada). | Aceptar. |
| **P-7 · Versionar el original** en `frontend/scripts/brand/source/logo-synapse.original.svg` (125 KB) | Hoy sólo existe en `.harness/assets/` del checkout principal, **sin seguimiento y con permisos 600**: si se pierde, el logo deja de ser reproducible y RF-015 deja de ser verificable. Dentro de `frontend/` lo ve el contenedor de `test:visual` (monta sólo `frontend/`). Se retira `reference/build/` (un canon). | Aceptar. |
| **P-8 · Logo de 28 px en cabecera y 32 px en login** | Cabecera: el cuadrado actual es de 26 px y la silueta no es cuadrada (1205×1073): a 28 px ocupa 28×24,9, peso visual parecido al cuadrado lleno de 26. Login: 32 px, el `.logo-mark` del mockup `1.1.4.3`. Si B-1 muestra que 28 px cambia el alto o el ajuste de línea a 390 px (RF-010), se baja a 26. | Aceptar 28/32. |
| **P-9 · Composición de los opacos: logo al 72 % del lado, centrado** (180 y *maskable* 512) | Radio máximo de la silueta = 0,503 × ancho del logo → al 72 % ≈ 185 px de 204,8 (zona segura de RF-006) con ≈ 20 px de margen. Misma composición para 180 (iOS redondea las esquinas). | Aceptar. |
| **P-10 · `theme-color` con tabla constante duplicada en el script de `index.html`** | El script corre antes de cargar el CSS (Vite lo inyecta con el JS), así que no puede leer `--bg-secondary`. Es el mismo patrón que `DEFAULT_THEME_MODE`: dos copias vigiladas por un test que además las compara con `tokens.css`. **Alternativa:** `<meta theme-color media=…>` (sigue al SO, no al `ThemeToggle`; descartada en D-10). | Aceptar. |
| **P-11 · Tocar archivos de features cerradas** | `index.html`, `theme/useTheme.ts(+test)`, `layout/AppLayout.css`, `e2e/**` (0009, `strict`); `frontend/README.md` (0007, `strict`); `layout/**`, `auth/**` (0002, `advisory`). Ningún RF de esas specs cambia; nota de re-anclaje **al inicio** en 0009 y 0007 y en todas al cierre (procedimiento de PLAN-0008 P-2). Los tests de 0002/0009 no nombran `.app-brand-mark` (comprobado), así que RF-018 no exige cambiar ninguna aserción existente. | Aceptar. |
| **P-12 · La variante del otro tema se descarga al primer cambio** (sin `preload`) | 3,4 KB gzip servidos en local; un `preload` de la variante no usada genera el aviso "preloaded but not used" de Chromium. B-4 exige que el logo esté pintado ≤ 500 ms tras el cambio. Si las capturas muestran parpadeo, la corrección es pintar ambas variantes en dos pseudo-elementos y alternar su opacidad (sin JS). | Aceptar. |
| **P-13 · Captura de la pestaña simulada** (RNF-002) | Chromium sin interfaz no tiene barra de pestañas: no hay captura real de la pestaña sin un navegador con ventana bajo Xvfb. A-3 pinta `favicon.svg` a 16/32 px sobre `#ffffff` y `#202124` con el esquema emulado, que es exactamente lo que evalúa RF-007. **Alternativa:** Chromium con ventana bajo Xvfb y captura de pantalla (más frágil). | Aceptar la simulación y declararla en las capturas. |
| **P-14 · Servicios propios para las pruebas** | 0010 usa CouchDB :15984 y backend :8010 en paralelo; en 0009 dos contaminaciones de :15984 obligaron a repetir suites. CouchDB `synapse-0011-couchdb` en :15985 y backend en :8011 para `test:visual` **y** para pytest (`COUCHDB_URL`). | Aceptar. |
| Complejidad · helper WCAG duplicado | `test-utils/wcag.ts` es nuevo; `notes/accentContrast.test.ts` (0009) conserva su copia local porque 0010 modifica `notes/*.test.ts` en paralelo. **Backlog explícito** (Art. 10): migrar `accentContrast.test.ts` a `wcag.ts` tras fusionar 0010. | — |
| Configuración compartida | `vite.config.ts` y `playwright.config.ts` no cambian (`publicDir` por defecto; `testMatch` ya incluye `brand*.spec.ts`). | — |

### Riesgos
- **R-1 · Favicon y cambio de esquema en vivo.** Algunos Chromium no repintan el favicon hasta
  recargar cuando cambia el esquema del SO. RF-007 se cumple en cada esquema; el retraso es del
  navegador. Aceptado.
- **R-2 · Margen mínimo en el favicon oscuro — resuelto en el GATE 2.** `#0e7490` vs `#202124`
  daba 3,005:1. La regla oscura del favicon usa una paleta propia `favicon-dark` en
  `palettes.json`: delantera `#22d3ee` → `#0891b2`, trasera `#0891b2` → **`#0b809f`** (3,53).
  La paleta `dark` de la cabecera, los PNG opacos y los dos SVG de 6b64875 no cambian.
- **R-3 · Bandas por cuantización** en el 512 *any*: error medido bajo, pero se valida con las
  capturas, no sólo con números.
- **R-4 · svgo y la regla `@media`.** `preset-default` (`minifyStyles`/`inlineStyles`) podría
  alterar la regla del favicon; `brandAssets.test.ts` exige que sobreviva.
- **R-5 · RF-010 a 390 px.** 28 px podría cambiar el ajuste de línea de la cabecera; B-0 fija la
  línea base antes y P-8 deja la salida a 26 px.
- **R-6 · Conflictos con 0010 en paralelo.** Ambos tocan `frontend/README.md`,
  `frontend/src/README.md` y `frontend/e2e/` (0011 sólo añade archivos nuevos y no modifica
  `fixtures.ts`). 0011 evita `frontend/package.json` (P-6). Conflictos de texto esperables en
  los README al fusionar.
- **R-7 · *Drift strict*.** Sin las notas de re-anclaje al inicio (P-11) el gate cierra en 0009/0007.
- **R-8 · ICO con entradas PNG.** No lo leen IE ≤ 10 ni Windows XP; fuera de soporte.
- **R-9 · Imagen de Docker.** La tubería y las e2e dependen de `playwright:v1.56.0-jammy` (presente)
  y de Pillow 12.3.0 (presente en el anfitrión, en el `site` de usuario); `build.sh` comprueba
  versiones.
- **R-10 · El original sin versionar** puede perderse antes de que se apruebe P-7.

## 8. Impacto en documentación (Art. 11)
> El mapa de la Constitución Art. 11 sigue con marcadores de plantilla; el efectivo es el de
> `AGENTS.md` más los README por capa (como en PLAN-0009 §8).

| Documento del mapa | Qué cambia | Acción |
|---|---|---|
| `frontend/README.md` | sección "Identidad de marca": archivos de `public/` (logo, favicon, ICO, PNG, manifest), cómo regenerarlos (`scripts/brand/build.sh`, requisitos: Docker + imagen Playwright 1.56.0, `npm ci --prefix scripts/brand`, `pip install -r scripts/brand/requirements.txt`) y las `brand*.spec.ts` en `test:visual` con `VISUAL_PORT`/`COUCHDB_URL` propios | actualizar |
| `frontend/src/README.md` | `brand/` (`BrandLogo`, variante por `data-theme`, `forced-colors`), `theme-color` en `useTheme` (`applyResolvedTheme`, `THEME_COLOR`) | actualizar |
| `backend/README.md` | describe que `spa.py` sirve los archivos raíz del build; no enumera archivos ni MIME → **sin cambio** (verificar con `grep -n favicon`) | ninguna |
| `ARCHIFY.md` y `diagrams/` | sin flujo ni componente arquitectónico nuevo | ninguna |
| `0009`, `0007` `spec.md` | nota de re-anclaje al inicio y al cierre (P-11); `0002` al cierre | actualizar |
| `.harness/memory/state.md` | estado de 0011 | actualizar en el cierre |

## 9. Implementación por requisito
### Implementación de RF-001
- `public/favicon.svg` (generado por `scripts/brand/build_logo.py` + svgo); `<link rel="icon" type="image/svg+xml">` en `index.html`.
- Tests: `brand/brandAssets.test.ts` (declaración, MIME por extensión), `backend/tests/test_brand_assets.py` (`200`, `image/svg+xml`), `e2e/brand-assets.spec.ts` A-4.

### Implementación de RF-002
- `public/favicon.ico` (16/32/48, PNG, paleta N; `scripts/brand/rasterize.mjs` + `pack_icons.py`); `<link rel="icon" href="/favicon.ico" sizes="32x32">`.
- Tests: `brandAssets.test.ts` (directorio del ICO), `test_brand_assets.py` (`200`), A-4.

### Implementación de RF-003
- `public/apple-touch-icon.png` 180×180 opaco sobre `#12121a` (P-9); `<link rel="apple-touch-icon">`.
- Tests: `brandAssets.test.ts` (`IHDR`, sin alfa/`tRNS`), A-2 (todos los píxeles opacos), `test_brand_assets.py`.

### Implementación de RF-004
- `public/manifest.webmanifest` (§3), `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`; `<link rel="manifest">`.
- Tests: `brandAssets.test.ts` (JSON exacto, cada `src` existe, dimensiones), `test_brand_assets.py` (`200` de cada `src`), A-4.

### Implementación de RF-005
- Sin código: `spa.py` usa `FileResponse`, que toma el tipo de `mimetypes` (`application/manifest+json` en Python 3.11, medido).
- Tests: `test_brand_assets.py` (`Content-Type` exacto), A-4 contra uvicorn real.

### Implementación de RF-006
- Composición al 72 % en `rasterize.mjs` (P-9).
- Tests: A-2 (radio máximo ≤ 0,4·512 y opacidad total), `brandAssets.test.ts` (sin alfa).

### Implementación de RF-007
- Paletas `light` (por defecto) y `dark` (`@media`) de `palettes.json` en `favicon.svg` (P-3).
- Tests: `brandAssets.test.ts` (paradas por defecto vs `#ffffff`, de la regla oscura vs `#202124`), A-3.

### Implementación de RF-008
- `layout/AppLayout.tsx` (`<BrandLogo />` + «Synapse» en `.app-brand`), `AppLayout.css` (sin `.app-brand-mark`).
- Tests: `layout/AppLayout.test.tsx` (orden, sin `.app-brand-mark`), B-1.

### Implementación de RF-009
- `.app-brand { --brand-logo-size: 28px }`, `brand/brand.css` (caja cuadrada, `contain`), `align-items: center` existente.
- Tests: `brand/brandCss.test.ts` (24 ≤ tamaño ≤ 32), B-1 (caja y centrado ≤ 1 px).

### Implementación de RF-010
- Sin cambio de `padding` ni de alto de `.app-header`.
- Tests: B-0 (línea base), B-1 (70 ± 1 a 1024/1440; línea base ± 1 a 390; sin scroll horizontal).

### Implementación de RF-011
- `viewBox` recortado de los SVG (6b64875) + `background-size: contain`.
- Tests: B-2 (≥ 90 % de la caja a 28 px), A-1 (silueta 256×228 a 256 px).

### Implementación de RF-012
- `BrandLogo` con `aria-hidden="true"`; `.app-brand` sigue siendo un `<div>` sin enlace ni `tabindex`.
- Tests: `BrandLogo.test.tsx`, `AppLayout.test.tsx` (texto exacto «Synapse», ningún `a`/`button`/`[tabindex]` dentro, el lector encuentra «Synapse» una vez).

### Implementación de RF-013
- `scripts/brand/palettes.json` (todas las paradas 188–196°), `build_logo.py` (descarta los rellenos navy/azul del original).
- Tests: `brandAssets.test.ts` (tono de cada color de cada SVG y de `palettes.json`; sin `#001430`/`#0f3ab5`/`#2643d4`; ≥ 1 degradado de ≥ 2 paradas).

### Implementación de RF-014
- Variante por tema en `brand/brand.css` (P-2) con las paletas del encabezado.
- Tests: `brandAssets.test.ts` (paradas vs `--bg-secondary` de `tokens.css`), B-3 (contra el fondo computado de `.app-header`), B-8 (login).

### Implementación de RF-015
- Geometría intacta por `build_logo.py` (sólo cambia el relleno); original versionado (P-7).
- Tests: A-1 (alfa > 0, ≤ 1 %, P-1) para las dos variantes y `favicon.svg` en ambos esquemas.

### Implementación de RF-016
- `brand/brand.css` (`[data-theme="light"]`), `theme/useTheme.ts` (`THEME_COLOR`, `applyResolvedTheme`), `index.html` (meta + script).
- Tests: `theme/useTheme.test.tsx` (meta al cargar, al alternar y en "sistema"; tabla = `tokens.css`; script = tabla), B-4, B-5.

### Implementación de RF-017
- `auth/LoginPage.tsx` (`<BrandLogo />` + «Synapse»), `auth/AuthShell.css` (`--brand-logo-size: 32px`; sin `.auth-logo-mark`).
- Tests: `auth/LoginPage.test.tsx` (decorativo, texto, sin `.auth-logo-mark`), B-8.

### Implementación de RF-018
- Un único `BrandLogo` en `AppLayout`; las páginas privadas no lo repiten.
- Tests: B-9; no regresión `npm test` y `test:visual` completos (sin cambiar aserciones de 0002/0009, P-11).

### Implementación de RF-019
- Regla `@media (forced-colors: active)` de `brand/brand.css` (`CanvasText` + máscara, `forced-color-adjust: none`).
- Tests: `brandCss.test.ts` (la regla existe), B-6.

### Implementación de RF-020
- Por construcción (P-2): imagen de fondo y máscara que no cargan no pintan nada; la caja tiene tamaño fijo.
- Tests: B-7.

### Implementación de RNF-001
- `pack_icons.py` (cuantización, P-5), svgo (`floatPrecision: 1`).
- Tests: `brandAssets.test.ts` (topes de §5.5 sobre `public/` y comparación con `dist/` tras el build).

### Implementación de RNF-002
- `e2e/brand-header.spec.ts` (B-1, B-6, B-7, B-8) y `e2e/brand-assets.spec.ts` (A-3): capturas en `/tmp/s11/e2e` con `measurements.json` (RF-009/RF-010/RF-014); comparación con `reference/logo-original.png` (forma) y `tokens.css` (color). Las aprueba Carlos.
