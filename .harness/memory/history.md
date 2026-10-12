# History — Synapse

## [2026-10-11] 0004-api-problem-details — Fase 1 (Specify) abierta
- **Fase alcanzada:** verified (Fase 4 completa: T-001…T-088 tras ocho enmiendas; pasada a `verified` por el usuario el 2026-10-12)
- **Rebotes del verificador:** 7 (verificación adversarial 2026-10-11: APROBABLE CON RESIDUALES, V-1…V-8 → T-038…T-050, enmienda 1; re-verificación: APPROVED con menores W-1…W-4 → T-051…T-056, enmienda 2; W-1 y W-4 de raíz → T-057…T-063, enmienda 3; re-verificación 3: APPROVED con menores X-1…X-4 → T-064…T-069, enmienda 4; re-verificación 4: APPROVED con menores Y-1…Y-3 → T-070…T-074, enmienda 5; re-verificación 5: APPROVED con menores Z-1…Z-4 → T-075…T-078, enmienda 6; re-verificación 6: APPROVED con menores AA-1…AA-4 → T-079…T-083, enmienda 7; re-verificación 7: APPROVED con menores BB-1…BB-3 → T-084…T-088, enmienda 8, cerrada sin nueva ronda)
- **Directiva de Pausa:** no
- **Drift / re-anchor:** sí — SPEC-0002 re-anclada (T-001: `covers` sin `backend/tests/**`; T-036: formato de errores → SPEC-0004)
- **Anclas movidas:** SPEC-0002 `028c2ba` → `f28e063`; SPEC-0004 `c8c9e24` → `97ba08a` (cierre tras la enmienda 1) → `d41c74f` (cierre tras la enmienda 2) → `4f784de` (cierre tras la enmienda 3) → `65f9911` (cierre tras la enmienda 4) → `2c9f89b` (cierre tras la enmienda 5) → `e429d0f` (cierre tras la enmienda 6) → `7d06a85` (cierre tras la enmienda 7) → `0f8b80f` (cierre tras la enmienda 8)
- **Gate:** verde (21 ok · 1 aviso: `spectral` no instalado)
- **Docs actualizadas:** `specs/0004-api-problem-details/{spec,plan,tasks}.md`, contratos 0002 y 0004, ARCHIFY.md, SPEC-0003 (referencias a 0004), SPEC-0002 (nota y ancla), `backend/README.md`, `backend/app/core/README.md`, `frontend/src/README.md`, AGENTS.md, state.md
- **Decisiones:** número `0004` para esta feature (Art. 9); la sincronización tomará el siguiente libre. Q1–Q6 y Q7–Q10 aceptadas tal como se recomendaron (ver §6 del spec).
- **Próximo paso:** Fase 3 (Tasks) de 0003 (con BB-3 de 0004).
- **Registro de tareas:**
  - [2026-10-11] Usuario: «abre la feature de errores RFC 9457». Rúbrica §2: cambia el contrato de toda la API → **carril SDD**.
  - [2026-10-11] Borrador `spec.md` de 0004: contexto brownfield (HTTPException en servicios, `{"detail"}`, frontend lee `detail`, contrato sin errores), RF-001…RF-004 firmes, 6 marcadores (Q1 errores de framework/500, Q2 errores de dominio, Q3 `type` y validación, Q4 idioma, Q5 contrato y frontend, Q6 compatibilidad).
  - [2026-10-11] Usuario: «Acepto Q1 a Q6 tal como las recomiendas». Spec reescrito: `type` URN / `about:blank`, `errors[{pointer, detail}]` en 422, mensajes en inglés, catálogo inicial de 10 tipos (auth/admin/validación/almacenamiento), RF-001…RF-010 en EARS, §6 con Q1–Q6 y descartes. Tanda 2 abierta: Q7 (validación fuera del cuerpo), Q8 (no repetir valores del cliente), Q9 (ubicación del catálogo), Q10 (registro de 500 y fallo del manejador).
  - [2026-10-11] Usuario: «Acepto Q7 a Q10 tal como las recomiendas». Spec: `errors` con `pointer`/`parameter`/`header` y sin valores del cliente; catálogo con fuente única en `core/errors.py`; RF-011…RF-014 (sin `input`/`ctx`, traza de 500 al log, 500 mínimo si falla el manejador, unicidad y forma de `type`); §5 y §6 completados; 0 marcadores.
  - [2026-10-11] Usuario: «así es, pasa al plan» → **GATE 1 aprobado** (`fase_1` registrada, spec `approved`; `covers` + `frontend/src/api/problems{,.test}.ts`).
  - [2026-10-11] `plan.md` de 0004 (borrador): `DomainError` con `slug/title/status/detail` (mensaje interno separado del `detail` público), `ProvisioningError` ⊂ `StorageUnavailable`, traductor `core/problems.py` (4 manejadores, `FALLBACK_500`, `loc`→pointer/parameter/header), OpenAPI con `problem_responses` + `install_problem_openapi`, reparto de contratos por feature adelantado desde PLAN-0003, frontend `api/problems.ts`; re-anclaje de 0002 al cierre.
  - [2026-10-11] Usuario: «Apruebo el plan» → **GATE 2 aprobado** (`fase_2` en spec y plan; plan `approved`).
  - [2026-10-11] `tasks.md` de 0004: T-001…T-037 en 8 bloques (re-anclaje 0002, contratos por feature, catálogo, traductor, OpenAPI, migración auth/admin, frontend, docs); cobertura 14/14 RF y 8 filas `[doc]` (Gate 3).
  - [2026-10-11] Usuario: «Empieza la Fase 4 de 0004 desde T-001». T-001: `covers` de 0002 re-anclados a sus 17 tests propios (commit `99f9998`).
  - [2026-10-11] T-002/T-003: contrato por feature — `export_openapi.py` reparte rutas (0002: `/auth`, `/admin`, `/health`) y esquemas (0004: `Problem`) con recorrido transitivo de `$ref`; `test_contract.py` exige rutas con un solo dueño y copias de `Problem` idénticas al canon (3 rojos hasta T-016/T-025).
  - [2026-10-11] T-004…T-006: `core/errors.py` con `DomainError` (catálogo = clases; mensaje interno ≠ `detail` público) y `test_problem_catalog.py` (forma/unicidad de `type`, prueba AST de RF-008, roja hasta el bloque F).
  - [2026-10-11] T-007…T-011: `core/problems.py` — manejadores de dominio, framework (404/405 `about:blank`, conserva `Allow`) y no controlados (500 genérico + traza al log), `FALLBACK_500_BODY` constante; `test_problem_handlers.py` 8/8.
  - [2026-10-11] T-012/T-013: manejador de `RequestValidationError` — `loc`→`pointer` (escape RFC 6901, JSON inválido/cuerpo ausente → `#`), `parameter`, `header` (guiones); sólo `msg`; `type`/`title`/`detail` tomados de la entrada `validation-error` del catálogo; `test_problem_validation.py` 10/10.
  - [2026-10-11] T-014: `main.py` llama a `install_problem_handlers`; borrado el manejador ad hoc de `ProvisioningError`. Suite: 120 verdes, 4 rojos esperados (3 de contrato, 1 de arquitectura).
  - [2026-10-11] Usuario: «Sigue». T-015/T-016: `test_problem_contract.py` (barrido: todo 4xx/5xx es `Problem` en problem+json, 500 en toda operación, sin `HTTPValidationError`); `problem_responses(*errors)` (títulos unidos por código) e `install_problem_openapi` (con caché) cableado en `main.py`. Ajuste: `Problem`/`ProblemError` publican sus opcionales como omitibles, no anulables (`SkipJsonSchema[None]`, sin `default`), y sus docstrings —que son la `description` pública— en inglés.
  - [2026-10-11] T-017…T-020: `test_problem_auth.py` — tabla de 11 errores auth/admin (código de SPEC-0002 + `type`), login idéntico para email inexistente/contraseña errónea, política → 422 `#/new_password`, valores rechazados nunca devueltos, email inválido → `#/email`, CouchDB caído → 503 sin mensaje interno.
  - [2026-10-11] T-021…T-023: `dependencies.py`, `auth_service.py` (sin `fastapi`) y `routers/auth.py` lanzan errores de dominio; `responses=problem_responses(...)` en cada ruta (admin a nivel de router). Mensajes de `validate_new_password` y del validador de email traducidos al inglés en su origen (Q4); `test_security` ajustado (`match="differ"`).
  - [2026-10-11] T-024/T-025: `test_forced_change` lee `type`; `test_auth`/`test_refresh` esperan `AdminRequired`/`InvalidRefreshToken` en vez de `HTTPException`; contratos 0002 y 0004 re-exportados. Suite backend: **150/150 verde**.
  - [2026-10-11] T-026…T-029: `api/problems.ts` (`Problem`, `ApiError` con `type`/`title`/`detail`/`errors` y `message` detail→title→statusText, `parseProblem` tolerante a cuerpos no JSON y a campos mal tipados, `PROBLEM.*`); `auth.ts` usa `parseProblem` y re-exporta `ApiError`; `ChangePasswordPage` decide por `type` (test nuevo: un 400 genérico no es «actual incorrecta»); tests de páginas con `ApiError(status, problem)`. Frontend **32/32**, `tsc` limpio.
  - [2026-10-11] T-030/T-031: contratos re-exportados — 0004 sólo con `Problem`/`ProblemError` (canon); 0002 con respuestas de error `Problem` en cada operación (p. ej. `POST /admin/users`: 401, 403, 409, 422, 500, 503).
  - [2026-10-11] T-032…T-035: `backend/README.md` (sección «Errores (SPEC-0004)»: aviso de cambio incompatible, ejemplo, reglas, catálogo de 10 tipos, cómo añadir un error; «Contratos OpenAPI por feature»), `core/README.md` (`errors.py`/`problems.py`), `frontend/src/README.md` (`problems.ts`, `ApiError`), AGENTS.md (servicios y dependencias lanzan errores de dominio, nunca `HTTPException`).
  - [2026-10-11] T-036: SPEC-0002 con nota «formato de errores → SPEC-0004» y `anchor_commit: f28e063` (último commit sobre sus `covers`).
  - [2026-10-11] T-037: state.md — 0004 con Fase 4 completa, 0002 re-anclada, residual «contrato sin respuestas de error» resuelto. Gate verde.
  - [2026-10-11] **Session-End:** Fase 4 de 0004 completa (T-001…T-037), 0 rebotes, gate verde (1 aviso), backend 150/150 y frontend 32/32. Decisiones: opcionales de `Problem` omitibles y no anulables; los 422 de pydantic comparten la entrada `validation-error`; ancla de 0002 en `f28e063`. No se marca nada `verified`: la Fase 5 es del usuario.
  - [2026-10-11] Usuario: «Verifica 0004 con el verificador adversarial». Subagente verificador (sólo lectura): gate verde, backend 150/150 (Python 3.14 y versiones fijadas 3.11), frontend 32/32, contratos re-exportados idénticos. Veredicto **APROBABLE CON RESIDUALES**, sin bloqueantes. Mayores: V-1 ningún test exige «emitido ⊆ declarado» (RF-009); V-2 el mensaje interno de `DomainError` no se registra aunque las docs dicen «va al log». Menores: V-3 `msg` de pydantic puede incluir el valor (`value_error`, UUID) (RF-011); V-4 test «igual a la actual» ejerce la regla de longitud y aserción tautológica; V-5 frase HTTP calculada fuera de `_safely`; V-6 fallback 500 sin `instance` (requerido en el contrato); V-7 404/405 no declarados; V-8 plan/tasks citan `ProblemResponse`/`FALLBACK_500` y `errors.py`/`main.py` fuera de `covers`; además la tabla de cobertura de `tasks.md` no la rellena el gate. Pendiente de decisión del usuario.
  - [2026-10-11] Usuario: «Apruebo el reparto tal como lo recomiendas». Reparto: V-1, V-2, V-4, V-5, V-8 dentro del spec con TDD; V-3, V-6, V-7 como enmienda 1 (V-3: `detail` de cada entrada desde plantillas propias, nunca el valor; V-6: `instance` en el 500 de emergencia; V-7: 404/405 fuera del contrato por operación); tabla de cobertura rellenada a mano con la evidencia. `covers` se mantiene: `core/errors.py`, `core/schemas.py` y `main.py` siguen transversales sin dueño (decisión de PLAN-0004 §7).
  - [2026-10-11] T-038: enmienda 1 en SPEC-0004 (RF-009, RF-011, RF-013, §5, §6) y PLAN-0004 §2/§5/§7/§9 al día con el código (V-8: nombres `_respond`/`_problem_body`/`FALLBACK_500`).
  - [2026-10-11] T-039: `_assert_problem` exige que cada código emitido figure en las respuestas declaradas de su operación (`app.openapi()` + `compile_path`). Mutación: quitar `responses=` de `/auth/refresh` rompe 3 escenarios; restaurado.
  - [2026-10-11] T-040/T-041: `_domain_error` registra el mensaje interno (5xx ERROR con traza y causa encadenada; 4xx INFO sin traza); nunca llega a la respuesta.
  - [2026-10-11] T-042: «igual a la actual» ejerce la regla `differ` (actual cambiada antes a una ≥ 10); no-eco comprobado con el valor realmente enviado sobre el texto de la respuesta.
  - [2026-10-11] T-043/T-044: frase HTTP dentro de `_safely`; sin frase estándar (499) se usa la de su clase (400/500) y se conserva el código.
  - [2026-10-11] T-045/T-046: `detail` de cada entrada de un 422 regenerado con `PydanticKnownError` y sólo `SAFE_CTX_KEYS`; si no se puede, `Invalid value.`; plantillas propias sin `ctx` se conservan. Email con `PydanticCustomError("invalid_email", …)`.
  - [2026-10-11] T-047/T-048: fallback `FALLBACK_500` (campos fijos) + `instance`, serializado con `json.dumps`; valida contra `Problem`.
  - [2026-10-11] T-049: `backend/README.md` y `core/README.md` (log del mensaje interno, regla de `PydanticCustomError`, 404/405 fuera del contrato por operación). Contratos re-exportados: sin cambios.
  - [2026-10-11] T-050: tabla de cobertura (RF en `Pass`, docs `hecho`, tareas nuevas en sus filas); SPEC-0004 `implemented`; state.md. Backend 158/158, frontend 32/32, tsc limpio.
  - [2026-10-11] **Session-End:** fase implement (correcciones de la verificación adversarial, enmienda 1). Rebote V-1…V-8 resuelto. Gate verde. Docs: spec/plan/tasks de 0004, READMEs backend y core, state.md, history.md. Decisión: `covers` sin cambios (transversales sin dueño, PLAN-0004 §7). No se marca nada `verified`; próximo paso: re-verificación decidida por el usuario.
  - [2026-10-11] Usuario: «Haz la reverificación que recomiendas». Subagente verificador (sólo lectura) sobre HEAD `70d671a`: veredicto **APPROVED**, V-1…V-8 resueltos (mutaciones en worktree del scratchpad confirman V-1 y V-4; 8 tests nuevos fallan con el código de `91b9531`; fuzz de ~25 tipos de pydantic sin eco del valor). Gate verde (21 ok · 1 aviso), backend 158/158, frontend 32/32, tsc limpio, contratos sin diff. Menores: W-1 plantilla de `PydanticCustomError` con f-string publicaría el valor (E1 promete garantía en el traductor); W-2 `too_short`/`too_long` de colecciones caen a `Invalid value.` (faltan `field_type`/`actual_length` en `SAFE_CTX_KEYS`); W-3 spec §5/§6 y nombre de test aún dicen «500 mínimo fijo/constante»; W-4 «emitido ⊆ declarado» sólo en `test_problem_auth.py`. Pendiente de decisión del usuario. No se marca nada `verified`.
  - [2026-10-12] Usuario: «Apruebo tu recomendación para W-1…W-4». Rúbrica §2: W-1 precisa una promesa del spec (E1) → carril SDD, enmienda 2. Reparto: W-2 y W-3 se corrigen; W-1 se documenta (plantilla literal) y se precisa E1; W-4 al backlog.
  - [2026-10-12] T-051: enmienda 2 en SPEC-0004 (§5: fallback «campos fijos más `instance`», plantilla propia literal, límites de colecciones; §6: Q10 redactada, E1 precisada, filas E2 · W-1/W-2/W-4) y PLAN-0004 §2/§9.
  - [2026-10-12] T-052/T-053: test (rojo por `Invalid value.`) de límite de lista que conserva su texto sin los elementos; `field_type` y `actual_length` en `SAFE_CTX_KEYS` → verde.
  - [2026-10-12] T-054: test del fallback renombrado a `test_translator_failure_returns_fixed_500_with_instance` (W-3).
  - [2026-10-12] T-055: `backend/README.md` (plantilla literal, recuento en colecciones) y `core/README.md`.
  - [2026-10-12] T-056: tabla de cobertura con T-051…T-056, W-4 al backlog de state.md, ancla movida. Backend 159/159, frontend 32/32, tsc limpio, contratos sin diff.
  - [2026-10-12] **Session-End:** fase implement (correcciones de la re-verificación, enmienda 2). Rebote W-1…W-4 resuelto (W-4 en backlog). Gate verde. Docs: spec/plan/tasks de 0004, READMEs backend y core, state.md, history.md. Decisión: la garantía de RF-011 cubre lo que genera pydantic; las plantillas de `PydanticCustomError` son código y deben ser literales. No se marca nada `verified`; el paso es del usuario.
  - [2026-10-12] Usuario: «Resuelves los problemas, recuerda que tienes que analizar para encontrar el problema de raíz». Análisis de raíz: W-1 — el traductor confiaba en un `msg` que construye quien lanza el error, así que la garantía de RF-011 dependía de una convención («plantilla literal») sin comprobar; W-4 — «emitido ⊆ declarado» vivía en un helper de un solo módulo de tests, así que el resto de la suite podía emitir códigos no declarados sin que nada fallara. Rúbrica §2: revisa decisiones de la enmienda 2 → carril SDD, enmienda 3.
  - [2026-10-12] T-057: enmienda 3 en SPEC-0004 (§5 validador con el valor en su mensaje; §6 E2 · W-1/W-4 sustituidas por E3 · W-1/W-4) y PLAN-0004 §2/§5; bloque K en tasks.md.
  - [2026-10-12] T-058/T-059: tests rojos — un código catalogado publica el texto del catálogo aunque el mensaje lanzado lleve el valor; un código propio no catalogado sale `Invalid value.`; prueba AST: en `app/` sólo `core/errors.py` y `core/problems.py` usan errores de pydantic; catálogo bien formado (código slug, texto sin `{}`, `field_error` coherente). 4 rojos.
  - [2026-10-12] T-060: `FIELD_ERROR_MESSAGES` + `field_error()` en `core/errors.py`; `_field_detail` resuelve los tipos propios por código desde el catálogo (nunca `msg`); el validador de email usa `field_error("invalid_email")`. Verde.
  - [2026-10-12] T-061: `tests/contract_guard.py` (`ContractGuard`, middleware ASGI de test) instalado en `conftest.py` sobre la app real: toda respuesta ≥ 400 de toda la suite debe estar declarada en su operación (404/405 de enrutado excluidos). Retirado el chequeo duplicado de `test_problem_auth.py`; `test_problem_contract_guard.py` (instalación, declarados, no declarados, 404/405, extremo a extremo con un 401 quitado del esquema). Mutación: sin el guard fallan 2 tests.
  - [2026-10-12] T-062: `backend/README.md` y `core/README.md` (catálogo de mensajes, regla de errores de pydantic, `ContractGuard` en toda la suite).
  - [2026-10-12] T-063: tabla de cobertura con T-057…T-063, ítem 7 (W-4) retirado del backlog de state.md, ancla movida. Backend 168/168 (todas sus peticiones pasan por el guard), frontend 32/32, tsc limpio, contratos sin diff.
  - [2026-10-12] **Session-End:** fase implement (W-1 y W-4 resueltos de raíz, enmienda 3). Rebotes: el reparto de la enmienda 2 se corrige por indicación del usuario. Gate verde. Docs: spec/plan/tasks de 0004, READMEs backend y core, state.md, history.md. Decisión: el texto publicado de un error propio sale del catálogo por su código y «emitido ⊆ declarado» se comprueba en toda la suite. No se marca nada `verified`; próximo paso: re-verificación decidida por el usuario.
  - [2026-10-12] Usuario: «Haz la re-verificación por favor». Subagente verificador (sólo lectura) sobre HEAD `789447d`: veredicto **APPROVED con menores**. Gate verde (21 ok · 1 aviso), backend 168/168, frontend 32/32, tsc limpio, contratos sin diff. Mutaciones: los 4 tests nuevos de W-1 fallan con el código de `d41c74f`; quitar el 401 declarado de `/auth/login` tumba 7 tests de la suite general (sin contar los del guard). Menores: X-1 el test AST no ve `ValidationError.from_exception_data` (evasión deliberada con `ctx` de tipo conocido publica el valor); X-2 `ContractGuard` toma la primera plantilla que casa la ruta y no la que atendió la petición (latente hasta rutas con parámetros de SPEC-0003); X-3 un código del catálogo que coincida con un tipo de pydantic nunca usa el texto del catálogo; X-4 comentario obsoleto del ancla, `actualizado` de tasks, `assert` en `contract_guard.py`, log 500 engañoso al fallar el guard sin documentar, fixture con `client` innecesario. Pendiente de decisión del usuario. No se marca nada `verified`.
  - [2026-10-12] Usuario: «Si apruebo» (enmienda 4 para X-1…X-4). Análisis de raíz: X-1 — la regla de E3 era una lista de nombres prohibidos, incompleta por construcción; X-2 — el guardián repetía el enrutado (primera plantilla que casa) en vez de leer la ruta que eligió el router; X-3 — el catálogo podía declarar un código que el traductor resuelve antes como tipo de pydantic. Rúbrica §2: revisa decisiones de la enmienda 3 → carril SDD.
  - [2026-10-12] T-064: enmienda 4 en SPEC-0004 (nota, §6: E4 · X-1/X-2/X-3; comentario de `anchor_commit`) y PLAN-0004 §2/§5; `actualizado` de tasks; bloque L.
  - [2026-10-12] T-065: `test_problem_catalog.py` — escaneo `_pydantic_error_uses` por módulo (`pydantic_core` entero + `ValidationError`/`from_exception_data`/`InitErrorDetails`), con casos que el escaneo anterior no detectaba (5 de 6); ningún código del catálogo es tipo conocido de pydantic. Mutaciones: un validador con `ValidationError.from_exception_data` en `schemas.py` y la entrada `"missing"` en el catálogo tumban sus tests; restaurado.
  - [2026-10-12] T-066/T-067: `test_problem_contract_guard.py` con app mínima de plantillas solapadas (rojo: «DID NOT RAISE»); `contract_guard.py` resuelve la operación por `scope["route"].path_format`, `raise AssertionError` explícito, `schema_provider` tipado, docstring del 500 que registra `ServerErrorMiddleware`; fixture `schema` sin `client`. Mutación: sin el 401 declarado de `/auth/login` caen 5 tests de `test_auth`/`test_problem_auth`; restaurado.
  - [2026-10-12] T-068: `backend/README.md`, `core/README.md` y comentario del catálogo en `core/errors.py` (regla por módulo, códigos del catálogo, operación atendida, log 500 al fallar el guardián).
  - [2026-10-12] T-069: tabla de cobertura con T-064…T-069, state.md, ancla movida. Backend 176/176, frontend 32/32, tsc limpio, contratos sin diff.
  - [2026-10-12] **Session-End:** fase implement (correcciones de la re-verificación 3, enmienda 4). Rebote X-1…X-4 resuelto. Gate verde. Docs: spec/plan/tasks de 0004, READMEs backend y core, state.md, history.md. Decisión: la regla de errores de pydantic es por módulo y el guardián lee la ruta atendida. No se marca nada `verified`; próximo paso: re-verificación o paso a `verified`, decisión del usuario.
  - [2026-10-12] Usuario: «Haz la re-verificación por favor». Subagente verificador (sólo lectura) sobre HEAD `54bd4b1`: veredicto **APPROVED con menores**. Gate verde (21 ok · 1 aviso), backend 176/176, frontend 32/32, tsc limpio, contratos sin diff. Mutaciones: el test de plantillas solapadas falla con el guardián de `9e44621` («DID NOT RAISE»); un módulo con `from pydantic import ValidationError as VE; VE.from_exception_data(...)` lo detecta el test nuevo y no el anterior; `"missing"` en el catálogo tumba su test; quitar `EmailTaken` de `admin.py` tumba 3 tests de la suite general. Menores: Y-1 (realista) un `RequestValidationError` construido a mano en `app/` con `type` conocido y `ctx` del cliente publica el valor, y el escaneo lo permite explícitamente; Y-2 el comentario de `contract_guard.py` atribuye `scope["route"]` al router de Starlette (lo fija `APIRoute`; `Route`/`Mount` puros quedarían fuera sin aviso); Y-3 fila 0004 de state.md sin la enmienda 4 y fila E3 · W-1 del spec sin marcar como sustituida. Observación: la regla también prohíbe `except ValidationError` en `app/`. Pendiente de decisión del usuario. No se marca nada `verified`.
  - [2026-10-12] Usuario: «Si apruebo la enmienda 5». Análisis de raíz: X-1 e Y-1 tienen la misma causa —construir a mano un error de validación cuyo `ctx` publica el traductor—; la regla de E4 prohibía nombres (dejaba fuera `RequestValidationError` e impedía `except ValidationError`). Rúbrica §2: sustituye E4 · X-1 → carril SDD.
  - [2026-10-12] T-070: enmienda 5 en SPEC-0004 (nota; §6: E5 · Y-1 sustituye a E4 · X-1 tachada; E3 · W-1 marcada como refinada) y PLAN-0004 §2; bloque M.
  - [2026-10-12] T-071: `test_problem_catalog.py` — `_validation_error_constructions` mira llamadas y subclases (alias de import resueltos) de `ValidationError`/`RequestValidationError`/`InitErrorDetails`/`PydanticCustomError`/`PydanticKnownError`/`from_exception_data`, más `pydantic_core` entero; permite capturarlos. Rojo: el escaneo de E4 no detectaba 4 casos nuevos (`RequestValidationError` directo, con alias, por atributo y heredado) y rechazaba el `except`. Mutación: el exploit Y-1 (`services/leak_probe.py` con `RequestValidationError` a mano) tumba el test; eliminado.
  - [2026-10-12] T-072: comentario de `contract_guard.py` (lo fija `APIRoute.matches`; `Route`/`Mount` puros quedan fuera, como del contrato).
  - [2026-10-12] T-073: `backend/README.md` y `core/README.md` (regla sobre la construcción, `except` permitido, validaciones entre campos con `field_error`/`ValueError`).
  - [2026-10-12] T-074: tabla de cobertura con T-070…T-074, fila 0004 de state.md con las enmiendas 4 y 5 (Y-3), ancla movida. Backend 182/182, frontend 32/32, tsc limpio, contratos sin diff.
  - [2026-10-12] **Session-End:** fase implement (correcciones de la re-verificación 4, enmienda 5). Rebote Y-1…Y-3 resuelto. Gate verde. Docs: spec/plan/tasks de 0004, READMEs backend y core, state.md, history.md. Decisión: se prohíbe construir errores de validación fuera del catálogo y el traductor, no nombrarlos. No se marca nada `verified`; próximo paso: re-verificación o paso a `verified`, decisión del usuario.
  - [2026-10-12] Usuario: «Haz la re-verificación por favor». Subagente verificador (sólo lectura) sobre HEAD `55c9baa`: veredicto **APPROVED con menores**, sin bloqueantes ni mayores; Y-1…Y-3 cerrados y X-2/W-4 sin regresión. Gate verde (21 ok · 1 aviso), backend 182/182, frontend 32/32, tsc limpio, contratos sin diff. Mutaciones: el exploit Y-1 lo detecta el test nuevo y no el de `9805431`; un `except ValidationError` legítimo pasa con el nuevo y no con el anterior; quitar `EmailTaken` de `admin.py` tumba 3 tests de la suite general. Caminos que el escaneo no ve (`raise RequestValidationError` sin llamar, `ResponseValidationError`, `TypeAdapter` sin capturar) acaban en 500 genérico, sin fuga. Confirmado: `field_error` en un `model_validator` sale con el texto del catálogo (`pointer` `#`). Menores: Z-1 (borde realista/evasión) la clase asignada a una variable, `functools.partial` o un dict de fábricas evaden el escaneo y el traductor publica el `ctx`; Z-2 el README no dice que el error entre campos sale en la raíz ni qué usar entre fuentes distintas (path/body: `DomainError` 422 con `errors=`); Z-3 spec §6 E5 · Y-1, nota de la enmienda 5 y plan §2 hablan sólo de llamadas, mientras README y test también prohíben heredar; Z-4 líneas 143/145 de `test_problem_catalog.py` largas y con una comprensión de un elemento. Pendiente de decisión del usuario. No se marca nada `verified`.
  - [2026-10-12] Usuario: «Apruebo tu recomendación para Z-1…Z-4» (enmienda 6 registrada en `spec.md` → `aprobaciones.enmienda_6`).
  - [2026-10-12] T-075: enmienda 6 en SPEC-0004 (nota; §6: E5 · Y-1 precisada con las subclases (Z-3), E6 · Z-2 validación entre fuentes con un error de dominio 422 y `errors=`, E6 · Z-1 residual aceptado) y PLAN-0004 §2.
  - [2026-10-12] T-076: `_validation_error_constructions` reescrito sin la comprensión de un elemento y sin líneas largas (Z-4); los 32 tests del catálogo siguen pasando.
  - [2026-10-12] T-077: `backend/README.md` y `core/README.md` con las vías permitidas (entre campos: `field_error` en un `model_validator`, sale en `#`; entre fuentes: `DomainError` 422 con `errors=`) y el residual del análisis estático.
  - [2026-10-12] T-078: tabla de cobertura con T-075…T-078, state.md, ancla movida.
  - [2026-10-12] **Session-End:** fase implement (correcciones de la re-verificación 5, enmienda 6). Rebote Z-1…Z-4 resuelto (Z-1 aceptado como residual documentado). Gate verde. Docs: spec/plan/tasks de 0004, READMEs backend y core, state.md, history.md. Decisión: no endurecer el traductor; la construcción indirecta queda como residual. No se marca nada `verified`; próximo paso: paso a `verified` o nueva re-verificación, decisión del usuario.
  - [2026-10-12] Usuario: «Haz la re-verificación por favor». Subagente verificador (sólo lectura) sobre HEAD `7ffd2d3`: veredicto **APPROVED con menores**, sin bloqueantes ni mayores; Z-3 y Z-4 cerrados (el escaneo nuevo y el de `834c1a1` dan salidas idénticas en 27 casos y en todo `backend/`). Gate verde (21 ok · 1 aviso), backend 182/182, frontend 32/32, tsc limpio, contratos sin diff; quitar `EmailTaken` de `admin.py` tumba la suite general. Confirmado en ejecución: `field_error` en un `model_validator` sale con el texto del catálogo en `#`. Menores: AA-1 (realista) no hay un 422 de dominio genérico —el único es `PasswordPolicyViolation`, que el traductor usa como `VALIDATION_ERROR`—; un autor que siga la doc y cree su clase con slug propio viola RF-005 sin que ningún test lo detecte (afecta a `InvalidCursor` del plan de 0003); AA-2 (evasión deliberada) el residual Z-1 está listado de forma incompleta (`getattr`, `type()`, parámetro por defecto) y la lista difiere entre spec, plan y READMEs; AA-3 (realista) el `errors[].detail` de un error de dominio lo escribe el autor y puede interpolar valores del cliente sin guardián, y la doc no lo advierte; AA-4 cabecera de 0004 en history con «T-001…T-037» y contador de rebotes desfasados. Pendiente de decisión del usuario. No se marca nada `verified`.
  - [2026-10-12] Usuario: «Apruebo tu recomendación para AA-1…AA-4» (enmienda 7 registrada en `spec.md` → `aprobaciones.enmienda_7`).
  - [2026-10-12] T-079: enmienda 7 en SPEC-0004 (nota; §3; §6: E7 · AA-1, E7 · AA-3, E6 · Z-1 redactada por su naturaleza, E6 · Z-2 apuntando a `ValidationFailed`) y PLAN-0004 (catálogo y §2).
  - [2026-10-12] T-080: tests en rojo en `test_problem_catalog.py` (3 fallos: `ValidationFailed` inexistente, «422 ⇔ subclase de `ValidationFailed`», `PasswordPolicyViolation` subclase sin slug).
  - [2026-10-12] T-081: `ValidationFailed` en `core/errors.py` (entrada `validation-error`), `PasswordPolicyViolation` subclase sin slug, `VALIDATION_ERROR = ValidationFailed` en `core/problems.py`; verde. Mutación: un `VaultMismatch` de 422 con slug propio tumba `test_every_422_is_a_validation_failed`; restaurado.
  - [2026-10-12] T-082: READMEs backend y core y comentario del escaneo (vía `ValidationFailed`, `detail` de texto fijo, residual descrito por su naturaleza con el mismo texto en spec, plan y READMEs).
  - [2026-10-12] T-083: tabla de cobertura con T-079…T-083, state.md (backend 185 tests), cabecera de 0004 en history (fase con T-001…T-083, 6 rebotes) (AA-4), ancla movida.
  - [2026-10-12] **Session-End:** fase implement (correcciones de la re-verificación 6, enmienda 7). Rebote AA-1…AA-4 resuelto. Gate verde. Docs: spec/plan/tasks de 0004, READMEs backend y core, state.md, history.md. Decisión: todo 422 de dominio hereda de `ValidationFailed` (comprobado por test); el `detail` de `errors` de dominio es texto fijo por regla documentada. No se marca nada `verified`; próximo paso: paso a `verified` o nueva re-verificación, decisión del usuario.
  - [2026-10-12] Usuario: «Haz la re-verificación por favor. Por qué tantas verificaciones, parece que no salimos del mismo punto». Subagente verificador (sólo lectura) sobre HEAD `041f9bd`: veredicto **APPROVED con menores**, nada bloquea `verified`. Gate verde (21 ok · 1 aviso), backend 185/185, frontend 32/32, tsc limpio, contratos sin diff e idénticos a la base `e4b7507`; respuestas 422 (pydantic y `PasswordPolicyViolation`), `problem_responses` y sha256 del OpenAPI idénticos byte a byte frente a la base. Mutaciones del test nuevo (slug propio, slug redefinido, status y title cambiados) todas detectadas; quitar `EmailTaken` de `admin.py` tumba 3 tests. Menores: BB-1 (preexistente) una subclase de `ValidationFailed` puede cambiar el `detail` raíz (atributo o `detail=`) e interpolar datos del cliente; BB-2 (introducido) la fila RF-005 de la cobertura no cita `test_problem_catalog`; BB-3 (preexistente, SPEC-0003) su plan no dice que `InvalidCursor` hereda de `ValidationFailed` y aún menciona `main.py`. Valoración del verificador: convergencia clara, severidad decreciente, no hace falta otra ronda. Pendiente de decisión del usuario. No se marca nada `verified`.
  - [2026-10-12] Usuario: «Apruebo el cierre y la regla de salida» (enmienda 8 registrada en `spec.md` → `aprobaciones.enmienda_8`).
  - [2026-10-12] T-088 (regla): `method.md` §3, Fase 4 — regla de salida de la verificación (sólo otra ronda con hallazgos bloqueantes/mayores o cambio de comportamiento); también en las correcciones del usuario de state.md.
  - [2026-10-12] T-084: enmienda 8 en SPEC-0004 (nota; §6: E8 · BB-1) y PLAN-0004 §2.
  - [2026-10-12] T-085: `test_every_422_is_a_validation_failed` exige el `detail` raíz de `ValidationFailed`. Rojo: una subclase `InvalidCursor` con `detail` propio lo tumba; restaurado.
  - [2026-10-12] T-086: docstring de `ValidationFailed` y READMEs backend y core (sin `detail` propio ni `detail=`).
  - [2026-10-12] T-087: fila RF-005 de la cobertura con `test_problem_catalog` (BB-2).
  - [2026-10-12] T-088 (cierre): BB-3 anotado en la fila 0003 de state.md para su Fase 3; tabla de cobertura con T-084…T-088; cabecera de 0004 (T-001…T-088, 7 rebotes); ancla movida.
  - [2026-10-12] **Session-End:** fase implement (cierre de la re-verificación 7, enmienda 8). Rebote BB-1/BB-2 resuelto sin nueva ronda por la regla de salida (sólo un test que endurece y docs; sin cambio de comportamiento); BB-3 diferido a la Fase 3 de 0003. Gate verde. Docs: spec/plan/tasks de 0004, READMEs backend y core, method.md, state.md, history.md. Decisión: regla de salida de la verificación aprobada por el usuario. No se marca nada `verified`; próximo paso: paso de 0004 a `verified`, decisión del usuario.
  - [2026-10-12] Usuario: «Paso 0004 a verified, actualízalo por favor». Fase 5 decidida por el usuario: `estado: verified` en spec, plan y tasks de 0004 (aprobación `verificado` en el front-matter del spec), state.md y cabecera de history.md al día. Ancla sin mover: `0f8b80f` sigue siendo el último commit sobre los `covers`.
  - [2026-10-12] **Session-End:** fase verified (decisión del usuario). Sin rebotes. Gate verde. Docs: spec/plan/tasks de 0004, state.md, history.md. Decisión: 0004 cerrada como `verified` por el usuario. Próximo paso: Fase 3 (Tasks) de 0003 (con BB-3); aparte, merge del PR #3 y paso de 0002 a `verified` (usuario).

