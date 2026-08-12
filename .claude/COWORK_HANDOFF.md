# COWORK_HANDOFF — Synapse Sprint 0

**Fecha:** 2026-08-12  
**Sesión:** Sprint 0 — Walking Skeleton  
**Rama activa:** `feature/sprint-0-walking-skeleton`  
**Estado:** ✅ COMPLETADO — PR abierto hacia `dev`

---

## Resumen de lo entregado

| Task | Descripción | Estado |
|------|-------------|--------|
| T-00 | Stack infraestructura (`~/infraestructura/`) — Caddy + Ollama + Open WebUI | ✅ |
| T-01 | 9 agentes de proyecto en `.claude/agents/` | ✅ |
| T-02 | Estructura de directorios del repo con README.md en cada carpeta | ✅ |
| T-03 | `docker-compose.yml` (prod) y `docker-compose.dev.yml` (dev) | ✅ |
| T-04 | `.env.example` completo | ✅ |
| T-05 | Backend mínimo con `GET /health` → `{"status": "ok"}` | ✅ |
| T-06 | Alembic inicializado — migración `001_initial` — `alembic upgrade head` sin errores | ✅ |
| T-07 | `pytest tests/test_health.py -v` → 1 passed | ✅ |

---

## Verificaciones ejecutadas

```
$ curl http://localhost:8000/health
{"status":"ok"}

$ docker compose exec backend pytest tests/test_health.py -v
tests/test_health.py::test_health_check PASSED   [100%]
1 passed in 0.01s

$ docker compose exec backend alembic upgrade head
INFO  Running upgrade  -> de3dbd0d0150, 001_initial
```

---

## Estado de contenedores

```
synapse-backend    Up   0.0.0.0:8000->8000/tcp
synapse-couchdb    Up
synapse-postgres   Up
synapse-qdrant     Up
```

Infraestructura (`~/infraestructura/`):
```
caddy        Up
ollama       Up
open-webui   Up
```

---

## GitHub

- Repo: `github.com/cjhirashi/synapse`
- Ramas publicadas: `main`, `dev`, `feature/sprint-0-walking-skeleton`
- PR: `feature/sprint-0-walking-skeleton` → `dev` — pendiente revisión de Charlie

---

## Pendiente para siguientes sprints

1. **Agentes transversales faltantes** — `~/.claude/agents/` en el servidor está vacío.  
   Charlie debe instalar los 18 agentes desde el repo Fábrica de Agentes Transversales.

2. **Cargar modelo Ollama** — `llama3.1:8b` no confirmado descargado.  
   Verificar: `docker compose -f ~/infraestructura/docker-compose.yml exec ollama ollama list`

3. **Configurar `.env` real** — copiar `.env.example` a `.env` y rellenar credenciales antes de Sprint 1.

4. **Caddyfile** — dominio `synapse.tudominio.com` es placeholder.  
   Cuando Charlie defina el dominio real, actualizar `~/infraestructura/Caddyfile` manualmente (no modificar sin instrucción explícita).

---

## Arquitectura establecida

- **Hexagonal**: `services/` importa solo de `core/ports/`; `adapters/factory.py` selecciona implementación por `HIRA_DEPLOY_MODE`
- **Aislamiento de usuarios**: cada usuario tiene su propia DB CouchDB `user-{id}` — invariante crítico
- **Git flow**: `feature/*` → PR → `dev` → Charlie revisa → `main`. Nunca commit directo a `dev` o `main`
- **DNS Docker**: configurado en `/etc/docker/daemon.json` con DNS del router + Google
- **SSH GitHub**: clave ed25519 del servidor activa en GitHub
