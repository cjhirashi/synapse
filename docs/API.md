# API de Synapse — guía para consumidores

> Documentación orientada a **quien consume** la API (humanos y agentes). El contrato máquina
> (OpenAPI) vive repartido por feature en `.harness/specs/<feature>/contracts/openapi.yaml`;
> esta guía resume lo que un cliente necesita saber para usarla.

Todos los errores son **Problem Details** (RFC 9457, `application/problem+json`): compara el
campo `type` (`urn:synapse:problem:<slug>`), no el texto. Detalle en `backend/README.md`
(sección «Errores»).

## Autenticación

Synapse tiene **dos vías** de autenticación, ambas resuelven al **mismo** usuario y al mismo
alcance de datos (su base `synapse_user_{id}`):

| Vía | Credencial | Para quién | Superficie |
|---|---|---|---|
| Cookie de sesión | JWT `access_token` (24 h), login web | navegador / humano | toda la API |
| **API key de agente** | `Authorization: Bearer syn_ak_…` | agentes OpenClaw (no interactivos) | **sólo datos**: `/vaults`, `/vaults/{id}/notes`, `/sync` |

La API key **no** es un segundo usuario: autentica *como el mismo usuario* que la creó (mismo
`owner_id`, misma base). Nunca da acceso a los datos de otro usuario (aislamiento por usuario).

## Cuentas y límites (H-060)

Solo con sesión de un admin o super admin (cookie). El admin gestiona invitados; el super admin, a cualquiera.

| Método | Ruta | Resultado |
|---|---|---|
| `GET` | `/admin/users` | `200` lista `[{id,email,role,display_name,must_change_password,created_at,deleted_at,purge_at,limits{max_vaults,max_notes_per_vault,max_storage_bytes_per_vault},vaults_used,grace[{kind,vault_id,deadline_at}]}]` · `403` |
| `POST` | `/admin/users` | `{email, role?: "guest"\|"admin", max_vaults?, max_notes_per_vault?, max_storage_bytes_per_vault?}` → `201` cuenta nueva con la contraseña `admin1234` y cambio obligatorio. Sin `password` (`422` si se envía). Límite omitido = 2 bóvedas, 100 documentos por bóveda, 500 MB por bóveda; `null` = sin límite. `role: "admin"` solo el super admin (`403 user-action-forbidden`) · `409 email-taken` |
| `GET` | `/admin/users/{id}/usage` | `200` `{vaults:[{alias,documents,storage_bytes}], documents_total, storage_bytes_total}`: uso por bóveda y total; cada bóveda va con un alias por orden de creación («Bóveda 1» es la más vieja) porque su nombre y su id son privados de la persona (documentos = notas vivas sin índices ni documentos de sistema; bytes = archivos subidos). Lo ven admin y super admin; el listado ya trae `vaults_used` y `storage_bytes` · `403` · `404` |
| `PATCH` | `/admin/users/{id}/limits` | solo cambia lo enviado → `200`; si la cuenta queda por encima de un límite abre `grace` (30 días) y le avisa · `404` · `409` |
| `DELETE` | `/admin/users/{id}` | `200`; baja con gracia de 30 días (inactiva, sesiones cerradas, correo reservado) · `403 user-action-forbidden` (uno mismo, otro admin sin ser super admin, último super admin) · `404` · `409 user-state-conflict` |
| `POST` | `/admin/users/{id}/restore` | `200`; recupera una cuenta dada de baja · `404` · `409` |
| `PATCH` | `/admin/users/{id}/role` | `{role: "guest"\|"admin"}` solo super admin → `200`, la persona debe entrar de nuevo · `403 super-admin-required` · `404` · `409` |

Los límites rigen en la API y en la sincronización: `403 vault-limit-reached` (bóvedas), `403 document-limit-reached` (notas) y `403 storage-limit-reached` (archivos). No cuentan `INDICE.md`, las carpetas reservadas ni los documentos de sistema. Una API key comparte la cuota de su dueño.

## Perfil de usuario (H-028)

Cada usuario tiene un **nombre visible** (`display_name`) y una **foto de perfil** (avatar).
Son sólo del propio usuario: **nadie** ve ni edita el perfil de otro, y una **API key de agente
no puede editar el perfil** (ni subir, borrar o leer la foto): estas rutas son sólo cookie.
Si una key llama a cualquiera de ellas responde `401 not-authenticated`.

Las rutas no reciben ningún identificador de usuario: el dueño se toma de la sesión, así que
`?user_id=<otro>` no tiene efecto.

| Método | Ruta | Cuerpo / entrada | Respuesta |
|---|---|---|---|
| `GET` | `/auth/me` | — | perfil (ver abajo) |
| `PATCH` | `/auth/me` | JSON `{"display_name": "…"}` | perfil actualizado |
| `PUT` | `/auth/me/photo` | `multipart/form-data`, campo `file` | perfil actualizado |
| `DELETE` | `/auth/me/photo` | — | perfil actualizado (`photo_url: null`) |
| `GET` | `/auth/me/photo` | — | los bytes de la foto, con su `Content-Type` |

Forma del perfil (`GET`, `PATCH`, `PUT` y `DELETE` devuelven la misma):

```json
{
  "user_id": "…",
  "email": "…",
  "role": "admin",
  "must_change_password": false,
  "display_name": "Ana",
  "photo_url": "/auth/me/photo?v=2"
}
```

- `photo_url` es `null` si no hay foto. Si la hay, lleva la **versión** (`v=N`): cada subida
  incrementa `N`, así que el navegador no sirve la foto anterior de caché.
- `GET /auth/me/photo` responde con `Cache-Control: private, no-cache`: es privada del usuario.

### Validaciones

- **`display_name`**: se recortan los espacios de los extremos; si queda vacío, se guarda `null`.
  Máximo **80** caracteres *tras* recortar. Más de 80 → `422 validation-error`. Campos extra → `422`.
- **Foto**: el tipo se decide por el **contenido** (firma de bytes), nunca por el nombre del
  archivo ni por el `Content-Type` que envía el cliente. Admitidos: **PNG, JPEG, WebP**.
  Un texto renombrado a `.png` se rechaza. GIF y SVG se admiten como archivos en `/files`, pero
  **no** como foto de perfil.
- **Tamaño**: máximo **2 MB** (2 097 152 bytes), límite inclusivo.

### Errores

| Situación | Status | `type` (slug) |
|---|---|---|
| Sin cookie, o con API key | 401 | `urn:synapse:problem:not-authenticated` |
| `display_name` > 80 caracteres o cuerpo inválido | 422 | `urn:synapse:problem:validation-error` |
| Foto > 2 MB | 413 | `urn:synapse:problem:profile-photo-too-large` |
| Tipo no admitido (contenido) | 415 | `urn:synapse:problem:profile-photo-invalid-type` |
| `GET /auth/me/photo` sin foto | 404 | `urn:synapse:problem:profile-photo-not-found` |
| Almacén de objetos caído | 503 | `urn:synapse:problem:storage-unavailable` |

Al borrar la foto, si el almacén falla la petición responde 503 y la foto **sigue** en la BD
(no queda un objeto huérfano); se puede reintentar.

## Bóvedas — catálogo de atributos (H-029)

Las bóvedas soportan un **catálogo personalizado de atributos** (opcional) para organizar
metadatos sin alterar el cuerpo de las notas.

### 1. Crear o actualizar bóveda con atributos

```json
POST /vaults
{
  "name": "Proyecto",
  "attributes": {
    "status": {
      "type": "select",
      "options": ["active", "inactive", "on-hold"]
    },
    "priority": {
      "type": "number"
    },
    "tags_meta": {
      "type": "text"
    }
  }
}
```

- **Atributos opcionales**: ausentes o `null` es válido; compatibles hacia atrás con bóvedas
  antiguas.
- **Tipos válidos**: `text`, `number`, `boolean`, `list`, `date`, `select`, `multiselect`.
- **Opciones** (sólo `select`/`multiselect`): lista opcional; si presente, máx 200 elementos,
  cada uno 1–64 caracteres sin espacios laterales, sin repetidas.
- **Límites**: máx 100 atributos; tamaño JSON compacto ≤ 64 KiB (UTF-8).
- **Validación estricta**: sin conversión de tipos; errores → `422` `validation-error`.

### 2. Recuperar atributos

```http
GET /vaults/{vault_id}
```

```json
{
  "id": "0c1f…",
  "name": "Proyecto",
  "attributes": {
    "status": { "type": "select", "options": ["active", "inactive", "on-hold"] },
    "priority": { "type": "number" }
  },
  "…": "…"
}
```

**PATCH** reemplaza el mapa completo; `null` borra el campo. Ausente en el PATCH no lo cambia.

## Gráficos Plotly en una nota (H-037)

Un agente puede subir un gráfico de Plotly como archivo HTML y embeberlo en una nota, igual que un diagrama de Archify.

1. **Generar el HTML autocontenido.** Con la librería incrustada, sin CDN:
   ```python
   import plotly.io as pio
   pio.write_html(fig, "grafico.html", include_plotlyjs=True, full_html=True, config={"responsive": True})
   ```
   Pesa ~4,7 MB (el límite de un documento es 25 MB). Con `include_plotlyjs="cdn"` el archivo **no se verá**: el HTML se sirve con una política de seguridad que impide cargar scripts externos y no tiene red. Quita el ancho fijo de la figura (`fig.update_layout(width=None, height=None)`) para que se adapte al celular.
2. **Subirlo.** `POST /files` (multipart: `vault_id`, `file` con `content_type: text/html`, y opcional `visibility`) con la API key del agente (`Authorization: Bearer …`). Devuelve el `id`.
3. **Embeberlo.** En el markdown de la nota: `<iframe src="https://synapse.cjhirashi.com/files/<id>"></iframe>`.

Funcionan los gráficos con SVG (líneas, barras, mapas de calor…), 3D y WebGL 2D (`scattergl`). El HTML corre aislado: sandbox sin `allow-same-origin`, sin acceso a red ni a la sesión. Esa política permite `unsafe-eval` solo para ese HTML (Plotly compila shaders con `new Function`); los demás tipos de archivo no lo llevan.

## API keys de agente (SPEC-0013)

Pensadas para que los agentes OpenClaw (AIRA, Liza, main, n8n…) consulten y gestionen las
bóvedas de su dueño por API, sin un login web interactivo.

### 1. Crear una key (requiere sesión cookie)

```http
POST /auth/agent-keys
Content-Type: application/json

{ "label": "aira" }
```

```json
201 Created
{
  "id": "0c1f…",
  "label": "aira",
  "key": "syn_ak_Xy3…",          // ← el valor plano, SÓLO en esta respuesta
  "created_at": "2026-10-28T12:00:00Z"
}
```

- **`key` se muestra una única vez.** No se puede volver a consultar (en reposo sólo se guarda
  su hash). Guárdala al crearla; si la pierdes, revoca y crea otra.
- `label` es una etiqueta corta (1–64 caracteres) para distinguir la key en el listado, p. ej.
  por agente o plataforma (`aira`, `liza`, `main`, `n8n`).
- El `label` es **único por dueño entre keys vigentes**: repetir uno vigente → `409`
  `agent-key-label-taken`. Para rotar con el mismo nombre lógico, revoca la vieja y crea la
  nueva (o usa un label distinto temporalmente): nunca coexisten dos iguales del mismo dueño.

### 2. Usar la key (datos)

Manda la key en el header `Authorization` en cualquier ruta de `/vaults` o `/sync`:

```http
GET /vaults
Authorization: Bearer syn_ak_Xy3…
```

La respuesta es idéntica a la que vería la cookie del dueño: mismas bóvedas, mismas notas,
misma base de sincronización.

- Key inválida, mal formada o **revocada** → `401` `not-authenticated` (nunca `403`: no se
  revela que la key existiera).
- La revocación surte efecto en la **siguiente** petición (no hay caché de validez).
- La gestión de keys (`/auth/agent-keys`) y la cuenta (`/auth/me`, `/auth/change-password`,
  admin) son **sólo cookie**: una key **no** puede acuñar ni revocar keys, ni cambiar la
  contraseña del humano.
