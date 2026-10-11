---
id: TASKS-0004
tipo: tasks
feature: 0004-api-problem-details
estado: draft
actualizado: 2026-10-11
---

# TASKS-0004 · Errores de la API con Problem Details (RFC 9457)

## Reglas
- Cada tarea: ≤ 30 min, un solo propósito, `(cubre RF-NNN)`, zona del patrón (o `[doc]`).
- Orden por dependencias (PLAN-0004 §6). **Test antes que código.**
- Cada fila de `plan.md §8` → una tarea `[doc]`.

## Tareas
### A · Re-anclaje previo de 0002 (PLAN-0004 §7)
- [x] T-001 — `covers` de SPEC-0002: sustituir `backend/tests/**` por sus propios archivos (`conftest.py`, `test_admin.py`, `test_auth.py`, `test_bootstrap.py`, `test_change_password.py`, `test_config.py`, `test_contract.py`, `test_couchdb_adapter.py`, `test_flow.py`, `test_forced_change.py`, `test_health.py`, `test_isolation.py`, `test_models.py`, `test_provisioning.py`, `test_real_backends.py`, `test_refresh.py`, `test_security.py`) con nota de re-anclaje; gate verde (cubre RF-009) [doc]

### B · Contratos por feature
- [x] T-002 — test (rojo): `test_contract.py` por feature — cada contrato = su parte de la app (prefijos + recorrido de `$ref`); toda ruta pertenece a exactamente una feature; contrato de 0004 sin `paths` con `Problem`/`ProblemError`; copia de `Problem` en 0002 igual a la de 0004 (cubre RF-009) [zona: test]
- [x] T-003 — `scripts/export_openapi.py`: `FEATURES`, `contract_for(spec, prefixes)`, escritura de un contrato por feature (cubre RF-009) [zona: script]

### C · Núcleo: catálogo de errores de dominio
- [x] T-004 — test (rojo) `test_problem_catalog.py`: toda subclase de `DomainError` declara `slug`/`title`/`status`/`detail`; `type` único con forma `urn:synapse:problem:[a-z0-9-]+`; las 10 entradas del catálogo de SPEC-0004 §3 existen con su código (cubre RF-003, RF-014) [zona: test]
- [x] T-005 — test (rojo) de arquitectura por AST: ningún módulo de `app/` salvo `core/problems.py` importa `HTTPException` (cubre RF-008) [zona: test]
- [x] T-006 — `core/errors.py`: `DomainError` (mensaje interno separado de `detail` público, `errors` opcional) y las 10 clases; `ProvisioningError` ⊂ `StorageUnavailable` (cubre RF-003, RF-008, RF-014) [zona: núcleo]

### D · Traductor (`core/problems.py`)
- [x] T-007 — test (rojo) `test_problem_handlers.py` con app mínima: `DomainError` → `application/problem+json`, `type`/`title`/`status`/`instance` (sin query); mensaje interno ausente; `errors` sólo si hay (cubre RF-001, RF-002, RF-003, RF-004) [zona: test]
- [x] T-008 — test (rojo): 404 de ruta y 405 (con `Allow`) → `about:blank` + frase estándar (cubre RF-001, RF-003) [zona: test]
- [x] T-009 — test (rojo): excepción no controlada → 500 genérico sin el texto de la excepción; traza con método y ruta en `caplog` (`raise_server_exceptions=False`) (cubre RF-004, RF-012) [zona: test]
- [x] T-010 — test (rojo): fallo del constructor (monkeypatch) → `FALLBACK_500` constante en `application/problem+json` (cubre RF-013) [zona: test]
- [x] T-011 — `core/problems.py`: `Problem`, `ProblemError`, `ProblemResponse`, constructor único, manejadores de `DomainError`/`StarletteHTTPException`/`Exception`, `FALLBACK_500` (cubre RF-001…RF-004, RF-012, RF-013) [zona: ruta]
- [x] T-012 — test (rojo) `test_problem_validation.py`: `loc` de cuerpo anidado → `pointer` con escape `~0`/`~1`; JSON inválido y cuerpo ausente → `#`; query/path → `parameter`; header → `header` con guiones; `detail` raíz fijo; sin `input`/`ctx`/`url` (cubre RF-005, RF-011) [zona: test]
- [x] T-013 — manejador de `RequestValidationError` con la conversión de `loc` (cubre RF-005, RF-011) [zona: ruta]
- [x] T-014 — `main.py`: `install_problem_handlers(app)`; borrar el manejador ad hoc de `ProvisioningError` (cubre RF-001, RF-006) [zona: ruta]

