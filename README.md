# Synapse

Plataforma personal self-hosted para gestión del conocimiento con agentes de IA.
Reemplaza Claude Desktop + Obsidian.

**Stack:** FastAPI · CouchDB/PouchDB · Qdrant · LangGraph · LiteLLM · React  
**Despliegue:** Docker Compose en servidor local Ubuntu (`192.168.100.200`)

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