- Si el control plane no está disponible, el acceso por key responde `503` `storage-unavailable`.

### 3. Listar las keys (requiere sesión cookie)

```http
GET /auth/agent-keys
```

```json
200 OK
[
  {
    "id": "0c1f…",
    "label": "aira",
    "created_at": "2026-10-28T12:00:00Z",
    "last_used_at": "2026-10-28T12:34:56Z",   // null si nunca se usó
    "revoked_at": null                          // fecha si está revocada
  }
]
```

Nunca devuelve el valor plano ni el hash.

### 4. Revocar una key (requiere sesión cookie)

```http
DELETE /auth/agent-keys/{id}
```

`204 No Content`. Revocar una key no afecta a las demás del mismo usuario. Revocar una key
ajena o inexistente → `404` `agent-key-not-found` (mismo cuerpo, no revela existencia).

### Resumen de endpoints

| Método | Ruta | Credencial | Respuestas |
|---|---|---|---|
| `POST` | `/auth/agent-keys` | cookie | `201` · `401` · `409` · `422` |
| `GET` | `/auth/agent-keys` | cookie | `200` · `401` |
| `PATCH` | `/auth/agent-keys/{id}` | cookie | `200` · `401` · `404` · `422` (H-030: reasigna `agent_id`/`is_admin`) |
| `DELETE` | `/auth/agent-keys/{id}` | cookie | `204` · `401` · `404` |
| cualquiera | `/vaults/**`, `/sync/**` | cookie **o** `Bearer syn_ak_…` | según la ruta; `401`/`503` por la key |

Contrato máquina: `.harness/specs/0013-acceso-agentes-api/contracts/openapi.yaml`.

## Notas de una bóveda (historia 0014-acceso-agentes-notas)

Para que un agente OpenClaw gestione su propia bóveda sin implementar el protocolo de
replicación CouchDB del lado del cliente (`_bulk_docs`, `_revs_diff`, `_bulk_get`,
`_changes`): listar, leer, crear, actualizar, borrar y restaurar notas por REST, igual que ya
existe para bóvedas (H-004.1 lectura, H-004.2 escritura). La escritura por REST convive con el
push de `/sync` (réplica del cliente) sobre el mismo documento: mismo mecanismo de `_rev` y
las mismas reglas de validación (`core/note_rules.py`) en los dos canales — ningún atajo
nuevo.

### 1. Listar las notas de una bóveda

```http
GET /vaults/{vault_id}/notes
Authorization: Bearer syn_ak_…
```

```json
200 OK
{
  "items": [
    {
      "id": "3c2f…", "vault_id": "0c1f…", "path": "Carpeta/Nota.md",
      "frontmatter": { "titulo": "Nota", "tags": ["trabajo"] },
      "created_at": "2026-10-29T00:00:00.000000Z",
      "updated_at": "2026-10-29T00:00:00.000000Z",
      "deleted_at": null,
      "etag": "\"1-abc123\""
    }
  ],
  "next_cursor": null
}
```

- Cada ítem lleva `frontmatter` (los atributos guardados, o `null` si la nota no tiene) y **no**
  lleva `content`; para leer el cuerpo, `GET` por `id`. El máximo `limit=200` se mantiene (≈ 31 KB
  por página con el frontmatter medio).
- Paginación por cursor opaco (`cursor`, `limit`, 1–200, 50 por defecto), igual que
  `GET /vaults`. Un cursor sólo vale para la misma bóveda y la misma lista (vivas ↔ papelera):
  usarlo en otra → `422` `validation-error`.
- `?deleted=true` lista la papelera de notas de esa bóveda.
- `vault_id` inexistente o ajeno → `404` `vault-not-found`. Una bóveda **borrada** no bloquea
  leer sus notas (se sigue pudiendo listar/leer mientras está en la papelera).

### 2. Leer una nota por id

```http
GET /vaults/{vault_id}/notes/{note_id}
Authorization: Bearer syn_ak_…
```

```json
200 OK
{
  "id": "3c2f…", "vault_id": "0c1f…", "path": "Carpeta/Nota.md",
  "frontmatter": { "tags": ["trabajo"] },
  "content": "# Título\n\nTexto…",
  "created_at": "2026-10-29T00:00:00.000000Z",
  "updated_at": "2026-10-29T00:00:00.000000Z",
  "deleted_at": null
}
```

- Siempre por `id` (no por `path`): el agente lista primero si no conoce el `id`.
- `ETag` en la cabecera (el `_rev` entre comillas): se envía en `If-Match` para `PATCH`,
  `DELETE` y `restore`.
- `note_id` inexistente, ajeno a `vault_id`, no canónico o en la papelera → `404`
  `note-not-found`.

### 3. Crear una nota

```http
POST /vaults/{vault_id}/notes
Authorization: Bearer syn_ak_…
Content-Type: application/json

{ "path": "Carpeta/Nota.md", "content": "# Título\n\nTexto…", "frontmatter": { "tags": ["trabajo"] } }
```

`201 Created` + cabecera `ETag`, cuerpo igual al de `GET` por `id`. `frontmatter` es opcional
(ausente o `null` = sin frontmatter).

- `path`/`content`/`frontmatter` pasan por las **mismas reglas** que el push de `/sync`
  (`core/note_rules.py`): `path` de 1 a 300 puntos de código ya normalizado (sin espacios
  sobrantes en los segmentos), `content` ≤ 2 MiB UTF-8, `frontmatter` ≤ 64 KiB / 32 niveles.
  Un valor que no cumple es `422` `validation-error` con `errors[0].detail` igual al código
  que usaría el rechazo del push (`validation-error:path`, `not-normalized:path`,
  `validation-error:content`, `validation-error:frontmatter`) — un solo vocabulario de
  rechazo en los dos canales.
- `path` ya usado por otra nota viva de la bóveda → `409` `note-path-taken`.
- `vault_id` inexistente, ajeno **o en la papelera** → `404` `vault-not-found`: a diferencia de
  la lectura, escribir exige la bóveda activa (igual que el push).

### 4. Actualizar una nota (`PATCH`, campos parciales)

```http
PATCH /vaults/{vault_id}/notes/{note_id}
If-Match: "1-abc123"
Content-Type: application/json

{ "content": "Texto nuevo" }
```

`200 OK` + `ETag` nuevo, sólo con los campos enviados aplicados (`path`/`content`/
`frontmatter`; `frontmatter: null` lo borra). Cambiar `path` libera la reserva de la ruta
vieja y reserva la nueva (si la nueva ya la usa otra nota viva, `409` `note-path-taken` y la
nota no cambia).

- Sin `If-Match` → `428` `precondition-required`.
- `If-Match` acepta el `ETag` tal como llegó, **fuerte (`"1-abc"`) o débil (`W/"1-abc"`)**: el servidor
  compara el valor sin el prefijo `W/` (un intermediario puede debilitar el `ETag` al
  comprimir). Aplica igual a notas y bóvedas.
- `If-Match` distinto del `ETag` vigente → `412` `precondition-failed` (otra escritura ganó:
  relee y repite).
- Mismas reglas de `core/note_rules.py` que `POST` sobre los campos enviados → `422`.
- **Cambiar `path` reescribe los wikilinks (H-039).** Antes de responder, el servidor corrige en las demás notas vivas
  de la bóveda (y en la propia) los `[[destino]]` que apuntaban a la ruta vieja, conservando el alias (`|` o `\|` en
  tablas), el `.md` presente o ausente y los espacios; no toca código (vallas, código en línea), enlaces markdown
  ni la papelera, y sella `fecha_actualizacion` y un `ETag` nuevo solo en las notas tocadas. Los enlaces de **ruta
  completa** siempre se reescriben; los de **solo nombre** (`[[Plan]]`) solo si cambia el nombre del archivo y el nombre
  viejo era único entre las notas vivas (si no, se cuentan como `ambiguous`). Cabecera de la respuesta (solo cuando
  cambió `path`): `X-Wikilinks-Rewritten: notes=3; links=5; ambiguous=0; pending=0` (`pending` = notas que siguieron
  chocando por `_rev` tras 3 intentos y quedaron sin reescribir). El `ETag` devuelto es el vigente de la nota movida.

### 5. Borrar y restaurar una nota

```http
DELETE /vaults/{vault_id}/notes/{note_id}
If-Match: "1-abc123"
```

`204 No Content`: marca `deleted_at` (papelera, nunca borra el documento) y libera la reserva
de `path` (otra nota puede tomarla). `If-Match` obligatorio, mismos `428`/`412` que `PATCH`.

```http
POST /vaults/{vault_id}/notes/{note_id}/restore
If-Match: "<etag de la papelera>"
```

`200 OK` + `ETag` nuevo: quita `deleted_at` y vuelve a reservar `path` (`409`
`note-path-taken` si otra nota ya lo tomó mientras estaba borrada; la nota sigue en la
papelera). El `ETag` de una nota borrada sale del listado (`GET …/notes?deleted=true`): un
`GET` directo por `id` de una borrada es `404`.

### 6. Mover o renombrar una carpeta (H-039)

```http
POST /vaults/{vault_id}/folders/move
Content-Type: application/json

{ "from": "Proyectos/2025", "to": "Archivo/Proyectos 2025" }
```

```json
200 OK
X-Wikilinks-Rewritten: notes=2; links=3; ambiguous=0; pending=0
{ "from": "Proyectos/2025", "to": "Archivo/Proyectos 2025", "moved_notes": 4,
  "rewrite": { "notes": 2, "links": 3, "ambiguous": 0, "pending": 0 } }
```

Reubica todas las notas **vivas** bajo `from/` a `to/` conservando la subestructura, con sus `INDICE.md`: el INDICE de
cada carpeta viaja con ella y conserva su `descripcion` (si `to/…/INDICE.md` ya existe, manda el del destino y el del
origen va a la papelera); no queda INDICE huérfano en el origen y se aseguran los INDICEs de los ancestros del destino.
Después reescribe los wikilinks de la bóveda como el `PATCH` de nota (§4). Sin `If-Match` (una carpeta no tiene `_rev`).

- `from`/`to` son rutas de carpeta normalizadas (sin `INDICE.md` ni nombre de archivo); vacías (raíz), mal formadas o con
  `to` dentro de `from` → `422`.
- Si alguna ruta destino la usa una nota viva ajena al movimiento → `409` `note-path-taken` **sin mover ni escribir nada**.
- Ni `from` ni `to` tienen notas vivas → `404` `folder-not-found`; bóveda inexistente o en la papelera → `404` `vault-not-found`.
- Una nota movida que siga cambiando durante la operación → `412` `wikilink-rewrite-conflict`: se repite la misma llamada.
- **Idempotente y reparadora:** repetir `{from, to}` cuando `from` ya no tiene notas y `to` sí responde `200` con
  `moved_notes: 0` y completa la reescritura de wikilinks que hubiera quedado pendiente. `from == to` → `200` sin cambios.
- No es transaccional (CouchDB no tiene transacciones entre documentos): cada nota se escribe sobre su `_rev`; si el
  proceso muere a medias, repetir la llamada converge. No muevas una carpeta por la API mientras la interfaz web edita la
  misma bóveda (el canal de `/sync` no reescribe wikilinks).

### Resumen de endpoints

