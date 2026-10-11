---
id: TASKS-0002
tipo: tasks
feature: 0002-auth
estado: draft
actualizado: 2026-10-11
---

# TASKS-0002 · Autenticación y aislamiento por usuario

## Reglas
- Cada tarea: ≤ 30 min, un solo propósito, `(cubre RF-NNN)`, zona del patrón (o `[doc]`).
- Orden por dependencias. **Test antes que código.**
- Cada fila de `plan.md §8` → una tarea `[doc]`.

## Tareas
### A · Núcleo y configuración
- [x] T-001 — test: `Settings` sin `JWT_SECRET`/`ADMIN_*`/`COUCHDB_*` lanza `ValidationError` (cubre RF-002) [zona: test]
- [x] T-002 — quitar defaults de `config.py`, añadir `ADMIN_EMAIL`/`ADMIN_PASSWORD`; env de prueba en `conftest.py` (cubre RF-002) [zona: núcleo]
- [x] T-003 — test: hash Argon2id verificable y no reversible; política (≥10, distinta de la actual) (cubre RF-003, RF-018) [zona: test]
- [x] T-004 — `core/security.py`: hash/verify, política, SHA-256 de refresh (cubre RF-003, RF-018) [zona: núcleo]

### B · Datos
- [x] T-005 — test: modelo `RefreshToken` y `User.must_change_password` persisten (cubre RF-010, RF-019) [zona: test]
- [x] T-006 — `models/refresh_token.py` y columna `must_change_password` (cubre RF-010, RF-019) [zona: núcleo]
- [x] T-007 — migración Alembic `002` (columna + tabla + índice) y verificación `upgrade head` (cubre RF-010, RF-019) [zona: adaptador]
- [x] T-008 — ampliar `AuthPort`/`AuthRepository`: `commit`, `rollback`, `update_password`, CRUD de refresh tokens (cubre RF-009, RF-010, RF-017) [zona: puerto/adaptador]

### C · CouchDB y aprovisionamiento
- [x] T-009 — test integración (CouchDB real): `ensure_user_db` crea y es idempotente (412 = éxito) (cubre RF-014, RF-015) [zona: test]
- [x] T-010 — `CouchDBPort` + `adapters/couchdb.py` (cubre RF-014, RF-015) [zona: adaptador]
- [x] T-011 — test: `_provision_user` con doble que falla ⇒ rollback, sin fila en PG (cubre RF-015) [zona: test]
- [x] T-012 — `AuthService._provision_user` (insertar → CouchDB → commit / rollback) (cubre RF-015) [zona: servicio]

### D · Bootstrap
- [x] T-013 — test: arranque crea admin con `must_change_password=true` y base CouchDB; segundo arranque no duplica (cubre RF-001, RF-019) [zona: test]
- [x] T-014 — test: carrera de dos bootstraps ⇒ un solo admin (`IntegrityError` tratado) (cubre RF-016) [zona: test]
- [x] T-015 — `AuthService.bootstrap_admin` + `lifespan` en `main.py` (cubre RF-001, RF-016) [zona: servicio/ruta]

### E · Login, sesión y dependencias
- [x] T-016 — migrar `conftest.py`/`test_auth.py`: fixtures sin `/auth/register`, login con admin sembrado (cubre RF-004, RF-005) [zona: test]
- [x] T-017 — test: login válido emite `access_token` (24 h) y `refresh_token`; credenciales inválidas ⇒ 401 igual para email/contraseña (cubre RF-004, RF-005) [zona: test]
- [x] T-018 — ajustar `login` para emitir `refresh_token` (hash guardado, path `/auth`) y retirar `POST /auth/register` (cubre RF-004, RF-005) [zona: servicio/ruta]
- [x] T-019 — test: sin cookie / token inválido o expirado ⇒ 401; token en header `Authorization` ignorado (cubre RF-006, RF-008) [zona: test]
- [x] T-020 — verificar/ajustar `get_current_user` para pasar T-019 (cubre RF-006, RF-008) [zona: núcleo]
- [x] T-021 — test: `require_admin` ⇒ 403 a guest (cubre RF-007) [zona: test]
- [x] T-022 — verificar `require_admin` (cubre RF-007) [zona: núcleo]

### F · Refresh y logout
- [x] T-023 — test: refresh válido ⇒ nuevo `access_token`; inválido/expirado/revocado ⇒ 401 (cubre RF-010, RF-011) [zona: test]
- [x] T-024 — `AuthService.refresh` + `POST /auth/refresh` (cubre RF-010, RF-011) [zona: servicio/ruta]
- [x] T-025 — test: logout limpia ambas cookies y revoca el refresh (cubre RF-009) [zona: test]
- [x] T-026 — `AuthService.logout` + `POST /auth/logout` (cubre RF-009) [zona: servicio/ruta]

### G · Admin crea usuarios
- [x] T-027 — test: admin crea guest (201, `must_change_password=true`, base CouchDB existe); 409 email repetido; 403 a guest; 503 si falla CouchDB (cubre RF-012, RF-013, RF-015) [zona: test]
- [x] T-028 — `AuthService.create_guest_user` (cubre RF-012, RF-015) [zona: servicio]
- [x] T-029 — `routers/admin.py` `POST /admin/users` y registro en `main.py` (cubre RF-012, RF-013) [zona: ruta]

