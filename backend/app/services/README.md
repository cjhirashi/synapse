# backend/app/services/

Lógica de negocio. Solo importa de `core/ports/` — nunca de `adapters/` directamente.

- `vault_service.py` (`VaultService`, SPEC-0003): reglas de las bóvedas y reservas de nombre.
  Desde SPEC-0005 una reserva sigue siendo de su bóveda mientras **alguna** hoja viva activa
  use el nombre (`_holder` mira todas las hojas, no sólo la ganadora).
- `sync_filter.py` (SPEC-0005): funciones puras del canal: lista blanca de parámetros,
  selector fijo de bóvedas para `_changes`, rango `vault:*` de `_all_docs`, saneado de
  respuestas (sin recuentos ni reservas) y `MAX_WAIT_MS` (60 s). Inválido → `InvalidSyncRequest`.
- `sync_push.py` (`SyncPushService`, SPEC-0005): push validado de `_bulk_docs`. Comprueba cada
  revisión en orden (id, reenvío, lápida, forma, normalización, reglas, nombre), escribe las
  aceptadas juntas y responde los rechazos `{id, rev, error: "forbidden", reason}`. Usa
  `VaultService` para reservar y liberar nombres (en un hilo: es síncrono).
