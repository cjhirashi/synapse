# Plan — H-015 (sólo esta historia)

Gate 1 pasado (Carlos, 2026-10-30). Implementación en Modo 2 (autoridad delegada a AIRA).

## Componentes del patrón de arquitectura a tocar

Backend (hexagonal: router → service → port ← adapter; errores vía `core/problems.py`):

- `app/core/config.py` — settings MinIO (`MINIO_ENDPOINT` def `synapse-minio:9000`,
  `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BUCKET` def `synapse-files`).
  Credenciales sin default (salen del `.env`); endpoint/bucket con default.
- `app/core/file_safety.py` — `sniff_content_type` (tipo por bytes, nunca por el header
  del cliente, C-6) y `is_safe_svg` (saneo RNF-003: sin `script`, `foreignObject`, `on*`,
  `href` navegable; rechaza DOCTYPE/ENTITY antes de parsear, C-5).
- `app/core/models/file.py` — modelo `File` (id, owner_id, vault_id, name, content_type,
  size, visibility default `private`, object_key, created_at).
- `alembic/versions/<rev>_006_files.py` — tabla `files`, encadenada tras `d1f4a6c8e2b9`.
- `app/core/ports/object_storage_port.py` — `ObjectStoragePort` (`put_object`, `get_object`).
- `app/adapters/minio_adapter.py` — `MinioObjectStorage` (importa `minio` de forma aislada).
- `app/adapters/file_repository.py` — `FileRepository` (create/get/set_visibility, Postgres).
- `app/services/file_service.py` — reglas: valida bóveda del usuario, tamaño ≤ 5 MB, tipo
  admitido, saneo SVG; crea objeto + registro; lee contenido; cambia visibilidad del dueño.
- `app/routers/files.py` — `POST` (multipart `file`+`vault_id`), `GET /{id}` (regla de
  visibilidad; SVG con CSP sandbox + nosniff), `PATCH /{id}`.
- `app/core/errors.py` — `FileNotFound` (404), `FileTooLarge` (413), `UnsupportedFileType`
  (415), `UnsafeSvg` (400).
- `app/core/schemas.py` — `FileMetaOut`, `FileVisibilityUpdate`.
- `app/core/dependencies.py` — sin cambios de auth (GET resuelve el principal a mano sólo
  si el archivo es privado, para no exigir credencial en los públicos).
- `app/main.py` — registra el router.

Frontend (React/Vite/Milkdown):

- `frontend/src/files/uploadFile.ts` — valida tipo + 5 MB en cliente y hace `POST /files`.
- `frontend/src/editor/MilkdownView.tsx` — comando `insertImage(url, alt)` en `EditorCommands`.
- `frontend/src/editor/NoteEditor.tsx` — botón de subir imagen en la Fila 3 (sólo Visual) +
  `drop`/`dragover` sobre el área de edición; inserta `![nombre](url)`; errores con `Notice`.

## Estrategia de prueba

- `tests/test_file_safety.py` — sniff de tipos + saneo SVG (unit, sin red).
- `tests/test_file_repository.py` — CRUD del repo en sqlite.
- `tests/test_file_service.py` — tipo/tamaño/SVG/propiedad con FAKE en memoria del puerto.
- `tests/test_files_api.py` — router 401/404/200, público sin sesión, aislamiento entre
  usuarios, API key (C-7), PATCH del dueño, cabeceras SVG. FAKE del puerto por override.
- `tests/test_config.py` — MinIO creds requeridas (endpoint/bucket con default).
- Frontend: `uploadFile.test.ts`, `MilkdownView`/`NoteEditor` (inserción + drop lo más
  realista posible en jsdom; la verificación REAL del gesto la hace AIRA en navegador — H-012).

## Pasos TDD ordenados

1. `file_safety` (sniff + SVG) → rojo/verde → commit.
2. config MinIO (test_config) → commit.
3. modelo `File` + migración + repo → commit.
4. puerto de almacenamiento + adaptador MinIO (fake en tests) → commit.
5. `file_service` → commit.
6. router + errores + schemas + wiring en main → commit.
7. `uploadFile.ts` (front) → commit.
8. comando `insertImage` + botón Fila 3 + drag&drop → commit.

## Impacto en documentación (Art. 11)

El contrato OpenAPI se regenera (routers nuevos) como los demás; `problem_responses` declara
los errores por ruta. Mapa de documentación: sin ADR nuevo (no cambia arquitectura; usa el
patrón puerto/adaptador ya vigente). Tabla de cobertura y Session-End en `historia.md` al cierre.
