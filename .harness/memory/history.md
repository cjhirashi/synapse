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
- **Fase alcanzada:** verified (por el usuario, 2026-10-13; T-001…T-075)
- **Rebotes del verificador:** 2 (verificación 1 REJECTED: VA-1 mayor + VA-2…VA-10 → enmienda 1, T-052…T-070; verificación 2 APPROVED con menores VB-1…VB-5 → T-071…T-075, sin nueva ronda)
- **Directiva de Pausa:** no
- **Drift / re-anchor:** no
- **Anclas movidas:** SPEC-0003 `c8c9e24` → `4a07556` (cierre Fase 4) → `d730de9` (cierre enmienda 1) → `e5ec154` (menores VB); SPEC-0002 → `4a07556` → `d730de9`
- **Gate:** verde (19 ok · 1 aviso: spectral no instalado)
- **Docs actualizadas:** `specs/0003-vault-crud/spec.md` (nuevo, `approved`), `specs/0003-vault-crud/plan.md` (nuevo, `approved`; §10 de ajustes tras SPEC-0004), `specs/0003-vault-crud/tasks.md` (nuevo, `approved`), `specs/0002-auth/spec.md` (`aprobaciones.pr_3`), state.md
- **Decisiones:** la base CouchDB no se crea en `POST /vaults` (ya existe desde el alta del usuario, SPEC-0002); T-002 queda desactualizado en ese punto.
- **Próximo paso:** bloque G (frontend, T-035…T-044).
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
  - [2026-10-12] Usuario: «Empieza la Fase 3 (Tasks) de 0003 por favor». Rúbrica §2: carril SDD, Fase 3. Gate verde.
  - [2026-10-12] PLAN-0003 alineado con SPEC-0004 (`verified`), sin cambiar decisiones del spec: prerrequisito cumplido; errores como entradas del catálogo (`vault-not-found`, `vault-name-taken`, `precondition-required`, `precondition-failed`) e `InvalidCursor` ⊂ `ValidationFailed` sin `slug` ni `detail` propios (BB-3); `RevisionConflict` fuera del catálogo; sin manejadores en `main.py`; `vault_id` como `str` y `If-Match` opcional para que den 404/428 y no 422; restricciones nativas de pydantic; re-anclaje de 0002 y reparto de contratos ya hechos por 0004 (§6); tipos de bóvedas del frontend en `api/vaults.ts`. Todo en la nueva §10.
  - [2026-10-12] `tasks.md` de 0003 (borrador): T-001…T-051 en 8 bloques (contrato, núcleo, puerto y adaptador, servicio con doble, rutas, rendimiento, frontend, docs); tests nuevos sólo en `test_vault*.py` para no tocar los de 0004; cobertura 28 RF + RNF-001 (RF-016 diferido con su tarea `[doc]`) y 7 filas `[doc]`.
  - [2026-10-12] **Session-End:** fase tasks (0003). Sin rebotes. Gate verde. Docs: plan/tasks de 0003, state.md, history.md. Decisión: el plan se ajusta a SPEC-0004 en §10 (a confirmar en GATE 3). No se aprueba nada: próximo paso, GATE 3 del usuario.
  - [2026-10-12] Usuario: «Apruebo el GATE 3, empieza la Fase 4 desde T-001». **GATE 3 aprobado** → `tasks.md` `approved` (`aprobaciones.fase_3`), `aprobaciones.fase_3` en el spec y `ajustes_fase_3` (§10) en el plan.
  - [2026-10-12] T-001/T-002: `test_contract.py` exige los 6 endpoints de 0003; `0003-vault-crud` en `FEATURES`. 3 rojos esperados hasta T-032 (contrato sin exportar y sin rutas).
  - [2026-10-12] T-003…T-005: `test_vault_schemas.py` (28 tests: límites, normalización, `extra="forbid"`, `null` en PATCH) rojo → `VaultCreate`/`VaultUpdate`/`VaultOut`/`VaultPage` en `core/schemas.py` con `StringConstraints` y deduplicación por `AfterValidator`; verde.
  - [2026-10-12] T-006/T-007: `test_vault_errors.py` rojo → `InvalidCursor` ⊂ `ValidationFailed`, `VaultNotFound`, `VaultNameTaken`, `PreconditionRequired`, `PreconditionFailed` y `RevisionConflict` (fuera del catálogo) en `core/errors.py`; verde junto a `test_problem_catalog.py`.
  - [2026-10-12] T-008/T-009: tests del cursor rojos → `encode_cursor`/`decode_cursor` en `services/vault_service.py` (base64url de `{d,c,i}`; `InvalidCursor` con `errors` de texto fijo); verde.
  - [2026-10-12] T-010…T-015: `VaultPort` (ABC) → tests de integración contra CouchDB real (put/get/delete con `_rev`, conflictos, `list_page` con empates, inserciones y bóveda del cursor fuera de la lista, índice idempotente, red caída y 5xx → `StorageUnavailable`) → `VaultRepository` con `httpx.Client`; 24 verdes. Ajuste del plan (§11): descarte condicional de la primera fila en vez de `skip=1`, que saltaba una bóveda si la del cursor salía de la lista (RF-012). Gate verde.
  - [2026-10-12] T-016…T-024: doble `InMemoryVaultPort` (semántica de `_rev`, fallos inyectables, escritura intercalada antes de un `put`) y tests de `create`/`get`/`update`/`delete`/`restore`/`list` en rojo → `VaultService` (reserva con huérfanas, precondición `If-Match`, `limit+1`, reloj inyectable, `Versioned`); 46 verdes. Ajuste del plan (§11): la reserva sólo se libera tras una escritura confirmada y si nadie la usa; liberar tras un `put` fallido o un renombrado perdido podía dejar nombres repetidos. Gate verde.
  - [2026-10-12] **Session-End:** fase implement (0003, bloques A–D: T-001…T-024). Sin rebotes. Gate verde (21 ok · 1 aviso); backend 288 verdes y 3 rojos esperados del contrato hasta T-032. Docs: plan (§11 nuevo), tasks, state.md, history.md. Decisiones: dos ajustes de implementación en PLAN-0003 §11 (descarte condicional en vez de `skip=1`; reservas liberadas sólo tras escrituras confirmadas), sin cambios en el spec; a confirmar por el usuario. Commits ed3b140, cb857e3 y 3c366c3, subidos. Próximo paso: bloque E (rutas) desde T-025.
  - [2026-10-12] Usuario: «Apruebo los 2 ajustes». PLAN-0003 §11 aprobado (descarte condicional de la fila del cursor; liberación de reservas sólo tras escrituras confirmadas) → `aprobaciones.ajustes_fase_4` en el plan.
  - [2026-10-12] T-025…T-029: tests de API en rojo — `test_vaults_api.py` (flujos felices, 422 Problem sin escrituras, 409, nombres liberados, 428/412, 404 de RF-026, 503), `test_vaults_isolation.py` (B no ve ni toca lo de A, 404 idénticos, 401/403 en los 6 endpoints) y `test_vaults_concurrency.py` (dos hilos con barrera contra CouchDB real).
  - [2026-10-12] T-030…T-032: `routers/vaults.py` (6 rutas finas, `ETag`/`If-Match`, base sólo del `sub`, repositorio único por proceso con `lru_cache`, `problem_responses` por operación) e `include_router` en `main.py`; contrato `0003-vault-crud/contracts/openapi.yaml` exportado (0002 y 0004 sin cambios). 38/40 verdes.
  - [2026-10-12] **Hallazgo (RF-021):** T-029 sigue rojo — dos creaciones o dos renombrados simultáneos ganan ambos. Causa raíz: la reserva se escribe antes que la bóveda, y en esa ventana la otra petición la juzga huérfana (regla de §2/§11) y la reasigna; reproducido de forma determinista con el doble en memoria. Propuesta en PLAN-0003 §12 (arrendamiento de 30 s en la reserva) **pendiente de aprobación** del usuario: cambia la regla de huérfanas, así que va por carril SDD y no se implementa todavía.
  - [2026-10-12] **Session-End:** fase implement (0003, bloque E: T-025…T-032). Sin rebotes del verificador. Gate verde (21 ok · 1 aviso); backend 330 verdes y 1 rojo (T-029, carrera de RF-021; el otro caso de T-029 pasa o falla según el entrelazado). Los 3 rojos de contrato ya están verdes. Docs: plan (§12 propuesto), tasks, state.md, history.md, contrato 0003. Decisión pendiente del usuario: PLAN-0003 §12. Próximo paso: implementar §12 si se aprueba; luego bloque F (T-033).
  - [2026-10-12] Usuario: «Apruebo» → PLAN-0003 §12 aprobado (`aprobaciones.hallazgo_fase_4`).
  - [2026-10-12] §12 implementado (TDD): la reserva guarda `reserved_at` y bloquea mientras siga dentro de `RESERVATION_LEASE` (30 s) aunque su bóveda aún no la use; vencida, se reasigna. Detalle de la misma corrección: `_release(name, vault_id)` sólo borra la reserva si sigue apuntando a la bóveda que libera (una liberación tardía ya no borra una reserva reasignada a otra). Tests nuevos: create y rename con otra escritura en curso → 409, liberación tardía, huérfana vencida; los de RF-017 y renombrado perdido avanzan el reloj más allá del arrendamiento. T-029 en verde (estable en 3 corridas). Suite backend **334/334**; gate verde. §2 del plan apunta a §12.
  - [2026-10-12] **Session-End:** fase implement (0003, bloque E completo: T-025…T-032 y §12). Sin rebotes del verificador. Gate verde (21 ok · 1 aviso); backend 334/334. Docs: plan (§2, §12 aprobado), tasks, state.md, history.md. Decisión: arrendamiento de 30 s en las reservas de nombre y liberación sólo de la reserva propia. Nada marcado `verified`. Próximo paso: bloque F (T-033/T-034).
  - [2026-10-12] Usuario: «Sigue con el bloque F». Rúbrica §2: tareas del plan aprobado (carril SDD, Fase 4). Gate verde.
  - [2026-10-12] T-033/T-034: marca `perf` registrada en `conftest.py` y deseleccionada salvo que `-m` la nombre; `test_vaults_perf.py` siembra 1 000 bóvedas con `VaultService` + `VaultRepository` reales y mide 50 lecturas de `GET /vaults?limit=50` por la API (la primera lectura, que construye la vista, queda fuera de la muestra). Resultado: **p95 = 18 ms** (mediana 15 ms) frente a 300 ms. `backend/README.md` documenta `pytest -m perf`.
  - [2026-10-12] Suite completa tras el bloque F: 334 verdes, 1 deseleccionado (`perf`). Commit b277f13.
  - [2026-10-12] Usuario: «Sigue con el bloque G». Rúbrica §2: al preparar `api/vaults.ts` aparece un hueco de diseño que revisa una decisión del spec (§3: versión sólo en la cabecera `ETag`) → carril SDD. Los listados no dan el `ETag` de cada bóveda y `GET` de una borrada es 404, así que la Papelera (RF-028) no puede restaurar (RF-010 exige `If-Match`). Propuesto PLAN-0003 §13: `etag` en cada elemento de `VaultPage.items`. Bloque G detenido hasta que el usuario lo apruebe.
  - [2026-10-12] **Session-End:** fase implement (0003, bloque F completo: T-033/T-034; bloque G sin empezar). Sin rebotes del verificador. Gate verde (21 ok · 1 aviso); backend 334 verdes + perf p95 18 ms. Docs: plan (§13 propuesto), tasks, state.md, history.md, backend/README.md. Decisión pendiente del usuario: PLAN-0003 §13. Nada marcado `verified`. Próximo paso: implementar §13 si se aprueba (backend, spec, contrato) y luego bloque G (T-035…T-044).
  - [2026-10-12] Usuario: «Apruebo» (PLAN-0003 §13). Rúbrica §2: decisión aprobada del carril SDD. Gate verde.
  - [2026-10-12] §13 implementado: `VaultListItem(VaultOut)` con `etag` en `VaultPage.items` (servicio lo construye desde `_rev`); spec §3, RF-001 y RF-012 enmendados (`enmienda_fase_4`); plan §13 aprobado; contrato 0003 re-exportado. Tests: los de API restauran con el `etag` de la Papelera (adiós lectura directa de CouchDB), nuevo `test_rf_012_trash_items_carry_the_etag_that_restore_needs` y `test_rf_012_list_items_carry_their_current_etag`. Backend 336 verdes, 1 deseleccionado.
  - [2026-10-12] Bloque G (T-035…T-044), cada par test rojo → código verde: `api/auth.ts` exporta `request`; `api/vaults.ts` (`listVaults`, `getVault`, `createVault`, `updateVault`, `deleteVault`, `restoreVault`, `VAULT_PROBLEM`; `etag` del elemento en listados y de la cabecera en el resto). `getVault` no estaba en la lista del plan: la ruta de edición y la recarga tras un 412 la necesitan. `vaults/useVaultPages.ts` (paginación compartida), `vaults/errors.ts` (`isSessionClosed`, `isStale`), `VaultListPage` (confirmación en `alertdialog`; 412/404 → aviso y recarga), `VaultForm` (crear/editar, `PATCH` sólo con lo cambiado, 422 junto al campo por `pointer` con textos propios, 409 junto al nombre, 412 → aviso y recarga descartando lo escrito para no pisar el cambio ajeno), `TrashPage` (restaura con el `etag` del listado; 409 → aviso de nombre ocupado). Rutas `/vaults`, `/vaults/new`, `/vaults/trash`, `/vaults/:id/edit`; `/` → `/vaults`; enlaces «Bóvedas»/«Papelera» (`nav` «Principal»). `vite.config.ts`: proxy de desarrollo para `/vaults` que sirve `index.html` a las navegaciones HTML (comprobado con el servidor de desarrollo); fuera de los `covers` de 0003, se anota para el re-anclaje. Frontend 82/82, `tsc` y `vite build` limpios. Cobertura no medible: falta `@vitest/coverage-v8` (no se añadió dependencia).
  - [2026-10-12] **Session-End:** fase implement (0003: §13 aprobado e implementado; bloque G completo, T-035…T-044). Sin rebotes del verificador. Gate verde (20 ok · 2 avisos: Art. 11 —docs pendientes del bloque H— y spectral no instalado). Backend 336 verdes + 1 `perf` deseleccionado; frontend 82/82; `tsc` y build limpios. Docs: spec (enmienda Fase 4), plan §13, contrato 0003, tasks, state.md, history.md. Commits 4b18386 y 08446c8. Nada marcado `verified`. Próximo paso: bloque H (T-045…T-051) — READMEs, re-anclaje de 0002 y nota de `vite.config.ts`.
  - [2026-10-12] Usuario: «Continua con el bloque H». Rúbrica §2: tareas `[doc]` del plan aprobado (carril SDD, Fase 4). Gate verde (1 aviso).
  - [2026-10-12] T-045: `backend/README.md` — sección «Bóvedas (SPEC-0003)» (capas, aislamiento con 404 único, `ETag`/`If-Match` con el `etag` por elemento en listados, reserva de nombre con arrendamiento de 30 s, papelera, paginación, tabla de endpoints), estructura con `vault_service`/`vault_repository`/`vaults.py`, 4 entradas del catálogo (`vault-not-found`, `vault-name-taken`, `precondition-failed`, `precondition-required`; `cursor` inválido bajo `validation-error`) y 0003 en «Contratos OpenAPI por feature».
  - [2026-10-12] T-046: tabla de puertos en `core/ports/README.md` (`VaultPort`) y `VaultRepository` en `adapters/README.md` (409 → `RevisionConflict`, índice `_design/vaults` perezoso por base).
  - [2026-10-12] T-047: `frontend/src/README.md` — carpeta `vaults/`, `api/vaults.ts` (`VAULT_PROBLEM`, `etag`), tabla de rutas privadas, recarga ante vista desfasada y el proxy de desarrollo de `/vaults`.
  - [2026-10-12] T-048: `TAREAS.md` T-002 alineada con SPEC-0003 (sin crear base en `POST`, 404 en vez de 403, sin `by_owner_id`, papelera/`restore`, `If-Match`; archivos reales). T-049: `ARCHIFY.md` — aislamiento con 404 y base por usuario; nota de T-003 (fuera de alcance de 0003, no bloquea).
  - [2026-10-12] T-050: RF-016 (purga a 30 días) en el backlog de `state.md` como feature aparte.
  - [2026-10-12] T-051 (cierre): SPEC-0002 re-anclada a `4a07556` con nota (0003 tocó `core/schemas.py`, `export_openapi.py`, `conftest.py` —marca `perf`—, `test_contract.py`, `App.tsx`, `layout/**`, `api/auth.ts`; sin cambio de requisitos). PLAN-0003 §14 (notas informativas, ninguna decisión cambia): `vite.config.ts` queda fuera de todo `covers` (configuración de desarrollo; también la tocó 0002), y se añadió `getVault`. Evidencia: backend 336 verdes + 1 `perf` deseleccionado, cobertura 99 %; `-m perf` 1/1; frontend 82/82. Tabla de cobertura: 28 RF + RNF-001 en `Pass`, RF-016 y docs en `hecho`. SPEC/PLAN/TASKS-0003 → `implemented` (precedente: T-050 de 0004), ancla `4a07556`. `state.md` al día. Gate verde (1 aviso: spectral).
  - [2026-10-12] **Session-End:** fase implement → 0003 `implemented` (bloque H completo, T-045…T-051). Rebotes del verificador: 0 (verificación adversarial de 0003 aún no ejecutada). Directiva de Pausa: no. Drift / re-anchor: sí (0002 por archivos compartidos con 0003). Anclas movidas: SPEC-0002 → 4a07556, SPEC-0003 → 4a07556. Gate verde (1 aviso: spectral no instalado). Docs: backend/README.md, core/ports/README.md, adapters/README.md, frontend/src/README.md, TAREAS.md, ARCHIFY.md, spec 0002, spec/plan (§14)/tasks 0003, state.md, history.md. Nada marcado `verified`. Próximo paso: verificación adversarial de 0003; decidir `@vitest/coverage-v8`.
  - [2026-10-12] Usuario: «Empieza la verificación adversarial de 0003». Rúbrica §2: Fase 4, verificación (carril SDD). Gate verde (1 aviso). Subagente verificador de sólo lectura lanzado sobre HEAD `26156e6`.
  - [2026-10-13] **Verificación adversarial de 0003 → REJECTED** (1 mayor, 9 menores). Evidencia: gate verde (21 ok, 1 aviso), backend 336 passed (cobertura 98,98 %), perf p95 30,5 ms, export de contratos idéntico, vitest 82/82, tsc y build limpios; 35 mutantes, sobreviven M4, M12, M25 y F12. **VA-1 (mayor, RF-007/RF-021/RF-027):** `_reserve` hace `return` sin reescribir cuando la reserva ya es de la misma bóveda (`vault_service.py:214`), así que un `_release` tardío la borra con el `_rev` viejo → bóveda activa sin reserva y un duplicado en otra capitalización (reproducido en CouchDB real con borrar+restaurar y con dos renombrados); confirmado leyendo el código. Corrección propuesta: reescribir la reserva sobre su `_rev` para que el `delete` tardío choque, y un test determinista que mate M4/M12. Menores: VA-2 cursor muy anidado → `RecursionError` 500 (latente tras uvicorn); VA-3 cursores no emitidos aceptados; VA-4 unicidad sólo con `lower()` (sin casefold/NFKC, requiere decisión de spec); VA-5 alias no canónicos de UUID aceptados; VA-6 `covers` sin `core/errors.py`, `main.py`, `api/vaults.test.ts`; VA-7 tests sin RF-; VA-8 tests débiles (M25, F12); VA-9 frontend (descripción de espacios enviada, error de campo sin `role="alert"`, fallo de `loadMore` oculta la lista, respuestas desfasadas); VA-10 caracteres de control aceptados en `name`. Sin aislamiento roto, If-Match y paginación resistieron. Repo sin tocar por el verificador. Por la regla de salida habrá nueva ronda (hay un mayor y su corrección cambia el comportamiento). Nada marcado `verified`; correcciones pendientes de aprobación del usuario.
  - [2026-10-13] Usuario: «Apruebo la enmienda, y para VA-4 y VA-10 la opción (a)». Rúbrica §2: revisa decisiones del spec → carril SDD (enmienda 1). Gate verde (1 aviso). T-052: SPEC-0003 enmienda 1 (§3 nombres equivalentes por NFKC + `casefold`, sin caracteres `Cc`, id canónico; RF-003, RF-005, RF-007, RF-014, RF-021, RF-025, §5, §6 E1/E2; `covers` + `api/vaults.test.ts`), PLAN-0003 §15 y bloque I de tasks (T-052…T-070).
  - [2026-10-13] T-053/T-054 (VA-1): `_reserve` como bucle optimista — escritura ciega la primera vez; ante choque relee: libre → reintenta, de otra bóveda viva → `VaultNameTaken`, propia u huérfana → reescribe sobre su `_rev` con `reserved_at` nuevo, de modo que un `_release` tardío choca. Doble en memoria con `before_next_get/put/delete`; 4 tests deterministas (borrar+restaurar, restauración terminada, renombrar y devolver, liberación que gana la carrera). Mutante M4 muerto.
  - [2026-10-13] T-055/T-056 (VA-4): `name_key` = NFKC + `casefold` en la reserva, `_holder` y `update`; «Straße»/«STRASSE», «café» NFC/NFD y «ΣΑΣ»/«σασ» equivalentes al crear, renombrar y restaurar (servicio y API 409).
  - [2026-10-13] T-057/T-058 (VA-10): `control_characters` en `FIELD_ERROR_MESSAGES`; `VaultName` con validador (categoría `Cc`) → 422 `#/name`.
  - [2026-10-13] T-059/T-060 (VA-2, VA-3): `decode_cursor` estricto — longitud máxima previa, ida y vuelta exacta, fecha con formato exacto e id canónico; manipulados y largos → 422.
  - [2026-10-13] T-061/T-062 (VA-5): `_load` sólo con UUID canónico (404 idéntico para alias); `format: uuid` en las 4 rutas; contrato 0003 re-exportado (único cambio: `format: uuid` ×4).
  - [2026-10-13] T-063 (VA-8): test de `_design/vaults` escrito una vez por base y proceso (mata M25). T-064…T-067 (VA-9, F12): `VaultForm` (`toDescription`, `role="alert"`), `useVaultPages` (generación que descarta respuestas desfasadas, `moreFailed` que conserva la lista), aviso en lista y Papelera, fecha visible en la Papelera; `useVaultPages.test.tsx` nuevo.
  - [2026-10-13] T-068/T-069: prefijos RF- en los tests (VA-7); READMEs de backend, adapters (404 al borrar → `RevisionConflict`) y frontend.
  - [2026-10-13] T-070 (cierre): evidencia — backend 410 passed + 1 `perf` deseleccionado, cobertura 99,12 %; `-m perf` 1/1; vitest 87/87, tsc limpio; gate verde (21 ok, 1 aviso). Tabla de cobertura con la evidencia y fila `spec-0003-enmienda-1`. Commit d730de9; anclas: SPEC-0003 y SPEC-0002 (comparte `core/schemas.py`) → d730de9. `state.md` al día.
  - [2026-10-13] Nueva ronda de verificación adversarial de 0003 lanzada (obligatoria por la regla de salida: VA-1 era mayor y la corrección cambia el comportamiento).
  - [2026-10-13] **Verificación adversarial 2 de 0003 → APPROVED con menores** (0 bloqueantes, 0 mayores; el verificador se cortó una vez por límite de uso y se reanudó). Evidencia: gate verde (21 ok, 1 aviso), backend 410 passed (cobertura 99 %), perf p95 32,5 ms, vitest 87/87, tsc limpio, contratos sin diff; estrés contra CouchDB real (12–16 hilos, nombres equivalentes, arrendamiento vencido) sin violaciones; 200 000 cursores emitidos aceptados; 49 mutantes, 41 muertos (frontend 17/17), vivos equivalentes M11, M19, M30. Menores: VB-1 sin test de unicidad pasado el arrendamiento (`_holder`, mutantes M4/M23; RF-007/021/025); VB-2 sin test del refresco de `reserved_at` al reescribir la reserva propia (M31; RF-021/025); VB-3 la ida y vuelta del cursor no se ejercita porque los casos superan la longitud máxima (M15/M17; RF-003); VB-4 límite `age < RESERVATION_LEASE` sin fijar (M24); VB-5 `plan.md` (§ líneas 82–146) y docstring de `VaultService` aún dicen `lower()`. Observación para la futura sincronización: ids no canónicos serían rechazados. Por la regla de salida no hace falta otra ronda. Repo sin tocar por el verificador. Pendiente: aprobación del usuario para corregir VB-1…VB-5; `verified` lo decide el usuario.
  - [2026-10-13] Usuario: «1. Apruebo. 2. Si, después continuas» (corregir VB-1…VB-5 y pasar 0003 a `verified`). Rúbrica §2: tests y docs dentro del plan aprobado (carril SDD, bloque J). Gate verde.
  - [2026-10-13] T-071…T-075: tests de unicidad pasado el arrendamiento al crear (nombres equivalentes) y al restaurar (VB-1), refresco de `reserved_at` al restaurar sobre la reserva propia vencida con una creación rival bloqueada (VB-2), cursores que caben en la longitud y sólo rechaza la ida y vuelta + límite exacto antes de `json.loads` (VB-3), fin del arrendamiento exactamente a los 30 s (VB-4); `plan.md`, nota P7 del spec y docstring de `VaultService` con `name_key` y el bucle optimista (VB-5). Mutantes M4, M23, M31, M15, M17 y M24 ahora mueren. Evidencia: backend 422 passed + 1 deselected, cobertura 99,12 %; `-m perf` 1/1; gate verde (21 ok, 1 aviso). Commit e5ec154.
  - [2026-10-13] 0003 → **`verified`** por decisión del usuario (spec, plan y tasks; `aprobaciones.verified`). Ancla SPEC-0003 → e5ec154 (SPEC-0002 no cambia: el commit sólo toca el servicio y tests de 0003). `state.md` al día.
  - [2026-10-13] **Session-End:** fase verified → 0003 `verified` por el usuario. Rebotes del verificador: 2 (ronda 1 REJECTED → enmienda 1, T-052…T-070; ronda 2 APPROVED con menores VB-1…VB-5 → T-071…T-075, sin nueva ronda). Directiva de Pausa: no. Drift / re-anchor: sí (0002 por `core/schemas.py`). Anclas movidas: SPEC-0003 → d730de9 → e5ec154; SPEC-0002 → d730de9. Gate verde (21 ok, 1 aviso: spectral). Docs: spec/plan (§15)/tasks 0003, spec 0002, backend/README.md, adapters/README.md, frontend/src/README.md, state.md, history.md. Decisiones del usuario: VA-4 NFKC + `casefold`, VA-10 rechazar `Cc`, 0003 `verified`. Próximo paso: el usuario elige entre limpieza de `docker-compose.yml` (backlog 2), siguiente feature (T-004/T-005/T-006 de `TAREAS.md`, purga de papelera RF-016, sincronización) o `@vitest/coverage-v8`; merge de PR #3 a cargo del usuario.

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

