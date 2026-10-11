---
---

# AGENTS.md — Synapse

**Punto de entrada para agentes que trabajan en Synapse.**

---

## Antes de Empezar (En Orden)

### 1. Ejecuta el Gate

```bash
bash .harness/gate/check.sh
```

### 2. Lee Correcciones de Carlos

```
.harness/memory/state.md
```

### 3. Lee la Constitución

```
.harness/constitution.md
```

Artículos 2 (Arquitectura), 5 (Seguridad), 8 (P1-P5).

### 4. Lee el Contexto Permanente

```
CLAUDE.md
```

---

## 🎯 Equipo

### Roles Fijos (Synapse)

| Rol | Especialidad | Modelo | Responsabilidad |
|-----|---|---|---|
| **arquitecto-fastapi** | Endpoints, middleware, validación | Sonnet | Routers, error handling, performance |
| **experto-couchdb** | Modelo de datos, sync, queries | Sonnet | Esquemas JSON, migraciones, aislamiento |
| **guardian-seguridad** | Aislamiento de datos, permisos | Haiku | Validación de roles, OWASP |
| **especialista-frontend** | React, editor, UX | Sonnet | Componentes, hooks, responsividad |

### Agentes OpenClaw (Gestión de Bóveda)

Externos al proyecto:
- 🤖 **AIRA** — Especialista de portafolio
- 🤖 **Paulina** — ?
- 🤖 **Liza** — Coordinadora
- 🤖 **OpenClaw (main)** — Orquestador
- 🤖 **Nuevos agentes** — Especializados

---

## 🔄 Cómo Trabajas en Synapse

### Caso 1: Feature de Backend (Ej. CRUD de Bóvedas)

**Ejemplo:** Feature `0003-vault-crud/spec.md` redactada. Ahora codificas.

**Pasos:**

1. **Leer spec.md:**
   ```bash
   cat .harness/specs/0003-vault-crud/spec.md
   ```

2. **Arquitectura simple:**
   ```
   routers/vaults.py       ← Endpoints HTTP
   models/vault.py         ← Pydantic + SQLAlchemy
   services/vault_service.py ← Lógica (create, list, delete)
   ```

3. **Validación de permisos (P3):**
   ```python
   @router.get("/vaults")
   async def list_vaults(current_user: User = Depends(get_current_user)):
       # Solo bóvedas del usuario actual
       vaults = db.find({"owner": current_user.id})
       return vaults
   ```

4. **Tests:**
   ```python
   # backend/tests/routers/test_vaults.py
   def test_user_isolation(client, couchdb_real):
       # User A crea bóveda
       user_a_vault = client.post("/vaults", json={"name": "..."},
                                   headers=auth_a)
       
       # User B lista — no ve la bóveda de A
       user_b_vaults = client.get("/vaults", headers=auth_b)
       assert len(user_b_vaults) == 0
   ```

5. **Commit:**
   ```bash
   git commit -m "feat: implement CRUD for vaults (0003-vault-crud)"
   ```

6. **Gate ✅**
   ```bash
   bash .harness/gate/check.sh
   ```

7. **PR:**
   - Revisor: `arquitecto-fastapi` + `experto-couchdb`
   - Merge: solo cuando pasa Gate 3

---

### Caso 2: Feature de Frontend (Ej. Pantalla de Bóvedas)

**Ejemplo:** UI mockup en vault. Ahora construyes React.

**Pasos:**

1. **Inspecciona especificación** en vault privado

2. **Componentes React:**
   ```
   frontend/src/
   ├── components/
   │   ├── VaultCard.tsx      ← Reutilizable
   │   └── VaultList.tsx      ← Contenedor
   ├── views/
   │   └── VaultsView.tsx     ← Página
   ├── hooks/
   │   └── useVaults.ts       ← Fetch de API
   ```

3. **API Contracts:**
   - Revisar: ¿Existen endpoints GET /vaults, POST /vaults, DELETE /vaults/{id}?
   - Si no: abrir issue en spec del backend

4. **Responsive:**
   - Desktop: grid
   - Tablet: 2 columnas
   - Mobile: 1 columna

