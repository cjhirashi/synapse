# backend/app/services/

Lógica de negocio. Solo importa de `core/ports/` — nunca de `adapters/` directamente.

- `agent_key_service.py` (`AgentKeyService`, SPEC-0013): dominio de las API keys de agente
  tras `core/ports/agent_key_port.py` (adaptador `adapters/agent_key_repository.py`). `create`
  genera/hashea/persiste y devuelve el plano una sola vez (label único vigente por dueño →
  `AgentKeyLabelTaken`); `resolve` valida forma → hash → key vigente → dueño activo (si no,
  `None` → 401, nunca 403) y actualiza `last_used_at` best-effort en commit propio (si falla no
  tumba la petición); `list`/`revoke` scoped por `owner_id` (ajena → `AgentKeyNotFound`). Sin
  dependencia de CouchDB: sólo identidad en el control plane.
- `vault_service.py` (`VaultService`, SPEC-0003): reglas de las bóvedas y reservas de nombre.
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
