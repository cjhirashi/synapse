---
id: H-015
titulo: Subir imágenes a MinIO, con visibilidad privada/pública, y referenciarlas con ![]()
estado: implemented # Gate 1 pasado (Carlos, 2026-10-30). Implementado en Modo 2 (Claude Code); NO verified: falta checkpoint demostrable en navegador + migración/deploy reales (AIRA).
covers:
  - backend/app/routers/files.py
  - backend/app/services/file_service.py
  - backend/app/adapters/minio_adapter.py
  - backend/app/adapters/file_repository.py
  - backend/app/core/schemas.py
  - backend/alembic/versions/
  - frontend/src/files/uploadFile.ts
  - frontend/src/editor/NoteEditor.tsx
  - frontend/src/editor/MilkdownView.tsx
origen: backlog
---

# H-015 — Subir imágenes a MinIO, con visibilidad privada/pública

## 1. Intención (lenguaje de usuario)

Primera fase del pedido de Carlos (2026-10-30): cargar archivos a Synapse con
MinIO como almacén. Infraestructura ya lista (fuera de esta historia):
`synapse-minio` (instancia propia, NO la de cjhirashi-career), bucket
`synapse-files` privado, `files-synapse.cjhirashi.com` creado.

## 2. Decisiones de producto ya tomadas (Carlos, 2026-10-30)

- **Endpoint autenticado**, no links firmados con vencimiento. Una URL estable
  por archivo: `https://synapse.cjhirashi.com/files/<id>` (la sesión de
  Synapse sólo existe en ese dominio).
- **Visibilidad por archivo: privado (por defecto) o público.** Privado exige
  sesión (o API key de agente) y que el archivo sea del usuario; público abre
  sin sesión con la misma URL. Cambiar la visibilidad no cambia el link.
- **Límite de 5 MB por archivo.**
- **Subida:** botón en el editor Y arrastrar-y-soltar.
- **Archivos huérfanos:** si se quita la imagen del texto o se borra la nota,
  el archivo se queda (no se limpia solo). El indicador de referencias para
  decidir qué borrar va en H-016.
- `files-synapse.cjhirashi.com` NO se usa en esta historia: se reserva para
  contenido activo (HTML/iframe), historia posterior.

## 3. Alcance / fuera de alcance

- Dentro: tabla de metadatos en Postgres (migración Alembic); subir una
  imagen desde la nota en edición Visual (botón en la Fila 3 del editor +
  arrastrar-y-soltar); guardar en MinIO; insertar `![nombre](url)` en el
  cursor; `GET /files/<id>` con la regla de visibilidad; cambio de visibilidad
  por API (`PATCH`), SIN pantalla todavía; tipos `png/jpeg/webp/gif` y `svg`
  (el SVG pasa por el mismo saneo que exige RNF-003).
- Fuera: pantalla de archivos con lista/renombrar/eliminar/copiar link
  (H-016); API de agentes para subir/consultar link (H-017); PDF y video
  (H-018); HTML/iframe (H-019); publicar documento (H-020); pegar imagen del
  portapapeles; limpieza de huérfanos.

## 4. Criterios de aceptación (EARS booleano)

- **C-1:** CUANDO el usuario sube una imagen válida (tipo admitido, ≤ 5 MB)
  desde una nota en edición Visual, el sistema DEBE guardarla en MinIO, crear
  su registro (dueño, bóveda, nombre, tipo, tamaño, visibilidad `private`) e
  insertar `![nombre](https://synapse.cjhirashi.com/files/<id>)` en el cursor.
- **C-2:** CUANDO el archivo supera 5 MB o su tipo no es admitido, el sistema
  DEBE rechazarlo con un mensaje claro, sin crear nada en MinIO, en Postgres
  ni en el markdown.
- **C-3:** `GET /files/<id>` DEBE devolver 404 si el archivo no existe, y:
  si es `private`, 401 sin sesión/API key válida y 404 si pertenece a otro
  usuario; si es `public`, el contenido sin exigir sesión. Con acceso válido
  DEBE devolver el contenido con su `Content-Type` correcto.
- **C-4:** La imagen insertada DEBE verse en edición Visual y en Lectura (la
  URL es `https` y pasa el filtro `safeImageUrl` ya existente, sin cambiarlo).
