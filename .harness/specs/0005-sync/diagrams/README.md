# Diagramas (Archify) — SPEC-0005

## Flujo de sincronización

**Tipo:** Workflow · **Estado:** implementado (Fase 4, bloques A–K; T-081 lo redibujó con
los nombres reales: canal `/sync/db`, `sync_push`, motivos de rechazo, `merge.ts`). Pendiente
de verificación (Fase 5). Dibuja D-1…D-4 (`spec.md` §8, ADR-002, ADR-003).

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
ambas versiones (RF-013); los dos acaban en "Resolver" (D-3, RF-012…RF-015).

## Regenerar

Edita `sync-flow.candidate.json` y, desde la raíz del repo, borra los recibos viejos
(`sync-flow.html` y `sync-flow.*.json` salvo el candidato) antes de ejecutar:

```bash
node ~/.claude/skills/archify/bin/archify.mjs finalize workflow \
  .harness/specs/0005-sync/diagrams/sync-flow.candidate.json \
  .harness/specs/0005-sync/diagrams/sync-flow.html \
  --repo-root . --quality showcase --json
```

`browser-check` necesita Chromium (`ARCHIFY_CHROME`). Si al host le faltan sus librerías,
córrelo en el contenedor `mcr.microsoft.com/playwright` (repo montado en `/repo`, Archify
montado de sólo lectura) con `ARCHIFY_CHROME` apuntando a su `headless_shell` y
`ARCHIFY_CHROME_NO_SANDBOX=1`. Las PNG son las capturas 2048×1320 de
`archify visual-check <html> --out-dir <dir>`.

Las etiquetas de las aristas y los subtítulos deben caber en el ancho del nodo y no forzar
pasillos ambiguos: `validate` los rechaza (`layout/constraint`,
`composition/ambiguous-corridor`). Si una etiqueta no cabe, se acorta; no se cambia la
geometría.
