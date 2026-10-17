# backend/app/core/ports/

Interfaces abstractas (Protocols de Python). `services/` solo importa desde aquí.

Ningún adaptador concreto (CouchDB, httpx, psycopg2, etc.) aparece en este directorio.

| Puerto | Qué abstrae | Implementación |
|---|---|---|
| `auth_port.py` | usuarios y refresh tokens del control plane | `adapters/auth_repository.py` |
| `couchdb_port.py` | aprovisionar la base CouchDB de un usuario | `adapters/couchdb.py` |
| `vault_port.py` (`VaultPort`, SPEC-0003) | documentos de una base de usuario con control por `_rev` (`get`, `put`, `delete`, `list_page` paginado por `(created_at, _id)`; `leaves`, todas las hojas vivas con su `_revisions`, SPEC-0005 RF-008); lanza `RevisionConflict` o `StorageUnavailable` | `adapters/vault_repository.py` |
| `replication_port.py` (`ReplicationPort`, SPEC-0005) | protocolo de replicación de CouchDB sobre una base de usuario, **async** (`db_info`, `changes` en flujo, `revs_diff`, `bulk_get`, `all_docs`, `bulk_docs_replicated` con `new_edits: false`, `get_local`/`put_local`); recibe parámetros ya filtrados y devuelve las respuestas de CouchDB tal cual; lanza `StorageUnavailable` | `adapters/replication_repository.py` |
