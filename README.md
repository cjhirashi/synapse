# Synapse

Almacén personal self-hosted de bóvedas de conocimiento. Sin IA interna: los agentes
externos (OpenClaw) acceden vía API.

**Stack:** FastAPI · PostgreSQL (control plane) · CouchDB/PouchDB · React  
**Despliegue:** Docker Compose en servidor local Ubuntu (self-hosted)

## Estructura

```
synapse/
├── backend/          # FastAPI — Arquitectura Hexagonal
│   └── app/
│       ├── core/     # Config, seguridad, logger
│       │   └── ports/    # Interfaces abstractas (Protocols)
│       ├── services/ # Lógica de negocio
│       ├── adapters/ # Implementaciones concretas + factory.py
│       └── routers/  # Endpoints FastAPI (adaptadores primarios)
├── frontend/         # React + TypeScript + PouchDB
├── knowledge/        # Prompts de sistema y configuración de agentes
└── .claude/          # Handoff con Cowork (COWORK_HANDOFF.md se publica)
```

## Inicio rápido

```bash
# Infraestructura compartida primero
cd ~/infraestructura && docker compose up -d

# Synapse — desarrollo
cd /mnt/disco2/cjhirashi-data/proyectos/synapse
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Verificar
curl http://localhost:8000/health
```
