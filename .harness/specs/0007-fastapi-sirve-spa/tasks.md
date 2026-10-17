---
id: TASKS-0007
tipo: tasks
feature: 0007-fastapi-sirve-spa
estado: implemented
actualizado: 2026-10-17
---

# TASKS-0007 · FastAPI sirve la SPA

> **Re-anchor (2026-10-17):** T-016…T-021 son nuevas (corrección de la regresión 405/404 y
> del guardia RF-008; ver `spec.md`/`plan.md`). Quedan `[ ]`: las hará el implementador.
> Ninguna fila nueva de la tabla de cobertura se marca `Pass` todavía — las pone el
> revisor tras correr el gate y la suite. Las filas RF-001…RF-006 (ya `Pass` del cierre sin
> revisor) vuelven a `Pendiente`: el revisor las re-verifica fila por fila, no se heredan.

## Reglas
- Cada tarea: ≤ 30 min, un solo propósito, `(cubre RF-NNN)`, zona del patrón (o `[doc]`).
- Orden por dependencias. **Test antes que código.**

## Tareas
- [x] T-001 — Test de `prefers_html` (incluye/excluye `text/html`) (cubre RF-003) [zona: test]
- [x] T-002 — Test de servido de asset existente bajo `/assets/` (cubre RF-001) [zona: test]
- [x] T-003 — Test de fallback `index.html` para ruta SPA sin extensión, con y sin `Accept` html (cubre RF-002) [zona: test]
- [x] T-004 — Test de negociación `/vaults` y `/vaults/<id>`: html→SPA, json→API (401) (cubre RF-003) [zona: test]
- [x] T-005 — Test de 404 real para archivo con extensión inexistente (`/assets/x.js`, `/x.css`) (cubre RF-004) [zona: test]
- [x] T-006 — Test de 404 Problem para ruta de API desconocida con `Accept: text/html`, y `/auth/me` sin sesión → 401 Problem (cubre RF-005) [zona: test]
- [x] T-007 — Test de `install_spa` con `DIST_DIR` inexistente: API pura, no monta, no falla (cubre RF-006) [zona: test]
- [x] T-008 — Implementar `app/spa.py` (`prefers_html`, `VaultsSpaNegotiation`, `install_spa`, catch-all) (cubre RF-001…RF-006) [zona: coordinación]
- [x] T-009 — Conectar `install_spa(app)` en `app/main.py` tras los routers (cubre RF-001…RF-006) [zona: coordinación]
- [x] T-010 — Retirar `frontend/Dockerfile` y `frontend/nginx.conf` (nginx) (cubre RF-001/002/003) [zona: infra]
- [x] T-011 — `backend/Dockerfile` multi-stage (Node build → copia `dist` → `FRONTEND_DIST`) + `.dockerignore` raíz (cubre RF-001/006) [zona: infra]
- [x] T-012 — `docker-compose.yml`: quita servicio `frontend`, backend build contexto raíz, sirve en 8000 (cubre RF-001) [zona: infra]
- [x] T-013 — `docker-compose.dev.yml`: quita override `frontend` (dev usa Vite en host) (cubre RF-001) [zona: infra]
- [x] T-014 — Reescribir `frontend/README.md`: FastAPI sirve la SPA (nginx retirado) [doc]
- [x] T-015 — `backend/README.md`: sección «Sirve la SPA» (estáticos, `/vaults`, catch-all, `FRONTEND_DIST`, puerto 8000) [doc]

### Re-anchor (2026-10-17) — corrección de la regresión 405/404 y del guardia RF-008
- [x] T-016 — Test: `POST`/`PUT`/`DELETE` a una ruta totalmente desconocida (sin build de
  SPA relevante) → `404` `application/problem+json` con
  `type: urn:synapse:problem:spa-resource-not-found`, nunca `405` ni HTML (cubre RF-007)
  [zona: test]
- [x] T-017 — Test (mismo archivo que T-016 o hermano inmediato): `POST /health` (ruta real
  de un solo método) sigue respondiendo `405` con `Allow: GET` — **la sutileza crítica**:
  demuestra que la corrección de T-016 no secuestra el 405 legítimo (cubre RF-007)
  [zona: test]