---

## [2026-10-11] 0003-vault-crud — Fase 1 (Specify) abierta
- **Fase alcanzada:** plan (GATES 1 y 2 aprobados)
- **Rebotes del verificador:** 0
- **Directiva de Pausa:** no
- **Drift / re-anchor:** no
- **Anclas movidas:** — (SPEC-0003 nace con `anchor_commit: c8c9e24`, base sin código propio)
- **Gate:** verde (19 ok · 1 aviso: spectral no instalado)
- **Docs actualizadas:** `specs/0003-vault-crud/spec.md` (nuevo, `approved`), `specs/0003-vault-crud/plan.md` (nuevo, `draft`), `specs/0002-auth/spec.md` (`aprobaciones.pr_3`), state.md
- **Decisiones:** la base CouchDB no se crea en `POST /vaults` (ya existe desde el alta del usuario, SPEC-0002); T-002 queda desactualizado en ese punto.
- **Próximo paso:** Fase 3 (Tasks) de 0003; Fase 4 tras mergear SPEC-0004. Reservar número para la feature de errores RFC 9457 (previa a implementar 0003).
- **Registro de tareas:**
  - [2026-10-11] Usuario: «Apruebo el PR». Registrado en SPEC-0002 → `aprobaciones.pr_3`. `estado` sigue en `implemented`: el merge y el paso a `verified` quedan en manos del usuario.
  - [2026-10-11] Rúbrica §2 para 0003: endpoints y almacenamiento nuevos → **carril SDD**.
  - [2026-10-11] Borrador `spec.md` de 0003 desde la plantilla y T-002: alcance, fronteras REST, RF-001…RF-005 firmes, 6 marcadores (P1 almacenamiento, P2 validación/concurrencia, P3 papelera, P4 403 vs 404, P5 RFC 9457, P6 UI/paginación).
  - [2026-10-11] Usuario: «Acepto P1 a P6 tal como las recomiendas». Registradas en §6: bóveda como documento en la base CouchDB del usuario; nombre único (sin mayúsculas) y límites; ETag/`If-Match`; papelera y restaurar dentro, purga a 30 días diferida (RF-016); ajena → 404; RFC 9457 como feature previa a 0003; UI incluida y paginación por cursor. Spec reescrito con RF-001…RF-020 en EARS.
  - [2026-10-11] Tanda 2 abierta (P7–P12): creaciones simultáneas con el mismo nombre, casos de papelera, orden y rendimiento, formato del id, campos desconocidos, papelera en la UI.
  - [2026-10-11] Usuario: «Acepto P7 a P12 tal como las recomiendas». Registradas en §6: reserva `vault-name:{minúsculas}` para la unicidad (RF-021); restaurar con nombre ocupado → 409, borrar ya borrada / restaurar no borrada → 404 (RF-025, RF-026); orden `created_at` desc + `id` (RF-024) y RNF-001 (p95 < 300 ms); id UUID v4 (RF-022); campos desconocidos → 422 (RF-023); vista "Papelera" (RF-028). Nombre libre al borrar/renombrar (RF-027). **0 marcadores**; a la espera del "así es" → GATE 1.
  - [2026-10-11] Usuario: «así es, pasa al plan». **GATE 1 aprobado** → `aprobaciones.fase_1`, `estado: approved`. Fe de erratas al spec (a confirmar en GATE 2): `owner_id` es `string` UUID (como `users.id`), no `integer`; RNF-001 dice "índice de CouchDB" en vez de "índice Mango".
  - [2026-10-11] Fase 2 — `plan.md` redactado: puerto `VaultPort` + `VaultRepository` (httpx) + `VaultService`; reserva `vault-name:{minúsculas}` con detección de huérfanas (sin transacciones entre documentos); `ETag` = `_rev`; vista `_design/vaults/by_created` (clave `[borrada, created_at]`, empate por `_id`) creada de forma idempotente por base; cursor base64url; export del contrato repartido por feature; re-anclaje de 0002 (`backend/tests/**` y archivos compartidos). `covers` de 0003 fijado. Espera GATE 2.
  - [2026-10-11] Usuario: «Apruebo el plan». **GATE 2 aprobado** → `plan.md` `approved`, `aprobaciones.fase_2` en spec y plan; fe de erratas (`owner_id` string, RNF-001) confirmada. Fase 3 (Tasks) de 0003 queda para antes de la Fase 4, que espera a SPEC-0004.

