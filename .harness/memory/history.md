# History — Synapse

## [2026-10-11] Sprint 1 (0002-auth) — COMPLETADO Y VERIFICADO

**Fase alcanzada:** Implement → Verify (ciclo completo Specify → Plan → Tasks → Implement → Verify)

**Bloques ejecutados:**
- **A-D:** Config sin defaults, seguridad (Argon2id, JWT, CORS, CSRF), migración 002, CouchDB, bootstrap admin
- **E-H:** Endpoints auth (login, logout, /admin/users, password change/force) con refresh token + httpOnly cookies
- **I-J:** Aislamiento de datos (P3 validation), E2E tests, contrato OpenAPI con test de deriva
- **K:** Frontend (login form, guardia must_change_password, cambio password) + offline-first
- **L:** Tests 80%+ cobertura (85-90%), CouchDB real (no mocks), suite backend 84/84 ✅
- **M:** Documentación (OpenAPI, README, .env.example), diagrama Archify (auth-flow), state.md actualizado, cierre de SPEC-0002

**Rebotes del verificador:** 1 (verificación adversarial → enmienda de spec → re-verificación pasada)
- V-1 (refresh bloqueado) → whitelist `/auth/refresh`
- V-2 (emails case-sensitive) → normalizar emails + índice unique `lower(email)`
- V-3 (enumeración por tiempo) → hash Argon2id ficticio en login
- G-1 (formato email sin validar) → regex sin dependencias nuevas
- Resultado final: todos los casos pasan ✅

**Directiva de Pausa:** sí (conflicto state.md / Cowork / TAREAS.md → user fijó state.md como autoridad)

**Drift / re-anchor:** sí (SPEC-0002 retroactivo sobre `cf1632d`, covers ampliado, enmiendas enmendadas)

**Gate:** ✅ Verde (17 ok, 1 warn: spectral no instalado)

**Docs actualizadas:**
- `.harness/specs/0002-auth/spec.md` (RF 10, 14, 17, 21-23 precisados)
- `.harness/specs/0002-auth/plan.md` (bloques A-M ordenados)
- `.harness/specs/0002-auth/tasks.md` (T-001...T-058)
- `backend/app/security.py`, `backend/app/db.py`, `backend/migrations/002`, `backend/migrations/003`
- `frontend/src/pages/Login.tsx`, `frontend/src/hooks/useAuth.ts`
- `contracts/openapi.yaml` (auth paths + schemas)
- `backend/README.md`, `frontend/README.md`, `.env.example`
- `ARCHIFY.md` (diagrama auth-flow.html generado)
- `.harness/memory/state.md` (decisiones, P1-P5 validadas)

**Decisiones de diseño / límites de integración:**
- Admin seeded desde env, `/auth/register` retirado
- JWT 24h + refresh 30d hasheado
- `must_change_password` leído de BD (JWT mínimo)
- Rollback PG si falla CouchDB
- Excepción P5: control plane en SQLite
- Email normalized con índice unique `lower(email)`
- Argon2id hash ficticio en timing attacks

**Commits:** 15 (64d2a44...9f2b354)
- Setup harness: `5dca603`, `88b2aa9`, `4f0d495`
- Spec/Plan/Tasks: `1d5c451`
- Bloques A-D: `64d2a44`
- Docs (ARCHIFY, bitácora): `f8e54fb`
- Bloques E-H: `bcc2a23`
- Bloques I-J: `1d4780e`
- Bloque K: `e5cc5ca`
- Bloque L: `08a660d`
- Bloque M: `71b8d45`
- Anchor fijado: `03ffe94`
- Merge dev: `13b26c9`
- Fix adversarial (V-1, V-2, V-3, G-1): `9f2b354`

**Próximo paso:**
1. Decisión: ¿abrir 0003-vault-crud (Sprint 2) o manejar R-1…R-6 (residuales de la enmienda)?
2. Si 0003: crear spec.md, plan.md, tasks.md (CRUD bóvedas + aislamiento + tests)
3. Si residuales: redactar enmienda R-1…R-6, ejecutar verificación, decidir

