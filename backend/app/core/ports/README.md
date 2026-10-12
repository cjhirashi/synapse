# backend/app/core/ports/

Interfaces abstractas (Protocols de Python). `services/` solo importa desde aquí.

Ningún adaptador concreto (CouchDB, Qdrant, psycopg2, etc.) aparece en este directorio.

| Puerto | Qué abstrae | Implementación |
|---|---|---|
| `auth_port.py` | usuarios y refresh tokens del control plane | `adapters/auth_repository.py` |
| `couchdb_port.py` | aprovisionar la base CouchDB de un usuario | `adapters/couchdb.py` |
| `vault_port.py` (`VaultPort`, SPEC-0003) | documentos de una base de usuario con control por `_rev` (`get`, `put`, `delete`, `list_page` paginado por `(created_at, _id)`); lanza `RevisionConflict` o `StorageUnavailable` | `adapters/vault_repository.py` |