---

## [2026-10-11] Sprint 1 (0002-auth) — COMPLETADO Y VERIFICADO

**Fase alcanzada:** Implement → Verify (ciclo completo Specify → Plan → Tasks → Implement → Verify)

**Bloques ejecutados:**
- **A-D:** Config sin defaults, seguridad (Argon2id, JWT, CORS, CSRF), migración 002, CouchDB, bootstrap admin
- **E-H:** Endpoints auth (login, logout, /admin/users, password change/force) con refresh token + httpOnly cookies
- **I-J:** Aislamiento de datos (P3 validation), E2E tests, contrato OpenAPI con test de deriva
- **K:** Frontend (login form, guardia must_change_password, cambio password) + offline-first
- **L:** Tests 80%+ cobertura (85-90%), CouchDB real (no mocks), suite backend 84/84 ✅
- **M:** Documentación (OpenAPI, README, .env.example), diagrama Archify (auth-flow), state.md actualizado, cierre de SPEC-0002

**Rebotes del verificador:** 1 (verificación adversarial → enmienda de spec → re-verificación pasada)
- V-1 (refresh bloqueado) → whitelist `/auth/refresh`
- V-2 (emails case-sensitive) → normalizar emails + índice unique `lower(email)`
- V-3 (enumeración por tiempo) → hash Argon2id ficticio en login
- G-1 (formato email sin validar) → regex sin dependencias nuevas
- Resultado final: todos los casos pasan ✅

