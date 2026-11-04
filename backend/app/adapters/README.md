# backend/app/adapters/

Implementaciones concretas de los puertos. `factory.py` selecciona según `HIRA_DEPLOY_MODE`.

Aquí viven las dependencias concretas: CouchDB, httpx, psycopg2, MinIO, etc.

- `database.py`: base declarativa y sesión de SQLAlchemy (`get_db`) del control plane (PostgreSQL).
- `auth_repository.py` (`AuthRepository`): usuarios, roles, refresh tokens y versión de token (`AuthPort`).
- `agent_key_repository.py` (`AgentKeyRepository`, SPEC-0013): tabla de API keys de agente (solo el hash en reposo).
- `file_repository.py` (`FileRepository`, H-015): metadatos de archivos (nombre, tipo, tamaño, visibilidad, carpeta) sobre la sesión de Postgres.
- `minio_adapter.py` (`MinioObjectStorage`, H-015/H-016): `ObjectStoragePort` sobre MinIO. `minio` se importa dentro del
  constructor y de los métodos para que los tests usen un FAKE del puerto (`tests/fake_object_storage.py`); todo fallo del
  cliente sube como `StorageUnavailable` (503). Clave de objeto: `vaults/<vault_id>/<file_id>`.
- `couchdb.py` (`CouchDBAdapter`): acceso a la API HTTP de CouchDB (bases por usuario).

- `vault_repository.py` (`VaultRepository`, SPEC-0003): `VaultPort` sobre la API HTTP de
  CouchDB. Traduce el 409 de `_rev` a `RevisionConflict` (también el 404 al borrar un
  documento que ya no existe: para quien borra es la misma carrera) y los fallos de red o respuestas
  inesperadas a `StorageUnavailable`. Crea el índice `_design/vaults` (vista `by_created`,
  clave `[borrada?1:0, created_at]`) la primera vez que lista cada base y lo recuerda por
  proceso; la ruta usa una única instancia (`get_vault_port`).
  `leaves` (SPEC-0005) lee todas las hojas vivas con `open_revs=all` y `revs=true`.
- `replication_repository.py` (`ReplicationRepository`, SPEC-0005): `ReplicationPort` con
  `httpx.AsyncClient` y la credencial admin de CouchDB; un cliente por operación (el pool no
  queda atado al bucle de otra petición). Los ids `_local` van con los puntos codificados
  (`%2E`): `httpx` normalizaría `..` y la ruta saldría de `_local`. `changes` devuelve el cuerpo en flujo y mantiene la
  conexión hasta agotarlo, con una espera de lectura de la pedida (máx. 60 s) más 10 s de
  margen; el resto, 10 s. Fallos de red o respuestas inesperadas (también un 409, que CouchDB
  no da en estas rutas: los `_local` no comprueban la revisión) → `StorageUnavailable`.
