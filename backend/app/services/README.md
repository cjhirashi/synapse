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
- `pdf_service.py` y `note_pdf_service.py` (H-036): PDF de un documento. `NotePdfService` lee la nota y el `estilo.pdf` de su plantilla; `pdf_service` limpia
  el HTML recibido (`nh3`, lista cerrada; el `style` de `div`, `span` e `img` solo con las propiedades y valores de `core/html_style.py`), arma el documento con la hoja de estilos de `core/pdf_style.py` (encabezado y pie como elementos corrientes con `counter(page)`),
  y lo dibuja con WeasyPrint con un `url_fetcher` cerrado (`data:` de imagen, `/files/<id>` de la persona e imágenes públicas de la web vía `external_image.py`, que solo se conecta a IP públicas y reverifica cada redirección). Los SVG animados pasan por `core/svg_freeze.py` y se imprimen en su último fotograma. Como mucho 2 a la vez y 60 s por PDF. Necesita Pango
  y las fuentes de la imagen (Dockerfile); las pruebas que dibujan se corren dentro de la imagen.
  Marcas del documento: `add_index` numera los encabezados y arma el índice donde está `<div class="pdf-indice">`; la portada (`section.pdf-portada`) y el índice son páginas con nombre (`@page portada`/`indice`) con fondo propio, sin encabezado ni pie y sin sumar a `page` (sin imagen propia llevan `background-image: none`: una página con nombre hereda la de `@page`; la imagen del encabezado solo se presta con `imagen_principal`; estilos propios de encabezados y texto solo con `personalizar`, ver `pdf_style._sheet_style_css`); `div.comentario` (comentarios de revisión) se oculta; `_render` maqueta dos veces si hay hojas así para que `{{paginas}}` no las cuente.
- `file_service.py` (`FileService`, H-015/H-016): reglas de archivos. Comprueba que la bóveda sea del
  usuario, el tamaño (5 MB imágenes, 25 MB documentos), el tipo por **firma de bytes** (nunca por el
  `Content-Type` del cliente), sanea SVG y valida el nombre y la carpeta. Opera sobre el repositorio de
  metadatos y el puerto de almacenamiento de objetos; no conoce HTTP.
