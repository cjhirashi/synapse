# backend/

FastAPI — monolito modular por capas con puertos (ADR-001).

## Regla de oro

`services/` solo importa de `core/ports/`. Nunca de `adapters/` directamente.
`adapters/factory.py` selecciona la implementación concreta.
`routers/` son adaptadores primarios — reciben requests y delegan a `services/`.

## Estructura

```
backend/
├── app/
│   ├── core/         # config, seguridad (Argon2id), dependencias, esquemas, modelos, errores, reglas de nota, marcas de tiempo
│   │   └── ports/    # Interfaces abstractas (Protocols de Python)
│   ├── services/     # Lógica de negocio (auth_service.py, vault_service.py, note_service.py, reservations.py, sync_*.py)
│   ├── adapters/     # Implementaciones concretas (PostgreSQL, CouchDB: vault_repository.py)
│   ├── routers/      # Endpoints FastAPI (auth.py, admin.py, vaults.py, sync.py)
│   ├── bootstrap.py  # Siembra del admin al arrancar
│   ├── spa.py        # Sirve la SPA (SPEC-0007): estáticos del build + fallback de React Router
│   └── main.py
├── alembic/          # Migraciones PostgreSQL
├── scripts/          # export_openapi.py
├── tests/
├── Dockerfile        # Multi-stage: compila la SPA (Node) y la copia a la imagen (contexto = raíz)
└── requirements.txt
```

## Entorno

Toda la configuración sensible viene del entorno; **no hay valores por defecto** y el
backend no arranca si falta alguna (ver `.env.example` en la raíz):

| Variable | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL (control plane) |
| `COUCHDB_URL`, `COUCHDB_USER`, `COUCHDB_PASSWORD` | CouchDB (una base por usuario) |
| `JWT_SECRET` | Firma HS256 de los JWT |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin sembrado al arrancar |

## Sirve la SPA (SPEC-0007)

El backend sirve también el frontend: ya no hay contenedor `frontend`/nginx. `app/spa.py`
monta el build de `frontend/dist` y replica la tabla de rutas del nginx retirado —todo en el
**mismo origen** y puerto (8000), así las cookies y la réplica siguen funcionando:

| Ruta | Comportamiento |
|---|---|
| `/assets/*` y archivos del build | `StaticFiles`: directo; inexistente → **404 real** |
| `/vaults`, `/vaults/*` con `Accept: text/html` (`GET`/`HEAD`) | navegación → `index.html` (la SPA) |
| `/vaults`, `/vaults/*` sin `text/html` (un `fetch`) | handler de API real (SPEC-0003) |
| ruta sin extensión, sin archivo ni API | `index.html` (React Router: `try_files $uri /index.html`) |
| subruta desconocida bajo `/auth`,`/admin`,`/sync`,`/vaults`,`/health` | **404 Problem** (SPEC-0004), nunca HTML |

El `Dockerfile` (multi-stage, contexto = raíz del repo) compila la SPA con Node y la copia a
`/app/static`; `FRONTEND_DIST` apunta ahí. En dev sin build la app arranca como API pura
(RF-006) y la SPA la sirve Vite en el host.

## Despliegue: proxy inverso externo

El repo no trae proxy inverso (sin nginx, enmienda del GATE 3 de SPEC-0005). En producción lo
pone el **Caddy externo**, que reenvía al backend (8000) —ahora **la SPA la sirve el propio
backend**, el Caddy ya no la monta—. API y SPA van en el **mismo origen**: las cookies de
sesión (`HttpOnly`, `SameSite`) y la réplica PouchDB (`origin + "/sync/db"`,
`credentials: "include"`) no funcionan entre orígenes distintos.

Requisitos del canal de sincronización `/sync` (SPEC-0005 RF-001, RF-010):

