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
├── architecture.html (interactivo; SVG/PNG/WebP desde su botón «Exportar»)
├── architecture.candidate.json (fuente — editar aquí y re-finalizar)
├── architecture-light.png
└── architecture-dark.png
```

> **Estado (T-003, 2026-10-13):** generado. Índice y cómo regenerarlo en
> [`.harness/specs/0003-vault-crud/diagrams/README.md`](.harness/specs/0003-vault-crud/diagrams/README.md).

---

### 2. **Flujo de Sincronización** (SPEC-0005 `0005-sync`)

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
.harness/specs/0005-sync/diagrams/
├── sync-flow.html (interactivo; SVG desde «Exportar»)
├── sync-flow.candidate.json
├── sync-flow-light.png
└── sync-flow-dark.png
```

> **Estado (2026-10-13):** primera versión como *workflow* (carriles navegador / servidor /
> conflictos), con las opciones recomendadas de la Fase 1 de SPEC-0005; se actualiza al
> cerrar sus decisiones. Índice en `.harness/specs/0005-sync/diagrams/README.md`.

---

### 3. **Flujo de Autenticación** (Sprint 2 — Implementar junto a login)

**Tipo:** Sequence (interacciones)  
**Qué mostrar** (según SPEC-0002):
- Arranque: el backend siembra el admin desde `ADMIN_EMAIL`/`ADMIN_PASSWORD` y crea su base `synapse_user_{id}` (la base se crea al **dar de alta** un usuario, no en el login)
- Login: `POST /auth/login` → Argon2id → cookies httpOnly `access_token` (JWT 24 h) y `refresh_token` (30 días, guardado hasheado)
- Cambio forzado: con `must_change_password=true` sólo se permiten `/auth/me`, `/auth/change-password` y `/auth/logout`; el frontend redirige a "Cambiar contraseña"
- Renovación: ante un 401 el frontend llama `POST /auth/refresh`, que emite un nuevo `access_token` y rota el `refresh_token` (reutilizar uno rotado revoca todos)
- Cambio de contraseña: invalida los access tokens anteriores (claim `ver`) y entrega cookies nuevas a la sesión actual
- Alta de guests: el admin llama `POST /admin/users` → usuario `guest` + su base CouchDB

**Borrador (Mermaid) hasta exportar con Archify:**
```mermaid
sequenceDiagram
    actor U as Usuario
    participant F as Frontend React
    participant B as Backend FastAPI
    participant P as PostgreSQL
    participant C as CouchDB
    Note over B,C: Arranque: siembra admin (must_change_password=true) + PUT synapse_user_{id}
    U->>F: correo + contraseña
    F->>B: POST /auth/login
    B->>P: busca usuario, verifica Argon2id
    B-->>F: 200 + cookies access_token (24 h) y refresh_token (30 d)
    F->>B: GET /auth/me
    B-->>F: {user_id, role, must_change_password: true}
    F->>U: redirige a /settings/password
    U->>F: actual + nueva (≥ 10, distinta)
    F->>B: POST /auth/change-password
    B->>P: guarda hash, desactiva indicador, token_version+1, revoca refresh tokens
    B-->>F: 204 + cookies nuevas (las demás sesiones pierden acceso)
    Note over F,B: Más tarde, access_token expirado
    F->>B: POST /auth/refresh (cookie refresh_token)
    B->>P: valida hash, no revocado ni expirado; lo marca rotado
    B-->>F: 200 + nuevo access_token y nuevo refresh_token
    U->>F: (admin) alta de guest
    F->>B: POST /admin/users {email, password}
    B->>P: crea guest (must_change_password=true)
    B->>C: PUT synapse_user_{id} (si falla: rollback + 503)
    B-->>F: 201 {id, email, role: guest}
```

**Comando:**
```bash
/archify
# Seleccionar: Sequence
# Describir: usar el borrador Mermaid de arriba (bootstrap, login, cambio forzado, refresh, alta de guest)
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
- User A intenta acceder a bóvedas de B → ❌ Error 404 `vault-not-found` (mismo cuerpo que
  una bóveda inexistente: nunca 403, que revelaría que existe — SPEC-0003 RF-014)
- Cada usuario tiene su propia base CouchDB (`synapse_user_{id}`) y la elegida sale sólo del token

**Comando:**
```bash
/archify
# Seleccionar: Narrative
# Describir: "Synapse Data Isolation: User A (propietario) vs User B (invitado). Una base CouchDB por usuario, elegida sólo por el token. User B no ve datos de A; pedir una bóveda de A da 404, igual que si no existiera."
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
- [x] Generar **Arquitectura General** (T-003)
- [ ] Generar **Autenticación (Sequence)**
- [ ] Generar **Aislamiento (Narrative)**
- [ ] Guardar en `.harness/specs/0003-vault-crud/diagrams/`

> **Nota (T-003):** estos diagramas no forman parte del alcance de SPEC-0003 ni bloquean su
> cierre (spec §2): se generan en paralelo. La carpeta `diagrams/` de 0003 está en sus
> `covers`, así que guardarlos ahí no rompe el anclaje.

### **Sprint 3 — Documentos**
- [ ] (No requiere diagramas nuevos, puede reutilizar arquitectura)

### **Sprint 4 — Sincronización**
- [x] Generar **Flujo de Sincronización** (borrador de Fase 1, workflow)
- [x] Guardar en `.harness/specs/0005-sync/diagrams/`

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
