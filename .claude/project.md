# Synapse — Almacén de Bóvedas

**Estado:** Sprint 2, 3 features verificadas (0002-auth, 0003-vault-crud, 0004-api-problem-details)

## Qué es
Almacén de bóvedas colaborativo. Sin IA interna: agentes OpenClaw acceden vía API.

## Stack
- Backend: Python FastAPI, PostgreSQL, argon2, PyJWT
- Frontend: React + Vite + TypeScript
- Auth: JWT 24h, admin desde .env
- Errores: RFC 9457 Problem Details
- Tests: pytest (backend), vitest (frontend), BD real

## Reglas duras
1. state.md manda sobre todo
2. Rúbrica de method.md §2 antes de tocar código
3. Sin IA interna (sin RAG, LLMs, agentes internos)
4. Datos aislados por user_id
5. Validación permisos en todo endpoint
6. Sin secretos en repo
7. Tests con BD real (excepción: control plane en SQLite)

## Skills disponibles
- **Archify:** Diagramas para specs y ADRs

## Próximo
- SPEC-0005: Sincronización PouchDB ↔ CouchDB
- PR #3 merge (auth a verified)
- Tests del control plane en PostgreSQL real
