# backend/app/routers/

Adaptadores primarios — reciben HTTP requests y delegan a `services/`.

Convención de rutas: `kebab-case` en URLs, `snake_case` en campos JSON.

- `agent_access.py` (H-030): registro de agentes por bóveda (`/vaults/{id}/agent-access`) e informe del modo sombra
  (`/agent-access/shadow-report`); escribir solo con cookie.
- `agent_keys.py` (SPEC-0013): gestión `/auth/agent-keys` de las API keys de agente (crear,
  listar, revocar). Router propio (no dentro de `auth.py`, P-9) y **sólo cookie** por
  construcción (`dependencies=[Depends(get_current_user)]`): una `Bearer` key no acuña ni
  revoca keys (P-4). `vaults.py` y `sync.py` aceptan además la `Bearer` key porque usan
  `get_current_principal` (cookie→Bearer) en vez de `get_current_user`; la base sigue saliendo
  sólo del principal.
- `auth.py`: sesión por cookie (`/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`) y cambio de contraseña.
- `admin.py` (H-060): `/admin/users` — listar, alta (contraseña base y límites), límites, baja con gracia de 30 días, recuperar y, solo el super admin, cambiar roles.
- `vaults.py` (SPEC-0003, H-029): CRUD de bóvedas con `ETag`/`If-Match`, papelera y restauración
  (`DELETE`, `POST /{id}/restore`), catálogo de atributos META de la bóveda, y
  `GET /vaults/{vault_id}/files` (lista paginada de los archivos de la bóveda, 404 si no es del usuario).
- `notes.py` (historia 0014, H-029): notas de una bóveda para agentes —listar con cursor, leer, crear,
  actualizar parcial (`PATCH`), borrar y restaurar— con `ETag`; delega en `NoteContentService`. Las fechas
  de la nota las sella el servidor (día de CDMX) cuando escribe un agente. `POST /vaults/{vault}/notes/{id}/pdf`
  (H-036, solo sesión de la persona): HTML de Lectura + formato de la plantilla del documento → PDF (`NotePdfService`).
- `publications.py` (H-035): gestión de publicaciones `/vaults/{vault_id}/notes/{note_id}/publication`. `GET` consulta el estado (habilitada, publicada, token, fechas, estale), `POST` publica, `PUT` republicar, `DELETE` despublica, `POST /check` comprueba recursos. Solo sesión de la persona (cookie), un agente recibe 401.
- `public_pages.py` (H-035 fase 2): `GET /p/{token}` y `HEAD /p/{token}` sin sesión, con limitador de peticiones y cabeceras de seguridad.
- `files.py` (H-015/H-016/H-025): `POST /files` (multipart, campos opcionales `folder` y `visibility` —`private` por defecto o `public`, a elegir al subir—), `GET /files/{id}`
  (un archivo público se sirve **sin credencial**; uno privado exige sesión o key del dueño),
  `PATCH /files/{id}` (nombre, carpeta —H-046: `folder` mueve el archivo; `""` es la raíz— y visibilidad; la visibilidad solo la cambia la persona con su sesión: una API key recibe `403` `file-visibility-user-only`) y `DELETE /files/{id}`. MinIO nunca se expone directo.
- `tasks.py` (H-053): tareas de bóveda en dos niveles. `GET/POST /vaults/{id}/tasks`, `POST …/tasks/{task_id}/subtasks`, `GET/PATCH/DELETE …/tasks/{task_id}` (`ETag` = `version`, `If-Match` opcional en `PATCH`) y `GET /tasks` (todas las bóvedas del dueño). Sesión o API key; los permisos por agente los aplica `TaskService` con `AgentAccessGuard.check_task`. Ver `docs/API.md`.
- `notifications.py` (H-053): bandeja de avisos de la persona (`GET /notifications`, que adjunta a cada aviso la tarea vigente en `task`, `unread-count`, `{id}/read`, `read-all`) y sus preferencias por tipo (`GET/PUT /notifications/preferences`). Solo sesión humana: una API key recibe 401.
- `file_folders.py` (H-046): carpetas de archivos con subniveles bajo `/vaults/{vault_id}/file-folders` —listar, crear (idempotente), `POST /move` (mueve la carpeta con su contenido; si el destino existe, se fusionan) y `DELETE ?path=` (solo vacía, `409 file-folder-not-empty`)—. Las carpetas con archivos se derivan de `files.folder`; las vacías viven en `file_folders`. `GET /vaults/{vault_id}/files` acepta `folder`.
- `folders.py` (H-039): `POST /vaults/{id}/folders/move` mueve una carpeta entera (cambia el `path` de cada nota bajo ella) y reescribe los wikilinks que la apuntaban; respeta las carpetas reservadas y los documentos de sistema (`meta-folder:*`, `sistema:readonly`).
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