| Método | Ruta | Credencial | Respuestas |
|---|---|---|---|
| `POST` | `/vaults/{vault_id}/folders/move` | cookie **o** `Bearer syn_ak_…` | `200` · `401` · `404` (`vault-not-found`/`folder-not-found`) · `409` (`note-path-taken`) · `412` (`wikilink-rewrite-conflict`) · `422` · `503` |
| `GET` | `/vaults/{vault_id}/notes` | cookie **o** `Bearer syn_ak_…` | `200` · `401` · `404` (`vault-not-found`) · `422` · `503` |
| `POST` | `/vaults/{vault_id}/notes` | cookie **o** `Bearer syn_ak_…` | `201` + `ETag` · `401` · `404` (`vault-not-found`) · `409` (`note-path-taken`) · `422` · `503` |
| `GET` | `/vaults/{vault_id}/notes/{note_id}` | cookie **o** `Bearer syn_ak_…` | `200` · `401` · `404` (`vault-not-found`/`note-not-found`) · `503` |
| `PATCH` | `/vaults/{vault_id}/notes/{note_id}` | cookie **o** `Bearer syn_ak_…` | `200` + `ETag` · `401` · `404` · `409` · `412` · `422` · `428` · `503` |
| `DELETE` | `/vaults/{vault_id}/notes/{note_id}` | cookie **o** `Bearer syn_ak_…` | `204` · `401` · `404` · `412` · `428` · `503` |
| `POST` | `/vaults/{vault_id}/notes/{note_id}/restore` | cookie **o** `Bearer syn_ak_…` | `200` + `ETag` · `401` · `404` · `409` · `412` · `428` · `503` |

Contrato máquina: `.harness/specs/0014-acceso-agentes-notas/contracts/openapi.yaml`.

## Publicar documentos con enlace público (H-035)

Una plantilla con `estilo.publicar.activo: true` permite publicar sus documentos. La publicación es una **copia fija** del documento (HTML ya limpio, título, descripción,
fechas, estado y el índice de encabezados) con un enlace `/p/<token>`; el token (192 bits al azar) es el único dato que da acceso. **Todas las rutas de gestión son solo de la
persona (sesión)**: una API key de agente recibe 401. Un documento sin plantilla, o con la publicación apagada, no se puede publicar ni republicar (409
`publish-not-enabled`); despublicar siempre se puede.

| Ruta | Qué hace |
|---|---|
| `GET /vaults/{v}/notes/{n}/publication` | Estado: `enabled`, `published`, `token`, `path` (`/p/<token>`), `published_at`, `republished_at`, `unpublish_at` (fecha de despublicación automática, UTC con `Z`, o `null`), `stale` (el documento cambió desde la copia). |
| `POST` (misma ruta) con `{"html": "…", "unpublish_at"?: "…"}` (hasta 2 000 000 caracteres) | Publica: 201 con el estado y un token nuevo. 409 `already-published` si ya lo está (también si dos peticiones llegan a la vez). `unpublish_at` es opcional: ISO 8601 **con zona** y al menos 5 minutos en el futuro (si no, 422 con el `pointer` `/unpublish_at` y no se publica nada). |
| `PUT` (misma ruta) con `{"html": "…"}` | Republica: reemplaza la copia y conserva el token, la fecha de publicación y la de despublicación (`republished_at` se actualiza). 404 `not-published` si no lo está. |
| `PUT …/publication/expiry` con `{"unpublish_at": "…" \| null}` | Fija, cambia o quita (`null`) la fecha de despublicación automática; el campo es obligatorio. Mismas reglas de fecha que arriba. 404 `not-published` si no está publicada. Funciona aunque la plantilla ya no tenga la publicación activa. |
| `DELETE` (misma ruta) | Despublica: borra la copia (204); el enlace deja de funcionar y el siguiente será otro. 404 `not-published` si no lo está. |
| `POST …/publication/check` con `{"html": "…"}` | Revisa los recursos del HTML sin publicar: `resources` (`id`, `name`, `content_type` y `visibility`: `public`, `private` o `missing`; un archivo de otra persona sale como `missing`, sin nombre ni tipo), `external` (imágenes de otros sitios) y `has_private` (hay privados o inexistentes). Nunca cambia la visibilidad de nada. |

**Listado y despublicación automática (H-055).** `GET /vaults/{v}/publications` (solo sesión) lista las publicaciones del dueño en la bóveda, de la más reciente a la más antigua: `note_id`, `note_path` (`null` si el documento se borró), `title`, `token`, `path`, `published_at`, `republished_at`, `unpublish_at`, `stale` y `deleted`. Un trabajo de fondo (el mismo ciclo de 60 s que las tareas) borra las publicaciones cuya `unpublish_at` ya pasó y crea un aviso `publication_expired` para la persona (tipo apagable en `PUT /notifications/preferences`; el aviso lleva la URL `/vaults/<id>?tab=publicados`). Mientras el trabajo no corre, la página pública ya responde el mismo 404 que un token inexistente, sin borrar nada.

El HTML es el que la app dibuja en Lectura, con los iframes (Plotly, Archify, YouTube) enviados como un enlace `<a class="pub-embed" href="…">`; el servidor lo vuelve a limpiar
(`nh3`, la misma lista cerrada que el PDF y el `style` filtrado) y solo convierte en `iframe` con sandbox los enlaces cuyo origen esté en una lista cerrada:
archivos de `https://synapse.cjhirashi.com/files/<uuid>`, `https://files-synapse.cjhirashi.com/…` y `https://www.youtube-nocookie.com/embed/<id>` (`?start=N`).

### Página pública: `GET /p/{token}` (y `HEAD`)

Sin sesión, fuera del OpenAPI y del comodín de la SPA. Devuelve una página HTML (tarjeta del documento, índice, contenido y pie) con `Content-Security-Policy` (`default-src 'none'`,
sin scripts salvo el visor de imágenes, que la CSP autoriza solo por su hash SHA-256 en `script-src` —sin `unsafe-inline`—; `frame-src` solo los tres orígenes de arriba), `X-Robots-Tag: noindex, nofollow, noarchive`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` y **sin cookies**.
Un token inexistente, despublicado o de un documento borrado dan **exactamente la misma respuesta 404** (mismo cuerpo y cabeceras). Antes de servir se comprueba que el documento y su
bóveda sigan vivos: si no, 404 y se borra la copia; si el almacenamiento falla un momento, 503 sin borrar nada. Límite de 120 peticiones por minuto por IP (la real llega en
`CF-Connecting-IP`; sin ella, la del socket), con 429 y `Retry-After: 60`; el límite vive en memoria de cada proceso.

## PDF de documentos (H-036)

`POST /vaults/{vault_id}/notes/{note_id}/pdf` con `{"html": "<…>"}` (hasta 5 MB) devuelve `application/pdf` (`Content-Disposition: attachment`,
`Cache-Control: no-store`). **Solo sesión de la persona**: una API key de agente recibe 401. El HTML es el que la app dibuja en Lectura
(los iframes, videos y audio ya vienen sustituidos por un recuadro con título y enlace); el servidor lo vuelve a limpiar con una lista
cerrada de etiquetas y atributos. WeasyPrint carga imágenes `data:`, archivos propios de la persona (`/files/<id>`) e **imágenes públicas de la web**
(la persona responde de lo que pone en su documento). Un enlace a un archivo de esta misma Synapse (`https://<OWN_HOSTS>/files/<id>`, el que da «Copiar link» de Archivos) se lee directo con la sesión, también si el archivo es privado, sin salir a internet. El servidor descarga las demás con tope de 8 MB y 8 s cada una (hasta 60 y 40 MB por PDF), con
redirecciones comprobadas una a una. Nunca se conecta a una dirección interna (loopback, red privada, enlace local, metadatos de la nube, los otros
contenedores): esas imágenes quedan sin imprimir. Un SVG animado (SMIL o `@keyframes`) se imprime en su **último fotograma**; no cubre animación con
JavaScript. Los estilos salen **siempre** de la plantilla del documento (atributo `plantilla`), nunca de la petición.

Errores: `409 pdf-not-enabled` (el documento no tiene plantilla o su plantilla no activa el PDF), `404` (nota o bóveda inexistentes),
`422` (cuerpo inválido o más de 5 MB), `503 pdf-busy` (ya hay 2 PDF generándose; el servidor espera 5 s por un turno), `504 pdf-timeout`
(más de 60 s), `500 pdf-render-failed`.

`estilo.pdf` de la plantilla (todo opcional; `{}` = sin PDF; clave o valor fuera de lo siguiente → `422 plantilla:estilo`):

| Clave | Valor |
|---|---|
| `activo` | booleano; enciende el botón «PDF» en los documentos de la plantilla |
| `incluir_atributos` | booleano; imprime una tabla con los atributos del documento al inicio (apagado por omisión) |
| `pagina` | `tamano`: `carta` (omisión) o `a4`; `margenes_mm`: `superior` 25, `inferior` 20, `izquierdo` 20, `derecho` 20 por omisión, de 0 a 60 |
| `tema` | `primario`: `#rrggbb`. **Tema de color del documento** (opcional; sin él, los colores son los de siempre): a partir del primario el servidor calcula, igual que el tema claro del Markdown de Synapse, el secundario (primario girado +30° en OKLCH) y el terciario (+30° más), y los tonos 600 y 400, y los asigna: H1 primario 600, H2 secundario 600, H3 y H4 los tonos 400 de primario y secundario mezclados 60 % con el texto; negrita, cursiva, negrita-cursiva, enlaces y código mezclan el secundario o el terciario con el color del texto; marcadores de lista en primario 600; citas con borde y fondo del secundario 600; cabecera de tabla en tinte del primario (15 %) con texto primario 600 y filas pares al 7 %. Un `color` fijado a mano en un nivel de `encabezados` manda sobre el del tema. Los cálculos están en `core/color_theme.py` y en `frontend/src/notes/colorTheme.ts`, ambos con los casos de `tests/fixtures/tema_colores.json`. Los colores del encabezado y del pie de página no cambian con el tema. |
| `texto` | `familia`: `DejaVu Sans`, `DejaVu Serif`, `Liberation Sans`, `Liberation Serif` o `Liberation Mono`; `tamano_pt` de 6 a 48; `color` `#rrggbb` |
| `encabezados` | Un estilo por nivel: `h1`, `h2`, `h3`, `h4`, cada uno con `familia`, `tamano_pt` y `color` como `texto` (con `tema`, el `color` es opcional: si falta lo da el tema) (H5 y H6 usan el de H4). Por omisión H1 18 pt y H2, H3 y H4 a 0,82, 0,68 y 0,58 de H1 (H4 no baja del tamaño del texto), con su misma fuente y color. **Formato anterior:** `{familia, tamano_pt, color}` plano también se acepta: vale para H1 y de él se derivan los demás niveles. |
| `portada` | Hoja de portada (marcas `pdf:portada`): `fondo` (`#ffffff` por omisión; llena toda la hoja), `imagen` (id de archivo de la persona o `null`; si hay, cubre la hoja encima del color y es mismo tamaño que la imagen del encabezado; si no, la hoja es solo su color y **no hereda** la imagen del encabezado), `imagen_principal` (booleano, `false`: con `true` y sin `imagen` propia usa la imagen de fondo del `encabezado`), `personalizar` (booleano, `false`: apagado usa los estilos de `encabezados` y `texto` del documento, tema incluido; encendido, los suyos) y `encabezados` y `texto` (`familia`, `tamano_pt`, `color`; solo con `personalizar`; el tamaño de `encabezados` es el del H1 y H2 a H4 se escalan). Sin encabezado ni pie y fuera de la numeración. El formato anterior (un solo `color`) se lee como `personalizar` encendido |
| `indice` | Hoja del índice (marca `pdf:indice`): los mismos campos que `portada` (`fondo` `#f1f5f9` por omisión) más `titulo` (hasta 80 caracteres, «Índice»; con `personalizar`, `encabezados` es su estilo y `texto` el de las entradas) y `niveles` (de 1 a 4, hasta qué encabezado lista; 3). Sin encabezado ni pie y fuera de la numeración |
| `encabezado`, `pie` | `izquierda`, `centro`, `derecha`: hasta 200 caracteres. `fuente`: `familia`, `tamano_pt` y `color` propios (por omisión, la del `texto` a 0,82 de su tamaño y `#475569`). `linea`: `activa` (por omisión apagada en el encabezado y encendida en el pie), `color` (`#cbd5e1`) y `grosor_pt` (0,6; de 0,25 a 6); va bajo el encabezado y sobre el pie. `distancia_mm` (10; de 0 a 60): del borde de la hoja a la banda. `sangria_mm` (0; de 0 a 60): separación lateral extra respecto a los márgenes. El `encabezado` además lleva `imagen` (id de un archivo de imagen de la persona o `null`): **es el fondo de cada página**, pegada a la esquina superior izquierda de la hoja, con el ancho de la hoja (Carta 816 px, A4 794 px, a 96 ppp) y la altura proporcional, sin deformar ni repetir; una imagen de 816 × 1056 px (Carta) o 794 × 1123 px (A4) cubre la hoja exacta, una más ancha se corta por la derecha. Los textos del encabezado se imprimen encima. **El `pie` no lleva imagen** (`pie.imagen` solo admite `null`; otro valor → `422 plantilla:estilo`). |

