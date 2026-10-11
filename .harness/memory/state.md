---
ultima_actualizacion: 2026-10-11
fase: Sprint 2 en ejecución
arquitectura_verificada: True
sprint_actual: 2
---

# State — Synapse

## Correcciones & Contexto Actual

### Génesis Completada (2026-10-10 — CORREGIDA)

✅ Harness instalado  
✅ Constitution redactada (almacén puro, sin IA interna)  
✅ AGENTS.md con 4 roles fijos + gestión OpenClaw  
✅ Gate configurado  
✅ Sprint 0 + Sprint 1 verificados en repo (`dev` branch)

### Clarificación Crítica

**Synapse = Almacén de bóvedas puro** (tipo Obsidian clone):
- ✅ Gestión de documentos markdown (create/read/update/delete)
- ✅ Sincronización PouchDB ↔ CouchDB (offline-first)
- ✅ Editor markdown integrado
- ✅ Multi-usuario con aislamiento de datos
- ❌ **SIN agentes de IA internos** (eso lo hacen agentes OpenClaw)
- ❌ **SIN RAG, LangGraph, LiteLLM, Ollama**

### Decisiones Cristalizadas

**Arquitectura:**
- FastAPI (simple, sin capas complejas)
- CouchDB para bóvedas por usuario
- PouchDB para sync offline
- React frontend

**Seguridad (P1-P5):**
- P1: Gate siempre primero
- P2: Datos scoped a `current_user.id` (aislamiento)
- P3: Validación de permisos (owner check)
- P4: No secrets en repo
- P5: Tests con BD real (no mock)

**Gestión externa:**
- Bóvedas viven en Synapse (datos)
- Agentes OpenClaw las gestionan (lectura, análisis, coordinación)
- AIRA, Paulina, Liza, main, nuevos agentes acceden vía API de Synapse

### Reglas Vigentes (P1-P5)

| Regla | Qué | Por qué |
|-------|-----|---------|
| **P1** | Gate siempre primero | Detecta regressions |
| **P2** | Datos aislados user_id | Privacidad, multi-usuario |
| **P3** | Validación de permisos | User A no ve datos de B |
| **P4** | No secrets | Privacidad de Carlos |
| **P5** | Tests con BD real | Sync real es crítica |

### Próximo Paso Inmediato

**Ejecutar Sprint 2 (Autenticación + CRUD de Bóvedas):**

TAREAS.md especifica exactamente qué hacer:
1. Lee `TAREAS.md` (asignación de tasks)
2. Para cada [T-NNN] EN ORDEN DE DEPENDENCIAS:
   - T-001 (JWT auth) → crear spec.md + plan.md en `.harness/specs/0002-auth/`
   - T-002 (vault CRUD) → crear spec.md + plan.md en `.harness/specs/0003-vault-crud/`
   - T-003, T-004, T-005 (diagramas con Archify) → paralelo
   - T-006 (integration tests) → después T-001 + T-002
3. Implementar, tests, gate ✅, commit
4. Registrar TODO en BITACORA-IMPLEMENTACION.md

### Hazards Conocidos

1. **PouchDB ↔ CouchDB conflictos** — Tests de sync + documentación
2. **User A ve datos de B** — Validación en TODO endpoint
3. **Offline sin conexión → datos obsoletos** — UI clara de estado
4. **Borrar bóveda sin backup** — Soft delete + 30 días de gracia

### Notas para Carlos

- **Stack:** FastAPI + CouchDB + PouchDB + React (SIMPLE)
- **No incluye:** Caddy, Ollama, LangGraph, IA interna
- **Gestión:** Agentes OpenClaw acceden vía API
- **Datos:** Viven en Synapse; decisiones/análisis en OpenClaw

---

## Checklist: Antes de Trabajar en Feature

- [ ] Ejecuté `bash .harness/gate/check.sh` ✅
- [ ] Leí `.harness/memory/state.md` (este archivo)
- [ ] Leí `.harness/constitution.md` (Art. 2, 5, 8)
- [ ] Leí CLAUDE.md
- [ ] Entiendo: almacén puro (sin IA interna)
- [ ] Conozco P1-P5
- [ ] Leí la feature spec.md del sprint actual
- [ ] Estoy en rama `dev`

---

**Proyecto:** Synapse  
**Fecha Génesis:** 2026-10-10  
**Estado:** Sprint 2 en ejecución (Autenticación + CRUD de Bóvedas)  
**Tareas Asignadas:** 6 (T-001 a T-006 en TAREAS.md)  
**Duración estimada:** ~10 horas de tiempo agente  
**Siguiente:** Lee TAREAS.md completo, ejecuta T-001 primero (auth JWT)