---

## [2026-10-11] 0002-auth — enmienda 2: residuales R-1…R-6
- **Fase alcanzada:** implement (enmienda Specify → Plan → Tasks → Implement)
- **Rebotes del verificador:** 1 (re-verificación: W-1 carrera en refresh, W-2 sesión cerrada en RF-023; corregidos y re-verificados sin hallazgos)
- **Directiva de Pausa:** no
- **Drift / re-anchor:** sí (`covers` + `App.tsx`, `layout/**`, `*token_version*`)
- **Anclas movidas:** SPEC-0002 → `028c2ba`
- **Docs actualizadas:** spec.md, plan.md, tasks.md (bloques O y P), backend/README.md, frontend/src/README.md, ARCHIFY.md, state.md (contrato re-exportado sin cambios)
- **Próximo paso:** aprobación humana del PR #3; después limpieza de `docker-compose.yml` y 0003-vault-crud.
- **Aprobaciones:** enmienda 1 (V-1/V-2/V-3/G-1) aprobada por el usuario; enmienda 2 aprobada por el usuario.
- **Registro de tareas:**
  - [2026-10-11] Fase 1/2/3 — spec (RF-010, RF-014, RF-017 precisados; RF-021…RF-023 nuevos), plan y bloque O (T-059…T-068) redactados.
  - [2026-10-11] T-059, T-060 — tests de RF-021/RF-017 y RF-010/RF-022 escritos; en rojo (7 fallos esperados).
  - [2026-10-11] T-061 — `test_isolation.py`: recorre todo GET protegido del contrato como A y B sin filtrar identificadores del otro; bases CouchDB sin credenciales → 401. Pasa (guarda activa para 0003).
  - [2026-10-11] T-062 — migración `004_token_version` (`users.token_version`, `refresh_tokens.rotated`) y modelos.
  - [2026-10-11] T-063 — claim `ver`; `get_current_user` valida usuario activo y versión contra la BD; `change-password` incrementa la versión y emite cookies nuevas. Tests RF-021/RF-017 en verde.
  - [2026-10-11] T-064 — rotación del refresh token y revocación masiva sólo al reutilizar uno rotado. Tests RF-010/RF-022 en verde.
  - [2026-10-11] Hallazgo en tests: reinyectaban cookies con dominio `testserver` (el jar usa `testserver.local`), así que algunas aserciones de 401 eran vacías (replay tras logout, RF-009). Corregido; suite backend 84/84.
  - [2026-10-11] Migración 004 validada en SQLite y PostgreSQL 15 (round-trip; `alembic check` sin diferencias).
  - [2026-10-11] T-065 — tests vitest de renovación automática (reintento, fallo → sesión cerrada, renovación única, Web Locks, sin renovar en login); en rojo.
  - [2026-10-11] T-066 — `api/auth.ts::request` reintenta tras un único `/auth/refresh` (Web Locks entre pestañas, promesa compartida en la pestaña).
  - [2026-10-11] T-067 — `layout/AppLayout.tsx` con enlace "Cambiar contraseña" y "Cerrar sesión" (avisa si el logout falla); `App.tsx` lo usa como ruta de diseño de las privadas. Frontend 23/23, `tsc` limpio.
  - [2026-10-11] T-068 — docs: backend/README (versión de credenciales, rotación), frontend/src/README, ARCHIFY (diagrama), state; contrato re-exportado (sin cambios).
  - [2026-10-11] Enmienda 2 aprobada por el usuario (registrada en `spec.md` → `aprobaciones.enmienda_2`). Arranca la re-verificación adversarial de 0002.
  - [2026-10-11] Re-verificación adversarial de 0002 — gate verde (17 ok · 1 aviso spectral); backend 84/84, cobertura 97,95 %; frontend 23/23, `tsc` y build limpios; 6 mutaciones sobre las defensas nuevas (check `ver`, incremento, rotación, revocación masiva, detección sólo de rotados, cookies tras cambio) → todas detectadas por los tests.
  - [2026-10-11] Veredicto: **rebote** (2 hallazgos, nada pasa a `verified`). W-1 (medio): `refresh` lee y revoca sin operación atómica; dos peticiones concurrentes con el mismo refresh token lo rotan dos veces → dos sesiones válidas sin disparar RF-022 (demostrado intercalando dos sesiones). W-2 (bajo): RF-023 «tratar la sesión como cerrada» sólo lo aplica `RequireAuth` al navegar; `ChangePasswordPage` muestra un error genérico ante 401. Residuales de diseño (no violan el spec): el access token sobrevive 24 h al logout y a la revocación de RF-022; el contrato no declara 400/401/403/409; el test de Web Locks sólo comprueba el nombre del lock; el de aislamiento hoy sólo recorre `/auth/me`.
  - [2026-10-11] Usuario: «corrige W-1 y W-2 y vuelve a verificar». Bloque P (T-069…T-072) en `tasks.md` y nota en `plan.md` (sin cambio de spec).
  - [2026-10-11] T-069 — test de rotación concurrente con lectura obsoleta en una segunda sesión; en rojo (`DID NOT RAISE`). Nota: el objeto obsoleto debe retenerse (el mapa de identidad de SQLAlchemy es débil), si no el test pasa en falso.
  - [2026-10-11] T-070 — `AuthRepository.claim_refresh_token` (`UPDATE … WHERE id = ? AND revoked = false`, gana sólo si afecta 1 fila); `AuthService.refresh` trata la pérdida como reutilización (401 + revocación masiva); `revoke_refresh_token` pierde `rotated`. Backend 85/85, cobertura 98 %. Comprobado en PostgreSQL 15 con dos conexiones concurrentes: un solo ganador.
  - [2026-10-11] T-071 — test vitest (401 en cambio de contraseña → `/login`) en rojo y luego `ChangePasswordPage` navega a `/login` ante 401. Frontend 24/24, `tsc` y build limpios.
  - [2026-10-11] T-072 — docs: plan.md (W-1/W-2), backend/README (rotación atómica), frontend/src/README (sesión cerrada), state.
  - [2026-10-11] Re-verificación tras W-1/W-2 — gate verde (17 ok · 1 aviso spectral); backend 85/85 (cobertura 98 %; las líneas sin cubrir son defensivas previas); frontend 24/24, `tsc` y build limpios; mutaciones: claim sin condición, perdedor sin revocación masiva, sin rotación, detección sobre cualquier revocado, sin revocación al reutilizar y sin redirección a `/login` → todas detectadas. **Sin hallazgos nuevos.** Residual: sin Web Locks (navegadores antiguos) dos pestañas que renuevan a la vez pierden la sesión (la perdedora dispara RF-022), seguro pero molesto.
  - [2026-10-11] Ancla de SPEC-0002 movida a `028c2ba` (commit de las correcciones). `estado` sigue en `implemented`: `verified` sólo tras la aprobación humana del PR.