**Tablas, citas y fondos.** Una tabla que sigue en la página siguiente repite su fila de encabezados (el cliente la pasa a `thead`), no parte una fila por la mitad y redondea las esquinas superiores de cada tramo. Los fondos de las citas, de la cabecera de las tablas y de sus filas pares son translúcidos (`rgba`), para que se vea el fondo del documento a través.

**Marcas del documento.** El Markdown del documento puede llevar estas etiquetas HTML (el editor las muestra con sus botones y cualquier visor de Markdown las deja pasar); el PDF las interpreta:

| Marca | Efecto en el PDF |
|---|---|
| `<!-- pdf:portada -->` … `<!-- /pdf:portada -->` | Lo de en medio es la portada: hoja propia con el fondo y el color de `portada`, sin encabezado ni pie |
| `<!-- pdf:indice -->` | Índice automático de los encabezados (no incluye los de la portada) con su número de página, en hoja propia con el formato de `indice`. Varias marcas: solo vale la primera |
| `<!-- pdf:salto -->` | Lo que sigue empieza en hoja nueva |
| `<div align="center">` … `</div>` | Alineación del contenido: `left`, `center`, `right` o `justify` |
| `<div class="cols-2">` … `</div>` | Contenido en 2, 3 o 4 columnas (`cols-2`, `cols-3`, `cols-4`) |
| `<div class="comentario" data-autor="aira" data-fecha="2026-11-15">` … `</div>` | Comentario de revisión: una ventana gris con la foto y el nombre del autor (`data-autor`: id de un agente o `usuario`; ambos atributos opcionales, en ese orden). **No sale en el PDF** (el cliente lo quita al armar el HTML y la hoja de estilos del servidor lo oculta) ni saldrá en una publicación |

Las marcas con cierre se pueden anidar (alineación dentro de columnas); una apertura sin su cierre queda como texto. La numeración de las hojas empieza en 1 después de la portada
y del índice, y `{{paginas}}` descuenta esas hojas (el servidor maqueta una segunda vez cuando las hay). El servidor solo deja pasar `align` con esos cuatro valores, las clases de las marcas y `section`/`div`.

Campos especiales en los textos de encabezado y pie: `{{titulo}}`, `{{fecha}}` (día de CDMX), `{{pagina}}`, `{{paginas}}` y
`{{atributo:<nombre>}}` (un atributo vacío o inexistente se imprime vacío; las listas se unen con comas; vale cualquier metadato del documento, también `estado`, que el selector de la plantilla ofrece siempre). Cualquier otro `{{…}}` es inválido.

## BITACORA automática y PLANTILLAS (H-030b)

**BITACORA.** El servidor registra cada cambio de cada documento (crear, editar, renombrar, mover, borrar, restaurar), sea del
usuario, de un agente o de una carga del sistema, **antes** de escribirlo (si no puede registrarlo, la escritura falla con `503`).
Desde ese registro genera una nota por día, `BITACORA/AAAA-MM/AAAA-MM-DD.md`, con una línea por cambio: hora, autor (correo,
agente o clave general), operación, título y ruta (en renombres y movimientos, la anterior y la actual). El día y la hora son los de
la zona horaria del propietario (`users.timezone`, por defecto `America/Mexico_City`). **Solo lectura para todos**
(`bitacora:readonly`); se consulta como cualquier nota (`GET …/notes?prefix=BITACORA/2026-11`). No se registran los INDICES
automáticos (sí un cambio de su `descripcion`), la propia BITACORA ni los cambios que solo tocan `fecha_actualizacion`. Una línea
`[sin confirmar]` es un cambio registrado cuya escritura no se confirmó; `[no se aplicó]`, uno que se sabe que falló.

**Diff por cambio (H-062, numerado en H-063).** Como un commit de GitHub, cada línea trae `+N −M` (líneas agregadas y eliminadas del contenido y del
`frontmatter`) y, debajo, un bloque `diff` con ellas: una nota nueva se ve entera como agregada y una borrada como eliminada. H-063 agrega números de línea en dos columnas (línea antigua y nueva) para localizar cada cambio dentro del documento, etiqueta las líneas de propiedades como `prop`, y pinta las líneas agregadas en verde y las eliminadas en rojo (como en GitHub). El
bloque se corta a 200 líneas o 20 KiB y lo avisa (`Diff truncado`); el conteo `+N −M` es siempre el real. Los renombres y
movimientos sin cambio de contenido y las restauraciones muestran `+0 −0`. Los cambios anteriores a H-062 muestran «sin
detalle» (no se pueden reconstruir), y también si el cálculo del diff falló: el cambio se registra igual. Se guarda en
`change_log` (`lines_added`, `lines_removed`, `diff`, `diff_truncated`; migración 024) y `rebuild` lo regenera desde ahí.

**PLANTILLAS.** Cada plantilla es `PLANTILLAS/plantilla-<nombre>.md` (plana; `<nombre>` en minúsculas, dígitos y guiones,
≤ 64). Frontmatter de la definición: `alcance` (lista de carpetas o `["*"]`), `atributos` (`[{nombre, tipo, valor?}]`, `tipo`:
`texto|numero|fecha|lista|booleano`), `estados` (H-054, opcional: hasta 20 `{nombre, color}` —`nombre` normalizado como un estado y sin repetir, `color`
`gris|azul|verde|rojo`— que puede tener un documento con la plantilla; no hay estados de serie y sin ellos los documentos quedan sin estado;
422 `plantilla:estados`), `instrucciones` (H-054, opcional: texto de hasta 20 000 caracteres con el uso de la plantilla, que no se copia al
documento; el cuerpo de la plantilla es solo la estructura; 422 `plantilla:instrucciones`) y `estilo` (`{publicar: {}, pdf: {...}}`: `publicar` es `{}` o `{activo: bool}` (H-035, ver «Publicar documentos»); `pdf` es el formato del PDF, ver «PDF de documentos (H-036)»). El cuerpo es la
estructura Markdown base. Un documento creado desde una plantilla guarda su nombre en el atributo general `plantilla`; se
rechaza una plantilla inexistente en REST (`plantilla:unknown`). Editar una plantilla no toca los documentos que la usan; una
plantilla con documentos vivos que la citen no se renombra ni sale de `PLANTILLAS` (`plantilla:in-use`). Borrarla sí se puede (H-054):
la app deja sus documentos sin plantilla y sus atributos de plantilla con contenido pasan a opcionales; por REST o `/sync` los documentos
que la citaban quedan con una referencia huérfana que la app trata como «sin plantilla». Con plantilla asignada, la app guarda los
opcionales que el documento tenía en el atributo reservado `atributos_ocultos` (un objeto; una plantilla no puede definirlo como atributo)
y los devuelve a su sitio al quitar la plantilla. Otros códigos:
`plantilla:path|alcance|atributos|estados|instrucciones|estilo`.
Un documento con `plantilla` solo puede tener un `estado` de los `estados` de esa plantilla: al crear o editar, REST y `/sync` rechazan
con 422 `plantilla:estado` un estado ajeno, pero solo cuando se asigna o reasigna el `estado` o se cambia la `plantilla` (un documento que ya
traía un estado ajeno se sigue editando sin tocarlo; vaciarlo, quitando `estado`, siempre vale). No se comprueba en las carpetas reservadas
(`AG - SKILLS`, `AG - MENSAJES`…), ni si la plantilla ya no existe. `scripts/clear_invalid_estados.py` deja sin estado a los documentos que ya
tenían uno ajeno (`--apply`; sin él solo informa).

**Documentos de sistema (H-041).** Dos documentos los publica Synapse en toda bóveda, existente y nueva: la skill global
`AG - SKILLS/skill-bovedas-synapse.md` (para todo agente; sin propietario ni invitados) y la plantilla
`PLANTILLAS/plantilla-skill.md` (estructura de una skill de OpenClaw). Su fuente es el repositorio
(`backend/app/system_docs/`: `manifest.json` con ruta, metadatos y versión; un `.md` por cuerpo). Llevan el atributo
`sistema: true` y la etiqueta `sistema`; **«es de sistema» se decide por la ruta**, no por el atributo. **Nadie los modifica desde la
plataforma** (ni un agente, ni `main`, ni el usuario por la app o la API), con cualquier valor de `AGENT_ACCESS_MODE`:
crear en esa ruta, editar contenido o metadatos, renombrar o mover desde o hacia ella, borrar, restaurar una copia vieja de la
papelera, mover una carpeta que los afecte (`POST /folders/move`) y cualquier revisión por `/sync` → `422 sistema:readonly`
(`#/path`; en `/sync`, `reason: sistema:readonly`). El atributo `sistema` es reservado: una nota que no es de sistema y lo
trae (cualquier valor) → `422 sistema:reserved` (`#/frontmatter`); una plantilla de usuario no puede declararlo (`plantilla:atributos`).
La purga solo recorre `AG - MENSAJES`; borrar una bóveda tampoco los toca. **Publicación:** al crear la bóveda
(`ensure_ag_folders`, por REST y por `/sync`); al arrancar el backend, en segundo plano e idempotente (`SYSTEM_DOCS_SYNC`,
por defecto activo); y con `python scripts/sync_system_docs.py` (`--check` informa la deriva sin escribir; `--apply [--report f]`
replica; `--revert f` deshace; `--stamp` recalcula las huellas del manifiesto; `--email`/`--vault` acotan). Una copia que difiere
(cuerpo o metadatos, sin `fecha_*`) se actualiza **en sitio, conservando el id de la nota**; una copia en la papelera no estorba
y una nota viva con la misma ruta en otras mayúsculas se informa como conflicto sin tocarla. Cada publicación consta en la
BITACORA con autor `sistema`. **Versionado:** `version` (semver) en el manifiesto; una prueba exige que la huella guardada
(`sha256` de cuerpo y metadatos) coincida con el contenido, así que cambiar el texto obliga a correr `--stamp` y subir la versión.
Revertir un despliegue vuelve al texto de la imagen anterior. Reemplaza la «skill de cajón» de H-030b (`skill-cajon:human-only` ya no se emite).

**Nombres de skills y plantillas (H-041 E2).** Todo documento de `AG - SKILLS` se llama `skill-<nombre>.md` y está **directamente**
en esa carpeta (sin subcarpetas: `422 skill:path`); todo documento de `PLANTILLAS`, `plantilla-<nombre>.md`. El nombre va en
minúsculas, sin acentos ni espacios (solo `a-z`, `0-9` y `-`). **El servidor lo estructura**: `POST`/`PATCH` con
`AG - SKILLS/Gestión de variables` crean (o renombran a) `AG - SKILLS/skill-gestion-de-variables.md` y la respuesta (`path`)
trae la ruta final. Reglas: se quita `.md` y se vuelve a poner; NFKD sin marcas (`ñ`→`n`, `é`→`e`), `ß`→`ss`, `æ`→`ae`, `œ`→`oe`,
`ø`→`o`, `ł`→`l`…; cualquier otro símbolo (y los alfabetos no latinos) pasa a `-`, los guiones se colapsan y recortan; si el nombre ya
empieza por el prefijo no se duplica (`skill-x`, `Skill - X` → `skill-x`; `skills de x` → `skill-skills-de-x`); el prefijo solo
(`skill`) o un nombre sin letras ni dígitos (`!!!`, `漢字`) → `422 skill:name` (`plantilla:path` en PLANTILLAS); largo máximo: 64
caracteres con el prefijo en una skill (`422 skill:name` si pasa) y 64 sin el prefijo en una plantilla. **Colisiones:** dos nombres que
dan el mismo resultado chocan (`409 note-path-taken`); nunca se añade un sufijo. Se aplica al crear y al renombrar o mover una nota
hacia esas carpetas (sacarla no cambia su nombre); un `PATCH` que solo cambia contenido o metadatos no toca la ruta, así que lo anterior
a H-041 se tolera hasta que se renombre. **`/sync` y `POST /folders/move` no reescriben**: una nota nueva o movida a `AG - SKILLS` con un nombre
no canónico se rechaza (`skill:name`, `skill:path`), porque el cliente ya lo estructuró (`notes/docNames.ts`). Especificación compartida:
`backend/tests/fixtures/nombres_reglas.json`.

