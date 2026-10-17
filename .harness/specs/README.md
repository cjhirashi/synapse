# .harness/specs/

Una carpeta por feature del carril SDD: `NNN-slug/` (= nombre de rama).

Contenido de cada carpeta (copiar de `_template/`):
- `spec.md` — el *qué* y el *porqué* (scaffold de 6 secciones + EARS). Su front-matter
  lleva el anclaje: `covers`, `anchor_commit`, `anchor_mode`.
- `plan.md` — el *cómo* (conforme al patrón de la Constitución) + § Impacto en documentación.
- `tasks.md` — tareas atómicas + tabla de cobertura (la trazabilidad de la feature).
- `contracts/` — sólo si la feature toca un sustrato de integración del perfil.

`_template/` no es una feature: es la plantilla. El gate lo ignora (no tiene
front-matter `estado`).

Ver `.harness/method.md`.