5. **Tests:**
   ```
   frontend/__tests__/
   └── VaultList.test.tsx
   ```

6. **Merge:**
   - Revisor: `especialista-frontend`
   - Gate 3 verifica: `npm run build` sin errores

---

### Caso 3: Cambio de Modelo de Datos (Ej. Agregar Campo a Vault)

**Ejemplo:** Spec dice "agregar field `description` a vault".

**Pasos:**

1. **Modelar:**
   ```python
   # backend/app/models/vault.py
   class Vault(Base):
       id: str
       name: str
       owner: str
       description: str = ""  ← NUEVO
       created: datetime
   ```

2. **API:**
   ```python
   class VaultCreate(BaseModel):
       name: str
       description: str = ""
   ```

3. **Tests:**
   - Validar que CouchDB guarda + retorna el campo
   - Tests contra BD real

4. **Revisor:**
   - `experto-couchdb` (modelo)
   - `arquitecto-fastapi` (API)

---

## 🛠️ Herramientas & Skills

| Tarea | Comando |
|-------|---------|
| Revisar estado | `bash .harness/gate/check.sh` |
| Tests backend | `cd backend && pytest tests/ --cov=app` |
| Tests frontend | `npm test --coverage` |
| Lint | `black app/ && npm run lint` |
| Start dev | `docker compose up -d` |
| Logs | `docker compose logs -f backend` |
| **Archify (Diagramas)** | `/archify` — Crear diagramas de arquitectura, flujos, secuencias |

### Archify — Documentación con Diagramas

**Skill:** `tt-a1i/archify` (MIT, 130K+ instalaciones)

**Tipos de diagramas soportados:**
- Architecture (C3/C4 style)
- Workflow (procesos)
- Sequence (interacciones)
- Dataflow (flujo de datos)
- Lifecycle (ciclo de vida)
- Narrative (historias visuales)

**Exporta a:** HTML interactivo, PNG (dark/light), SVG, JSON, Motion, Share Cards

**Uso en Synapse:**
- Arquitectura general (FastAPI + CouchDB + PouchDB + React)
- Flujo de sincronización (offline-first)
- Secuencia de autenticación
- Dataflow: bóveda → documentos → sync

**Documentación:** Vive en `.harness/specs/{feature}/diagrams/` (uno por feature)

---

## 🔒 Checklist de Seguridad (Antes de PR)

- [ ] ¿Validé permisos (P3)? (owner check)
- [ ] ¿Datos scoped a `current_user.id` (P2)?
- [ ] ¿Hay secretos en `.env.example`? (P4 — NO)
- [ ] ¿Tests con CouchDB real (P5)?
- [ ] ¿Todos los endpoints retornan error 403 si usuario ≠ owner?

---

## 📚 Referencias

1. **constitution.md** — Decisiones, P1-P5
2. **CLAUDE.md** — Contexto permanente
3. **1.1.6 - Guías de Implementación** (vault) — Order de desarrollo
4. **1.1.9.4 - Claude Code.md** (vault) — Queue de sprints

---

## 🔄 Ciclo SDD Automático (Sprint Mode)

**AIRA asigna tareas en `TAREAS.md`. Ejecuta automáticamente:**

1. **Leer TAREAS.md** — especificaciones del sprint
2. **Para cada `[T-NNN]`:**
   - Crea `.harness/specs/{feature}/spec.md`
   - Crea `.harness/specs/{feature}/plan.md`
   - Ejecuta `bash .harness/gate/check.sh` (debe pasar)
   - Implementa + tests (≥80% cobertura)
   - Ejecuta gate nuevamente ✅
   - Commit: `git commit -m "feat: ... (T-NNN)"`
   - Registra en `BITACORA-IMPLEMENTACION.md`
3. **Cuando todas estén Completadas:** regresa a AIRA

**No esperes instrucciones manuales.** Cualquier bloqueo → documenta en BITACORA-IMPLEMENTACION.md.

---

**Proyecto:** Synapse  
**Método:** SDD Anchored  
**Estado:** Génesis completada, Sprint mode activado  
**Especialista de Harness:** AIRA
