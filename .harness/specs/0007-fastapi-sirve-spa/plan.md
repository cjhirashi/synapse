---
id: PLAN-0007
tipo: plan
feature: 0007-fastapi-sirve-spa
estado: implemented
aprobaciones:
  fase_2: { por: "Carlos (vía AIRA, revisión intermedia saltada)", fecha: 2026-10-17 }
actualizado: 2026-10-17
---

# PLAN-0007 · FastAPI sirve la SPA

> Traduce cada `RF-` al patrón hexagonal del proyecto (Constitución Art. 1–2). Servir la
> SPA es una **frontera de entrada HTTP** (capa de rutas/`main`): no toca el núcleo de
> negocio ni los puertos de salida.

> **Re-anchor (2026-10-17):** añade RF-007 (404 vs 405 para métodos no-GET) y el error de
> dominio `SpaResourceNotFound` que saca `HTTPException` de `spa.py` (RF-008 de SPEC-0004).
> Ver `spec.md` §3/§4/§6 (D-7, D-8) para la justificación completa del mecanismo.

## 0. Gates de simplicidad
- [x] Simplicity — un módulo (`spa.py`) + un instalador en `main.py`; sin capas nuevas.
- [x] Anti-Abstraction — sin abstracción especulativa; reusa `StaticFiles`/`FileResponse`.
- [x] Integration-First — la API y su contrato no cambian; las rutas de SPA quedan fuera del OpenAPI.

## 1. Cumplimiento constitucional
| Artículo | Cómo lo respeta este plan |
|---|---|
| Art. 1–2 (hexagonal) | La SPA es una frontera HTTP de entrada en la capa de rutas; núcleo y puertos intactos |
| Art. 5 (seguridad) | Resolvedor de archivos acotado a `frontend/dist` (sin path traversal); la API conserva su auth y su aislamiento por `user_id` (P2/P3) sin cambios |
| Art. 10 (raíz) | nginx y su Dockerfile se **retiran**, no se dejan muertos; sin parches |
| Art. 11 (docs) | §8 abajo |

## 2. Arquitectura de la feature  *(hexagonal)*
### Núcleo de negocio
- Sin cambios. Servir estáticos no es lógica de dominio.
- `app/core/errors.py` — nueva entrada del catálogo (no es lógica de dominio de negocio,
  pero vive aquí porque **todo** error con `slug` propio vive en el catálogo único, RF-008):
  `SpaResourceNotFound` (slug `spa-resource-not-found`, status 404, detail `"Resource not
  found"`). Sustituye los 3 `raise HTTPException(404)` de `spa.py` (RF-004, RF-005) y es lo
  que construye el 404 reclasificado de RF-007 (ver abajo).
### Coordinación (fronteras de entrada)
- `app/spa.py` — lógica pura de enrutado de la SPA. **`spa.py` deja de importar
  `starlette.exceptions.HTTPException`** (RF-008): sus 3 ramas de 404 (RF-004, RF-005) pasan
  a `raise SpaResourceNotFound()` (`app.core.errors`).
  - `prefers_html(accept)` → bool (RF-003/D-4).
  - `VaultsSpaNegotiation` (middleware) → negociación `/vaults` (RF-003).
  - `install_spa(app)` → monta `/assets` (`StaticFiles`) y el catch-all `GET /{full_path:path}`
    (RF-001, RF-002, RF-004, RF-005, RF-006). El catch-all se registra con
    `name=app.core.problems.CATCH_ALL_ROUTE_NAME` (RF-007/D-7): un nombre de ruta reservado
    y neutral que `core/problems.py` usa para identificarlo sin que `spa.py` conozca nada de
    `HTTPException` ni `core/problems.py` conozca nada de "la SPA". El catch-all **se queda
    sólo en `GET`/`HEAD`** (no se amplía a todos los métodos: ver D-7 en `spec.md` — ampliar
    rompería el `405` legítimo de rutas reales de un solo método, p. ej. `/health`).
- `app/core/problems.py` — además del traductor existente, `_framework_error` gana una
  **reclasificación 405→404** (RF-007/D-7): si `exc.status_code == 405` y, excluyendo la
  ruta nombrada `CATCH_ALL_ROUTE_NAME`, **ninguna** ruta real de `request.app.router.routes`
  da `Match.FULL` ni `Match.PARTIAL` contra `request.scope`, el 405 se reemplaza por un
  `SpaResourceNotFound()` (vía `_domain_error`, no un `HTTPException(404)` a mano — así el
  cuerpo sale con el `type` del catálogo, no `about:blank`). Si alguna ruta real da match
  (p. ej. `/health` para un `POST`), el 405 original se respeta intacto, con su `Allow`.
  **Orden de los handlers**: `install_problem_handlers` sigue registrando `DomainError` y
  `HTTPException` en el mismo `main.py` sin cambiar su orden de instalación — la
  reclasificación vive *dentro* de `_framework_error` (se ejecuta antes de construir la
  respuesta del 405), no como un handler nuevo compitiendo por la excepción.
