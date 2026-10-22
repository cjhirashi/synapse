# backend/app/routers/

Adaptadores primarios — reciben HTTP requests y delegan a `services/`.

Convención de rutas: `kebab-case` en URLs, `snake_case` en campos JSON.

- `sync.py` (SPEC-0005): canal `/sync` para PouchDB. La base sale del token
  (`get_sync_db`); sólo existe el subconjunto del protocolo que usa el replicador y una ruta
  comodín final responde `SyncEndpointNotFound` a todo lo demás (también a métodos no
  previstos en rutas conocidas). `SyncRoute` limita el cuerpo antes de leerlo, con tope por
  ruta: 16 MiB en `_bulk_docs` (SPEC-0008: una nota de 2 MiB escapada pesa ~12 MiB), 64 KiB
  en `_local` y 4 MiB en el resto. Rutas `async def`; la sesión SQL se cierra antes de responder para que un
  `longpoll` no retenga una conexión del pool.
