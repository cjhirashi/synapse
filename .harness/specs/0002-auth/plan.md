---
id: PLAN-0002
tipo: plan
feature: 0002-auth
estado: approved
aprobaciones:
  fase_2: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-11 }
actualizado: 2026-10-11
---

# PLAN-0002 · Autenticación y aislamiento por usuario

> El *cómo* de SPEC-0002. Parte del código de `cf1632d` (brownfield): se reutiliza y
> se completa, no se reescribe.

## 0. Gates de simplicidad
- [x] Simplicity — se extiende el módulo existente; sin librerías de auth nuevas.
- [x] Anti-Abstraction — un único puerto nuevo (`CouchDBPort`), justificado por RF-015 y por poder probar el rollback.
- [x] Integration-First — `contracts/openapi.yaml` se genera y versiona antes de implementar endpoints nuevos.

## 1. Cumplimiento constitucional
| Artículo | Cómo lo respeta este plan |
|---|---|
| Art. 1–2 (patrón) | **Aviso:** el Art. 2 de `constitution.md` sigue con la plantilla sin rellenar (`‹…›`). El código actual usa puertos/adaptadores ligeros (`core/ports`, `adapters`, `services`, `routers`), y el plan lo mantiene. Propongo fijarlo en un `ADR-001` antes del Gate 2. |
| Art. 3 (testing) | TDD, ≥ 80 % en auth; tests de integración con CouchDB real. |
| Art. 5 (seguridad) / P1–P5 | P2/P3: cada endpoint deriva el usuario del JWT, nunca de parámetros; P4: sin secretos en repo (sin defaults en `config.py`); `admin1234` sólo en `.env` local. P5: ver §7. |
| Art. 11 (docs) | §8. |
| Art. 12 | 3 archivos + `contracts/`. |

## 2. Arquitectura de la feature (por-capas con puertos)
### Núcleo (`core/`)
- Modelos: `User` (+ `must_change_password`), `RefreshToken` (nuevo, `core/models/refresh_token.py`).
- Política de contraseña (≥ 10 caracteres, distinta de la actual) como función pura en `core/security.py` (hash Argon2id, verificación, política, hash SHA-256 de refresh).
- Puertos: `AuthPort` (+ `commit`, `rollback`, `update_password`, refresh tokens) y `CouchDBPort` (`ensure_user_db(name)`).
- Dependencias FastAPI: `get_current_user` (sin cambio, sólo cookie), `require_admin`, y nueva `require_password_changed` (consulta BD: `must_change_password`).
  El JWT conserva `sub`/`role`/`exp` únicamente, por eso el indicador se lee de la BD.

### Coordinación (`services/auth_service.py`)
`AuthService` con: `bootstrap_admin`, `login`, `create_token`, `create_refresh_token`, `refresh`, `logout`, `change_password`, `create_guest_user`. Un solo helper privado `_provision_user` (inserta → `ensure_user_db` → commit; si falla, rollback) usado por bootstrap y guests.

### Rutas (`routers/`)
- `auth.py`: `login`, `logout`, `refresh`, `me`, `change-password`; se **elimina** `register`.
- `admin.py` (nuevo): `POST /admin/users` con `Depends(require_admin)` y `require_password_changed`.
- `main.py`: `lifespan` que valida entorno y llama `bootstrap_admin`.

### Fronteras de salida
| Frontera | Para qué | Implementación concreta |
|---|---|---|
| PostgreSQL | usuarios, roles, refresh tokens | `AuthRepository` (SQLAlchemy) |
| CouchDB | base `synapse_user_{id}` | `adapters/couchdb.py` (`httpx`, `PUT`; 412 = éxito) |

### Frontend (`frontend/`)
Hoy sólo hay READMEs. Para RF-020 se crea el **mínimo**: proyecto Vite + React + TypeScript con `LoginPage`, `ChangePasswordPage`, `api/auth.ts` (`fetch` con `credentials:'include'`) y guardia de ruta que redirige a cambio de contraseña si `must_change_password`. Sin PouchDB ni editor (sprints posteriores). Dependencias nuevas justificadas: `react`, `react-dom`, `react-router-dom`, `vite`, `typescript`, `vitest` + `@testing-library/react`.

