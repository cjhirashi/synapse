# AGENTS.md — Synapse

## Antes de Empezar

1. `bash .harness/gate/check.sh`
2. Lee: `.harness/memory/state.md`
3. Lee: `.harness/constitution.md` (Art. 2, 5, 8)
4. Lee: `TAREAS.md`

---

## 🎯 Roles Fijos

| Rol | Especialidad | Responsabilidad |
|-----|---|---|
| **arquitecto-fastapi** | Endpoints, middleware | Routers, performance |
| **experto-couchdb** | Datos, sync, queries | Esquemas, aislamiento |
| **guardian-seguridad** | Permisos, aislamiento | Validación, OWASP |
| **especialista-frontend** | React, UX | Componentes, hooks |

**OpenClaw externos:** AIRA, Paulina, Liza, main (gestión de bóveda)

---

## 🔄 Ciclo SDD Automático (Sprint Mode)

**AIRA asigna en `TAREAS.md`. Ejecuta automáticamente:**

1. Lee TAREAS.md
2. Para cada `[T-NNN]`:
   - Crea `.harness/specs/{feature}/spec.md`
   - Crea `.harness/specs/{feature}/plan.md`
   - Gate ✅ → Implementa + tests (≥80%)
   - Gate ✅ → Commit `(T-NNN)`
   - Registra en `BITACORA-IMPLEMENTACION.md`
3. Al completar → regresa a AIRA

**Sin esperar instrucciones.** Bloqueadores → BITACORA-IMPLEMENTACION.md.

---

## 🛠️ Comandos Esenciales

```bash
bash .harness/gate/check.sh        # Estado
pytest tests/ --cov=app             # Tests backend
docker compose up -d                # Dev
/archify                            # Diagramas
```

---

## 🔒 P1-P5 (Antes de Commit)

- P1: Gate siempre primero
- P2: Datos scoped a `current_user.id`
- P3: Validar permisos (owner check)
- P4: Sin secretos en repo
- P5: Tests con CouchDB real

---

## 📚 Arquitectura

**Hexagonal.** Services → `core/ports/`. Factory selecciona adapter.

**Crítico:** Aislamiento por usuario. Base CouchDB `synapse_user_{id}`. **Nunca romper.**

---

## 🎯 Casos de Uso Rápido

### Backend CRUD
- routers/vaults.py (endpoints)
- models/vault.py (Pydantic)
- services/vault_service.py (lógica)
- Tests: validar aislamiento (P3)

### Frontend
- components/{Feature}.tsx
- hooks/use{Feature}.ts
- Tests: validar build sin errores

### Diagramas
- `/archify` → C4, Sequence, Dataflow
- Guardar en `.harness/specs/{feature}/diagrams/`

---

**Synapse — SDD Anchored — Sprint Mode Activado**
