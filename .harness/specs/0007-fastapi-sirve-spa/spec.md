---
id: SPEC-0007
tipo: spec
feature: 0007-fastapi-sirve-spa
estado: implemented      # draft | in-review | approved | implemented | verified | deprecated
# --- anclaje (fusionado; ver method.md §9) ---

> **Re-anclaje 2026-10-23** (T-092 de TASKS-0008): SPEC-0008 actualizó `backend/README.md` y
> `frontend/README.md` (secciones de notas, sync y pruebas) y corrigió `test_spa.py` (elige el
> asset JS explícitamente; la aserción dejó de depender del orden alfabético). Sin cambio de
> requisitos.
anchor_commit: 0e6c5e5   # re-anclaje por SPEC-0008 (T-092 de TASKS-0008)
anchor_mode: strict      # advisory | strict  (pasa a strict en implemented/verified)
covers:                  # globs de archivos que ESTA feature posee: código, tests y doc
  - backend/app/spa.py
  - backend/app/main.py
  - backend/app/core/errors.py
  - backend/app/core/problems.py
  - backend/tests/test_spa.py
  - backend/tests/test_problem_catalog.py
  - backend/tests/test_auth.py
  - backend/Dockerfile
  - .dockerignore
  - docker-compose.yml
  - docker-compose.dev.yml
  - frontend/Dockerfile
  - frontend/nginx.conf
  - frontend/README.md
  - backend/README.md
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: { por: "Carlos (vía AIRA, elicitación/revisión intermedia saltada por decisión del usuario)", fecha: 2026-10-17 }
  fase_2: { por: "Carlos (vía AIRA, revisión intermedia saltada por decisión del usuario)", fecha: 2026-10-17 }
actualizado: 2026-10-17
---

# SPEC-0007 · FastAPI sirve la SPA

> **Re-anclaje 2026-10-23** (T-004 de TASKS-0009): SPEC-0009 actualiza `frontend/README.md` y
> `backend/README.md` (pruebas visuales en navegador real y campo `icon` de bóveda). Sin
> cambio de requisitos.

> **Re-anclaje 2026-10-23 (cierre)** (T-063 de TASKS-0009): SPEC-0009 actualizó `backend/README.md`
> y `frontend/README.md` (`Vault.icon`, `test:visual` con Playwright en contenedor). Sin cambio de
> requisitos.

> Elicitación/revisión intermedia **saltada por decisión explícita del usuario** (Carlos,
> vía AIRA): el alcance mínimo está cerrado abajo. Se mantiene el resto del método (spec →
> plan → tasks → TDD → gate). Cierra como `implemented`, **no** `verified` (sin ronda
> adversarial formal).

> **Re-anchor (2026-10-17):** el cierre sin revisor dejó pasar una regresión. La suite
> completa del backend (789 tests) encontró 2 fallos reales originados en `spa.py`: (1) un
> `POST`/método no-GET a una ruta **desconocida** recibía `405` en vez de `404` (rompe RF-001
> de SPEC-0002, que exige `404` para `/auth/register`, retirado); (2) `spa.py` importaba y
> lanzaba `starlette.exceptions.HTTPException`, violando el guardia RF-008 de SPEC-0004 (sólo
> `core/problems.py` conoce `HTTPException`). Este re-anchor añade **RF-007** (el hueco que
> permitió el fallo 1: la tabla de aceptación original sólo hablaba de `GET`) y corrige
> §3/§5 con el error de dominio nuevo que reemplaza los usos de `HTTPException` en `spa.py`.
> Las filas nuevas de la tabla de cobertura de `tasks.md` quedan `Pendiente`: las verificará
> el revisor, que también re-verificará RF-001…RF-006 fila por fila (no se autoaprueban).

## 1. Contexto del dominio
- **Problema:** el frontend se sirve hoy con un contenedor nginx (`frontend/Dockerfile` +
  `frontend/nginx.conf`) que replica el proxy de Vite; mantener dos piezas que enrutan lo
  mismo (nginx en prod, Vite en dev) es duplicación y una fuente de deriva. Se unifica:
  **FastAPI** sirve los estáticos del build (`frontend/dist`) y el enrutado de la SPA.
