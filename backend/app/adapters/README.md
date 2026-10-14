# backend/app/adapters/

Implementaciones concretas de los puertos. `factory.py` selecciona según `HIRA_DEPLOY_MODE`.

Aquí viven las dependencias concretas: CouchDB, httpx, psycopg2, etc.

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
  margen; el resto, 10 s. Fallos de red o respuestas inesperadas → `StorageUnavailable`.