**Directiva de Pausa:** sí (conflicto state.md / Cowork / TAREAS.md → user fijó state.md como autoridad)

**Drift / re-anchor:** sí (SPEC-0002 retroactivo sobre `cf1632d`, covers ampliado, enmiendas enmendadas)

**Gate:** ✅ Verde (17 ok, 1 warn: spectral no instalado)

**Docs actualizadas:**
- `.harness/specs/0002-auth/spec.md` (RF 10, 14, 17, 21-23 precisados)
- `.harness/specs/0002-auth/plan.md` (bloques A-M ordenados)
- `.harness/specs/0002-auth/tasks.md` (T-001...T-058)
- `backend/app/security.py`, `backend/app/db.py`, `backend/migrations/002`, `backend/migrations/003`
- `frontend/src/pages/Login.tsx`, `frontend/src/hooks/useAuth.ts`
- `contracts/openapi.yaml` (auth paths + schemas)
- `backend/README.md`, `frontend/README.md`, `.env.example`
- `ARCHIFY.md` (diagrama auth-flow.html generado)
- `.harness/memory/state.md` (decisiones, P1-P5 validadas)

**Decisiones de diseño / límites de integración:**
- Admin seeded desde env, `/auth/register` retirado
- JWT 24h + refresh 30d hasheado
- `must_change_password` leído de BD (JWT mínimo)
- Rollback PG si falla CouchDB
- Excepción P5: control plane en SQLite
- Email normalized con índice unique `lower(email)`
- Argon2id hash ficticio en timing attacks

