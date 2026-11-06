# backend/scripts/

Herramientas de operación que se ejecutan **dentro del contenedor** (`docker exec synapse-backend python scripts/<script>.py …`), salvo `pytest_shards.sh` (en el host). Las de datos son **informe en seco por defecto**: solo escriben con `--apply`, guardan un informe de lo anterior para revertir (`--report`/`--revert`) y se ensayan antes en una copia con los datos reales.

**Última actualización**: 2026-11-06

| Script | Para qué |
|---|---|
| `ensure_ag_folders.py` | Crea las carpetas reservadas (`AG - SKILLS`, `AG - MENSAJES`, `AG - AGENTES`, `BITACORA`, `PLANTILLAS`) y sus ÍNDICES en las bóvedas existentes (H-030) |
| `seed_agent_registry.py` + `agent_registry_seed.json` | Siembra el registro `AG - AGENTES` con los agentes y las carpetas donde escribe cada uno |
| `create_agent_keys.py` | Crea las claves por agente (`op-<agente>`) y escribe sus valores en un archivo 600; no sobrescribe uno existente |
| `purge_mensajes.py` | Purga las conversaciones **cerradas** de `AG - MENSAJES` con más de 15 días (volcado a JSONL que se conserva 30 días); la tarea diaria en el crontab del host está documentada en `docs/API.md` |
| `migrate_attributes.py` | Migración de los atributos de las notas al formato de metadatos de H-029, con informe en seco |
| `migrate_indices.py` | Migración de producción a los ÍNDICES automáticos (H-031): lleva a la papelera las notas indicadas y crea el ÍNDICE de cada carpeta |
| `h030b_migrate.py` | Lleva las carpetas de bitácora y plantillas existentes a las reservadas `BITACORA` y `PLANTILLAS` y reescribe los wikilinks (H-030b) |
| `h042_migrate.py` | Pone al día los datos del buzón `AG - MENSAJES` de todas las bóvedas vivas de todos los usuarios al formato de conversaciones (H-042) |
| `h030_common.py` | Utilidades compartidas por los scripts de H-030 |
| `rebuild_bitacora.py` | Regenera los documentos de `BITACORA/` desde el registro de cambios (`change_log`) |
| `sync_system_docs.py` | Replica la skill global y `plantilla-skill` (`app/system_docs/`) a todas las bóvedas: `--check` (por defecto, solo informe), `--apply --report`, `--revert`, `--stamp` (recalcula las huellas tras cambiar el texto) |
| `export_openapi.py` | Exporta el contrato OpenAPI de la app, repartido por feature |
| `backup_semanal.sh` | **En el host** (crontab, domingo 03:00 CDMX): respalda PostgreSQL, los documentos de CouchDB y los archivos de MinIO, los cifra y los sube a la carpeta «Aira Backups» de Drive; conserva los 3 últimos. Ver «Respaldo y restauración» |
| `restore_couchdb.py` | Restaura en un CouchDB los volcados de `backup_semanal.sh` (no pisa una base con documentos salvo `--force`) |
| `pytest_shards.sh` | Corre la suite del backend en N fragmentos en paralelo, cada uno con su `test.db` y su CouchDB (la suite completa en ~3 min). Nunca lances dos `pytest` a la vez sobre la misma base |

## Respaldo y restauración (2026-11-06)

`backup_semanal.sh` deja en Drive, por corrida, dos archivos con el mismo sello `AAAAMMDD-HHMM` (hora de CDMX): `synapse-db-…tar.zst.gpg` (PostgreSQL en formato custom + los documentos de cada base de CouchDB en JSON) y `synapse-files-…tar.zst.gpg` (los archivos de MinIO). Se cifran con GPG simétrico AES-256; la frase está en `.claude/worktrees/respaldos-semanales/passphrase` (600) **y debe guardarse también fuera de este servidor: sin ella no se abren**. La bitácora de cada corrida es `.claude/worktrees/respaldos-semanales/respaldo.log`. Cada lunes 09:00 CDMX una automatización de AIRA comprueba que haya un respaldo de los últimos 2 días.

Restaurar en un servidor nuevo (con los contenedores de `docker-compose.yml` ya levantados y vacíos):

1. Baja los dos archivos del sello que quieras desde Drive y descífralos: `gpg --batch --pinentry-mode loopback --passphrase-file <frase> -d <archivo>.gpg | zstd -d | tar -x`.
2. PostgreSQL: `docker exec -i synapse-postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < postgres.dump`.
3. CouchDB: `python3 restore_couchdb.py ./couchdb http://localhost:5984 <usuario> <contraseña>` (la URL del CouchDB publicado en el host).
4. Archivos: con `synapse-minio` detenido, `tar -xf <files>.tar -C /mnt/disco1/synapse-data/minio` y se vuelve a levantar.
5. Levanta `synapse-backend` y comprueba `/health`, el inicio de sesión y una nota. Ensayado el 2026-11-06 con un respaldo bajado de Drive: PostgreSQL (2 usuarios, 422 registros de cambios) y CouchDB (20 bases, 3 918 documentos) coincidieron con producción.