- `app/main.py` — invoca `install_spa(app)` **después** de incluir los routers de API (para
  que las rutas de API ganen al catch-all). Sin cambios en el orden de
  `install_problem_handlers`.
### Fronteras de salida
| Frontera | Para qué | Implementación concreta |
|---|---|---|
| Sistema de archivos del build | leer `frontend/dist` | `pathlib` + `FileResponse`/`StaticFiles`; raíz vía env `FRONTEND_DIST` (default `frontend/dist`) |

## 3. Modelo de datos
- Sin modelo de datos ni migraciones.

## 4. Contratos
| Archivo en `contracts/` | Frontera | Gate(s) de CI |
|---|---|---|
| — | ninguna | Ninguno: las rutas de SPA van con `include_in_schema=False`; el contrato de la API no cambia (sin `oasdiff`/Spectral nuevos) |

> **Re-anchor:** `SpaResourceNotFound` es una entrada nueva del catálogo de `core/errors.py`,
> pero **no** se publica en `contracts/openapi.yaml` porque las únicas rutas que la lanzan
> (`spa.py`) tienen `include_in_schema=False`. Sin cambio de contrato publicado; sí cambia el
> `type` URI del body de esos 404 concretos (`spec.md` §3, declarado explícito, no es parche
> silencioso).

## 5. Estrategia de pruebas (por zona del patrón)
| Zona | Qué se prueba | Herramienta |
|---|---|---|
| coordinación (`spa.py`) | `prefers_html`, ramas del catch-all, negociación `/vaults` | pytest (`tests/test_spa.py`) |
| frontera (app real) | servido real contra `frontend/dist`, 404 reales, Problem en rutas de API desconocidas | pytest + `TestClient` (fixture `client`, con `ContractGuard`) |
| frontend | se retiran los tests que cubrían el nginx retirado (no existen: nginx no tenía tests JS) | — |
| núcleo (`core/errors.py`, `core/problems.py`) *(re-anchor)* | `SpaResourceNotFound` en el catálogo (slug/status/type); reclasificación 405→404 sólo cuando ninguna ruta real da match; 405 legítimo intacto en caso contrario | pytest (`tests/test_spa.py`, `tests/test_problem_catalog.py`) |
| guardia arquitectónico *(re-anchor)* | `spa.py` no importa/usa `starlette.exceptions.HTTPException` (AST, ya existente) | pytest (`tests/test_problem_catalog.py::test_only_the_problem_translator_imports_http_exception`) — debe volver a pasar, hoy en rojo |
| regresión inter-spec *(re-anchor)* | `POST /auth/register` (retirado por SPEC-0002 RF-001) → `404`, no `405` | pytest (`tests/test_auth.py::test_rf_001_public_register_endpoint_no_longer_exists`) — hoy en rojo |

- La suite backend corre contra el `dist` real del repo (ya presente). `ContractGuard` no
  marca las respuestas HTML porque sus rutas están fuera del esquema.
- **Caso nuevo (RF-007), test-first:** `POST`/`PUT`/`DELETE` a una ruta totalmente desconocida
  (sin build de SPA relevante) → `404` `application/problem+json`, nunca `405` ni HTML; y
  simétricamente, `POST /health` (ruta real de un solo método) → sigue en `405` con
  `Allow: GET`. Ambos casos en el mismo test para que uno no se arregle rompiendo el otro
  (la sutileza que motivó este re-anchor).

## 6. Secuenciación de archivos
- Orden: **tests antes que código**. `tests/test_spa.py` → `app/spa.py` → ajuste de `app/main.py`
  → retiro de nginx (`frontend/Dockerfile`, `frontend/nginx.conf`) → `backend/Dockerfile`
  multi-stage + `.dockerignore` raíz → `docker-compose.yml`/`docker-compose.dev.yml` → docs.
- **Re-anchor, orden test-first de la corrección:** `tests/test_spa.py` (caso 404-vs-405 +
  `/health` sigue en 405) y `tests/test_auth.py`/`tests/test_problem_catalog.py` (deben
  volver a verde, ya existen, no se tocan sus aserciones) → `app/core/errors.py`
  (`SpaResourceNotFound`) → `app/core/problems.py` (`CATCH_ALL_ROUTE_NAME` +
  reclasificación) → `app/spa.py` (usa ambos, retira el import de `HTTPException`).

