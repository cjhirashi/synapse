---
nombre: TAREAS
responsable: AIRA
fecha_actualizacion: 2026-10-11
sprint_actual: 2
---

# Tareas — Synapse

## Sprint 2 — Autenticación y Gestión de Bóvedas (2026-10-11 a 2026-10-25)

**Objetivo:** Autenticación segura con JWT + CRUD básico de bóvedas + aislamiento de datos

**Duración estimada:** 2 semanas (80 horas de trabajo)

---

### [T-001] Setup de autenticación con JWT y Argon2id

**Estado:** Asignada  
**Prioridad:** P1  
**Estimación:** 12 horas  
**Fecha asignación:** 2026-10-11

**Descripción:**
Implementar login/logout en FastAPI. Usuarios en tabla `users` con passwords hasheados con Argon2id.
Generar JWT en cookie httpOnly. Validar JWT en todo endpoint protegido.
Ver CLAUDE.md section "Authentication" y `.harness/specs/0002-auth/spec.md`

**Aceptación:**
- [ ] Endpoint POST /auth/login acepta `{username, password}`
- [ ] Password hasheado con Argon2id en DB
- [ ] JWT generado y retornado en cookie httpOnly (14 días expiración)
- [ ] Endpoint POST /auth/logout limpia cookie
- [ ] Endpoint GET /auth/me retorna usuario autenticado
- [ ] Tokens inválidos/expirados → 401 Unauthorized
- [ ] CORS permite credenciales: `credentials: 'include'` en frontend
- [ ] Tests: ≥80% cobertura en `backend/tests/auth/`
- [ ] Gate: ✅ Verde (14 ok, 0 error)
- [ ] Spec.md + plan.md en `.harness/specs/0002-auth/`

**Bloqueadores:** Ninguno

**Notas:**
- Usar `pydantic` para validar inputs
- Usar `passlib[argon2]` para hashing
- Usar `python-jose` para JWT
- Cookie debe ser httpOnly, Secure, SameSite=Lax
- Guardar usuario.id en JWT sub claim

**Archivos a tocar:**
- `backend/app/auth.py` (nuevo)
- `backend/app/models.py` (añadir User)
- `backend/app/db.py` (queries de usuario)
- `backend/tests/test_auth.py` (nuevo)
- `requirements.txt` (add dependencies)

---

### [T-002] CRUD de bóvedas (Get/Create/Update/Delete)

**Estado:** Pendiente  
**Prioridad:** P1  
**Estimación:** 16 horas  
**Fecha asignación:** 2026-10-12 (después T-001 completada)  
**Depende de:** T-001

**Descripción:**
Crear endpoints REST para CRUD de bóvedas. Cada bóveda pertenece a un usuario.
Crear base CouchDB `synapse_user_{user_id}` automáticamente al crear primera bóveda.
Validar que usuario solo acceda a sus propias bóvedas (P3 rule).
Ver `.harness/specs/0003-vault-crud/spec.md`

**Aceptación:**
- [ ] GET /vaults → lista bóvedas del usuario autenticado (JSON)
- [ ] POST /vaults → crea nueva bóveda, genera `synapse_user_{id}`, retorna bóveda creada
- [ ] PATCH /vaults/{vault_id} → actualiza nombre/descripción/tags
- [ ] DELETE /vaults/{vault_id} → elimina bóveda (soft delete con timestamp)
- [ ] Todas queries filtran por `owner_id == current_user.id` (P3 validado)
- [ ] Usuario B NO ve bóvedas de usuario A (403 si intenta acceder)
- [ ] Bóveda tiene: id, nombre, descripción, owner_id, created_at, updated_at, tags[]
- [ ] Tests: ≥80% cobertura, incluyendo permission tests
- [ ] Gate: ✅ Verde
- [ ] Spec.md + plan.md completos

**Bloqueadores:** T-001 (necesita auth para validar `current_user`)

**Notas:**
- Usar pattern Hexagonal: port VaultRepository, adapter CouchDB
- Crear índice en CouchDB: `by_owner_id`
- Soft delete: `deleted_at` != null
- No borrar base de datos, solo marcar documentos como deleted

**Archivos a tocar:**
- `backend/app/vaults.py` (nuevo)
- `backend/app/ports/vault_repository.py` (nuevo)
- `backend/app/adapters/couchdb_vault.py` (nuevo)
- `backend/tests/test_vaults.py` (nuevo)

---

### [T-003] Diagrama de Arquitectura General (Archify)

**Estado:** Pendiente  
**Prioridad:** P2  
**Estimación:** 4 horas  
**Fecha asignación:** 2026-10-13 (paralelo a T-002)  
**Depende de:** T-001 (conceptos claros)

**Descripción:**
Generar diagrama de arquitectura general con Archify mostrando:
- FastAPI backend
- React frontend
- CouchDB servidor
- PouchDB cliente (local)
- Caddy proxy
- OpenClaw agents (AIRA, Paulina, Liza, main)

Ver `.harness/specs/0003-vault-crud/diagrams/` y ARCHIFY.md

**Aceptación:**
- [ ] Diagrama tipo C4 Context creado
- [ ] HTML interactivo en `diagrams/architecture.html`
- [ ] SVG escalable en `diagrams/architecture.svg`
- [ ] PNG light en `diagrams/architecture-light.png`
- [ ] PNG dark en `diagrams/architecture-dark.png`
- [ ] Documentado en spec.md con links
- [ ] Probados links en navegador

