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
- **Gobierno de agentes:** cada bóveda trae carpetas de sistema en la raíz (`AG - SKILLS`,
  `AG - MENSAJES`, `AG - AGENTES`, `BITACORA`, `PLANTILLAS`). El servidor genera solo la **bitácora**
  diaria desde el registro de cambios, los **ÍNDICES** de cada carpeta y las propiedades selladas
  (fechas); `AG - AGENTES` registra qué agente escribe en qué carpeta (hoy en modo sombra:
  `AGENT_ACCESS_MODE=shadow`, registra sin bloquear) y `AG - MENSAJES` es el buzón entre agentes
  (conversaciones como carpetas, solo las escriben los agentes). Una **skill global** y una plantilla
  de sistema se publican en todas las bóvedas y no se pueden editar desde la plataforma
  (`backend/app/system_docs/`).
- **Propiedades de las notas:** metadatos tipados (texto, fecha, selección, selección múltiple)
  separados del cuerpo, sin YAML en el texto.
- **Cuenta:** login con cookie + refresh, cambio forzado de contraseña, gestión de API keys en
  `/settings/api-keys`, administración de agentes en `/settings/agent-access`, tema claro/oscuro/sistema.

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
│   ├── alembic/      # Migraciones del control plane (001…009)
│   ├── scripts/      # Operación: migraciones de datos, claves por agente, purga, publicación de la skill global (ver scripts/README.md)
│   └── tests/
├── frontend/         # React + TypeScript + PouchDB (SPA offline-first)
├── docs/API.md       # Guía de la API para consumidores (agentes)
├── diseño/           # Documentación de diseño del producto (solo en el árbol principal; ignorada por git, fuera de los worktrees)
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
[`frontend/README.md`](frontend/README.md); operación: [`backend/scripts/README.md`](backend/scripts/README.md).
Cómo se trabaja y qué sigue: `AGENTS.md` y `.harness/backlog.md`. Estado a 2026-11-05: en producción.

## Licencia

Este proyecto se distribuye bajo la [PolyForm Noncommercial License 1.0.0](LICENSE): se puede ver, estudiar y usar con fines no comerciales. **No se permite su uso comercial** sin autorización escrita del autor. Copyright 2026 Carlos Jiménez Hirashi.
