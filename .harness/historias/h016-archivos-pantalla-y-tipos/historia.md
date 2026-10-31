---
id: H-016
titulo: Archivos en Synapse — pantalla de archivos y subida de documentos de oficina, PDF y HTML
estado: implemented # Gate 1 pasado (Carlos, 2026-10-30 21:06 UTC, "así es" sobre el paquete H-016+H-019). Implementación completada: backend ✓, frontend ✓, editor ✓.
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
| **C-1** — Subida válida de archivo | `test_c1_valid_upload_creates_private_record`, `test_valid_upload_stores_object_and_private_record` | ✓ PASA |
| **C-2** — Rechazo de tipo no permitido | `test_c2_unsupported_type_is_rejected`, `test_c2_unsupported_type_is_rejected_and_nothing_is_stored`, `test_c2_exe_renamed_to_pdf_is_rejected`, `test_c2_script_shebang_renamed_to_txt_is_rejected` | ✓ PASA |
| **C-2** — Backend ignora Content-Type del cliente | `test_c6_backend_ignores_a_lying_client_content_type` | ✓ PASA |
| **C-3** — Cabeceras por tipo (inline, attachment, nosniff) | `test_c3_png_has_inline_disposition`, `test_c3_pdf_has_inline_disposition`, `test_c3_html_has_inline_with_csp_sandbox`, `test_c3_txt_has_attachment_disposition`, `test_c5_safe_svg_is_served_with_security_headers` | ✓ PASA |
| **C-3** — Cache-Control para privados | `test_c3_private_file_has_cache_control`, `test_c3_public_file_no_cache_control` | ✓ PASA |
| **C-4** — GET `/vaults/{vault_id}/files` lista archivos | `test_c4_list_vault_files_empty`, `test_c4_list_vault_files_in_created_at_desc_order`, `test_c4_list_vault_files_with_pagination`, `test_c4_list_vault_files_offset`, `test_c4_list_vault_files_404_if_not_owned`, `test_c4_list_vault_files_does_not_include_other_users_files` | ✓ PASA |
| **C-5** — PATCH name renombra archivo | `test_c5_rename_file`, `test_c5_rename_and_visibility_together` | ✓ PASA |
| **C-5** — PATCH name valida nombre | `test_c5_rename_invalid_name_with_slash`, `test_c5_rename_invalid_name_with_backslash`, `test_c5_rename_invalid_name_with_control_char` | ✓ PASA |
| **C-5** — PATCH name rechaza extensiones bloqueadas | `test_c5_rename_cannot_change_to_blocked_extension` | ✓ PASA |
| **C-5** — PATCH name solo del dueño | `test_c5_rename_non_owner_gets_404` | ✓ PASA |
| **C-6** — DELETE borra objeto y registro | `test_c6_delete_file_removes_object_and_record` | ✓ PASA |
| **C-6** — DELETE solo del dueño | `test_c6_delete_non_owner_gets_404` | ✓ PASA |
| **C-6** — DELETE preserva registro si almacén falla | `test_c6_delete_fails_if_storage_fails_but_record_survives` | ✓ PASA |
| **C-11** — Límites imagen 5 MB | `test_c2_too_large_is_rejected`, `test_too_large_is_rejected_and_nothing_is_stored` | ✓ PASA |
| **C-11** — Límites documento 25 MB | `test_c11_document_larger_than_25mb_is_rejected`, `test_c11_document_exactly_25mb_is_accepted` | ✓ PASA |
| **C-12** — API key de agente lista archivos propios | `test_c12_key_can_list_own_vault_files`, `test_c7_owner_key_reads_its_own_file` | ✓ PASA |
| **C-12** — API key de agente no puede acceder ajenos | `test_c12_key_cannot_list_foreign_vault_files`, `test_c12_key_cannot_rename_foreign_file`, `test_c12_key_cannot_delete_foreign_file`, `test_c7_foreign_key_cannot_read_private_file` | ✓ PASA |
| **C-12** — API key de agente puede renombrar y borrar propios | `test_c12_key_can_rename_own_file`, `test_c12_key_can_delete_own_file`, `test_c7_key_can_upload_to_its_owner_vault` | ✓ PASA |
| **Visibilidad** — PATCH visibility solo del dueño | `test_c8_owner_toggles_visibility`, `test_c8_non_owner_cannot_change_visibility`, `test_owner_can_change_visibility`, `test_non_owner_cannot_change_visibility` | ✓ PASA |
| **Visibilidad** — Rechazo de valores inválidos | `test_c8_invalid_visibility_is_422` | ✓ PASA |
| **Seguridad SVG** — Saneo RNF-003 | `test_c5_hostile_svg_is_rejected`, `test_hostile_svg_is_rejected_and_nothing_is_stored`, `test_safe_svg_is_accepted` | ✓ PASA |
| **Contrato OpenAPI** — h016 | Creado en `.harness/specs/h016-archivos-pantalla-y-tipos/contracts/openapi.yaml` | ✓ CREADO |
| **Sumario de suite** | 141 pruebas en test_file_safety + test_file_service + test_files_api + test_file_repository + test_object_storage + test_contract | ✓ TODAS PASAN |

### Frontend (Fase 4 — Implementación)

| Criterio | Test | Estado |
|----------|------|--------|
| **C-7** — Pantalla de archivos lista, busca y muestra metadatos | `renders heading and vault selector (C-7)`, `displays file list with metadata (C-7, C-9)`, `filters files by name search (C-7)`, `shows action buttons for each file (C-7)` | ✓ PASA |
| **C-5** — Renombrar archivo con validación | `rename file opens dialog and updates via PATCH (C-5)` | ✓ PASA |
| **C-8** — Cambiar visibilidad a público requiere confirmación | `set visibility to public requires confirmation (C-8)` | ✓ PASA |
| **C-6, C-9** — Borrar con confirmación y lista de referencias | `delete file with references shows list of referencing documents (C-6, C-9)` | ✓ PASA |
| **C-7, C-11** — Subir archivos: botón y validación en cliente | `upload button opens file input (C-7, C-11)`, `upload valid file updates list (C-7, C-11)` | ✓ PASA |
| **C-11** — Rechazo de tipo inválido y tamaño excesivo | `upload rejects invalid file type with error notice (C-11)`, `upload rejects file too large with error notice (C-11)` | ✓ PASA |
| **C-10** — Comando insertLink en editor Milkdown | `inserta un enlace con href y texto (C-1)` en MilkdownView.test.tsx | ✓ PASA |
| **Cliente HTTP** — renameFile, setFileVisibility, deleteFile | Pruebas en uploadFile.test.ts: renameFile, setFileVisibility, deleteFile | ✓ PASA |
| **Referencias** — Cálculo y detalle de documentos que usan archivo | getFileReferencesCount, getFileReferenceDetails usadas en FilesPage | ✓ PASA |
| **Sumario de suite** | 1814 pruebas en frontend + 4 nuevos tests de comando insertLink + 15 tests de FilesPage | ✓ TODAS PASAN |

## 7. Checkpoint demostrable

Carlos abre «Archivos», elige una bóveda, sube un PDF y un Excel, los ve en la lista, abre el PDF, descarga el
Excel, pasa uno a público con la confirmación y borra uno que está en uso viendo el aviso.
