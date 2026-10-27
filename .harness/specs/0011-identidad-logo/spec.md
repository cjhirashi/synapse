---
id: SPEC-0011
tipo: spec
feature: 0011-identidad-logo
estado: approved         # draft | in-review | approved | implemented | verified | deprecated
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: 29470e0   # HEAD de feature/0011-identidad-logo al redactar (lo mueve el cierre)
anchor_mode: advisory    # advisory | strict  (pasa a strict en implemented/verified)
covers:                  # fijado en PLAN-0011 §9 (archivos con dueño anterior: PLAN-0011 P-11)
  # frontend — maquetación (bloque A): logo en cabecera y login
  - frontend/src/brand/**
  - frontend/src/layout/AppLayout.tsx
  - frontend/src/layout/AppLayout.css
  - frontend/src/layout/AppLayout.test.tsx
  - frontend/src/auth/LoginPage.tsx
  - frontend/src/auth/LoginPage.test.tsx
  - frontend/src/auth/AuthShell.css
  - frontend/src/test-utils/wcag.ts
  # assets publicados y su generación reproducible (bloque B)
  - frontend/public/**
  - frontend/scripts/brand/**
  - frontend/index.html
  # tema y theme-color (bloque C)
  - frontend/src/theme/useTheme.ts
  - frontend/src/theme/useTheme.test.tsx
  # frontera HTTP de los archivos raíz (bloque D; sin código de backend nuevo)
  - backend/tests/test_brand_assets.py
  # sistema — fidelidad visual en navegador real (RNF-002)
  - frontend/e2e/brand*
  # documentación (PLAN-0011 §8)
  - frontend/README.md
  - frontend/src/README.md
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: { por: "AIRA en nombre de Carlos Jiménez (cjhirashi), autoridad delegada", fecha: 2026-10-27, nota: "RF-017 = sí (login con logo + «Synapse», reglas de RF-012/RF-014); D-5…D-14 aprobadas tal cual; degradado opción B (lineal continuo userSpaceOnUse por capa, sin cortes) — D-15" }
  fase_2: { por: "AIRA en nombre de Carlos Jiménez (cjhirashi), autoridad delegada", fecha: 2026-10-27, nota: "P-1…P-14 aceptados tal cual; ajuste R-2: en el favicon oscuro la capa trasera termina en #0b809f (los SVG de cabecera no cambian)" }
actualizado: 2026-10-27
---

# SPEC-0011 · Identidad de marca: logo oficial de Synapse

> Decisiones de producto D1–D4 tomadas por Carlos (vía AIRA, 2026-10-26); no se
> re-preguntan. **GATE 1 aprobado el 2026-10-27** por AIRA en nombre de Carlos (autoridad
> delegada): RF-017 cerrado con *sí*, D-5…D-14 aprobadas tal cual y degradado "opción B"
> (D-15). El "cómo" (un SVG o dos variantes, inline o `<img>`, herramienta de optimización)
> lo fija PLAN-0011. **GATE 2 aprobado el 2026-10-27** (P-1…P-14 y ajuste R-2).

## 1. Contexto del dominio
- **Problema:** Synapse no tiene identidad visual propia: no hay favicon (el navegador pide
  `/favicon.ico` y recibe `404`, RF-004 de 0007), no hay manifest ni `theme-color`, y la
  cabecera y el login muestran un cuadrado degradado genérico (`.app-brand-mark`,
  `.auth-logo-mark`) en lugar del logo oficial.
- **Fuente del logo:** el original de Carlos (copia en `.harness/assets/logo-synapse.svg` del
  checkout principal, sin versionar; PLAN-0011 P-7 propone versionarlo) (125 KB; `viewBox`
  1500×1500 con la silueta en ≈ x 147–1350, y 214–1285, o sea ≈ 20 % de margen vacío;
  rellenos planos `#0f3ab5`, `#2643d4`, `#00e3f8` y `#001430`, este último casi siempre
  como sombreado al 35 % de opacidad). Mucho de su peso son `clipPath` duplicados.
- **Base de color (D2):** familia cian de `frontend/src/styles/tokens.css`. Valores
  reales del archivo: oscuro `--accent #0891b2` y `--accent-hover #06b6d4`; claro
  `--accent #0891b2` y `--accent-hover #0e7490`. *(El encargo citaba `--accent` #06b6d4
  en oscuro; en `tokens.css` es al revés. Manda el archivo.)*
- **Fondo de referencia para el contraste:** la cabecera (`.app-header`) y la tarjeta del
  login (`.auth-card`) usan `--bg-secondary`: `#1a1a24` oscuro, `#f8fafc` claro.
- **Límites:** frontend estático y `index.html`. FastAPI ya sirve los archivos raíz del
  build (0007); sin API nueva ni cambios en `contracts/`.

## 2. Alcance
### En alcance
- Icono de la app: favicon SVG con respaldo ICO, `apple-touch-icon` 180, manifest con
  iconos 192/512 (`any`) y 512 `maskable`, `theme-color` según el tema activo.
- Logo en la cabecera global de `AppLayout`, a la izquierda, seguido del nombre
  «Synapse», en lugar de `.app-brand-mark`.
- Recoloreado del logo a la familia cian con degradado, con contraste ≥ 3:1 en ambos
  temas y cambio de tema sin recargar.
- Assets versionados en `frontend/public/` con un tope de peso.
- Login: el mismo logo seguido de «Synapse» en la tarjeta de inicio de sesión (RF-017,
  cerrado en el GATE 1).

### Fuera de alcance
- Hacer la app instalable u offline (service worker, `display: standalone`, pantallas de
  bienvenida). El manifest sólo sirve aquí para declarar iconos y colores (ver D-11).
- Imágenes para redes sociales (Open Graph o Twitter Card) y wordmark tipográfico propio:
  el nombre sigue en Inter, como hoy.
- Cambiar los tokens de `tokens.css` o el sistema de diseño 1.1.4.1.
- Convertir el bloque de marca en enlace (hoy no lo es, ver D-6) y animar el logo.
- Cabeceras de caché del favicon: las pone el Caddy externo (0007, "Fuera de alcance").
- Modificar el original de Carlos: se trabaja sobre una copia.

## 3. Modelo de datos y contratos de E/S  ← INVENTARIO DE FRONTERAS
| Frontera | Dirección | Tipo | Contrato en `contracts/` |
|---|---|---|---|
| `GET /favicon.svg`, `/favicon.ico`, `/apple-touch-icon.png`, iconos PNG | salida | HTTP estático (archivo raíz del build) | — (no es API; lo sirve `spa.py`, 0007 RF-002/RF-004) |
| `GET /manifest.webmanifest` | salida | HTTP estático `application/manifest+json` | — |
| `<link rel=icon / apple-touch-icon / manifest>`, `<meta name=theme-color>` en `index.html` | salida | HTML | — |

- **Sin esquemas nuevos ni cambios en `contracts/`.** Nombres de archivo provisionales;
  los fija la Fase 2.
- **Manifest (campos mínimos):** `name` y `short_name` = `"Synapse"`; `icons` con 192 y
  512 `purpose: "any"` y 512 `purpose: "maskable"`; `theme_color` y `background_color`
  según D-10.
- **Contraste de los tokens cian sobre `--bg-secondary`** (WCAG 2.x, luminancia
  relativa). Sirve de evidencia para la Fase 2; no fija la implementación:

| Color | sobre `#1a1a24` (oscuro) | sobre `#f8fafc` (claro) |
|---|---|---|
| `#06b6d4` | 7,11 | **2,32 (falla)** |
| `#0891b2` | 4,69 | 3,52 |
| `#0e7490` | 3,22 | 5,12 |

  Consecuencia: en tema claro `#06b6d4` no puede ser extremo del degradado. Las dos vías
  de D3 son viables: un único degradado `#0e7490 → #0891b2` pasa en ambos temas
  (3,22–5,12, con poco margen en oscuro), y con variantes por tema se puede usar
  `#0891b2 → #06b6d4` en oscuro y `#0e7490 → #0891b2` en claro.

## 4. Criterios de aceptación (EARS)

**Icono de la app**
- **RF-001** — El sistema DEBE servir un favicon SVG (`200`, `image/svg+xml`) con el logo
  recoloreado, y `index.html` DEBE declararlo con `<link rel="icon" type="image/svg+xml">`.
- **RF-002** — El sistema DEBE servir `/favicon.ico` (`200`) con el logo en 16, 32 y
  48 px, y `index.html` DEBE declararlo como respaldo para los navegadores que no
  soportan favicon SVG.
- **RF-003** — El sistema DEBE servir un `apple-touch-icon` PNG de 180×180, opaco y sin
  transparencia, declarado en `index.html` con `<link rel="apple-touch-icon">`.
- **RF-004** — El sistema DEBE servir un manifest declarado en `index.html`
  (`<link rel="manifest">`), con `name` y `short_name` = «Synapse» e iconos PNG de
  192×192 y 512×512 con `purpose: "any"` y de 512×512 con `purpose: "maskable"`, todos
  accesibles (`200`) en la ruta que el manifest declara.
- **RF-005** — CUANDO se solicita el manifest, el sistema DEBE responder con
  `Content-Type: application/manifest+json`.
- **RF-006** — En el icono `maskable`, toda la silueta del logo DEBE caber dentro del
  círculo central de diámetro igual al 80 % del lado (zona segura del formato), sobre un
  fondo opaco.
- **RF-007** — Los extremos del degradado del favicon DEBEN tener contraste ≥ 3:1 contra
  `#ffffff` y contra `#202124` (barra de pestañas clara y oscura de referencia).

**Cabecera**
- **RF-008** — La cabecera de `AppLayout` DEBE mostrar en su borde izquierdo el bloque de
  marca, en este orden de izquierda a derecha: primero el logo y después el texto
  «Synapse». El cuadrado genérico `.app-brand-mark` DEBE desaparecer.
- **RF-009** — El logo de cabecera DEBE ocupar una caja cuadrada de entre 24 y 32 px,
  centrada en vertical con el texto «Synapse».
- **RF-010** — MIENTRAS el viewport es de 1024 o 1440 px de ancho, la cabecera DEBE medir
  70 ± 1 px de alto. MIENTRAS es de 390 px, DEBE medir lo mismo ± 1 px que antes del
  cambio en ese ancho, y el documento NO DEBE hacer scroll horizontal.
- **RF-011** — La silueta del logo DEBE ocupar al menos el 90 % del lado mayor de su caja,
  es decir, sin el margen vacío del `viewBox` original.
- **RF-012** — El logo junto al texto DEBE ser decorativo (`alt=""` o `aria-hidden="true"`)
  y el nombre accesible del bloque de marca DEBE ser exactamente «Synapse». El bloque NO
  DEBE ser un enlace ni un control enfocable, igual que hoy.

**Color y tema**
- **RF-013** — El logo DEBE rellenarse con al menos un degradado de dos o más paradas
  distintas, y cada relleno o parada del asset DEBE tener un tono HSL entre 180° y 200°
  (familia cian; `#0891b2` ≈ 192°, `#06b6d4` ≈ 189°, `#0e7490` ≈ 193°). Los navy y azules
  del original (`#001430` ≈ 215°, `#0f3ab5`, `#2643d4`) NO DEBEN quedar.
- **RF-014** — MIENTRAS el tema activo es claro u oscuro, cada extremo del degradado del
  logo de cabecera DEBE tener contraste ≥ 3:1 contra el `--bg-secondary` de ese tema.
- **RF-015** — La silueta del logo recoloreado DEBE ser la del original. Rasterizados
  ambos a 256 px tras el recorte de RF-011, sus máscaras de opacidad (píxel en la máscara
  si su alfa es **> 0**) DEBEN diferir en ≤ 1 % de los píxeles. *(Enmienda del GATE 2,
  PLAN-0011 P-1: con alfa ≥ 128 el apilado de capas antialiaseadas del original sube el alfa
  del borde y hasta la geometría exacta difiere 0,966 %; con alfa > 0, 0,027 % exacta y
  0,174 % optimizada.)*
- **RF-016** — CUANDO el usuario cambia de tema con `ThemeToggle`, el logo de cabecera y
  el `<meta name="theme-color">` DEBEN pasar a los valores del tema nuevo sin recargar la
  página. Al cargar la página, `theme-color` DEBE valer el `--bg-secondary` del tema
  resuelto (`#1a1a24` oscuro, `#f8fafc` claro).

**Login y no regresión**
- **RF-017** — La página de inicio de sesión DEBE mostrar el mismo logo en lugar de
  `.auth-logo-mark`, seguido del texto «Synapse», con las mismas reglas de RF-012
  (decorativo, nombre accesible «Synapse», sin enlace ni foco) y de RF-014 (cada extremo del
  degradado ≥ 3:1 contra el `--bg-secondary` del tema activo). *(GATE 1, 2026-10-27.)*
- **RF-018** — El bloque de marca DEBE aparecer una sola vez por pantalla privada, sólo
  dentro de la cabecera de `AppLayout`. Las suites de 0002 y 0009 (vitest y
  `test:visual`) DEBEN seguir en verde. Sólo pueden cambiar las aserciones que nombran
  `.app-brand-mark`, y su cambio se justifica en `tasks.md`.

## 5. Casos límite y manejo de errores
- **Navegador sin favicon SVG** (Safari antiguo y otros): usa `/favicon.ico` (RF-002). Si
  el navegador pide `/favicon.ico` aunque no esté declarado, deja de recibir el `404`
  actual de 0007 RF-004.
- **Caché del favicon:** como hoy no existe favicon, no hay icono viejo que invalidar en
  esta entrega (el `404` no se guarda como icono). Si el logo cambia en el futuro, eso
  necesitará nombres versionados o cabeceras del Caddy. Queda fuera de alcance y sin RF.
- **Alto contraste forzado (`forced-colors: active`):** el degradado no tiene por qué
  mantenerse.
  - **RF-019** — MIENTRAS `forced-colors` está activo, el logo de cabecera DEBE seguir
    visible con contraste ≥ 3:1 contra el fondo forzado (`Canvas`), aunque sea monocromo
    (p. ej. `CanvasText`), y el texto «Synapse» DEBE seguir visible.
- **El asset del logo no carga** (404 o red):
  - **RF-020** — SI el logo de cabecera no se puede cargar ENTONCES el texto «Synapse»
    DEBE seguir visible, la cabecera DEBE conservar su alto (RF-010) y NO DEBE aparecer un
    icono de imagen rota ni un texto alternativo visible.
- **Login:** tiene su propia marca (`.auth-logo-mark` 32 px + «Synapse» 18 px en
  `.auth-card`, sobre `--bg-secondary`). Pasa a mostrar el logo oficial (RF-017), así que
  el producto tiene una sola identidad.
- **`ChangePasswordPage`:** no tiene marca (comprobado: `.auth-logo-mark` sólo está en
  `LoginPage.tsx`), así que no se toca.
- **Tema "sistema":** se resuelve a claro u oscuro en `data-theme` (`index.html`,
  `useTheme`). RF-014 y RF-016 se miden sobre el tema resuelto.
- **Teclado y lectores de pantalla:** el logo no añade ninguna parada de tabulación
  (RF-012) y el lector lee «Synapse» una sola vez.

## 6. Registro de decisiones y descartes
| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| D1 *(Carlos)*: el logo oficial es el icono de la app (favicon, manifest 192/512, apple-touch 180, `theme-color`) y el logo de la cabecera de `AppLayout`, con «Synapse» al lado, en lugar de `.app-brand-mark` | Identidad propia en lugar de un marcador genérico | Mantener el cuadrado degradado; usar el logo sólo como favicon | — |
| D2 *(Carlos)*: recolorear a cian con degradado, base `--accent`/`--accent-hover`, ≥ 3:1 contra el fondo de cabecera en ambos temas (WCAG 1.4.11) | Coherencia con el sistema de diseño MD3+Cyan | Conservar los planos navy/azul/cian del original | — |
| D3 *(Carlos)*: un SVG para ambos temas o dos variantes por tema es detalle de implementación (Fase 2); la spec exige el resultado (RF-014, RF-016) | Evitar cerrar el "cómo" en la spec | Fijarlo en la spec | — |
| D4 *(Carlos)*: assets en `frontend/public/`, peso optimizado con tope medible (RNF-001) | `public/` se copia tal cual a la raíz del build y FastAPI lo sirve (0007) | Guardarlos en `.harness/assets/` (no se publica) | — |
| D-5: orden explícito: logo y luego «Synapse», bloque en el borde izquierdo (RF-008) | Interpretación de "a la izquierda" y orden habitual de un lockup de marca; el bloque ya está a la izquierda (`AppLayout.tsx:21`) | Nombre y luego logo | — |
| D-6: el bloque de marca sigue sin ser enlace (RF-012) | Comprobado: hoy es un `<div>` con `<span aria-hidden>`, no un enlace; la regla era "enlace sólo si ya lo era". El inicio (`/vaults`) ya está en la navegación | Convertirlo en enlace a `/vaults` (cambio de comportamiento sin pedir) | — |
| D-7: recortar el `viewBox` a la silueta (RF-011) | El original deja ≈ 20 % de margen: a 26 px el logo se vería como un icono de ≈ 20 px | Usar el `viewBox` 1500×1500 tal cual | — |
| D-8: fidelidad geométrica medida por máscara de opacidad (RF-015) | Con el recoloreado el color cambia pero la forma no debe; la máscara lo hace verificable | Comparación sólo visual a ojo | — |
| D-9: contraste medido contra `--bg-secondary`, que es el fondo real de cabecera y tarjeta de login (RF-014) | Es el color sobre el que se pinta el logo | Medir contra `--bg-primary` (no es el fondo de la cabecera) | — |
| D-10: `theme-color` = `--bg-secondary` del tema resuelto y se actualiza al cambiar el tema (RF-016); en el manifest, `theme_color` y `background_color` = `#12121a` (`--bg-primary` oscuro, tema por defecto de 0009 RF-006a), que es también el fondo opaco de apple-touch y maskable | El chrome del navegador continúa la cabecera. El manifest es estático y sólo admite un valor, así que se usa el del tema por defecto. `#0891b2` sobre `#12121a` = 5,09:1 | `theme-color` con `media="(prefers-color-scheme)"` (sigue al SO, no al `ThemeToggle` de la app); fondo blanco para los PNG | — |
| D-11: manifest sólo para iconos y colores; la app no se vuelve instalable ni offline | Lo pedido es identidad, no PWA; instalar u operar offline tiene consecuencias de producto (sync, sesión) que piden spec propia | `display: standalone` y service worker en esta feature | — |
| D-12: respaldo `/favicon.ico` (16/32/48) en lugar de un PNG suelto | Los navegadores piden `/favicon.ico` por defecto aunque no esté declarado; el ICO cubre los antiguos y elimina el `404` actual | `favicon-32.png` (no atiende la petición implícita a `/favicon.ico`) | — |
| D-13: en `forced-colors` el logo puede quedar monocromo (RF-019) | En modo forzado el sistema impone los colores; lo que importa es que el logo siga perceptible, no el degradado | Ocultar el logo en modo forzado; forzar a mantener el degradado (`forced-color-adjust: none`), que ignora la preferencia del usuario | — |
| D-14: tope de peso ≤ 10 KB gzip para el SVG de cabecera y el favicon SVG (RNF-001) | El logo se pide en cada carga, en el primer pintado de cada pantalla privada. 10 KB gzip es ≈ 8 % del original sin comprimir; un SVG plano de esta complejidad, con precisión de 1–2 decimales y sin los `clipPath` duplicados, cabe con holgura. Medible con `gzip -9 | wc -c` | Sin tope ("optimizado" no es verificable); ≤ 4 KB (obligaría a simplificar la geometría y chocaría con RF-015) | — |
| D-15 *(Carlos, GATE 1)*: degradado "opción B": un degradado lineal continuo (`userSpaceOnUse`, de la esquina superior izquierda a la inferior derecha de la silueta) por capa —capa delantera y capa trasera de tubos—, sin cortes diagonales | Carlos rechazó los bloques planos con bordes abruptos; quiere transición continua. Con un único degradado por capa ninguna forma cambia de color de golpe y la profundidad entre capas se conserva | "Opción A": bloques de color plano por forma, con bordes abruptos entre ellos (`reference/gradiente-opciones-ab.png`) | — |
| D-16 *(Carlos, GATE 1)*: el login lleva el logo oficial seguido de «Synapse» (RF-017) | Es la primera pantalla que ve el usuario y ya tiene un bloque de marca con la misma estructura y el mismo fondo; reutiliza el asset y las reglas | Mantener `.auth-logo-mark` (dos identidades en el producto) | — |

## 7. Requisitos no funcionales (RNF)
- **RNF-001 (peso)** — En el build:
  - SVG del logo de cabecera y favicon SVG: ≤ 10 KB con `gzip -9` y ≤ 30 KB sin comprimir
    cada uno (si son el mismo archivo, se cuenta una vez).
  - `favicon.ico` ≤ 15 KB.
  - `apple-touch-icon` 180 ≤ 15 KB; icono 192 ≤ 15 KB; cada icono 512 ≤ 50 KB.
  - Total del conjunto de iconos y manifest ≤ 150 KB sin comprimir.
- **RNF-002 (fidelidad visual, `method.md §3` Fase 4 v1.9)** — Capturas reales en
  Chromium (no jsdom) de:
  - la cabecera a 390, 1024 y 1440 px, en tema claro y oscuro;
  - la pestaña con el favicon en ambos temas del navegador;
  - el login (RF-017).

  Se comparan con el logo original (forma) y con `tokens.css` (color). Las aprueba Carlos;
  "los tests pasan" no las sustituye. Se guardan en la salida de `test:visual` junto a
  las medidas de RF-009/RF-010/RF-014.

## Marcadores abiertos
Ninguno. El único (`RF-017`, ¿el login lleva el logo?) se cerró con **sí** en el GATE 1
(2026-10-27, AIRA en nombre de Carlos): ver RF-017 y D-16.
