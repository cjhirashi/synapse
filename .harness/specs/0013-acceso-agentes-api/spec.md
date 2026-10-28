---
id: SPEC-0013
tipo: spec
feature: 0013-acceso-agentes-api
estado: superseded-por-backlog  # migrado a historias/0013-acceso-agentes-api/ (H-002), 2026-10-28 — ver backlog.md
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: 6a9f6c7
anchor_mode: advisory    # advisory | strict  (pasa a strict en implemented/verified)
covers:
  - backend/app/routers/auth.py
  - backend/app/routers/vaults.py
  - backend/app/routers/sync.py
  - backend/app/routers/agent_keys.py
  - backend/app/core/dependencies.py
  - backend/app/core/models/agent_api_key.py
  - backend/app/core/ports/agent_key_port.py
  - backend/app/adapters/agent_key_repository.py
  - backend/app/services/auth_service.py
  - backend/app/services/agent_key_service.py
  - backend/tests/test_agent_api_key*.py
  - docs/API.md
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: { por: "Carlos (Telegram, cjhirashi)", fecha: 2026-10-28 }
  fase_2: { por: "Carlos Jiménez (cjhirashi, Telegram)", fecha: 2026-10-28, nota: "PLAN-0013 P-1…P-9 tal cual; P-10 ajustado a label único por dueño entre keys vigentes (RF-010, nuevo); covers ampliado con sync.py/agent_keys.py/agent_key_port.py/agent_key_repository.py/agent_key_service.py (PLAN-0013 §8)." }
actualizado: 2026-10-28
---

# SPEC-0013 · Acceso de agentes OpenClaw a bóvedas vía API key

> Fase 1 co-definida por Telegram el 2026-10-28: Carlos pidió que los agentes
> OpenClaw externos (AIRA, Liza, main, etc.) puedan consultar y gestionar las
> bóvedas de `cjhirashi@gmail.com` sin pasar por la carpeta de archivos
> asignada, usando el API de Synapse directamente. AIRA tradujo el requisito
> a un mecanismo que no rompe el aislamiento por usuario (ver §6) y lo devolvió
> en el mismo intercambio; Carlos no objetó.

## 1. Contexto del dominio
Hoy solo hay login humano por cookie de sesión (`/auth/login`, SPEC-0002). Los
agentes OpenClaw no son un navegador: necesitan una credencial de larga vida,
no interactiva, para llamar `/vaults` y las notas sin abrir una sesión web.

## 2. Alcance
### En alcance
- Nuevo tipo de credencial — **API key de agente** — emitida por un usuario ya
  autenticado, para sí mismo.
- Nueva vía de autenticación por header que resuelve al mismo `current_user`
  que la sesión por cookie (mismo `owner_id`, misma base `synapse_user_{id}`).
- Endpoints para crear, listar (sin revelar el secreto) y revocar keys propias.
- Las keys no cambian en nada el CRUD de bóvedas/notas ya existente
  (SPEC-0003/0005/0010): sólo se les añade esta vía de entrada alternativa.

### Fuera de alcance
- UI en el frontend para gestionar keys (puede ser spec futura; de momento
  se crean por API/endpoint directo).
- Acceso cruzado entre usuarios (una key de un usuario viendo datos de otro).
- Cambios al editor de bóvedas (0008/0009) o al rediseño visual (0011).
- La tool de OpenClaw que consume este API (la crea `main`, fuera del repo de
  Synapse, una vez este API exista).

## 3. Modelo de datos y contratos de E/S
| Frontera | Dirección | Tipo | Contrato en `contracts/` |
|---|---|---|---|
| `POST /auth/agent-keys` | entrada | REST (requiere sesión cookie) | `contracts/openapi.yaml#/paths/~1auth~1agent-keys` |
| `GET /auth/agent-keys` | salida | REST | idem |
| `DELETE /auth/agent-keys/{id}` | entrada | REST | idem |
| Header `Authorization: Bearer <key>` en cualquier ruta de `/vaults`, `/sync` | entrada | REST | idem |