## [2026-10-11] 0002-auth — enmienda tras verificación adversarial
- **Fase alcanzada:** implement (enmienda Specify → Plan → Tasks → Implement)
- **Rebotes del verificador:** 1 (V-1 refresh bloqueado por RF-019, V-2 emails sensibles a mayúsculas, V-3 enumeración por tiempo en login, G-1 sin validar formato de email)
- **Directiva de Pausa:** no (el usuario dirigió: enmendar spec para V-1, corregir V-2, V-3, G-1)
- **Drift / re-anchor:** sí (`covers` + `*normalize_email*`)
- **Anclas movidas:** no (spec enmendado pendiente de aprobación)
- **Gate:** verde (1 aviso: spectral no instalado)
- **Docs actualizadas:** spec.md, plan.md, tasks.md (bloque N), contracts/openapi.yaml, backend/README.md, state.md
- **Decisiones de diseño / límites de integración:** `/auth/refresh` en la lista blanca; emails normalizados + índice único `lower(email)` (migración 003); hash Argon2id ficticio en login; regex de email sin dependencias nuevas.
- **Próximo paso:** aprobación de la enmienda por el usuario y re-verificación; decidir R-1…R-6.

## [2026-10-11] 0002-auth — implementada (pendiente de verificación)
- **Fase alcanzada:** implement
- **Rebotes del verificador:** 0 (verificador aún no ejecutado)
- **Directiva de Pausa:** sí (fuentes en conflicto state.md / cola Cowork / TAREAS.md → el usuario fijó state.md como fuente; secreto semilla vs P4 → sólo en `.env` local + cambio forzado)
- **Drift / re-anchor:** sí (SPEC-0002 retroactivo sobre `cf1632d`; `covers` ampliado a los archivos nuevos)
- **Anclas movidas:** SPEC-0002 → commit de cierre de esta sesión
- **Gate:** verde (1 aviso: spectral no instalado)
- **Docs actualizadas:** contracts/openapi.yaml, backend/README.md, backend/tests/README.md, .env.example, frontend/README.md, frontend/src/README.md, TAREAS.md (T-001), ARCHIFY.md, state.md
- **Decisiones de diseño / límites de integración:** admin sembrado desde entorno y `/auth/register` retirado; JWT 24 h + refresh 30 d hasheado; `must_change_password` leído de BD (JWT mínimo); rollback de PG si falla CouchDB. Excepción P5: control plane en SQLite.
- **Próximo paso:** verificación adversarial de 0002 + PR; luego decidir limpieza de docker-compose y abrir 0003-vault-crud.

