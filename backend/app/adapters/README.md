# backend/app/adapters/

Implementaciones concretas de los puertos. `factory.py` selecciona según `HIRA_DEPLOY_MODE`.

Aquí viven las dependencias concretas: CouchDB, Qdrant, psycopg2, etc.

- `vault_repository.py` (`VaultRepository`, SPEC-0003): `VaultPort` sobre la API HTTP de
  CouchDB. Traduce el 409 de `_rev` a `RevisionConflict` (también el 404 al borrar un
  documento que ya no existe: para quien borra es la misma carrera) y los fallos de red o respuestas
  inesperadas a `StorageUnavailable`. Crea el índice `_design/vaults` (vista `by_created`,
  clave `[borrada?1:0, created_at]`) la primera vez que lista cada base y lo recuerda por
  proceso; la ruta usa una única instancia (`get_vault_port`).