### E · OpenAPI de errores
- [x] T-015 — test (rojo) `test_problem_contract.py`: barrido de todas las operaciones — cada 4xx/5xx declarado usa `application/problem+json` con `$ref` a `Problem`; toda operación declara 500; sin `HTTPValidationError`/`ValidationError` (cubre RF-009) [zona: test]
- [x] T-016 — `problem_responses(*errors)` e `install_problem_openapi(app)` (con caché) en `core/problems.py`; cableado en `main.py` (cubre RF-009) [zona: ruta]

### F · Migración de auth y admin
- [x] T-017 — test (rojo) `test_problem_auth.py`: tabla parametrizada de cada error de auth/admin → mismo código que antes + `type` del catálogo (sin cookie, token inválido, token de versión anterior, refresh inválido/reutilizado, guest en admin, cambio pendiente, contraseña actual errónea, email repetido) (cubre RF-006) [zona: test]
- [x] T-018 — test (rojo): login con email inexistente vs contraseña errónea → cuerpos idénticos byte a byte (cubre RF-007) [zona: test]
- [x] T-019 — test (rojo): contraseña inválida en `login` y `change-password` no aparece en la respuesta; política → 422 `validation-error` con `pointer: "#/new_password"` (cubre RF-005, RF-011) [zona: test]
- [x] T-020 — test (rojo): CouchDB inaccesible al crear usuario → 503 `storage-unavailable` sin el mensaje interno del adaptador (cubre RF-004, RF-006) [zona: test]
- [x] T-021 — `core/dependencies.py`: `NotAuthenticated`, `InvalidToken`, `AdminRequired`, `PasswordChangeRequired` (cubre RF-006, RF-008) [zona: núcleo]
- [x] T-022 — `services/auth_service.py`: `EmailTaken`, `InvalidCredentials`, `InvalidRefreshToken`, `WrongCurrentPassword`, `PasswordPolicyViolation`; sin `fastapi` en el servicio (cubre RF-006, RF-007, RF-008) [zona: servicio]
- [x] T-023 — `routers/auth.py` (`/me` → `InvalidToken`) y `responses=problem_responses(...)` en cada ruta de `auth.py` y `admin.py` (cubre RF-006, RF-008, RF-009) [zona: ruta]
- [x] T-024 — `test_forced_change.py`: leer `type` en lugar de `detail`; suite completa del backend en verde (cubre RF-006) [zona: test]
- [x] T-025 — re-export de contratos (0002 y 0004) y test de deriva en verde (cubre RF-009) [zona: script]

### G · Frontend
- [x] T-026 — test (rojo) `api/problems.test.ts`: `parseProblem` con problem+json, JSON sin campos y cuerpo no JSON; `ApiError` con `status`/`type`/`title`/`detail`/`errors` y `message` con prioridad `detail` → `title` → `statusText` (cubre RF-010) [zona: test]
- [x] T-027 — `api/problems.ts`: `ApiError`, `parseProblem`, constantes `PROBLEM.*` (cubre RF-010) [zona: frontend]
- [x] T-028 — `api/auth.test.ts` con cuerpos Problem (rojo) → `request()` usa `parseProblem`; `auth.ts` re-exporta `ApiError` (cubre RF-010) [zona: frontend]
- [x] T-029 — `ChangePasswordPage.test.tsx` con `type` (rojo) → la página decide por `type`; mismos textos; tests de `LoginPage`/`RequireAuth` en verde (cubre RF-010) [zona: frontend]

