---
id: SPEC-0005
tipo: spec
feature: 0005-sync
estado: draft            # draft | in-review | approved | implemented | verified | deprecated
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: 5704bf9   # último commit reconciliado (lo mueve el cierre)
anchor_mode: advisory    # advisory | strict  (pasa a strict en implemented/verified)
covers:                  # borrador: se cierra al terminar la Fase 1 (depende de D-1 y D-2)
  - frontend/src/sync/**
  - backend/app/routers/sync.py
  - backend/tests/test_sync*.py
  - .harness/specs/0005-sync/diagrams/**
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: pendiente
  fase_2: pendiente
actualizado: 2026-10-13
---

# SPEC-0005 · Sincronización PouchDB ↔ CouchDB (offline-first)

> Borrador de apertura de la Fase 1 (elicitación con el usuario, `method.md §3`). Nace del
> hazard 1 de `state.md` ("Conflictos PouchDB ↔ CouchDB"), del hazard 3 ("Offline → datos
> obsoletos") y de la observación de 0003 (el servidor sólo acepta ids UUID canónicos).
> Los requisitos de abajo son **propuesta**: las decisiones abiertas están en §6 y en
> «Marcadores abiertos», cada una con alternativas y una recomendación. Nada está decidido
> hasta que el usuario lo diga.

## 1. Contexto del dominio
- **Problema:** el usuario debe poder leer y editar sus bóvedas sin conexión y que, al
  volver la red, sus cambios lleguen al servidor y a sus otros dispositivos sin perder datos.
- **Punto de partida (hechos del repo, revisión `5704bf9`):**
  - Cada usuario tiene una base CouchDB `synapse_user_{id}` creada en el alta (SPEC-0002);
    las bóvedas son documentos `vault:{uuid}` en ella (SPEC-0003).
  - CouchDB sólo es accesible con la credencial **admin**, desde la red interna
    `synapse_internal`; no hay usuarios CouchDB por persona ni `_security` por base. El
    navegador no puede ni debe hablar con CouchDB directamente hoy.
  - La sesión es una cookie httpOnly con JWT de 24 h (SPEC-0002); la SPA y la API
    comparten origen (Caddy / nginx / Vite).
  - Los invariantes de 0003 los aplica el **servicio** del backend, no CouchDB:
    validación de campos (RF-005/006), nombre único por usuario con documentos de reserva
    `vault-name:{name_key}` (RF-007, RF-021, RF-025, RF-027), `vault_id` canónico (RF-014),
    soft delete con `deleted_at` y concurrencia optimista con ETag/`If-Match` (`_rev`).
    **Una réplica que escriba directo en la base se salta todos ellos.**
- **Dependencias:** SPEC-0002 (sesión), SPEC-0003 (modelo de bóveda e invariantes),
  SPEC-0004 (errores RFC 9457). Librería cliente prevista: PouchDB (IndexedDB).

## 2. Alcance
### En alcance (propuesta)
- Réplica local en el navegador de la base del propio usuario, y nada más.
- Lectura sin conexión de bóvedas (lista, detalle, papelera).
- Escritura sin conexión de bóvedas — **según D-2** (podría quedar sólo en lectura).
- Sincronización automática al recuperar la red, en ambos sentidos.
- Detección de conflictos y una vía de resolución explícita, sin pérdida silenciosa.
- Indicador de estado en la UI: en línea / sin conexión / cambios pendientes / conflictos,
  con la hora de la última sincronización (hazard 3).
- Diagrama Archify del flujo (`diagrams/`).
### Fuera de alcance (propuesta)
- Documentos dentro de las bóvedas (la feature de documentos no existe aún); el diseño
  debe admitirlos sin rehacerse, pero no se implementan aquí.
- Compartir bóvedas o bases entre usuarios.
- Edición colaborativa en tiempo real (CRDT, cursores, WebSocket propio).
- Sincronización para los agentes OpenClaw: siguen usando la API REST (`state.md`).
- Purga de la papelera a 30 días (RF-016 de 0003, feature aparte; ver R-7).
- Aplicación nativa / service worker de instalación (PWA) — salvo que D-6 lo pida.

## 3. Modelo de datos y contratos de E/S  ← INVENTARIO DE FRONTERAS
| Frontera | Dirección | Tipo | Contrato en `contracts/` |
|---|---|---|---|
| Replicación cliente ↔ servidor (protocolo de replicación CouchDB: `_changes`, `_revs_diff`, `_bulk_docs`, `_bulk_get`, `_local`) | entrada/salida | HTTP | por definir en Fase 2 según D-1 |
| Errores del canal de sync (sesión caducada, base ajena, documento rechazado) | salida | REST | `application/problem+json` (SPEC-0004) |
| Documentos replicados | entrada/salida | JSON | esquema `vault` de `0003-vault-crud/contracts/` |

- Ids: la réplica sólo admite `vault:{uuid}` canónico y los documentos de diseño/reserva
  que el servidor decida exponer (D-4).
- `vault-name:*` (reservas de nombre) son detalle de implementación del servidor: si se
  replican o no se decide en D-4.

## 4. Criterios de aceptación (EARS) — borrador
> Se redactan y cierran con el usuario; los que dependen de una decisión lo indican.

- **RF-001** — El cliente DEBE replicar sólo la base `synapse_user_{id}` del usuario de la
  sesión; el `{id}` sale del token, nunca de la petición (P2).
- **RF-002** — SI una petición del canal de sync apunta a una base que no es la del
  usuario de la sesión ENTONCES el sistema DEBE responder 404 sin revelar si existe (como
  RF-014 de 0003).
- **RF-003** — MIENTRAS no hay conexión, la UI DEBE mostrar las bóvedas de la réplica
  local, el estado "sin conexión" y la hora de la última sincronización correcta.
- **RF-004** — CUANDO vuelve la conexión, el cliente DEBE reanudar la sincronización sin
  acción del usuario y mostrar "cambios pendientes" hasta que se confirmen en el servidor.
- **RF-005** — Todo documento que entre al servidor por el canal de sync DEBE cumplir los
  mismos invariantes que la API REST de 0003 (validación de campos, nombre único, id
  canónico, `deleted_at`). [depende de D-2]
- **RF-006** — SI el servidor rechaza un cambio local (p. ej. nombre ya ocupado por una
  bóveda creada en otro dispositivo) ENTONCES el cliente DEBE conservar el cambio, marcarlo
  como rechazado con el motivo y ofrecer corregirlo; nunca descartarlo en silencio.
- **RF-007** — CUANDO dos dispositivos editan la misma bóveda sin conexión, el sistema
  DEBE conservar ambas versiones hasta que se resuelva el conflicto según D-3; ningún
  orden de sincronización puede perder una versión sin decisión explícita.
- **RF-008** — SI la sesión caduca durante la sincronización ENTONCES el cliente DEBE
  detenerla, conservar los cambios locales pendientes y pedir iniciar sesión; al volver,
  reanudarla.
- **RF-009** — CUANDO el usuario cierra sesión, el cliente DEBE tratar la réplica local
  según D-5.
- **RF-010** — Un borrado (soft delete) y una restauración DEBEN propagarse a los demás
  dispositivos como cualquier otra edición.

## 5. Casos límite y manejo de errores
- Dos pestañas del mismo navegador sobre la misma réplica (R-10).
- Cuota de IndexedDB agotada o el navegador borra el almacenamiento (R-11).
- Cliente con una versión antigua del esquema escribe un documento viejo (R-9).
- Corte de red a mitad de un lote: la replicación debe ser reanudable e idempotente
  (checkpoints `_local`).
- CouchDB caído con red disponible: mismo estado que "sin conexión", sin bucle agresivo de
  reintentos (backoff). [NEEDS CLARIFICATION: confirmar]
- Bóveda borrada en un dispositivo y editada en otro sin conexión (conflicto borrado vs.
  edición; regla en D-3).

## 6. Riesgos identificados
| ID | Riesgo | Impacto | Mitigación propuesta |
|---|---|---|---|
| R-1 | La réplica escribe directo en CouchDB y se salta los invariantes de 0003 (nombre único, validación, id canónico) | Alto: datos inválidos o duplicados en el servidor | Todo push pasa por el backend, que valida (D-1, D-2) |
| R-2 | Exponer CouchDB o su credencial admin al navegador para poder replicar | Crítico: un usuario leería o escribiría todas las bases (rompe P2) | Nunca credencial admin en el cliente; canal limitado a la base del token (D-1) |
| R-3 | CouchDB elige un "ganador" de conflicto determinista pero arbitrario y oculta el perdedor en `_conflicts` (hazard 1) | Alto: pérdida silenciosa de una edición | Detectar `_conflicts` y resolver explícitamente (D-3); tests de conflicto con dos réplicas reales (P5) |
| R-4 | El usuario trabaja sobre datos viejos sin saberlo (hazard 3) | Medio | Indicador de estado y hora de última sync (RF-003) |
| R-5 | Datos del usuario quedan en el dispositivo (equipo compartido, sesión cerrada) | Medio/alto | Política de borrado al cerrar sesión (D-5) |
| R-6 | El JWT de 24 h caduca estando sin conexión y hay cambios pendientes | Medio | Conservar cambios y reanudar tras login (RF-008) |
| R-7 | Las lápidas y revisiones crecen sin límite; la futura purga (RF-016) borra en el servidor algo que una réplica vieja reintroduce | Medio | Purga coordinada con `_purge` + aviso a réplicas; se decide con la feature de purga |
| R-8 | Resolver conflictos por "última escritura" con relojes de dispositivos desajustados | Medio | No depender del reloj del cliente para ganar (D-3) |
| R-9 | Clientes con versiones distintas del esquema de documento | Medio | Campo de versión de esquema y rechazo/migración en el servidor (Fase 2) |
| R-10 | Varias pestañas replicando a la vez la misma base local | Bajo/medio | Un solo replicador por navegador (coordinación entre pestañas, Fase 2) |
| R-11 | Cuota de almacenamiento del navegador | Bajo hoy (sólo bóvedas) / alto con documentos | Medir; avisar al usuario; decidir con la feature de documentos |
| R-12 | Replicar las reservas `vault-name:*` permitiría a un cliente manipular la unicidad | Alto | No replicarlas; el servidor las gestiona (D-4) |

## 7. Decisiones necesarias (para el usuario)
| ID | Pregunta | Alternativas | Recomendación del agente |
|---|---|---|---|
| D-1 | ¿Por dónde replica el navegador? | (a) **Proxy en el backend** `/sync/…` que exige la cookie de sesión y reenvía sólo a `synapse_user_{id}` del token, sólo con los endpoints de replicación; (b) CouchDB expuesto vía Caddy con autenticación JWT nativa de CouchDB 3 y `_security` por base; (c) sin replicación nativa: el cliente lee y escribe sólo por la API REST y mantiene su copia local él mismo | **(a)**: mismo origen, sin CORS, P2/P3 en un punto, CouchDB sigue en la red interna. (b) amplía la superficie (CouchDB a Internet, usuarios CouchDB por persona); (c) obliga a reimplementar `_changes` y checkpoints |
| D-2 | ¿Se escribe sin conexión? | (a) **Lectura y escritura offline**: el proxy valida cada documento del push con las reglas de 0003 y rechaza por documento (RF-006); (b) sólo lectura offline: las escrituras exigen conexión y siguen yendo por la API REST; (c) escritura offline encolada (outbox) que se reenvía por la API REST con `If-Match` | **(a)** si el objetivo es offline-first real; **(b)** si se prefiere entregar antes y con menos riesgo, como primer paso. (c) duplica la lógica de cola que ya da la replicación |
| D-3 | ¿Cómo se resuelve un conflicto? | (a) **El usuario elige** entre las versiones (o combina campo a campo) en una vista de conflictos; (b) automático campo a campo (`name`/`description`/`tags`) y al usuario sólo si chocan en el mismo campo; (c) última escritura gana por `updated_at` | **(b)** con caída a (a): resuelve solo lo obvio (cambios en campos distintos, unión de `tags`) y pregunta lo demás. (c) pierde datos y depende del reloj (R-8). Borrado vs. edición: **gana la edición y la bóveda queda restaurada**, a confirmar |
| D-4 | ¿Qué documentos se replican? | (a) **sólo `vault:*`** (y en el futuro los documentos de bóveda); reservas `vault-name:*` y documentos de diseño se quedan en el servidor (filtro en el proxy); (b) la base completa | **(a)**, por R-12 |
| D-5 | ¿Qué pasa con la réplica local al cerrar sesión? | (a) **Se borra** siempre; (b) se conserva (arranque rápido, y sin conexión se puede volver a leer); (c) opción del usuario ("recordar este dispositivo") | **(a)** por seguridad (R-5); con cambios pendientes, avisar antes de borrar |
| D-6 | ¿La app debe abrir sin conexión desde cero (recarga sin red)? | (a) sí: service worker que cachea la SPA; (b) no: offline sólo con la pestaña ya abierta | **(b)** en esta feature; (a) como feature aparte de PWA |

## 8. Registro de decisiones y descartes
| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| — (pendiente de D-1…D-6) | — | — | — |

## 9. Requisitos no funcionales (RNF) — borrador
- **RNF-001** — Con conexión, un cambio debe aparecer en otro dispositivo del mismo
  usuario en ≤ 5 s (replicación continua). [NEEDS CLARIFICATION: ¿objetivo aceptable?]
- **RNF-002** — Tests de sincronización con **dos réplicas reales** contra CouchDB real
  (P5): sin mocks del protocolo de replicación.

## Marcadores abiertos
- `[NEEDS CLARIFICATION: D-1 — canal de replicación (proxy en backend / CouchDB expuesto con JWT / sin replicación nativa)]`
- `[NEEDS CLARIFICATION: D-2 — escritura offline (sí con validación en el push / sólo lectura / outbox por API REST)]`
- `[NEEDS CLARIFICATION: D-3 — resolución de conflictos (usuario elige / automático por campo con caída al usuario / última escritura) y regla borrado vs. edición]`
- `[NEEDS CLARIFICATION: D-4 — documentos replicados (sólo vault:* / base completa)]`
- `[NEEDS CLARIFICATION: D-5 — réplica local al cerrar sesión (borrar / conservar / opción del usuario)]`
- `[NEEDS CLARIFICATION: D-6 — apertura sin red desde cero (service worker ahora / feature aparte)]`
- `[NEEDS CLARIFICATION: §5 backoff con CouchDB caído y RNF-001 (≤ 5 s)]`
