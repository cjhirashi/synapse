---
id: SPEC-0002
tipo: spec
feature: 0002-auth
estado: approved
anchor_commit: cf1632d
anchor_mode: advisory
covers:
  - frontend/src/**/settings/**
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
  - backend/tests/test_auth.py
aprobaciones:
  fase_1: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-11 }
  fase_2: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-11 }
actualizado: 2026-10-11
---

# SPEC-0002 · Autenticación y aislamiento por usuario

> Borrador **retroactivo** (brownfield): ancla lo implementado en `cf1632d` y
> propone la deuda pendiente. Sin aprobar: requiere elicitación con el usuario
> (`method.md §3`) y Gate 1.

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
| `POST /auth/login` `{email,password}` → 200 + cookies / 401 | entrada | REST | pendiente `openapi.yaml` |
| `POST /auth/logout` → 204, limpia cookies | entrada | REST | pendiente |
| `POST /auth/refresh` (cookie `refresh_token`) → 200 + nuevo `access_token` / 401 | entrada | REST | pendiente |
| `POST /auth/change-password` `{current_password,new_password}` → 204 / 400 / 401 | entrada | REST | pendiente |
| UI: sección "Cambiar contraseña" | salida | Frontend React | — |
| `GET /auth/me` → 200 `{user_id,role,must_change_password}` / 401 | entrada | REST | pendiente |
| `POST /admin/users` `{email,password}` → 201 `{id,email,role:"guest"}` / 403 / 409 | entrada | REST | pendiente |
| Creación de base `synapse_user_{id}` (PUT idempotente) | salida | HTTP CouchDB | — |
- JWT: `sub`, `role`, `exp` únicamente. Cookies `httpOnly`, `Secure`, `SameSite=Lax`.
- Tabla `refresh_tokens(id, user_id, token_hash, expires_at, revoked, created_at)`; nunca el token en claro.
- Errores: formato `{"detail": ...}` de FastAPI (RFC 9457 queda fuera de esta spec).

## 4. Criterios de aceptación (EARS)
- **RF-001** — CUANDO la aplicación arranca y no existe ningún usuario, el sistema DEBE crear el admin con `ADMIN_EMAIL`/`ADMIN_PASSWORD` y su base CouchDB `synapse_user_{id}`; si ya existe, DEBE ser idempotente (no duplica).
- **RF-002** — SI faltan `JWT_SECRET`, `ADMIN_PASSWORD` o credenciales de CouchDB en el entorno ENTONCES el sistema DEBE negarse a arrancar.
- **RF-003** — El sistema DEBE almacenar contraseñas con Argon2id, nunca en claro.
- **RF-004** — CUANDO las credenciales de `POST /auth/login` son válidas, el sistema DEBE emitir un JWT de 24 h en cookie `access_token` y un refresh token en cookie `refresh_token`.
- **RF-005** — SI el email no existe O la contraseña no coincide ENTONCES login DEBE responder 401 con el mismo mensaje.
- **RF-006** — SI falta la cookie, o el JWT es inválido o expirado ENTONCES todo endpoint protegido DEBE responder 401.
- **RF-007** — SI el rol del token no es `admin` ENTONCES `require_admin` DEBE responder 403.
- **RF-008** — El sistema DEBE leer el token sólo de la cookie `access_token`, nunca de `Authorization`.
- **RF-009** — CUANDO llega `POST /auth/logout`, el sistema DEBE limpiar ambas cookies y revocar el refresh token.
- **RF-010** — CUANDO llega `POST /auth/refresh` con refresh token válido, no expirado ni revocado, el sistema DEBE emitir un nuevo `access_token`.
- **RF-011** — SI el refresh token es inválido, expirado o revocado ENTONCES `POST /auth/refresh` DEBE responder 401.
- **RF-012** — CUANDO un admin llama `POST /admin/users` con datos válidos, el sistema DEBE crear un usuario `guest` con `must_change_password=true` y su base CouchDB, y responder 201.
- **RF-013** — SI el email ya existe ENTONCES `POST /admin/users` DEBE responder 409; SI el llamante no es admin, 403.
- **RF-014** — Cada usuario DEBE tener su propia base `synapse_user_{id}`; ningún endpoint DEBE exponer datos de otro usuario (P2, P3).

- **RF-017** — CUANDO un usuario autenticado llama `POST /auth/change-password` con su contraseña actual correcta y una nueva válida (≥ 10 caracteres, distinta de la actual), el sistema DEBE guardarla con Argon2id, revocar sus refresh tokens y responder 204.
- **RF-018** — SI la contraseña actual es incorrecta ENTONCES DEBE responder 400 y no modificar nada; SI la nueva no cumple la política, 422.
- **RF-019** — Todo usuario creado con contraseña asignada (admin sembrado en el bootstrap y guests creados por `/admin/users`) DEBE quedar con `must_change_password=true`, que se desactiva al cambiar la contraseña (RF-017); MIENTRAS ese indicador esté activo, el sistema DEBE rechazar con 403 todo endpoint salvo `/auth/me`, `/auth/change-password` y `/auth/logout`.
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
| Contraseña semilla `admin1234` vía `ADMIN_PASSWORD` en `.env` local (no versionado) + cambio forzado | Decisión del usuario; mitiga clave conocida | Contraseña fija en código/repo; semilla aleatoria | — |

## 7. Requisitos no funcionales
- **RNF-001** — Cobertura de tests ≥ 80 % en el módulo auth.
- **RNF-002** — Tests contra BD real (P5).

## Marcadores abiertos
- `[NEEDS CLARIFICATION: ninguno, salvo confirmar la interpretación del punto 5 (admin sembrado desde entorno con ADMIN_EMAIL=cjhirashi@gmail.com, contraseña por variable de entorno) y retirar POST /auth/register.]`