**Commits:** 15 (64d2a44...9f2b354)
- Setup harness: `5dca603`, `88b2aa9`, `4f0d495`
- Spec/Plan/Tasks: `1d5c451`
- Bloques A-D: `64d2a44`
- Docs (ARCHIFY, bitácora): `f8e54fb`
- Bloques E-H: `bcc2a23`
- Bloques I-J: `1d4780e`
- Bloque K: `e5cc5ca`
- Bloque L: `08a660d`
- Bloque M: `71b8d45`
- Anchor fijado: `03ffe94`
- Merge dev: `13b26c9`
- Fix adversarial (V-1, V-2, V-3, G-1): `9f2b354`

**Próximo paso:**
1. Decisión: ¿abrir 0003-vault-crud (Sprint 2) o manejar R-1…R-6 (residuales de la enmienda)?
2. Si 0003: crear spec.md, plan.md, tasks.md (CRUD bóvedas + aislamiento + tests)
3. Si residuales: redactar enmienda R-1…R-6, ejecutar verificación, decidir

---

## [2026-10-11] 0002-auth — enmienda 2: residuales R-1…R-6
- **Fase alcanzada:** implement (enmienda Specify → Plan → Tasks → Implement)
- **Rebotes del verificador:** 1 (re-verificación: W-1 carrera en refresh, W-2 sesión cerrada en RF-023; corregidos y re-verificados sin hallazgos)
- **Directiva de Pausa:** no
- **Drift / re-anchor:** sí (`covers` + `App.tsx`, `layout/**`, `*token_version*`)
- **Anclas movidas:** SPEC-0002 → `028c2ba`
- **Docs actualizadas:** spec.md, plan.md, tasks.md (bloques O y P), backend/README.md, frontend/src/README.md, ARCHIFY.md, state.md (contrato re-exportado sin cambios)
- **Próximo paso:** aprobación humana del PR #3; después limpieza de `docker-compose.yml` y 0003-vault-crud.
- **Aprobaciones:** enmienda 1 (V-1/V-2/V-3/G-1) aprobada por el usuario; enmienda 2 aprobada por el usuario.
- **Registro de tareas:**
  - [2026-10-11] Fase 1/2/3 — spec (RF-010, RF-014, RF-017 precisados; RF-021…RF-023 nuevos), plan y bloque O (T-059…T-068) redactados.
  - [2026-10-11] T-059, T-060 — tests de RF-021/RF-017 y RF-010/RF-022 escritos; en rojo (7 fallos esperados).
  - [2026-10-11] T-061 — `test_isolation.py`: recorre todo GET protegido del contrato como A y B sin filtrar identificadores del otro; bases CouchDB sin credenciales → 401. Pasa (guarda activa para 0003).
  - [2026-10-11] T-062 — migración `004_token_version` (`users.token_version`, `refresh_tokens.rotated`) y modelos.
  - [2026-10-11] T-063 — claim `ver`; `get_current_user` valida usuario activo y versión contra la BD; `change-password` incrementa la versión y emite cookies nuevas. Tests RF-021/RF-017 en verde.
  - [2026-10-11] T-064 — rotación del refresh token y revocación masiva sólo al reutilizar uno rotado. Tests RF-010/RF-022 en verde.
  - [2026-10-11] Hallazgo en tests: reinyectaban cookies con dominio `testserver` (el jar usa `testserver.local`), así que algunas aserciones de 401 eran vacías (replay tras logout, RF-009). Corregido; suite backend 84/84.
  - [2026-10-11] Migración 004 validada en SQLite y PostgreSQL 15 (round-trip; `alembic check` sin diferencias).
  - [2026-10-11] T-065 — tests vitest de renovación automática (reintento, fallo → sesión cerrada, renovación única, Web Locks, sin renovar en login); en rojo.
  - [2026-10-11] T-066 — `api/auth.ts::request` reintenta tras un único `/auth/refresh` (Web Locks entre pestañas, promesa compartida en la pestaña).
  - [2026-10-11] T-067 — `layout/AppLayout.tsx` con enlace "Cambiar contraseña" y "Cerrar sesión" (avisa si el logout falla); `App.tsx` lo usa como ruta de diseño de las privadas. Frontend 23/23, `tsc` limpio.
  - [2026-10-11] T-068 — docs: backend/README (versión de credenciales, rotación), frontend/src/README, ARCHIFY (diagrama), state; contrato re-exportado (sin cambios).
  - [2026-10-11] Enmienda 2 aprobada por el usuario (registrada en `spec.md` → `aprobaciones.enmienda_2`). Arranca la re-verificación adversarial de 0002.
  - [2026-10-11] Re-verificación adversarial de 0002 — gate verde (17 ok · 1 aviso spectral); backend 84/84, cobertura 97,95 %; frontend 23/23, `tsc` y build limpios; 6 mutaciones sobre las defensas nuevas (check `ver`, incremento, rotación, revocación masiva, detección sólo de rotados, cookies tras cambio) → todas detectadas por los tests.
  - [2026-10-11] Veredicto: **rebote** (2 hallazgos, nada pasa a `verified`). W-1 (medio): `refresh` lee y revoca sin operación atómica; dos peticiones concurrentes con el mismo refresh token lo rotan dos veces → dos sesiones válidas sin disparar RF-022 (demostrado intercalando dos sesiones). W-2 (bajo): RF-023 «tratar la sesión como cerrada» sólo lo aplica `RequireAuth` al navegar; `ChangePasswordPage` muestra un error genérico ante 401. Residuales de diseño (no violan el spec): el access token sobrevive 24 h al logout y a la revocación de RF-022; el contrato no declara 400/401/403/409; el test de Web Locks sólo comprueba el nombre del lock; el de aislamiento hoy sólo recorre `/auth/me`.
  - [2026-10-11] Usuario: «corrige W-1 y W-2 y vuelve a verificar». Bloque P (T-069…T-072) en `tasks.md` y nota en `plan.md` (sin cambio de spec).
  - [2026-10-11] T-069 — test de rotación concurrente con lectura obsoleta en una segunda sesión; en rojo (`DID NOT RAISE`). Nota: el objeto obsoleto debe retenerse (el mapa de identidad de SQLAlchemy es débil), si no el test pasa en falso.
  - [2026-10-11] T-070 — `AuthRepository.claim_refresh_token` (`UPDATE … WHERE id = ? AND revoked = false`, gana sólo si afecta 1 fila); `AuthService.refresh` trata la pérdida como reutilización (401 + revocación masiva); `revoke_refresh_token` pierde `rotated`. Backend 85/85, cobertura 98 %. Comprobado en PostgreSQL 15 con dos conexiones concurrentes: un solo ganador.
  - [2026-10-11] T-071 — test vitest (401 en cambio de contraseña → `/login`) en rojo y luego `ChangePasswordPage` navega a `/login` ante 401. Frontend 24/24, `tsc` y build limpios.
  - [2026-10-11] T-072 — docs: plan.md (W-1/W-2), backend/README (rotación atómica), frontend/src/README (sesión cerrada), state.
  - [2026-10-11] Re-verificación tras W-1/W-2 — gate verde (17 ok · 1 aviso spectral); backend 85/85 (cobertura 98 %; las líneas sin cubrir son defensivas previas); frontend 24/24, `tsc` y build limpios; mutaciones: claim sin condición, perdedor sin revocación masiva, sin rotación, detección sobre cualquier revocado, sin revocación al reutilizar y sin redirección a `/login` → todas detectadas. **Sin hallazgos nuevos.** Residual: sin Web Locks (navegadores antiguos) dos pestañas que renuevan a la vez pierden la sesión (la perdedora dispara RF-022), seguro pero molesto.
  - [2026-10-11] Ancla de SPEC-0002 movida a `028c2ba` (commit de las correcciones). `estado` sigue en `implemented`: `verified` sólo tras la aprobación humana del PR.

