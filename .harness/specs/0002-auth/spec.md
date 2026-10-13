---
id: SPEC-0002
tipo: spec
feature: 0002-auth
estado: implemented
anchor_commit: d730de9   # re-anclaje por SPEC-0003 enmienda 1 (core/schemas.py)
anchor_mode: advisory
covers:
  - frontend/src/**/settings/**
  - frontend/src/auth/**
  - frontend/src/api/auth.ts
  - frontend/src/App.tsx
  - frontend/src/layout/**
  - backend/app/bootstrap.py
  - backend/app/core/security.py
  - backend/app/core/config.py
  - backend/alembic/versions/*refresh_tokens*
  - backend/scripts/export_openapi.py
  - backend/app/routers/admin.py
  - backend/app/core/models/refresh_token.py
  - backend/app/routers/auth.py
  - backend/app/services/auth_service.py
  - backend/app/adapters/auth_repository.py
  - backend/app/core/ports/auth_port.py
  - backend/app/core/dependencies.py
  - backend/app/core/schemas.py
  - backend/app/core/models/**
  - backend/alembic/versions/*initial_auth*
  - backend/alembic/versions/*normalize_email*
  - backend/alembic/versions/*token_version*
  - backend/tests/conftest.py
  - backend/tests/test_admin.py
  - backend/tests/test_auth.py
  - backend/tests/test_bootstrap.py
  - backend/tests/test_change_password.py
  - backend/tests/test_config.py
  - backend/tests/test_contract.py
  - backend/tests/test_couchdb_adapter.py
  - backend/tests/test_flow.py
  - backend/tests/test_forced_change.py
  - backend/tests/test_health.py
  - backend/tests/test_isolation.py
  - backend/tests/test_models.py
  - backend/tests/test_provisioning.py
  - backend/tests/test_real_backends.py
  - backend/tests/test_refresh.py
  - backend/tests/test_security.py
aprobaciones:
  fase_1: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-11 }
  fase_2: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-11 }
  enmienda_1: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-11 }
  enmienda_2: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-11 }
  pr_3: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-11 }
actualizado: 2026-10-12
---

# SPEC-0002 · Autenticación y aislamiento por usuario

> Spec **retroactivo** (brownfield): ancló lo implementado en `cf1632d` y la deuda
> pendiente. Aprobado (Gates 1 y 2) e implementado; pendiente de verificación y
> aprobación humana del PR.
>
> **Enmienda 2026-10-11** (tras verificación adversarial, V-1/V-2/V-3/G-1): RF-005,
> RF-012, RF-013 y RF-019 precisados. Aprobada por el usuario el 2026-10-11.
>
> **Enmienda 2 2026-10-11** (residuales R-1…R-6 del verificador, dirigida por el usuario):
> RF-014 reforzado; RF-017 y RF-010 precisados; nuevos RF-021…RF-023. Aprobada por el usuario.
>
> **Re-anclaje 2026-10-11** (PLAN-0004 §7, T-001 de TASKS-0004): `covers` deja de
> reclamar `backend/tests/**` y lista sólo los tests de esta feature, para que los tests
> de otras features (`test_problem*`, `test_vault*`) no provoquen DRIFT aquí. Sin cambio
> de requisitos.
>
> **Formato de errores → SPEC-0004 (2026-10-11, T-036 de TASKS-0004):** los códigos HTTP
> de esta spec se mantienen, pero el cuerpo de todo error es ahora un Problem Details
> (RFC 9457, `application/problem+json`) definido por SPEC-0004. Servicios y dependencias
> lanzan errores de dominio (`core/errors.py`); el contrato `contracts/openapi.yaml` se
> re-exportó con esas respuestas. Ancla movida a `f28e063`. Sin cambio de requisitos.
>
> **Re-anclaje 2026-10-12** (PLAN-0003 §10, T-051 de TASKS-0003): SPEC-0003 (bóvedas) tocó
> archivos de estos `covers` sin cambiar ningún requisito de esta spec: `core/schemas.py`
> (esquemas de bóveda), `scripts/export_openapi.py` (feature `0003-vault-crud`),
> `tests/conftest.py` (marca `perf` de RNF-001), `tests/test_contract.py` (contrato
> de 0003), `App.tsx` (rutas `/vaults/**`, `/` → `/vaults`), `layout/AppLayout.tsx` y su test
> (navegación Bóvedas/Papelera) y `api/auth.ts` (`request` exportado para `api/vaults.ts`).
> Ancla movida a `4a07556`. Sin cambio de requisitos.

## 1. Contexto del dominio
- Synapse necesita identificar usuarios y garantizar que cada uno sólo acceda a su
  propia bóveda (P2, P3). Control plane en PostgreSQL; datos en una base CouchDB por usuario.
- Dependencias: PostgreSQL (usuarios/roles), CouchDB (`synapse_user_{id}`).

## 2. Alcance
### En alcance
- Bootstrap del admin desde entorno (`ADMIN_EMAIL`=cjhirashi@gmail.com, `ADMIN_PASSWORD`) con alta de su base CouchDB. Sustituye a `POST /auth/register` abierto.
- Login con Argon2id; JWT (24 h) en cookie httpOnly.
- `POST /auth/logout`, `POST /auth/refresh` (refresh token de 30 días, guardado hasheado, tabla `refresh_tokens`).
- `POST /admin/users`: el admin crea usuarios `guest` con su base CouchDB.
- `GET /auth/me`; dependencias `get_current_user` y `require_admin`.
- `POST /auth/change-password` y una sección "Cambiar contraseña" en el frontend (ajustes de cuenta), disponible para todo usuario autenticado.
- Configuración sensible exclusivamente desde entorno.

### Fuera de alcance
- Gestión de bóvedas (SPEC-0003), sincronización (spec propia), IA interna.
- Bases CouchDB de equipo (no existen en el MVP), flujo de invitación, registro público.

## 3. Modelo de datos y contratos de E/S
| Frontera | Dirección | Tipo | Contrato |
|---|---|---|---|
| `POST /auth/login` `{email,password}` → 200 + cookies / 401 | entrada | REST | `contracts/openapi.yaml` |
| `POST /auth/logout` → 204, limpia cookies | entrada | REST | `contracts/openapi.yaml` |
| `POST /auth/refresh` (cookie `refresh_token`) → 200 + nuevos `access_token` y `refresh_token` / 401 | entrada | REST | `contracts/openapi.yaml` |
| `POST /auth/change-password` `{current_password,new_password}` → 204 + cookies nuevas / 400 / 401 | entrada | REST | `contracts/openapi.yaml` |
| UI: sección "Cambiar contraseña" | salida | Frontend React | — |
| `GET /auth/me` → 200 `{user_id,role,must_change_password}` / 401 | entrada | REST | `contracts/openapi.yaml` |
| `POST /admin/users` `{email,password}` → 201 `{id,email,role:"guest"}` / 403 / 409 | entrada | REST | `contracts/openapi.yaml` |
| Creación de base `synapse_user_{id}` (PUT idempotente) | salida | HTTP CouchDB | — |
- JWT: `sub`, `role`, `exp` y `ver` (versión de credenciales del usuario) únicamente. Cookies `httpOnly`, `Secure`, `SameSite=Lax`.
- Tabla `refresh_tokens(id, user_id, token_hash, expires_at, revoked, created_at)`; nunca el token en claro.
- Errores: formato `{"detail": ...}` de FastAPI (RFC 9457 queda fuera de esta spec).

## 4. Criterios de aceptación (EARS)
- **RF-001** — CUANDO la aplicación arranca y no existe ningún usuario, el sistema DEBE crear el admin con `ADMIN_EMAIL`/`ADMIN_PASSWORD` y su base CouchDB `synapse_user_{id}`; si ya existe, DEBE ser idempotente (no duplica).
- **RF-002** — SI faltan `JWT_SECRET`, `ADMIN_PASSWORD` o credenciales de CouchDB en el entorno ENTONCES el sistema DEBE negarse a arrancar.
- **RF-003** — El sistema DEBE almacenar contraseñas con Argon2id, nunca en claro.
- **RF-004** — CUANDO las credenciales de `POST /auth/login` son válidas, el sistema DEBE emitir un JWT de 24 h en cookie `access_token` y un refresh token en cookie `refresh_token`.
- **RF-005** — SI el email no existe O la contraseña no coincide ENTONCES login DEBE responder 401 con el mismo mensaje, y DEBE ejecutar la verificación Argon2id en ambos casos (sin diferencia de tiempo que permita enumerar emails).
- **RF-006** — SI falta la cookie, o el JWT es inválido o expirado ENTONCES todo endpoint protegido DEBE responder 401.
- **RF-007** — SI el rol del token no es `admin` ENTONCES `require_admin` DEBE responder 403.
- **RF-008** — El sistema DEBE leer el token sólo de la cookie `access_token`, nunca de `Authorization`.
- **RF-009** — CUANDO llega `POST /auth/logout`, el sistema DEBE limpiar ambas cookies y revocar el refresh token.
- **RF-010** — CUANDO llega `POST /auth/refresh` con refresh token válido, no expirado ni revocado, el sistema DEBE emitir un nuevo `access_token` y **rotar** el refresh token: revocar el usado y emitir uno nuevo en la cookie `refresh_token`.
- **RF-011** — SI el refresh token es inválido, expirado o revocado ENTONCES `POST /auth/refresh` DEBE responder 401.
- **RF-012** — CUANDO un admin llama `POST /admin/users` con datos válidos (email con formato `local@dominio.tld`; si no, 422), el sistema DEBE crear un usuario `guest` con `must_change_password=true` y su base CouchDB, y responder 201.
- **RF-013** — SI el email ya existe ENTONCES `POST /admin/users` DEBE responder 409; SI el llamante no es admin, 403. Los emails DEBEN normalizarse (sin espacios, en minúsculas) al guardar y al hacer login: dos emails que sólo difieren en mayúsculas son el mismo usuario.
- **RF-014** — Cada usuario DEBE tener su propia base `synapse_user_{id}`; ningún endpoint DEBE exponer datos de otro usuario (P2, P3): ninguna respuesta de un endpoint `GET` protegido, pedida por un usuario, DEBE contener el id, email ni base CouchDB de otro, y las bases `synapse_user_{id}` NO DEBEN ser accesibles sin credenciales de CouchDB.

- **RF-017** — CUANDO un usuario autenticado llama `POST /auth/change-password` con su contraseña actual correcta y una nueva válida (≥ 10 caracteres, distinta de la actual), el sistema DEBE guardarla con Argon2id, revocar sus refresh tokens, invalidar todo access token emitido antes del cambio (RF-021) y responder 204 con cookies `access_token`/`refresh_token` nuevas para la sesión actual.
- **RF-018** — SI la contraseña actual es incorrecta ENTONCES DEBE responder 400 y no modificar nada; SI la nueva no cumple la política, 422.
- **RF-019** — Todo usuario creado con contraseña asignada (admin sembrado en el bootstrap y guests creados por `/admin/users`) DEBE quedar con `must_change_password=true`, que se desactiva al cambiar la contraseña (RF-017); MIENTRAS ese indicador esté activo, el sistema DEBE rechazar con 403 todo endpoint protegido salvo `/auth/me`, `/auth/change-password`, `/auth/logout` y `/auth/refresh`.
- **RF-021** — SI un access token se emitió antes del último cambio de contraseña del usuario (su `ver` no coincide con la versión de credenciales guardada) ENTONCES todo endpoint protegido DEBE responder 401.
- **RF-022** — SI se presenta a `POST /auth/refresh` un refresh token que ya fue rotado (reutilización) ENTONCES el sistema DEBE responder 401 y revocar todos los refresh tokens activos del usuario.
- **RF-023** — El frontend DEBE mostrar a todo usuario autenticado un enlace a "Cambiar contraseña" y un botón "Cerrar sesión" (que llama a `POST /auth/logout` y lleva a `/login`); y CUANDO una petición a la API responde 401 (salvo login, refresh y logout), el cliente DEBE llamar una sola vez a `POST /auth/refresh` (una única renovación en curso, compartida entre peticiones y pestañas) y repetir la petición; si la renovación falla, DEBE tratar la sesión como cerrada.
- **RF-020** — El frontend DEBE ofrecer una sección "Cambiar contraseña" accesible a todo usuario autenticado, y DEBE redirigir a ella mientras `must_change_password` sea true.

## 5. Casos límite y manejo de errores
- **RF-015** — SI falla la creación de la base CouchDB al dar de alta un usuario (bootstrap o `/admin/users`) ENTONCES el sistema DEBE revertir la transacción de PostgreSQL y responder 503 (en `/admin/users`); el reintento DEBE ser seguro porque la creación de la base es idempotente (CouchDB 412 "ya existe" se trata como éxito).
- **RF-016** — El bootstrap DEBE ser seguro ante varias réplicas arrancando a la vez (restricción única en email + manejo del conflicto).

## 6. Registro de decisiones y descartes
| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| Argon2id (`argon2-cffi`), PyJWT; se mantiene el código | Ya implementado y probado | passlib / python-jose (TAREAS.md) | — |
| JWT en cookie httpOnly, 24 h | Decisión del usuario | 14 días | — |
| Admin sembrado desde entorno | Elimina carrera y registro abierto | `POST /auth/register` público | — |
| Rollback de PG si falla CouchDB + PUT idempotente | Sin usuarios huérfanos, reintento seguro | Reconciliación diferida | — |
| Refresh token hasheado (SHA-256), 30 días | Diseño de la cola de Cowork | Token sin persistir | — |
| Secretos sólo de entorno | P4 | Defaults en `config.py` | — |
| Guests creados por el admin con la misma contraseña semilla (la entrega el admin en el body) y cambio forzado | Decisión del usuario | Contraseña aleatoria / enlace de activación | — |
| Enmienda 2026-10-11 (verificación adversarial, dirigida por el usuario): `/auth/refresh` en la lista blanca de RF-019 | El refresh no da acceso a datos; bloquearlo sólo forzaría re-login | Bloquear refresh con el indicador activo | — |
| Emails normalizados (strip + minúsculas) + índice único sobre `lower(email)` (migración 003) | Evita cuentas duplicadas por mayúsculas | Comparación case-insensitive sólo en consultas | — |
| Login verifica contra un hash Argon2id ficticio si el usuario no existe o está inactivo | Elimina enumeración por tiempo | Retardo artificial fijo | — |
| Validación de formato de email por regex simple (422) | Sin dependencias nuevas | `email-validator` / `EmailStr` | — |
| Enmienda 2: claim `ver` + `users.token_version` (se incrementa al cambiar la contraseña) | Invalida access tokens antiguos al instante y sin ambigüedad de reloj; la BD ya se consulta por petición | `iat` vs `password_changed_at` (empates en el mismo segundo); lista negra de JTI | — |
| Rotación de refresh con detección de reutilización sólo para tokens **rotados** (`refresh_tokens.rotated`) | Detecta robo sin que un token revocado por logout o cambio de contraseña dispare la revocación masiva | Rotación sin detección; detección sobre cualquier revocado | — |
| Frontend: renovación única serializada entre pestañas con Web Locks (fallback a una promesa compartida) | Evita que dos pestañas roten a la vez y disparen la detección de reutilización | Ventana de gracia en el backend | — |
| Tras cambiar la contraseña se emiten cookies nuevas | El usuario no pierde la sesión actual pese a RF-021 | Forzar re-login | — |
| Contraseña semilla `admin1234` vía `ADMIN_PASSWORD` en `.env` local (no versionado) + cambio forzado | Decisión del usuario; mitiga clave conocida | Contraseña fija en código/repo; semilla aleatoria | — |

## 7. Requisitos no funcionales
- **RNF-001** — Cobertura de tests ≥ 80 % en el módulo auth.
- **RNF-002** — Tests contra BD real (P5).

## Marcadores abiertos
- Ninguno (interpretación del admin sembrado y retirada de `POST /auth/register` confirmadas por el usuario).