**Propietario, invitados y gestores de las skills (H-041 E3).** Una *skill de bóveda* es una nota `AG - SKILLS/skill-<nombre>.md`
(plana, no de sistema); lo anterior a H-041 en subcarpetas no cuenta. Un **gestor** es un agente con registro válido y `estado: activo`
en `AG - AGENTES`. Atributos: `propietario` (id del agente; ausente solo si la skill está archivada), `agentes` (invitados: ids de
gestores, sin repetir, máx. 20, sin el propietario; ausente = `[]`) y `estado: archivado` (inactiva: sin propietario ni invitados).
«Usar» una skill NO lo valida el servidor (no oculta ni restringe lecturas): lo decide cada agente leyendo `sistema`, `propietario`,
`agentes` y `estado` del listado. **El servidor sella `propietario` al crear**: es el agente de la clave (en sombra, el que declara
`X-Agent-Id` una clave general); lo que el cliente envíe se ignora. Un agente que edita sin reenviarlo lo conserva; cambiarlo es una
violación. Una nota que un agente mueve *hacia* `AG - SKILLS` cuenta como creación (queda de propietario). **Siempre activas (422):**
forma y coherencia (`skill:propietario`: activa sin propietario o con uno mal formado; `skill:agentes`: invitados mal formados,
repetidos, de más de 20 o que incluyen al propietario; `skill:estado`: archivada con propietario o invitados), y que la **sesión
humana** solo introduzca gestores como propietario o invitados (lo que ya estaba no se vuelve a exigir al editar otra cosa).
Crear sin propietario resoluble (una clave general sin identidad) también da `skill:propietario` en sombra: no se puede registrar y
permitir una skill sin dueño. **Bajo `AGENT_ACCESS_MODE`:** un agente que no es gestor (`not-registered`, `suspended`, `general-key`),
que edita, mueve, borra o restaura una skill que no es suya (`skill-not-owner`), que cambia el propietario
(`skill-owner-immutable`) o que invita a quien no es gestor (`skill-invitee-not-manager`). En sombra se registra en
`agent_access_log` (`op` = `skill-create|update|move|delete|restore`) y se permite; con `enforce` responde `403 agent-access-denied` con un `detail`
fijo por motivo («Only the owner of a skill may edit or delete it», «The owner of a skill is set by the system and an agent cannot
change it», «Only managers of the vault can be invited to a skill»). La sesión humana no se evalúa por agente. Los gestores escriben
en `AG - SKILLS` (antes solo en `AG - SKILLS/<su-id>/`). En `/sync` no se puede sellar la revisión: una clave de agente debe traer el
propietario correcto. Mover una carpeta hacia `AG - SKILLS` exige que sus notas ya sean skills válidas (`skill:propietario`).
Especificación compartida de la forma: `backend/tests/fixtures/skills_reglas.json`.

**El gestor que sale y las skills archivadas (H-041 E4).** Hoy un gestor se quita borrando su ficha `AG - AGENTES/<id>.md` o poniéndola
`suspendido`, desde `/settings/agent-access` (`DELETE` y `PUT /vaults/{id}/agent-access/{id}`, solo sesión humana) o editando la nota a
mano; los agentes no pueden (`registry-readonly`). **Una skill activa nunca queda sin propietario:** mientras el agente sea
propietario de skills activas, esas tres vías responden `409 agent-owns-skills` (por `/sync`, `ag-agentes:owns-skills`) y no cambian nada.
`GET /vaults/{id}/skills` lista las skills (`note_id`, `path`, `titulo`, `propietario`, `agentes`, `estado`; sin documentos de sistema ni
INDICE). `POST /vaults/{id}/agent-access/{agent_id}/leave` (solo sesión humana) con `{modo: "quitar"|"suspender", skills: [{note_id,
accion: "assign"|"delete"|"archive", a?}]}` resuelve cada skill activa del agente: con invitados, `assign` (a uno de ellos) o `delete`; sin
invitados, `delete` o `archive`; falta alguna → `409 agent-owns-skills` sin tocar nada; una resolución no permitida → `422` con
`#/skills/<i>/accion|a|note_id` (`leave:accion`, `leave:a`, `leave:skill`). Después lo quita de `agentes` de las skills que lo invitan y
quita o suspende su registro; responde `{asignadas, eliminadas, archivadas, invitaciones_quitadas}`. **Archivada:** `estado: archivado`,
sin propietario ni invitados, en su carpeta; no la purga nada. `POST /vaults/{id}/skills/{note_id}/assign` `{propietario}` (solo sesión
humana) la asigna a un gestor activo (`422 skill:propietario` si no lo es): el nuevo propietario sale de `agentes` si estaba y una
archivada vuelve a `en revisión`. **Quien deja de ser gestor por cualquier vía** (también al editar su ficha) se quita de `agentes` de todas
las skills tras la escritura del registro (idempotente). Cada cambio consta en la BITACORA a nombre del usuario.

## Carpetas reservadas, buzón entre agentes y registro de agentes (H-030)

Cada bóveda tiene cinco carpetas reservadas **en la raíz**: `AG - SKILLS`, `AG - MENSAJES`, `AG - AGENTES`, `BITACORA`
y `PLANTILLAS` (las dos últimas, H-030b: ver «BITACORA automática y PLANTILLAS»). Sus nombres se escriben siempre en
**MAYÚSCULAS** (`meta-folder:case` rechaza `Plantillas/…`). Nacen con la bóveda (REST y `/sync`), cada una con
su `INDICE.md` y su `descripcion`; no se renombran ni se mueven, su INDICE no se borra y ninguna nota toma su nombre
(`meta-folder:rename`, `meta-folder:index-delete`, `reserved-name:path`). Mover otra carpeta *hacia* una reservada sí se admite.

### 1. Listar una carpeta: `prefix`

```http
GET /vaults/{vault_id}/notes?prefix=AG%20-%20MENSAJES%2Fliza&limit=200
```

Solo las notas bajo esa carpeta (sin barra final; comparación por segmentos con la equivalencia de rutas NFKC + casefold),
**ordenadas por ruta**; sin `prefix` el orden es el de siempre (creación descendente). Mismo cuerpo, `etag` y `frontmatter`
por ítem. El `next_cursor` solo vale para la misma bóveda, lista y carpeta. `prefix` inválido → `422`. Con `deleted=true`
lista la papelera de esa carpeta. Para la bandeja: `prefix=AG - MENSAJES/<mi-id>` y filtrar `frontmatter.estado == "abierta"`
de las notas `.../000-cabecera.md` en el cliente (no hay filtro por estado en el servidor).

### 2. Identidad del agente en cada petición

Una key puede llevar `agent_id` (id corto en minúsculas: `aira`, `liza`…) e `is_admin`:

```http
POST /auth/agent-keys   {"label": "op-aira", "agent_id": "aira", "is_admin": false}      (cookie)
PATCH /auth/agent-keys/{id}   {"agent_id": "aira", "is_admin": false}                    (cookie; key vigente)
```

El listado (`GET /auth/agent-keys`) y la creación devuelven `agent_id` e `is_admin`. Una key **sin** `agent_id` es general
(el comportamiento anterior). **Contrato para el plugin:** cada agente usa **su** key (`Authorization: Bearer syn_ak_…`); el
servidor deduce quién escribe de la key, no de lo que el agente diga. Mientras se use la key general, el plugin puede
declarar `X-Agent-Id: <id>` en cada petición: **no es una credencial**, solo alimenta la bitácora del modo sombra (se ignora
con cumplimiento activo y con keys que ya tienen agente). Una key nunca crea, reasigna ni revoca keys, ni cambia el registro.

### 3. Registro de agentes por bóveda: `AG - AGENTES`

Una nota por agente, `AG - AGENTES/<id>.md`, con `estado` (`activo` | `suspendido`), `carpetas` (lista de carpetas con
escritura; `*` = toda la bóveda salvo las reservadas) y `lectura` (lista de carpetas con lectura; opcional, por omisión
`["*"]` = todas las carpetas del alcance del propietario o invitado). Una nota de esa carpeta que no sea un registro válido se rechaza
(`ag-agentes:registro`). Se edita como cualquier nota (sesión humana o agente administrador) o con:

| Método | Ruta | Credencial | Respuestas |
|---|---|---|---|
| `GET` | `/vaults/{id}/agent-access` | cookie o key | `200` `{mode, agents[{agent_id, estado, carpetas, lectura, note_id, keys[{label,is_admin}]}], unregistered_keys, unregistered_agent_ids}` |
| `PUT` | `/vaults/{id}/agent-access/{agent_id}` `{carpetas, lectura?, estado}` | cookie | `200` · `404` · `422` |
| `DELETE` | `/vaults/{id}/agent-access/{agent_id}` | cookie | `204` · `404` |
| `GET` | `/agent-access/shadow-report?hours=48` | cookie | `200` decisiones del modo sombra por agente y últimas denegadas |

Desde H-064 F3c el campo `lectura` existe y se valida; **no restringe todavía las lecturas de los agentes** (ni los del propietario ni los del invitado; estos últimos quedan acotados solo por las concesiones de su persona). Si el `PUT` no la envía, se conserva la del registro (o `["*"]` en un registro nuevo); `escritura` (`carpetas`) incluye lectura. Una `lectura` mal formada se rechaza con 422, también en una nota editada a mano (`ag-agentes:registro`).

Reglas de escritura (la lectura nunca se restringe). Sesión humana: todo. Key con `is_admin`: todo. Agente registrado y
`activo`: sus `carpetas`, `AG - SKILLS/<su-id>/…` y `AG - MENSAJES`. No registrado, `suspendido` o key general: solo
`AG - MENSAJES`. `AG - AGENTES` lo escribe solo el humano o el administrador; `BITACORA` nadie la escribe (solo el servidor) y `PLANTILLAS` se rige por `carpetas` como cualquier carpeta de contenido, con su formato propio (H-030b).
Un renombre o movimiento exige permiso en la ruta de origen **y** en la de destino. Archivos (`/files`): basta ser un
agente registrado y activo en la bóveda. Modos (`AGENT_ACCESS_MODE`): `shadow` (por defecto) solo registra lo que haría
en la tabla `agent_access_log`; `enforce` rechaza con `403` `agent-access-denied` (REST) o `reason: agent-access-denied`
(`/sync`); `off` no evalúa. Cambios en el registro rigen de inmediato.

### 4. Buzón: `AG - MENSAJES` (H-042)

Solo para agentes. **Una conversación es una carpeta** con el nombre `<de> → <para> - <asunto> - <AAAA-MM-DD>` (la flecha es
`→`, U+2192) y un documento por mensaje; el receptor responde con otro documento en la misma carpeta.

```
AG - MENSAJES/<de> → <para> - <asunto> - <AAAA-MM-DD>/001-de-<de>.md       # el mensaje que solicita (lo escribe quien abre)
AG - MENSAJES/<de> → <para> - <asunto> - <AAAA-MM-DD>/002-de-<para>.md     # la respuesta; 003, 004, … hasta 999
AG - MENSAJES/<de> → <para> - <asunto> - <AAAA-MM-DD>/000-cabecera.md      # la crea el SERVIDOR con el primer mensaje; estado: abierta|cerrada
```