### H · Cambio de contraseña y forzado
- [x] T-030 — test: cambio correcto ⇒ 204, flag a false, refresh revocados; actual incorrecta ⇒ 400; política ⇒ 422 (cubre RF-017, RF-018) [zona: test]
- [x] T-031 — `AuthService.change_password` + `POST /auth/change-password` (cubre RF-017, RF-018) [zona: servicio/ruta]
- [x] T-032 — test: con flag activo, `/admin/users` ⇒ 403; `/auth/me`, `change-password`, `logout` permitidos; `/auth/me` devuelve el flag (cubre RF-019) [zona: test]
- [x] T-033 — `require_password_changed` aplicado a routers protegidos; `/auth/me` con `must_change_password` (cubre RF-019) [zona: núcleo/ruta]

### I · Aislamiento y flujo completo
- [x] T-034 — test: dos usuarios no acceden a datos del otro; ningún endpoint recibe `user_id` por parámetro (cubre RF-014) [zona: test]
- [x] T-035 — test e2e: bootstrap → login → forzado → cambio → admin crea guest → guest cambia clave (cubre RF-001, RF-012, RF-017, RF-019) [zona: test]

### J · Contrato
- [x] T-036 — script de export y `contracts/openapi.yaml` + test de deriva (cubre RF-004, RF-012, RF-017) [zona: contrato]

### K · Frontend
- [x] T-037 — scaffold Vite + React + TS + vitest (cubre RF-020) [zona: frontend]
- [x] T-038 — test: formulario de cambio (validación, errores 400/422) (cubre RF-020) [zona: test]
- [x] T-039 — `api/auth.ts` y `ChangePasswordPage.tsx` (cubre RF-020) [zona: frontend]
- [x] T-040 — test: guardia redirige a cambio si `must_change_password` (cubre RF-020) [zona: test]
- [x] T-041 — `LoginPage.tsx` y `RequireAuth.tsx` con rutas (cubre RF-020) [zona: frontend]

### L · No funcionales
- [x] T-042 — configurar `pytest --cov` con umbral 80 % en módulos de auth (cubre RNF-001) [zona: test]
- [x] T-043 — comprobar que la suite usa CouchDB real y declarar la excepción SQLite (cubre RNF-002) [zona: test]

### M · Documentación
- [ ] T-044 — exportar `contracts/openapi.yaml` final [doc]
- [ ] T-045 — actualizar `backend/README.md` (env, bootstrap, endpoints) [doc]
- [ ] T-046 — crear `.env.example` y revisar `docker-compose.yml` [doc]
- [ ] T-047 — actualizar `frontend/README.md` y `frontend/src/README.md` [doc]
- [ ] T-048 — corregir `TAREAS.md` T-001 (libs, 24 h, logout) [doc]
- [ ] T-049 — añadir diagrama de login/refresh/cambio forzado a `ARCHIFY.md` [doc]
- [ ] T-050 — reescribir `.harness/memory/state.md` y entrada Session-End en `history.md` [doc]

## Cobertura (el gate exige 100 %; `Estado` lo rellena el gate)
| RF / doc | Tareas | Test(s) | Estado |
|---|---|---|---|
| RF-001 | T-013, T-015, T-035 | test_bootstrap, test_flow | Pendiente |
| RF-002 | T-001, T-002 | test_config | Pendiente |
| RF-003 | T-003, T-004 | test_security | Pendiente |
| RF-004 | T-016–T-018, T-036 | test_auth | Pendiente |
| RF-005 | T-016–T-018 | test_auth | Pendiente |
| RF-006 | T-019, T-020 | test_auth | Pendiente |
| RF-007 | T-021, T-022 | test_auth | Pendiente |
| RF-008 | T-019, T-020 | test_auth | Pendiente |
| RF-009 | T-008, T-025, T-026 | test_refresh | Pendiente |
| RF-010 | T-005–T-008, T-023, T-024 | test_refresh | Pendiente |
| RF-011 | T-023, T-024 | test_refresh | Pendiente |
| RF-012 | T-027–T-029, T-035, T-036 | test_admin | Pendiente |
| RF-013 | T-027, T-029 | test_admin | Pendiente |
| RF-014 | T-009, T-010, T-034 | test_isolation | Pendiente |
| RF-015 | T-009–T-012, T-027, T-028 | test_provisioning | Pendiente |
| RF-016 | T-014, T-015 | test_bootstrap | Pendiente |
| RF-017 | T-008, T-030, T-031, T-035, T-036 | test_change_password | Pendiente |
| RF-018 | T-003, T-004, T-030, T-031 | test_change_password | Pendiente |
| RF-019 | T-005–T-007, T-013, T-032, T-033, T-035 | test_forced_change | Pendiente |
| RF-020 | T-037–T-041 | vitest | Pendiente |
| RNF-001 | T-042 | cov ≥ 80 % | Pendiente |
| RNF-002 | T-043 | — | Pendiente |
| doc: openapi | T-044 | — | Pendiente |
| doc: backend-readme | T-045 | — | Pendiente |
| doc: env-compose | T-046 | — | Pendiente |
| doc: frontend-readme | T-047 | — | Pendiente |
| doc: tareas-md | T-048 | — | Pendiente |
| doc: archify | T-049 | — | Pendiente |
| doc: state | T-050 | — | Pendiente |