## [2026-10-11] 0002-auth — enmienda tras verificación adversarial
- **Fase alcanzada:** implement (enmienda Specify → Plan → Tasks → Implement)
- **Rebotes del verificador:** 1 (V-1 refresh bloqueado por RF-019, V-2 emails sensibles a mayúsculas, V-3 enumeración por tiempo en login, G-1 sin validar formato de email)
- **Directiva de Pausa:** no (el usuario dirigió: enmendar spec para V-1, corregir V-2, V-3, G-1)
- **Drift / re-anchor:** sí (`covers` + `*normalize_email*`)
- **Anclas movidas:** no (spec enmendado pendiente de aprobación)
- **Gate:** verde (1 aviso: spectral no instalado)
- **Docs actualizadas:** spec.md, plan.md, tasks.md (bloque N), contracts/openapi.yaml, backend/README.md, state.md
- **Decisiones de diseño / límites de integración:** `/auth/refresh` en la lista blanca; emails normalizados + índice único `lower(email)` (migración 003); hash Argon2id ficticio en login; regex de email sin dependencias nuevas.
- **Próximo paso:** aprobación de la enmienda por el usuario y re-verificación; decidir R-1…R-6.

## [2026-10-11] 0002-auth — implementada (pendiente de verificación)
- **Fase alcanzada:** implement
- **Rebotes del verificador:** 0 (verificador aún no ejecutado)
- **Directiva de Pausa:** sí (fuentes en conflicto state.md / cola Cowork / TAREAS.md → el usuario fijó state.md como fuente; secreto semilla vs P4 → sólo en `.env` local + cambio forzado)
- **Drift / re-anchor:** sí (SPEC-0002 retroactivo sobre `cf1632d`; `covers` ampliado a los archivos nuevos)
- **Anclas movidas:** SPEC-0002 → commit de cierre de esta sesión
- **Gate:** verde (1 aviso: spectral no instalado)
- **Docs actualizadas:** contracts/openapi.yaml, backend/README.md, backend/tests/README.md, .env.example, frontend/README.md, frontend/src/README.md, TAREAS.md (T-001), ARCHIFY.md, state.md
- **Decisiones de diseño / límites de integración:** admin sembrado desde entorno y `/auth/register` retirado; JWT 24 h + refresh 30 d hasheado; `must_change_password` leído de BD (JWT mínimo); rollback de PG si falla CouchDB. Excepción P5: control plane en SQLite.
- **Próximo paso:** verificación adversarial de 0002 + PR; luego decidir limpieza de docker-compose y abrir 0003-vault-crud.