- `<de>` y `<para>`: ids de agente `[a-z0-9][a-z0-9-]{0,31}`, distintos; `<asunto>`: de 1 a 100 caracteres; `<AAAA-MM-DD>`: fecha real
  (la pone el agente). La REST acepta ` -> ` y guarda `→` (la respuesta trae la ruta final en `path`); `/sync` no reescribe, rechaza.
- **Abrir** = `POST /vaults/{id}/notes` del primer mensaje; **responder** = el siguiente número; **cerrar o reabrir** = `PATCH` de la
  cabecera con `frontmatter: {estado: "cerrada"|"abierta"}` (basta `estado`: el servidor conserva el resto y sella `cerrada_el`, que
  desaparece al reabrir). Escribir un mensaje en una conversación cerrada **la reabre sola**.
- **Siempre (422, también en `/sync`):** `ag-mensajes:agents-only` (la sesión humana no escribe nada aquí: ni mensajes, ni INDICES, ni
  mover carpetas), `ag-mensajes:path` (la ruta no encaja), `ag-mensajes:not-participant` (`NNN-de-<id>.md` con un `<id>` que no es `de` ni
  `para`), `ag-mensajes:from-mismatch` (el `de` de los metadatos no es el del nombre), `ag-mensajes:cabecera` (metadatos de la cabecera),
  `ag-mensajes:cabecera-server` (nadie crea la cabecera a mano), `ag-mensajes:immutable` (los mensajes no se editan, mueven ni borran; de la
  cabecera solo cambia `estado`; nada entra ni sale del buzón por un renombre) y `409 note-path-taken` (ese número ya existe: reintenta con el siguiente).
- **Bajo `AGENT_ACCESS_MODE`** (sombra: se registra en `agent_access_log` como `mensaje-create`/`mensaje-update` y se permite; `enforce`:
  `403 agent-access-denied` con un `detail` fijo): el `<id>` del nombre es el agente de la clave, el primer mensaje lo escribe quien abre y solo
  los dos participantes cierran o reabren. `is_admin` no interviene. El sistema **no** valida el receptor ni mira `AG - AGENTES`: un agente de
  solo lectura puede abrir y responder conversaciones (la skill enseña a dirigirse solo a gestores).
- **Fin (hoy):** una conversación `cerrada` con `cerrada_el` de más de 15 días se elimina físicamente (carpeta, notas e INDICE, sin papelera);
  antes se vuelca a JSONL, que se conserva 30 días (`scripts/purge_mensajes.py`, tabla `purge_log`). Una abierta no caduca. **Pendiente (H-042 E3):**
  pasar a 30 días sin mensajes nuevos (`MENSAJES_PURGE_DAYS`), abierta o cerrada, y cerrar las conversaciones dirigidas a un agente que deja de ser gestor.

Contrato máquina: `.harness/specs/h030-carpetas-ag/contracts/openapi.yaml`. Herramientas (dentro del contenedor, `backend/scripts/`):
`ensure_ag_folders.py` (carga en las bóvedas existentes; sin `--apply` es informe en seco), `seed_agent_registry.py`
(sembrado del registro), `create_agent_keys.py` (claves `op-<agente>` a un archivo 600; no sobrescribe uno existente) y
`purge_mensajes.py` y `h042_migrate.py` (H-042: descripción del INDICE de `AG - MENSAJES`; en seco por defecto). Programación de la purga en el host (03:30 CDMX = 09:30 UTC, volcados en
`.claude/worktrees/respaldos-purga/`, montada en el contenedor como `/backups/synapse-purga`):
`30 9 * * * docker exec synapse-backend python scripts/purge_mensajes.py --apply >> /mnt/disco2/cjhirashi-data/proyectos/synapse/.claude/worktrees/respaldos-purga/purga.log 2>&1`.

**Corte (activar el cumplimiento):** poner `AGENT_ACCESS_MODE=enforce` en `.env`, `docker compose up -d backend` (~13 s de ventana
medida) y revocar la key general. Antes, revisar `GET /agent-access/shadow-report` (o la tabla `agent_access_log`) de 24 a 48 h
con las keys por agente en uso. Revertir: `AGENT_ACCESS_MODE=shadow` y el mismo `up -d`.

## Archivos: carpetas y subcarpetas (H-025, H-046)

`folder` es una **ruta de carpetas separadas por `/`** (por ejemplo `portafolio/synapse/capturas`). Reglas: hasta 8 niveles y 300 caracteres en total; cada nivel de 1 a 64 caracteres, sin `\` ni caracteres de control, sin espacios al principio o al final y distinto de `.` y `..`; no admite niveles vacíos (`a//b`, `/a`, `a/`). Vacío o solo espacios equivale a la raíz (`null` en las respuestas). Un valor inválido da `422` `validation-error` sin crear nada en MinIO ni en la base. Las respuestas de `POST /files`, `PATCH /files/{id}` y `GET /vaults/{vault_id}/files` devuelven `folder` (`null` en la raíz, incluidos los archivos anteriores a la migración 007).

- `POST /files` (multipart) acepta `folder` y deja el archivo ahí.
- `PATCH /files/{id}` con `folder` **mueve** el archivo (`""` lo devuelve a la raíz); sin el campo no lo toca. Se puede combinar con `name`.
- `GET /vaults/{vault_id}/files?folder=<ruta>` lista solo los archivos de esa carpeta (sin los de sus subcarpetas); `folder=` vacío lista los de la raíz; sin el parámetro lista todos.
- Las carpetas vacías existen por sí mismas (tabla `file_folders`, migración 010); las que tienen archivos se derivan de ellos, y todas incluyen sus carpetas padre. `GET /vaults/{vault_id}/file-folders` devuelve `{folders: [...]}` ordenado.
- `POST /vaults/{vault_id}/file-folders` `{path}` crea una carpeta (y sus padres); es idempotente y devuelve la lista completa (`201`).
- `POST /vaults/{vault_id}/file-folders/move` `{from, to}` mueve una carpeta con todo su contenido: cambia la ruta de sus archivos y de sus subcarpetas, también las vacías. Si el destino ya existe, **se fusionan**. Mover una carpeta dentro de sí misma da `422` `file-folder-move-invalid`; una carpeta que no existe, `404` `file-folder-not-found`. Devuelve `{from, to, moved_files}`.
- `DELETE /vaults/{vault_id}/file-folders?path=<ruta>` borra una carpeta **vacía** (`204`; con archivos debajo, `409` `file-folder-not-empty`: primero se mueven o se borran los archivos).
- Los agentes con API key pueden crear, mover y borrar carpetas como cualquier operación de archivos (permiso `files` sobre la bóveda); el registro de acceso las anota como `file-folder-create`, `file-folder-move` y `file-folder-delete`.

La pestaña «Archivos» de cada bóveda (H-052; ya no hay pantalla global de archivos) usa esto: árbol de carpetas en la barra lateral (arrastrar un archivo o una carpeta sobre otra la mueve), tabla de archivos con el mismo diseño que las tablas del portafolio, y «Subir archivo» deja el archivo en la carpeta abierta. Contrato: `.harness/specs/h016-archivos-pantalla-y-tipos/contracts/openapi.yaml`.

## Archivos: visibilidad elegida al subir

`POST /files` acepta el campo multipart opcional `visibility`: `private` (por defecto) o `public`. Lo puede pedir **cualquier solicitante**, también un agente con su API key: así una imagen o un HTML que va a una página pública nace público y nadie tiene que cambiarlo a mano. Un valor distinto de esos dos da `422` y no crea nada en MinIO ni en la base. Un archivo público se sirve sin credencial (`GET /files/{id}`).

Después de subirlo, **solo la persona cambia la visibilidad**: `PATCH /files/{id}` con `visibility` desde una sesión humana (la pestaña Archivos de cada bóveda). Con una API key —de un agente o la general— responde `403` `file-visibility-user-only` y no cambia nada; renombrar con key sigue permitido. Se elige bien al subir: un archivo subido como privado ya no lo vuelve público un agente, y uno subido como público no lo vuelve privado.

La herramienta `synapse_vault` de OpenClaw expone el campo en `file_upload` cuando se actualice su plugin; hasta entonces, por REST. El parámetro `folder` de `file_upload` acepta rutas anidadas (`a/b/c`) desde H-046; crear, mover y borrar carpetas solo está por REST. Contrato: `.harness/specs/h016-archivos-pantalla-y-tipos/contracts/openapi.yaml`.

## Tareas de bóveda (H-053)

Cada bóveda tiene un gestor de tareas en dos niveles (una tarea y sus subtareas), asignables a la persona o a un agente. Las tareas viven en PostgreSQL (tabla `vault_tasks`, migración 012), no en la base de notas: se editan solo con conexión. Los endpoints aceptan la sesión (cookie) o una API key; la bóveda se valida contra la base del dueño y una tarea ajena responde 404.

| Método y ruta | Qué hace |
|---|---|
| `GET /vaults/{id}/tasks` | Tareas de la bóveda, planas (la jerarquía va en `parent_id`). Filtros: `status` (repetible), `assignee` (`user` o id de agente), `due_after`, `due_before`. Respuesta `{items, total}` (hasta 1000). |
| `GET /tasks` | Lo mismo en todas las bóvedas del dueño (con los mismos filtros). |
| `POST /vaults/{id}/tasks` | Crea una tarea; con `parent_id` crea una subtarea. 201 con `ETag`. |
| `POST /vaults/{id}/tasks/{task_id}/subtasks` | Crea una subtarea bajo `task_id` (manda la ruta). |
| `GET /vaults/{id}/tasks/{task_id}` | Lee una tarea (`ETag` = `"<version>"`). |
| `PATCH /vaults/{id}/tasks/{task_id}` | Cambia solo lo enviado (un `null` vacía `description`, `notes`, `start_at`, `due_at` y `path`, y devuelve `reminders` a los de siempre). `If-Match: "<version>"` opcional. |
| `DELETE /vaults/{id}/tasks/{task_id}` | Borra la tarea y, si es raíz, sus subtareas. 204. |

**Campos de entrada:** `title` (1 a 255), `description`, `notes` (≤ 20 000), `status` (`pending`, `in_progress`, `done`, `cancelled`), `priority` (`low`, `medium`, `high`), `start_at` (inicio, con zona; se guarda en UTC; nunca posterior a `due_at`, 422 `/start_at`; migración 017), `due_at` (con zona; se guarda en UTC), `assignee_type` (`user`, `agent`), `assignee_agent_id`, `path`, `reminders`, `sort_order`. Cualquier otro campo → 422.

**Salida (`TaskOut`):** los anteriores más `id`, `vault_id`, `parent_id`, `created_by` y `updated_by` (`user` o `agent:<id>`), `version`, `created_at`, `updated_at`, `completed_at` y `purge_at`. Las fechas van en UTC con `Z`.