- **Límites:** el reverse proxy de producción es un **Caddy externo al repo** (ver
  `state.md`); esta feature no lo toca. La API (`/auth`, `/admin`, `/sync`, `/vaults`,
  `/health`) y su contrato (SPEC-0002/0003/0004/0005) **no cambian**.

## 2. Alcance
### En alcance
- FastAPI monta los estáticos del build de `frontend/dist` (`StaticFiles`) y reemplaza al
  nginx del frontend.
- Réplica de la tabla de rutas del `nginx.conf` retirado: assets directos, negociación por
  `Accept` en `/vaults`, y fallback `index.html` para las rutas de React Router (el
  `try_files $uri /index.html` de hoy).
- Retiro de `frontend/Dockerfile` (nginx) y `frontend/nginx.conf`.
- Backend servido con un `Dockerfile` multi-stage que compila el frontend (Node) y copia
  `frontend/dist` a la imagen del backend; `docker-compose.yml` sin el servicio `frontend`,
  el backend sirve todo en su puerto actual (8000).
- `frontend/README.md` y `backend/README.md` sincronizados.

### Fuera de alcance
- Configuración del Caddy externo (vive fuera del repo; queda como aviso al usuario en
  `state.md`, acción de infraestructura suya).
- Cambios en los endpoints, contratos o cuerpos de la API (ningún `RF-` toca la API).
- El flujo de desarrollo local con Vite (`npm run dev`, proxy de `vite.config.ts`): sigue
  vigente para hot-reload; no se sustituye.
- Compresión, cache-busting avanzado, cabeceras de seguridad (CSP, HSTS): competen al Caddy
  externo.

## 3. Modelo de datos y contratos de E/S  ← INVENTARIO DE FRONTERAS
| Frontera | Dirección | Tipo | Contrato en `contracts/` |
|---|---|---|---|
| `GET /assets/*` (estáticos del build) | salida | HTTP estático | — (no es API; `include_in_schema=False`) |
| `GET /{ruta-SPA}` (React Router) | salida | HTTP `text/html` | — (sirve `index.html`) |
| `GET /vaults`, `/vaults/*` (navegación) | entrada | content-negotiation | — (reusa la API de SPEC-0003) |

- **Sin esquemas nuevos ni cambios en `contracts/`.** La API conserva su contrato; las rutas
  nuevas que sirven la SPA están **fuera del OpenAPI** (`include_in_schema=False`), por lo que
  no alteran el contrato ni disparan `oasdiff`/Spectral.
- **Sobre de error:** las rutas de API siguen devolviendo **RFC 9457** (SPEC-0004) sin cambio.
- **Corrección de raíz (re-anchor):** `spa.py` dejaba de cumplir RF-008 de SPEC-0004 (sólo
  `core/problems.py` conoce `HTTPException`) al lanzar `starlette.exceptions.HTTPException`
  en sus 3 ramas de 404. Se sustituye por un **error de dominio nuevo**,
  `SpaResourceNotFound` (`core/errors.py`, slug `spa-resource-not-found`, status 404),
  catálogo análogo a `SyncEndpointNotFound` (SPEC-0005): un solo cuerpo para "esta petición
  no corresponde a ningún recurso que la SPA o la API sirvan", sea un archivo del build
  inexistente (RF-004), una subruta de API desconocida (RF-005) o una ruta/método
  completamente fuera de la app (RF-007, reclasificado desde el 405 nativo de Starlette).
  - **Cambio observable, declarado explícito:** el cuerpo de estos 404 cambia su `type` de
    `about:blank` (genérico de `_framework_error`) a `urn:synapse:problem:spa-resource-not-found`
    (catálogo de `core/errors.py`, vía `_domain_error`). Las rutas de SPA siguen fuera del
    OpenAPI (`include_in_schema=False`): el contrato publicado (`contracts/openapi.yaml`) **no
    cambia**, sin disparo de `oasdiff`/Spectral. Es, no obstante, un comportamiento publicable
    distinto del que había: cualquier cliente que inspeccionara el `type` de estos 404
    concretos (no documentados en el contrato) vería el nuevo valor. Se considera aceptable:
    mejora la coherencia del catálogo (RF-008) y el valor anterior (`about:blank`) nunca fue
    parte de un contrato documentado.

