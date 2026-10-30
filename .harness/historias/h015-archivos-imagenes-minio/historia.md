---
id: H-015
titulo: Subir imágenes a MinIO y referenciarlas con ![]() — Fase 1 de archivos adjuntos
estado: pendiente # Gate 1 NO pasado — criterios redactados por AIRA; falta el "así es" de Carlos.
covers:
  - backend/app/routers/files.py
  - backend/app/services/file_service.py
  - backend/app/adapters/minio_adapter.py
  - backend/app/core/schemas.py
  - frontend/src/editor/NoteEditor.tsx
  - frontend/src/editor/MilkdownView.tsx
  - frontend/src/editor/uploadImage.ts
origen: backlog
---

# H-015 — Subir imágenes a MinIO y referenciarlas con `![]()`

## 1. Intención (lenguaje de usuario)

Primera fase del pedido de Carlos (2026-10-30) de poder cargar archivos a
Synapse (imágenes, PDF, video, HTML) con MinIO como almacenamiento. La
infraestructura ya está lista (hecha por AIRA el mismo día, fuera de esta
historia): instancia MinIO propia de Synapse (`synapse-minio`, NO la de
cjhirashi-career), bucket `synapse-files` **privado** (sin acceso público
directo), red `net-synapse` conectada. El subdominio aislado
`files-synapse.cjhirashi.com` también existe (DNS + Caddy verificados) pero
**esta historia no lo usa** — es para HTML/iframe (fase 3, historia aparte);
imágenes y PDF son contenido pasivo, sin riesgo de ejecución, así que se
sirven por el dominio normal de Synapse.

**Decisión técnica de AIRA (a confirmar, P-1):** el bucket es privado y las
notas son privadas — la URL de una imagen en el markdown **no debe ser** un
link firmado de MinIO con vencimiento (se rompería la imagen semanas después,
cuando el link caduque). Se sirve por un endpoint propio del backend
(`GET /files/{id}`) que verifica la sesión y que el archivo pertenece a una
bóveda del usuario en cada petición, igual que ya hace `vaults.py`/`notes.py`
(`get_current_principal` → `synapse_user_{sub}`) — mismo principio que la
sincronización por proxy (ADR-002): nunca se expone el almacén directo con un
token de larga duración.

## 2. Alcance / fuera de alcance

- Dentro: subir una imagen (drag&drop o selector de archivo) desde la nota
  en edición Visual; guardarla en MinIO; insertar `![alt](url)` en el
  markdown con la URL del endpoint propio; que esa imagen se vea en Visual y
  en Lectura (ya renderiza `![]()`, sólo cambia de dónde sale la URL);
  límite de 5 MB por archivo (confirmado por Carlos); tipos admitidos:
  `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml` (con
  el mismo saneo que ya exige cualquier SVG en el proyecto, ver RNF-003 —
  un SVG subido NO es una excepción al sanitizado).
- Fuera: PDF, video, HTML/iframe (historias siguientes); arrastrar una
  imagen pegada directo del portapapeles (sólo selector/drag&drop de archivo
  en esta fase, pegar imagen es fácil de añadir después); borrado/limpieza
  de archivos huérfanos en MinIO cuando se borra la nota o se quita la
  imagen del texto (P-3); recorte/edición de la imagen.

## 3. Preguntas de producto para Carlos (Gate 1)

**P-1 (URL estable, no firmada) — ya explicado arriba:** ¿de acuerdo con
que la imagen se sirva por un endpoint propio autenticado de Synapse
(`GET /files/{id}`) en vez de un link firmado de MinIO con vencimiento?

**P-2 (cómo se sube):** propongo un botón nuevo en la Fila 3 del editor
(H-010, junto a los controles de formato, sólo visible en edición Visual) +
soporte de arrastrar-y-soltar un archivo directo sobre el área de edición.
¿Así es, o prefieres sólo uno de los dos mecanismos por ahora?

**P-3 (archivos huérfanos):** si borras el texto `![...]()` de una nota, o
borras la nota entera, el archivo se queda en MinIO (no se borra solo) —
más simple para esta primera fase, sin riesgo de borrar algo que otra nota
todavía referencia. ¿Aceptable por ahora, o necesitas que se limpie solo?

