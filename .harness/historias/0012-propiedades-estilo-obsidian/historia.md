---
id: H-001
titulo: Panel de propiedades estilo Obsidian
estado: refinando # Gate 1 de SDD Anchored (Fase 1 + Fase 2) ya aprobado. Sin implementar.
covers: # provisional; lo fija la Fase 2
  - frontend/src/editor/PropertiesPanel.tsx
  - frontend/src/editor/PropertiesPanel.test.tsx
  - frontend/src/editor/PropertiesForm.tsx
  - frontend/src/editor/PropertiesForm.test.tsx
  - frontend/src/editor/properties.ts
  - frontend/src/editor/properties.test.ts
  - frontend/e2e/properties*
anchor_commit: 08479dc
origen: "superseded-de:specs/0012-propiedades-estilo-obsidian"
---

# H-001 — Panel de propiedades estilo Obsidian

**Puntero de migración (2026-10-28).** Esta historia nació como `SPEC-0012`
bajo SDD Anchored porque `AGENTS.md` no se había actualizado tras el cambio
a Slice Development (2026-10-25) — ver nota en `.harness/backlog.md`.
Ningún código fue escrito todavía; el contenido completo y aprobado
(NC-1/D-3/D-4/D-5, GATE 1 aprobado por AIRA con autoridad delegada el
2026-10-28) se preserva íntegro en:

- `.harness/specs/0012-propiedades-estilo-obsidian/spec.md` (estado:
  `superseded-por-backlog`)
- `.harness/specs/0012-propiedades-estilo-obsidian/plan.md`
- `.harness/specs/0012-propiedades-estilo-obsidian/tasks.md`

**No se transcribe aquí** para no perder fidelidad de lo ya aprobado. Al
tomar esta historia: seguir el ciclo driver/navigator de `method.md` §4
directamente sobre el plan/tasks ya aprobados.

## Partida en slices demostrables (2026-10-28, a pedido de Carlos)

H-001 se parte en 3 historias end-to-end siguiendo la propia secuenciación
de PLAN-0012 §6 (que ya marcaba dos "checkpoint visual" separados). Orden
= `backlog.md`.

- **H-001.1 — Panel en LECTURA, estilo Obsidian.** RF-001, RF-002, RF-004,
  RF-007, RF-010. Núcleo (`isIsoDate`/`displayKind`) + `PropertyRow` +
  mapa de iconos + `PropertiesPanel` + CSS (plan §6 pasos 1-3).
  **Demo:** abrir una nota con propiedades, verla en modo lectura con el
  panel nuevo (iconos, sin cabecera, sin scroll horizontal, icono de
  calendario en fechas ISO) — es el "checkpoint visual temprano" que el
  propio plan ya pedía antes de tocar la edición.
- **H-001.2 — Edición: menú de tipo + pastillas + añadir/quitar.**
  RF-003, RF-005, RF-006, RF-008. `useMenu`/`PropertyMenu` +
  `PropertiesForm` + CSS (plan §6 pasos 4-5). Depende de H-001.1 (reusa
  `PropertyRow`/iconos).
  **Demo:** editar una nota, abrir el menú de tipo desde el icono, añadir
  y quitar propiedades y valores de lista como pastillas — el "checkpoint
  visual de edición" del plan.
- **H-001.3 — No regresión + fidelidad visual final + docs.** RF-009,
  RNF-001, RNF-002. Plan §6 pasos 6-8 (P-14 si aplica, regresión de 0010,
  documentación/re-anclaje). Depende de H-001.1+H-001.2.
  **Demo:** menos visual nueva — es la comparación final de capturas
  contra la referencia de Obsidian y la corrida completa de la suite de
  SPEC-0010 sin romper nada.

## Checkpoint demostrable

Pendiente — no se ha implementado nada.

## Session-End

- **Claim:** ninguno todavía.
- **Próximo paso:** tomar la historia, ciclo driver/navigator sobre el plan
  ya aprobado.
