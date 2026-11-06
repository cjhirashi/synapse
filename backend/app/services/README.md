# backend/app/services/

Lógica de negocio. Solo importa de `core/ports/` — nunca de `adapters/` directamente.

- `agent_key_service.py` (`AgentKeyService`, SPEC-0013): dominio de las API keys de agente
  tras `core/ports/agent_key_port.py` (adaptador `adapters/agent_key_repository.py`). `create`
  genera/hashea/persiste y devuelve el plano una sola vez (label único vigente por dueño →
  `AgentKeyLabelTaken`); `resolve` valida forma → hash → key vigente → dueño activo (si no,
  `None` → 401, nunca 403) y actualiza `last_used_at` best-effort en commit propio (si falla no
  tumba la petición); `list`/`revoke` scoped por `owner_id` (ajena → `AgentKeyNotFound`). Sin
  dependencia de CouchDB: sólo identidad en el control plane.
- `auth_service.py` (`AuthService`, SPEC-0002): login, refresh y logout, cambio de contraseña, alta de usuarios (provisiona su base en CouchDB) y siembra del administrador (`bootstrap_admin`).
- `file_service.py` (`FileService`, H-015/H-016): reglas de archivos. Comprueba que la bóveda sea del
  usuario, el tamaño (5 MB imágenes, 25 MB documentos), el tipo por **firma de bytes** (nunca por el
  `Content-Type` del cliente), sanea SVG y valida el nombre y la carpeta. Opera sobre el repositorio de
  metadatos y el puerto de almacenamiento de objetos; no conoce HTTP.
- H-030: `agent_access_guard.py` (cumplimiento del registro `AG - AGENTES`: modo sombra/`enforce`, caché del registro y bitácora
  `agent_access_log`), `agent_registry_service.py` (lee y escribe el registro), `mensajes_service.py` (reabrir conversaciones,
  sellar `cerrada_el` de cabeceras llegadas por `/sync`) y `mensajes_purge.py` (purga de cerradas > 15 días con volcado a 30 días).
- H-030b: `change_log_service.py` (`ChangeLogService`: registra cada cambio de nota en `change_log` ANTES de escribirla, idempotente por
  `_rev` en `/sync`, y genera los documentos diarios `BITACORA/AAAA-MM/AAAA-MM-DD.md` en la zona horaria del propietario; `rebuild`
  los regenera desde la tabla). Lo usan `note_content_service.py`, `sync_push.py` y `folder_service.py`; si el registro no se puede
  escribir, la escritura no se hace (503). `BITACORA_DOCS=false` apaga los documentos (no el registro).
- H-041 E4: `skill_service.py` (`SkillService`: listado de skills, asignar propietario, el flujo del gestor que sale `leave` —resuelve cada skill, lo quita de los invitados y quita o suspende el registro— y `reconcile_guests`, que quita de `agentes` a quien ya no es gestor tras cualquier escritura del registro). Lo usan `routers/agent_access.py`, `note_content_service.py` y `sync_push.py`.
- H-041: `system_docs_service.py` (`SystemDocsService`: publicador de los documentos de sistema, `plan`/`apply`/`revert` por bóveda como `Actor("system")` por `NoteContentService`, conservando el id de la nota; `sync_all` recorre las bóvedas de todos los usuarios y `sync_all_in_background` lo corre al arrancar con `SYSTEM_DOCS_SYNC`). `ensure_ag_folders` publica estos documentos al crear la bóveda; sustituye a la siembra de la skill de cajón (H-030b).
- `note_content_service.py` (`NoteContentService`, historia 0014): contenido de notas vía REST para agentes
  sobre la base CouchDB del usuario (a través de `VaultPort`). Cursor opaco ligado a la bóveda, `ETag` =
  `_rev` entre comillas, y escritura que reusa `core/note_rules.py`, `core/attribute_rules.py` y
  `core/note_dates.py` (sin reescribirlas).
- `vault_service.py` (`VaultService`, SPEC-0003, H-029; ahora también guarda el catálogo de atributos META): reglas de las bóvedas y reservas de nombre.
  Desde SPEC-0005 una reserva sigue siendo de su bóveda mientras **alguna** hoja viva activa
  use el nombre (`_holder` mira todas las hojas, no sólo la ganadora).
- `sync_filter.py` (SPEC-0005): funciones puras del canal: lista blanca de parámetros,
  selector fijo de bóvedas para `_changes`, rango `vault:*` de `_all_docs`, saneado de
  respuestas (sin recuentos ni reservas) y `MAX_WAIT_MS` (60 s). Inválido → `InvalidSyncRequest`.
  `checkpoint_id` admite sólo ids `_local` con el formato de PouchDB (otro →
  `SyncEndpointNotFound`) y `check_checkpoint_doc` valida el cuerpo del checkpoint.
- `sync_push.py` (`SyncPushService`, SPEC-0005): push validado de `_bulk_docs`. Comprueba cada
  revisión en orden (id, reenvío, lápida, forma —revisiones hexadecimales—, normalización,
  reglas, nombre), escribe las
  aceptadas juntas y responde los rechazos `{id, rev, error: "forbidden", reason}`. Usa
  `VaultService` para reservar y liberar nombres (en un hilo: es síncrono). Las claves de una
  bóveda se distinguen en **admitidas** (`_VAULT_KEYS`, incluye `icon`) y **obligatorias**
  (`_VAULT_REQUIRED`, sin `icon`: los documentos anteriores a SPEC-0009 no lo tienen); `icon`
  sólo se valida (`VaultIcon | None`, sin normalizar → `validation-error:icon`) si la clave está.
- `reservations.py` (`Reservations`, SPEC-0008): el algoritmo de reserva de unicidad con
  arrendamiento de 30 s (`RESERVATION_LEASE`), extraído de `VaultService` sin cambiarlo; lo
  parametrizan el tipo de documento, el campo del dueño y el predicado `holds`.
- `note_service.py` (`NoteService`, SPEC-0008): reservas `note-path:{vault_id}:{sha256(path_key)}` de las
  rutas de nota (documento sólo del servidor). Una reserva bloquea mientras alguna hoja
  viva y activa de la nota la use; una hoja en la papelera la libera. `NotePathTaken` es
  interna: el push la traduce a `note-path-taken`.
- Cambios de SPEC-0008 en el canal: `sync_filter.py` replica también `note:{uuid}:{uuid}`
  (selector `^(vault|note):`, un rango de `_all_docs` por prefijo; `note-path:*` nunca sale) y
  `sync_push.py` valida por tipo de documento (`_KINDS`), procesa las bóvedas antes que las
  notas, comprueba que la bóveda de la nota exista y esté activa (`vault-not-found`) y reserva
  o libera la ruta (`note-path-taken`).
- `wikilink_rewrite_service.py` (`WikilinkRewriteService`, H-039): reescribe los wikilinks de una bóveda tras mover o renombrar notas o carpetas. CouchDB no tiene transacciones entre documentos: cada nota se escribe sobre el `_rev` leído y, ante un conflicto de revisión, se relee y reintenta. Los mensajes de `AG - MENSAJES` (históricos) no se tocan.
