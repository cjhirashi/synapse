---
id: SPEC-0004
tipo: spec
feature: 0004-api-problem-details
estado: implemented
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: 4f784de   # cierre tras las correcciones de la enmienda 3
anchor_mode: advisory
covers:
  - backend/app/core/problems.py
  - backend/tests/test_problem*.py
  - frontend/src/api/problems.ts
  - frontend/src/api/problems.test.ts
  - .harness/specs/0004-api-problem-details/contracts/**
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-11 }
  fase_2: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-11 }
  enmienda_1: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-11 }
  enmienda_2: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-12 }
  enmienda_3: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-12 }
  enmienda_4: { por: "Carlos Jiménez (cjhirashi)", fecha: 2026-10-12 }
actualizado: 2026-10-12
---

# SPEC-0004 · Errores de la API con Problem Details (RFC 9457)

> Fase 1 (Specify) **cerrada**: tandas 1 (Q1–Q6) y 2 (Q7–Q10) decididas por el usuario;
> GATES 1 y 2 aprobados. El *cómo* está en `plan.md`.
>
> **Enmienda 1 2026-10-11** (verificación adversarial, V-3/V-5/V-6/V-7): RF-011, RF-013 y
> RF-009 precisados; nuevo caso límite de códigos sin frase estándar. Aprobada por el usuario.
>
> **Enmienda 2 2026-10-12** (re-verificación adversarial, W-1/W-2/W-3): alcance de la
> garantía de RF-011 precisado (las plantillas propias son código del proyecto y deben ser
> literales); los límites de colecciones conservan su texto; redacción del 500 de fallback.
> Aprobada por el usuario.
>
> **Enmienda 3 2026-10-12** (W-1 y W-4 resueltos de raíz, a petición del usuario): el texto
> publicable de un error de validación propio sale de un catálogo, nunca del mensaje con que
> se lanzó; sólo el catálogo construye errores de pydantic en `app/`; «emitido ⊆ declarado»
> se comprueba en toda la suite. Sustituye las decisiones E2 · W-1 y E2 · W-4.
>
> **Enmienda 4 2026-10-12** (re-verificación 3, X-1…X-4): en `app/` nada fuera del catálogo
> y del traductor puede tocar `pydantic_core` ni construir un `ValidationError`; un código
> del catálogo nunca coincide con un tipo de pydantic; «emitido ⊆ declarado» se resuelve
> por la operación que atendió la petición, no por la primera plantilla que casa la ruta.

## 1. Contexto del dominio
- **Problema:** la API responde los errores con el `{"detail": ...}` de FastAPI, cada
  uno distinto, y la Constitución (Art. 6) exige Problem Details (RFC 9457); los
  clientes (frontend y agentes OpenClaw) necesitan un formato único y un identificador
  estable del tipo de error para decidir qué hacer.
- **Límites:** formato de las respuestas de error de **toda** la API REST del backend,
  incluidas las que genera el propio framework. No cambia qué endpoints existen ni qué
  código HTTP devuelve cada caso.
- **Estado actual (brownfield):**
  - `services/auth_service.py` construye y lanza `HTTPException` (la capa de servicio
    conoce HTTP, en contra de ADR-001); `core/dependencies.py` y `routers/` también.
  - `main.py` traduce `ProvisioningError` a 503 con `{"detail"}`.
  - Los 422 de validación de pydantic salen con la lista `detail` de FastAPI.
  - `frontend/src/api/auth.ts` lee `body.detail`.
  - El contrato OpenAPI no declara respuestas de error (residual de la verificación de 0002).
- **Clientes:** ningún agente ni cliente externo usa todavía la API (confirmado al
  aceptar Q6); el único cliente es el frontend de este repo.
- **Consumidor inmediato:** SPEC-0003 (bóvedas) no se implementa hasta que esta feature
  esté mergeada; registrará sus propios tipos en el mismo catálogo.

## 2. Alcance
### En alcance
- Manejador global que convierte **todo** error de la API en `application/problem+json`:
  errores propios, validación (422), ruta inexistente (404), método no permitido (405) y
  errores no controlados (500).
- **Errores de dominio** en `core/errors.py`; los servicios y dependencias dejan de crear
  `HTTPException`. La traducción error → (`type`, `title`, código) vive en un solo registro.
- Migrar los errores existentes de auth y admin, conservando sus códigos HTTP.
- Contrato OpenAPI: esquema `Problem` y respuestas de error declaradas en cada endpoint.
- Frontend: `ApiError` con `type`, `title`, `detail`, `errors`; las pantallas mantienen
  sus mensajes actuales.
### Fuera de alcance
- Cambiar los códigos HTTP o la lógica de cualquier endpoint.
- Convivencia con el formato anterior o versionado de la API (`/v2`): cambio en el lugar.
- Páginas web que documenten cada `type` (las URN no se resuelven).
- Observabilidad completa (ids de correlación, logging estructurado): Art. 7 sin definir.
- Traducción de mensajes en el backend (el frontend traduce por `type`).

## 3. Modelo de datos y contratos de E/S
| Frontera | Dirección | Tipo | Contrato en `contracts/` |
|---|---|---|---|
| Toda respuesta de error de la API | salida | REST | `openapi.yaml#/components/schemas/Problem` + respuestas de error de cada `path` |

**Problem (RFC 9457)** — `Content-Type: application/problem+json`:

| Campo | Tipo | Regla |
|---|---|---|
| `type` | string (URI) | `urn:synapse:problem:<slug>` para errores propios; `about:blank` para genéricos (404 de ruta, 405, 500 y otros del framework) |
| `title` | string | en inglés; fijo por `type` (con `about:blank`, la frase estándar del código HTTP) |
| `status` | integer | igual al código HTTP de la respuesta |
| `detail` | string | en inglés; explica este caso concreto |
| `instance` | string | ruta de la petición (sin query) |
| `errors` | array | sólo en 422; cada entrada lleva `detail` y **una** ubicación: `pointer` (JSON Pointer sobre el cuerpo, p. ej. `#/name`), `parameter` (query o ruta, p. ej. `limit`) o `header` (p. ej. `If-Match`). Nunca incluye el valor enviado |

**Catálogo inicial (errores ya existentes de auth y admin).** La fuente única del catálogo
es el código: cada error de dominio de `core/errors.py` declara su `slug`, `title` y
código HTTP (Art. 12). Esta tabla es el estado inicial; cada feature posterior documenta
en su propio spec los tipos que añade.

| `type` (`urn:synapse:problem:…`) | Código | Cuándo |
|---|---|---|
| `not-authenticated` | 401 | sin cookie de sesión |
| `invalid-token` | 401 | token inválido, caducado, de versión anterior o usuario inactivo |
| `invalid-credentials` | 401 | login fallido (mismo cuerpo exista o no el email) |
| `invalid-refresh-token` | 401 | refresh inexistente, revocado, caducado, reutilizado o perdido en carrera |
| `admin-required` | 403 | endpoint de admin con usuario guest |
| `password-change-required` | 403 | usuario con `must_change_password` |
| `wrong-current-password` | 400 | cambio de contraseña con la actual incorrecta |
| `email-taken` | 409 | alta de usuario con email existente |
| `validation-error` | 422 | cuerpo o parámetros inválidos, incluida la política de contraseña |
| `storage-unavailable` | 503 | CouchDB no responde al aprovisionar |

## 4. Criterios de aceptación (EARS)

**Formato**
- **RF-001** — CUANDO la API responde con un código 4xx o 5xx el sistema DEBE enviar un
  cuerpo Problem Details con `Content-Type: application/problem+json`, también para
  rutas inexistentes (404), métodos no permitidos (405) y errores no controlados (500).
- **RF-002** — CUANDO el sistema envía un Problem Details DEBE incluir `type`, `title`,
  `status` (igual al código HTTP) e `instance` (ruta de la petición).
- **RF-003** — CUANDO el error es propio del dominio el `type` DEBE ser
  `urn:synapse:problem:<slug>` del catálogo y su `title` DEBE ser siempre el mismo para
  ese `type`; CUANDO es genérico del framework el `type` DEBE ser `about:blank` y el
  `title` la frase estándar del código HTTP.
- **RF-004** — SI un error no está controlado ENTONCES el sistema DEBE responder 500 con
  `type: about:blank` y un `detail` genérico, sin trazas, mensajes de excepción ni datos
  internos.
- **RF-005** — SI la petición no pasa la validación ENTONCES el sistema DEBE responder 422
  con `type` `validation-error` y una entrada en `errors` por cada fallo, con su `detail`
  y su ubicación: `pointer` para el cuerpo, `parameter` para query o ruta, `header` para
  cabeceras.
- **RF-011** — CUANDO el sistema describe un fallo de validación NO DEBE incluir el valor
  enviado por el cliente ni datos internos del validador (`input`, `ctx`) en la respuesta,
  tampoco dentro del texto `detail` de cada entrada de `errors`.
- **RF-012** — SI ocurre un error no controlado ENTONCES el sistema DEBE registrarlo en el
  log del servidor con su traza completa.
- **RF-013** — SI falla la construcción del propio Problem Details ENTONCES el sistema DEBE
  responder un 500 con `application/problem+json`, `type`, `title`, `status` y `detail`
  fijos e `instance` (ruta de la petición).
- **RF-014** — Cada `type` del catálogo DEBE ser único y tener la forma
  `urn:synapse:problem:<slug>` (slug en minúsculas con guiones).

**Migración de auth y admin**
- **RF-006** — El sistema DEBE conservar el código HTTP actual de cada respuesta de error
  de auth y admin y asignarle el `type` del catálogo de §3.
- **RF-007** — CUANDO un login falla el sistema DEBE responder el mismo Problem Details
  (mismos `type`, `title` y `detail`) exista o no el email (mantiene RF-005 de SPEC-0002).
- **RF-008** — El sistema DEBE lanzar los errores de negocio desde servicios y
  dependencias como errores de dominio (`core/errors.py`), sin `HTTPException`; la
  traducción a código y `type` DEBE estar en un único registro.

**Contrato y frontend**
- **RF-009** — El contrato OpenAPI DEBE declarar el esquema `Problem` y, en cada endpoint,
  las respuestas de error que puede devolver con `application/problem+json`; el test de
  deriva DEBE fallar si la app y el contrato difieren. Los errores de enrutado (404 de ruta
  inexistente, 405) no pertenecen a ninguna operación y no se declaran en ellas; RF-001 los
  cubre igualmente.
- **RF-010** — CUANDO el frontend recibe un error de la API `ApiError` DEBE exponer
  `status`, `type`, `title`, `detail` y `errors`, y las pantallas de login, cambio de
  contraseña y cierre de sesión DEBEN seguir mostrando los mismos mensajes que hoy.

## 5. Casos límite y manejo de errores
- Error lanzado en una dependencia antes del endpoint (auth): mismo formato (RF-001).
- Respuestas 2xx/204 y cookies que se fijan en ellas: sin cambios.
- Error en el propio manejador al construir el Problem: 500 de campos fijos más `instance` (RF-013).
- Valores enviados por el cliente dentro de los mensajes de validación (p. ej. una
  contraseña inválida): nunca se repiten (RF-011); un test lo comprueba con una contraseña.
- Validación de query, ruta o cabecera (`?limit=500`, `If-Match` mal formado): 422 con
  `parameter` o `header` en lugar de `pointer` (RF-005).
- Error no controlado: traza al log, nunca a la respuesta (RF-004, RF-012).
- Mensaje de validación que lleva el valor recibido (validador propio con `ValueError`,
  UUID mal formado): la entrada sale con un texto genérico, nunca con el valor (RF-011).
- `HTTPException` con un código sin frase estándar (p. ej. 499): conserva su código; el
  `title` es la frase de su clase (400 o 500).
- Validador propio que lanza un error con el valor dentro de su mensaje (p. ej. con un
  f-string): se publica el texto del catálogo de su código, o el genérico si el código no
  está catalogado; nunca el mensaje lanzado (RF-011, enmienda 3).
- Límite de longitud de una colección (`list` con `max_length`): la entrada conserva el
  texto con el límite y el número de elementos, nunca los elementos (RF-011).

## 6. Registro de decisiones y descartes
| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| Feature propia, previa a 0003 | Decisión P5 de SPEC-0003: un solo formato en toda la API | RFC 9457 sólo en bóvedas; mantener `{"detail"}` | — |
| Número `0004` para esta feature | Art. 9: el número se reserva al crear el archivo; la sincronización (citada como `0004` en ARCHIFY) tomará el siguiente libre | Saltarse números | — |
| Q1 · Cubrir todo error, también 404/405/500 del framework; 500 genérico | Un único formato para los clientes; no filtrar internos | Sólo errores propios | — |
| Q2 · Errores de dominio en `core/errors.py` y un registro único de traducción | ADR-001 (servicios sin HTTP); causa raíz (Art. 10); mismo mecanismo para 0003 | Seguir lanzando `HTTPException` desde servicios | — |
| Q3 · `type` = `urn:synapse:problem:<slug>` / `about:blank`; 422 con `errors[{pointer, detail}]` | Identificador estable y comparable sin prometer una web; el formulario de 0003 necesita el error por campo | URLs `https://…/problems/…`; 422 sin detalle por campo | — |
| Q4 · `title`/`detail` en inglés; el frontend traduce por `type` | Coherente con el código (Art. 9); cambiar un texto de la UI no cambia el contrato | Mensajes en español desde la API | — |
| Q5 · Esquema `Problem` y errores declarados en cada endpoint; `ApiError` ampliado | Cierra el residual de 0002 (contrato sin errores) | Contrato sólo con respuestas 2xx | — |
| Q6 · Cambio en el lugar, sin `/v2` ni convivencia | Ningún cliente externo ni agente usa aún la API | Versionar la API; periodo con ambos formatos | — |
| Q7 · Ubicación por `pointer` / `parameter` / `header` | JSON Pointer sólo direcciona el cuerpo; sigue el borrador de extensiones de RFC 9457 | `pointer` con prefijo inventado (`#/query/limit`), no es un JSON Pointer válido | — |
| Q8 · Nunca repetir el valor enviado ni `input`/`ctx` de pydantic | Evita fugas (contraseñas) por defecto, sin depender de marcar campos | Ocultar sólo campos marcados como sensibles (frágil) | — |
| Q9 · Catálogo en el código (`core/errors.py`); spec con la tabla inicial; test de unicidad y forma | Una sola fuente por hecho (Art. 12) | YAML compartido por código y docs (carga sin beneficio con un cliente) | — |
| Q10 · 500 con traza al log; 500 de campos fijos si falla el manejador (más `instance`, E1); sin ids de correlación | Diagnosticable sin filtrar internos; correlación espera a Art. 7 | No registrar nada en esta feature | — |
| E1 · V-3: los `detail` de validación salen de plantillas fijas y sólo admiten restricciones del esquema; si no, texto genérico | La garantía de RF-011 vive en el traductor, no en la disciplina de cada validador (restablecida en E3 · W-1) | Rebajar la promesa de RF-011 | — |
| E1 · V-6: el 500 de fallback incluye `instance` | Cumple el esquema `Problem` publicado (`instance` obligatorio) | Hacer `instance` opcional en el contrato | — |
| E1 · V-7: 404/405 de enrutado fuera de las respuestas por operación | No pertenecen a una operación; declararlos en todas sólo añade ruido | Declararlos globalmente en cada operación | — |
| ~~E2 · W-1: plantilla literal por disciplina~~ → sustituida por E3 · W-1 | — | — | — |
| E2 · W-2: `field_type` y `actual_length` son claves seguras de `ctx` | Salen del esquema y de un recuento, nunca del contenido; los límites de colecciones conservan su texto | Documentar la excepción y dejar `Invalid value.` | — |
| ~~E2 · W-4: «emitido ⊆ declarado» al backlog~~ → sustituida por E3 · W-4 | — | — | — |
| E3 · W-1: catálogo de mensajes de validación propios (`FIELD_ERROR_MESSAGES` en `core/errors.py`); el traductor publica la entrada del catálogo por el código del error, y el genérico si no está; un test exige que sólo el catálogo (y el traductor, para renderizar) usen los errores de pydantic en `app/` | La garantía de RF-011 vuelve a vivir en el traductor y queda comprobada por test, sin depender de cómo se escriba un validador | Plantilla literal por disciplina (E2) | — |
| E3 · W-4: «emitido ⊆ declarado» en la propia app bajo test (middleware ASGI de prueba en `conftest.py`) para toda petición de cualquier test; 404/405 de enrutado y rutas fuera del contrato excluidos (RF-009) | La comprobación no depende de qué tests llamen a un helper | Helper en un solo archivo (V-1) o backlog (E2) | — |
| E4 · X-1: la regla de E3 · W-1 es una lista de permitidos por módulo: fuera de `core/errors.py` y `core/problems.py`, nada en `app/` importa `pydantic_core` ni usa `ValidationError`, `from_exception_data` o `InitErrorDetails` | Un error construido a mano con un `type` conocido haría que el traductor rellenara su plantilla con un `ctx` del validador; prohibir nombres sueltos deja huecos por construcción | Lista de nombres prohibidos (E3) | — |
| E4 · X-2: el guardián resuelve la operación por la ruta que atendió la petición (`scope["route"].path_format`), no por la primera plantilla del contrato que casa la ruta | Con plantillas solapadas (`/vaults/{vault_id}` y `/vaults/search`, SPEC-0003) la primera que casa puede no ser la que Starlette elige | Elegir la plantilla que case ruta y método (repite el enrutado de Starlette) | — |
| E4 · X-3: ningún código de `FIELD_ERROR_MESSAGES` coincide con un tipo conocido de pydantic (lo exige el test del catálogo) | El traductor resuelve antes los tipos conocidos: su entrada del catálogo nunca se publicaría | — | — |

## Marcadores abiertos
Ninguno (tandas 1 y 2 decididas; GATE 1 aprobado).
