# Diagramas (Archify) — SPEC-0003

> No forman parte del alcance de SPEC-0003 (spec §2); viven aquí porque `diagrams/**` está
> en sus `covers`. Se documentan en este README y no en `spec.md` para no reabrir una spec
> `verified`.

## Arquitectura general (T-003)

**Tipo:** Architecture (C4 Context) · **Revisión del repo:** `8acb3f4`

| Archivo | Qué es |
|---|---|
| [`architecture.html`](./architecture.html) | Interactivo y autocontenido (tema claro/oscuro, ruta, lente). El botón «Exportar» genera SVG, PNG, JPEG o WebP. |
| [`architecture-light.png`](./architecture-light.png) | Captura 2048×1320, tema claro. |
| [`architecture-dark.png`](./architecture-dark.png) | Captura 2048×1320, tema oscuro. |
| [`architecture.candidate.json`](./architecture.candidate.json) | Fuente del diagrama: componentes, conexiones y la evidencia del repo de cada nodo. |
| `architecture.*.json` restantes | Recibos de Archify (validate, deliver, check, browser-check). |

**Qué muestra:** el usuario entra por HTTPS a Caddy (infra compartida, fuera del repo) →
frontend (SPA en nginx :3000, mismo origen) → backend FastAPI (:8000, JWT) → CouchDB (una
base `synapse_user_{id}` por usuario) y PostgreSQL (control plane). En línea discontinua lo
previsto: PouchDB offline y los agentes OpenClaw vía API.

## Regenerar

Edita `architecture.candidate.json` (actualiza `meta.repository.revision`) y, desde la raíz
del repo, borra los recibos viejos (`architecture.html` y `architecture.*.json` salvo el
candidato) antes de ejecutar:

```bash
node ~/.claude/skills/archify/bin/archify.mjs finalize architecture \
  .harness/specs/0003-vault-crud/diagrams/architecture.candidate.json \
  .harness/specs/0003-vault-crud/diagrams/architecture.html \
  --repo-root . --quality showcase --json
```

`browser-check` necesita Chromium (`ARCHIFY_CHROME`). Si al host le faltan sus librerías,
córrelo en el contenedor `mcr.microsoft.com/playwright` con `ARCHIFY_CHROME_NO_SANDBOX=1`.
Las PNG salen de `archify visual-check <html> --out-dir <dir>`.
