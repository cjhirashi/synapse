---
---

# Archify — Generación de Diagramas para Synapse

**Skill:** `tt-a1i/archify` (MIT, 130K+ instalaciones)  
**Función:** Crear diagramas interactivos (arquitectura, flujos, secuencias)  
**Uso:** Invocar `/archify` desde Claude Code durante desarrollo  

---

## 🚀 Setup

✅ **Archify está instalado globalmente** en el servidor (2026-10-10).

**Disponible en:** Claude Code, OpenClaw, Cline, Codex, Cursor, GitHub Copilot + más

**Uso directo:** Invocar `/archify` desde cualquier proyecto

---

## 📋 Diagramas Requeridos para Synapse

### 1. **Arquitectura General** (Prioritario — Sprint 2)

**Tipo:** Architecture (C4 Context)  
**Qué mostrar:**
- FastAPI backend (centro)
- React frontend (navegador)
- CouchDB (servidor)
- PouchDB (cliente local)
- Caddy reverse proxy (cjhirashi-srv)
- Agentes OpenClaw (AIRA, Paulina, Liza, main) — acceso vía API

**Comando:**
```bash
/archify
# Seleccionar: Architecture
# Describir: "Synapse: FastAPI + CouchDB + PouchDB + React. Usuarios, CouchDB, PouchDB, Caddy, agentes OpenClaw accediendo vía API"
# Exportar: HTML, SVG, PNG light/dark
```

**Guardar en:**
```
.harness/specs/0003-vault-crud/diagrams/
├── architecture.html (interactivo)
├── architecture.svg  (escalable)
├── architecture-light.png
└── architecture-dark.png
```

---

### 2. **Flujo de Sincronización** (Sprint 4 — Sincronización)

**Tipo:** Dataflow  
**Qué mostrar:**
- Usuario trabaja offline en PouchDB (local)
- Reconecta a internet
- PouchDB sincroniza con CouchDB automáticamente
- Conflictos resueltos
- Otros dispositivos reciben cambios

**Comando:**
```bash
/archify
# Seleccionar: Dataflow
# Describir: "Synapse Offline-First: Usuario offline en PouchDB → Reconecta → Sync automática con CouchDB → Conflictos resueltos → Broadcast a otros dispositivos"
# Exportar: HTML, SVG, PNG
```

**Guardar en:**
```
.harness/specs/0004-sync-offline-first/diagrams/
├── sync-dataflow.html
├── sync-dataflow.svg
└── sync-dataflow-light.png
```

---

### 3. **Flujo de Autenticación** (Sprint 2 — Implementar junto a login)

**Tipo:** Sequence (interacciones)  
**Qué mostrar:**
- Usuario ingresa credenciales en frontend
- Frontend envía POST /auth/login
- Backend valida (Argon2id)
- Backend genera JWT
- Backend crea base CouchDB `synapse_user_{id}`
- Retorna JWT en cookie httpOnly
- Usuario accede a bóvedas

**Comando:**
```bash
/archify
# Seleccionar: Sequence
# Describir: "Synapse Auth: Usuario (navegador) → Frontend React → Backend FastAPI → CouchDB. Login con Argon2id, JWT en cookie, crear base por usuario"
# Exportar: HTML, SVG, PNG
```

**Guardar en:**
```
.harness/specs/0002-auth/diagrams/ (o actualizar spec existente)
├── auth-sequence.html
└── auth-sequence.svg
```

---

### 4. **Aislamiento de Datos** (Sprint 2 — Seguridad, narrativo)

**Tipo:** Narrative (historia visual)  
**Qué mostrar:**
- User A crea bóveda (owner)
- User B accede a Synapse
- ✅ User B NO ve bóvedas de A
- User A intenta acceder a bóvedas de B → ❌ Error 403

**Comando:**
```bash
/archify
# Seleccionar: Narrative
# Describir: "Synapse Data Isolation: User A (propietario) vs User B (invitado). User B no ve datos de A. Validación de permisos en TODO endpoint."
# Exportar: HTML, SVG, PNG light/dark
```

