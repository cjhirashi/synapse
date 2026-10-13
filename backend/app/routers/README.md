# backend/app/routers/

Adaptadores primarios — reciben HTTP requests y delegan a `services/`.

Convención de rutas: `kebab-case` en URLs, `snake_case` en campos JSON.

- `sync.py` (SPEC-0005): canal `/sync` para PouchDB. La base sale del token
  (`get_sync_db`); sólo existe el subconjunto del protocolo que usa el replicador y una ruta
  comodín final responde `SyncEndpointNotFound` a todo lo demás (también a métodos no
  previstos en rutas conocidas). `SyncRoute` limita el cuerpo antes de leerlo (4 MiB; 64 KiB
  en `_local`). Rutas `async def`; la sesión SQL se cierra antes de responder para que un
  `longpoll` no retenga una conexión del pool.
