# backend/app/services/

Lógica de negocio. Solo importa de `core/ports/` — nunca de `adapters/` directamente.

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
  `VaultService` para reservar y liberar nombres (en un hilo: es síncrono).
- `reservations.py` (`Reservations`, SPEC-0008): el algoritmo de reserva de unicidad con
  arrendamiento de 30 s (`RESERVATION_LEASE`), extraído de `VaultService` sin cambiarlo; lo
  parametrizan el tipo de documento, el campo del dueño y el predicado `holds`.
- `note_service.py` (`NoteService`, SPEC-0008): reservas `note-path:{vault_id}:{clave}` de las
  rutas de nota (documento sólo del servidor). Una reserva bloquea mientras alguna hoja
  viva y activa de la nota la use; una hoja en la papelera la libera. `NotePathTaken` es
  interna: el push la traduce a `note-path-taken`.
- Cambios de SPEC-0008 en el canal: `sync_filter.py` replica también `note:{uuid}:{uuid}`
  (selector `^(vault|note):`, un rango de `_all_docs` por prefijo; `note-path:*` nunca sale) y
  `sync_push.py` valida por tipo de documento (`_KINDS`), procesa las bóvedas antes que las
  notas, comprueba que la bóveda de la nota exista y esté activa (`vault-not-found`) y reserva
  o libera la ruta (`note-path-taken`).