- `task_service.py` (`TaskService`, H-053): reglas de las tareas de bóveda. Valida la bóveda del dueño, los dos niveles, el agente asignable (registrado y activo), la forma de la ruta indicativa, `If-Match` sobre `version` y los permisos por agente; deriva el estado de una raíz de sus subtareas. Avisa a la persona (`NotificationService`) cuando un agente le asigna una tarea o cambia el estado de una suya. `task_jobs.py`: ciclo de fondo con la retención (elimina las raíces cerradas hace más de `TASKS_RETENTION_DAYS` días, con sus subtareas) y los avisos de vencimiento. `notification_service.py` (`NotificationService`): avisos idempotentes por `dedupe_key`, bandeja, leídos, preferencias por tipo, horas silenciosas y suscripciones push. `agent_profile_service.py` (`AgentProfileService`): nombre visible y foto de cada agente de la persona (tamaño y tipo por contenido, foto en el almacén de objetos). `push_dispatcher.py`: hilo que envía por Web Push los avisos pendientes (`pushed_at` NULL) con un payload mínimo, respeta las horas silenciosas y borra suscripciones que el servicio da por muertas.
- `vault_member_service.py` (`VaultMemberService`, H-064 F2): ciclo de vida de las membresías (invitar —reabre sobre la misma fila una invitación terminada—, cambiar concesiones, cancelar, revocar, aceptar, rechazar y salir). Cada operación se acota por quien actúa (propietario o invitado; si no, `MemberNotFound`), aplica el tope de 50 miembros pendientes o activos por bóveda y no confirma la transacción ni crea avisos.
- `note_content_service.py` y miembros invitados (H-064 F3): con `member=` filtra por las concesiones antes de cualquier otra comprobación. Listados (incluidos papelera y `prefix`) solo con notas legibles, pidiendo páginas hasta juntar `limit + 1` o llegar a `MEMBER_SCAN_CAP` (2,000 documentos examinados) y con el cursor sacado de lo último examinado; una nota no legible responde `NoteNotFound` y una legible sin escritura `ShareForbidden` (403); mover o renombrar y generar PDF no están permitidos a un invitado.
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
- `publication_service.py` (`PublicationService`, H-035): gestión de publicaciones de notas (crear, actualizar, eliminar). Valida que la plantilla tenga publicación habilitada, arma la instantánea (`html` limpio, encabezados numerados, título, metadatos y el estilo del PDF de la plantilla), y mantiene `token` y `published_at` invariables en las republicaciones. H-055: `unpublish_at` opcional al publicar (se conserva al republicar), `set_expiry` para fijarla o quitarla y `list_published` para el listado de la bóveda (`deleted` si el documento ya no existe; un fallo de CouchDB se propaga, no se marca como borrado).
- `publication_jobs.py` (H-055): `expire_publications`, una pasada del trabajo de fondo que borra las publicaciones vencidas y crea el aviso `publication_expired` (un commit por publicación, idempotente por `dedupe_key`); se ejecuta dentro del ciclo de `task_jobs.start_task_jobs`.
- `publication_snapshot.py` (H-035): funciones puras para armar una instantánea de publicación: limpiar HTML, numerar encabezados con índice de contenidos, extraer título y metadatos con color de estado. `style_of` copia al publicar el texto y los encabezados H1 a H4 del `estilo.pdf` de la plantilla (con los valores por omisión del PDF; sin formato de PDF da `{}`). `collect_resources` extrae ids propios y URLs externas.
- `publication_viewer.py` (H-035): visor de imagen a pantalla completa de la página pública, el mismo del editor (botón en cada imagen de al menos 96 x 64 px; zoom con botones, pellizco, rueda, doble toque y teclas `+`, `-`, `0`; arrastre ampliada; Esc, × o tocar el fondo cierran) en JavaScript simple. Es el único script de la página: la CSP lo autoriza por su hash (`VIEWER_JS_HASH`), así que el texto firmado debe insertarse tal cual; cualquier otro script sigue bloqueado.
- `publication_page.py` y `publication_css.py` (H-035 fases 2 y 4): la página pública `/p/<token>`: tarjeta del documento (título, descripción, creación, actualización y estado con su color), índice (en el celular, un botón arriba a la derecha (ícono de barra lateral derecha) que abre el índice como barra lateral desde la derecha con `:target` —sin scripts: elegir un apartado, tocar fuera o el mismo botón lo cierra, sin mover la página— y lateral y fijo desde 960 px), contenido ya limpio y pie con el crédito; todo lo que viene de la instantánea se escapa. La hoja de estilos es una sola en línea (la CSP no permite recursos externos), usa los tokens del diseño, sigue el tema claro u oscuro del sistema y no necesita scripts. `pdf_style_css` añade al contenido el formato del PDF de la plantilla (`publications.style`): tipografía, tamaño y color del texto y de los encabezados H1 a H4 (el color fijo del PDF solo en el esquema claro; las familias con sustitutas de métrica parecida, p. ej. Liberation Sans → Arial) y, si la plantilla tiene tema de color, el tema completo en negritas, cursivas, enlaces, código, viñetas y números, citas y tablas, con las fórmulas del PDF en claro y las del editor en oscuro (`color-mix` sobre el texto y el fondo de la página). Una publicación sin estilo guardado (anterior a este cambio o con plantilla sin PDF) conserva el estándar hasta republicarla. `publication_snapshot.embed_frames` convierte los enlaces `pub-embed` que manda el cliente en `iframe` con sandbox solo para una lista cerrada de orígenes (archivos de esta Synapse y YouTube sin cookies; `embed_kind` valida la cadena completa) y la CSP de la página los limita con `frame-src`.

- `admin_user_service.py` (`AdminUserService`, H-060): alta con contraseña base y límites, cambio de límites, baja con gracia (inactiva, sesiones cerradas), recuperación y roles; el super admin gestiona a cualquiera, el admin solo a invitados; nadie se elimina a sí mismo ni deja al sistema sin super admin. `limit_usage.py` (uso de una cuenta: bóvedas, documentos y bytes; alimenta la guardia, el reajuste y la vista de uso del administrador, `AdminUserService.usage`), `limit_guard.py` (`LimitGuard`: límites de bóvedas, documentos y archivos al crear; `guard_for` lo resuelve por usuario) y `limit_reconcile_service.py` (plazo de 30 días al bajar un límite y recorte de lo más viejo al vencer). `user_purge_service.py` (borrado definitivo de una cuenta en Postgres, CouchDB y MinIO; H-064: también sus invitaciones, membresías y concesiones) y `user_jobs.py` (una pasada de ambos trabajos, dentro del ciclo de `task_jobs`).