| Requisito | Motivo |
|---|---|
| `/sync` y `/sync/*` van al backend, en el mismo origen que la SPA | La ruta comodín del backend responde 404 a todo lo que no es el subconjunto del canal; `/sync` no es ruta de la SPA. |
| Sin búfer de respuesta (`flush_interval -1`) | `_changes` responde en streaming; con búfer, los cambios y los latidos no llegan hasta cerrar la respuesta. |
| Ningún tiempo límite de respuesta menor de 90 s (`timeouts` del servidor y `read_timeout`/`response_header_timeout` del transporte) | Un `longpoll` de `_changes` puede retener la conexión hasta 60 s (`MAX_WAIT_MS` en `services/sync_filter.py`); el margen cubre la latencia. |

Ejemplo orientativo (el dominio y la dirección del backend son del despliegue):

```caddyfile
synapse.example.com {
	@sync path /sync /sync/*
	handle @sync {
		reverse_proxy backend:8000 {
			# Streaming de `_changes`: sin búfer.
			flush_interval -1
		}
	}
	# … todo lo demás (API `/auth`,`/admin`,`/vaults` y la SPA) lo sirve el backend.
	reverse_proxy backend:8000
}
```

Caddy no impone tiempo límite de respuesta por defecto; si el despliegue define `timeouts`
o un `transport http` con `read_timeout`, deben ser de 90 s o más.

## Autenticación (SPEC-0002)

- **Bootstrap:** al arrancar, si no existe el admin se crea con `ADMIN_EMAIL`/`ADMIN_PASSWORD`
  y su base CouchDB `synapse_user_{id}`. Es idempotente y seguro con varias réplicas.
- **Cambio forzado:** el admin sembrado y los guests creados por el admin quedan con
  `must_change_password=true`; mientras tanto sólo responden `/auth/me`,
  `/auth/change-password`, `/auth/logout` y `/auth/refresh` (el resto, 403).
- **Emails:** se guardan y comparan normalizados (sin espacios, en minúsculas; índice único
  sobre `lower(email)`, migración 003). `POST /admin/users` valida el formato (422).
- **Login:** mismo 401 y mismo coste (verificación Argon2id contra un hash ficticio) exista o
  no el usuario, para no permitir enumerar emails.
- **Sesión:** JWT de 24 h en cookie httpOnly `access_token` (sólo cookie, nunca
  `Authorization`) y refresh token de 30 días en cookie `refresh_token`, guardado hasheado.
  El JWT lleva `ver` (= `users.token_version`): cambiar la contraseña la incrementa e invalida
  al instante los access tokens anteriores de todas las sesiones (la actual recibe cookies nuevas).
  Cada `/auth/refresh` **rota** el refresh token de forma atómica (`UPDATE` condicional: con dos
  peticiones simultáneas sólo una gana); reutilizar uno ya rotado, o perder esa carrera, revoca
  todos los del usuario (posible robo). Los JWT emitidos antes de la migración 004 (sin `ver`) dejan de valer.

| Endpoint | Respuesta |
|---|---|
| `POST /auth/login` `{email,password}` | 200 + cookies · 401 |
| `POST /auth/refresh` | 200 + nuevos `access_token` y `refresh_token` (rotación) · 401 |
| `POST /auth/logout` | 204, limpia cookies y revoca el refresh token |
| `GET /auth/me` | 200 `{user_id,role,must_change_password}` · 401 |
| `POST /auth/change-password` `{current_password,new_password}` | 204 + cookies nuevas · 400 · 422 |
| `POST /admin/users` `{email,password}` (admin) | 201 `{id,email,role}` · 403 · 409 · 422 · 503 |

Contrato completo: `.harness/specs/0002-auth/contracts/openapi.yaml`.

## Bóvedas (SPEC-0003)

Cada bóveda es un documento `type: "vault"` en la base CouchDB del usuario
(`synapse_user_{sub}`, creada en el alta — SPEC-0002). Capas: `routers/vaults.py` →
`services/vault_service.py` → `core/ports/vault_port.py` (`VaultPort`) →
`adapters/vault_repository.py` (`VaultRepository`, HTTP de CouchDB).