## 3. Modelo de datos
- Migración `002`: `users.must_change_password BOOLEAN NOT NULL DEFAULT false`; tabla `refresh_tokens(id, user_id FK, token_hash UNIQUE, expires_at, revoked, created_at)` con índice en `user_id`.
- El email ya es `UNIQUE` (cubre RF-016).
- Cookies: `access_token` (24 h, path `/`), `refresh_token` (30 días, path `/auth`), ambas `httpOnly; Secure; SameSite=Lax`.
- `config.py`: `DATABASE_URL`, `COUCHDB_*`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` **sin valor por defecto** (pydantic falla al arrancar, RF-002).

## 4. Contratos
| Archivo en `contracts/` | Frontera | Gate(s) de CI |
|---|---|---|
| `openapi.yaml` (exportado desde FastAPI con script) | REST de auth y admin | test de deriva (el export debe coincidir con el committeado); Spectral/oasdiff quedan para cuando exista CI |

## 5. Estrategia de pruebas (TDD)
| Zona | Qué se prueba | Herramienta |
|---|---|---|
| Núcleo | política de contraseña, hashes | pytest unit |
| Coordinación | rollback si falla CouchDB, bootstrap idempotente, revocación | pytest + doble de `CouchDBPort` |
| Rutas/fronteras | contratos de cada endpoint, 401/403/409/503, aislamiento | pytest + TestClient + **CouchDB real** |
| Frontend | formulario, redirección forzada | vitest + Testing Library |
| Sistema | login → forzado → cambio → `/auth/me` | pytest de flujo completo |

## 6. Secuenciación
1. Tests (rojos) de núcleo → migración 002 y modelos → servicio → rutas → `main` lifespan.
2. Actualizar `conftest.py` (variables de entorno de prueba, fixtures sin `/auth/register`) y migrar `test_auth.py`.
3. Export de `contracts/openapi.yaml`.
4. Frontend (tests primero).
5. Tareas `[doc]` de §8.

## 7. Seguimiento de complejidad / riesgos
| Excepción | Justificación |
|---|---|
| Tests de control plane en **SQLite**, no PostgreSQL | Ya así en `conftest.py`; contradice P5. Propongo pasar a PostgreSQL real en una feature aparte; aquí se mantiene y se declara. |
| `require_password_changed` consulta BD en cada petición protegida | Mantiene el JWT mínimo decidido; coste de una lectura por clave primaria, aceptable. |
| Scaffold de frontend dentro de esta feature | RF-020 lo exige; limitado al mínimo. |
| Se elimina `POST /auth/register` | Cambio de contrato deliberado (spec §2). |

## 8. Impacto en documentación (Art. 11)
| Documento del mapa | Qué cambia | Acción |
|---|---|---|
| `contracts/openapi.yaml` | endpoints nuevos y retirada de `register` | crear/exportar |
| `backend/README.md` | variables de entorno, bootstrap, endpoints | actualizar |
| `.env.example` (nuevo) + `docker-compose.yml` | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET` obligatorios | crear / revisar `environment` |
| `frontend/README.md`, `frontend/src/README.md` | estructura y comandos | actualizar |
| `TAREAS.md` (T-001) | corregir libs (argon2-cffi/PyJWT), 24 h, logout, sin passlib | actualizar |
| `ARCHIFY.md` | flujo de login/refresh/cambio forzado | añadir diagrama |
| `.harness/memory/state.md` | rama real y próximo paso | actualizar en el cierre |

## 9. Implementación por requisito
- **RF-001, RF-016** — `AuthService.bootstrap_admin` + `lifespan` en `main.py`; `UNIQUE(email)`; captura de `IntegrityError` como idempotencia. Tests: `test_bootstrap.py`.
- **RF-002** — `core/config.py` sin defaults; test que importa `Settings` sin variables y espera `ValidationError`.
- **RF-003** — `core/security.py`; `test_security.py`.
- **RF-004, RF-005, RF-006, RF-008** — `AuthService.login/create_token`, `routers/auth.py`, `core/dependencies.py` (existentes; se ajusta login para emitir `refresh_token`); `test_auth.py`.
- **RF-007, RF-013** — `require_admin` en `routers/admin.py`; `test_admin.py`.
- **RF-009** — `routers/auth.py::logout` + `AuthPort.revoke_refresh_tokens`; `test_auth.py`.
- **RF-010, RF-011** — `AuthService.refresh`, `models/refresh_token.py`, migración 002; `test_refresh.py`.
- **RF-012, RF-015** — `AuthService.create_guest_user/_provision_user`, `adapters/couchdb.py`; `test_admin.py` y `test_provisioning.py` (doble que falla → 503 y sin fila en PG).
- **RF-014** — `test_isolation.py`: dos usuarios, cada uno sólo ve su `couchdb_name`/`/auth/me`; ningún endpoint acepta `user_id` por parámetro.
- **RF-017, RF-018** — `AuthService.change_password`, `routers/auth.py`; `test_change_password.py`.
- **RF-019** — `require_password_changed` aplicado a routers protegidos; `test_forced_change.py`.
- **RF-020** — `frontend/src/pages/ChangePasswordPage.tsx`, `LoginPage.tsx`, `RequireAuth.tsx`; tests vitest.

`covers` (a ampliar en `spec.md` al cierre): `backend/app/**` de auth/admin, `backend/alembic/versions/*002*`, `backend/tests/test_*{auth,admin,refresh,...}*`, `contracts/openapi.yaml`, `frontend/src/**`, `.env.example`.
