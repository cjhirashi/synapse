---
id: PLAN-0004
tipo: plan
feature: 0004-api-problem-details
estado: approved
aprobaciones:
  fase_2: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-11 }
actualizado: 2026-10-11
---

# PLAN-0004 · Errores de la API con Problem Details (RFC 9457)

> El *cómo* de SPEC-0004, en el patrón por-capas con puertos (ADR-001):
> los servicios y dependencias **lanzan errores de dominio**; una sola pieza de la capa
> HTTP (`core/problems.py`) los convierte en `application/problem+json`.

## 0. Gates de simplicidad
- [x] Simplicity — sin librerías nuevas: manejadores de excepciones de FastAPI/Starlette
  y un modelo pydantic. En el frontend, sólo TypeScript.
- [x] Anti-Abstraction — una jerarquía mínima (`DomainError` + una clase por `type`) y un
  único módulo traductor; nada de "registro" aparte: la clase **es** la entrada del
  catálogo (Q9).
- [x] Integration-First — el contrato (`Problem` + respuestas de error) y el test de deriva
  se cambian primero (rojo) y la implementación los pone en verde.

## 1. Cumplimiento constitucional
| Artículo | Cómo lo respeta este plan |
|---|---|
| Art. 1–2 (patrón) | `services/` y `core/dependencies.py` dejan de importar `HTTPException`; lanzan clases de `core/errors.py`. Sólo `core/problems.py` conoce el formato HTTP de los errores. |
| Art. 3 (testing) | TDD; ≥ 80 % por módulo, objetivo 90 %; vitest en el frontend. |
| Art. 5 (seguridad) | 500 genérico; traza sólo en el log (RF-004, RF-012); nunca se devuelve el valor enviado (RF-011); login fallido idéntico exista o no el email (RF-007). |
| Art. 6 (contratos/errores) | RFC 9457 en toda la API; `Problem` y respuestas de error en OpenAPI 3.1 (RF-009). |
| Art. 10 (raíz) | Se elimina la causa (servicios que hablan HTTP), no se reescriben cuerpos a la salida. |
| Art. 11 (docs) | §8. |
| Art. 12 (un canon) | El catálogo vive en el código (clases de `core/errors.py`); los contratos son derivados exportados; el esquema `Problem` tiene su canon en el contrato de 0004 (§4). |

## 2. Arquitectura de la feature

### Núcleo — errores de dominio (`core/errors.py`)
```python
class DomainError(Exception):
    slug: ClassVar[str]      # → type = "urn:synapse:problem:{slug}"
    title: ClassVar[str]     # fijo por type (RF-003)
    status: ClassVar[int]    # código HTTP
    detail: ClassVar[str]    # texto público por defecto, en inglés

    def __init__(self, message: str | None = None, *, detail: str | None = None,
                 errors: list[dict] | None = None) -> None: ...
```
- `message` es **interno** (va al log; p. ej. "CouchDB inaccesible: …"); el `detail`
  público es el de la clase salvo que se pase `detail=` explícito. Así un mensaje con
  datos internos nunca llega al cliente por accidente (RF-004).
- `errors` sólo lo usan los errores 422 (misma forma que RF-005).
- Una clase por fila del catálogo de §3 del spec:

| Clase | `slug` | Código | Lanzada por |
|---|---|---|---|
| `NotAuthenticated` | `not-authenticated` | 401 | `get_current_user` (sin cookie) |
| `InvalidToken` | `invalid-token` | 401 | `get_current_user`, `require_password_changed`, `GET /auth/me` |
| `InvalidCredentials` | `invalid-credentials` | 401 | `AuthService.login`, `change_password` (usuario inexistente) |
| `InvalidRefreshToken` | `invalid-refresh-token` | 401 | `AuthService.refresh` |
| `AdminRequired` | `admin-required` | 403 | `require_admin` |
| `PasswordChangeRequired` | `password-change-required` | 403 | `require_password_changed` |
| `WrongCurrentPassword` | `wrong-current-password` | 400 | `AuthService.change_password` |
| `EmailTaken` | `email-taken` | 409 | `AuthService.create_guest_user` |
| `PasswordPolicyViolation` | `validation-error` | 422 | `AuthService.change_password` (con `errors=[{pointer: "#/new_password", detail}]`) |
| `StorageUnavailable` | `storage-unavailable` | 503 | adaptadores de CouchDB |

