# backend/app/routers/

Adaptadores primarios — reciben HTTP requests y delegan a `services/`.

Convención de rutas: `kebab-case` en URLs, `snake_case` en campos JSON.

- `agent_keys.py` (SPEC-0013): gestión `/auth/agent-keys` de las API keys de agente (crear,
  listar, revocar). Router propio (no dentro de `auth.py`, P-9) y **sólo cookie** por
  construcción (`dependencies=[Depends(get_current_user)]`): una `Bearer` key no acuña ni
  revoca keys (P-4). `vaults.py` y `sync.py` aceptan además la `Bearer` key porque usan
  `get_current_principal` (cookie→Bearer) en vez de `get_current_user`; la base sigue saliendo
  sólo del principal.
- `sync.py` (SPEC-0005): canal `/sync` para PouchDB. La base sale del token
  (`get_sync_db`); sólo existe el subconjunto del protocolo que usa el replicador y una ruta
  comodín final responde `SyncEndpointNotFound` a todo lo demás (también a métodos no
  previstos en rutas conocidas). `SyncRoute` valida la sesión **antes** de leer el cuerpo (sin
  sesión válida no se lee ni un byte) y limita el cuerpo antes de leerlo, con tope por
  ruta: 16 MiB en `_bulk_docs` (SPEC-0008: una nota de 2 MiB escapada pesa ~12 MiB), 64 KiB
  en `_local` y 4 MiB en el resto. Un JSON inválido, demasiado anidado o con enteros gigantes
  (más dígitos de los que admite el decodificador) es siempre un 422 `validation-error`, nunca
  un 400 ni un 500. Rutas `async def`; la sesión SQL se cierra antes de responder para que un
  `longpoll` no retenga una conexión del pool.