## 7. Seguimiento de complejidad
| Excepción a la simplicidad | Justificación |
|---|---|
| Contexto de build del backend = raíz del repo | El Dockerfile debe leer `frontend/` y `backend/` (D-5); un `.dockerignore` raíz acota el contexto |

## 8. Impacto en documentación  (obligatorio — Art. 11)
| Documento del mapa | Qué cambia | Acción |
|---|---|---|
| `frontend/README.md` | describe el nginx retirado y el puerto 3000 | reescribir: FastAPI sirve la SPA; dev sigue con Vite |
| `backend/README.md` | no menciona que el backend sirve el frontend | añadir sección «Sirve la SPA» (estáticos, `/vaults`, catch-all, `FRONTEND_DIST`, Dockerfile multi-stage, puerto 8000) |

> No hay `docs/` de producto todavía; `docs/API.md` no aplica (la API no cambia).

> **Re-anchor:** esta corrección **no** toca documentación del mapa. No cambia superficie
> pública observable (endpoints, CLI, env, puertos, esquema publicado): el cuerpo del 404
> cambia de `type`, pero ocurre en rutas `include_in_schema=False`, no documentadas en
> `README.md` ni en el contrato. Declarado explícito (Art. 11): sin tarea `[doc]` nueva.

## 9. Implementación por requisito
### Implementación de RF-001
- `install_spa`: `app.mount("/assets", StaticFiles(directory=dist/"assets"))`. Test: asset
  existente del build → 200.
### Implementación de RF-002
- Catch-all `serve_spa`: ruta sin extensión y sin archivo → `FileResponse(index.html)`.
  Test: ruta desconocida (con y sin `Accept: text/html`) → 200 HTML con `<div id="root">`.
### Implementación de RF-003
- `VaultsSpaNegotiation` + `prefers_html`. Test: `GET /vaults` y `GET /vaults/<id>` con
  `Accept: text/html` → 200 HTML; con `Accept: application/json` (sin sesión) → 401 Problem.
### Implementación de RF-004
- `serve_spa`: ruta con extensión y sin archivo → `raise SpaResourceNotFound()` (→ Problem,
  vía `_domain_error`; ya no `HTTPException`, RF-008). `/assets` inexistente → 404 nativo de
  `StaticFiles` (sin cambio: `StaticFiles` no pasa por `spa.py`). Test: `/assets/no-existe.js`
  y `/x.css` → 404, no HTML.
### Implementación de RF-005
- `serve_spa`: si `full_path` cae bajo un prefijo de API → `raise SpaResourceNotFound()`
  (Problem, vía `_domain_error`). Test: `GET /auth/no-existe` y `GET /admin/no-existe` con
  `Accept: text/html` → 404 `application/problem+json` con
  `type: urn:synapse:problem:spa-resource-not-found`; `GET /auth/me` sin sesión con
  `text/html` → 401 Problem (sin cambio, no pasa por `spa.py`).
### Implementación de RF-006
- `install_spa`: si `DIST_DIR` no existe → `return` temprano (API pura). Test unitario:
  `install_spa` sobre un `FastAPI` nuevo con `DIST_DIR` inexistente no monta nada ni lanza.
### Implementación de RF-007 *(re-anchor)*
- `app/core/problems.py`: constante `CATCH_ALL_ROUTE_NAME` (nombre de ruta reservado) +
  reclasificación dentro de `_framework_error` (ver §2). `app/spa.py`: el catch-all se
  registra con `name=CATCH_ALL_ROUTE_NAME`, sigue sólo `GET`/`HEAD`.
  Tests:
  - `POST /auth/register` (ruta retirada por SPEC-0002) → `404`, no `405` —
    `tests/test_auth.py::test_rf_001_public_register_endpoint_no_longer_exists` (ya existe,
    hoy en rojo; vuelve a verde sin tocar su aserción).
  - `POST`/`PUT`/`DELETE` a una ruta inventada cualquiera (`tests/test_spa.py`, nuevo) → `404`
    `application/problem+json`, nunca HTML.
  - `POST /health` (ruta real de un solo método, fuera de los prefijos de la SPA) → sigue en
    `405` con `Allow: GET` (nuevo, mismo test o uno hermano — **la sutileza crítica**: no
    basta con que el primer caso pase, hay que probar que este NO se rompió).
  - `tests/test_problem_catalog.py::test_only_the_problem_translator_imports_http_exception`
    (ya existe, hoy en rojo por `spa.py`) vuelve a verde sin tocar su aserción, por el cambio
    de RF-004/005 a `SpaResourceNotFound`.