## 4. Criterios de aceptación (EARS booleano) — pendientes de P-1..P-3

- **C-1:** CUANDO el usuario sube una imagen válida (tipo admitido, ≤ 5 MB)
  desde una nota en edición Visual, el sistema DEBE guardarla en el bucket
  MinIO de Synapse, asociada a esa bóveda, e insertar
  `![nombre-del-archivo](url-del-endpoint)` en la posición del cursor.
- **C-2:** CUANDO el archivo supera 5 MB o no es un tipo admitido, el
  sistema DEBE rechazar la subida con un mensaje claro, sin crear nada en
  MinIO ni en el markdown.
- **C-3:** `GET /files/{id}` DEBE devolver 401 sin sesión válida, 404 si el
  archivo no existe o pertenece a una bóveda de otro usuario, y el
  contenido con el `Content-Type` correcto si todo es válido.
- **C-4:** La imagen insertada DEBE verse correctamente tanto en modo
  edición Visual como en Lectura (reusa el `imageSchema`/`safeImageUrl` ya
  existentes — la URL del endpoint propio es `https://synapse.cjhirashi.com/...`,
  pasa el filtro `http(s)` actual sin cambiarlo).
- **C-5:** Un SVG subido DEBE pasar por el mismo saneo que ya exige
  cualquier SVG del proyecto (RNF-003) antes de aceptarse — nunca se guarda
  ni se sirve un SVG con `<script>`/`on*`/`foreignObject` sin verificar.
- **C-6:** El límite de 5 MB y los tipos admitidos DEBEN verificarse tanto
  en el cliente (antes de subir, para feedback inmediato) como en el
  backend (nunca confiar sólo en el cliente).

`[NEEDS CLARIFICATION] = 3` (P-1 a P-3) — se resuelven con tu "así es".

## 5. Descartes

- Link firmado de MinIO con vencimiento para la URL de la imagen: se rompe
  con el tiempo, descartado (P-1).
- Pegar imagen directo del portapapeles: fuera de esta fase, el mecanismo
  base (subir + servir) es el mismo, se añade después sin tocar el backend.
- Limpieza automática de archivos huérfanos: fuera de esta fase (P-3).

## 6. Plan (de ESTA historia solamente) — borrador, se confirma al tomarla

- **Backend:** `minio_adapter.py` (cliente MinIO, `put_object`/`get_object`
  contra el bucket `synapse-files`, credenciales de `.env` ya configuradas:
  `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`/`MINIO_BUCKET`); `file_service.py`
  (valida tipo/tamaño, genera un id, guarda metadata — igual patrón que
  notas/bóvedas, un doc en CouchDB o una tabla en Postgres, a decidir según
  qué sea más simple de mantener consistente con el resto del proyecto);
  `routers/files.py` con `POST /files` (`multipart/form-data`, requiere
  `vault_id` + sesión) y `GET /files/{id}` (streaming, auth + ownership).
- **Frontend:** `uploadImage.ts` (llama al endpoint, maneja el límite de
  5 MB y tipos del lado cliente); botón nuevo en la Fila 3 de
  `NoteEditor.tsx` (H-010) + `ondrop`/`ondragover` sobre el contenedor de
  `MilkdownView`; al completar la subida, inserta el nodo de imagen en la
  posición del cursor (comando de Milkdown, mismo patrón que ya usan los
  demás botones de formato).
- Estrategia de prueba: tests de `file_service.py` (tipo/tamaño válido e
  inválido, ownership); tests de `routers/files.py` (401/404/200,
  aislamiento entre usuarios — mismo patrón que ya prueba `vaults.py`);
  `uploadImage.ts` (límite de cliente, llamada correcta); inserción del
  nodo de imagen en `NoteEditor.test.tsx`/`MilkdownView.test.tsx`.
- Pasos TDD: se detallan al tomar la historia (§3 del método).

## 7. Tabla de cobertura

(se llena al implementar)

## 8. Checkpoint demostrable

Carlos debe subir una imagen real a una nota (botón o arrastrar), verla en
Visual y en Lectura, y confirmar que recargar la página / volver más tarde
no rompe la imagen (URL estable, no firmada).

## 9. Session-End (al cerrar)

Pendiente — se completa al implementar.
