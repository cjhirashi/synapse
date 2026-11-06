# Synapse — Almacén de Bóvedas

**Estado (2026-11-05):** en producción (`synapse.cjhirashi.com`); desarrollo por historias (Slice Development). El backlog está en `.harness/backlog.md` y el detalle de cada historia, en su nota de la bóveda **Proyectos**.

## Qué es
Almacén personal self-hosted de bóvedas de conocimiento: notas Markdown offline-first y archivos. Sin IA interna: los agentes OpenClaw lo usan por API REST con una clave por agente. Cada bóveda trae carpetas de sistema (`AG - SKILLS`, `AG - MENSAJES`, `AG - AGENTES`, `BITACORA`, `PLANTILLAS`) con ÍNDICES y bitácora generados por el servidor.

## Stack
- Backend: FastAPI (arquitectura hexagonal), PostgreSQL (control plane), CouchDB (bóvedas y notas), MinIO (archivos); Argon2id y PyJWT.
- Frontend: React + TypeScript + Vite; PouchDB para la sincronización offline-first con CouchDB.
- Auth: JWT en cookie httpOnly (acceso 24 h, refresco 30 días); admin sembrado desde `.env`; API keys de agente (`syn_ak_…`).
- Errores: RFC 9457 Problem Details.
- Pruebas: pytest (backend, con CouchDB real; ejecutor en fragmentos `backend/scripts/pytest_shards.sh`) y vitest + Playwright (frontend).

## Reglas duras
1. `.harness/memory/state.md` manda sobre todo.
2. Rúbrica de `method.md §2` antes de tocar código.
3. Sin IA interna (sin RAG, LLMs ni agentes internos).
4. Datos aislados por usuario (`user_id` del token; una base CouchDB por usuario).
5. Permisos validados en todo endpoint.
6. Sin secretos en el repo.
7. Todo cambio actualiza su documentación en el mismo commit; si cambia lo que un agente ve con `synapse_vault`, también la skill global (`backend/app/system_docs/`).

## Skills disponibles
- **Archify** y **Diagram Design**: diagramas (ver `ARCHIFY.md`).
- **UI UX Pro Max**: sistema de diseño del frontend.

## Próximo
Ver `.harness/backlog.md`. En curso: H-042 (buzón de agentes, E3 a E5) y H-040 (migración del YAML del cuerpo).
