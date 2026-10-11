# History — Synapse

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
