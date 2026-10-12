# backend/

FastAPI — monolito modular por capas con puertos (ADR-001).

## Regla de oro

`services/` solo importa de `core/ports/`. Nunca de `adapters/` directamente.
`adapters/factory.py` selecciona la implementación concreta.
`routers/` son adaptadores primarios — reciben requests y delegan a `services/`.

## Estructura

```
backend/
├── app/
│   ├── core/         # config, seguridad (Argon2id), dependencias, esquemas, modelos, errores
│   │   └── ports/    # Interfaces abstractas (Protocols de Python)
│   ├── services/     # Lógica de negocio (auth_service.py)
│   ├── adapters/     # Implementaciones concretas (PostgreSQL, CouchDB)
│   ├── routers/      # Endpoints FastAPI (auth.py, admin.py)
│   ├── bootstrap.py  # Siembra del admin al arrancar
│   └── main.py
├── alembic/          # Migraciones PostgreSQL
├── scripts/          # export_openapi.py
├── tests/
├── Dockerfile
└── requirements.txt
```

## Entorno

Toda la configuración sensible viene del entorno; **no hay valores por defecto** y el
backend no arranca si falta alguna (ver `.env.example` en la raíz):

| Variable | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL (control plane) |
| `COUCHDB_URL`, `COUCHDB_USER`, `COUCHDB_PASSWORD` | CouchDB (una base por usuario) |
| `JWT_SECRET` | Firma HS256 de los JWT |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin sembrado al arrancar |

## Autenticación (SPEC-0002)

- **Bootstrap:** al arrancar, si no existe el admin se crea con `ADMIN_EMAIL`/`ADMIN_PASSWORD`
  y su base CouchDB `synapse_user_{id}`. Es idempotente y seguro con varias réplicas.
- **Cambio forzado:** el admin sembrado y los guests creados por el admin quedan con
  `must_change_password=true`; mientras tanto sólo responden `/auth/me`,
  `/auth/change-password`, `/auth/logout` y `/auth/refresh` (el resto, 403).
- **Emails:** se guardan y comparan normalizados (sin espacios, en minúsculas; índice único
  sobre `lower(email)`, migración 003). `POST /admin/users` valida el formato (422).
- **Login:** mismo 401 y mismo coste (verificación Argon2id contra un hash ficticio) exista o
  no el usuario, para no permitir enumerar emails.
- **Sesión:** JWT de 24 h en cookie httpOnly `access_token` (sólo cookie, nunca
  `Authorization`) y refresh token de 30 días en cookie `refresh_token`, guardado hasheado.
  El JWT lleva `ver` (= `users.token_version`): cambiar la contraseña la incrementa e invalida
  al instante los access tokens anteriores de todas las sesiones (la actual recibe cookies nuevas).
  Cada `/auth/refresh` **rota** el refresh token de forma atómica (`UPDATE` condicional: con dos
  peticiones simultáneas sólo una gana); reutilizar uno ya rotado, o perder esa carrera, revoca
  todos los del usuario (posible robo). Los JWT emitidos antes de la migración 004 (sin `ver`) dejan de valer.

| Endpoint | Respuesta |
|---|---|
| `POST /auth/login` `{email,password}` | 200 + cookies · 401 |
| `POST /auth/refresh` | 200 + nuevos `access_token` y `refresh_token` (rotación) · 401 |
| `POST /auth/logout` | 204, limpia cookies y revoca el refresh token |
| `GET /auth/me` | 200 `{user_id,role,must_change_password}` · 401 |
| `POST /auth/change-password` `{current_password,new_password}` | 204 + cookies nuevas · 400 · 422 |
| `POST /admin/users` `{email,password}` (admin) | 201 `{id,email,role}` · 403 · 409 · 422 · 503 |

Contrato completo: `.harness/specs/0002-auth/contracts/openapi.yaml`.

## Errores (SPEC-0004)

> **Cambio incompatible:** desde SPEC-0004 los errores ya no son `{"detail": "..."}`.
> Todo cliente debe leer el cuerpo Problem Details descrito abajo.

Toda respuesta 4xx/5xx es `application/problem+json` (RFC 9457):

```json
{
  "type": "urn:synapse:problem:validation-error",
  "title": "Validation error",
  "status": 422,
  "detail": "Request validation failed.",
  "instance": "/auth/change-password",
  "errors": [{"pointer": "#/new_password", "detail": "Password must be at least 10 characters long"}]
}
```

- `type` identifica el error y es lo que deben comparar los clientes: `urn:synapse:problem:<slug>`
  para los del catálogo, `about:blank` para los genéricos (404, 405, 500…), cuyo `title` es la
  frase HTTP. `title` y `detail` van en inglés; la UI traduce a partir de `type`.
