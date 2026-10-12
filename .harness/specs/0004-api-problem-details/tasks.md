---
id: TASKS-0004
tipo: tasks
feature: 0004-api-problem-details
estado: draft
actualizado: 2026-10-12
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
- [x] T-010 — test (rojo): fallo del constructor (monkeypatch) → `FALLBACK_500` (campos fijos + `instance`) en `application/problem+json` (cubre RF-013) [zona: test]
- [x] T-011 — `core/problems.py`: `Problem`, `ProblemError`, `_respond` (problem+json), constructor único `_problem_body`, manejadores de `DomainError`/`StarletteHTTPException`/`Exception`, `FALLBACK_500` (cubre RF-001…RF-004, RF-012, RF-013) [zona: ruta]
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

### I · Correcciones de la verificación adversarial (enmienda 1)
- [x] T-038 — enmienda 1 de SPEC-0004 (RF-009, RF-011, RF-013, §5, §6) y PLAN-0004 §2/§5/§7/§9 al día con el código (V-3, V-5, V-6, V-7, V-8) (cubre RF-009, RF-011, RF-013) [doc]
- [x] T-039 — test (rojo) `test_problem_auth.py`: cada error provocado figura en las respuestas declaradas de su operación en `app.openapi()` (V-1) (cubre RF-009) [zona: test]
- [x] T-040 — test (rojo) `test_problem_handlers.py`: el mensaje interno de un `DomainError` llega al log (5xx con traza y causa; 4xx sin traza) y nunca a la respuesta (V-2) (cubre RF-004, RF-012) [zona: test]
- [x] T-041 — `core/problems.py`: `_domain_error` registra el mensaje interno (cubre RF-004, RF-012) [zona: ruta]
- [x] T-042 — `test_problem_auth.py`: «igual a la actual» ejerce la regla `differ` (contraseña actual ≥ 10); aserción de no-eco con el valor realmente enviado (V-4) (cubre RF-005, RF-011) [zona: test]
- [x] T-043 — test (rojo): `HTTPException(499)` conserva su código, `title` de su clase (V-5) (cubre RF-003, RF-013) [zona: test]
- [x] T-044 — `core/problems.py`: frase HTTP dentro de `_safely`, con la de la clase si no hay estándar (cubre RF-003, RF-013) [zona: ruta]
- [x] T-045 — test (rojo) `test_problem_validation.py`: `ValueError` y UUID cuyo `msg` lleva el valor → texto sin el valor; límites y plantillas propias sin `ctx` se conservan (V-3) (cubre RF-011) [zona: test]
- [x] T-046 — `core/problems.py`: `detail` desde plantillas con `SAFE_CTX_KEYS`; `core/schemas.py`: email con `PydanticCustomError` (cubre RF-005, RF-011) [zona: ruta]
- [x] T-047 — test (rojo): el 500 de fallback lleva `instance` y cumple el esquema `Problem` (V-6) (cubre RF-002, RF-013) [zona: test]
- [x] T-048 — `core/problems.py`: fallback con campos fijos + `instance` (cubre RF-002, RF-013) [zona: ruta]
- [x] T-049 — docs: `backend/README.md` y `core/README.md` (log del mensaje interno, regla de `PydanticCustomError`, 404/405 fuera del contrato por operación); re-export de contratos si cambian (cubre RF-009, RF-011) [doc]
- [x] T-050 — cierre: tabla de cobertura con su estado, SPEC-0004 `implemented` con `anchor_commit` nuevo, state.md e history.md (cubre RF-001…RF-014) [doc]

### J · Correcciones de la re-verificación adversarial (enmienda 2)
- [x] T-051 — enmienda 2 de SPEC-0004 (§5, §6: E2 · W-1, W-2, W-4; redacción del 500 de fallback) y PLAN-0004 §2/§9 (cubre RF-011, RF-013) [doc]
- [x] T-052 — test (rojo) `test_problem_validation.py`: el límite de longitud de una lista conserva su texto, sin los elementos (W-2) (cubre RF-011) [zona: test]
- [x] T-053 — `core/problems.py`: `field_type` y `actual_length` en `SAFE_CTX_KEYS` (cubre RF-011) [zona: ruta]
- [x] T-054 — `test_problem_handlers.py`: el test del fallback se nombra por lo que comprueba (campos fijos + `instance`) (W-3) (cubre RF-013) [zona: test]
- [x] T-055 — docs: `backend/README.md` (plantilla literal, límites de colecciones) y `core/README.md` (cubre RF-011) [doc]
- [x] T-056 — cierre: tabla de cobertura, W-4 al backlog de state.md, `anchor_commit` nuevo, history.md (cubre RF-011, RF-013) [doc]

