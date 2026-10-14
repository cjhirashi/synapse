---
id: SPEC-0005
tipo: spec
feature: 0005-sync
estado: verified      # draft | in-review | approved | implemented | verified | deprecated
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: 4a7b740   # cierre de la enmienda 5 (VG-1…VG-4)
anchor_mode: advisory    # advisory | strict  (pasa a strict en implemented/verified)
covers:                  # fijado en PLAN-0005 (GATE 2, 2026-10-13)
  - backend/app/routers/sync.py
  - backend/app/services/sync_*.py
  - backend/app/core/ports/replication_port.py
  - backend/app/adapters/replication_repository.py
  - backend/tests/test_sync*.py
  - backend/tests/fixtures/vault_rules_cases.json
  - frontend/src/sync/**
  - frontend/scripts/sync-integration.sh
  - .harness/specs/0005-sync/contracts/**
  - .harness/specs/0005-sync/diagrams/**
# --- aprobaciones humanas ---
aprobaciones:
  decisiones_d1_d6: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-13 }   # §8, ADR-002, ADR-003
  aclaraciones_c1_c4: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-13 } # §8
  fase_1: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-13 }             # «así es»
  fase_2: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-13 }             # PLAN-0005, P-1 (a) y P-2
  enmienda_1: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-13 }         # verificación adversarial VC-1…VC-8
  enmienda_2: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-14 }         # verificación 2, menores VD-1…VD-5
  enmienda_3: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-14 }         # verificación 3, VE-1 opción (a), VE-2…VE-5
  enmienda_4: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-14 }         # verificación 4, VF-4 opción (b), VF-1…VF-3
  enmienda_5: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-14 }         # menores de la verificación 5, VG-1…VG-4 (pruebas y texto)
  verified: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-14 }           # verificación 5 APPROVED con menores; VG-1…VG-5 → backlog 9
actualizado: 2026-10-14
---

# SPEC-0005 · Sincronización PouchDB ↔ CouchDB (offline-first)

> Fase 1 (Specify) cerrada tras la elicitación con el usuario (`method.md §3`). Nace del hazard 1
> de `state.md` ("Conflictos PouchDB ↔ CouchDB"), del hazard 3 ("Offline → datos
> obsoletos") y de la observación de 0003 (el servidor sólo acepta ids UUID canónicos).
>
> **GATE 1 aprobado (2026-10-13):** el usuario confirmó «así es».
> **GATE 2 aprobado (2026-10-13):** `plan.md` con P-1 (a) y P-2; `covers` fijados. Sigue la
> Fase 3 (`tasks.md`).
>
> **Tanda 1 (2026-10-13):** el usuario aprobó las recomendaciones D-1…D-6 (§8; ADR-002 y
> ADR-003). **Tanda 2 (2026-10-13):** aprobó C-1…C-4 (§8). Sin marcadores de aclaración abiertos.
>
> **Enmienda 1 2026-10-13** (verificación adversarial, VC-1…VC-8; aprobada por el usuario):
> RF-003 cubre los identificadores de checkpoint fuera del formato de PouchDB (`.` y `..`
> incluidos); RF-015 exige que dos dispositivos que guardan la misma resolución produzcan
> la misma revisión; RF-017 decide el aviso con el estado actual de la réplica; §5 añade
> la resolución simultánea en dos dispositivos y las entradas mal formadas del cliente
> (siempre 4xx, nunca 503). El *cómo* está en PLAN-0005 §10.
>
> **Enmienda 2 2026-10-14** (verificación 2 APPROVED con menores VD-1…VD-5; aprobada por el
> usuario): RF-017 precisa que, si el estado de la réplica no puede leerse al pedir la
> salida, el cliente avisa como si hubiera cambios pendientes; §5 añade ese caso. El *cómo*
> está en PLAN-0005 §11.
>
> **Enmienda 3 2026-10-14** (verificación 3 REJECTED por VE-1; el usuario eligió la opción
> (a)): RF-017 precisa el aviso de la réplica ilegible y la salida al login cuando la réplica
> no puede borrarse; §5 añade ese caso. El *cómo* está en PLAN-0005 §12.
>
> **Enmienda 4 2026-10-14** (verificación 4 APPROVED con menores VF-1…VF-4; el usuario
> eligió la opción (b) para VF-4): RF-017 precisa que la copia descartada que no pudo
> borrarse nunca vuelve a usarse, tampoco por el mismo usuario; §5 añade ese caso. El *cómo*
> está en PLAN-0005 §13.
>
> **Enmienda 5 2026-10-14** (verificación 5 APPROVED con menores VG-1…VG-5; el usuario pasó
> 0005 a `verified` y aprobó corregir VG-1…VG-4): RF-017 remite al riesgo residual de §5,
> que añade los dos dobles fallos del almacenamiento. Sin cambio de comportamiento. El *cómo*
> está en PLAN-0005 §14.

## 1. Contexto del dominio
- **Problema:** el usuario debe poder leer y editar sus bóvedas sin conexión y que, al
  volver la red, sus cambios lleguen al servidor y a sus otros dispositivos sin perder datos.
- **Punto de partida (hechos del repo, revisión `5704bf9`):**
  - Cada usuario tiene una base CouchDB `synapse_user_{id}` creada en el alta (SPEC-0002);
    las bóvedas son documentos `vault:{uuid}` en ella (SPEC-0003).
  - CouchDB sólo se usa con la credencial **admin**, desde la red interna
    `synapse_internal`; no hay usuarios CouchDB por persona ni `_security` por base.
  - La sesión es una cookie httpOnly con JWT de 24 h (SPEC-0002); la SPA y la API
    comparten origen (Caddy externo en producción, Vite en desarrollo; sin nginx, por el usuario en el GATE 3).
  - Los invariantes de 0003 los aplica el **servicio** del backend, no CouchDB: validación
    de campos (RF-005/006/023), nombre único con reservas `vault-name:{name_key}` (RF-007,
    RF-021, RF-025, RF-027), id canónico (RF-014/022), soft delete con `deleted_at`.
- **Diseño elegido (§8):** el navegador replica a través de un **proxy `/sync` del
  backend** que valida cada documento del push y sólo deja pasar `vault:*` (ADR-002); los
  conflictos se resuelven solos por campo y, si chocan, decide el usuario (ADR-003).
- **Dependencias:** SPEC-0002 (sesión, `must_change_password`), SPEC-0003 (modelo de bóveda
  e invariantes), SPEC-0004 (errores RFC 9457). Cliente: PouchDB sobre IndexedDB.

## 2. Alcance
### En alcance
- Proxy de replicación `/sync` en el backend, limitado a la base del usuario del token,
  con validación de cada documento del push y filtro a `vault:*`.
- Réplica local PouchDB en el navegador de la base del propio usuario.
- Lectura **y escritura** de bóvedas sin conexión (crear, editar, borrar, restaurar).
- Sincronización continua y automática en ambos sentidos al haber red.
- Rechazos por documento visibles y corregibles; conflictos resueltos por campo o por el
  usuario en una vista de conflictos.
- Indicador de estado: en línea / sin conexión / cambios pendientes / rechazos / conflictos,
  con la hora de la última sincronización correcta.
- Borrado de la réplica local al cerrar sesión.
- Diagrama Archify del flujo (`diagrams/`).
### Fuera de alcance
- Documentos dentro de las bóvedas (la feature de documentos no existe aún); el filtro y
  la validación deben poder ampliarse a ellos sin rehacer el canal.
- Abrir la app sin red desde cero (service worker / PWA): feature aparte (D-6). El modo sin
  conexión aplica a una pestaña ya cargada.
- Compartir bóvedas o bases entre usuarios.
- Edición colaborativa en tiempo real (CRDT, cursores, WebSocket propio).
- Sincronización para los agentes OpenClaw: siguen usando la API REST (`state.md`).
- Purga de la papelera a 30 días (RF-016 de 0003, feature aparte; ver R-7).
- Exponer CouchDB fuera de la red interna o crear usuarios CouchDB por persona (ADR-002).

## 3. Modelo de datos y contratos de E/S  ← INVENTARIO DE FRONTERAS
| Frontera | Dirección | Tipo | Contrato en `contracts/` |
|---|---|---|---|
| `/sync/…` — subconjunto del protocolo de replicación CouchDB (info de la base, `_changes`, `_revs_diff`, `_bulk_docs`, `_bulk_get`, `_all_docs`, `_local/{checkpoint}`) | entrada/salida | HTTP | `openapi.yaml` (Fase 2: rutas exactas y cuerpos) |
| Errores del canal (sin sesión, base ajena, ruta no permitida, almacén caído) | salida | REST | `application/problem+json` (SPEC-0004) |
| Resultado por documento del push (aceptado / rechazado con motivo) | salida | JSON | formato de respuesta de `_bulk_docs` de CouchDB, con el motivo de rechazo en `reason` |
| Documentos `vault:*` replicados | entrada/salida | JSON | esquema `vault` de `0003-vault-crud/contracts/` |

- La base nunca aparece en la URL que controla el cliente: el proxy la deriva del token.
- Ids admitidos en el push: `vault:{uuid}` canónico y `_local/*` (checkpoints). Cualquier
  otro id se rechaza.
- `vault-name:*` y `_design/*` no se replican en ningún sentido.

## 4. Criterios de aceptación (EARS)
**Canal y aislamiento**
- **RF-001** — El proxy `/sync` DEBE operar sólo sobre la base `synapse_user_{id}` del
  usuario de la sesión, con el `{id}` tomado del token y nunca de la petición (P2).
- **RF-002** — SI una petición a `/sync` no trae una sesión válida ENTONCES el sistema DEBE
  responder 401 `application/problem+json`; SI el usuario tiene `must_change_password`
  ENTONCES DEBE responder 403, como el resto de endpoints protegidos (SPEC-0002 RF-019).
- **RF-003** — SI una petición a `/sync` pide un endpoint de CouchDB fuera del subconjunto
  de §3 ENTONCES el sistema DEBE responder 404 `application/problem+json` sin reenviarla.
  Un checkpoint `_local` cuyo identificador no tiene el formato de los de PouchDB
  (incluidos `.` y `..`, en claro o codificados) es un endpoint fuera del subconjunto
  (enmienda 1).
- **RF-004** — El proxy DEBE devolver en `_changes`, `_all_docs` y `_bulk_get` sólo
  documentos `vault:*`; nunca `vault-name:*` ni `_design/*`.

**Push validado**
- **RF-005** — CUANDO el push trae un documento `vault:*` el sistema DEBE aplicarle las
  mismas reglas que la API REST de 0003 (campos, normalización, id canónico, nombre único
  entre bóvedas activas, `deleted_at`) y guardar sólo los que las cumplen.
- **RF-006** — SI un documento del push incumple una regla ENTONCES el sistema DEBE
  rechazar ese documento (no el lote) con su motivo, y el cliente DEBE conservar el cambio
  local, marcarlo como rechazado con el motivo y ofrecer corregirlo; nunca descartarlo en
  silencio.
- **RF-007** — SI el push trae un id distinto de `vault:{uuid}` canónico o `_local/*`
  ENTONCES el sistema DEBE rechazar ese documento.
- **RF-008** — CUANDO el push guarda, renombra, borra o restaura una bóveda el sistema DEBE
  mantener las reservas de nombre igual que la API REST, de modo que la API y el canal de
  sync nunca dejen dos bóvedas activas con nombres equivalentes.

**Cliente sin conexión**
- **RF-009** — MIENTRAS no hay conexión, la UI DEBE mostrar y permitir editar las bóvedas
  de la réplica local, con el estado "sin conexión" y la hora de la última sincronización
  correcta.
- **RF-010** — CUANDO vuelve la conexión, el cliente DEBE reanudar la sincronización sin
  acción del usuario y mostrar "cambios pendientes" hasta que el servidor los confirme.
- **RF-019** — SI `/sync` responde 503 o no responde ENTONCES el cliente DEBE mostrar "sin
  conexión" y reintentar con espera creciente (1 s, 2 s, 4 s… hasta un máximo de 60 s entre
  intentos), y volver a la espera inicial tras una sincronización correcta.
- **RF-011** — CUANDO una bóveda se borra o se restaura en un dispositivo, el cambio DEBE
  llegar a los demás dispositivos del usuario como cualquier otra edición.

**Conflictos (ADR-003)**
- **RF-012** — CUANDO el cliente detecta una bóveda con revisiones en conflicto, DEBE
  compararlas con su versión común (ancestro) y combinarlas solo si cambiaron campos
  distintos (`name`, `description`, `tags`), guardando la versión combinada como una
  edición nueva. En `tags` cuentan por separado las etiquetas añadidas y las quitadas
  respecto al ancestro, de modo que una etiqueta quitada en un dispositivo no reaparezca.
- **RF-013** — SI las versiones en conflicto cambiaron el mismo campo, o el ancestro ya no
  está disponible, ENTONCES el cliente
  DEBE mostrar ambas en una vista de conflictos y conservar las dos hasta que el usuario
  elija o combine; ningún orden de sincronización puede perder una versión sin decisión
  explícita.
- **RF-014** — SI una versión en conflicto borra la bóveda y otra la edita ENTONCES gana la
  edición y la bóveda DEBE quedar restaurada.
- **RF-015** — CUANDO se guarda una resolución, DEBE pasar por la validación del push
  (RF-005); si la incumple, sigue el flujo de rechazo (RF-006). Dos dispositivos que
  guardan la misma resolución del mismo conflicto DEBEN producir la misma revisión, de
  modo que converjan sin rechazos ni conflictos nuevos (enmienda 1).

**Sesión**
- **RF-016** — SI la sesión caduca durante la sincronización ENTONCES el cliente DEBE
  detenerla, conservar los cambios pendientes y pedir iniciar sesión; tras iniciarla con el
  mismo usuario, DEBE reanudarla.
- **RF-017** — CUANDO el usuario cierra sesión, el cliente DEBE borrar la réplica local;
  SI hay cambios pendientes ENTONCES DEBE avisar antes de borrarla con las opciones
  "Sincronizar y salir", "Salir y descartar" y "Cancelar" (sin conexión, sólo las dos
  últimas). "Sincronizar y salir" cierra la sesión sólo cuando el servidor confirma todos
  los cambios; si alguno se rechaza o falla, vuelve al aviso. Si hay o no cambios pendientes
  se decide con el estado de la réplica en el momento de pedir la salida (incluidos un
  cambio recién escrito y un rechazo aún sin registrar), no con el último estado mostrado
  (enmienda 1); si ese estado no puede leerse, cuenta como cambios pendientes y se avisa
  (enmienda 2), diciendo que no se pudo comprobar y sin "Sincronizar y salir", que tampoco
  podría leer la réplica (enmienda 3). SI el servidor ya cerró la sesión pero la réplica no
  puede borrarse ENTONCES el cliente DEBE ir igualmente al login y avisar "No se pudo borrar
  la copia local de este dispositivo" (enmienda 3). La copia que se descarta al salir nunca
  vuelve a usarse: el cliente anota en el dispositivo que su borrado está pendiente y el
  próximo inicio de sesión, del mismo usuario o de otro, termina de borrarla antes de
  abrirla y replicar; los cambios descartados no llegan al servidor (enmienda 4), salvo
  el doble fallo del almacenamiento que §5 deja como riesgo residual (enmienda 5).
- **RF-018** — SI inicia sesión un usuario distinto del dueño de la réplica local ENTONCES
  el cliente DEBE borrarla antes de replicar.

## 5. Casos límite y manejo de errores
- Corte de red a mitad de un lote: la replicación se reanuda desde el último checkpoint
  `_local`; reenviar el mismo lote no duplica nada (idempotencia por `_rev`).
- CouchDB caído con red disponible: el proxy responde 503 `application/problem+json` (como
  RF-017 de 0003) y el cliente lo trata como "sin conexión", con reintentos (RF-019).
- Dos bóvedas creadas sin conexión con el mismo nombre en dos dispositivos: la segunda en
  llegar se rechaza (RF-006) y el usuario la renombra.
- Dos pestañas del mismo navegador sobre la misma réplica (R-10): una sola replica.
- Cuota de IndexedDB agotada o almacenamiento borrado por el navegador (R-11): el cliente
  avisa; con almacenamiento borrado vuelve a replicar desde el servidor.
- Versión antigua del cliente escribe un documento viejo (R-9): la validación del push lo
  rechaza con motivo.
- Dos dispositivos resuelven a la vez el mismo conflicto (enmienda 1): producen las mismas
  revisiones (RF-015) y convergen sin rechazos; si sus resoluciones difieren sólo en
  `updated_at`, la combinación las funde sin pedir nada al usuario.
- Entradas mal formadas del cliente en el canal (revisiones que no son hexadecimales,
  campos reservados `_*` no admitidos en un checkpoint, `_id` del checkpoint distinto del de
  la ruta) (enmienda 1): el proxy responde 4xx `application/problem+json` sin reenviarlas;
  nunca 503, que queda para el almacén no disponible.
- La réplica local no puede leerse al pedir la salida (IndexedDB con error) (enmienda 2):
  el cliente no puede afirmar que todo esté confirmado, así que avisa con las opciones de
  RF-017; nunca sale sin aviso ni deja la petición sin respuesta.
- La réplica no puede borrarse tras cerrar la sesión en el servidor (IndexedDB con error)
  (enmienda 3): la sesión ya no existe, así que el cliente no se queda en "Cerrando sesión…"
  ni bloquea al usuario; va al login con el aviso de RF-017. Los datos siguen en el
  dispositivo hasta el próximo inicio de sesión (R-5): RF-018 los borra si es otro usuario.
- La réplica descartada no pudo borrarse y vuelve el mismo usuario (enmienda 4): el próximo
  inicio de sesión la borra antes de replicar (RF-017), así que lo descartado no se sube; si
  ese borrado también falla, el cliente muestra el error de la réplica y no replica. Si el
  dispositivo no deja anotar el borrado pendiente (almacenamiento del sitio bloqueado), el
  aviso del login no promete el borrado; ese bloqueo impide también abrir la réplica (R-5).
- Riesgo residual de la marca de borrado pendiente (enmienda 5): si la marca no puede
  anotarse por otra causa que el bloqueo del sitio (`localStorage` lleno) y además falla el
  borrado, el mismo usuario que vuelve reutiliza la réplica descartada y sus cambios se suben;
  si la marca se lee pero no puede quitarse tras borrar, la siguiente apertura borra una
  réplica ya en uso y se pierde lo que tuviera sin confirmar. Ambos exigen dos fallos seguidos
  del almacenamiento del dispositivo; se aceptan sin código propio (PLAN-0005 §14).

## 6. Riesgos identificados
| ID | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R-1 | La réplica se salta los invariantes de 0003 | Alto | Push validado en el proxy (RF-005…RF-008) |
| R-2 | Exponer CouchDB o la credencial admin al navegador | Crítico (rompe P2) | La credencial no sale del backend; base sólo del token (RF-001, ADR-002) |
| R-3 | CouchDB oculta el perdedor de un conflicto en `_conflicts` (hazard 1) | Alto | Detección y resolución explícita (RF-012…RF-015); tests con dos réplicas reales (RNF-002) |
| R-4 | Trabajar sobre datos viejos sin saberlo (hazard 3) | Medio | Indicador de estado y hora de última sync (RF-009) |
| R-5 | Datos del usuario quedan en el dispositivo | Medio/alto | Borrado al cerrar sesión o al cambiar de usuario (RF-017, RF-018) |
| R-6 | El JWT de 24 h caduca sin conexión con cambios pendientes | Medio | Conservar y reanudar tras login (RF-016) |
| R-7 | Lápidas y revisiones crecen; la futura purga puede ser revertida por una réplica vieja | Medio | Se decide con la feature de purga (RF-016 de 0003) |
| R-8 | Relojes de dispositivos desajustados | Medio | Ninguna resolución depende del reloj (ADR-003) |
| R-9 | Clientes con versiones distintas del esquema | Medio | Rechazo por validación; versión de esquema en el plan |
| R-10 | Varias pestañas replicando la misma base local | Bajo/medio | Un solo replicador por navegador (plan) |
| R-11 | Cuota de almacenamiento del navegador | Bajo hoy / alto con documentos | Medir y avisar; revisar con la feature de documentos |
| R-12 | Replicar las reservas `vault-name:*` | Alto | No se replican (RF-004, RF-007) |
| R-13 | El proxy añade carga y latencia al backend | Bajo/medio | Medir contra RNF-001 en la verificación |

## 7. Requisitos no funcionales (RNF)
- **RNF-001** — Con conexión, un cambio guardado en un dispositivo DEBE aparecer en otro
  dispositivo del mismo usuario en ≤ 5 s, medido en la verificación con dos réplicas
  reales (RNF-002).
- **RNF-002** — Los tests de sincronización DEBEN usar dos réplicas reales contra CouchDB
  real a través del proxy (P5): sin mocks del protocolo de replicación.
- **RNF-003** — Los tests de aislamiento DEBEN probar que un usuario no puede leer ni
  escribir la base de otro por `/sync` (P2), igual que en 0002/0003.

## 8. Registro de decisiones y descartes
| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| D-1 · Replicación por proxy `/sync` en el backend | P2/P3 en un punto, CouchDB sigue interno, mismo origen | CouchDB expuesto con JWT nativo y `_security` por base; sin replicación nativa (copia vía API REST) | ADR-002 |
| D-2 · Lectura y escritura sin conexión, con validación por documento en el push | Offline-first real sin saltarse las reglas de 0003 | Sólo lectura offline; outbox reenviado por la API REST | ADR-002 |
| D-3 · Conflictos: automático por campo, el usuario decide si chocan; borrado vs. edición → gana la edición | Sin pérdida silenciosa, intervención mínima | El usuario elige siempre; última escritura gana (pierde datos, depende del reloj) | ADR-003 |
| D-4 · Sólo se replican `vault:*` | Las reservas de nombre y el diseño son del servidor | Replicar la base completa (R-12) | ADR-002 |
| D-5 · Borrar la réplica local al cerrar sesión, avisando si hay pendientes | Equipos compartidos (R-5) | Conservarla; opción "recordar este dispositivo" | — |
| D-6 · Sin service worker en esta feature | Mantener el alcance; PWA aparte | Cachear la SPA ahora | — |
| C-1 · CouchDB caído = sin conexión, reintentos 1 s → 60 s (RF-019) | No saturar el backend; el usuario sigue trabajando en local | Reintento fijo; error bloqueante | — |
| C-2 · Propagación ≤ 5 s con conexión (RNF-001) | Medible con dos réplicas reales | Sin objetivo de latencia | — |
| C-3 · Merge contra el ancestro; tags como altas/bajas; sin ancestro → decide el usuario (RF-012, RF-013) | Una etiqueta quitada no reaparece; nada se combina a ciegas | Unión de etiquetas (resucita las quitadas); comparar sólo las dos versiones | ADR-003 |
| C-4 · Aviso al salir: sincronizar y salir / salir y descartar / cancelar (RF-017) | No perder cambios sin decisión explícita | Bloquear la salida hasta sincronizar; descartar sin avisar | — |