- Tabla nueva `agent_api_keys` (Postgres, control plane): `id` (uuid),
  `owner_id` (FK a `users.id`), `label` (texto corto, ej. "aira"), `key_hash`
  (hash, nunca el valor plano), `created_at`, `last_used_at` (nullable),
  `revoked_at` (nullable).
- El valor plano de la key se devuelve **una sola vez**, en la respuesta de
  `POST /auth/agent-keys` — igual que un token de API típico.

## 4. Criterios de aceptación (EARS)
- **RF-001** — El sistema DEBE permitir a un usuario con sesión válida crear
  una API key propia con una etiqueta (`label`), devolviendo el valor en texto
  plano solo en esa respuesta.
- **RF-002** — CUANDO una petición llega con un header `Authorization: Bearer
  <key>` válido y no revocado, el sistema DEBE resolver `current_user` al
  mismo `owner_id` que generó esa key, con idéntico alcance de datos que su
  sesión por cookie (mismas bóvedas, mismas notas).
- **RF-003** — SI la key no existe, está mal formada o fue revocada, ENTONCES
  el sistema DEBE responder 401 (`NotAuthenticated`), igual que una cookie
  inválida (SPEC-0002).
- **RF-004** — El sistema DEBE permitir listar las keys propias (id, label,
  created_at, last_used_at, revoked_at) sin exponer el valor plano ni el hash.
- **RF-005** — El sistema DEBE permitir revocar una key propia; una key
  revocada DEBE fallar en el siguiente uso, sin afectar las demás keys del
  mismo usuario.
- **RF-006** — El sistema NUNCA DEBE permitir que una key resuelva a un
  `owner_id` distinto de quien la creó (P2/P3 de `AGENTS.md`, aislamiento por
  usuario — no se crea un segundo usuario con acceso cruzado, se autentica
  *como* el mismo usuario).
- **RF-010** — (Gate 2, 2026-10-28) SI un usuario crea una key con un `label`
  que ya usa **otra key vigente suya** (no revocada), ENTONCES el sistema
  DEBE responder 409 sin crearla; el mismo `label` SÍ se puede reutilizar tras
  revocar la key que lo tenía (rotación). La unicidad es por dueño, nunca
  global entre usuarios.

## 5. Casos límite y manejo de errores
- **RF-007** — SI se usa una key revocada ENTONCES 401, no 403 (no revelar que
  la key existió).
- **RF-008** — SI la tabla de control plane no está disponible ENTONCES 503
  (`StorageUnavailable`, mismo patrón que `vaults.py`).
- **RF-009** — El sistema DEBE actualizar `last_used_at` de forma asíncrona o
  best-effort (no debe bloquear ni fallar la petición principal si esa
  escritura falla).

## 6. Registro de decisiones y descartes
| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| La key autentica *como* el mismo usuario (mismo `owner_id`), no crea un usuario "agente" nuevo con permiso de lectura sobre otro usuario | `AGENTS.md` fija aislamiento por usuario como regla que "nunca se rompe" (P2/P3); un usuario-agente con acceso cruzado violaría esa regla y abriría la puerta a fuga de datos entre cuentas si en el futuro hay más de un usuario humano | Usuario "agente" separado con una tabla de permisos que apunte a bóvedas de otro usuario | — |
| Header `Authorization: Bearer` en vez de reusar las cookies de sesión | Los agentes OpenClaw no son un navegador: no hay flujo de login interactivo ni almacenamiento de cookies entre llamadas | Emitir cookies de larga vida para el agente | — |
| Key en texto plano solo en la respuesta de creación; se guarda como hash | Si se filtra la tabla, no se puede reconstruir la key activa (mismo patrón que passwords, SPEC-0002) | Guardar la key en claro para poder mostrarla de nuevo | — |

## 7. Requisitos no funcionales (RNF)
- **RNF-001** — Revocar una key debe tener efecto en la siguiente petición
  (sin caché de validez de más de unos segundos).
- **RNF-002** — El `key_hash` nunca aparece en logs ni en respuestas de error.

## Marcadores abiertos
(ninguno — `[NEEDS CLARIFICATION] = 0`)
