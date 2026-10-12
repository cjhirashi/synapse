---
ultima_actualizacion: 2026-10-12
fase: Sprint 2 — 0002-auth con PR aprobado; 0003-vault-crud `implemented` (T-001…T-051 hechas; plan §11–§14; pendiente de verificación adversarial); 0004-api-problem-details implementada y re-verificada (APPROVED; menores W-1…W-4 corregidos con enmiendas 2 y 3; re-verificación 3 APPROVED con menores X-1…X-4 corregidos con enmienda 4; re-verificación 4 APPROVED con menores Y-1…Y-3 corregidos con enmienda 5; re-verificación 5 APPROVED con menores Z-1…Z-4 resueltos con enmienda 6; re-verificación 6 APPROVED con menores AA-1…AA-4 resueltos con enmienda 7; re-verificación 7 APPROVED con menores BB-1/BB-2 cerrados con enmienda 8 sin nueva ronda, por la regla de salida), pasada a `verified` por el usuario (2026-10-12)
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
| 0002-auth | `implemented` · PR #3 aprobado por el usuario (pendiente merge y paso a `verified`) | T-001–T-072 hechas · backend 85 tests · frontend 24 tests · contrato en `specs/0002-auth/contracts/openapi.yaml` · enmienda 1 aprobada · enmienda 2 (R-1…R-6, RF-021…RF-023) aprobada · W-1/W-2 de la re-verificación corregidos (T-069–T-072) · re-verificado sin hallazgos · formato de errores cedido a SPEC-0004 (cuerpos Problem, mismos códigos) · contrato re-exportado con respuestas de error · ancla en f28e063 |
| 0003-vault-crud | `implemented` (2026-10-12; spec, plan y tasks) · pendiente de verificación adversarial y de `verified` (lo decide el usuario) · T-001…T-051 hechas · plan §11, §12 (arrendamiento de 30 s, RF-021), §13 (`etag` en los listados) aprobados; §14 notas de cierre · backend 336 tests (cobertura 99 %) + `perf` 1/1 (p95 18 ms con 1 000 bóvedas) · frontend 82/82 · ancla en 4a07556 | RF-001…RF-028 + RNF-001 (cobertura 28 RF en `Pass`, RF-016 diferido → backlog 7) · contrato en `specs/0003-vault-crud/contracts/openapi.yaml` · 0002 re-anclada a 4a07556 · residuales: `frontend/vite.config.ts` sin spec que lo cubra (plan §14); cobertura del frontend no medible (falta `@vitest/coverage-v8`) · T-002 de `TAREAS.md` |
| 0004-api-problem-details | `verified` (por el usuario, 2026-10-12) · T-001…T-088 hechas · verificación adversarial (V-1…V-8) corregida con enmienda 1 · re-verificación APPROVED con menores W-1…W-4 corregidos (enmienda 2; W-1 y W-4 de raíz en enmienda 3: catálogo de mensajes de validación y `ContractGuard` en toda la suite) · re-verificaciones 3 y 4 APPROVED con menores X-1…X-4 (enmienda 4: guardián por ruta atendida, códigos del catálogo) e Y-1…Y-3 (enmienda 5: prohibida la construcción a mano de errores de validación fuera del catálogo y el traductor) · re-verificación 5 APPROVED con menores Z-1…Z-4 (enmienda 6: vías permitidas entre campos y entre fuentes, residual del análisis estático aceptado) · re-verificación 6 APPROVED con menores AA-1…AA-4 (enmienda 7: `ValidationFailed` como base de todo 422, `detail` de dominio de texto fijo) · re-verificación 7 APPROVED con menores (enmienda 8: `detail` raíz fijo; cerrada sin nueva ronda) | errores RFC 9457 en toda la API · RF-001…RF-014 · backend 185 tests · frontend 32 tests · contrato propio (`Problem`/`ProblemError`) en `specs/0004-api-problem-details/contracts/openapi.yaml` · contratos repartidos por feature · 0002 re-anclada · desbloquea la Fase 4 de 0003 |

## Backlog / deuda conocida

1. **PR #3 aprobado por el usuario** (2026-10-11): falta el merge a `dev` y el paso de SPEC-0002 a `verified` (lo hace el usuario, no el agente). Residuales de diseño: access token válido 24 h tras logout / RF-022. ~~Contrato sin respuestas de error~~ → resuelto por SPEC-0004 (T-031).
   El test de aislamiento recorre todo GET protegido: reforzar con casos de datos en 0003.
2. **`docker-compose.yml`** aún declara Qdrant y Gotenberg (contradice "almacén puro"),
   el backend depende de `qdrant`, y `frontend/` no tiene `Dockerfile`. Requiere decisión
   (fuera del alcance de 0002).
3. Migraciones 002, 003 y 004 probadas en SQLite y PostgreSQL 15 real (round-trip; 003 aborta si hay duplicados por mayúsculas).
4. **Tests del control plane en PostgreSQL real** (cierra la excepción a P5) — feature aparte.
5. `.harness/gate/services.txt` vacío (bloque por perfil inactivo); `spectral` no instalado (lint de contrato omitido).
6. `datetime.utcnow()` deprecado en `auth_service`/`auth_repository` (avisos, no fallos).
7. **Purga de la papelera a 30 días** (RF-016 de SPEC-0003, diferido por spec §2): feature
   aparte, que debe decidir también qué pasa con los documentos de la bóveda purgada.
   Hasta entonces las bóvedas borradas siguen en la papelera indefinidamente.

## Hazards conocidos

1. Conflictos PouchDB ↔ CouchDB — tests de sync + documentación.
2. Usuario A ve datos de B — validación en todo endpoint (test de aislamiento en 0002).
3. Offline → datos obsoletos — UI clara de estado.
4. Borrar bóveda sin backup — soft delete + 30 días de gracia.

## Próximo paso inmediato

**0003-vault-crud** cerrada en `implemented`: verificación adversarial (Fase 4) y, con la regla de salida, decisión del usuario sobre `verified`. Decidir si se añade `@vitest/coverage-v8` para medir la cobertura del frontend. Pendiente aparte: limpieza de `docker-compose.yml` (Qdrant/Gotenberg), diagrama T-003 y merge de PR #3.
