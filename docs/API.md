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

## BITACORA automática y PLANTILLAS (H-030b)

**BITACORA.** El servidor registra cada cambio de cada documento (crear, editar, renombrar, mover, borrar, restaurar), sea del
usuario, de un agente o de una carga del sistema, **antes** de escribirlo (si no puede registrarlo, la escritura falla con `503`).
Desde ese registro genera una nota por día, `BITACORA/AAAA-MM/AAAA-MM-DD.md`, con una línea por cambio: hora, autor (correo,
agente o clave general), operación, título y ruta (en renombres y movimientos, la anterior y la actual). El día y la hora son los de
la zona horaria del propietario (`users.timezone`, por defecto `America/Mexico_City`). **Solo lectura para todos**
(`bitacora:readonly`); se consulta como cualquier nota (`GET …/notes?prefix=BITACORA/2026-11`). No se registran los INDICES
automáticos (sí un cambio de su `descripcion`), la propia BITACORA ni los cambios que solo tocan `fecha_actualizacion`. Una línea
`[sin confirmar]` es un cambio registrado cuya escritura no se confirmó; `[no se aplicó]`, uno que se sabe que falló.

**PLANTILLAS.** Cada plantilla es `PLANTILLAS/plantilla-<nombre>.md` (plana; `<nombre>` en minúsculas, dígitos y guiones,
≤ 64). Frontmatter de la definición: `alcance` (lista de carpetas o `["*"]`), `atributos` (`[{nombre, tipo, valor?}]`, `tipo`:
`texto|numero|fecha|lista|booleano`) y `estilo` (`{publicar: {}, pdf: {}}`, reservado para H-035/H-036). El cuerpo es la
estructura Markdown base. Un documento creado desde una plantilla guarda su nombre en el atributo general `plantilla`; se
rechaza una plantilla inexistente en REST (`plantilla:unknown`). Editar una plantilla no toca los documentos que la usan; una
plantilla con documentos vivos que la citen no se borra, renombra ni saca de `PLANTILLAS` (`plantilla:in-use`). Otros códigos:
`plantilla:path|alcance|atributos|estilo`.

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

Una nota por agente, `AG - AGENTES/<id>.md`, con `estado` (`activo` | `suspendido`) y `carpetas` (lista de carpetas con
escritura; `*` = toda la bóveda salvo las reservadas). Una nota de esa carpeta que no sea un registro válido se rechaza
(`ag-agentes:registro`). Se edita como cualquier nota (sesión humana o agente administrador) o con:

| Método | Ruta | Credencial | Respuestas |
|---|---|---|---|
| `GET` | `/vaults/{id}/agent-access` | cookie o key | `200` `{mode, agents[{agent_id, estado, carpetas, note_id, keys[{label,is_admin}]}], unregistered_keys, unregistered_agent_ids}` |
| `PUT` | `/vaults/{id}/agent-access/{agent_id}` `{carpetas, estado}` | cookie | `200` · `404` · `422` |
| `DELETE` | `/vaults/{id}/agent-access/{agent_id}` | cookie | `204` · `404` |
| `GET` | `/agent-access/shadow-report?hours=48` | cookie | `200` decisiones del modo sombra por agente y últimas denegadas |

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

## Archivos: carpeta opcional (H-025)

`POST /files` (multipart) acepta el campo opcional `folder`: de 1 a 64 caracteres, sin `/`, `\` ni caracteres de control, y distinto de `.` y `..`. Vacío o solo espacios equivale a sin carpeta. Un valor inválido da `422` `validation-error` sin crear nada en MinIO ni en la base. Las respuestas de `POST /files`, `PATCH /files/{id}` y `GET /vaults/{vault_id}/files` devuelven `folder` (`null` para los archivos sin carpeta, incluidos los anteriores a la migración 007). `PATCH` no cambia la carpeta. Contrato: `.harness/specs/h016-archivos-pantalla-y-tipos/contracts/openapi.yaml`.

## Archivos: visibilidad elegida al subir

`POST /files` acepta el campo multipart opcional `visibility`: `private` (por defecto) o `public`. Lo puede pedir **cualquier solicitante**, también un agente con su API key: así una imagen o un HTML que va a una página pública nace público y nadie tiene que cambiarlo a mano. Un valor distinto de esos dos da `422` y no crea nada en MinIO ni en la base. Un archivo público se sirve sin credencial (`GET /files/{id}`).

Después de subirlo, **solo la persona cambia la visibilidad**: `PATCH /files/{id}` con `visibility` desde una sesión humana (la pantalla Archivos). Con una API key —de un agente o la general— responde `403` `file-visibility-user-only` y no cambia nada; renombrar con key sigue permitido. Se elige bien al subir: un archivo subido como privado ya no lo vuelve público un agente, y uno subido como público no lo vuelve privado.

La herramienta `synapse_vault` de OpenClaw expone el campo en `file_upload` cuando se actualice su plugin; hasta entonces, por REST. Contrato: `.harness/specs/h016-archivos-pantalla-y-tipos/contracts/openapi.yaml`.
