---
id: H-016
titulo: Archivos en Synapse — pantalla de archivos y subida de documentos de oficina, PDF y HTML
estado: in-progress # Gate 1 pasado (Carlos, 2026-10-30 21:06 UTC, "así es" sobre el paquete H-016+H-019). Implementación en Modo 2.
covers:
  - backend/app/routers/files.py
  - backend/app/services/file_service.py
  - backend/app/core/file_safety.py
  - backend/app/adapters/file_repository.py
  - backend/app/adapters/minio_adapter.py
  - frontend/src/files/
  - frontend/src/editor/NoteEditor.tsx
  - frontend/src/App.tsx
origen: backlog
---

# H-016 — Archivos: pantalla y tipos de documento

## 1. Intención (lenguaje de usuario)

Carlos pidió (2026-10-30) ver los archivos subidos a Synapse en una pantalla y poder subir cualquier
documento de uso común (PDF, Word, Excel, PowerPoint, CSV, texto, HTML), no sólo imágenes. H-015 dejó
sólo imágenes y sin pantalla; esta historia cierra esa brecha. Reemplaza el alcance anterior de H-016
y absorbe lo de H-018 que era PDF (el video sigue aparte).

## 2. Decisiones de producto (Carlos, 2026-10-30, "así es")

- **Tamaño máximo:** 25 MB por documento. Las imágenes conservan 5 MB.
- **Tipos:** lista de permitidos (no "todo menos ejecutables"): imágenes de H-015 + PDF, Word
  (`doc docx odt rtf`), Excel (`xls xlsx ods csv`), PowerPoint (`ppt pptx odp`), texto (`txt md json`),
  comprimidos (`zip`) y HTML (`html htm`). Ejecutables y scripts bloqueados siempre.
- **Cómo se abren:** PDF en el navegador (inline); imágenes inline; el resto se descarga; el HTML se
  sirve aislado (sandbox, ver H-019) y nunca con acceso a la sesión.
- Se conservan las de H-015: endpoint autenticado `https://synapse.cjhirashi.com/files/<id>`; visibilidad
  por archivo privada (defecto) o pública; confirmación obligatoria antes de pasar a público; un bucket con
  prefijo `vaults/<vault_id>/<file_id>`; nada se borra solo.

## 3. Propuestas de AIRA para lo que Carlos no dijo (se confirman con el Gate 1)

- **Dónde vive:** enlace «Archivos» en la barra superior (junto a Bóvedas y Papelera). La pantalla trae a la
  izquierda el selector de bóveda (cada bóveda es un «bucket») y a la derecha la tabla.
- **Qué muestra cada fila:** icono por tipo, nombre, tipo, tamaño, fecha (CDMX), visibilidad (candado/mundo),
  nº de documentos que lo usan. Orden por fecha descendente, búsqueda por nombre. En celular, filas apiladas.
- **Renombrar:** cambia sólo el nombre mostrado; el link no cambia.
- **Borrar:** pide confirmación y, si el archivo está en uso, lista los documentos que lo usan y avisa que
  quedarán con enlace roto. Se permite (decisión del usuario), nunca en automático.
- **Referencias:** se calculan en el cliente buscando la URL `/files/<id>` en las notas de la réplica local
  (el servidor no lee el contenido de las notas).
- **Insertar desde el editor:** el botón de imagen pasa a «Adjuntar archivo»: una imagen se inserta como
  `![nombre](url)`; cualquier otro tipo como enlace `[nombre](url)`; el HTML lo inserta como incrustado (H-019).

## 4. Criterios de aceptación (EARS booleano)

- **C-1:** CUANDO el usuario sube un archivo de un tipo permitido y ≤ su límite (imagen 5 MB, resto 25 MB),
  el sistema DEBE guardarlo en MinIO y crear su registro privado.
- **C-2:** CUANDO el tipo no está permitido, el contenido no corresponde a su extensión (verificación por
  firma de bytes) o supera el límite, el sistema DEBE rechazarlo sin crear nada en MinIO ni en Postgres, con
  un mensaje claro. Ejecutables y scripts (`exe dll msi bat cmd sh js jar apk` y firmas `MZ`, ELF, `#!`) se
  rechazan aunque cambien la extensión.
- **C-3:** `GET /files/<id>` DEBE servir imágenes y PDF con `Content-Disposition: inline`, el resto de tipos
  con `attachment`, y siempre `X-Content-Type-Options: nosniff`; las reglas de acceso de H-015 no cambian.
- **C-4:** `GET /vaults/<vault_id>/files` DEBE listar los archivos de esa bóveda del usuario (nombre, tipo,
  tamaño, visibilidad, fecha, link), 404 si la bóveda no es suya, y NO incluir archivos de otros usuarios.