## [2026-10-13] Limpieza de `docker-compose.yml` (backlog 2) — hecho (prompt directo)

- Rúbrica: sólo config/infra, sin lógica ni contrato, alineado con la corrección del usuario
  ("almacén puro") → prompt directo.
- Fuera Qdrant y Gotenberg del compose y la dependencia `backend → qdrant`; fuera de
  `.env.example` las claves de Qdrant, LiteLLM, Ollama, OpenAI y Tavily; README con el stack real.
- Nuevo `frontend/Dockerfile` (Node 20 → nginx 1.27) + `nginx.conf` (réplica del proxy de
  `vite.config.ts`, incl. `/vaults` según `Accept`) + `.dockerignore` en backend y frontend.
- `docker-compose.dev.yml`: frontend sobre la etapa `build`; `vite.config.ts` lee `BACKEND_URL`
  (tipos en `tsconfig.node.json`, `@types/node` 20.19.43 fijado; script `typecheck`).
- Evidencia: imágenes construidas; enrutado de nginx probado contra un backend falso (SPA,
  `/vaults` HTML vs JSON, `If-Match`/`ETag`, `/auth`, `/admin`); suite del backend dentro de la
  imagen (Python 3.11, versiones fijadas): 414 pasan, `test_contract.py` necesita el repo;
  frontend 87/87, typecheck limpio; `docker compose config` válido.

