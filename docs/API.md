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
| **API key de agente** | `Authorization: Bearer syn_ak_…` | agentes OpenClaw (no interactivos) | **sólo datos**: `/vaults`, `/sync` |

La API key **no** es un segundo usuario: autentica *como el mismo usuario* que la creó (mismo
`owner_id`, misma base). Nunca da acceso a los datos de otro usuario (aislamiento por usuario).

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
| `DELETE` | `/auth/agent-keys/{id}` | cookie | `204` · `401` · `404` |
| cualquiera | `/vaults/**`, `/sync/**` | cookie **o** `Bearer syn_ak_…` | según la ruta; `401`/`503` por la key |

Contrato máquina: `.harness/specs/0013-acceso-agentes-api/contracts/openapi.yaml`.