- `instance` es la ruta pedida, sin query. `detail` y `errors` pueden faltar, nunca valen `null`.
- `errors` (sólo en 422) lleva un fallo por entrada con **una** ubicación: `pointer`
  (JSON Pointer al cuerpo; `#` si el JSON es inválido o falta), `parameter` (query/path) o
  `header`. Nunca se repite el valor enviado por el cliente, ni siquiera dentro del `detail`
  de una entrada: los mensajes de pydantic se regeneran sólo con los límites del esquema
  (p. ej. `String should have at most 5 characters`; en colecciones también el número de
  elementos, nunca los elementos) y, si dependen de otra cosa, valen `Invalid value.`.
- Un error no controlado es un 500 genérico; la traza va al log (`app.core.problems`), nunca
  a la respuesta. Si el propio traductor falla, responde un 500 de campos fijos más `instance`.
- Las operaciones declaran en el contrato los códigos de sus errores de dominio, el 422 y el
  500. Los errores de enrutado (404 de ruta inexistente, 405) no se declaran por operación,
  pero también salen como Problem Details.

**Catálogo** — vive en `app/core/errors.py` (cada clase es una entrada):

| `type` (slug) | Código | Cuándo |
|---|---|---|
| `not-authenticated` | 401 | falta la cookie `access_token` |
| `invalid-token` | 401 | JWT inválido, caducado, de versión anterior o de usuario inactivo |
| `invalid-credentials` | 401 | login fallido (mismo cuerpo exista o no el email) |
| `invalid-refresh-token` | 401 | refresh ausente, inválido, revocado o reutilizado |
| `admin-required` | 403 | ruta de admin sin rol admin |
| `password-change-required` | 403 | cambio de contraseña obligatorio pendiente |
| `wrong-current-password` | 400 | `change-password` con la contraseña actual errónea |
| `email-taken` | 409 | `POST /admin/users` con un email ya registrado |
| `validation-error` | 422 | cuerpo, query, path o cabecera inválidos; política de contraseña |
| `storage-unavailable` | 503 | CouchDB inaccesible |

**Añadir un error de dominio:**
1. Declara una subclase de `DomainError` en `core/errors.py` con `slug`, `title`, `status` y
   `detail` (inglés). `tests/test_problem_catalog.py` exige `type` único y bien formado.
2. Lánzala desde el servicio o la dependencia. El texto de la excepción es interno: se
   registra en `app.core.problems` (5xx en ERROR con traza y causa encadenada, 4xx en INFO)
   y nunca llega al cliente; para otro `detail` público pasa `detail=`. Nunca `HTTPException` fuera de
   `core/problems.py` (lo comprueba un test).
3. Declárala en la ruta con `responses=problem_responses(MiError)` para que salga en el contrato.
   En toda la suite, `ContractGuard` (`tests/contract_guard.py`, instalado en `conftest.py`)
   tumba cualquier petición cuyo código de error no esté declarado en su operación.

**Mensajes de validadores propios:** un validador de pydantic que quiera un texto concreto en
`errors[].detail` declara su código y su texto (inglés, sin `{}`) en `FIELD_ERROR_MESSAGES`
de `core/errors.py` y lanza `field_error("<código>")` (ver el del email en `core/schemas.py`).
El traductor publica el texto del catálogo por el código, nunca el mensaje lanzado; un
`ValueError` o un código no catalogado salen como `Invalid value.`. En `app/` sólo
`core/errors.py` y `core/problems.py` pueden usar `PydanticCustomError`/`PydanticKnownError`
(lo comprueba `tests/test_problem_catalog.py`).

## Contratos OpenAPI por feature

`python scripts/export_openapi.py` escribe un contrato por feature (`FEATURES` en el script):
`0002-auth` (rutas `/auth`, `/admin`, `/health`) y `0004-api-problem-details` (sólo los
esquemas `Problem`/`ProblemError`, el canon). Cada contrato lleva una copia de `Problem` para
ser autocontenido; `tests/test_contract.py` falla si un contrato difiere de la app, si una
ruta no tiene exactamente una feature dueña o si una copia de `Problem` difiere del canon.
Si cambias la API, re-exporta.

## Comandos

```bash
# Tests (requieren un CouchDB real; el control plane usa SQLite — excepción declarada en plan.md §7)
docker compose exec backend pytest -v

# Tests con umbral de cobertura (80 %, en .coveragerc)
docker compose exec backend pytest --cov=app

# Migraciones
docker compose exec backend alembic upgrade head

# Exportar los contratos OpenAPI (uno por feature)
python scripts/export_openapi.py
```