## [2026-10-13] 0005-integration-real-db — Fase 1 abierta (borrador)

- Siguiente feature del camino crítico del sprint: T-006 de `TAREAS.md` + backlog 4 (control
  plane en PostgreSQL real, cierra la excepción a P5). Rúbrica: carril SDD (cruza servicios y
  cambia la infraestructura de pruebas).
- `specs/0005-integration-real-db/spec.md` en `draft`: contexto, alcance propuesto, RF-001…RF-003
  borrador y 3 `[NEEDS CLARIFICATION]` para el usuario. Comprobado: las migraciones Alembic forman
  una cadena lineal (dos archivos `001_*`, una sola raíz). Gate: 22 ok, 2 avisos (spectral; 0005
  sin archivos en `covers` todavía).
- Pendiente: respuestas del usuario para converger la Fase 1 (Gate 1).

## [2026-10-13] Cobertura del frontend — hecho (prompt directo)

- Rúbrica: herramienta de desarrollo/config, sin lógica ni contrato → prompt directo.
- `@vitest/coverage-v8` 2.1.2 (fijado igual que vitest); `vite.config.ts` con proveedor v8,
  `src/**` sin tests, informes text + html y umbral 80 % (líneas, sentencias, ramas, funciones),
  igual que `backend/.coveragerc`; `coverage/` en `.gitignore`; AGENTS.md y frontend/README.md
  con `npm run test:cov`.
- Evidencia: 87/87; cobertura 95,5 % líneas · 92,96 % ramas · 91,04 % funciones; con el umbral
  forzado a 99 % la ejecución falla (rc=1); typecheck limpio. Residual de 0003 cerrado.

## [2026-10-13] T-003 · Diagrama de arquitectura general — hecho (prompt directo)

- Rúbrica: documentación/diagrama, sin código ni contrato; `diagrams/**` está en los `covers`
  de 0003 → prompt directo, sin tocar su `spec.md` (`verified`).
- Archify `finalize architecture` (showcase, locale `es`, revisión `8acb3f4`): 8 componentes con
  evidencia del repo, 3 fronteras (navegador, servidor Compose, red `synapse_internal`), lo
  previsto (PouchDB, agentes OpenClaw) en línea discontinua. validate, deliver, check y
  browser-check en verde; visual-check en verde (claro/oscuro), capturas revisadas a ojo.
- Salidas: `architecture.html`, `architecture-light.png`, `architecture-dark.png`, candidato y
  recibos; índice y cómo regenerar en `diagrams/README.md`. Desviación: no hay `architecture.svg`
  suelto (la CLI no lo genera; sale del botón «Exportar» del HTML), y los links van en el README
  de `diagrams/`, no en `spec.md`.
- Entorno: al Chromium del host le faltan librerías del sistema; browser-check se corrió en el
  contenedor de Playwright con `ARCHIFY_CHROME_NO_SANDBOX=1`.
- `TAREAS.md` al día (T-001 implementada, T-002 completada, T-003 hecha, T-006 → SPEC-0005);
  `ARCHIFY.md` y `state.md` actualizados.

## [2026-10-13] Session-End

- **Fase alcanzada:** cuatro tareas encargadas por el usuario: limpieza de compose (hecho),
  SPEC-0005 en Fase 1 `draft` (esperando respuestas), cobertura del frontend (hecho), T-003 (hecho).
- **Rebotes:** ninguno en el carril SDD; incidencias de entorno con Chromium (resueltas en contenedor).
- **Gate:** verde (avisos conocidos: spectral; 0005 sin archivos en `covers`).
- **Docs:** README, frontend/README, AGENTS.md, ARCHIFY.md, TAREAS.md, state.md, `diagrams/README.md`.
- **Decisiones del usuario pendientes:** 3 `[NEEDS CLARIFICATION]` de SPEC-0005; merge de PR #3;
  SPEC-0002 → `verified`; revisar el diagrama T-003.
- **Próximo paso:** converger la Fase 1 de SPEC-0005 con las respuestas del usuario.

## [2026-10-13] 0005-sync (PouchDB ↔ CouchDB) — Fase 1 abierta (borrador)

- Petición del usuario: SPEC-0005 = sincronización. El número lo tenía el borrador de tests de
  integración (sin aprobaciones): renumerado a **0006-integration-real-db** (frontmatter, TAREAS.md).