## Session 2026-10-10 (Génesis — CORREGIDA)

**Evento:** Génesis de harness SDD Anchored para Synapse (REVISADA — almacén puro)

- **Fase alcanzada:** Génesis completada (2.0)
- **Corrección crítica:**
  - Primera versión incluía LangGraph/RAG/LiteLLM/Ollama (INCORRECTO)
  - Carlos aclaró: Synapse es almacén puro, gestión externa via agentes OpenClaw
  - Se reescribió constitution.md + AGENTS.md correctamente

- **Qué se hizo (versión correcta):**
  - Copiar harness/reference/ → synapse/.harness/ ✅
  - Redactar constitution.md (almacén, FastAPI + CouchDB + React, P1-P5)
  - Redactar AGENTS.md (4 roles fijos, sin especialistas de IA)
  - Rellenar memory/state.md (decisiones simples, aislamiento datos)
  - Crear history.md (bitácora)

- **Decisiones cristalizadas:**
  - P1-P5 (aislamiento de datos, validación de permisos, no secrets, tests con BD real)
  - Stack simple: FastAPI + CouchDB + PouchDB + React
  - Gestión externa: agentes OpenClaw (AIRA, Paulina, Liza, main)

- **Rebotes del verificador:** 1 crítico (Carlos señaló falta de alineación con realidad del proyecto)
- **Status del gate:** Listo para ejecutar
- **Documentación:** 
  - constitution.md ✅ (CORREGIDA)
  - AGENTS.md ✅ (CORREGIDA)
  - memory/state.md ✅
  - Versión 1.0 (con LLM/RAG) descartada

- **Próximo paso:** 
  1. Ejecutar `bash .harness/gate/check.sh`
  2. Carlos aprueba Génesis (v2.0)
  3. Abrir Sprint 2 — Gestión de Bóvedas (feature 0003-vault-crud)
  4. Avanzar a Specify

**Notas:**
- Synapse es proyecto "brownfield" (código existe desde Sprint 0/1)
- Génesis se basó ERRÓNEAMENTE en documentos desactualizados que mencionaban IA
- Aclaración de Carlos: IA interna fue **descartada**; ahora Synapse es puro almacén
- Agentes OpenClaw son el "cerebro" que gestiona la bóveda externamente
- Stack final: **FastAPI + CouchDB + PouchDB + React** (sin dependencias de IA/Ollama)

---

**Documento:** history.md — Bitácora de Sessions  
**Proyecto:** Synapse  
**Creado:** 2026-10-10 (CORREGIDA)  
**Estado:** Génesis completada (v2.0)
