---
id: ADR-004
tipo: adr
estado: accepted          # autorizada por Carlos directo, 2026-10-15
fecha: 2026-10-15
---

# ADR-004 · Realineación del binding de agentes de Claude Code y de las skills activas

## Contexto y planteamiento del problema

`.claude/agents/` (el binding real que lee Claude Code para delegar subagentes) seguía
con 9 agentes de dominio de un diseño anterior de Synapse con RAG/Qdrant/LlamaIndex
(`backend-rag`, `backend-gateway`, `backend-documents`, `base-de-datos`, `backend-sync`,
`backend-agents`, `backend-auth`, `qa-integracion`, `frontend`), descartado por decisión
del usuario (`state.md`, 2026-10-13: "Synapse = almacén de bóvedas puro. Sin IA interna").
Referenciaban módulos que ya no existen (`rag_service.py`, `qdrant_adapter.py`).

Mientras tanto, el conjunto de agentes del método SDD Anchored vigente (`orquestador`,
`autor-de-spec`, `arquitecto`, `implementador`, `revisor`, `explorador` +
`experto-ux-ui` opcional, documentado en `.harness/.claude/agents/README.md`) existía
sólo como plantilla en `.harness/.claude/agents/`, nunca copiado al binding real: el
`orquestador` no tenía a quién delegar.

Además, `.claude/settings.json` apuntaba `readFiles` a `src/backend/`/`src/frontend/`
(la estructura real es `backend/`/`frontend/` en la raíz, sin `src/`), y sólo declaraba
dos skills activas (`archify`, `ui-ux-pro-max`) frente a un patrón ya repetido de
verificación adversarial manual (10+ rondas en `history.md`) y reglas duras de
seguridad/aislamiento (P2–P4).

## Decisión

Elegimos **realinear el binding al método vigente y ajustar las skills al perfil real
del proyecto**, autorizado por Carlos directo (2026-10-15):

- `.claude/agents/` pasa a contener los 7 agentes de `.harness/.claude/agents/` (6 base
  + `experto-ux-ui`, que aplica por tener frontend); se retiran los 9 agentes RAG-era.
- `experto-ux-ui.md` apunta como sistema de diseño a
  `diseño/1.1.4 - Diseño UI-UX/1.1.4.1 - Sistema de Diseño.md` (predata al arnés) en
  vez de inventar uno nuevo.
- `.claude/settings.json`: `readFiles` corregido a `backend/`/`frontend/`; se retira
  `ui-ux-pro-max` (decisión explícita de Carlos — sin skill de generación de sistemas
  de diseño en este proyecto) y se añaden `security-review` (diffs de auth/permisos/
  datos de usuario, antes del `revisor`) y `verify` (confirmar en runtime antes de
  marcar una feature `implemented`).

## Opciones consideradas

- **Realinear ahora (elegida)** — el binding roto es un riesgo activo: cualquier
  delegación del `orquestador` a un rol del método (p. ej. `revisor`) fallaría al no
  existir el subagente.
- **Dejarlo para cuando se necesite** — descartada: ya se necesita (el método se usa
  en cada feature desde Sprint 1) y el coste de arreglarlo es bajo.
- **Mantener `ui-ux-pro-max` junto a `security-review`/`verify`** — descartada por
  decisión explícita de Carlos; el sistema de diseño existente en `diseño/` basta.

## Consecuencias

- **Buenas:** el `orquestador` puede delegar de verdad en los 6 roles del método +
  `experto-ux-ui`; `readFiles` refleja la estructura real; dos skills nuevas refuerzan
  justo los puntos más frágiles del proyecto (seguridad, verificación en runtime).
- **Coste / malas:** se pierde la generación automática de sistemas de diseño; el de
  `diseño/` es manual y puede quedar desactualizado si no se mantiene.

## Enlaces

- Afecta a: `.claude/agents/`, `.claude/settings.json`, `.harness/.claude/agents/README.md`.
- Relacionado: ADR-001 (adopción del arnés y patrón por capas).