**Bloqueadores:** Ninguno (puede hacer mientras T-002 en progreso)

**Notas:**
- Usar `/archify` en Claude Code
- Tipo: Architecture (C4)
- Describir: "Synapse: FastAPI backend, React frontend, CouchDB, PouchDB, Caddy proxy, OpenClaw agents"
- Guardar en `.harness/specs/0003-vault-crud/diagrams/`

---

### [T-004] Diagrama de Flujo de Autenticación (Archify)

**Estado:** Pendiente  
**Prioridad:** P2  
**Estimación:** 3 horas  
**Fecha asignación:** 2026-10-15 (después T-001 completada)  
**Depende de:** T-001

**Descripción:**
Generar diagrama de secuencia mostrando flujo completo de autenticación:
1. Usuario ingresa credenciales
2. Frontend POST /auth/login
3. Backend valida Argon2id
4. Backend genera JWT
5. Backend crea base `synapse_user_{id}`
6. Retorna JWT en cookie httpOnly
7. Otros requests llevan cookie automáticamente

**Aceptación:**
- [ ] Diagrama tipo Sequence creado
- [ ] HTML en `diagrams/auth-sequence.html`
- [ ] SVG en `diagrams/auth-sequence.svg`
- [ ] PNG light en `diagrams/auth-sequence-light.png`
- [ ] Documentado en spec.md

**Bloqueadores:** T-001 completada (necesita entender flujo real)

**Notas:**
- Tipo: Sequence diagram
- 7 pasos: Usuario → Frontend → Backend → BD → JWT → Cookie
- Mostrar validación de Argon2id

---

### [T-005] Diagrama de Aislamiento de Datos (Archify)

**Estado:** Pendiente  
**Prioridad:** P2  
**Estimación:** 3 horas  
**Fecha asignación:** 2026-10-17 (después T-002 completada)  
**Depende de:** T-002

**Descripción:**
Generar diagrama narrativo mostrando cómo el sistema garantiza aislamiento:
- User A crea bóveda (owner)
- User B se loguea
- User B NO ve bóvedas de A
- User A intenta acceder a bóvedas de B → ❌ 403
- Validación en TODO endpoint

**Aceptación:**
- [ ] Diagrama tipo Narrative creado
- [ ] HTML en `diagrams/isolation-narrative.html`
- [ ] PNG light + dark
- [ ] Muestra Owner vs Non-Owner
- [ ] Documentado en spec.md

**Bloqueadores:** T-002 completada (necesita entender CRUD)

---

### [T-006] Tests de integración (Real DB)

**Estado:** Pendiente  
**Prioridad:** P1  
**Estimación:** 8 horas  
**Fecha asignación:** 2026-10-18 (después T-002)  
**Depende de:** T-001, T-002

**Descripción:**
Escribir tests de integración contra CouchDB real (no mocks).
Tests deben verificar flujo completo: auth → vault CRUD → aislamiento de datos.
Ver P5 rule en `.harness/memory/state.md`

**Aceptación:**
- [ ] Tests en `backend/tests/integration/test_vault_flow.py`
- [ ] Al menos 3 escenarios de aislamiento
- [ ] CouchDB real (test container o instancia)
- [ ] Cobertura: ≥80% en vaults.py
- [ ] Todos tests pasan (pytest)
- [ ] Gate: ✅ Verde

**Bloqueadores:** T-001, T-002 completadas

**Notas:**
- Usar `pytest` con fixtures
- Mock JWT si aplica
- NO usar mocks de BD

---

## 📊 Estado General

| Tarea | Estado | Progreso | Bloqueador |
|-------|--------|----------|-----------|
| T-001 | Asignada | 0% | — |
| T-002 | Pendiente | — | T-001 |
| T-003 | Pendiente | — | — |
| T-004 | Pendiente | — | T-001 |
| T-005 | Pendiente | — | T-002 |
| T-006 | Pendiente | — | T-001, T-002 |

**Crítico Path:**
1. T-001 (auth) → 2. T-002 (vaults) → 3. T-006 (integration tests)
4. Paralelo: T-003, T-004, T-005 (diagramas)

---

## 🚀 Cómo Ejecutar Este Sprint

**Lee CLAUDE.md primero.** Luego:

1. Ejecuta `bash .harness/gate/check.sh` (debe pasar)
2. Para CADA `[T-NNN]` (en orden de dependencias):
   - Crea rama: `git checkout -b feature/T-NNN-{slug}`
   - Crea `.harness/specs/{feature-name}/spec.md` (desde la descripción de la tarea)
   - Crea `.harness/specs/{feature-name}/plan.md` (plan con tasks)
   - Implementa tasks, tests, verifica gate
   - Commit: `git commit -m "feat: {descripción} (T-NNN)"`
   - Registra en `BITACORA-IMPLEMENTACION.md`
3. Cuando todas estén Completadas, reporta a AIRA

---

**Sprint:** 2 de Synapse  
**Inicio:** 2026-10-11  
**Fin estimado:** 2026-10-25  
**Responsable asignación:** AIRA  
**Responsable ejecución:** Claude Code
