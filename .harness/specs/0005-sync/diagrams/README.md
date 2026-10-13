# Diagramas (Archify) — SPEC-0005

## Flujo de sincronización (propuesta)

**Tipo:** Workflow · **Estado:** borrador de Fase 1 — dibuja las opciones *recomendadas* de
D-1…D-4 (`spec.md` §7), no un diseño aprobado ni implementado.

| Archivo | Qué es |
|---|---|
| [`sync-flow.html`](./sync-flow.html) | Interactivo y autocontenido; «Exportar» genera SVG, PNG, JPEG o WebP. |
| [`sync-flow-light.png`](./sync-flow-light.png) / [`sync-flow-dark.png`](./sync-flow-dark.png) | Capturas 2048×1320. |
| [`sync-flow.candidate.json`](./sync-flow.candidate.json) | Fuente del diagrama. |
| `sync-flow.*.json` restantes | Recibos de Archify (validate, deliver, check, browser-check). |

**Qué muestra:** toda edición se escribe primero en PouchDB; sin red, la UI muestra el
estado; con red, el push pasa por el proxy `/sync` (base sólo del token) y la validación con
las reglas de SPEC-0003 antes de llegar a CouchDB; los demás dispositivos reciben los cambios
por `_changes`. Un documento inválido se rechaza (RF-006) y un conflicto de `_rev` conserva
ambas versiones (RF-007); los dos acaban en "Resolver" (D-3).

**Regenerar:** igual que en `0003-vault-crud/diagrams/README.md`, con
`finalize workflow`. Si las decisiones de la Fase 1 cambian el flujo, se actualiza el
candidato antes de cerrar el Gate 1.