- [x] T-018 — Confirmar en rojo y luego en verde, sin tocar su aserción: `GET
  test_rf_001_public_register_endpoint_no_longer_exists` (`tests/test_auth.py`, ya existe)
  y `test_only_the_problem_translator_imports_http_exception`
  (`tests/test_problem_catalog.py`, ya existe) (cubre RF-007, RF-008 de SPEC-0004)
  [zona: test]
- [x] T-019 — `app/core/errors.py`: nueva entrada de catálogo `SpaResourceNotFound`
  (slug `spa-resource-not-found`, status 404, detail `"Resource not found"`) (cubre RF-004,
  RF-005, RF-007) [zona: núcleo]
- [x] T-020 — `app/core/problems.py`: constante `CATCH_ALL_ROUTE_NAME` + reclasificación
  405→404 dentro de `_framework_error` (si ninguna ruta real, excluyendo la nombrada
  `CATCH_ALL_ROUTE_NAME`, da `Match.FULL`/`Match.PARTIAL` contra la petición, levanta
  `SpaResourceNotFound()` en vez del `HTTPException(405)` original) (cubre RF-007)
  [zona: núcleo]
- [x] T-021 — `app/spa.py`: retira el import de `starlette.exceptions.HTTPException`;
  las 3 ramas de 404 (RF-004, RF-005) pasan a `raise SpaResourceNotFound()`; el catch-all
  se registra con `name=CATCH_ALL_ROUTE_NAME` (sigue sólo `GET`/`HEAD`, sin ampliar métodos)
  (cubre RF-004, RF-005, RF-007, RF-008) [zona: coordinación]

## Cobertura (el gate exige 100 %; `Estado` lo rellena el gate)
| RF / doc | Tareas | Test(s) | Estado |
|---|---|---|---|
| RF-001 | T-002, T-008, T-009, T-011, T-012 | `test_asset_existente_se_sirve` | Pass |
| RF-002 | T-003, T-008, T-009 | `test_ruta_spa_sin_extension_sirve_index_con_html`, `test_ruta_spa_sin_extension_sirve_index_sin_accept`, `test_raiz_sirve_index` | Pass |
| RF-003 | T-001, T-004, T-008, T-009 | `test_prefers_html_detecta_navegacion`, `test_vaults_html_sirve_spa`, `test_vaults_deep_link_html_sirve_spa`, `test_vaults_json_va_a_api`, `test_vaults_deep_link_json_va_a_api` | Pass |
| RF-004 | T-005, T-008, T-009, T-019, T-021 | `test_asset_inexistente_404`, `test_archivo_raiz_con_extension_inexistente_404` | Pass |
| RF-005 | T-006, T-008, T-009, T-019, T-021 | `test_api_desconocida_devuelve_problem_no_html`, `test_api_existente_con_html_no_sirve_spa` | Pass |
| RF-006 | T-007, T-008 | `test_install_spa_sin_dist_es_api_pura` | Pass |
| RF-007 | T-016, T-017, T-018, T-019, T-020, T-021 | `test_metodo_no_get_a_ruta_desconocida_da_404_problem_no_405`, `test_metodo_no_permitido_en_ruta_real_sigue_dando_405`, `test_rf_001_public_register_endpoint_no_longer_exists`, `test_only_the_problem_translator_imports_http_exception` | Pass |
| doc: frontend-readme | T-014 | — | Pass |
| doc: backend-readme | T-015 | — | Pass |

> Esta tabla **es** la trazabilidad de la feature. Fila sin test / en `Pendiente` → gate cerrado;
> el gate la marca `Pass` cuando cada `RF-` tiene su test anotado y verde.
> **Re-anchor:** ninguna fila se autoaprueba. El revisor corre `gate/check.sh` + la suite
> completa (789 tests actuales + los nuevos de T-016/T-017) y sólo entonces mueve cada fila
> a `Pass`, una por una — incluidas las que ya estaban `Pass` antes de este re-anchor.