## 4. Criterios de aceptación (EARS)

- **RF-001** — CUANDO se solicita (`GET`) un asset del build existente bajo `/assets/`, el
  sistema DEBE servir ese archivo directamente desde `frontend/dist/assets`.
- **RF-002** — CUANDO se solicita (`GET`) una ruta de navegación que no corresponde a un
  archivo del build ni a una ruta de API conocida y no tiene extensión de archivo, el
  sistema DEBE responder `200` con el `index.html` de la SPA.
- **RF-003** — MIENTRAS la ruta es `/vaults` o `/vaults/<sub>`, CUANDO llega un `GET`/`HEAD`
  cuyo `Accept` incluye `text/html` (navegación del navegador), el sistema DEBE servir
  `index.html`; SI el `Accept` no incluye `text/html` (un `fetch`) ENTONCES el sistema DEBE
  enrutar la petición al handler de API real de `/vaults`.
- **RF-004** — SI se solicita un archivo concreto (ruta con extensión, p. ej. `/x.js`,
  `/assets/no-existe.js`) que no existe en el build ENTONCES el sistema DEBE responder un
  `404` real, **nunca** el `index.html`.
- **RF-005** — SI se solicita una ruta bajo un prefijo de API conocido (`/auth`, `/admin`,
  `/sync`, `/vaults`, `/health`) que ninguna operación atiende ENTONCES el sistema DEBE
  responder un `404` **Problem** (`application/problem+json`, SPEC-0004), nunca HTML —
  incluso si el `Accept` incluye `text/html`.
- **RF-006** — DONDE el build del frontend (`frontend/dist`) no está presente, el sistema
  DEBE arrancar igualmente como API pura (sin montar la SPA), sin fallar el arranque.
- **RF-007** — SI se solicita, con cualquier método HTTP distinto de `GET`/`HEAD`, una ruta
  que no corresponde a ninguna operación de API conocida ni a un archivo del build ENTONCES
  el sistema DEBE responder un `404` **Problem**, nunca un `405` ni HTML — el catch-all de
  la SPA (sólo `GET`/`HEAD`) no debe hacerse pasar por destinatario de métodos que no sirve.
  *(Añadido en el re-anchor: cierra el hueco que RF-001…RF-006, centrados en `GET`, dejaban
  abierto y que rompía el contrato `404` de SPEC-0002 RF-001 para `/auth/register`.)*

## 5. Casos límite y manejo de errores
- **Ruta de API existente con `Accept: text/html` que NO es `/vaults`** (p. ej. `GET
  /auth/me` sin sesión): devuelve su `Problem` JSON normal (401), no HTML — cubierto por el
  principio de RF-005 (sólo `/vaults` negocia por `Accept`).
- **Asset inexistente** (`/assets/no-existe.js`): `404` real (RF-004).
- **Ruta de SPA profunda** (`/vaults/<id>` con `Accept: text/html`): `index.html` (RF-003),
  para que el deep-link de React Router cargue.
- **Path traversal** (`GET /../etc/passwd`): el resolvedor de archivos sólo sirve rutas
  dentro de `frontend/dist`; fuera de ahí no sirve (cae a `index.html` o `404` según RF-002/004).
- **Ambigüedad `GET /vaults` sólo para navegaciones:** la negociación se limita a
  `GET`/`HEAD`; un `POST /vaults` (crear bóveda) nunca se desvía a HTML aunque traiga
  `Accept: text/html` (ver decisión D-3).
- **Método no-GET a ruta desconocida** (p. ej. `POST /auth/register`, retirado por
  SPEC-0002 RF-001; o `POST /lo-que-sea`): `404` Problem, nunca `405` (RF-007). El catch-all
  de la SPA sólo registra `GET`/`HEAD`; Starlette resolvería ese caso como `405` (partial
  match del catch-all) de no mediar la reclasificación de D-7.
- **Método no permitido en ruta de API CONOCIDA** (p. ej. `POST /health`, sólo `GET`): sigue
  dando su `405` legítimo con `Allow` correcto — la reclasificación de D-7 **no** se dispara
  porque esa ruta real sí produce un match (RF-007, caso negativo explícito).