- `ProvisioningError` pasa a ser subclase de `StorageUnavailable` (mismo `type`, mismo
  503); el adaptador `couchdb.py` sigue lanzándola con su mensaje interno.
- Los `title`/`detail` reproducen en inglés los textos actuales ("Invalid credentials",
  "Email already registered", "Storage provisioning unavailable", …).

### Capa HTTP — traductor (`core/problems.py`, nuevo)
- `Problem` y `ProblemError` (pydantic): esquema publicado en el contrato.
  `ProblemError` = `detail` + exactamente uno de `pointer` / `parameter` / `header`.
- `_respond(body, status, headers)`: `Response` con `media_type = "application/problem+json"`.
- `install_problem_handlers(app)` registra, en este orden de especificidad:

| Excepción | Respuesta | RF |
|---|---|---|
| `DomainError` | `type` URN, `title`/`status` de la clase, `detail` público, `errors` si hay; el mensaje interno va al log (5xx: `ERROR` con traza y causa; 4xx: `INFO`) | RF-003, 004, 006, 008, 012 |
| `RequestValidationError` | 422 `validation-error`; una entrada por error de pydantic (ver abajo) | RF-005, 011 |
| `StarletteHTTPException` (404/405 del router y cualquier otra del framework) | `about:blank`, `title` = frase estándar (`HTTPStatus(code).phrase`; código sin frase → la de su clase, 400 o 500, conservando el código), `detail` = el del framework; conserva sus cabeceras (`Allow` en 405) | RF-001, 003 |
| `Exception` | 500 `about:blank`, `detail` "An unexpected error occurred."; `logger.exception(...)` con método y ruta | RF-004, 012 |

- `instance` = `request.url.path` (sin query) en todos los casos (RF-002).
- **Fallo del propio traductor (RF-013):** cada manejador construye la respuesta dentro de
  un `try` (`_safely`), incluido el cálculo del `title`; si algo falla, devuelve el 500 de
  fallback (`FALLBACK_500`, campos fijos precalculados al importar el módulo, más
  `instance`, serializado con `json.dumps` sin pasar por el modelo) con
  `application/problem+json`, y registra el error (enmienda 1, V-6).
- **De pydantic a ubicación (RF-005):** `loc[0]` decide el campo:
  - `"body"` → `pointer` = `"#"` + `"/" + segmento` por cada elemento restante de `loc`,
    escapando `~`→`~0` y `/`→`~1` (RFC 6901). Cuerpo ausente o JSON inválido
    (`json_invalid`, cuyo `loc` lleva una posición) → `pointer: "#"`.
  - `"query"` / `"path"` → `parameter` = `loc[1]`.
  - `"header"` → `header` = `loc[1]` con el nombre HTTP (guiones bajos → guiones).
  - Hoy ninguna ruta declara parámetros de cookie (las cookies se leen a mano y sus fallos
    son 401); si apareciera `"cookie"` se trataría como `parameter`.
- **Sin valores del cliente (RF-011, enmienda 1 V-3):** el `detail` de cada entrada se
  construye desde el `type` del error, nunca copiando `msg`, `input`, `ctx` ni `url`:
  - tipo conocido por pydantic → su plantilla (`PydanticKnownError(type, ctx).message()`)
    rellenada sólo con claves de restricción del esquema (`SAFE_CTX_KEYS`: límites,
    `expected`, …);
  - tipo propio (`PydanticCustomError`) sin `ctx` → su plantilla, que es una constante del
    código;
  - cualquier otro caso (`value_error`/`assertion_error`, cuyo `ctx.error` es el texto de
    la excepción; plantillas que exigen `ctx.error`, como UUID o JSON inválido; tipos
    propios con `ctx`) → `"Invalid value."`.
  Los validadores que quieran un texto concreto lanzan `PydanticCustomError` con plantilla
  fija (p. ej. el email de `CreateUserRequest`). El `detail` raíz del 422 es fijo
  ("Request validation failed.").
