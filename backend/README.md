# backend/

FastAPI application — Arquitectura Hexagonal.

## Regla de oro

`services/` solo importa de `core/ports/`. Nunca de `adapters/` directamente.  
`adapters/factory.py` selecciona la implementación concreta.  
`routers/` son adaptadores primarios — reciben requests y delegan a `services/`.

## Estructura

```
backend/
├── app/
│   ├── core/
│   │   └── ports/    # Interfaces abstractas (Protocols de Python)
│   ├── services/     # Lógica de negocio
│   ├── adapters/     # Implementaciones concretas (CouchDB, Qdrant, etc.)
│   │   └── factory.py
│   └── routers/      # Endpoints FastAPI
├── alembic/          # Migraciones PostgreSQL
├── tests/
├── Dockerfile
└── requirements.txt
```

## Comandos

```bash
# Tests
docker compose exec backend pytest -v

# Migraciones
docker compose exec backend alembic upgrade head
```