### K · W-1 y W-4 de raíz (enmienda 3)
- [x] T-057 — enmienda 3 de SPEC-0004 (§5, §6: E3 · W-1, E3 · W-4) y PLAN-0004 §2/§5 (cubre RF-009, RF-011) [doc]
- [x] T-058 — test (rojo) `test_problem_validation.py`: un código catalogado publica el texto del catálogo aunque se lance con el valor dentro; uno no catalogado, el genérico (W-1) (cubre RF-011) [zona: test]
- [x] T-059 — test (rojo) `test_problem_catalog.py`: en `app/` sólo `core/errors.py` y `core/problems.py` usan `PydanticCustomError`/`PydanticKnownError`; catálogo de mensajes bien formado (W-1) (cubre RF-011) [zona: test]
- [x] T-060 — `core/errors.py`: `FIELD_ERROR_MESSAGES` y `field_error`; `core/problems.py`: tipos propios desde el catálogo; `core/schemas.py`: email con `field_error` (cubre RF-011) [zona: ruta]
- [x] T-061 — `conftest.py`: middleware de prueba «emitido ⊆ declarado» para toda petición a la app real; `test_problem_contract_guard.py` prueba que detecta un código no declarado y respeta las exclusiones de RF-009; helper de `test_problem_auth.py` sin la comprobación duplicada (W-4) (cubre RF-009) [zona: test]
- [x] T-062 — docs: `backend/README.md` y `core/README.md` (catálogo de mensajes de validación, comprobación de contrato en toda la suite) (cubre RF-009, RF-011) [doc]
- [x] T-063 — cierre: tabla de cobertura, W-4 fuera del backlog de state.md, `anchor_commit` nuevo, history.md (cubre RF-009, RF-011) [doc]

### L · Correcciones de la re-verificación 3 (enmienda 4)
- [x] T-064 — enmienda 4 de SPEC-0004 (§6: E4 · X-1, X-2, X-3) y PLAN-0004 §2/§5; comentario de `anchor_commit` (X-4a) y `actualizado` de tasks (X-4b) (cubre RF-009, RF-011) [doc]
- [x] T-065 — test (rojo) `test_problem_catalog.py`: fuera de los dueños nada en `app/` importa `pydantic_core` ni usa `ValidationError`/`from_exception_data`/`InitErrorDetails` (X-1); ningún código del catálogo es un tipo conocido de pydantic (X-3) (cubre RF-011) [zona: test]
- [x] T-066 — test (rojo) `test_problem_contract_guard.py`: con plantillas solapadas el guardián comprueba la operación que atendió la petición (X-2); fixture `schema` sin `client` (X-4e) (cubre RF-009) [zona: test]
- [x] T-067 — `tests/contract_guard.py`: operación por `scope["route"].path_format`; `raise AssertionError` explícito y `schema_provider` tipado (X-4c); docstring con el 500 que registra `ServerErrorMiddleware` cuando el guardián falla (X-4d) (cubre RF-009) [zona: test]
- [x] T-068 — docs: `backend/README.md` y `core/README.md` (regla por módulo, códigos del catálogo, operación atendida) (cubre RF-009, RF-011) [doc]
- [x] T-069 — cierre: tabla de cobertura, state.md, `anchor_commit` nuevo, history.md (cubre RF-009, RF-011) [doc]

### M · Correcciones de la re-verificación 4 (enmienda 5)
- [x] T-070 — enmienda 5 de SPEC-0004 (nota, §6: E5 · Y-1 sustituye a E4 · X-1; E3 · W-1 marcada como refinada) y PLAN-0004 §2 (Y-3 del spec) (cubre RF-011) [doc]
- [x] T-071 — test (rojo) `test_problem_catalog.py`: el escaneo detecta la construcción de `RequestValidationError`, `ValidationError`, `InitErrorDetails` y errores de `pydantic_core`, también con alias; permite importarlos y capturarlos (`except`); nombre del test acorde (Y-1) (cubre RF-011) [zona: test]
- [x] T-072 — `tests/contract_guard.py`: comentario corregido (`scope["route"]` lo fija `APIRoute`; `Route`/`Mount` puros quedan fuera del contrato) (Y-2) (cubre RF-009) [zona: test]
- [x] T-073 — docs: `backend/README.md` y `core/README.md` (regla sobre la construcción, `except` permitido) (cubre RF-011) [doc]
- [x] T-074 — cierre: tabla de cobertura, fila 0004 de state.md (Y-3), `anchor_commit` nuevo, history.md (cubre RF-009, RF-011) [doc]

