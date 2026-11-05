# models

Modelos SQLAlchemy del dominio. Solo definen la estructura de datos — la lógica de negocio vive en `services/`.
- `change_log.py` — `ChangeLog` (H-030b): registro de cambios de los documentos, origen de la BITACORA automática. Solo se añade; se escribe antes que la nota (`pending`) y se confirma (`applied`, con su `_rev`) o se marca (`failed`). Única por (bóveda, nota, `rev`). `users.timezone` (migración 009) fija la zona horaria de la bitácora.
