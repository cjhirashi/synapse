# backend/scripts/

Herramientas de operación que se ejecutan **dentro del contenedor** (`docker exec synapse-backend python scripts/<script>.py …`), salvo `pytest_shards.sh` (en el host). Las de datos son **informe en seco por defecto**: solo escriben con `--apply`, guardan un informe de lo anterior para revertir (`--report`/`--revert`) y se ensayan antes en una copia con los datos reales.

**Última actualización**: 2026-11-05

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
| `pytest_shards.sh` | Corre la suite del backend en N fragmentos en paralelo, cada uno con su `test.db` y su CouchDB (la suite completa en ~3 min). Nunca lances dos `pytest` a la vez sobre la misma base |