- **Aislamiento:** la base sale sólo del token; ningún dato de la petición la elige. Una
  bóveda ajena, inexistente, en el estado equivocado (borrada para `GET`/`PATCH`/`DELETE`,
  activa para `restore`) o con id que no es un UUID canónico (minúsculas con guiones; no
  valen mayúsculas, sin guiones, `{…}` ni `urn:uuid:`) responde el **mismo 404**
  `vault-not-found`: nunca 403, para no revelar que existe.
- **Sesión:** las 6 rutas exigen sesión (401) y el cambio de contraseña hecho (403).
- **Versión (`ETag`/`If-Match`):** el `ETag` es el `_rev` entre comillas. Va en la cabecera
  de las respuestas con una bóveda; en los listados cada elemento lleva su `etag` (la
  papelera lo necesita para restaurar, porque `GET` de una borrada da 404). `PATCH`,
  `DELETE` y `restore` exigen `If-Match`: sin él 428 `precondition-required`; distinto del
  vigente 412 `precondition-failed` (otra escritura ganó: relee y repite).
- **Nombre único entre las bóvedas activas del usuario:** dos nombres son el mismo si
  coinciden tras NFKC + `casefold` (`name_key`: mayúsculas, ß/SS, NFC/NFD, ligaduras); el
  nombre se guarda tal como llega y no admite caracteres de control (422). Una borrada
  libera su nombre y `restore` lo vuelve a reclamar. Documento de reserva
  `vault-name:{name_key}` escrito antes que la bóveda (siempre se reescribe, también si ya
  era suya, para que una liberación tardía no la borre), con un arrendamiento de 30 s
  (`RESERVATION_LEASE`) para que una escritura que falla a medias no bloquee el nombre
  para siempre. Conflicto → 409 `vault-name-taken`.
- **Ícono (`icon`, SPEC-0009):** texto opcional `glifo[:color]` (p. ej. `folder-heart`,
  `book-open:success`, `initials:warning`): minúsculas, dígitos y guiones internos, un solo `:`,
  de 1 a 64 caracteres (`VaultIcon` en `core/schemas.py`; JSON Schema en
  `.harness/specs/0009-rediseno-visual-workspace/contracts/vault-icon.schema.json`). El servidor
  **sólo valida la gramática**: no conoce el catálogo de glifos ni la paleta (los resuelve el
  cliente; un valor que no conoce se ve como iniciales/color derivado). No normaliza: un espacio
  o una mayúscula es 422, con `pointer` `#/icon` y sin repetir el valor. En `POST` ausente o
  `null` = sin ícono; en `PATCH` **ausente conserva** el valor y **`null` explícito lo borra**
  (como `description`). `GET`/listados lo devuelven siempre (`null` si no hay: las bóvedas
  anteriores no tienen la clave).
- **Papelera:** `DELETE` marca `deleted_at` (borrado lógico); `GET /vaults?deleted=true` lista
  las borradas y `restore` las devuelve. La purga a 30 días (RF-016) es otra feature.
- **Paginación:** orden `created_at` descendente (empate por id); `next_cursor` opaco, válido
  sólo tal como lo emitió el servidor y para la lista (normal o papelera) que lo emitió:
  cualquier alteración, o un texto más largo que un cursor emitido, es 422. El índice (`_design/vaults`, vista
  `by_created`) se crea en la primera consulta de cada base, no al crear la bóveda.

| Endpoint | Respuesta |
|---|---|
| `GET /vaults?limit=1..200&cursor=&deleted=false` | 200 `{items:[Bóveda + etag], next_cursor}` · 422 |
| `POST /vaults` `{name,description?,tags?,icon?}` | 201 + `ETag` · 409 · 422 |
| `GET /vaults/{id}` | 200 + `ETag` · 404 |
| `PATCH /vaults/{id}` + `If-Match` (sólo los campos enviados) | 200 + `ETag` · 404 · 409 · 412 · 428 · 422 |
| `DELETE /vaults/{id}` + `If-Match` | 204 · 404 · 412 · 428 |
| `POST /vaults/{id}/restore` + `If-Match` | 200 + `ETag` · 404 · 409 · 412 · 428 |

