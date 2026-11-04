---
historia: H-038
estado: confirmado # diseño de AIRA 2026-11-04; autorización: orden de Carlos vía `main`
---

# Plan H-038 — Listado con atributos y ETag débil

Worktree `h038-listado-etag` (rama `feature/h038-listado-y-etag`). Pruebas: `cd backend && python3 -m pytest <archivo> -q`
(CouchDB de pruebas en `localhost:15984`, ya levantado). Un commit por paso, citando H-038 (y H-005 en los pasos 1-2).

## Pasos TDD

1. **`core/etag.py::etag_matches(if_match: str, rev: str) -> bool`** (C-4, C-5). Quita espacios; si empieza por `W/`
   lo quita; exige comillas dobles alrededor; compara con `rev` (el `_rev`, sin comillas). Casos en `tests/test_etag.py`:
   fuerte igual, débil igual, distinto, sin comillas, `W/` minúscula (`w/` no vale: RFC distingue mayúscula), vacío,
   `*` → False. Término: `pytest tests/test_etag.py` verde.
2. **Usarla en las dos copias de `_check_precondition`** (`note_content_service.py`, `vault_service.py`) (C-4…C-7). Mantener
   428 sin cabecera y 412 con mensaje. Pruebas: update/delete/restore de nota y de bóveda con `W/"rev"` vigente (200/204)
   y con `W/"rev"` viejo (412). Término: `pytest tests/test_note_content_service.py tests/test_vault_service.py
   tests/test_notes_router.py tests/test_vaults_api.py` verde.
3. **`NoteListItem.frontmatter`** (`core/schemas.py`) y `_to_list_item` (`note_content_service.py`: ya no excluir
   `frontmatter`, sí `content`) (C-1, C-2, C-3). Pruebas: ítem con frontmatter, ítem sin frontmatter → `null`, no hay
   `content`, INDICE con `descripcion`, paginación intacta. Término: mismos archivos del paso 2 en verde.
4. **[doc] Contrato y documentación** (C-8): regenerar `.harness/specs/0014-acceso-agentes-notas/contracts/openapi.yaml`
   con `backend/scripts/export_openapi.py` (ver cómo lo usa `tests/test_contract.py`); `docs/API.md` (ítem del listado con
   `frontmatter`; nota en la sección de `If-Match`: «se acepta `W/`»); `backend/app/README.md` (si lista `core/`);
   `backend/tests/README.md` (`test_etag.py`). Término: `pytest tests/test_contract.py tests/test_note_contract.py` verde.
5. **Suite completa del backend** en verde (se corre en segundo plano, ~15 min) y `historia.md` → `implemented`,
   Session-End en `.harness/memory/history.md`, línea en `.harness/backlog.md`.

## Despliegue y prueba en producción (AIRA)

Respaldo/etiqueta `synapse-backend:pre-h038`; `docker compose build backend && docker compose up -d backend`; `/health` 200.
Prueba con la nota de la bóveda «Prueba»: GET (con el ETag exactamente como lo devuelve) → PATCH con ese valor → 200; y
`note_list` con `frontmatter` por cada ítem.