## Session 2026-10-10 (Génesis — CORREGIDA)

**Evento:** Génesis de harness SDD Anchored para Synapse (REVISADA — almacén puro)

- **Fase alcanzada:** Génesis completada (2.0)
- **Corrección crítica:**
  - Primera versión incluía LangGraph/RAG/LiteLLM/Ollama (INCORRECTO)
  - Carlos aclaró: Synapse es almacén puro, gestión externa via agentes OpenClaw
  - Se reescribió constitution.md + AGENTS.md correctamente

- **Qué se hizo (versión correcta):**
  - Copiar harness/reference/ → synapse/.harness/ ✅
  - Redactar constitution.md (almacén, FastAPI + CouchDB + React, P1-P5)
  - Redactar AGENTS.md (4 roles fijos, sin especialistas de IA)
  - Rellenar memory/state.md (decisiones simples, aislamiento datos)
  - Crear history.md (bitácora)

- **Decisiones cristalizadas:**
  - P1-P5 (aislamiento de datos, validación de permisos, no secrets, tests con BD real)
  - Stack simple: FastAPI + CouchDB + PouchDB + React
  - Gestión externa: agentes OpenClaw (AIRA, Paulina, Liza, main)

- **Rebotes del verificador:** 1 crítico (Carlos señaló falta de alineación con realidad del proyecto)
- **Status del gate:** Listo para ejecutar
- **Documentación:** 
  - constitution.md ✅ (CORREGIDA)
  - AGENTS.md ✅ (CORREGIDA)
  - memory/state.md ✅
  - Versión 1.0 (con LLM/RAG) descartada

- **Próximo paso:** 
  1. Ejecutar `bash .harness/gate/check.sh`
  2. Carlos aprueba Génesis (v2.0)
  3. Abrir Sprint 2 — Gestión de Bóvedas (feature 0003-vault-crud)
  4. Avanzar a Specify

**Notas:**
- Synapse es proyecto "brownfield" (código existe desde Sprint 0/1)
- Génesis se basó ERRÓNEAMENTE en documentos desactualizados que mencionaban IA
- Aclaración de Carlos: IA interna fue **descartada**; ahora Synapse es puro almacén
- Agentes OpenClaw son el "cerebro" que gestiona la bóveda externamente
- Stack final: **FastAPI + CouchDB + PouchDB + React** (sin dependencias de IA/Ollama)

---

**Documento:** history.md — Bitácora de Sessions  
**Proyecto:** Synapse  
**Creado:** 2026-10-10 (CORREGIDA)  
**Estado:** Génesis completada (v2.0)