**Reglas:**
- Dos niveles exactos: una subtarea no puede tener subtareas (422, `/parent_id`).
- `assignee_type: agent` exige `assignee_agent_id` de un agente registrado y activo en la bóveda (422, `/assignee_agent_id`). Volver a `user` limpia el agente.
- Una raíz con subtareas toma su estado de ellas: alguna en curso o hecha → `in_progress`; todas cerradas → `done` (o `cancelled` si todas se cancelaron); si no, `pending`. Cambiarlo a mano da 422 (`/status`). Se recalcula al crear, cambiar o borrar una subtarea.
- `path` es indicativa: se normaliza (sin `/` en los extremos) y se rechaza solo si tiene niveles vacíos, `.`, `..`, `\` o más de 500 caracteres (422, `/path`); no se comprueba que el documento o la carpeta existan.
- `start_at` y `due_at` son opcionales y se validan como par: el inicio no puede quedar después del vencimiento (422, `/start_at`), también cuando solo se cambia uno de los dos. La vista **Línea de tiempo (Gantt)** de la app solo dibuja las tareas que tienen ambas; las que no, siguen siendo válidas y se ven en Lista, Kanban y Calendario.
- `If-Match` con una versión distinta de la vigente → 412 `task-precondition-failed`.
- **Retención:** una raíz cerrada (`done` o `cancelled`) se elimina con sus subtareas `TASKS_RETENTION_DAYS` (30) días después de `completed_at`, en un ciclo de fondo (`TASKS_JOBS_INTERVAL_SECONDS`, 60). Sin papelera; una subtarea nunca se elimina sola; reabrir la tarea borra `completed_at`. `purge_at` lo informa en las raíces cerradas.

**Permisos de agentes** (con `AGENT_ACCESS_MODE=enforce`; en `shadow` solo se registra en `agent_access_log`): la persona y el agente administrador, todo. Un agente registrado y activo lee todo, crea tareas y subtareas, cambia `status` y `notes` de las que tiene asignadas, y edita, reasigna o borra solo las que creó (`created_by`). Un agente sin registro, suspendido o con clave general solo lee. Un cambio no permitido → 403 `agent-access-denied`.

**Errores:** 404 `task-not-found` (también si la tarea es de otra bóveda o de otro usuario), 412 `task-precondition-failed`, 403 `agent-access-denied`, 422 (con `errors[].pointer`), más los de sesión y `vault-not-found`.

## Proyectos de bóveda (H-058)

Un proyecto agrupa las tareas de **su** bóveda (como en Asana): título, descripción, responsable (la persona o un agente registrado y activo en la bóveda), estado y color. Borrar un proyecto no borra sus tareas: quedan sin proyecto. Mismos permisos por agente que las tareas (un agente registrado crea, cambia el estado de los que tiene asignados y edita o borra solo los que creó).

| Ruta | Qué hace |
|---|---|
| `GET /vaults/{id}/projects` | Proyectos de la bóveda con su avance (`tasks_total`, `tasks_done`: tareas raíz). Filtro `status` (repetible). Respuesta `{items, total}`. |
| `GET /projects` | Lo mismo en todas las bóvedas del dueño. |
| `POST /vaults/{id}/projects` | Crea un proyecto. 201 con `ETag`. |
| `GET /vaults/{id}/projects/{project_id}` | Lee un proyecto (`ETag` = `"<version>"`). |
| `PATCH /vaults/{id}/projects/{project_id}` | Cambia solo lo enviado (`description: null` la vacía). `If-Match: "<version>"` opcional (412 `project-precondition-failed`). |
| `DELETE /vaults/{id}/projects/{project_id}` | Borra el proyecto; sus tareas quedan con `project_id: null`. 204. |

**Campos de entrada:** `title` (1 a 255), `description` (≤ 20 000), `status` (`active`, `on_hold`, `completed`; por omisión `active`), `color` (`gray`, `blue`, `green`, `red`, `orange`, `yellow`, `purple`, `pink`; por omisión `blue`), `assignee_type` (`user` o `agent`), `assignee_agent_id` y `sort_order`. **Tareas:** `project_id` en `POST` y `PATCH` de una tarea raíz pone o quita (`null`) su proyecto, que debe ser de la misma bóveda (422 con `/project_id`); una subtarea toma el de su raíz y no tiene uno propio, y mover la raíz mueve a sus subtareas. `GET /vaults/{id}/tasks` y `GET /tasks` aceptan `project_id=<id>` o `project_id=none` (sin proyecto). Cada tarea devuelve `project_id`.

## Avisos y preferencias (H-053)

Bandeja de avisos de la persona. **Solo sesión humana** (cookie): una API key de agente no los lee ni los marca (401).

| Método y ruta | Qué hace |
|---|---|
| `GET /notifications` | Avisos del usuario, del más nuevo al más viejo. Filtros: `unread=true`, `limit` (1 a 200, 50 por defecto). Respuesta `{items, unread}`; cada aviso de una tarea trae `task` (título, descripción, estado, prioridad, vencimiento y responsable de la tarea tal como está ahora; `null` si se eliminó). |
| `GET /notifications/unread-count` | `{count}` de avisos sin leer (el contador del riel). |
| `POST /notifications/{id}/read` | Marca un aviso como leído (404 `notification-not-found` si no existe o es de otro). |
| `POST /notifications/read-all` | Marca todos como leídos. |
| `GET /notifications/preferences` | `{kinds: {task_assigned, task_status, task_due}, quiet: {enabled, start, end}}`: tipos activos y horas silenciosas (HH:MM, America/Mexico_City; por defecto 22:00–07:00). |
| `PUT /notifications/preferences` | Cambia solo lo enviado: `kinds` (un tipo apagado deja de generar avisos) y/o `quiet`. Horas con otro formato o inicio igual al fin: 422. |
| `GET /notifications/push` | `{enabled, public_key, devices}`: si el servidor tiene claves VAPID, la clave pública para suscribirse y los dispositivos de la persona. |
| `PUT /notifications/push/subscription` | Registra o reasigna este dispositivo (cuerpo de `PushSubscription.toJSON()`). 204. 422 si el servidor no tiene push o el `endpoint` no es https de un servicio de push conocido. |
| `DELETE /notifications/push/subscription?endpoint=` | Quita este dispositivo. 204. |
| `POST /notifications/push/test` | Envía ya un aviso de prueba a los dispositivos (ignora las horas silenciosas). `{sent, removed, failed}`. |

**Tipos** (`kind`): `vault_share` (invitaciones y cambios de acceso a bóvedas compartidas; ver «Compartir una bóveda»), `task_assigned` (un agente te asigna una tarea o subtarea), `task_status` (un agente cambia el estado de una tarea que creaste tú) y `task_due` (una tarea tuya vence en 24 h, en 1 h o venció). La persona nunca se avisa de su propia acción. Cada aviso trae `title`, `body`, `vault_id`, `resource_type`/`resource_id` (`task`) y `url`, la ruta de la app que lo abre (`/vaults/{id}?tab=tareas&task={id}`); las fechas van en UTC con `Z`.

**Bloqueo entre tareas (H-057):** `blocked_by` (en `POST` y `PATCH`) es la lista completa de ids de las tareas que esta debe esperar (hasta 30; `[]` o `null` las quita; ausente no cambia). Solo valen tareas de la misma bóveda, y no la propia, ni la tarea padre de una subtarea ni las subtareas de una raíz, ni cadenas que formen un ciclo: si no, 422 con `/blocked_by`. Una tarea bloqueada puede ponerse `in_progress` pero no `done` mientras alguna bloqueadora no esté `done` (una `cancelled` tampoco la libera): 422 con `/status` y detalle `This task is blocked…`. La respuesta trae `blocked_by` (ids) y `blocked` (alguna no está hecha). Una raíz bloqueada no se cierra sola aunque sus subtareas lo estén (queda `in_progress`) y se cierra cuando su última bloqueadora se hace. Cambiar `blocked_by` cuenta como editar la tarea: un agente solo lo hace en las que creó. Borrar una bloqueadora libera a las que esperaban.

**Recordatorios (`reminders`):** lista de minutos antes de `due_at` a los que se avisa a la persona (de 1 a 40 320, o sea hasta 4 semanas; máximo 5; sin repetidos, se guardan del más lejano al más cercano). `[1440, 60]` = 1 día y 1 hora antes. Sin enviarlo, o con `null`, rigen los de siempre (1 día y 1 hora); `[]` = ninguno. Valores fuera de rango, más de 5 o que no sean enteros → 422. Un agente solo cambia `reminders` en las tareas que creó (la asignada solo permite `status` y `notes`). Migración 016.

**Vencimientos:** un ciclo de fondo (`TASKS_JOBS_INTERVAL_SECONDS`, 60) revisa las tareas abiertas de la persona, también las asignadas a un agente (ella las supervisa): avisa a cada recordatorio de la tarea y al vencer (hasta 7 días después; este último no depende de la lista). Solo se envía la ventana vigente, la del recordatorio más cercano al vencimiento que ya llegó (uno ya pasado al crear la tarea no se manda), y cambiar `due_at` reinicia los avisos. Un recordatorio nuevo no repite los que ya salieron. La creación es idempotente por `dedupe_key`: un reinicio no duplica.

**Web Push (H-053):** cada aviso nuevo se envía al dispositivo con la misma estructura que la tarjeta de `/avisos`: título «Tipo · evento» y, en el cuerpo, título y descripción de la tarea, una línea «estado · responsable · bóveda» y el vencimiento (si la tarea ya no existe, sale el aviso simple); con un hilo despachador (`PUSH_DISPATCH`, `PUSH_POLL_SECONDS`), salvo en las horas silenciosas, durante las cuales el push queda pendiente y sale al terminar (si el aviso no tiene más de 24 h); el aviso siempre queda en la bandeja. Claves VAPID: `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` en `.env`; sin ellas el push está apagado (`GET /notifications/push` → `enabled: false`). Una API key de agente no usa ninguna de estas rutas (401).

**PWA:** `/sw.js` (service worker, `Cache-Control: no-cache`, `Service-Worker-Allowed: /`) y `/manifest.webmanifest` (`application/manifest+json`) se sirven desde el build; el service worker solo guarda `/assets/*` y la pantalla de arranque, nunca datos de la API.

## Compartir una bóveda: invitaciones y membresías (H-064 F2)

El propietario invita a **usuarios que ya existen**; el aviso les llega dentro de la app. **Solo sesión humana** (cookie): una API key de agente no invita ni responde (401/403). Esta fase crea y gestiona las invitaciones y sus concesiones; aplicar las concesiones al leer y escribir notas llega en la fase F3.

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `POST /vaults/{vault_id}/members` | propietario | Invita: `{email, grants: [{folder, level}]}`. 201 con el miembro (`status: pendiente`). 404 `invitee-not-found` (sin cuenta activa con ese correo exacto), 422 (correo inválido, uno mismo o concesiones inválidas), 409 `member-already-exists` y 409 `member-limit-reached` (50 pendientes o activos por bóveda). Si la persona ya tuvo una invitación terminada, se reabre la misma fila con las concesiones nuevas. |
| `GET /vaults/{vault_id}/members` | propietario | Miembros de la bóveda en todos los estados, con `user` y `grants`. |
| `PUT /vaults/{vault_id}/members/{member_id}/grants` | propietario | Reemplaza todas las concesiones (efecto inmediato). 409 `invitation-not-pending` si ya está revocado. |
| `DELETE /vaults/{vault_id}/members/{member_id}` | propietario | Pendiente → `revocado` con motivo `cancelada`; activo → `revocado` con `revocada`. 204. Las concesiones se conservan como historial. |
| `GET /invitations` | invitado | Mis invitaciones y accesos (por defecto `pendiente` y `activo`; `?status=pendiente\|activo\|revocado`), con `owner`, `vault_name` y `grants`. Del dueño y la bóveda solo se ve eso. |
| `POST /invitations/{member_id}/accept` | invitado | `pendiente` → `activo`. 200 con el miembro. |
| `POST /invitations/{member_id}/reject` | invitado | `pendiente` → `revocado` (`rechazada`). 200. |
| `POST /invitations/{member_id}/leave` | invitado | `activo` → `revocado` (`salio`). 204. |

**Concesiones:** cada una es `{folder, level}` con `level` `lectura` o `escritura` (escritura incluye lectura) y `folder` igual a `*` (toda la bóveda) o una ruta de carpeta sin barra inicial ni final, sin segmentos vacíos ni `.`/`..`, de hasta 600 caracteres. Entre 1 y 100, sin carpeta repetida. Las zonas reservadas no se conceden por nombre (ni sus subcarpetas): `AG - AGENTES`, `AG - SKILLS`, `AG - MENSAJES`, `BITACORA` y `PLANTILLAS` (422 `validation-error` con `/grants`).

**Aislamiento:** una invitación o un miembro que no son de quien pregunta responden 404 (`vault-not-found` o `member-not-found`), igual que si no existieran. El correo se compara exacto, sin distinguir mayúsculas y sin comodines.

**BITACORA del propietario:** cada evento (invitar, cambiar concesiones, cancelar, revocar, aceptar, rechazar y salir) queda como una línea en el documento del día de `BITACORA/` de la bóveda, con la hora, quién lo hizo (correo y tipo), el evento, el invitado y, al invitar o cambiar permisos, las concesiones (por ejemplo «lectura en `Pub`, escritura en toda la bóveda»). La fila se guarda en `change_log` en la misma transacción que el cambio de membresía (o quedan las dos o ninguna); el documento del día se genera después, de mejor esfuerzo, y `rebuild` lo regenera desde la tabla. Una petición que el servidor rechaza no deja línea. El invitado nunca ve `BITACORA` (zona oculta).

**Avisos:** tipo `vault_share` (apagable en `PUT /notifications/preferences`), con `url` `/compartidas`. Invitar y cancelar o revocar avisan al invitado; aceptar, rechazar y salir, al propietario. El título lleva el nombre de la persona y de la bóveda, nunca carpetas ni notas.

## Notas de una bóveda compartida (H-064 F3)

Un miembro **activo** de una bóveda compartida (ver «Compartir una bóveda») usa las mismas rutas de notas del propietario, `/vaults/{vault_id}/notes…`, con su propia sesión: el servidor resuelve la bóveda del propietario y le aplica sus concesiones. Una clave de agente nunca entra como miembro (404, como cualquier ajeno). Los archivos y las carpetas de archivos se abren con la misma regla (ver «Archivos de una bóveda compartida»). Las tareas se abren con la misma regla (ver «Tareas de una bóveda compartida»); el registro de agentes no se abre todavía y responde 404; `POST /folders/move` responde 403 `share-forbidden` a un miembro; las publicaciones son solo del propietario.

| Operación | Con lectura | Con escritura | Sin acceso |
|---|---|---|---|
| `GET /notes` (también `prefix=` y `deleted=true`) | solo las notas bajo sus carpetas | igual | no aparecen; una carpeta sin acceso da lista vacía |
| `GET /notes/{id}` | 200 | 200 | 404 `note-not-found`, idéntico a una nota inexistente |
| `POST /notes` | 403 `share-forbidden` | 201 solo bajo una carpeta con escritura | 403 `share-forbidden` |
| `PATCH` (contenido o propiedades), `DELETE`, `…/restore` | 403 `share-forbidden` | permitido | 404 `note-not-found` |
| `PATCH` con `path` (mover o renombrar), `POST …/pdf` | 403 `share-forbidden` | 403 `share-forbidden` | 404 / 403 |

**Orden de las comprobaciones:** el permiso se evalúa antes que `If-Match` y que cualquier regla de contenido; así un `If-Match` errado nunca distingue una nota oculta (404) de una visible (403 o 412).

**Zonas:** `AG - AGENTES`, `AG - SKILLS`, `AG - MENSAJES` y `BITACORA` no se ven ni se escriben nunca, aunque la concesión sea `*`; `PLANTILLAS` la lee cualquier miembro y no la escribe nadie. Una nota suelta en la raíz solo entra con `*`. Las carpetas se comparan por segmentos y con la equivalencia de rutas del proyecto (mayúsculas y compatibilidad Unicode).

**Paginación:** el servidor examina como máximo 2,000 documentos por petición para llenar una página; si no alcanza puede devolver menos de `limit` notas con `next_cursor` para seguir. Lo no legible nunca se cuenta ni se re-sirve.

**Propietario:** lo que crea un miembro cuenta contra los límites del propietario (`document-limit-reached` incluido), y en la bitácora consta como autor el miembro. Si el propietario se desactiva o se da de baja, el acceso del miembro se corta en la siguiente petición; revocar o cambiar concesiones también es inmediato.

## Tareas de una bóveda compartida (H-064 F3b2)

Un miembro activo usa `/vaults/{vault_id}/tasks…` con su propia sesión. Las tareas no tienen carpeta: el permiso sigue al `path` de cada tarea (una tarea sin `path` equivale a la raíz y solo la cubre una concesión `*`). Cada subtarea se evalúa por su propio `path`.

| Operación | Con lectura | Con escritura | Sin acceso |
|---|---|---|---|
| `GET /tasks` de la bóveda (con sus filtros) | solo las tareas que cubre | igual | no aparecen |
| `GET …/tasks/{id}` | 200 | 200 | 404 `task-not-found`, idéntico a una inexistente |
| `POST …/tasks` y `…/subtasks` | 403 `share-forbidden` | 201 solo si escribe en el `path` de la tarea (y en el de su padre) | 403 (o 404 si el padre no se lee) |
| `PATCH`, `DELETE` | 403 `share-forbidden` | permitido; si cambia `path`, debe escribir también en el nuevo | 404 |

- El permiso se evalúa antes que `If-Match` y que cualquier otra regla: un `If-Match` errado no distingue una tarea oculta (404) de una de solo lectura (403).
- Un miembro **no asigna a un agente** (el registro de agentes es del propietario), **no fija ni cambia el proyecto** y no bloquea con tareas que no lee (404). En la salida, `blocked_by` solo lista las bloqueadoras que lee; `blocked` se conserva.
- Borrar una raíz borra sus subtareas: exige escritura sobre todas (si no, 403).
- La autoría de lo que crea un miembro consta como `user`, igual que lo del propietario; los avisos de asignación llegan al propietario.
- `GET /tasks` (vista de todas las bóvedas) sigue siendo solo de la sesión propia: nunca incluye una bóveda compartida.

## Agentes de un invitado (H-064 F4)

Las **claves de API con identidad de agente** de una persona invitada (las que crea con `POST /auth/agent-keys` con `agent_id`) trabajan en la bóveda compartida igual que la persona: sobre la base del propietario y con **las concesiones de la persona como techo** (nunca pueden más que ella). Lo demás de esta sección (notas, tareas, archivos y carpetas de archivos de una bóveda compartida) rige igual para el agente: lo no legible responde 404 y lo legible sin escritura, 403 `share-forbidden`.

| Credencial en una bóveda compartida | Resultado |
|---|---|
| Sesión de un miembro activo | Sus concesiones. |
| Clave con `agent_id` de un miembro activo | Las mismas concesiones del miembro; sin ellas (invitación pendiente, revocada, o no es miembro), 404 como si la bóveda no existiera. |
| Clave **general** (sin `agent_id`) de un miembro | 404: no entra. |
| Clave con `is_admin` de un miembro | No gana nada: sigue limitada a las concesiones del miembro. |
| Clave del propietario o de sus agentes | Como siempre (registro `AG - AGENTES`, sin cambios). |

**El registro del propietario no se aplica a los agentes del invitado.** Un id de agente puede coincidir entre cuentas distintas (el propietario puede tener un `aira` registrado y el invitado otro `aira` suyo): el agente del invitado no hereda nada del registro del propietario; manda solo lo concedido a su persona. Estrechar a un agente concreto por debajo de su persona (y que el campo `lectura` de `AG - AGENTES` lo aplique) queda como mejora posterior.

**Autoría doble.** Lo que escribe una persona o su agente consta a nombre de la persona y, si fue el agente, también de él:

- **BITACORA** del propietario: persona = `<correo> (usuario)`; agente = `<agent_id> (de <correo>) (agente)`.
- **Tareas** (`created_by` / `updated_by`): `guest:<id de usuario>` para la persona y `guest:<id de usuario>/agent:<agent_id>` para su agente; nunca `user`, que es del propietario. Una tarea de un invitado no dispara los avisos de «un agente cambió algo que te toca».
- Notas y archivos no guardan un campo de autor propio: la autoría de una nota consta en la BITACORA.

**Contrato para el plugin `synapse_vault` (agentes del invitado).** El plugin usa la clave del agente del invitado y el `vault_id` de la bóveda **del propietario**:

1. Descubrir las bóvedas compartidas con `GET /invitations?status=activo` (la clave de un agente puede leerlas): cada item trae `vault_id`, `vault_name`, `grants` y `owner`. `GET /vaults` solo lista las bóvedas propias de la cuenta.
2. Operar con las rutas de siempre (`/vaults/{vault_id}/notes`, `/tasks`, `/files`…): las respuestas ya vienen filtradas por las concesiones. `GET /vaults/{vault_id}` devuelve solo `id`, `name` y `description`.
3. `inbox` y `AG - MENSAJES` no existen en una bóveda compartida para un invitado (zona oculta): el buzón de un agente sigue siendo el de sus propias bóvedas.
4. Una invitación se acepta o rechaza solo con **sesión humana**: una clave de agente no responde invitaciones ni invita (401/403).
5. El agente no cambia concesiones ni comparte la bóveda: solo el propietario.

## Archivos de una bóveda compartida (H-064 F3b1)

Un miembro activo usa `GET /vaults/{vault_id}`, `GET /vaults/{vault_id}/files`, `/vaults/{vault_id}/file-folders` y `/files/{id}` con su propia sesión; el servidor aplica sus concesiones a la ruta de cada archivo (`carpeta/nombre`, o `nombre` en la raíz) y a la de cada carpeta.

| Operación | Con lectura | Con escritura | Sin acceso |
|---|---|---|---|
| `GET /vaults/{id}` | 200 con solo `id`, `name` y `description` | igual | 404 |
| `GET /vaults/{id}/files` (`folder=`) | solo los archivos que cubre; `total` cuenta esos | igual | no aparecen |
| `GET /vaults/{id}/file-folders` | solo las carpetas con nivel (las ancestras no se muestran por sí solas) | igual | no aparecen |
| `GET /files/{id}` | 200 | 200 | 404 `file-not-found`, idéntico a uno inexistente |
| `POST /files` (subir, `vault_id` en el formulario) y `POST /vaults/{id}/file-folders` (crear) | 403 `share-forbidden` | 201 solo bajo una carpeta con escritura | 404 |
| `PATCH /files/{id}` con `name` o `folder` distintos | 403 `share-forbidden` | 403 `share-forbidden` | 404 |
| `PATCH /files/{id}` solo con `visibility` | 403 `share-forbidden` | permitido | 404 |
| `DELETE /files/{id}`, `DELETE …/file-folders` | 403 `share-forbidden` | permitido | 404 |
| `POST …/file-folders/move`, `POST /folders/move` | 403 `share-forbidden` | 403 `share-forbidden` | 404 |

Un miembro nunca mueve ni renombra archivos o carpetas (decisión de la fase: solo el propietario reorganiza). Una carpeta que contiene subcarpetas sin escritura no se borra. Las publicaciones siguen siendo solo del propietario.

## Perfil de agente (H-053)

Nombre visible y foto de cada agente de la persona, para identificar sus huellas en la app (bitácora, quién crea una tarea y a quién se asigna). El `agent_id` de la API key sigue siendo el identificador técnico: el perfil solo cambia cómo se muestra. **Solo sesión humana** (cookie): una API key de agente no los lee ni los edita (401). Un `agent_id` existe para esta persona si alguna de sus API keys (vigente o revocada) lo lleva; otro responde 404 `agent-profile-not-found`. Cada persona ve solo los suyos.

| Método y ruta | Qué hace |
|---|---|
| `GET /agent-profiles` | `{items: [{agent_id, display_name, photo_url}]}` de los agentes con alguna key. `photo_url` lleva la versión (`/agent-profiles/aira/photo?v=2`) para que el navegador no reutilice una foto vieja. |
| `PUT /agent-profiles/{agent_id}` | `{display_name}` (hasta 60 caracteres; `null` o vacío vuelve al id). 422 si se pasa de largo. |
| `PUT /agent-profiles/{agent_id}/photo` | Multipart `file`: PNG, JPEG o WebP de hasta 2 MB; el tipo se decide por el contenido (413 y 415 `profile-photo-*`). |
| `DELETE /agent-profiles/{agent_id}/photo` | Quita la foto. |
| `GET /agent-profiles/{agent_id}/photo` | La imagen (`Cache-Control: private, no-cache`); 404 `agent-profile-photo-not-found` si no tiene. |

La foto vive en el almacén de objetos (`users/{persona}/agents/{agent_id}/avatar`). La bitácora no guarda estos datos: el servidor escribe el id del agente y la app lo sustituye por el nombre y la foto al mostrarla.
