---
id: H-002
titulo: Acceso de agentes OpenClaw a bóvedas vía API key
estado: refinando # Gate 2 de SDD Anchored (plan aprobado) ya pasado; equivalente a Gate 1 de Slice Development. Sin implementar.
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
anchor_commit: 6a9f6c7
origen: "superseded-de:specs/0013-acceso-agentes-api"
---

# H-002 — Acceso de agentes OpenClaw a bóvedas vía API key

**Puntero de migración (2026-10-28).** Esta historia nació como `SPEC-0013`
bajo SDD Anchored porque `AGENTS.md` no se había actualizado tras el cambio
a Slice Development (2026-10-25) — ver nota en `.harness/backlog.md`.
Ningún código fue escrito todavía; el contenido completo y aprobado
(requisitos, PLAN-0013 P-1…P-10, aprobaciones de Carlos por Telegram
2026-10-28) se preserva íntegro en:

- `.harness/specs/0013-acceso-agentes-api/spec.md` (estado:
  `superseded-por-backlog`)
- `.harness/specs/0013-acceso-agentes-api/plan.md`

**No se transcribe aquí** para no perder fidelidad de lo ya aprobado por
Carlos. Al tomar esta historia: seguir el ciclo driver/navigator de
`method.md` §4 directamente sobre PLAN-0013 (ya cumple el estándar de
`plan.md` de una historia — componentes, pasos TDD, estrategia de prueba).
No se requiere re-refinar ni pedir "así es" de nuevo salvo que algo haya
cambiado desde el 2026-10-28.

## Partida en slices demostrables (2026-10-28, a pedido de Carlos)

H-002 es demasiado grande para cerrarse de una sola vez y probarse al
final — se parte en 4 historias end-to-end, cada una con su propio
checkpoint demostrable. Orden = `backlog.md`. Cada slice usa los bloques
de PLAN-0013 §6 (A→H) que necesita; ninguno repite trabajo del anterior.

- **H-002.1 — Gestión de keys (crear/listar/revocar, solo cookie).**
  RF-001, RF-004, RF-005, RF-010, RNF-002. Bloques A (modelo+migración), B
  (hash/formato), C (servicio, sin `resolve`), E (router de gestión).
  **Demo:** Carlos logueado por cookie hace `POST/GET/DELETE
  /auth/agent-keys` — ve el secreto una sola vez, lo ve listado sin
  secreto después, lo revoca.
- **H-002.2 — Un agente usa su key para leer datos (el pedido original).**
  RF-002, RF-003, RF-006. Bloques D (`get_current_principal`), F (repunte
  de `vaults.py`/`sync.py`). Depende de H-002.1 (necesita una key creada).
  **Demo:** `curl -H "Authorization: Bearer <key>" /vaults` devuelve las
  mismas bóvedas que la cookie del dueño; con la key de otro usuario, 401.
- **H-002.3 — Revocar invalida de inmediato.** RF-005 (uso)/RF-007/
  RNF-001. Depende de H-002.1+H-002.2 (reusa ambos caminos).
  **Demo:** revocar la key de H-002.1 y repetir el `curl` de H-002.2 → 401
  en la siguiente petición, sin esperar caché.
- **H-002.4 — Resiliencia + cierre.** RF-008, RF-009 + `docs/API.md` +
  contrato OpenAPI (bloques G, H). No depende de las anteriores para
  implementarse, pero cierra la historia madre.
  **Demo:** menos visual (simular Postgres caído → 503); es la verificación
  de no-regresión y documentación, no una demo de producto nueva.

## Checkpoint demostrable

Pendiente — no se ha implementado nada.

## Session-End

- **Claim:** ninguno todavía.
- **Próximo paso:** tomar la historia, ciclo driver/navigator sobre
  PLAN-0013 tal cual.
