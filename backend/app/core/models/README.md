# models

Modelos SQLAlchemy del dominio. Solo definen la estructura de datos — la lógica de negocio vive en `services/`.
- `change_log.py` — `ChangeLog` (H-030b): registro de cambios de los documentos, origen de la BITACORA automática. Solo se añade; se escribe antes que la nota (`pending`) y se confirma (`applied`, con su `_rev`) o se marca (`failed`). Única por (bóveda, nota, `rev`). `users.timezone` (migración 009) fija la zona horaria de la bitácora.
- `user.py` / `role.py` — `User` (`users`: correo normalizado, hash Argon2id, `token_version`, zona horaria `timezone`, cambio de contraseña forzado) y `Role` (`roles`).
- `refresh_token.py` — `RefreshToken` (`refresh_tokens`): refresh tokens de la sesión por cookie, guardados solo como hash.
- `agent_api_key.py` — `AgentApiKey` (`agent_api_keys`, migraciones 005 y 008): API keys de agente (solo `key_hash`), con la identidad del agente a la que pertenece cada clave.
- `agent_access_log.py` — `AgentAccessLog` (`agent_access_log`, H-030): registro del modo sombra de los permisos por agente; guarda qué habría rechazado el servidor sin bloquearlo.
- `purge_log.py` — `PurgeLog` (`purge_log`, H-030): conversaciones de `AG - MENSAJES` purgadas por `scripts/purge_mensajes.py`.
- `file.py` — `File` (`files`, migraciones 006 y 007): metadatos de un archivo subido a MinIO (carpeta opcional, visibilidad).