- `problem_responses(*errors)` construye el `responses=` de una ruta a partir de las
  clases que puede lanzar (código → descripción = `title`, contenido
  `application/problem+json` con `$ref` a `Problem`).
- `install_problem_openapi(app)` envuelve `app.openapi` (una vez, con caché) para:
  añadir `Problem`/`ProblemError` a `components.schemas`; sustituir en cada operación el
  422 por defecto de FastAPI (`HTTPValidationError`) por `Problem` en
  `application/problem+json`; añadir el `500` a todas las operaciones; quitar los esquemas
  `HTTPValidationError`/`ValidationError` que ya nadie referencia.

### Cableado
- `main.py`: `install_problem_handlers(app)` e `install_problem_openapi(app)`; se borra el
  manejador ad hoc de `ProvisioningError`.
- `services/auth_service.py`, `core/dependencies.py`, `routers/auth.py` (`/me`): lanzan las
  clases de dominio; desaparece todo `import HTTPException` de `app/` salvo `problems.py`.
- `routers/auth.py` y `routers/admin.py`: `responses=problem_responses(...)` en cada ruta
  según la tabla de arriba (las rutas con `get_current_user` declaran 401; las de admin,
  401/403; `change-password`, 400/401/422; `POST /admin/users`, 409/503; …).

### Frontend (`frontend/src/api/`)
- `api/problems.ts` (nuevo): `ApiError` (se mueve aquí desde `auth.ts`) con
  `status`, `type`, `title`, `detail`, `errors` y `message = detail ?? title ?? statusText`;
  `parseProblem(res)` lee el cuerpo si es JSON (problem+json o json) y tolera cuerpos no
  JSON; constantes `PROBLEM.*` con los `type` que usa la UI.
- `api/auth.ts`: `request()` usa `parseProblem`; re-exporta `ApiError` para no romper
  importaciones.
- Pantallas (`LoginPage`, `ChangePasswordPage`, `RequireAuth`): mismos mensajes (RF-010).
  `ChangePasswordPage` pasa a decidir por `type` (`wrong-current-password`,
  `validation-error`) en lugar de por código; las demás siguen con `status === 401`, que
  no cambia.

## 3. Modelo de datos
Sin cambios en PostgreSQL, CouchDB ni migraciones.

## 4. Contratos
| Archivo | Contenido | Gate(s) |
|---|---|---|
| `0004-api-problem-details/contracts/openapi.yaml` (nuevo) | OpenAPI 3.1 **sin `paths`**: sólo `components.schemas.Problem` y `ProblemError` — canon del esquema | test de deriva; Spectral cuando esté |
| `0002-auth/contracts/openapi.yaml` | sus rutas, ahora con respuestas de error `Problem` | test de deriva |

El reparto de contratos por feature que planeaba PLAN-0003 §4 **se adelanta a esta
feature**, porque 0004 necesita su propio contrato antes que 0003:
- `scripts/export_openapi.py` define `FEATURES = {"0002-auth": ("/auth", "/admin",
  "/health"), "0004-api-problem-details": ()}` y `contract_for(spec, prefixes)`: las rutas
  con esos prefijos y los `components` que referencian (recorrido de `$ref`). Con
  prefijos vacíos (0004) exporta sólo `Problem`/`ProblemError`.
- Los contratos de cada feature llevan una copia de `Problem` para seguir siendo
  autocontenidos (Spectral los valida sueltos); el test exige que esa copia sea **igual**
  a la del contrato de 0004, así que no pueden divergir.
- `test_contract.py`: cada contrato = su parte de la app; toda ruta de la app pertenece a
  exactamente una feature; endpoints esperados de cada spec.