### H · Documentación (PLAN-0004 §8)
- [x] T-030 — contrato `0004-api-problem-details/contracts/openapi.yaml` creado por export y versionado (cubre RF-009) [doc]
- [x] T-031 — contrato `0002-auth/contracts/openapi.yaml` re-exportado con respuestas de error (cubre RF-009) [doc]
- [x] T-032 — `backend/README.md`: sección "Errores (SPEC-0004)" (formato, catálogo, cómo añadir un error de dominio, export por feature, aviso de cambio incompatible) [doc]
- [x] T-033 — `backend/app/core/README.md`: `errors.py` (catálogo) y `problems.py` (traductor) [doc]
- [x] T-034 — `frontend/src/README.md`: `api/problems.ts` y `ApiError` [doc]
- [x] T-035 — `AGENTS.md`: regla "los servicios lanzan errores de dominio, nunca `HTTPException`" (o declarar que el mapa no lo menciona) [doc]
- [x] T-036 — cierre: nota y `anchor_commit` nuevo en SPEC-0002 (formato de errores → SPEC-0004) [doc]
- [x] T-037 — cierre: `state.md` (estado de 0004, re-anclaje de 0002, residual "contrato sin respuestas de error" resuelto) [doc]

## Cobertura (el gate exige 100 %; `Estado` lo rellena el gate)
| RF / doc | Tareas | Test(s) | Estado |
|---|---|---|---|
| RF-001 | T-007, T-008, T-011, T-014 | test_problem_handlers | Pendiente |
| RF-002 | T-007, T-011 | test_problem_handlers | Pendiente |
| RF-003 | T-004, T-006, T-007, T-008, T-011 | test_problem_catalog, test_problem_handlers | Pendiente |
| RF-004 | T-007, T-009, T-011, T-020 | test_problem_handlers, test_problem_auth | Pendiente |
| RF-005 | T-012, T-013, T-019 | test_problem_validation, test_problem_auth | Pendiente |
| RF-006 | T-014, T-017, T-020–T-024 | test_problem_auth, test_forced_change | Pendiente |
| RF-007 | T-018, T-022 | test_problem_auth | Pendiente |
| RF-008 | T-005, T-006, T-021–T-023 | test_problem_catalog | Pendiente |
| RF-009 | T-001–T-003, T-015, T-016, T-023, T-025, T-030, T-031 | test_contract, test_problem_contract | Pendiente |
| RF-010 | T-026–T-029 | problems.test.ts, auth.test.ts, ChangePasswordPage.test.tsx | Pendiente |
| RF-011 | T-012, T-013, T-019 | test_problem_validation, test_problem_auth | Pendiente |
| RF-012 | T-009, T-011 | test_problem_handlers | Pendiente |
| RF-013 | T-010, T-011 | test_problem_handlers | Pendiente |
| RF-014 | T-004, T-006 | test_problem_catalog | Pendiente |
| doc: contrato-0004 | T-030 | — | Pendiente |
| doc: contrato-0002 | T-031 | — | Pendiente |
| doc: spec-0002 | T-001, T-036 | — | Pendiente |
| doc: backend-readme | T-032 | — | Pendiente |
| doc: core-readme | T-033 | — | Pendiente |
| doc: frontend-readme | T-034 | — | Pendiente |
| doc: agents-md | T-035 | — | Pendiente |
| doc: state | T-037 | — | Pendiente |

> Esta tabla **es** la trazabilidad de la feature (no hay `traceability-matrix.md`).
> Fila sin test, en `Fail` o `Pendiente` → el gate no abre.
