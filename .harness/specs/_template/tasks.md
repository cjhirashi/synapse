---
id: TASKS-NNN
tipo: tasks
feature: NNN-slug
estado: draft
actualizado: ‹YYYY-MM-DD›
---

# TASKS-NNN · ‹Nombre›

## Reglas
- Cada tarea: ≤ 30 min, un solo propósito, `(cubre RF-NNN)`, zona del patrón (o `[doc]`).
- Orden por dependencias. **Test antes que código.**
- Cada fila de `plan.md §8` (Impacto en documentación) → una tarea `[doc]`.

## Tareas
- [ ] T-001 — ‹escribir test de ‹zona› para …› (cubre RF-001) [zona: test]
- [ ] T-002 — ‹implementar …› (cubre RF-001) [zona: ‹núcleo/servicio/…›]
- [ ] T-003 — ‹…› (cubre RF-002) [zona: ‹frontera/adaptador/ruta›]
- [ ] T-004 — ‹actualizar ‹docs/…› …› [doc]

## Cobertura (el gate exige 100 %; `Estado` lo rellena el gate)
| RF / doc | Tareas | Test(s) | Estado |
|---|---|---|---|
| RF-001 | T-001, T-002 | ‹test_rf_001_*› | Pendiente |
| RF-002 | T-003 | ‹test_rf_002_*› | Pendiente |
| doc: ‹slug› | T-004 | — | Pendiente |

> Esta tabla **es** la trazabilidad de la feature (no hay `traceability-matrix.md`).
> Fila sin test, en `Fail` o `Pendiente` → el gate no abre.