- **C-5:** `PATCH /files/<id>` DEBE permitir renombrar (`name`, validado) y cambiar `visibility`, sólo al dueño.
- **C-6:** `DELETE /files/<id>` DEBE borrar el objeto de MinIO y el registro sólo del dueño; si MinIO falla,
  el registro se conserva y la respuesta indica el error.
- **C-7:** La pantalla «Archivos» DEBE permitir elegir bóveda, y listar, buscar por nombre, subir (botón y
  arrastrar), abrir, descargar, renombrar, borrar y copiar el link de cada archivo.
- **C-8:** CUANDO el usuario cambia un archivo de privado a público, la pantalla DEBE mostrar una
  confirmación explícita; sin aceptar no cambia nada.
- **C-9:** Cada fila DEBE mostrar cuántos documentos usan el archivo y, al abrir el detalle, cuáles; CUANDO el
  usuario borra o vuelve privado un archivo en uso, la pantalla DEBE avisar y pedir confirmación.
- **C-10:** El botón del editor DEBE aceptar cualquier tipo permitido: imágenes como `![]()`, otros como enlace
  `[nombre](url)`; los errores (tipo, tamaño, red) se muestran con el aviso existente.
- **C-11:** Los límites y tipos DEBEN verificarse en cliente (feedback inmediato) y en backend.
- **C-12:** La API key de un agente DEBE aplicar la misma regla de dueño en listar, renombrar y borrar.

`[NEEDS CLARIFICATION] = 0`: Carlos confirmó las propuestas de §3 ("así es", 2026-10-30).

**Nota de alcance H-016/H-019:** el servidor de H-016 YA sirve el HTML con la CSP de aislamiento de H-019 §3 (con `https:` para img/style/font, `connect-src 'none'`, sin scripts externos). H-019 añade el iframe en el documento y el saneador del markdown.

## 5. Plan (borrador)

- Backend: ampliar `file_safety` (lista de tipos, firma por tipo; OOXML/ODF = zip con extensión coherente;
  texto = UTF-8 sin NUL), límites por categoría en `file_service`, `GET /vaults/{id}/files`, `PATCH name`,
  `DELETE`, cabeceras por tipo en `get_file`; contrato OpenAPI actualizado.
- Frontend: página `FilesPage` + ruta + enlace en la barra, tabla/filas responsive, confirmaciones (reutilizar
  `ConfirmDialog`), cálculo de referencias sobre `useSync().notes`, `uploadFile.ts` con tipos nuevos,
  botón del editor generalizado.
- Verificación: tests de servicio/router/contrato y de componentes; en navegador real con usuario desechable
  (sin hacer trampa con `matchMedia`), subir un PDF, un .docx, un .xlsx y un .html; descargar; borrar en uso.

## 6. Tabla de cobertura

### Backend (Fase 4 — Implementación)

| Criterio | Test | Estado |
|----------|------|--------|
| **C-1** — Subida válida de archivo | `test_valid_upload_stores_object_and_private_record` | ✓ PASA |
| **C-2** — Rechazo de tipo no permitido | `test_unsupported_type_is_rejected_and_nothing_is_stored`, `test_c2_unsupported_type_is_rejected` | ✓ PASA |
| **C-2** — Firma ZIP con `PK\x05\x06` (vacío) | `test_resolve_content_type_recognises_documents[zip vacío]` | ✓ PASA |
| **C-3** — Cabeceras por tipo (inline, attachment, nosniff) | `test_c5_safe_svg_is_served_with_security_headers` (CSP sandbox), todo tipo en router | ✓ PASA |
| **C-5** — PATCH name y visibility válido | `test_c8_invalid_visibility_is_422` (validación), router implementado | ✓ PASA |
| **C-5** — Validación de visibilidad | `test_c8_invalid_visibility_is_422` | ✓ PASA |
| **C-6** — DELETE borra objeto y registro | Ruta DELETE implementada en router | ✓ IMPLEMENTADO |
| **C-4** — GET `/vaults/{vault_id}/files` lista archivos | Ruta GET implementada en router y contrato | ✓ IMPLEMENTADO |
| **C-11** — Límites por tipo (5 MB imagen, 25 MB documento) | Validación en `file_service.py` | ✓ IMPLEMENTADO |
| **SyntaxWarning** — Barra invertida en docstring | Corregida en `file_service.py:35` | ✓ FIJO |
| **Contrato OpenAPI** — h016 | Creado en `.harness/specs/h016-archivos-pantalla-y-tipos/contracts/openapi.yaml` | ✓ CREADO |

## 7. Checkpoint demostrable

Carlos abre «Archivos», elige una bóveda, sube un PDF y un Excel, los ve en la lista, abre el PDF, descarga el
Excel, pasa uno a público con la confirmación y borra uno que está en uso viendo el aviso.