Todas pueden responder además 401, 403 y 503 (`storage-unavailable`). Contrato completo:
`.harness/specs/0003-vault-crud/contracts/openapi.yaml`. Rendimiento (RNF-001):
`tests/test_vaults_perf.py`, marca `perf` (ver Comandos).

## Sincronización (SPEC-0005)

La SPA replica la base del usuario con PouchDB por el canal `/sync`, un subconjunto del
protocolo de replicación de CouchDB servido por el backend (nunca CouchDB directo). Capas:
`routers/sync.py` → `services/sync_filter.py` (filtros puros) y `services/sync_push.py`
(push validado) → `core/ports/replication_port.py` (`ReplicationPort`, async) →
`adapters/replication_repository.py` (`ReplicationRepository`, httpx contra CouchDB).

- **Aislamiento (RF-001):** el cliente abre `origin + "/sync/db"`; `db` es un nombre fijo y
  la base real (`synapse_user_{sub}`) sale sólo del token. Toda ruta exige sesión (401) y el
  cambio de contraseña hecho (403), también la comodín.
- **Lista blanca (RF-003):** sólo existen las rutas de la tabla; cualquier otra ruta o
  método bajo `/sync` responde 404 `sync-endpoint-not-found` sin llegar a CouchDB.
- **Bóvedas y notas (RF-004, RF-007; SPEC-0008 RF-006):** viajan los documentos
  `vault:{uuid}` y `note:{vault_uuid}:{uuid}` (ambos UUID canónicos). Las reservas
  `vault-name:*` y **`note-path:*` son sólo del servidor**: ni `_changes`, ni `_all_docs`
  (un rango por prefijo, `note:` y `vault:`), ni `_bulk_get` las devuelven, y `_design/vaults`
  tampoco. Ninguna respuesta cuenta documentos.
  **Regla de ruta (SPEC-0010 RF-007):** el último segmento de `path` no puede ser `.md` (sin distinguir
  mayúsculas): `X/.md` y `.md` se rechazan con `validation-error:path`; `X/a.md` y `.md/a.md` valen. Es el
  mismo `check_path` de `core/note_rules.py` (también en el cliente y en `note.schema.json`). Los parámetros fuera de la lista blanca se descartan; uno conocido con valor
  inválido es 422 `validation-error`. Las esperas de `_changes` se acotan a 60 s
  (`MAX_WAIT_MS`).
- **Push validado (RF-005…RF-008, RF-011):** `_bulk_docs` exige `new_edits: false` y
  responde 201 con la lista de rechazos (`[]` si se aceptó todo). Cada revisión rechazada
  va como `{id, rev, error: "forbidden", reason}`; PouchDB la trata como *denied*: avisa al
  cliente y sigue con el resto. Una revisión ya almacenada se acepta sin tocar nada (reenvío
  de un lote cortado). El nombre se reserva con el mismo mecanismo que la API REST, así que
  REST y sync nunca dejan dos bóvedas activas con el mismo nombre.
- **Clave opcional `icon` en `vault:*` (SPEC-0009 RF-012):** la lista blanca de claves de una bóveda
  admite `icon`, pero no es obligatoria (los documentos anteriores no la tienen). Si está, vale
  `null` o una cadena que ya cumpla la gramática de `VaultIcon` (el push no normaliza); si no,
  `validation-error:icon`. Una nota con clave `icon` también es `validation-error:icon` (clave
  no admitida). Sin catálogo ni paleta en el servidor.