- Descartado antes, a la espera del usuario: el tablero `.harness/TAREAS.md` ("Week 1
  Foundation") — contradice `state.md` (motor de sync propio, sobrescribe CLAUDE.md/AGENTS.md).
  Nunca se versionó y ya no está en el árbol.
- Rúbrica: carril SDD, Fase 1 (cruza frontend, backend y CouchDB; nueva frontera).
- `specs/0005-sync/spec.md` en `draft`: hechos del repo (CouchDB sólo con admin en la red
  interna; invariantes de 0003 aplicados por el servicio, con reservas `vault-name:*`), alcance
  propuesto, RF-001…RF-010 borrador, riesgos R-1…R-12 (incluye el hazard 1 y el 3), decisiones
  D-1…D-6 con alternativas y recomendación, 7 `[NEEDS CLARIFICATION]`.
- Diagrama Archify `diagrams/sync-flow.*` (workflow, opciones recomendadas): validate, deliver,
  check, browser-check y visual-check en verde; capturas revisadas. Un primer intento con 5
  carriles falló por altura (`composition/viewport-height`) → 3 carriles; un timeout CDP de
  Chrome en el contenedor se resolvió con `--ipc=host`.
- `state.md`, `ARCHIFY.md` y `TAREAS.md` actualizados.

## [2026-10-13] Session-End

- **Fase alcanzada:** SPEC-0005 (sync) en Fase 1 `draft`; SPEC-0006 (integración) en `draft`.
- **Rebotes:** ninguno.
- **Gate:** verde (avisos: spectral; `covers` de 0005/0006 aún sin archivos).
- **Docs:** `specs/0005-sync/` (spec + diagrams), `state.md`, `ARCHIFY.md`, `TAREAS.md`.
- **Decisiones del usuario pendientes:** D-1…D-6 y backoff/RNF-001 de 0005; las 3 de 0006; merge de PR #3; SPEC-0002 → `verified`.
- **Próximo paso:** converger la Fase 1 de 0005 con las respuestas del usuario (Gate 1).

## [2026-10-13] 0005-sync — decisiones D-1…D-6 aprobadas

- El usuario aprobó las recomendaciones D-1…D-6. D-2 se registró como la opción (a):
  lectura y escritura sin conexión con validación por documento en el push.
- ADR-002 (canal por proxy `/sync`, push validado, sólo `vault:*`) y ADR-003 (conflictos:
  merge automático por campo, el usuario decide si chocan, la edición gana al borrado), los dos `accepted`.
- `spec.md` reescrita: alcance cerrado (PWA fuera), §3 con las fronteras del proxy,
  RF-001…RF-018 en EARS (401/403 en `/sync` alineados con SPEC-0002 RF-019, conflictos
  RF-012…RF-015), R-13, RNF-003 (aislamiento), §8 con decisiones y descartes. Marcadores:
  7 → 4 (C-1 backoff, C-2 RNF-001, C-3 merge contra el ancestro, C-4 aviso al cerrar sesión).
- Diagrama `sync-flow` regenerado con la numeración nueva (Archify finalize + visual-check en verde).

## [2026-10-13] Session-End

- **Fase alcanzada:** SPEC-0005 en Fase 1 `draft`, con las decisiones D-1…D-6 aprobadas.
- **Rebotes:** ninguno.
- **Gate:** verde (avisos conocidos: spectral; `covers` de 0005/0006 aún sin archivos).
- **Docs:** `specs/0005-sync/spec.md`, `diagrams/`, ADR-002, ADR-003, `state.md`.
- **Decisiones del usuario pendientes:** C-1…C-4 y el «así es» de 0005; las 3 preguntas de 0006; merge de PR #3; SPEC-0002 → `verified`.
- **Próximo paso:** cerrar C-1…C-4 → Gate 1 de SPEC-0005.

## [2026-10-13] 0005-sync — aclaraciones C-1…C-4 aprobadas

- El usuario aprobó las recomendaciones C-1…C-4:
  - C-1 → RF-019 nuevo: con 503 o sin respuesta, "sin conexión" y reintentos de 1 s a 60 s;
  - C-2 → RNF-001: ≤ 5 s, medido con dos réplicas reales;
  - C-3 → RF-012/RF-013: merge contra el ancestro, tags como altas y bajas, sin ancestro decide el usuario;
  - C-4 → RF-017: aviso al salir ("Sincronizar y salir" / "Salir y descartar" / "Cancelar"; sin red, sólo las dos últimas).
- Registradas en §8 con sus descartes; ADR-003 enlaza C-3. Marcadores de aclaración: 0.
- `estado` sigue en `draft` y `fase_1` pendiente hasta el «así es» del usuario (no me autoapruebo).
- Diagrama `sync-flow` regenerado (tarjeta de estado); finalize y visual-check en verde.

## [2026-10-13] Session-End

- **Fase alcanzada:** SPEC-0005 lista para el Gate 1 (0 marcadores), a la espera del «así es».
- **Rebotes:** ninguno.
- **Gate:** verde (avisos conocidos: spectral; `covers` de 0005/0006 aún sin archivos).
- **Docs:** `specs/0005-sync/spec.md`, `diagrams/`, ADR-003, `state.md`.
- **Decisiones del usuario pendientes:** «así es» de 0005; las 3 de 0006; merge de PR #3; SPEC-0002 → `verified`.
- **Próximo paso:** con el «así es», Fase 2 (Plan) de SPEC-0005.

## [2026-10-13] 0005-sync — GATE 1 aprobado

- Usuario: «así es» → **GATE 1 aprobado**: `aprobaciones.fase_1` registrada, `estado: approved`.
- Sigue la Fase 2 (`plan.md`) de SPEC-0005.

## [2026-10-13] 0005-sync — PLAN-0005 en borrador (Fase 2)

- `specs/0005-sync/plan.md` creado (`draft`, `fase_2: pendiente`):
  - rutas exactas `/sync/` y `/sync/db/…`, comodín → 404, lista blanca de parámetros;
  - `_changes` en streaming async con selector `vault:*`;
  - push validado con códigos `reason` y lápidas sólo para cerrar ramas;
  - reserva por rama viva (`_holder` multi-hoja);
  - ancestro leído del árbol local;
  - merge determinista que converge;
  - cliente `src/sync/` (réplica, replicador con Web Lock, estado, rechazos, conflictos, diálogo de salida);
  - tests con dos réplicas PouchDB reales contra backend y CouchDB reales.
- Para el GATE 2, decisiones del usuario:
  - P-1: tocar código de SPEC-0003 (`verified`) y re-anclarla al cierre;
  - P-2: dependencia `pouchdb-browser`.
- P-3…P-5 se explican para confirmarlas.
- No me autoapruebo: `fase_2` sigue pendiente.

## [2026-10-13] Session-End

- **Fase alcanzada:** Fase 2 de SPEC-0005; el plan está listo para el GATE 2.
- **Rebotes:** ninguno.
- **Gate:** verde (avisos conocidos).
- **Docs:** `specs/0005-sync/plan.md`, `state.md`.
- **Decisiones del usuario pendientes:**
  - GATE 2 de 0005 con P-1/P-2;
  - las 3 de 0006;
  - merge de PR #3;
  - SPEC-0002 → `verified`.
- **Próximo paso:** con el GATE 2, fijar `covers` en el spec y empezar la Fase 3 (`tasks.md`).

## [2026-10-13] 0005-sync — GATE 2 aprobado

- El usuario aprobó el GATE 2 con P-1 opción (a) y P-2.
  - P-1 (a): se modifica el código de SPEC-0003 y se re-ancla al cierre.
  - P-2: dependencia `pouchdb-browser`.
- Plan en `approved` con `fase_2` registrada; P-3…P-5 confirmadas con el plan.
- En la spec: `fase_2` registrada y `covers` fijados según PLAN-0005 §9.
- Sigue la Fase 3 (`tasks.md`).

## [2026-10-13] Gate — `fm_list` acepta comentarios en la clave

- **Causa:** el aviso "0005-sync: sin covers[]" venía de un comentario YAML detrás de `covers:`, que la plantilla de spec también usa. `fm_list` sólo reconocía la clave si no había nada detrás.
- **Arreglo de raíz:** en `check.sh`, `fm_list` acepta `clave:  # comentario` y quita también los comentarios al final de cada ítem.
- Gate: 25 ok · 1 aviso (`spectral`) · 0 errores.

## [2026-10-13] 0005-sync — TASKS-0005 en borrador (Fase 3)

- `specs/0005-sync/tasks.md`: 84 tareas (T-001…T-084), con el test siempre antes que el código.
- Bloques A–L según PLAN-0005 §6:
  - A: contrato y errores;
  - B: filtros;
  - C: puertos, adaptadores y `leaves`;
  - D: `_holder`;
  - E: push validado;
  - F: rutas y aislamiento;
  - G: base del frontend;
  - H: replicación, estado, rechazos y conflictos;
  - I: UI y pantallas de 0003 sobre `vaultStore`;
  - J: nginx y vite;
  - K: sincronización real y rendimiento;
  - L: documentación y re-anclajes.
- Cobertura: RF-001…RF-019, RNF-001…003 y 9 filas de documentación, todas en `Pendiente`.
- `fase_3` queda pendiente; espera el GATE 3.

## [2026-10-13] Session-End

- **Fase alcanzada:** Fase 3 de SPEC-0005; `tasks.md` está listo para el GATE 3.
- **Rebotes:** ninguno.
- **Gate:** verde; único aviso, `spectral`.
- **Docs:** `tasks.md`, `state.md`, `check.sh`.
- **Decisiones del usuario pendientes:**
  - GATE 3 de 0005;
  - las 3 de 0006;
  - merge de PR #3;
  - SPEC-0002 → `verified`.
- **Próximo paso:** con el GATE 3, la Fase 4 empieza por el bloque A (T-001).

## [2026-10-13] 0005-sync — GATE 3 aprobado, con enmienda "sin nginx"

- El usuario aprobó `tasks.md` con una observación: sin nginx, porque el proxy inverso se gestiona fuera con Caddy.
- **Enmienda:**
  - plan §2.5, §6 paso 10, §7, §8 y §9: el mismo origen en producción lo da el Caddy externo, y en desarrollo Vite;
  - spec: nota de contexto;
  - T-067: pasa a `[doc]` con los requisitos del Caddy para `/sync/*` (mismo origen, `flush_interval -1`, sin límite de respuesta menor de 90 s).
  - La API no cambia.
- `state.md`: la corrección del usuario queda arriba. Queda pendiente decidir qué sustituye al nginx de `frontend/Dockerfile`, que sirve los estáticos y enruta `/auth`, `/admin` y `/vaults`; es un cambio fuera de 0005.
- `tasks.md` pasa a `approved` con `fase_3`. Empieza la Fase 4.

## [2026-10-13] 0005-sync — Fase 4: T-003…T-008 (errores y filtros)

- **T-003/T-004:**
  - `core/errors.py`: `SyncEndpointNotFound` (404, `sync-endpoint-not-found`) y `PayloadTooLarge` (413, `payload-too-large`).
  - Además `InvalidSyncRequest` (422 sin slug propio, textos fijos) para los parámetros y cuerpos mal formados del protocolo.
  - Test: `test_sync_errors.py`.
- **T-005…T-008:** `services/sync_filter.py`, con tests en `test_sync_filter.py` (59 tests):
  - `is_replicable_id`;
  - `changes_query`: lista blanca, `feed` ∈ {normal, longpoll}, esperas acotadas a 60 s y selector fijo;
  - recortes de `_revs_diff` y `_bulk_get`;
  - `all_docs_query`;
  - `sanitize_db_info`.
- **Hallazgo sobre CouchDB real:** `total_rows` y `offset` de `_all_docs` revelan el número de reservas, igual que `doc_count`. Se añadió `sanitize_all_docs_response`, que deja sólo filas de bóvedas, `total_rows` = filas devueltas y `offset` 0. Es la misma regla que el plan ya aplicaba a `db_info`, así que no cambia el diseño.
- **Comprobado contra CouchDB:** el rango `vault:`…`vault:￰` usa orden de bytes y deja fuera `vault-name:*`; `_bulk_get` devuelve un resultado por pedido, en orden.
- `vault_service.py` (0003, P-1): `is_canonical_uuid` e `is_timestamp` pasan a públicas para que la sincronización reutilice el mismo canon. Se re-ancla al cierre.
- T-001/T-002 (contrato) se hacen junto con las rutas (bloque F) para no dejar la suite en rojo entre commits.

## [2026-10-13] Decisión del usuario: FastAPI sirve la SPA

- El usuario eligió **FastAPI** para sustituir el nginx de `frontend/Dockerfile`: sirve los estáticos y enruta `/auth`, `/admin` y `/vaults` según `Accept`.
- Es un cambio fuera de 0005: llevará su propia spec después de esta feature.
- Registrado en `state.md`, en las correcciones del usuario y en el punto 2 del backlog.

## [2026-10-13] 0005-sync — Fase 4: T-009…T-015 (puerto de replicación y hojas)

- **T-009:** `core/ports/replication_port.py`, con `ReplicationPort` async.
- **T-010…T-012:** `test_sync_repository.py`, 43 tests contra CouchDB real. Las caídas, los 5xx/401 y los cortes a mitad de flujo se simulan con transportes de httpx.
- **T-013:** `adapters/replication_repository.py`.
  - Abre un `httpx.AsyncClient` por operación, para no atar el pool a un event loop.
  - `changes` hace streaming con `send(stream=True)`: un fallo al abrir se lanza antes de responder y uno a mitad, al iterar. Cierra cliente y respuesta en `finally`.
  - La lectura de un `longpoll` admite la espera pedida (≤ 60 s) más 10 s.
- **Hallazgos sobre CouchDB 3.5.2 real**, que corrigen supuestos míos (no del plan):
  - un `_local` no valida `_rev`: gana la última escritura, y un PUT sin `_rev` lo reinicia a `0-1`. El puerto refleja eso y no inventa un `RevisionConflict`, así que se descarta la idea de un 409 de catálogo para checkpoints en el bloque F.
  - `_revs_diff` añade `possible_ancestors`, que forma parte del protocolo y se reenvía tal cual.
- **T-014/T-015:** `VaultPort.leaves(db, doc_id)`, implementado con `GET doc?open_revs=all&revs=true` (`Accept: application/json`).
  - Devuelve las hojas vivas con `_revisions`, sin lápidas; si el documento no existe, una lista vacía.
  - El doble `InMemoryVaultPort` recibe un `leaves` mínimo (sin ramas) para que la suite siga en verde; T-016 le añade conflictos.
- Suite completa: **532 passed**.
- **Próximo paso:** bloque D (T-016/T-017, `_holder` sobre todas las hojas vivas).

## [2026-10-13] 0005-sync — Fase 4: T-016/T-017 (`_holder` con todas las hojas, P-4)

- **T-016:** `test_vault_service.py`.
  - El doble `InMemoryVaultPort` admite ramas perdedoras (`add_branch`), que sólo se ven con `leaves`, como en CouchDB.
  - 6 tests nuevos:
    - `create` y `restore` no toman un nombre que usa una rama perdedora, ni siquiera vencido el arrendamiento;
    - renombrar o borrar la ganadora conserva la reserva que la rama sigue usando;
    - una rama con `deleted_at` no retiene su nombre;
    - sin ramas, todo sigue igual.
  - Comprobado: 4 tests fallan sin el cambio del servicio.
- **T-017:** `VaultService._holder` (código de 0003, P-1) recorre `VaultPort.leaves` en vez de leer sólo la ganadora.
  - Esto cubre también `_release`: no se libera un nombre que aún usa una rama viva y activa.
  - Ningún test REST cambió.
- Suite completa: **538 passed**.
- **Próximo paso:** bloque E (T-018…T-023, `SyncPushService`).

## [2026-10-13] 0005-sync — Fase 4: T-018…T-023 (push validado, bloque E)
- **T-018:** `tests/test_sync_push.py` trae `InMemoryCouch`, un doble con árbol de revisiones.
  - Implementa `VaultPort` y `ReplicationPort` sobre los mismos datos.
  - Reproduce la ganadora determinista de CouchDB, `new_edits:false` con historia, `fail_next` y `before_next`.
- **T-019…T-021:** 80 tests: id, ya almacenada, lápidas, forma, campos, dueño, fechas, `created_at` inmutable, reservas, lote mixto, lotes intercalados, REST + sync con el mismo nombre y errores de escritura.
- **T-022/T-023:** `app/services/sync_push.py` (`SyncPushService.push` async).
  - Los 9 pasos de §2.3.
  - Proyección de hojas por lote.
  - Devuelve sólo los rechazos, en orden.
- Desviaciones registradas en PLAN-0005 §2.3 (notas de implementación):
  - servicio async y ruta `_bulk_docs` `async def`;
  - `reserve`/`release` públicos (re-anclaje de 0003 al cierre);
  - `_rev`/`_revisions` comprobados tras el id;
  - liberación también de los nombres reservados dentro del lote;
  - `_deleted` distinto de `true` → `validation-error:_deleted`.
- Rebote interno: la proyección era de la instancia y un segundo `push` veía hojas viejas.
  - Corregido de raíz: el estado es de cada lote.
  - Test que lo fija, rojo sin la corrección.
- Gate abierto (24 ok · 2 warn). Suite completa: **618 passed**.
- **Próximo paso:** bloque F (rutas `/sync`, T-001/T-002 contrato y `FEATURES`).

## [2026-10-13] 0005-sync — Fase 4: T-001, T-002, T-024…T-031 (rutas `/sync`, bloque F)
- **T-001/T-002:** contrato `0005-sync/contracts/openapi.yaml` y `"0005-sync"` en `FEATURES`.
  - Nuevos tests en `test_contract.py`:
    - el contrato documenta exactamente las 11 operaciones de §2.1, sin la comodín;
    - `BulkDocsRequest` y `BulkDocsRejection` son esquemas cerrados.
- **T-024…T-028:** `tests/test_sync_api.py` y `tests/test_sync_isolation.py` (37 tests).
  - Sesión: 401/403 en cada ruta y en la comodín.
  - Comodín: 404 sin llegar a CouchDB.
  - Filtrado de reservas y `_design`.
  - Push válido e inválido.
  - Límites de tamaño, incluido un cuerpo chunked.
  - Secuencia completa de PouchDB, reanudable e idempotente.
  - CouchDB caído → 503.
  - La sesión SQL se cierra antes del streaming.
  - Aislamiento A/B (RNF-003).
- **T-029…T-031:** `app/routers/sync.py` (`SyncRoute` con tope de cuerpo y comodín final), `CheckpointNotFound` en el catálogo y `include_router` en `main.py`.
- Desviaciones (a)–(g), registradas en PLAN-0005 §2.1 y §4:
  - (a) todas las rutas son async;
  - (b) tope de 4 MiB en todo el canal, 64 KiB en `_local`;
  - (c) `get_sync_user` con `get_db` en `scope="function"`;
  - (d) `CheckpointNotFound`;
  - (e) `_bulk_docs` y `PUT _local` responden 201;
  - (f) comodín también en `/sync`;
  - (g) `id` y `rev` del rechazo son `JsonValue`.
- Rebotes internos:
  - `_changes` GET+POST en un solo `api_route` duplicaba el operation id. Se separó en dos funciones.
  - Un cuerpo chunked de más de 4 MiB daba 400, porque FastAPI envuelve los errores de lectura del cuerpo.
    - Corregido de raíz: la ruta lee el cuerpo con el tope y se lo reproduce a FastAPI.
    - Después, el `receive` reproducido delega en el original, para que `StreamingResponse` siga recibiendo el `http.disconnect`.
- Suite completa: **659 passed**.
- **Próximo paso:** bloque G.

## [2026-10-13] 0005-sync — Fase 4: T-032…T-041 (cliente base, bloque G)
- **T-032:** `pouchdb-browser` 9.0.0 y, en desarrollo, `pouchdb-adapter-memory` 9.0.0 más sus tipos (`@types/*`, versiones exactas).
- **T-033:** batería común `backend/tests/fixtures/vault_rules_cases.json` y `test_sync_rules_mirror.py` (79 tests contra `_FIELD_RULES` y `name_key`).
- **T-034/T-035:** `sync/vaultRules.ts` y su test sobre la misma batería (81 tests).
- **T-036/T-037:** `sync/localDb.ts` (dueño en `_local/synapse-owner`, sin `auto_compaction`) y su test (7).
- **T-038/T-039:** `sync/vaultStore.ts` (list/get/create/update/softDelete/restore con la semántica de 0003) y su test (21).
- **T-040/T-041:** `sync/merge.ts` (ADR-003, función pura) y su test (22), con convergencia.
- Desviaciones (a)–(f), registradas en PLAN-0005 §2.5 (pendientes de visto bueno):
  - (a) tipos `@types/*` y `resolveJsonModule`;
  - (b) `strip` por `White_Space` (pydantic-core), longitudes en puntos de código, medidas antes de bajar a minúsculas;
  - (c) `nameKey` por tabla en vez de `toLocaleLowerCase`, con la salvedad de Unicode 17;
  - (d) `localDb` destruye siempre que el dueño no sea el `sub`;
  - (e) orden de errores de `vaultStore`;
  - (f) `merge`: paso 7 antes que el ancestro; reordenar tags no es edición; motivo del manual.
- Rebotes internos:
  - La batería marcaba inválido `"\u0085Notas\u001c\u001f"` en el servidor: el espejo usaba el `strip` de Python. Corregido de raíz con `\p{White_Space}` y casos separados.
  - Un caso de `merge.test` tenía la expectativa mal escrita (`tags: ["c"]` es quitar a y b, no añadir c); se corrigió el test, no el código.
- Frontend: **218 passed**, typecheck OK. Python espejo: 79 passed.
- **Próximo paso:** bloque H.

## [2026-10-13] 0005-sync — Fase 4: T-042…T-051 (replicador, estado, rechazos y conflictos, bloque H)
- **T-042/T-043:** `sync/remote.ts` (`/sync/db` absoluto, `credentials: "include"`, 401 → `refreshSession()` y un reintento, si no "sesión caducada") y su test (6).
- **T-044/T-045:** `sync/replicator.ts` (`live`, `retry`, `batch_size: 50`, `backOff` 1 s → 60 s, Web Lock `synapse-sync` + `BroadcastChannel`, saludo para pestañas nuevas) y su test (13).
- **T-046/T-047:** `sync/status.ts` (en línea / sin conexión / sincronizando / pendientes / sesión caducada; `_local/synapse-sync-state` con `last_sync_at` y `push_seq`) y su test (12).
- **T-048/T-049:** `sync/rejections.ts` (`_local/synapse-rejections`, una entrada por documento, se limpia con `written`) y su test (8).
- **T-050/T-051:** `sync/conflicts.ts` (barrido al arrancar + `changes`, ancestro del árbol local, `mergeVault`, hija de W + lápida de L en un `bulkDocs` con `new_edits: false`, lista manual y `resolve`) y su test (13).
- Desviaciones (a)–(i), registradas en PLAN-0005 §2.5 (pendientes de visto bueno):
  - (a) URL absoluta y `skip_setup`;
  - (b) escucha `sync.push`/`sync.pull` (no tipados);
  - (c) saludo entre pestañas;
  - (d) reinicio de la espera a cargo de PouchDB (se comprueba en el bloque J);
  - (e) estado inicial "sincronizando", `error` = sin conexión, pendientes por `checkpoint`, `push_seq` en el documento de estado, contadores en `SyncProvider`;
  - (f) *upsert* con reintento ante 409 en los `_local` compartidos;
  - (g) rechazos: se limpian con cualquier revisión escrita del id;
  - (h) conflictos con `new_edits: false` (un `bulkDocs` normal podía cerrar L sin combinarla);
  - (i) `resolve()` en `conflicts.ts`; `ID_PREFIX` exportado de `vaultStore`.
- Rebotes internos:
  - Una pestaña nueva no recibía estado con el líder parado. Se añadió el saludo con dos tests.
  - `conflicts`: los suscriptores recibían avisos repetidos con la misma lista. Ahora sólo se avisa si la lista cambia.
- Frontend: **270 passed**, typecheck OK.
- **Próximo paso:** bloque I (UI, T-052…T-066).
- **Visto bueno del usuario (2026-10-13)** a las desviaciones (a)–(i) del bloque H.

## [2026-10-13] 0005-sync — Fase 4: T-052…T-066 (UI de sincronización y bóvedas sobre la réplica, bloque I)
- **T-052/T-053:** `sync/SyncProvider.tsx` + `sync/useSync.ts` (réplica, replicador, estado, rechazos, conflictos, `vaults`, `dataVersion`, `requestLogout`) y su test.
- **T-054/T-055:** `sync/SyncStatusBar.tsx` (región "Sincronización", textos por estado, última sync, enlaces con contador) y su test.
- **T-056/T-057:** `sync/RejectionsPage.tsx` (motivo por código, "Corregir") y su test.
- **T-058/T-059:** `sync/ConflictView.tsx` (campo a campo, elegir/combinar, valida con `vaultRules`, `conflicts.resolve`) y su test.
- **T-060/T-061:** `sync/LogoutDialog.tsx` (sin conexión / sincronizar y salir / salir igual / cancelar) y su test.
- **T-062/T-063:** `vaults/*` sobre `vaultStore` (P-1): páginas de 50 en memoria, recarga silenciosa con `dataVersion`, `errors.ts` (vista desfasada, cuota agotada), `vaults/fields.ts` compartido; `test-utils/sync.tsx` (`syncValue`, `WithSync`, `memoryEnv`, `seedStore`). 43 tests de bóvedas.
- **T-064/T-065:** `App.tsx` (`SyncScope` con `key={user_id}`, `paused` con `must_change_password`, rutas `/rejections` y `/conflicts`, prop `syncEnv`) y `layout/AppLayout.tsx` (barra, `LogoutDialog`, `requestLogout`). 18 tests App/layout.
- **T-066:** retirados `api/vaults.ts` y `api/vaults.test.ts` (sin importadores; la API REST sigue para agentes); `frontend/src/README.md` actualizado.
- Desviaciones (a)–(i) registradas en PLAN-0005 §2.5 (pendientes de visto bueno).
- Rebotes internos:
  - El `wrapper` de `renderHook` no recibe props: `useVaultPages.test` usa un componente `Probe` con `render`/`rerender`.
  - Un test de logout esperaba el encabezado "Iniciar sesión"; el de la pantalla es "Synapse" (se corrigió el test).
- Frontend: **329 passed** (25 archivos), typecheck OK.
- **Próximo paso:** bloque J (T-067…T-068).
- **Visto bueno del usuario (2026-10-13)** a las desviaciones (a)–(i) del bloque I.

## [2026-10-13] 0005-sync — Fase 4: T-067…T-068 (mismo origen, bloque J)
- **T-067:** `backend/README.md`, sección "Despliegue: proxy inverso externo": Caddy externo en el mismo origen que la SPA, `/sync` y `/sync/*` al backend, `flush_interval -1`, ningún tiempo límite < 90 s (longpoll acotado a 60 s); ejemplo orientativo de Caddyfile; sin nginx.
- **T-068:** `frontend/vite.config.ts`: `"/sync": BACKEND` (sin `bypass`: `/sync` no es ruta de la SPA). Comprobado con el servidor de Vite: `/sync/` se reenvía al backend.
- Sin desviaciones. Typecheck OK.
- **Próximo paso:** bloque K (sincronización real, T-069…T-075).

## [2026-10-13] 0005-sync — Fase 4: T-069…T-075 (sincronización real, bloque K)
- **T-069:** `frontend/scripts/sync-integration.sh` (SQLite temporal + `alembic upgrade head`, uvicorn en puerto libre, CouchDB de test, borra sólo las `synapse_user_*` que creó) + `npm run test:sync` / `test:sync:perf`; `vitest.sync.config.ts`; `test-utils/{integration-setup,integration-global,device}.ts`.
- **T-070…T-074:** `sync/{offline,rejections,conflicts,session,isolation}.integration.test.ts` — 14 tests en 5 archivos contra backend y CouchDB reales.
- **T-075:** `sync/sync.perf.integration.test.ts` — p95 ≈ 360–400 ms (umbral 5 s).
- Código de la app: costura `fetch`/`refresh` en `remote.ts` (+ tests) y `sync/resources.ts` extraído de `SyncProvider`.
- Desviaciones (a)–(l) registradas en PLAN-0005 §2.5 (pendientes de visto bueno). La (i) es un defecto de PouchDB 9 (`src.info().then` sin `catch`) rodeado sólo en las pruebas; decisión pendiente sobre reportarlo y/o corregirlo en la app.
- Rebotes internos:
  - `self is not defined` (pouchdb-browser en Node) → se define antes de cargarlo.
  - El estado "sin conexión" no llegaba: el longpoll seguía vivo tras las cabeceras → la petición cuenta como en curso hasta terminar el cuerpo.
  - `synced()` se adelantaba al "pendientes" → espera al `push_seq` persistido.
  - El primer rodeo del defecto de PouchDB parcheaba `PouchDB.prototype.info`, pero PouchDB asigna `info` por instancia: no tenía efecto (verde por suerte). Ahora envuelve el adaptador `http` y observa también la promesa derivada.
  - Corte a mitad de lote: la espera de "sin conexión" ya se cumplía antes del corte → se espera al corte mismo.
- READMEs de `frontend/` y `frontend/src/` actualizados.
- Frontend: **331 passed** (suite normal), integración **14 passed** (dos corridas seguidas sin rechazos sin manejar), perf **1 passed**; typecheck OK.
- **Próximo paso:** bloque L (T-076…T-084).
- **Visto bueno del usuario (2026-10-13)** a las desviaciones (a)–(l) del bloque K. Sigue abierta la decisión sobre el defecto de PouchDB (i): reportarlo aguas arriba y/o corregirlo en la app.

## [2026-10-13] 0005-sync — Fase 4: T-076…T-084 (documentación y re-anclajes, bloque L)
- **T-076:** contrato `0005-sync/contracts/openapi.yaml` al día (`test_contract.py` 11 passed); `BulkDocsRejection.reason` con los 7 códigos de §2.3; 401/403/413/422/503 (y 404 de checkpoint) como `Problem`. `sync-endpoint-not-found` sólo lo da la ruta comodín, que §4 deja fuera del contrato.
- **T-077:** `backend/README.md`: sección "Sincronización (SPEC-0005)" (capas, aislamiento, lista blanca, sólo bóvedas, push validado, límites, tabla de `reason` y de rutas); catálogo de errores con `sync-endpoint-not-found`, `checkpoint-not-found`, `payload-too-large`; `0005-sync` en "Contratos OpenAPI por feature".
- **T-078:** README de `core/ports` (`ReplicationPort`, `VaultPort.leaves`), `adapters` (`ReplicationRepository`, `leaves`), `services` (`VaultService._holder`, `sync_filter`, `sync_push`) y `routers` (`sync.py`).
- **T-079:** `frontend/src/README.md`: tabla de módulos de `sync/` (estados, rechazos, conflictos, salida), proxy `/sync` de Vite y requisitos del Caddy externo.
- **T-080:** cubierta en el bloque K: `frontend/README.md` documenta `npm run test:sync`, `test:sync:perf` y `sync-integration.sh`.
- **T-081:** candidato del diagrama al día (canal `/sync`, push validado, motivos, `merge.ts`/`ConflictView`, tarjeta "Estado"). `validate` rechazó subtítulos que no cabían (`layout/constraint`) y un pasillo ambiguo por la etiqueta larga del push (`composition/ambiguous-corridor`): se acortaron (`POST _bulk_docs`, `GET _changes`, `JWT → synapse_user_{id}`, `reglas de SPEC-0003`) sin tocar la geometría. Chromium del host sin librerías (`libatk…`) → `finalize` y `visual-check` en el contenedor `mcr.microsoft.com/playwright:v1.56.0-jammy` (`headless_shell`, `ARCHIFY_CHROME_NO_SANDBOX=1`), nada instalado: validate/deliver/check/browser-check en `pass`; PNG 2048×1320 claro/oscuro. `diagrams/README.md` con estado implementado y el comando exacto.
- **T-082:** `ARCHIFY.md`: estado del diagrama de sync (implementación, pendiente Fase 5) y casilla del Sprint 4.
- **T-083:** re-anclajes con nota, sin cambio de requisitos: SPEC-0003 → `461517f` (P-1: pantallas sobre la réplica, `leaves`/`_holder` multi-rama; `api/vaults.ts` y su test retirados salen de `covers`); SPEC-0002 → `461517f` (`App.tsx`, `RequireAuth`, `AppLayout`, `export_openapi.py`, `test_contract.py`).
- **T-084:** `state.md`: fila de 0005 `implemented`, hazards 1 y 3 mitigados (2 reforzado), próximo paso (Fase 5 y decisiones abiertas).
- [2026-10-13] **Cierre de la Fase 4:** backend **738 passed** (1 `perf` deseleccionado), frontend 331 + integración 14 + perf 1 (bloque K). Tabla de cobertura: RF-001…RF-019, RNF-001…RNF-003 y contrato en `Pass`, docs en `hecho`. SPEC/PLAN/TASKS-0005 → `implemented` (precedente: T-051 de 0003); ancla de 0005 → `461517f`; `anchor_mode` sigue `advisory` como en 0002/0003. Ajuste del gate (`check.sh` §2): contaba como RF propios las referencias a RF de otras specs (RF-021/025/027 de 0003 en el §1 de 0005 → "19/22"); ahora cuenta sólo las definiciones `- **RF-NNN**` de la plantilla (0002: 23, 0003: 28, 0004: 14, 0005: 19, sin cambios en las demás). Gate verde (2 avisos: history.md > 600 líneas, spectral).
- **Session-End (2026-10-13):** fase implement → 0005 `implemented` (bloque L completo, T-076…T-084; Fase 4 cerrada). Rebotes del verificador: 0 (verificación adversarial de 0005 aún no ejecutada). Directiva de Pausa: no. Drift / re-anchor: sí (0002 y 0003 por P-1 y archivos compartidos). Anclas movidas: SPEC-0002, SPEC-0003 y SPEC-0005 → 461517f. Gate verde (2 avisos). Docs: backend/README.md, READMEs de capas, frontend/src/README.md, diagrama de sync y su README, ARCHIFY.md, specs 0002/0003 (notas), spec/plan/tasks 0005, state.md, history.md, gate. Nada marcado `verified`. Decisiones abiertas para el usuario: defecto de PouchDB 9 (upstream y/o app), preguntas de 0006, merge de PR #3 y SPEC-0002 → `verified`, consolidar history.md, `frontend/README.md` aún describe nginx. Próximo paso: verificación adversarial de 0005 (Fase 5), con el usuario.

## [2026-10-13] 0005-sync — Fase 5: verificación adversarial
- [2026-10-13] Usuario: «Doy visto bueno, inicia la verificación de 0005» (visto bueno al bloque L, al ajuste del gate y a `anchor_mode` en `advisory`). Se lanza el subagente verificador (sólo lectura) sobre HEAD `4476820`.
- [2026-10-13] Subagente verificador (sólo lectura) sobre HEAD `4476820`: veredicto **REJECTED** (0 bloqueantes, 3 mayores, 5 menores). Gate verde (24 ok · 2 avisos), backend 738 passed, vitest 331, typecheck limpio, integración 14/14, perf 1/1 (p95 356 ms). ~60 ataques HTTP al canal: ninguno cruza usuarios. Mutaciones: backend 12/13 detectadas (sobrevive `MAX_BULK_DOCS=2000`), frontend 8/10 (sobreviven las dos condiciones de `pushOnce`). Mayores: **VC-1** `_local/..` (y `%2E%2E`) normaliza a la raíz de la base propia y devuelve el db info sin sanear (nombre real, `doc_count`, `sizes`; `PUT _local/..` → `PUT` de la base con credencial admin) — rompe RF-004; **VC-2** dos dispositivos que resuelven el mismo conflicto a la vez dejan un rechazo `delete-not-allowed` persistente (revs aleatorias en `conflicts.ts`, `_check_tombstone`), bloquea "Sincronizar y salir" — lo produce el cliente oficial, fuera del residual P-5; **VC-3** la guarda de `pushOnce` (sin rechazos y `last_seq` ≥ local) antes de borrar la réplica al salir no la protege ningún test (RF-017/018). Menores: VC-4 `LogoutDialog.test.tsx` inestable (4/6 corridas) y su helper puede salir de verdad; VC-5 entradas del cliente → 503 con traza ERROR (`_rev` no hexadecimal, `_local` con `_deleted`, `_local/.`); VC-6 tests de límites atados a la constante, no a 200 / 4 MiB / 64 KiB; VC-7 decisión del defecto de PouchDB 9 abierta; VC-8 el gate da por buena una spec `implemented` con 0 RF definidos. Repo intacto, worktree retirado, CouchDB de test limpio. Pendiente de decisión del usuario. No se marca nada `verified`.

## [2026-10-13] 0005-sync — Enmienda 1 (correcciones de la verificación adversarial)
- [2026-10-13] Usuario: «Te doy visto bueno. Sobre V-7 haz lo que propones». T-085: enmienda 1 de SPEC-0005 (RF-003 ids `_local`, RF-015 revisiones deterministas, RF-017 estado actual, §5 dos casos límite), PLAN-0005 §10 (+ §2.5 (i) decidida: contención en la app; P-5; §9) y bloque M de `tasks.md` (T-085…T-101, cobertura al día). Sondeo contra CouchDB 3: `%2E` se decodifica, los `_local` no comprueban la revisión (no hay 409 que traducir), `_deleted` en `_local` da 200 y un `_rev` mal formado 400/500.
- [2026-10-13] T-086…T-088 (VC-1): tests en rojo (`_local/%2E%2E`, `%2E`, `a%20b`, `a%2Fb`, 129 caracteres → 404 sin llegar al puerto; adaptador con `..` y `.` contra CouchDB real); `sync_filter.checkpoint_id` (formato de PouchDB) como dependencia de las dos rutas `_local` con `SyncEndpointNotFound` declarado; `_local_path` codifica `.` como `%2E`. Contrato 0005 re-exportado. `test_sync_api` + `isolation` + `contract` + `repository` + `filter` verdes.
- [2026-10-13] T-089…T-091 (VC-5, VC-6): revisiones del push sólo hexadecimales (`1-zz`, `1-AAA` → `validation-error:_rev`; ancestro `zz` → `validation-error:_revisions`; el caso de lápida con padre desconocido pasa a `2-fff`); cuerpo de `PUT _local/{id}` validado en `sync_filter.check_checkpoint_doc` (claves `_*` fuera de `_id`/`_rev`, `_id` ≠ ruta, `_rev` ≠ `0-N` → 422 sin llegar a CouchDB; el checkpoint tal como lo escribe PouchDB se guarda). Tests de límites con literales a ambos lados (201/200 docs, 4 MiB ± 1, 64 KiB ± 1); la mutación `MAX_BULK_DOCS=2000` (y `MAX_LOCAL_BYTES=65 KiB`) ahora se detecta. Contrato re-exportado; redacción `invalid-rev` corregida en plan §10 y T-089.
- [2026-10-14] T-092, T-093 (VC-2): `conflicts.test.ts` en rojo (misma resolución automática y manual en dos réplicas, relojes distintos → mismas lápidas; revs de 32 hex) y `child()` determinista: SHA-256 del JSON canónico `{parent, content}` recortado a 32 hex. Lápidas iguales coinciden en todas las réplicas; las dos hijas de W que difieren en `updated_at` las cierra el paso 7 de `mergeVault`. 16 passed.
- [2026-10-14] T-094 (VC-2): integración con dos dispositivos que resuelven a la vez el mismo conflicto sin red → convergen en la misma revisión, sin conflictos ni rechazos y `pushOnce` = `true` en ambos. Con `child()` revertido a hash aleatorio la prueba falla (queda el rechazo): mutación detectada y código restaurado.
- [2026-10-14] T-095 (VC-3): `resources.test.ts` (réplica, estado y rechazos reales; push falso) con 6 casos de `pushOnce`. Mutaciones: quitar la condición de rechazos, la de `last_seq`, la de `doc_write_failures` o el `await` de los manejadores → cada una rompe al menos un test; código restaurado.
- [2026-10-14] T-096 (VC-3): integración «Sincronizar y salir» con un nombre ya tomado → `pushOnce` = `false`, el rechazo queda y la réplica (bóveda y dueño) intacta; tras renombrar, `true`. Primer intento creaba el duplicado después de recibir el del portátil y la regla local lo impedía: se ordenó la creación del móvil antes.
- [2026-10-14] T-097 (VC-4): `status.refresh()` y `rejections.settled()` con tests en rojo; defecto latente encontrado y corregido de raíz: las colas `writes = writes.then(...)` quedaban rechazadas para siempre tras un fallo → patrón `run`/`catch`, con test.
- [2026-10-14] T-098 (VC-4): `requestLogout` asíncrona decide con el estado actual (espera rechazos en curso, relee la secuencia; un rechazo cuenta como no confirmado). `LogoutDialog.test.tsx` espera un estado observable antes de pulsar; nuevo test con la pantalla desfasada. 6/6 corridas estables.
- [2026-10-14] T-099 (VC-7): `ObservedPromise`/`observeInfo` pasan a `remote.ts` (`createRemoteDb`), fuera de `integration-setup.ts`; `remote.test.ts` en rojo → verde (sin rechazos sin manejar; quien espera `info()` sí recibe el rechazo).
- [2026-10-14] T-100 (VC-8): `check.sh` §2 da ❌ a una spec `implemented`/`verified` sin ningún `- **RF-NNN**`; probado en una copia con una spec vacía, y las specs reales siguen verdes.
- [2026-10-14] T-101: READMEs (`backend/` checkpoints `_local` y revisiones hex; `services`/`adapters`; `frontend/src/` revisiones deterministas, contención de PouchDB, `refresh`/`settled`, `requestLogout`, `pushOnce`); tabla de cobertura con `resources.test`, `remote.test`, `status.test`, `rejections.test` e integraciones nuevas. Contrato ya re-exportado (T-088/T-090).
- [2026-10-14] Cierre del bloque M: backend 767 passed (1 `perf` deseleccionado), frontend 349 passed, integración 16/16, typecheck limpio; aviso de `act` del test nuevo de `LogoutDialog` corregido (espera el render final). Gate verde (24 ok · 2 avisos). Commit `ba54882` empujado a `feature/sprint-1-auth`.

## [2026-10-14] 0005-sync — Fase 5: verificación adversarial 2
- [2026-10-14] Subagente verificador (sólo lectura, worktree) sobre HEAD `ba54882`: veredicto **APPROVED** (0 bloqueantes, 0 mayores, 5 menores). VC-1…VC-8 corregidos de raíz (VC-4 con cobertura parcial). Gate verde, backend sync+contrato 342 passed, vitest 349, integración 16/16. Mutaciones: 13/15 detectadas; sobreviven F5 (`result.ok` → `true` en `pushOnce`) y F7 (sin `rejections.settled()` en `requestLogout`). Aislamiento por HTTP contra el backend real: variantes de punto y codificadas (`..`, `%2E%2E`, `%252E%252E`, `..%2F…`, `..;`) → 404; sin fugas en `_bulk_get`/`_all_docs`/`_revs_diff`/`_changes`/`_bulk_docs`. Menores: **VD-1** ningún test detecta quitar `settled()` (rechazo en escritura + salir → salida sin aviso, RF-017); **VD-2** ningún test con `ok:false` y 0 fallos; **VD-3** `requestLogout` sin `try/catch` (si fallan `refresh`/`settled`, rechazo sin manejar y el botón no hace nada); **VD-4** `canonical()` sin test de orden de claves ni de `undefined` (en arrays da `[1,]`, determinista pero no JSON); **VD-5** (previo) 409 en `put_local` → 503, y `rf_cov` del gate cuenta cualquier RF de tasks.md. Worktree retirado, CouchDB de test limpio. Pendiente de decisión del usuario. No se marca nada `verified`.
- **Session-End (2026-10-14):** fase verify → 0005 `implemented`, enmienda 1 completa (T-085…T-101) y verificación 2 APPROVED con menores VD-1…VD-5. Rebotes del verificador: 1 (ronda 1 REJECTED). Directiva de Pausa: no. Drift / re-anchor: no (advisory, covers de 0005 cambiaron por la enmienda; sin mover anclas). Gate verde (2 avisos: history.md > 600 líneas, spectral). Docs: spec/plan/tasks 0005, contrato 0005, backend/README.md, READMEs de services/adapters, frontend/src/README.md, check.sh, state.md, history.md. Decisiones: VC-7 contenido en la app (usuario). Nada marcado `verified`. Próximo paso: el usuario decide sobre VD-1…VD-5 (propuesta: corregirlos con la enmienda 2 sin nueva ronda, como VB-1…VB-5 en 0003) y sobre SPEC-0005 → `verified`; siguen abiertas las preguntas de 0006, el merge de PR #3, SPEC-0002 → `verified`, consolidar history.md, `frontend/README.md` con nginx y reportar el defecto de PouchDB upstream.

## [2026-10-14] 0005-sync — Enmienda 2 (menores de la verificación 2, VD-1…VD-5)
- [2026-10-14] Usuario: «Arranca con la enmienda» (propuesta: corregir VD-1…VD-5 con la enmienda 2). T-102: enmienda 2 de SPEC-0005 (RF-017: sin estado legible de la réplica se avisa; §5 ese caso), PLAN-0005 §9 y §11, bloque N de `tasks.md` (T-102…T-109) y cobertura al día. Sondeo contra CouchDB 3: `PUT _local` con o sin `_rev`, viejo o adelantado → siempre 201 (nunca 409).
- [2026-10-14] T-103, T-104 (VD-1, VD-3): `resources.test.ts` en rojo (`hasUnconfirmed` inexistente) → `hasUnconfirmed(resources)` en `resources.ts` (espera `rejections.settled()`, relee con `status.refresh()`, cuenta rechazos; si la réplica no puede leerse, registra y devuelve `true`); `requestLogout` de `SyncProvider` la usa. Mutaciones: sin `settled()` → 1 falla (3/3 corridas); sin el `catch` → 1 falla. Código restaurado.
- [2026-10-14] T-105 (VD-2): `pushOnce` con `ok: false`, 0 fallos y secuencia recorrida → `false`; la mutación `result.ok` → `true` ahora se detecta.
- [2026-10-14] T-106 (VD-4): `canonical()` exportada y probada (orden de claves, `undefined` en objetos y en listas, escape); en rojo con el código anterior (`[1,]`), corregida a `null` como `JSON.stringify`. Mutación sin ordenar claves → detectada. Ninguna revisión real cambia (`tags` son textos).
- [2026-10-14] T-107 (VD-5): el 409 entra en `test_rf_019_unexpected_status_raises_storage_unavailable` (8 casos nuevos, 55 passed en `test_sync_repository`); comentario de `_check_status` corregido (venía copiado de `vault_repository`). Decisión: 409 → 503 como cualquier respuesta inesperada; traducirlo sería código para algo que CouchDB no produce.
- [2026-10-14] T-108 (VD-5): `check.sh` §2: `rf_cov` = RF definidos por la spec ∩ filas de la tabla (`comm -12`). Probado en una copia aislada: spec con RF-001/RF-002 y tabla con RF-001/RF-999 → antes ✅ "2 RF", ahora ❌ "1/2". Specs reales sin cambios (23/28/14/19).
- [2026-10-14] T-109: `frontend/src/README.md` (`hasUnconfirmed`, aviso sin estado legible, `canonical()`), `backend/app/adapters/README.md` (409 → `StorageUnavailable`).
- [2026-10-14] Cierre del bloque N: backend 775 passed (1 `perf` deseleccionado), frontend 358 passed, integración 16/16, typecheck y lint limpios. Gate verde (2 avisos: history.md > 600 líneas, spectral).
- **Session-End (2026-10-14):** fase implement (enmienda 2) → 0005 `implemented`, bloque N completo (T-102…T-109). Rebotes del verificador: 0 en esta sesión (sin nueva ronda por ahora). Directiva de Pausa: no. Drift / re-anchor: no (advisory; spec y covers cambiaron juntos). Gate verde. Docs: spec/plan/tasks 0005, frontend/src/README.md, backend/app/adapters/README.md, check.sh, state.md, history.md. Decisiones: VD-5 409 → 503 sin código nuevo. Nada marcado `verified`. Próximo paso: el usuario decide si VD-3 (cambia el comportamiento en una ruta de error) pide una ronda corta de verificación o pasa SPEC-0005 a `verified`.

## [2026-10-14] 0005-sync — Fase 5: verificación adversarial 3 (ronda corta, bloque N)
- [2026-10-14] Usuario: «Haz lo que me recomiendas de la ronda corta». Se lanza el subagente verificador (sólo lectura, worktree) sobre HEAD `c55a292`, acotado a la enmienda 2 (T-102…T-109); motivo: VD-3 cambia el comportamiento en una ruta de error (regla de salida, `method.md` §3 Fase 4).
- [2026-10-14] Subagente verificador (sólo lectura, worktree) sobre HEAD `c55a292`: veredicto **REJECTED** (0 bloqueantes, 1 mayor, 5 menores). Gate verde, typecheck limpio, `src/sync` 267 passed ×6, `resources.test` 11 ×8 estable, backend sync 101 passed. Mutaciones de código 7/7 detectadas; la del gate (`rf_cov` viejo) sobrevive (sin tests automáticos; probado a mano en copia: nuevo 1/3 → ❌, viejo 4/3 → ✅). **VE-1 (mayor):** en el escenario de VD-3 (réplica ilegible), «Salir y descartar» cierra la sesión en el servidor pero `exit()` sólo protege `logoutSession()`: si `close`/`destroyLocalDb` fallan, `leaving` queda en `true`, fase `exiting` para siempre, sin `navigate`, rechazo sin manejar y la réplica sigue en el dispositivo (defecto previo de `exit()`, al que la enmienda 2 encamina el caso de §5). **VE-2:** el aviso dice «Hay cambios sin sincronizar» sin explicar que la réplica no se pudo leer; «Sincronizar y salir» falla con el texto de rechazos aunque hay 0. **VE-3:** sin test de proveedor/UI para la ruta de VD-3. **VE-4:** fila de `resources.ts` en la tabla del README sin `hasUnconfirmed`. **VE-5:** el docstring de `canonical()` promete «siempre JSON» (falso con funciones, `Date`, `undefined` raíz). **VE-6 (preexistente):** `VaultListPage.test.tsx` RF-009 inestable (2/8 corridas de la suite). Nota: el frontend no tiene lint (la entrada anterior lo citaba). Árbol limpio. Pendiente de decisión del usuario. No se marca nada `verified`.

## [2026-10-14] 0005-sync — Enmienda 3 (correcciones de la verificación 3, VE-1…VE-5)
- [2026-10-14] Usuario: «Opción a, el VE-6 trátalo aparte». VE-1 con la opción (a): si el servidor ya cerró la sesión y la réplica no se borra, ir al login con el aviso «No se pudo borrar la copia local de este dispositivo», sin bloquear; RF-018 la borra si entra otro usuario y el mismo la reutiliza. VE-6 al backlog (8) como tarea propia.
- [2026-10-14] T-110: enmienda 3 de SPEC-0005 (RF-017: aviso propio con la réplica ilegible y sin «Sincronizar y salir»; ir al login con el aviso si el borrado falla; §5 ese caso), PLAN-0005 §9 y §12 (alternativas descartadas: (b) quedarse en el aviso con reintento, sesión ya cerrada; (c) borrar antes de cerrar la sesión, contradice RF-017), bloque O de `tasks.md` y cobertura (RF-015, RF-017, RF-018).
- [2026-10-14] T-111, T-112 (VE-2): `resources.test.ts` en rojo (4 fallos) → `unconfirmedState()` (`none`/`pending`/`unreadable`) sustituye a `hasUnconfirmed()`; `LogoutState.reason`; `requestLogout` lo usa.
- [2026-10-14] T-113, T-114 (VE-1, VE-3): `LogoutDialog.test.tsx` con la réplica real en error (espía sobre la instancia que abre `openLocalDb`: `info()` es propio de cada instancia de PouchDB, el espía de prototipo no la alcanza) y `destroyLocalDb`/`replicator.stop` en error. `exit()` captura el fallo del borrado, lo registra y navega a `/login` con `{ localCopyKept: true }`; ya no rechaza. La limpieza del efecto de apertura registra un `close()` fallido (la misma promesa memoizada volvía a rechazar al desmontar). `LogoutDialog` con título y texto propios para `unreadable`. Mutaciones: sin el `catch` del borrado → 4 fallos y rechazos sin manejar; sin el `catch` de la limpieza → 1; sin el estado al navegar → 3; `canSync` sin el motivo → 1; texto fijo → 1. Código restaurado.
- [2026-10-14] T-115 (VE-1): `sync/LocalCopyNotice.tsx` y su test (con y sin el estado); `App.tsx` lo monta en `/login` junto a `LoginPage` (que no cambia); `App.test.tsx` en rojo → verde de extremo a extremo.
- [2026-10-14] T-116 (VE-4, VE-5): `frontend/src/README.md` (`unconfirmedState`, `LocalCopyNotice`), docstring de `canonical()` precisado (JSON para valores JSON; no contempla funciones ni un `undefined` suelto), `state.md`. Re-anclaje de SPEC-0002 a `0c45404` con nota (`App.tsx`), sin cambio de requisitos.
- [2026-10-14] Cierre del bloque O: frontend 365 passed, typecheck limpio (el frontend no tiene lint), integración 16/16; backend sin cambios (775 passed en la enmienda 2). Aviso `act(...)` intermitente del test VC-4 de `LogoutDialog`: también ocurre en la base (1-3 de 4 corridas) → backlog 8 con VE-6. Gate verde (2 avisos: history.md > 600 líneas, spectral). Commit `0c45404`.
- **Session-End (2026-10-14):** fase implement (enmienda 3) → 0005 `implemented`, bloque O completo (T-110…T-116). Rebotes del verificador: 2 en total en 0005 (ronda 1 y ronda 3 REJECTED). Directiva de Pausa: no. Drift / re-anchor: sí, SPEC-0002 → `0c45404` (`App.tsx`). Gate verde. Docs: spec/plan/tasks 0005, spec 0002 (nota), frontend/src/README.md, state.md, history.md. Decisiones: VE-1 opción (a) y VE-6 aparte (usuario); sin «Sincronizar y salir» con la réplica ilegible (plan §12). Nada marcado `verified`. Próximo paso: ronda corta de verificación 4 sobre la enmienda 3 (cambia el comportamiento).

## [2026-10-14] 0005-sync — Fase 5: verificación adversarial 4 (ronda corta, bloque O)
- [2026-10-14] Se lanza el subagente verificador (sólo lectura, worktree) sobre HEAD `316fd1f`, acotado a la enmienda 3 (T-110…T-116); motivo: VE-1 cambia el comportamiento de la salida (regla de salida). VE-6 y el aviso `act` del test VC-4 fuera de alcance (backlog 8).
- [2026-10-14] Subagente verificador (sólo lectura, worktree) sobre HEAD `316fd1f`: veredicto **APPROVED** (0 bloqueantes, 0 mayores, 4 menores). VE-1 corregido de raíz: `exit()` no rechaza, tras `logout()` correcto siempre navega, sin borrado si `logout()` falla; limpieza sin rechazos sueltos. Gate verde (24 ok · 2 avisos), typecheck limpio, `src/sync` + `App.test` 286 passed ×9, integración 16/16. Mutaciones 15/19 detectadas; sobreviven M10 (sin guarda `leaving`), M11 (sin restablecer `leaving` tras `logout()` fallido), M18 (`opened.catch` de la limpieza), M19 (sin fase `exiting`), todas en código previo. Menores: **VF-1** sin pruebas de la guarda de doble clic ni del reintento tras `logout()` fallido; **VF-2** un segundo «Cerrar sesión» durante el borrado abre un aviso `unreadable` falso (`requestLogout`/`syncAndExit` no miran `leaving`); **VF-3** con `BrowserRouter` el estado `localCopyKept` sobrevive en `history.state` y «Atrás» puede mostrar el aviso cuando la copia ya se borró (razonado, no probado); **VF-4** si el borrado falla tras «Salir y descartar» y vuelve el mismo usuario, la réplica se reutiliza y los cambios descartados se suben (la spec no lo explicita). Árbol limpio. Pendiente de decisión del usuario. No se marca nada `verified`.

## [2026-10-14] 0005-sync — Enmienda 4 (menores de la verificación 4, VF-1…VF-4)
- [2026-10-14] Usuario: «Opción b» para VF-4: corregirlo de raíz anotando en el dispositivo el borrado pendiente, para que la app termine de borrar la réplica antes de volver a abrirla, sea del mismo usuario o de otro; VF-1…VF-3 en la misma enmienda.
- [2026-10-14] T-117: enmienda 4 de SPEC-0005 (RF-017: la copia descartada nunca vuelve a usarse; §5 ese caso y el doble fallo) y nota de cabecera de la enmienda 3, que faltaba; PLAN-0005 §9 y §13 (alternativas descartadas: aceptar el riesgo; marcar dentro de la réplica, falla junto con el borrado; marca ilegible = presente, pérdida de datos); bloque P de `tasks.md` y cobertura (RF-017, RF-018).
- [2026-10-14] T-118, T-119 (VF-4): `localDb.test.ts` en rojo (6 fallos) → `markDiscarded()` (en `localStorage`, `synapse-discarded:<nombre>`; nunca lanza), `destroyLocalDb()` quita la marca sólo si borró, `openLocalDb()` destruye la réplica marcada aunque sea del mismo usuario y rechaza si no puede. `destroy` también es propio de cada instancia: el test de apertura fallida sustituye la clase con `vi.doMock`.
- [2026-10-14] T-120, T-121 (VF-1, VF-2, VF-4): `LogoutDialog.test.tsx` con 7 pruebas nuevas; en rojo, el aviso del login sin la promesa del borrado, el mismo usuario que vuelve y la petición durante el borrado (abría el aviso falso). `exit()` marca antes de `close()` y pasa `discardPending`; `requestLogout`/`syncAndExit` vuelven si `leaving`.
- [2026-10-14] T-122 (VF-3, VF-4): `LocalCopyNotice` copia el estado a su estado local y lo quita de la entrada (`navigate(location, { replace: true, state: null })`); texto «Se borrará la próxima vez que se inicie sesión en este dispositivo.» sólo con la marca. T-123: `frontend/src/README.md`.
- [2026-10-14] Mutaciones 14/14 detectadas, entre ellas M10, M11 y M19, que sobrevivían en la verificación 4 (M18 queda: el `.catch` exterior de la limpieza la cubre). Código restaurado.
- [2026-10-14] Cierre del bloque P: frontend 379 passed, typecheck limpio, integración 16/16. Con más pruebas en paralelo asoman, 1 vez en ~20 corridas cada uno, `App.test` RF-009 y un test de `SyncProvider` (además de VE-6); la base pasó 8/8 → backlog 8, sin ampliar la enmienda. Gate verde (2 avisos: history.md > 600 líneas, spectral). Commit `2259cf7`.
- **Session-End (2026-10-14):** fase implement (enmienda 4) → 0005 `implemented`, bloque P completo (T-117…T-123). Rebotes del verificador: 2 en total en 0005. Directiva de Pausa: no. Drift / re-anchor: no (sólo `frontend/src/sync/**` y README; `App.tsx` sin cambios). Gate verde. Docs: spec/plan/tasks 0005, frontend/src/README.md, state.md, history.md. Decisiones: VF-4 opción (b) (usuario); marca en `localStorage`, ilegible = ausente (plan §13). Nada marcado `verified`. Próximo paso: ronda corta de verificación 5 sobre la enmienda 4 (cambia el comportamiento).
- [2026-10-14] Verificación 5 (ronda corta sobre la enmienda 4, verificador de solo lectura en worktree): **APPROVED con menores**. typecheck 0 errores, frontend 379/379, integración 16/16, gate verde; mutaciones 10/11 detectadas. Menores: VG-1 marcar después de `close()` (M9) no lo detecta ninguna prueba; VG-2 T-120 y la fila RF-018 citan `App.test.tsx`, que no se tocó; VG-3 «ni se sube» no prueba nada con el replicador falso; VG-4 spec §5 debe matizar el «nunca» (cuota llena en `setItem` + borrado fallido); VG-5 varias pestañas, candidato a backlog. Pendiente la decisión del usuario.
- [2026-10-14] Usuario: «Pasa a verified». SPEC-0005, PLAN-0005 y TASKS-0005 → `verified` (aprobación `verified` del usuario en el front-matter); ancla de 0005 movida a 1289337. VG-1…VG-5 sin corregir → backlog 9 de `state.md`.
- **Session-End (2026-10-14):** fase verified (decisión del usuario) → 0005-sync cerrada. Rebotes del verificador en 0005: 2 (verificaciones 1 y 3). Directiva de Pausa: no. Drift / re-anchor: ancla de 0005 → 1289337. Gate verde. Docs: spec/plan/tasks 0005, state.md, history.md. Decisiones: 0005 `verified` por el usuario con VG-1…VG-5 al backlog. Próximo paso: decisiones abiertas del usuario (backlog 8 y 9, PouchDB upstream, 0006, PR #3, SPEC-0002, consolidar history, spec de «FastAPI sirve la SPA»).

## [2026-10-14] 0005-sync — Enmienda 5 (menores de la verificación 5, VG-1…VG-4)
- [2026-10-14] Usuario: «Sigue, haz lo que me recomiendas» → enmienda 5 con VG-1…VG-4 (sólo pruebas y texto; por la regla de salida, sin nueva ronda) y VG-5 al backlog. 0005 sigue `verified`.
- [2026-10-14] T-124: SPEC-0005 RF-017 remite al riesgo residual de §5 (cuota llena al anotar la marca + borrado fallido; `removeItem` con error tras leerla) (VG-4); PLAN-0005 §14; bloque Q.
- [2026-10-14] T-125 (VG-1): la prueba «si cerrar la réplica falla al salir» comprueba la marca y el texto del borrado pendiente. Mutación M9 (marcar después de `close()`) → ahora la detecta.
- [2026-10-14] T-126 (VG-3): «el mismo usuario vuelve» comprueba que el replicador de la segunda sesión se crea sobre una réplica sin la bóveda descartada y arranca; fuera la aserción sobre la remota. Mutación «`openLocalDb` ignora la marca» → detectada.
- [2026-10-14] T-127 (VG-2): T-120 y la fila RF-018 ya no citan `App.test.tsx`.
- [2026-10-14] Cierre del bloque Q: typecheck limpio; suite 379 passed en 8 de 12 corridas, los 4 fallos son los intermitentes del backlog 8 (VE-6 en 3, SyncProvider «abre la réplica antes…» en 1); la base, 1 de 5. Gate verde. Commit 4a7b740; ancla de 0005 → 4a7b740.
- **Session-End (2026-10-14):** fase verified (enmienda 5 posterior a `verified`, sin cambio de comportamiento). Rebotes: ninguno nuevo. Directiva de Pausa: no. Drift / re-anchor: ancla de 0005 → 4a7b740. Gate verde. Docs: spec/plan/tasks 0005, state.md, history.md. Decisiones: VG-4 aceptado como riesgo residual sin código (plan §14); VG-5 → backlog 9. Próximo paso recomendado: backlog 8 (tests inestables del frontend).

## [2026-10-14] 0005-sync — Enmienda 6 (backlog 8: tests inestables del frontend)
- [2026-10-14] Usuario: «Arregla desde la raiz por favor» → backlog 8 (VE-6, `App.test` RF-009, `SyncProvider.test` «abre la réplica antes…», aviso `act` de VC-4).
- [2026-10-14] Diagnóstico con perfil de CPU y dos suites concurrentes (reproduce: 2/12 fallos aun con un primer arreglo por `findByText`): en VE-6 cada sondeo de `findBy*` sobre 51 bóvedas (nombre accesible, estilos y `prettyDOM` del error) ocupa el hilo que necesita la relectura (`list()` 2 ms sola, 31 ms con un sondeo pendiente). `start()` va en un efecto posterior al commit. El aviso `act` de VC-4 son dos renders tras abrirse el aviso: `dataVersion` y un aviso repetido del almacén de estado (su feed relee la secuencia que ya leyó `refresh()`), invisible para cualquier prueba.
- [2026-10-14] T-129: `status.ts` avisa sólo si cambia `state`, `pending` o `lastSyncAt`; `status.test.ts` +2 (sin cambio no avisa; sólo la hora sí). Mutaciones: sin el filtro → 1 fallo; comparador sin `lastSyncAt` → 1; sin `pending` → 1 (LogoutDialog). T-130: VE-6 espera la promesa de `vaults.list` en `act` y consulta una vez; mutaciones «sin recarga» y «recarga descartada» → detectadas. T-131: `start()` con `waitFor` (3 tests). T-132: VC-4 muestra y espera `dataVersion` antes de leer la réplica fuera de React.
- [2026-10-14] Cierre del bloque R: typecheck limpio; 13 corridas de la suite (5 solas, 4 pares concurrentes) 381/381, 0 avisos `act`; integración 16/16. Gate verde (2 avisos de siempre). Commit 84b8be3; anclas de 0005 y 0003 → 84b8be3 (0003 por `VaultListPage.test.tsx`).
- **Session-End (2026-10-14):** fase implement (enmienda 6, posterior a `verified`). Rebotes: ninguno nuevo. Directiva de Pausa: no. Drift / re-anchor: 0005 y 0003 → 84b8be3. Gate verde. Docs: plan §15 y tasks bloque R de 0005, spec 0003/0005 (ancla), state.md, history.md. Decisiones: dedupe en `status.ts` como causa raíz del aviso `act` (cambio de lógica → por la regla de salida (b) pide verificación 6); 0005 sigue `verified` hasta que el usuario decida. Nada marcado `verified`. Próximo paso: verificación 6 de la enmienda 6, o decisión del usuario.
