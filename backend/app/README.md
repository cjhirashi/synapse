# backend/app/

Paquete principal de la aplicación FastAPI. Entrada: `main.py`, que monta los routers
`auth`, `admin`, `agent_keys`, `vaults`, `notes`, `files` y `sync`.

Arquitectura hexagonal; las dependencias apuntan hacia `core/`:

| Directorio | Rol |
|---|---|
| `routers/` | Adaptadores primarios (HTTP). Reciben y delegan a `services/`. |
| `services/` | Lógica de negocio. Solo importa de `core/ports/`. |
| `core/` | Configuración, seguridad, errores (Problem Details), reglas puras (notas, atributos META, fechas, seguridad de archivos), modelos y puertos. |
| `adapters/` | Implementaciones concretas de los puertos: CouchDB, Postgres (SQLAlchemy) y MinIO. |
| `bootstrap.py` | Siembra el administrador desde el entorno (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) si todavía no hay usuarios. |

Cada subdirectorio tiene su propio `README.md` con el detalle de sus módulos.
