# Diagramas (Archify) — SPEC-0008

## Flujo de una nota

**Tipo:** Dataflow · **Estado:** implementado (Fase 4); pendiente de verificación (Fase 5).
Dibuja "abrir bóveda → editar → réplica → push validado → reservas" (`spec.md` §3, PLAN-0008 §2).

| Archivo | Qué es |
|---|---|
| [`note-flow.html`](./note-flow.html) | Interactivo y autocontenido; «Exportar» genera SVG, PNG, JPEG o WebP. |
| [`note-flow-light.png`](./note-flow-light.png) / [`note-flow-dark.png`](./note-flow-dark.png) | Capturas 2048×1320. |
| [`note-flow.candidate.json`](./note-flow.candidate.json) | Fuente del diagrama. |
| `note-flow.*.json` restantes | Recibos de Archify (finalize, delivery, browser-check). |

**Qué muestra:** `/vaults/:id` lee el árbol de la réplica PouchDB y el editor sólo escribe una
revisión al pulsar «Guardar». La réplica sube los lotes por `/sync/db` (un `_bulk_docs` de más de
8 MiB se reparte; el servidor admite 16 MiB). `sync_push` valida (bóvedas antes que notas, reglas
de `core/note_rules.py`): lo válido llega a `synapse_user_{id}` y reserva la ruta
`note-path:*` (sólo del servidor, nunca replicada); lo inválido vuelve como `forbidden` + `reason`
(`note-path-taken`, `vault-not-found`, que `repush.ts` reintenta). Los demás dispositivos reciben
`vault:*` y `note:*` por `_changes`.

## Regenerar

Edita `note-flow.candidate.json` y, desde la raíz del repo, borra los recibos viejos
(`note-flow.html` y `note-flow.*.json` salvo el candidato) antes de ejecutar:

```bash
node ~/.agents/skills/archify/bin/archify.mjs finalize dataflow \
  .harness/specs/0008-vault-editor/diagrams/note-flow.candidate.json \
  .harness/specs/0008-vault-editor/diagrams/note-flow.html \
  --repo-root . --quality showcase --json
```

`browser-check` necesita Chromium (`ARCHIFY_CHROME`). En este host le faltan librerías: se corrió
en el contenedor `mcr.microsoft.com/playwright:v1.56.0-jammy` (repo en `/repo`, Archify de sólo
lectura en `/archify`, `ARCHIFY_CHROME=/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell`,
`ARCHIFY_CHROME_NO_SANDBOX=1`). Las PNG son las capturas 2048×1320 de `archify visual-check`.
El diagrama de dataflow exige un `viewBox` de a lo sumo ~1007 px de ancho (legibilidad a 1440 px).
