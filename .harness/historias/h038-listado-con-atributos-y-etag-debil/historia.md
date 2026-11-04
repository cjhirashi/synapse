---
id: H-038
titulo: Listado de notas con atributos (frontmatter) y ETag débil aceptado en If-Match (cierra H-005)
estado: implemented # desplegado y probado en producción 2026-11-04 16:45 CDMX
covers:
  - backend/app/core/etag.py
  - backend/app/core/schemas.py
  - backend/app/services/note_content_service.py
  - backend/app/services/vault_service.py
  - backend/tests/test_etag.py
  - backend/tests/test_note_content_service.py
  - backend/tests/test_notes_router.py
  - backend/tests/test_vault_service.py
  - .harness/specs/0014-acceso-agentes-notas/contracts/openapi.yaml
origen: Carlos 2026-11-04 (puntos 1 y 3 de la orden a AIRA vía `main`); H-005 del backlog (hallazgo del 2026-10-29)
---

# H-038 — Listado con atributos y ETag débil (cierra H-005)

## 1. Intención

(1) `GET /vaults/{id}/notes` debe devolver en cada ítem el `frontmatter` (atributos: titulo, descripcion, tags,
estado…), sin el cuerpo, para navegar al documento con la ruta y los metadatos sin un `note_get` por nota.
(3) El `ETag` de `note_get` llega como `W/"N-hash"` (Cloudflare lo debilita al comprimir con Brotli) y reenviarlo tal
cual en `If-Match` da 412 sin que nadie haya editado.

## 2. Decisiones (diseño de AIRA)

- **D-1 (listado):** `NoteListItem` gana `frontmatter: dict | None` (el guardado, sin tocar; `null` si la nota no lo tiene).
  No se añade `content`. `limit`/`cursor` no cambian. Medido en producción: el frontmatter pesa 156 B de media, 1,1 KB
  de máximo; una página de 200 notas suma ≈ 31 KB, así que el máximo actual (200) se mantiene.
- **D-2 (ETag, solución de raíz):** el servidor compara el **valor opaco** del validador, ignorando el prefijo `W/`
  (`core/etag.py::etag_matches`). Es la única solución que no depende de un intermediario que no controlamos: Cloudflare
  puede debilitar el ETag en cualquier respuesta comprimida, hoy o mañana. Se descartó `Cache-Control: no-transform`
  como mecanismo único porque desactiva la compresión del borde para las lecturas de notas (las más pesadas) y aun así
  no garantiza nada ante otro intermediario. Misma función en las notas y en las bóvedas (la copia idéntica de
  `vault_service.py`).
- **D-3 (alcance):** `If-Match` con una sola etiqueta (con o sin `W/`); sin listas ni `*` (comportamiento actual intacto).

## 3. Criterios (EARS booleano)

- **C-1:** CUANDO se pide `GET /vaults/{id}/notes`, cada ítem DEBE incluir la clave `frontmatter` con los atributos
  guardados de la nota (o `null` si no tiene).
- **C-2:** El ítem del listado NO DEBE incluir la clave `content`.
- **C-3:** `limit`, `cursor`, `deleted` y el orden del listado DEBEN comportarse igual que antes (pruebas previas en verde).
- **C-4:** CUANDO `PATCH`/`DELETE`/`restore` de una nota recibe `If-Match: W/"<rev>"` con el `_rev` vigente, el sistema DEBE
  aceptarlo igual que `"<rev>"`.
- **C-5:** SI el `_rev` de `If-Match` (con o sin `W/`) no es el vigente, ENTONCES el sistema DEBE responder 412.
- **C-6:** SI falta `If-Match`, ENTONCES el sistema DEBE responder 428 (sin cambio).
- **C-7:** `PATCH`/`DELETE`/`restore` de una bóveda DEBEN aceptar `W/"<rev>"` igual que las notas.
- **C-8:** El contrato OpenAPI y `docs/API.md` DEBEN describir `frontmatter` en el ítem del listado y la aceptación de `W/`.

## 4. Cobertura

| Criterio | Paso | Prueba |
|---|---|---|
| C-4, C-5, C-6 | 1, 2 | `test_etag.py`, `test_note_content_service.py` (débil: update/delete/restore) |
| C-7 | 2 | `test_vault_service.py` / `test_vaults_api.py` (débil) |
| C-1, C-2, C-3 | 3 | `test_note_content_service.py`, `test_notes_router.py` |
| C-8 | 4 | `test_contract.py`, `test_note_contract.py` (contrato re-exportado) |

`[NEEDS CLARIFICATION] = 0`. Orden y alcance de Carlos 2026-11-04.

## Avance (AIRA, 2026-11-04 16:50 CDMX)

- Pasos 1-4 hechos y commiteados (`c776163`, `307e3ac`, `a656b98`, `b27b1ce`). Pruebas en tmpfs (el disco2 estaba saturado):
  386 de los archivos tocados en verde; suite completa 2039 ok / 21 fallos ajenos (20 `test_brand_assets.py` necesitan
  `frontend/public`, que no se copia a tmpfs; 1 `test_note_sync_api::…index-readonly:path` falla igual en la rama base `f3f0f96`).
- Desplegado 2026-11-04 16:43 CDMX (imagen previa `synapse-backend:pre-h038`, `/health` 200). Prueba en producción, bóveda «Prueba»
  (nota `Prueba 1/Prueba 5.md`): `note_list` devuelve `frontmatter` en cada ítem con `limit`/`next_cursor`; `note_get` devolvió
  `W/"9-…"` (Cloudflare); `note_update` con ese `W/"9-…"` tal cual → 200; reenviar el `W/"9-…"` ya viejo → 412; con el vigente
  `W/"10-…"` → 200. El frontmatter de la nota quedó como estaba.
