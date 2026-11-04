# Synapse

Almacén personal self-hosted de bóvedas de conocimiento: notas Markdown estilo Obsidian que
se editan sin conexión y se sincronizan, más archivos adjuntos. Sin IA interna: los agentes
externos (OpenClaw) acceden vía API REST con una API key.

**Stack:** FastAPI · PostgreSQL (control plane: usuarios, sesiones, API keys, metadatos de
archivos) · CouchDB/PouchDB (bóvedas y notas, offline-first) · MinIO (objetos de archivos) · React + TypeScript + Vite  
**Despliegue:** Docker Compose en servidor local Ubuntu (self-hosted); dominio vía `SYNAPSE_DOMAIN`.

## Qué hace hoy

- **Bóvedas y notas** con árbol de carpetas, papelera, restauración, resolución de conflictos y
  sincronización PouchDB ↔ CouchDB (`/sync`). Cada bóveda tiene icono, color y un catálogo de
  atributos META propio (tipos fecha, select y multiselect).
- **Editor** con vistas Visual (Milkdown), Código (CodeMirror) y Lectura; wikilinks `[[Destino]]`
  con navegación y vista previa, bloques de código con resaltado, Mermaid, tablas, tareas, HTML
  incrustado en iframe aislado (diagramas Archify), gráficos Plotly (HTML) y vídeos de YouTube.
- **Archivos** (`/files`): subida de imágenes (5 MB) y documentos (25 MB) a MinIO con visibilidad
  privada o pública, tipo verificado por firma de bytes, SVG saneado, carpeta opcional, renombrar
  y borrar.
- **Acceso de agentes:** API keys de agente (`/auth/agent-keys`, `Authorization: Bearer syn_ak_…`)
  para leer y escribir bóvedas, notas y archivos por REST. Guía en [`docs/API.md`](docs/API.md).
- **Cuenta:** login con cookie + refresh, cambio forzado de contraseña, gestión de API keys en
  `/settings/api-keys`, tema claro/oscuro/sistema.

## Estructura

```
synapse/
├── backend/          # FastAPI — Arquitectura Hexagonal
│   ├── app/
│   │   ├── core/     # Config, seguridad, errores (RFC 9457), reglas de notas/atributos/archivos
│   │   │   ├── ports/    # Interfaces abstractas (Protocols)
│   │   │   └── models/   # Tablas del control plane (usuarios, tokens, API keys, archivos)
│   │   ├── services/ # Lógica de negocio
│   │   ├── adapters/ # Implementaciones concretas (CouchDB, Postgres, MinIO)
│   │   └── routers/  # Endpoints FastAPI (adaptadores primarios)
│   ├── alembic/      # Migraciones del control plane (001…007)
│   └── tests/
├── frontend/         # React + TypeScript + PouchDB (SPA offline-first)
├── docs/API.md       # Guía de la API para consumidores (agentes)
├── diseño/           # Documentación de diseño del producto
├── knowledge/        # Prompts de sistema y configuración de agentes
└── .harness/         # Arnés de desarrollo (Slice Development): método, backlog, historias, gate
```

## Inicio rápido

```bash
# Infraestructura compartida primero
cd ~/infraestructura && docker compose up -d

# Synapse — desarrollo (backend, CouchDB, PostgreSQL y MinIO)
cd /mnt/disco2/cjhirashi-data/proyectos/synapse
cp .env.example .env   # rellena credenciales, JWT_SECRET, ADMIN_EMAIL/ADMIN_PASSWORD y SYNAPSE_DOMAIN
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Verificar
curl http://localhost:8000/health
```

Tests y comandos de cada parte: [`backend/README.md`](backend/README.md) y
[`frontend/README.md`](frontend/README.md). Cómo se trabaja y qué sigue: `AGENTS.md` y
`.harness/backlog.md`.