- **C-5:** Un SVG subido DEBE verificarse con el mismo saneo del proyecto
  (sin `script`, `foreignObject`, atributos `on*`, `href` navegables) antes de
  guardarse; si falla, se rechaza. Además `GET /files/<id>` DEBE servir los
  SVG con `Content-Security-Policy: sandbox` y `X-Content-Type-Options:
  nosniff`.
- **C-6:** El límite de 5 MB y los tipos DEBEN verificarse en el cliente
  (feedback inmediato) y en el backend (nunca sólo en el cliente).
- **C-7:** CUANDO un agente usa su API key, `GET /files/<id>` DEBE aplicar la
  misma regla de dueño que para la sesión (la key ve lo de su dueño).
- **C-8:** `PATCH /files/<id>` con `{"visibility": "public"|"private"}` DEBE
  cambiar la visibilidad sólo si el archivo es del usuario autenticado.

`[NEEDS CLARIFICATION] = 0` — Carlos confirmó "así es" (2026-10-30), incluida
la recomendación de §5.

## 5. Almacenamiento por bóveda (recomendación de AIRA, aceptada por Carlos)

Carlos quiere ver una "lista de buckets". Recomendación: **un solo bucket
físico (`synapse-files`) con un prefijo por bóveda**
(`vaults/<vault_id>/<file_id>`), y la app muestra cada bóveda como su
"bucket". Razones: crear un bucket por bóveda exige nombres válidos de MinIO
(minúsculas, 3-63 caracteres; los nombres de bóveda con acentos o espacios no
sirven, habría que usar el id igual), crear y borrar buckets en caliente y
una política por bucket; el prefijo da el mismo aislamiento lógico sin eso.
El acceso real lo controla siempre el backend, MinIO nunca se expone directo.
Renombrar una bóveda no mueve nada porque la clave usa el id.

## 6. Plan (de ESTA historia solamente) — borrador, se confirma al tomarla

- Backend: dependencia `minio` (cliente Python); `minio_adapter.py`
  (`put_object`/`get_object`, bucket y credenciales ya en `.env`);
  `file_repository.py` + migración Alembic para la tabla `files` (id, owner_id,
  vault_id, name, content_type, size, visibility, object_key, created_at);
  `file_service.py` (validación de tipo/tamaño, saneo de SVG, reglas de
  acceso); `routers/files.py` (`POST /files` multipart con `vault_id`,
  `GET /files/<id>` en streaming, `PATCH /files/<id>`), mismo patrón de
  dependencias que `vaults.py` (`get_current_principal`).
- Frontend: `files/uploadFile.ts` (límite 5 MB y tipos en cliente, llamada al
  endpoint); botón en la Fila 3 de `NoteEditor.tsx` + `drop`/`dragover` sobre
  el área de edición; al terminar, inserta el nodo de imagen con el comando de
  Milkdown que ya usan los demás botones.
- Pruebas: servicio (tipo/tamaño/saneo SVG/propiedad), router (401/404/200,
  público sin sesión, aislamiento entre usuarios, API key), migración,
  `uploadFile.ts`, inserción del nodo en el editor. Además verificación real
  con usuario y bóveda desechables y un navegador (lección de H-012: los tests
  con jsdom no ejercen el gesto real de arrastrar/soltar).
- Pasos TDD: se detallan al tomar la historia.

## 7. Tabla de cobertura