- **Límites:** 200 documentos por `_bulk_docs`; cuerpo de **16 MiB** en `_bulk_docs` (una
  nota de 2 MiB con caracteres de control escapados pesa ~12 MiB en JSON; el cliente nunca
  manda más de 8 MiB por petición, ver `frontend/src/README.md`), **64 KiB** por checkpoint
  `_local` y **4 MiB** en el resto de rutas (413 `payload-too-large`). Dentro de una nota:
  `content` ≤ **2 MiB** (bytes UTF-8) y `frontmatter` ≤ 64 KiB (JSON compacto).
- **Orden de las comprobaciones de un cuerpo:** primero la sesión (401/403 sin leer el cuerpo),
  después el tamaño (413) y por último el JSON: inválido, anidado en exceso o con enteros
  gigantes es 422 `validation-error`.
- **Reserva de ruta de nota (H-1, PLAN-0008 §17):** el id es `note-path:{vault_id}:{sha256(path_key)}`
  (hex): determinista y de longitud fija, porque `NFKC` expande una ruta hasta ×18 y una clave
  larga como id superaba el límite de CouchDB (400 → 503 de todo el lote en cada reintento). El
  documento guarda la `path_key` para diagnóstico. No hay datos previos de `note-path:*`, así
  que no hay migración. (`vault-name:{name_key}` tiene el mismo riesgo y queda en el backlog
  de 0003: cambiarlo exige migrar las reservas existentes.)
- **Generación de `_rev` (H-2):** acotada a 16 dígitos en el patrón de `_rev`; una generación
  mayor se rechaza como `_rev` mal formado, nunca un 500 por desbordar la conversión a entero.
- **Checkpoints `_local` (RF-003):** el id sigue el formato de PouchDB
  (`[A-Za-z0-9._=-]{1,128}`, nunca `.` ni `..`); otro id es 404 `sync-endpoint-not-found`
  sin llegar a CouchDB. El cuerpo sólo admite como campos reservados `_id` (igual a
  `_local/{id}`) y `_rev` (`0-N`); lo demás es 422 `validation-error`.
- **Revisiones:** `_rev` y los ids de `_revisions` son `{generación}-{hash}` con hash
  hexadecimal en minúscula, como los generan CouchDB, PouchDB y el cliente; otro formato es
  el rechazo `validation-error:_rev` (o `validation-error:_revisions`), nunca un 503.

Códigos `reason` de un rechazo (orden en que se comprueban):

| `reason` | Cuándo |
|---|---|
| `invalid-id` | id que no es `vault:{uuid}` ni `note:{uuid}:{uuid}` canónico |
| `delete-not-allowed` | lápida que no cierra una rama dejando otra hoja viva (el borrado es `deleted_at`) |
| `validation-error:<campo>` | `_rev`/`_revisions` mal formados (antes que la lápida), o un campo que falta, sobra o tiene un tipo o valor inválido (también `path`, `content`, `frontmatter` y `vault_id` de una nota) |
| `not-normalized:<campo>` | valor válido pero sin normalizar como lo haría la API (en una nota, `path`) |
| `owner-mismatch` | `owner_id` distinto del usuario del token |
| `immutable-field:created_at` | `created_at` distinto del de las demás hojas |
| `vault-not-found` | (nota, también su lápida) su bóveda no existe, es de otro usuario o está en la papelera; la bóveda del mismo lote cuenta, y por eso las bóvedas se procesan antes que las notas |
| `vault-name-taken` | otra bóveda activa del usuario tiene un nombre equivalente |
| `note-path-taken` | otra nota activa de la misma bóveda usa una ruta equivalente (`NFKC` + `casefold`) |

| Endpoint | Respuesta |
|---|---|
| `GET /sync/` | 200 raíz, sin `uuid` ni versión |
| `GET /sync/db/` | 200 `db_name`, `update_seq`, `instance_start_time` · 503 |
| `GET`/`POST /sync/db/_changes` | 200 en streaming (`normal` o `longpoll`), sólo bóvedas · 422 · 503 |
| `POST /sync/db/_revs_diff` | 200 · 422 · 503 |
| `POST /sync/db/_bulk_get` | 200 · 422 · 503 |
| `GET`/`POST /sync/db/_all_docs` | 200 sólo bóvedas, `total_rows` sólo las cuenta · 422 · 503 |
| `POST /sync/db/_bulk_docs` `{docs, new_edits: false}` | 201 lista de rechazos · 413 · 422 · 503 |
| `GET /sync/db/_local/{id}` | 200 · 404 `checkpoint-not-found` · 503 |
| `PUT /sync/db/_local/{id}` | 201 `{ok, id, rev}` · 413 · 422 · 503 |