## 5. Estrategia de pruebas (TDD)
| Zona | Qué se prueba | Archivo |
|---|---|---|
| Catálogo | cada subclase de `DomainError` tiene `slug`, `title`, `status`, `detail`; `type` único y con forma `urn:synapse:problem:[a-z0-9-]+` (RF-014) | `test_problem_catalog.py` |
| Traductor | `DomainError` → cuerpo y cabecera; mensaje interno no aparece; `errors` opcional; 404/405 de ruta (con `Allow`); 500 genérico con `raise_server_exceptions=False` y traza en `caplog` (RF-012); mensaje interno de `DomainError` en `caplog`; fallo del traductor → `FALLBACK_500` con `instance` (RF-013); código sin frase estándar conserva su código | `test_problem_handlers.py` (app mínima de prueba) |
| Validación | `loc` → `pointer`/`parameter`/`header`, escape RFC 6901, JSON inválido → `#`; nunca el valor enviado: contraseña de 3 caracteres en `change-password` y en `login` no aparece en la respuesta (RF-011) | `test_problem_validation.py` |
| Migración | cada error de auth/admin: mismo código que antes + `type` del catálogo (tabla parametrizada); login con email inexistente y con contraseña errónea → cuerpos idénticos (RF-007); CouchDB caído → 503 `storage-unavailable` sin el mensaje interno | `test_problem_auth.py` |
| Arquitectura | ningún módulo de `app/` salvo `core/problems.py` importa `HTTPException` (RF-008), por AST | `test_problem_catalog.py` |
| Barrido | recorre todas las operaciones del contrato: cada respuesta 4xx/5xx declarada usa `application/problem+json` con `$ref` a `Problem`; cada error real devuelto en la suite lleva `application/problem+json` | `test_problem_contract.py` + `test_contract.py` |
| Emitido ⊆ declarado (V-1) | cada error real de auth/admin provocado en `test_problem_auth.py` figura en las respuestas que su operación declara en `app.openapi()` (salvo 404/405 de enrutado, enmienda 1) | `test_problem_auth.py` |
| Regresión | suite existente de 0002 en verde; el test que hoy lee `detail` (`test_forced_change.py`) pasa a leer `type` | suite completa |
| Frontend | `parseProblem` con problem+json, json sin campos, cuerpo no JSON; `ApiError` con todos los campos; pantallas muestran los mismos textos; `auth.test.ts` con cuerpos Problem | vitest |

## 6. Secuenciación
1. Re-anclaje previo de 0002 (§7): `covers` de 0002 deja `backend/tests/**` y lista sus
   propios archivos de test.
2. Contrato: reparto por feature + `Problem` en `export_openapi.py`/`test_contract.py`
   (rojo).
3. Núcleo: catálogo y test de arquitectura (rojo) → `core/errors.py`.
4. Traductor: tests de manejadores y validación (rojo) → `core/problems.py`, `main.py`.
5. Migración de auth/admin (rojo) → servicios, dependencias, rutas con `responses=`;
   re-export de contratos.
6. Frontend (rojo) → `api/problems.ts`, `api/auth.ts`, pantallas.
7. Tareas `[doc]` de §8.

## 7. Seguimiento de complejidad / riesgos
| Excepción / riesgo | Justificación |
|---|---|
| 0004 modifica archivos de `covers` de 0002 (`auth_service.py`, `dependencies.py`, `routers/**`, `export_openapi.py`, `api/auth.ts`, pantallas, contrato) | Sin re-anclar, el gate marcaría DRIFT en 0002. Se acota `backend/tests/**` (paso 1) y, al cerrar 0004, se mueve el `anchor_commit` de 0002 con una nota en su spec: "errores de la API sustituidos por SPEC-0004" (la línea de §3 que hoy dice `{"detail"}`). |
| Se adelantan pasos de PLAN-0003 | El reparto de contratos y el re-anclaje de 0002 (pasos 1–2 de PLAN-0003 §6) se hacen aquí. Al escribir `tasks.md` de 0003 esos pasos se dan por hechos; además, sus errores (`VaultNotFound`, …) se declaran como subclases de `DomainError` con su `slug` y no "en `main.py`" como decía PLAN-0003 §2. Son ajustes de detalle que 0003 recoge en su Fase 3 sin cambiar ninguna decisión. |
| `core/errors.py`, `core/schemas.py` y `main.py` sin dueño en 0004 | Transversales (lo decidió PLAN-0003): 0003 y las features siguientes añaden ahí sus errores; si 0004 los cubriera, cada feature nueva provocaría DRIFT en 0004. |
| Manejador de `Exception` en Starlette | Starlette responde con nuestro manejador y además re-lanza la excepción al servidor; por eso los tests de 500 usan `TestClient(raise_server_exceptions=False)`. El registro explícito con `logger.exception` asegura la traza aunque el servidor cambie. |
| Cambio incompatible en la API | Decidido en Q6 (sin clientes externos). Se marca como **breaking** en el commit y en `backend/README.md`. |