| Criterio | Código (pasos) | Test(s) |
|---|---|---|
| **C-1** subida válida → MinIO + registro privado + `![nombre](url)` | `file_service.create`, `routers/files.upload_file`, `uploadFile.ts`, `MilkdownView.insertImage`, `NoteEditor` (botón/drop) | `test_file_service::test_valid_upload_stores_object_and_private_record`, `test_files_api::test_c1_valid_upload_creates_private_record`, `uploadFile.test::C-1`, `MilkdownView.test::comando de imagen`, `NoteEditor.test::subir imagen (botón/drop)` |
| **C-2** rechazo tamaño/tipo sin crear nada | `file_service.create` (orden de validación), `errors.FileTooLarge/UnsupportedFileType` | `test_file_service::test_too_large_*`, `::test_unsupported_type_*`, `test_files_api::test_c2_*`, `NoteEditor.test::C-2 aviso` |
| **C-3** `GET` 404/401/404-ajeno/público/Content-Type | `routers/files.get_file`, `file_service.get_record/read` | `test_files_api::test_c3_*`, `test_file_service::test_get_record_*` |
| **C-4** imagen visible (Visual y Lectura), URL https pasa `safeImageUrl` | `MilkdownView.safeImage`, `insertImage` | `MilkdownView.test::comando de imagen` + `::una imagen data: o relativa…` (https sí llega) |
| **C-5** SVG saneado (RNF-003) + cabeceras CSP/nosniff | `file_safety.is_safe_svg`, `file_service.create`, `routers/files._SVG_HEADERS` | `test_file_safety::test_safe_svg_*`, `test_file_service::test_*svg*`, `test_files_api::test_c5_*` |
| **C-6** tipo y 5 MB en cliente y backend | `uploadFile.ts`, `file_safety.sniff_content_type`, `file_service.create` | `uploadFile.test::C-6`, `test_file_safety::test_sniff_*`, `test_files_api::test_c6_*` |
| **C-7** API key = misma regla de dueño | `dependencies.get_current_principal`, `get_file_service` | `test_files_api::test_c7_*` |
| **C-8** `PATCH` visibilidad sólo del dueño | `file_repository.set_visibility`, `file_service.set_visibility`, `routers/files.update_visibility` | `test_file_repository::test_set_visibility_*`, `test_file_service::test_*visibility*`, `test_files_api::test_c8_*` |

Migración `006_files` (tabla `files`): `test_file_repository` ejercita el esquema sobre sqlite
(`create_all`); la migración Alembic real sobre Postgres la corre AIRA al desplegar.
Contrato OpenAPI del feature: `.harness/specs/h016-archivos-pantalla-y-tipos/contracts/openapi.yaml (H-016 absorbió el contrato de /files)`
(verificado por `test_contract`).

## 8. Checkpoint demostrable

Carlos sube una imagen real a una nota (botón y arrastrando), la ve en Visual
y en Lectura, y confirma que sigue viéndose tras recargar la página.

## 9. Session-End (al cerrar)

- **Claim:** una imagen (png/jpeg/webp/gif/svg, ≤ 5 MB) se sube desde el editor (botón; arrastrar-y-soltar
  implementado, sin verificar con gesto real), se guarda en MinIO bajo `vaults/<vault_id>/<file_id>`, queda
  registrada en la tabla `files` como `private` y se inserta como `![nombre](https://synapse.cjhirashi.com/files/<id>)`.
  `GET /files/<id>`: privado exige sesión o API key del dueño; público abre sin sesión; `PATCH` cambia la
  visibilidad (sólo el dueño); los SVG se sanean y se sirven con `Content-Security-Policy: sandbox` y `nosniff`.
- **Evidencia (AIRA, independiente):** backend, 71 pruebas de las suites nuevas verdes; frontend completo
  91 archivos / 1774 pruebas verdes; migración `006_files` aplicada en Postgres real (`alembic upgrade head`);
  conexión real a MinIO (put/get). **Verificación en navegador real** con usuario y bóveda desechables (borrados
  al terminar): subida por el botón; el markdown guardado y sincronizado fue
  `Antes ![prueba-h015](https://synapse.cjhirashi.com/files/<id>)`; tras recargar la página la imagen carga en
  Lectura (120×80) con la sesión; sin sesión el archivo privado da 401 y un POST sin sesión 401; al pasarlo a
  público por `PATCH` abre sin sesión (200 `image/png`); el objeto quedó en MinIO con el prefijo de la bóveda.
- **Gaps:** arrastrar-y-soltar no se probó con el gesto real (el navegador de pruebas sólo permite el selector
  de archivos); no hay pantalla de archivos ni confirmación de publicación (H-016); las respuestas de archivos
  privados no llevan `Cache-Control: private` (hoy Cloudflare no las cachea por no tener extensión, pero conviene
  declararlo); el suite completa del backend tiene 20 fallos preexistentes en `test_brand_assets`/`test_spa`
  porque exigen `frontend/dist`, ausente en los worktrees (comprobado en una rama sin H-015).
- **Riesgo residual:** archivos huérfanos se quedan en MinIO al quitar la imagen o borrar la nota (decisión de
  Carlos; el indicador de referencias va en H-016); una nota sembrada a mano en CouchDB sin su reserva de ruta
  la rechaza la sincronización («datos con formato no válido»): no afecta a notas creadas desde la app.
- **Próximo paso:** checkpoint de Carlos (subir una imagen real, ver Visual/Lectura, recargar). Después H-016
  (pantalla de archivos con visibilidad, referencias y confirmación al publicar).