Todas pueden responder además 401 y 403. Requisitos del proxy inverso: ver "Despliegue".
Contrato completo: `.harness/specs/0005-sync/contracts/openapi.yaml`.

## Notas (SPEC-0008)

Una nota es un documento `type: "note"` con id `note:{vault_id}:{uuid}` en la base del
usuario. **No tiene API REST**: la SPA la escribe en su réplica local y llega por el push
validado de `/sync` (los agentes de IA tendrán la suya en otra feature). El backend sólo
decide qué se acepta:

- **Forma cerrada** (`.harness/specs/0008-vault-editor/contracts/note.schema.json`):
  `_id`, `_rev`, `_revisions`, `type`, `vault_id`, `path`, `content`, `created_at`,
  `updated_at`, `deleted_at` y `frontmatter` (única opcional); otra clave o un tipo erróneo
  es `validation-error:<campo>`. `test_note_contract.py` compara el esquema con el código.
- **Reglas puras** en `core/note_rules.py` (las espeja `frontend/src/notes/noteRules.ts` y
  ambos lados recorren `tests/fixtures/note_rules_cases.json`): `path` de 1 a 300 puntos de
  código, sin caracteres de control ni segmentos vacíos y ya normalizado (el servidor nunca
  normaliza: rechaza `not-normalized:path`); `content` ≤ 2 MiB; `frontmatter` ≤ 64 KiB.
- **Bóveda activa:** `vault_id` debe ser igual al primer UUID del id y apuntar a una bóveda
  propia activa (`vault-not-found`); aplica también al borrado lógico de la nota.
- **Ruta única por bóveda:** reserva `note-path:{vault_id}:{sha256(path_key)}` (`path_key` = NFKC +
  `casefold`) con el algoritmo de `vault-name:*` extraído a `services/reservations.py`;
  decide `services/note_service.py`. Una hoja en la papelera (`deleted_at`) libera su ruta
  y restaurarla la vuelve a reservar. Conflicto → rechazo `note-path-taken`.
- **Limitación aceptada (B-1):** si la bóveda se borra por REST entre la comprobación de bóveda
  activa del push y la escritura `_bulk_docs`, la nota se guarda igual: CouchDB no tiene
  transacciones entre documentos. El efecto coincide con RF-014: mientras la bóveda esté
  borrada la nota queda congelada (todo push posterior recibe `vault-not-found`) y la app no
  la muestra, aunque sigue replicándose al cliente; reaparece al restaurar la bóveda. No hay
  fuga entre usuarios.
- **Borrado:** `deleted_at` (papelera de la bóveda), nunca lápida de CouchDB; una lápida sólo
  cierra una rama de conflicto (`delete-not-allowed` en otro caso).
- **Marcas de tiempo:** `core/timestamps.py` es el único formato RFC 3339 UTC de ancho fijo
  (bóvedas, notas y reservas).

## Errores (SPEC-0004)

> **Cambio incompatible:** desde SPEC-0004 los errores ya no son `{"detail": "..."}`.
> Todo cliente debe leer el cuerpo Problem Details descrito abajo.

Toda respuesta 4xx/5xx es `application/problem+json` (RFC 9457):

```json
{
  "type": "urn:synapse:problem:validation-error",
  "title": "Validation error",
  "status": 422,
  "detail": "Request validation failed.",
  "instance": "/auth/change-password",
  "errors": [{"pointer": "#/new_password", "detail": "Password must be at least 10 characters long"}]
}
```