## 8. Impacto en documentación (Art. 11)
| Documento del mapa | Qué cambia | Acción |
|---|---|---|
| `0004-api-problem-details/contracts/openapi.yaml` | esquema `Problem` | crear (export) |
| `0002-auth/contracts/openapi.yaml` | respuestas de error | re-export |
| `0002-auth/spec.md` | nota de re-anclaje (formato de errores → SPEC-0004) | actualizar al cierre |
| `backend/README.md` | sección "Errores (SPEC-0004)": formato, catálogo, cómo añadir un error de dominio, export por feature; aviso de cambio incompatible | actualizar |
| `backend/app/core/README.md` | `errors.py` (catálogo) y `problems.py` (traductor) | actualizar |
| `frontend/src/README.md` | `api/problems.ts` y `ApiError` | actualizar |
| `AGENTS.md` | regla: los servicios lanzan errores de dominio, nunca `HTTPException` | actualizar si el mapa lo menciona |
| `.harness/memory/state.md` | estado de 0004, re-anclaje de 0002 | actualizar en el cierre |

## 9. Implementación por requisito

### Implementación de RF-001
`install_problem_handlers` (cuatro manejadores, §2). Tests: `test_problem_handlers.py` (404 de ruta, 405, 500, error de dominio) y barrido en `test_problem_contract.py`.
### Implementación de RF-002
`instance = request.url.path` y `status` desde la clase o la excepción en el constructor único de `Problem`. Tests: `status == response.status_code` e `instance` sin query en cada caso.
### Implementación de RF-003
`type` = `urn:synapse:problem:{slug}` para `DomainError`, `about:blank` + `HTTPStatus(code).phrase` para el resto. Tests: catálogo + manejadores.
### Implementación de RF-004
Manejador de `Exception` con `detail` fijo; `message` interno de `DomainError` nunca se serializa. Tests: excepción con texto secreto → no aparece en el cuerpo; `ProvisioningError("CouchDB inaccesible: …")` → 503 sin ese texto.
### Implementación de RF-005
Conversión de `loc` (§2). Tests: `test_problem_validation.py` (cuerpo anidado, query, path, header, JSON inválido, escape `~`/`/`).
### Implementación de RF-006
Clases de dominio con los códigos actuales y `responses=` en las rutas. Tests: tabla parametrizada en `test_problem_auth.py`.
### Implementación de RF-007
`AuthService.login` lanza `InvalidCredentials()` sin argumentos en ambas ramas. Test: comparación byte a byte de los dos cuerpos.
### Implementación de RF-008
Jerarquía `DomainError`; sin `HTTPException` en `services/`, `core/dependencies.py` ni `routers/`. Test de arquitectura por AST.
### Implementación de RF-009
`problem_responses`, `install_problem_openapi`, reparto de contratos. Tests: `test_contract.py` (deriva + igualdad de `Problem`) y `test_problem_contract.py` (barrido).
### Implementación de RF-010
`api/problems.ts`, `request()` en `auth.ts`, `ChangePasswordPage` por `type`. Tests vitest de `problems.test.ts`, `auth.test.ts` y pantallas.
### Implementación de RF-011
`detail` de cada entrada desde plantillas con `SAFE_CTX_KEYS` (§2); `detail` raíz fijo. Tests con contraseñas inválidas en `login` y `change-password`, `ValueError` y UUID con el valor dentro del mensaje de pydantic.
### Implementación de RF-012
`logger.error(..., exc_info=exc)` en el manejador de `Exception`; el de `DomainError` registra el mensaje interno. Tests con `caplog`: traza con método y ruta; mensaje interno y causa de un 503.
### Implementación de RF-013
`FALLBACK_500` precalculado más `instance`; `_safely` en cada manejador. Tests: forzar fallo del constructor (monkeypatch) → 500 `application/problem+json` con los campos fijos e `instance`; `HTTPException(499)` conserva su código.
### Implementación de RF-014
Test de catálogo sobre todas las subclases de `DomainError` (recorrido recursivo de `__subclasses__`).