**Guardar en:**
```
.harness/specs/0002-auth/diagrams/ (seguridad)
├── isolation-narrative.html
└── isolation-narrative-light.png
```

---

### 5. **Integración OpenClaw** (Sprint 6+ — Documentación)

**Tipo:** Architecture (Container)  
**Qué mostrar:**
- Synapse almacén (datos)
- API de Synapse (endpoints)
- Agentes OpenClaw (AIRA, Paulina, Liza, main)
- Bóveda de Proyectos (datos almacenados en Synapse)
- Flujo: Carlos crea → Agentes leen/analizan → Escriben cambios

**Comando:**
```bash
/archify
# Seleccionar: Architecture
# Describir: "Synapse + OpenClaw: Carlos crea proyectos en Synapse (manual/API) → Agentes OpenClaw leen vía API → Analizan → Escriben cambios → Bóveda de Proyectos actualizada"
# Exportar: HTML, SVG, PNG
```

**Guardar en:**
```
.harness/specs/0007-openclawintegration/diagrams/
├── openclawarch.html
└── openclawarch.svg
```

---

## 🔄 Procedimiento por Sprint

### **Sprint 2 — Gestión de Bóvedas**
- [ ] Generar **Arquitectura General**
- [ ] Generar **Autenticación (Sequence)**
- [ ] Generar **Aislamiento (Narrative)**
- [ ] Guardar en `.harness/specs/0003-vault-crud/diagrams/`

### **Sprint 3 — Documentos**
- [ ] (No requiere diagramas nuevos, puede reutilizar arquitectura)

### **Sprint 4 — Sincronización**
- [ ] Generar **Flujo de Sincronización (Dataflow)**
- [ ] Guardar en `.harness/specs/0004-sync-offline-first/diagrams/`

### **Sprint 5+ — Editor + OpenClaw**
- [ ] Generar **Integración OpenClaw (Architecture)**
- [ ] Documentar flujo completo

---

## 📝 Cómo Documentar Cada Diagrama

**En la spec.md de la feature, incluir sección:**

```markdown
## Diagramas (Archify)

### Diagrama: Arquitectura General

**Generado por:** Archify  
**Tipo:** C4 Context  
**Exportes:**
- [Interactivo](./diagrams/architecture.html)
- [SVG](./diagrams/architecture.svg)
- [PNG Light](./diagrams/architecture-light.png)
- [PNG Dark](./diagrams/architecture-dark.png)

**Qué muestra:**
- FastAPI backend, React frontend, CouchDB, PouchDB
- Caddy reverse proxy (cjhirashi-srv)
- Agentes OpenClaw accediendo vía API

**Cómo leer:**
- Rectángulos = Sistemas/contenedores
- Flechas = Interacción/dependencia
- Colores = Tipo de componente
```

---

## 🛠️ Comandos Útiles

**Generar todas las variantes de un diagrama:**
```bash
/archify
# Seleccionar tipo
# Describir
# Exportar a: HTML (preview), SVG (editable), PNG light, PNG dark
```

**Embeber diagrama en markdown:**
```markdown
[Ver arquitectura interactiva](./diagrams/architecture.html)
```

**Usar PNG en documentación:**
```markdown
![Arquitectura Synapse](./diagrams/architecture-light.png)
```

---

## ✅ Checklist Antes de Cada Diagrama

- [ ] ¿Instalé Archify? (`npx skills add tt-a1i/archify -g`)
- [ ] ¿Tengo clara la descripción del diagrama?
- [ ] ¿Exporté a HTML + SVG + PNG light/dark?
- [ ] ¿Guardé en `.harness/specs/{feature}/diagrams/`?
- [ ] ¿Documenté en spec.md con links?
- [ ] ¿Probé los links en el HTML?

---

## 📚 Referencias

- **Archify Docs:** `npx archify --help`
- **Synapse specs:** `.harness/specs/`
- **Archify plan completo:** `/project-vault/ARCHIFY-PLAN-PORTAFOLIO.md`

---

**Proyecto:** Synapse  
**Skill:** Archify (tt-a1i/archify)  
**Estado:** Listo para usar en Claude Code  
**Responsable:** Carlos (Claude Code)