- `type` identifica el error y es lo que deben comparar los clientes: `urn:synapse:problem:<slug>`
  para los del catálogo, `about:blank` para los genéricos (404, 405, 500…), cuyo `title` es la
  frase HTTP. `title` y `detail` van en inglés; la UI traduce a partir de `type`. Excepción: con
  la SPA montada (ver "Sirve la SPA (SPEC-0007)"), los 404 que ésta reclasifica —archivo con
  extensión inexistente, subruta de API desconocida y el 405 reclasificado a método no-GET en
  ruta desconocida— llevan `type: urn:synapse:problem:spa-resource-not-found`, no `about:blank`.
- `instance` es la ruta pedida, sin query. `detail` y `errors` pueden faltar, nunca valen `null`.
- `errors` (sólo en 422) lleva un fallo por entrada con **una** ubicación: `pointer`
  (JSON Pointer al cuerpo; `#` si el JSON es inválido o falta), `parameter` (query/path) o
  `header`. Nunca se repite el valor enviado por el cliente, ni siquiera dentro del `detail`
  de una entrada: los mensajes de pydantic se regeneran sólo con los límites del esquema
  (p. ej. `String should have at most 5 characters`; en colecciones también el número de
  elementos, nunca los elementos) y, si dependen de otra cosa, valen `Invalid value.`.
- Un error no controlado es un 500 genérico; la traza va al log (`app.core.problems`), nunca
  a la respuesta. Si el propio traductor falla, responde un 500 de campos fijos más `instance`.
- Las operaciones declaran en el contrato los códigos de sus errores de dominio, el 422 y el
  500. Los errores de enrutado (404 de ruta inexistente, 405) no se declaran por operación,
  pero también salen como Problem Details.

**Catálogo** — vive en `app/core/errors.py` (cada clase es una entrada):

| `type` (slug) | Código | Cuándo |
|---|---|---|
| `not-authenticated` | 401 | falta la cookie `access_token` |
| `invalid-token` | 401 | JWT inválido, caducado, de versión anterior o de usuario inactivo |
| `invalid-credentials` | 401 | login fallido (mismo cuerpo exista o no el email) |
| `invalid-refresh-token` | 401 | refresh ausente, inválido, revocado o reutilizado |
| `admin-required` | 403 | ruta de admin sin rol admin |
| `password-change-required` | 403 | cambio de contraseña obligatorio pendiente |
| `wrong-current-password` | 400 | `change-password` con la contraseña actual errónea |
| `email-taken` | 409 | `POST /admin/users` con un email ya registrado |
| `vault-not-found` | 404 | bóveda inexistente, ajena, borrada o con id no canónico (mismo cuerpo) |
| `vault-name-taken` | 409 | ya hay otra bóveda activa del usuario con un nombre equivalente |
| `precondition-failed` | 412 | `If-Match` distinto del `ETag` vigente de la bóveda |
| `precondition-required` | 428 | escritura de bóveda sin `If-Match` |
| `validation-error` | 422 | cuerpo, query, path o cabecera inválidos; política de contraseña; `cursor` inválido |
| `storage-unavailable` | 503 | CouchDB inaccesible |
| `sync-endpoint-not-found` | 404 | ruta o método bajo `/sync` fuera del subconjunto del canal |
| `checkpoint-not-found` | 404 | `GET /sync/db/_local/{id}` sin checkpoint guardado |
| `payload-too-large` | 413 | cuerpo del canal o lote de `_bulk_docs` sobre el límite (16 MiB en `_bulk_docs`) |

**Añadir un error de dominio:**
1. Declara una subclase de `DomainError` en `core/errors.py` con `slug`, `title`, `status` y
   `detail` (inglés). `tests/test_problem_catalog.py` exige `type` único y bien formado.
2. Lánzala desde el servicio o la dependencia. El texto de la excepción es interno: se
   registra en `app.core.problems` (5xx en ERROR con traza y causa encadenada, 4xx en INFO)
   y nunca llega al cliente; para otro `detail` público pasa `detail=`. Nunca `HTTPException` fuera de
   `core/problems.py` (lo comprueba un test).
