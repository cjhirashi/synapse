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

## Checkpoint demostrable

Pendiente — no se ha implementado nada.

## Session-End

- **Claim:** ninguno todavía.
- **Próximo paso:** tomar la historia, ciclo driver/navigator sobre
  PLAN-0013 tal cual.
