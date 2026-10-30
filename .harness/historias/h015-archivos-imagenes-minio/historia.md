---
id: H-015
titulo: Subir imágenes a MinIO, con visibilidad privada/pública, y referenciarlas con ![]()
estado: tomada # Gate 1 pasado — Carlos confirmó "así es" (2026-10-30) a esta versión y a un solo bucket con prefijo por bóveda. En implementación vía Claude Code (Modo 2).
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

(se llena al implementar)

## 8. Checkpoint demostrable

Carlos sube una imagen real a una nota (botón y arrastrando), la ve en Visual
y en Lectura, y confirma que sigue viéndose tras recargar la página.

## 9. Session-End (al cerrar)

Pendiente — se completa al implementar.