3. Declárala en la ruta con `responses=problem_responses(MiError)` para que salga en el contrato.
   En toda la suite, `ContractGuard` (`tests/contract_guard.py`, instalado en `conftest.py`)
   tumba cualquier petición cuyo código de error no esté declarado en la operación que la
   atendió (la ruta que eligió el router, aunque otra plantilla también case la ruta). Si
   falla, el log muestra además un «Unhandled error» con 500: es efecto de esa infracción.

**Mensajes de validadores propios:** un validador de pydantic que quiera un texto concreto en
`errors[].detail` declara su código y su texto (inglés, sin `{}`) en `FIELD_ERROR_MESSAGES`
de `core/errors.py` (código que no sea un tipo de pydantic) y lanza `field_error("<código>")`
(ver el del email en `core/schemas.py`).
El traductor publica el texto del catálogo por el código, nunca el mensaje lanzado; un
`ValueError` o un código no catalogado salen como `Invalid value.`. En `app/` sólo
`core/errors.py` y `core/problems.py` pueden importar `pydantic_core` o construir errores de
validación (`ValidationError`, `RequestValidationError`, `InitErrorDetails`,
`from_exception_data`, también con alias o heredando). Capturarlos (`except`) sí se puede.
Lo comprueba `tests/test_problem_catalog.py` por análisis estático, que sólo reconoce
llamadas y herencias escritas con el nombre de la clase (o su alias) o como atributo;
cualquier otra referencia (variable, parámetro, `functools.partial`, `getattr`, `type()`,
tablas) se le escapa. Es un residual aceptado, no una vía: no lo rodees.
En lugar de un `RequestValidationError` a mano:
- **Entre campos del cuerpo:** `field_error` o `ValueError` desde un `model_validator`; el
  fallo sale en la raíz (`"pointer": "#"`).
- **Entre fuentes** (path, query y cuerpo): una subclase de `ValidationFailed` (sin `slug`
  propio) con `errors=` y la ubicación de cada fallo, como `PasswordPolicyViolation` en
  `services/auth_service.py`. Cada `detail` es texto fijo, nunca interpolado con datos del
  cliente: el traductor lo publica tal cual.

Todo 422 de dominio hereda de `ValidationFailed` y comparte su `type` `validation-error`
y su `detail` raíz fijo (RF-005); un test lo exige. Tampoco pases `detail=` al lanzarlo:
lo variable va en `errors`.

## Contratos OpenAPI por feature

`python scripts/export_openapi.py` escribe un contrato por feature (`FEATURES` en el script):
`0002-auth` (rutas `/auth`, `/admin`, `/health`), `0003-vault-crud` (rutas `/vaults`),
`0005-sync` (rutas `/sync`, sin la comodín; también describe los rechazos de nota de
SPEC-0008, cuyo esquema vive en `0008-vault-editor/contracts/note.schema.json`) y
`0004-api-problem-details` (sólo los
esquemas `Problem`/`ProblemError`, el canon). Cada contrato lleva una copia de `Problem` para
ser autocontenido; `tests/test_contract.py` falla si un contrato difiere de la app, si una
ruta no tiene exactamente una feature dueña o si una copia de `Problem` difiere del canon.
Si cambias la API, re-exporta.

## Comandos

```bash
# Tests (requieren un CouchDB real; el control plane usa SQLite — excepción declarada en plan.md §7)
docker compose exec backend pytest -v

# Tests de rendimiento (marca `perf`, fuera de la corrida por defecto): RNF-001 de 0003
docker compose exec backend pytest -m perf -s

# Tests con umbral de cobertura (80 %, en .coveragerc)
docker compose exec backend pytest --cov=app

# Migraciones
docker compose exec backend alembic upgrade head

# Exportar los contratos OpenAPI (uno por feature)
python scripts/export_openapi.py
```
