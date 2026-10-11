# AGENTS.md — Synapse

> **Punto de entrada** para cualquier agente que trabaje en este repo. Es un **mapa**,
> no una biblia: lee sólo lo que necesites, cuando lo necesites.
>
> **Cómo trabajamos:** este repo usa un arnés **SDD Anchored** (spec viva anclada al
> código). Empieza por **`.harness/method.md §0`**. Los principios innegociables están
> en **`.harness/constitution.md`**.
>
> **Separación estricta:** `.harness/` = gobernanza · `docs/` = el producto.

## Antes de empezar (en orden)

1. Ejecuta **`.harness/gate/check.sh`**. Si cierra (exit 1 / ❌), **DETENTE** y reporta.
2. Lee **`.harness/memory/state.md`** (correcciones del usuario van arriba — se leen SIEMPRE).
3. Ojea **`.harness/specs/`** — carpetas `NNN-slug` = features; `estado:` en su `spec.md`.

## Qué es Synapse

Plataforma personal self-hosted para gestión del conocimiento con agentes IA.
Reemplaza Claude Desktop + Obsidian. Stack: FastAPI + CouchDB/PouchDB + React.

**Arquitectura:** Hexagonal (services → `core/ports/`; adapters seleccionados por factory).
**Crítico:** Aislamiento por usuario. Base CouchDB `synapse_user_{id}`. **Nunca romper.**

## Servicios / módulos

| Módulo | Stack | Tests | Arranque |
|--------|-------|-------|----------|
| **Backend** | FastAPI + CouchDB | `pytest tests/ --cov=app` | `docker compose up -d` |
| **Frontend** | React | `npm test --coverage` | `docker compose up -d` |
| **Sync** | PouchDB + offline-first | Incluido en tests | Automático |

## Convenciones

- **Código:** inglés. **Specs/docs:** español.
- **Commits:** Conventional Commits + `(T-NNN)` o `(RF-NNN)`.
- **IDs:** `RF-`/`RNF-`/`T-` por feature; `ADR-` por proyecto.
- **Tests:** anotados con su `RF-` en comment.
- **Errores API:** RFC 9457 (Problem Details).

## Reglas P1-P5 (seguridad — SIEMPRE)

- **P1:** Gate siempre primero.
- **P2:** Datos scoped a `current_user.id`.
- **P3:** Permisos validados (owner check).
- **P4:** Sin secretos en repo.
- **P5:** Tests con BD real (nunca mocks).

## Mapa de documentación (producto)

| Doc | Ruta | Se actualiza cuando… |
|-----|------|---------------------|
| Especificaciones | `.harness/specs/*/spec.md` | Nueva feature |
| Planes | `.harness/specs/*/plan.md` | Fase 2 → 3 |
| Decisiones | `.harness/decisions/ADR-*.md` | Cambio arquitectónico |
| API | `docs/API.md` | Endpoints cambian |

Tabla completa: `.harness/constitution.md` Art. 11.

## Roles Fijos (para futuras colaboraciones)

| Rol | Especialidad |
|-----|---|
| **arquitecto-fastapi** | Endpoints, middleware, performance |
| **experto-couchdb** | Datos, sync, aislamiento |
| **guardian-seguridad** | Permisos, OWASP |
| **especialista-frontend** | React, UX, hooks |

**OpenClaw (externos):** AIRA (diseño), Paulina (?), Liza (coordinación), main (orquestación).

---

**Synapse — SDD Anchored — Harness Génesis Completada**
