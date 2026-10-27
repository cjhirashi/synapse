---
ultima_actualizacion: 2026-10-23
fase: Sprint 2 — 0008-vault-editor `implemented` (2026-10-23; NO verified; Converge 1/2 cortado por AIRA; worktree `.claude/worktrees/0008-vault-editor`, rama `feature/0008-vault-editor`, sin merge); 0005-sync `implemented` (verificación 1 REJECTED → enmienda 1 hecha, T-085…T-101; verificación 2 APPROVED con menores VD-1…VD-5 corregidos con la enmienda 2, T-102…T-109; verificación 3 REJECTED por VE-1 → enmienda 3, T-110…T-116; verificación 4 APPROVED con menores VF-1…VF-4 → enmienda 4, T-117…T-123; verificación 5 APPROVED con menores VG-1…VG-5; pasada a `verified` por el usuario, 2026-10-14; VG-1…VG-4 cerrados con la enmienda 5, T-124…T-127, sin nueva ronda; VG-5 → backlog 9; backlog 8 corregido con la enmienda 6, T-128…T-132, verificación 6 APPROVED con menores VH-1/VH-2 cerrados sin nueva ronda); 0002-auth `verified` por el usuario (2026-10-17; PR #3 aprobado y mergeado a `dev`, merge b75e99c); 0003-vault-crud `verified` por el usuario (2026-10-13; T-001…T-075; verificación 1 REJECTED → enmienda 1; verificación 2 APPROVED con menores VB-1…VB-5 cerrados sin nueva ronda); 0004-api-problem-details implementada y re-verificada (APPROVED; menores W-1…W-4 corregidos con enmiendas 2 y 3; re-verificación 3 APPROVED con menores X-1…X-4 corregidos con enmienda 4; re-verificación 4 APPROVED con menores Y-1…Y-3 corregidos con enmienda 5; re-verificación 5 APPROVED con menores Z-1…Z-4 resueltos con enmienda 6; re-verificación 6 APPROVED con menores AA-1…AA-4 resueltos con enmienda 7; re-verificación 7 APPROVED con menores BB-1/BB-2 cerrados con enmienda 8 sin nueva ronda, por la regla de salida), pasada a `verified` por el usuario (2026-10-12)
arquitectura_verificada: True
sprint_actual: 2
---

# State — Synapse

## Correcciones del usuario (lo primero)

- **Synapse = almacén de bóvedas puro.** Sin IA interna (sin RAG, LangGraph, LiteLLM,
  Ollama). Los agentes OpenClaw (AIRA, Paulina, Liza, main…) acceden vía API.
- **Fuente de verdad:** este `state.md` y las specs, por encima de la cola de Cowork y de
  `TAREAS.md` (que se corrige para alinearse con las specs).
- **Auth (decisiones del usuario, SPEC-0002):** JWT 24 h; admin sembrado desde entorno
  (`ADMIN_EMAIL=cjhirashi@gmail.com`, `ADMIN_PASSWORD`); contraseña semilla `admin1234`
  sólo en `.env` local; el admin crea guests con la misma semilla y **todos** deben
  cambiarla en el primer ingreso; sección "Cambiar contraseña" en el frontend; se
  mantiene `argon2-cffi` + `PyJWT`; sin registro público.
- **Patrón:** monolito modular por capas con puertos (ADR-001).
- **Rama de trabajo:** `feature/sprint-1-auth` (no `dev`).
- **Bitácora:** cada tarea concluida se registra en `history.md` en el momento, no sólo al cierre.
- **Binding de agentes de Claude Code realineado (2026-10-15, ADR-004, autorizado por
  Carlos directo vía AIRA):** `.claude/agents/` tenía 9 agentes RAG-era de un diseño
  anterior (`backend-rag`, `backend-gateway`, etc., ya descartado); se reemplazó por
  los 7 agentes vigentes de `.harness/.claude/agents/` (6 base + `experto-ux-ui`).
  `.claude/settings.json`: `readFiles` corregido (`backend/`/`frontend/`, sin `src/`);
  se retiró la skill `ui-ux-pro-max` (decisión de Carlos) y se añadieron
  `security-review` y `verify`.
- **Sin nginx (2026-10-13, GATE 3 de 0005):** el proxy inverso de producción es un **Caddy
  externo** al repo. Ninguna feature añade configuración de nginx.
- **FastAPI sirve la SPA (2026-10-13):** decisión del usuario para sustituir el nginx de
  `frontend/Dockerfile` (estáticos + enrutado `/auth`, `/admin`, `/vaults`). Es un cambio con
  spec propia, **después de 0005**; no se implementa dentro de 0005.
- **Regla de salida de la verificación (2026-10-12):** sólo hay otra ronda si hubo un hallazgo
  bloqueante o mayor, o si la corrección cambia el comportamiento; los menores de docs,
  trazabilidad, estilo o tests que endurecen se corrigen y registran sin nueva ronda
  (`method.md` §3, Fase 4).

## Reglas vigentes (P1–P5)

| Regla | Qué |
|---|---|
| P1 | Gate siempre primero |
| P2 | Datos aislados por `user_id` (identidad sólo del token) |
| P3 | Validación de permisos en todo endpoint |
| P4 | Ningún secreto en el repo; config sensible sin defaults |
| P5 | Tests con BD real — **excepción declarada:** control plane en SQLite (plan 0002 §7) |

## Estado de las features

| Feature | Estado | Notas |
|---|---|---|
| 0002-auth | `verified` (por el usuario, 2026-10-17: aprobó y mergeó PR #3 a `dev`, merge `b75e99c`; sin verificación adversarial propia de esta pasada) | T-001–T-072 hechas · backend 85 tests · frontend 24 tests · contrato en `specs/0002-auth/contracts/openapi.yaml` · enmienda 1 aprobada · enmienda 2 (R-1…R-6, RF-021…RF-023) aprobada · W-1/W-2 de la re-verificación corregidos (T-069–T-072) · re-verificado sin hallazgos · formato de errores cedido a SPEC-0004 (cuerpos Problem, mismos códigos) · contrato re-exportado con respuestas de error · ancla en f28e063 |
| 0003-vault-crud | `verified` (por el usuario, 2026-10-13) · verificación adversarial 1 REJECTED (VA-1 mayor + VA-2…VA-10) corregida con la enmienda 1 (plan §15; VA-4: NFKC + `casefold`; VA-10: sin caracteres `Cc`) · verificación 2 APPROVED con menores VB-1…VB-5 (tests y docs; T-071…T-075, sin nueva ronda) · backend 422 tests (cobertura 99 %) + `perf` 1/1 · frontend 87/87 · ancla en 84b8be3 (re-anclada por 0005: P-1 y enmienda 6) | RF-001…RF-028 + RNF-001 (cobertura 28 RF en `Pass`, RF-016 diferido → backlog 7) · contrato en `specs/0003-vault-crud/contracts/openapi.yaml` · 0002 re-anclada a d730de9 · residuales: `frontend/vite.config.ts` sin spec que lo cubra (plan §14); cobertura del frontend medida con `@vitest/coverage-v8` (95,5 % líneas, umbral 80 %) · T-002 de `TAREAS.md` |
| 0004-api-problem-details | `verified` (por el usuario, 2026-10-12) · T-001…T-088 hechas · verificación adversarial (V-1…V-8) corregida con enmienda 1 · re-verificación APPROVED con menores W-1…W-4 corregidos (enmienda 2; W-1 y W-4 de raíz en enmienda 3: catálogo de mensajes de validación y `ContractGuard` en toda la suite) · re-verificaciones 3 y 4 APPROVED con menores X-1…X-4 (enmienda 4: guardián por ruta atendida, códigos del catálogo) e Y-1…Y-3 (enmienda 5: prohibida la construcción a mano de errores de validación fuera del catálogo y el traductor) · re-verificación 5 APPROVED con menores Z-1…Z-4 (enmienda 6: vías permitidas entre campos y entre fuentes, residual del análisis estático aceptado) · re-verificación 6 APPROVED con menores AA-1…AA-4 (enmienda 7: `ValidationFailed` como base de todo 422, `detail` de dominio de texto fijo) · re-verificación 7 APPROVED con menores (enmienda 8: `detail` raíz fijo; cerrada sin nueva ronda) | errores RFC 9457 en toda la API · RF-001…RF-014 · backend 185 tests · frontend 32 tests · contrato propio (`Problem`/`ProblemError`) en `specs/0004-api-problem-details/contracts/openapi.yaml` · contratos repartidos por feature · 0002 re-anclada · desbloquea la Fase 4 de 0003 |
| 0007-fastapi-sirve-spa | `implemented` (2026-10-17; **NO** `verified` — falta la aprobación del usuario) · T-001…T-021 hechas · cierre inicial sin revisor dejó pasar 2 regresiones que destapó la suite completa (405 en vez de 404 en `POST` a ruta desconocida → rompía RF-001 de 0002; `HTTPException` en `spa.py` → violaba RF-008 de 0004) · re-anchor 2026-10-17: arquitecto añadió RF-007 (D-7 reclasificación 405→404 en `core/problems.py::_framework_error` excluyendo el catch-all nombrado; D-8 nuevo error de dominio `SpaResourceNotFound`), implementador aplicó T-016…T-021 TDD, **revisor APPROVED** (trazabilidad RF-001…RF-007 fila por fila, colateral de `_framework_error` descartado) · suite backend completa **791 passed, 1 deselected, 0 failed** (13:02) · frontend **382/382** (27 files) · ancla en fd298f9 · menor del revisor (README `about:blank`) corregido sin nueva ronda | FastAPI monta `frontend/dist` (`StaticFiles`), negocia `/vaults` por `Accept`, fallback `index.html` para React Router; nginx del frontend retirado (`frontend/Dockerfile`/`nginx.conf` borrados); `backend/Dockerfile` multi-stage (Node build → copia `dist`), `docker-compose` sin servicio `frontend`, backend sirve todo en 8000 · RF-001…RF-007 en `Pass` · sin contrato nuevo (rutas SPA `include_in_schema=False`) · 0004 re-anclada advisory (tocó `core/problems.py`/`core/errors.py`) |
| 0009-rediseno-visual-workspace | `implemented` (2026-10-23; **NO** `verified`) · T-000…T-072 (enmiendas 1–2, PLAN-0009 §10–§11) · GATE 2 aprobado por AIRA (autoridad delegada) · orden invertido v1.9: maquetación + revisión visual temprana (T-032) antes del backend · Converge **2/2 limpio** (0 Critical/High) · rama `feature/0009-rediseno-visual` en worktree `.claude/worktrees/0009-rediseno-visual`, **sin merge** | Workspace con riel de chips circulares (`VaultChip`, ícono `lucide-react` + color de tokens o iniciales), panel del árbol con iconos carpeta/nota, editor en columna de 780 px centrada, marco de altura fija, tema oscuro por defecto; `Vault.icon` (`glifo[:color]`, regla única REST + push, contrato 0003 re-exportado) con selector `IconPicker` · suites solas en `6ec619f`: backend **1135 passed** (99,29 %), vitest **946/946**, `test:sync` **27/27**, `test:visual` **42/42** (V-1…V-10 contra el mockup 1.1.4.4), RNF-001 Chromium p95 **33,7 ms** (≤ 150) · re-ancla 0002/0003/0005/0007/0008 |
| 0011-identidad-logo | `approved` → implementación terminada (2026-10-27; **NO** `implemented`/`verified`: falta el revisor y la aprobación de las capturas por Carlos, RNF-002) · T-000…T-045 (GATE 1 y 2 por AIRA, P-1…P-14 + R-2) · rama `feature/0011-identidad-logo` en worktree `.claude/worktrees/0011-logo`, **sin merge** | Logo oficial (cerebro cian con degradado, opción B) en cabecera (28 px) y login (32 px) como `BrandLogo` (`span` con fondo CSS por `data-theme`, `forced-colors` monocromo, fallo de carga silencioso), `theme-color` por `applyResolvedTheme`, favicon SVG con regla oscura, ICO 16/32/48, apple-touch 180, iconos 192/512/maskable y manifest; assets generados por `frontend/scripts/brand/build.sh` (determinista) · suites solas: vitest **1002/1002**, backend **1155 passed**, `test:visual` **80 passed** (42 de 0009 + 38 `brand*`), gate verde |
| 0008-vault-editor | `implemented` (2026-10-23; **NO** `verified`) · T-000…T-160 (23 enmiendas, PLAN-0008 §10–§32) · Fase 4 con 4 revisores especializados (backend/seguridad, editor, sync cliente, UI/a11y/docs) · Converge: corrida 1 limpia sobre `61f63aa`; la corrida 2 la cortó AIRA (2026-10-23) · rama `feature/0008-vault-editor` en worktree, **sin merge** (lo hace AIRA) | Editor de notas en `/vaults/:id`: riel, árbol por `path` (carpetas = prefijos), Milkdown 7.22.3 + CodeMirror 6 (Visual/Código), guardado explícito, papelera por bóveda, conflictos expuestos (ADR-001) · notas `note:{vault}:{uuid}` por el canal `/sync` (sin REST, P-1) con push validado y reservas `note-path:{vault}:{sha256}` sólo del servidor · suites en `61f63aa`: backend **1054 passed** (99,28 %), frontend **799/799** (98,12 %), sync real **25/25**, RNF-001 p95 **62 ms** (navegador real p95 108–132 ms), carga 12/12, gate verde · recorrido real en Chromium 19/19 · re-ancla 0002/0003/0005/0007 (notas 2026-10-23) |
| 0005-sync | `verified` (por el usuario, 2026-10-14; implementada el 2026-10-13) · T-001…T-084 hechas (bloques A–L) · verificación 1 REJECTED (VC-1…VC-3 mayores, VC-4…VC-8 menores) corregida con la enmienda 1 (T-085…T-101, bloque M, 2026-10-14) · verificación 2 APPROVED (2026-10-14) con menores VD-1…VD-5 corregidos con la enmienda 2 (T-102…T-109, bloque N; 2026-10-14) · verificación 3 REJECTED (VE-1 mayor, VE-2…VE-6 menores) corregida con la enmienda 3 (T-110…T-116, bloque O; VE-1 opción (a) del usuario; VE-6 aparte) · verificación 4 APPROVED con menores VF-1…VF-4 corregidos con la enmienda 4 (T-117…T-123, bloque P; VF-4 opción (b) del usuario: marca de borrado pendiente) · verificación 5 APPROVED con menores VG-1…VG-5; VG-1…VG-4 cerrados con la enmienda 5 (T-124…T-127, bloque Q, sólo pruebas y texto, sin nueva ronda); VG-5 → backlog 9 · enmienda 6 (backlog 8, T-128…T-132, bloque R; `status.ts` avisa sólo si cambia: pide verificación 6) · ancla en 84b8be3 | RF-001…RF-019 + RNF-001…RNF-003 en `Pass` · canal `/sync/db` (base `synapse_user_{sub}` del token, lista blanca, push validado con las reglas de 0003, motivos de rechazo) · UI de bóvedas sobre la réplica local (P-1) · integración real 16/16 (`npm run test:sync`), p95 ≈ 0,4 s (RNF-001) · contrato en `specs/0005-sync/contracts/` · 0002 y 0003 re-ancladas a 461517f · defecto de PouchDB 9 (`finishBatch` sin `catch`) contenido en la app (`createRemoteDb`, VC-7); reportarlo upstream sigue abierto |

## Backlog / deuda conocida

1. ~~**PR #3 aprobado por el usuario** (2026-10-11): falta el merge a `dev` y el paso de SPEC-0002 a `verified`~~ → **cerrado** (2026-10-17): PR #3 mergeado a `dev` (merge `b75e99c`) y SPEC-0002 → `verified`. Residuales de diseño que siguen abiertos: access token válido 24 h tras logout / RF-022. ~~Contrato sin respuestas de error~~ → resuelto por SPEC-0004 (T-031).
   El test de aislamiento recorre todo GET protegido: reforzar con casos de datos en 0003.
2. ~~`docker-compose.yml` con Qdrant/Gotenberg y sin `Dockerfile` del frontend~~ → resuelto
   (2026-10-13, prompt directo): fuera Qdrant y Gotenberg; `frontend/Dockerfile` (Node →
   nginx) con `nginx.conf` que replica el proxy de Vite; override de desarrollo sobre la
   etapa `build`. **Decidido por el usuario (2026-10-13): FastAPI sirve la SPA** en lugar del
   nginx de `frontend/Dockerfile` (estáticos y la distinción por `Accept` de `/auth`, `/admin`,
   `/vaults`). → **resuelto (2026-10-17): SPEC-0007 `implemented`** (FastAPI sirve la SPA;
   nginx del frontend retirado). Residual: `test_contract.py` no corre dentro de la imagen del backend
   (necesita `specs/` y `scripts/` del repo).
3. Migraciones 002, 003 y 004 probadas en SQLite y PostgreSQL 15 real (round-trip; 003 aborta si hay duplicados por mayúsculas).
4. **Tests del control plane en PostgreSQL real** (cierra la excepción a P5) — feature aparte.
5. `.harness/gate/services.txt` vacío (bloque por perfil inactivo); `spectral` no instalado (lint de contrato omitido).
6. `datetime.utcnow()` deprecado en `auth_service`/`auth_repository` (avisos, no fallos).
7. **Purga de la papelera a 30 días** (RF-016 de SPEC-0003, diferido por spec §2): feature
   aparte, que debe decidir también qué pasa con los documentos de la bóveda purgada.
   Hasta entonces las bóvedas borradas siguen en la papelera indefinidamente.
8. ~~Tests inestables del frontend~~ → **cerrado** (verificación 6 APPROVED, 2026-10-17).
   Corregido con la enmienda 6 de 0005 (PLAN-0005 §15, bloque R, T-128…T-132; 2026-10-14).
   Causas: sondeos de `findBy*` sobre un DOM de 51 bóvedas que retrasaban la propia relectura
   (VE-6); `start()` en un efecto posterior al commit (`App`/`SyncProvider`/`LogoutDialog`); y
   un aviso repetido del almacén de estado sin cambio visible (aviso `act` de VC-4). Único
   cambio de código: `status.ts` avisa sólo si el estado cambia. 13 corridas (5 solas, 4 pares
   concurrentes) 381/381 sin avisos `act`; integración 16/16. Verificación 6 APPROVED con
   menores VH-1 (VaultListPage.test.tsx comprueba que la relectura es silenciosa) y VH-2
   (status.test.ts: prueba unitaria para un cambio sólo de `pending`), cerrados sin nueva
   ronda (sólo pruebas y texto; commit `ccbc885`).
9. **VG-5 de la verificación 5 de SPEC-0005** (VG-1…VG-4 cerrados con la enmienda 5): con
   varias pestañas del mismo usuario y el borrado de la réplica fallido, una pestaña que
   siga con la réplica abierta podría reanudar la replicación tras un nuevo inicio de sesión
   antes de que `openLocalDb` destruya la réplica marcada. Anterior a la enmienda 4, sin
   probar; necesita su propio análisis (relacionado con R-10 de SPEC-0005).
10. **Dato operativo de la suite backend (2026-10-17):** la suite completa
    (`cd backend && python3 -m pytest -q`) tarda **~13 min** (791 tests) y **NO se cuelga**
    — por su duración rebasa cortes de 600 s y "parece" colgada, pero termina en verde.
    `pytest-timeout` **no está instalado**: para diagnosticar un cuelgue real, usar
    `timeout <s>` desde el inicio volcando a archivo, y `-o faulthandler_timeout=<s>` para
    volcar el stack del hilo atascado. Prohibido `pkill`/`killall` con patrón (mata el shell).

11. **Abiertos de 0008 (2026-10-23)** — decisiones de Carlos: (a) **wikilinks `[[…]]`** se
    escapan (`\[\[…]]`) al editar en Visual (reformateo de ADR-010; la spec no define wikilinks;
    choca con "usar como Obsidian") → plugin remark propio en spec aparte; (b) `vault-name:*` de
    0003 sin tope de longitud del id (mismo riesgo que H-1 de 0008; requiere migración); (c)
    contraste de `.sync-status-bar time` (0005, 2,56:1); (d) agentes OpenClaw sin API de notas (P-1);
    (e) el markdown guarda URLs `javascript:`/`data:` pegadas — se neutralizan al renderizar
    (`safeUrl`), todo consumidor futuro debe aplicar la misma lista blanca.

12. **Abierto de 0011 (2026-10-27):** migrar `notes/accentContrast.test.ts` a `test-utils/wcag.ts` tras
    fusionar 0010 (hoy conserva su copia local del cálculo de contraste porque 0010 modifica `notes/*.test.ts`
    en paralelo; PLAN-0011 §7).

## Hazards conocidos

1. Conflictos PouchDB ↔ CouchDB — **mitigado por 0005**: ninguna rama se descarta sin
   decisión (merge por campo contra el ancestro, `ConflictView`), con pruebas unitarias y de
   integración real (`conflicts.integration`).
2. Usuario A ve datos de B — validación en todo endpoint (test de aislamiento en 0002); en
   el canal de sync, la base sale sólo del token (`test_sync_isolation`, `isolation.integration`).
3. Offline → datos obsoletos — **mitigado por 0005**: barra de estado (sin conexión,
   pendientes, sesión caducada) y aviso al cerrar sesión con cambios sin confirmar.
4. Borrar bóveda sin backup — soft delete + 30 días de gracia.

## Próximo paso inmediato

**0009-rediseno-visual-workspace** quedó `implemented` el 2026-10-23 en `feature/0009-rediseno-visual`
(worktree `.claude/worktrees/0009-rediseno-visual`): falta la aprobación del usuario para `verified` y
el merge (lo hace AIRA).
**0008-vault-editor** quedó `implemented` el 2026-10-23 en `feature/0008-vault-editor`
(worktree `.claude/worktrees/0008-vault-editor`): **falta la aprobación del usuario** para
`verified`, el merge (lo hace AIRA manualmente) y la decisión sobre el backlog 11.
**0005-sync** `verified` por el usuario (2026-10-14), tras la verificación 5 (APPROVED con
menores VG-1…VG-5); VG-1…VG-4 cerrados con la enmienda 5 (pruebas y texto), VG-5 en el
backlog 9. El backlog 8 (tests inestables) quedó corregido desde la raíz con la enmienda 6
(PLAN-0005 §15) y **cerrado** con la verificación 6 APPROVED (menores VH-1/VH-2 sin nueva
ronda, commit `ccbc885`, 2026-10-17); SPEC-0005 sigue en `verified`. Decisiones abiertas del
usuario: el backlog 9, reportar el defecto de PouchDB 9 upstream, las 3 preguntas de
**0006-integration-real-db** (`draft`) y consolidar `history.md`.
**0007-fastapi-sirve-spa** quedó `implemented` el 2026-10-17 (re-anchor a `fd298f9`; suite
backend 791 passed / 0 failed, frontend 382/382, gate ✅). **Falta la aprobación del usuario
para pasarla a `verified`** (la puerta humana es suya, no la cruza ninguna AI). Pendientes
abiertos tras 0007:
- 🔴 **Alta del Caddy externo (acción de infraestructura del usuario, fuera del repo):** con
  FastAPI sirviendo la SPA en el puerto 8000 y sin el contenedor `frontend`, el reverse
  proxy de producción (Caddy externo, ver corrección "sin nginx") debe apuntar al backend
  (8000) para los estáticos y la API. SPEC-0007 no lo toca; queda como alta pendiente de
  Carlos.
- Decisiones abiertas previas del usuario: backlog 9, reportar el defecto de PouchDB 9
  upstream, las 3 preguntas de **0006-integration-real-db** (`draft`) y consolidar
  `history.md` (>600 líneas, warn del gate).
