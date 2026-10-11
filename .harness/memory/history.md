# History — Synapse

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