## 6. Registro de decisiones y descartes
| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| D-1: `StaticFiles` para `/assets/*` + catch-all para `index.html`/archivos raíz | Idiomático en FastAPI; `StaticFiles` da content-type/etag; el catch-all replica `try_files` | Servir todo con un único catch-all `FileResponse` (menos robusto para assets) | — |
| D-2: Distinguir «archivo concreto» (tiene extensión → 404 si falta) de «ruta de SPA» (sin extensión → `index.html`) | Satisface el RF-004 del usuario (404 real para assets) sin el `index.html` falso que daría `try_files` crudo | `try_files $uri /index.html` literal (devolvería HTML a un `.js` inexistente) | — |
| D-3: La negociación `/vaults` sólo aplica a `GET`/`HEAD` | Una navegación del navegador es siempre `GET`; un `POST` jamás debe recibir HTML. Mejora sobre el `if ($wants_html)` de nginx (que desviaría cualquier método) | Replicar literal el `if` de nginx (desviaría también `POST`) | — |
| D-4: `prefers_html` = `text/html` presente en `Accept` | Réplica fiel del `map $http_accept ~text/html` del `nginx.conf` retirado y del `bypass` de `vite.config.ts` | Negociación por q-value completa (complejidad innecesaria para este caso) | — |
| D-5: `Dockerfile` multi-stage en `backend/`, contexto de build = raíz del repo | El Dockerfile necesita leer `frontend/` y `backend/`; el contexto de `./backend` no alcanza `../frontend` | Script externo que copie `dist/` al contexto del backend (paso manual frágil) | — |
| D-6: El Caddy externo queda como aviso en `state.md`, no se toca | Vive fuera del repo (corrección del usuario: «sin nginx», Caddy externo) | Adivinar/editar su config (fuera de alcance y de control) | — |
| D-7 *(re-anchor)*: catch-all de la SPA se mantiene `GET`/`HEAD` sólo; `core/problems.py::_framework_error` reclasifica un `405` a `404` cuando, quitando la ruta del catch-all (identificada por `name=` reservado), ninguna otra ruta real de la app da match (ni `FULL` ni `PARTIAL`) contra la petición | Verificado empíricamente contra Starlette: ampliar el catch-all a todos los métodos hace que gane `FULL match` sobre cualquier ruta real de un solo método (p. ej. `/health`), **destruyendo** su `405` legítimo — inaceptable. Mantenerlo sólo `GET`/`HEAD` preserva que una ruta real gane el `PARTIAL` primero; el único caso que queda mal es cuando *ninguna* ruta real existe, y ahí el catch-all "roba" el `PARTIAL` que debería ir al `404` nativo (`Router.not_found`) de Starlette. La reclasificación reproduce exactamente esa decisión nativa | (a) Catch-all con todos los métodos (descartada: rompe 405 legítimos, ver arriba); (b) decidir 404 vs 405 dentro del propio endpoint del catch-all (descartada: Starlette resuelve el 405 en `Route.handle()` **antes** de invocar el endpoint — nunca se ejecuta) | — |
| D-8 *(re-anchor)*: nuevo error de dominio `SpaResourceNotFound` (`core/errors.py`) sustituye los 3 usos de `HTTPException(404)` en `spa.py` (RF-004, RF-005) y es el que construye el `404` reclasificado de D-7 | Cumple RF-008 de SPEC-0004 (sólo `core/problems.py` conoce `HTTPException`); sigue el patrón de catálogo de `SyncEndpointNotFound` (un solo error de dominio para "recurso/ruta fuera de lo que esta frontera sirve") | Un `NotFound` genérico sin slug propio (descartada: rompería la convención del catálogo de que cada `DomainError` con `slug` es una entrada propia, RF-008) | — |

## 7. Requisitos no funcionales (RNF)
- Ninguno nuevo medible. El rendimiento del servido estático lo cubre en producción el Caddy
  externo (cache/compresión); FastAPI sólo entrega el origen.

## Marcadores abiertos
- `[NEEDS CLARIFICATION]` = 0.
