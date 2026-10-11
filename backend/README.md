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
│   ├── core/         # config, seguridad (Argon2id), dependencias, esquemas, modelos
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

Contrato completo: `.harness/specs/0002-auth/contracts/openapi.yaml`. Si cambias la API,
re-expórtalo (`python scripts/export_openapi.py`); `tests/test_contract.py` falla si
el contrato y la app difieren.

## Comandos

```bash
# Tests (requieren un CouchDB real; el control plane usa SQLite — excepción declarada en plan.md §7)
docker compose exec backend pytest -v

# Tests con umbral de cobertura (80 %, en .coveragerc)
docker compose exec backend pytest --cov=app

# Migraciones
docker compose exec backend alembic upgrade head

# Exportar el contrato OpenAPI
python scripts/export_openapi.py
```