### N · Correcciones de la re-verificación 5 (enmienda 6)
- [x] T-075 — enmienda 6 de SPEC-0004 (nota; §6: E5 · Y-1 precisada con las subclases, E6 · Z-2 validaciones entre fuentes, E6 · Z-1 residual aceptado) y PLAN-0004 §2 (Z-1, Z-2, Z-3) (cubre RF-011) [doc]
- [x] T-076 — `test_problem_catalog.py`: `_validation_error_constructions` sin comprensión de un elemento ni líneas largas, mismo comportamiento (Z-4) (cubre RF-011) [zona: test]
- [x] T-077 — docs: `backend/README.md` y `core/README.md` (vía permitida entre campos y entre fuentes, residual del análisis estático) (Z-1, Z-2) (cubre RF-011) [doc]
- [x] T-078 — cierre: tabla de cobertura, state.md, `anchor_commit` nuevo, history.md (cubre RF-011) [doc]

## Cobertura (el gate exige 100 %; `Estado` se rellena a mano con la evidencia de la verificación)
| RF / doc | Tareas | Test(s) | Estado |
|---|---|---|---|
| RF-001 | T-007, T-008, T-011, T-014 | test_problem_handlers | Pass |
| RF-002 | T-007, T-011, T-047, T-048 | test_problem_handlers | Pass |
| RF-003 | T-004, T-006, T-007, T-008, T-011, T-043, T-044 | test_problem_catalog, test_problem_handlers | Pass |
| RF-004 | T-007, T-009, T-011, T-020, T-040, T-041 | test_problem_handlers, test_problem_auth | Pass |
| RF-005 | T-012, T-013, T-019, T-042, T-046 | test_problem_validation, test_problem_auth | Pass |
| RF-006 | T-014, T-017, T-020–T-024 | test_problem_auth, test_forced_change | Pass |
| RF-007 | T-018, T-022 | test_problem_auth | Pass |
| RF-008 | T-005, T-006, T-021–T-023 | test_problem_catalog | Pass |
| RF-009 | T-001–T-003, T-015, T-016, T-023, T-025, T-030, T-031, T-038, T-039, T-049, T-057, T-061, T-062, T-064, T-066–T-069, T-072, T-074 | test_contract, test_problem_contract, test_problem_contract_guard (ContractGuard en toda la suite, operación atendida) | Pass |
| RF-010 | T-026–T-029 | problems.test.ts, auth.test.ts, ChangePasswordPage.test.tsx | Pass |
| RF-011 | T-012, T-013, T-019, T-038, T-042, T-045, T-046, T-049, T-051–T-053, T-055, T-057–T-060, T-062, T-064, T-065, T-068, T-069, T-070, T-071, T-073–T-078 | test_problem_validation, test_problem_auth, test_problem_catalog | Pass |
| RF-012 | T-009, T-011, T-040, T-041 | test_problem_handlers | Pass |
| RF-013 | T-010, T-011, T-038, T-043, T-044, T-047, T-048, T-051, T-054 | test_problem_handlers | Pass |
| RF-014 | T-004, T-006 | test_problem_catalog | Pass |
| doc: contrato-0004 | T-030 | — | hecho |
| doc: contrato-0002 | T-031 | — | hecho |
| doc: spec-0002 | T-001, T-036 | — | hecho |
| doc: backend-readme | T-032, T-049, T-055, T-062, T-068, T-073, T-077 | — | hecho |
| doc: core-readme | T-033, T-049, T-055, T-062, T-068, T-073, T-077 | — | hecho |
| doc: frontend-readme | T-034 | — | hecho |
| doc: agents-md | T-035 | — | hecho |
| doc: state | T-037, T-050, T-056, T-063, T-069, T-074, T-078 | — | hecho |
| doc: spec-0004-enmienda-1 | T-038 | — | hecho |
| doc: spec-0004-enmienda-2 | T-051 | — | hecho |
| doc: spec-0004-enmienda-3 | T-057 | — | hecho |
| doc: spec-0004-enmienda-4 | T-064 | — | hecho |
| doc: spec-0004-enmienda-5 | T-070 | — | hecho |
| doc: spec-0004-enmienda-6 | T-075 | — | hecho |
| doc: history | T-050, T-056, T-063, T-069, T-074, T-078 | — | hecho |

> Esta tabla **es** la trazabilidad de la feature (no hay `traceability-matrix.md`).
> Fila sin test, en `Fail` o `Pendiente` → el gate no abre.
