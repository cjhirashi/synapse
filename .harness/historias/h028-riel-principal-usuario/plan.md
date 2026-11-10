# Plan — H-028 (+ H-027)

Arquitectura: hexagonal (services → core/ports; adapters por factory). Frontend React/Vite.
Modelo por razonamiento: diseño/plan (este doc) = Opus; implementación + tests = Haiku
(`implementador`); verificación = `revisor` (Sonnet). Commits atómicos por paso citando
H-028/H-027.

## Contratos / API nueva (docs/API.md)
- `GET /auth/me` → añade `display_name: string|null`, `photo_url: string|null`
  (`/auth/me/photo?v=<avatar_version>` cuando hay foto, si no `null`).
- `PATCH /auth/me` body `{ "display_name": string|null }` → recorta, máx. 80, vacío→null;
  devuelve el mismo cuerpo que `/auth/me`. Solo cookie (`get_current_user`).
- `PUT /auth/me/photo` multipart `file` → valida tipo (PNG/JPEG/WebP por contenido) y
  tamaño ≤ 2 MB; guarda en MinIO `users/<user_id>/avatar`; sube `avatar_version`; devuelve me.
- `DELETE /auth/me/photo` → borra el objeto, limpia columnas; devuelve me.
- `GET /auth/me/photo` → bytes de la foto del propio usuario (cookie); 404 si no hay.
  Nunca recibe `user_id`: imposible pedir la de otro.
- Errores de dominio nuevos en `core/errors.py` (+ `problems.py`): `ProfilePhotoInvalidType`
  (415/400), `ProfilePhotoTooLarge` (413), `DisplayNameTooLong` (422, vía `ValidationFailed`),
  `ProfilePhotoNotFound` (404).

## Migración Alembic 011 (users)
- `down_revision = 'c5d8e0f2a4b6'` (010_file_folders, la última de la cadena).
- Añade a `users`: `display_name VARCHAR(80) NULL`, `avatar_content_type VARCHAR NULL`,
  `avatar_version INTEGER NOT NULL DEFAULT 0 (server_default '0')`.
- `upgrade()` y `downgrade()` reversibles; probar round-trip en BD de prueba.

## Modelo / servicio backend
- `user.py`: columnas nuevas (mismo estilo de columnas existentes, comentario H-028).
- `auth_service.py`: métodos `update_display_name(user_id, name)`,
  `set_avatar(user_id, data, content_type)`, `clear_avatar(user_id)`,
  `get_avatar(user_id) -> (bytes, content_type)|None`. Usan `repo` + `object_storage_port`.
  Validación de tipo/tamaño con `file_safety.resolve_content_type` (lista {png,jpeg,webp}) y
  tope `AVATAR_MAX_SIZE = 2 * 1024 * 1024`.
- `AuthService` gana el `object_storage_port` por factory (igual que `FileService`).

## Pasos TDD — Paquete BACKEND (implementador Haiku; tests pytest en imagen 3.11)
1. Test de migración round-trip (upgrade→downgrade sobre BD de prueba) + columnas nuevas.
2. `GET /auth/me` devuelve `display_name=null`, `photo_url=null` por defecto (amplía test).
3. `PATCH /auth/me`: recorta, máx. 80 (rechaza >80), vacío→null, persiste; devuelve me.
4. `PUT/DELETE/GET /auth/me/photo`: sube PNG/JPEG/WebP válido; rechaza tipo no permitido y
   >2 MB (prueba por contenido, no extensión); `photo_url` aparece/desaparece.
5. Aislamiento: usuario B no ve ni cambia foto/nombre de A (`GET /auth/me/photo` solo propio;
   PATCH solo propio). API key de agente: `PATCH/PUT/DELETE` → 401/403 (get_current_user).
6. [doc] `docs/API.md` (endpoints nuevos) + `backend/README.md` si cambia estructura/env.

## Pasos TDD — Paquete FRONTEND-C (H-027, implementador Haiku)
7. C5+C6: en `VaultWorkspacePage.tsx` el `mousedown` global ignora clics cuyo target esté
   dentro de `.note-menu` o `.confirm-dialog`/`.modal-backdrop` (closest). Test: con sidebar
   flotante abierta (móvil), clic en opción del menú y en el diálogo no cierra la sidebar.
8. C1: elimina el bloque «Crear en…» (`note-create-in`); mantiene `activeFolder` y su
   resaltado (`aria-current`); el destino pasa al `aria-label`/`title` del botón de crear.
9. C2: «Nueva nota»/«Nueva carpeta» como botones de solo icono, misma línea, centrados
   (aria-label con texto). Ajusta CSS `notes.css`.
10. C3: elimina el aviso de `/` (`note-folder-hint`); conserva `titleToPath`/`joinPath`.
11. C4: quita el nombre de la bóveda de la sidebar (si aplica) y añade franja delgada
    (nombre en color de bóveda) sobre sidebar+documento, junto al toggle. Test de render.

## Pasos TDD — Paquete FRONTEND-A+B (riel + pantalla de usuario, implementador Haiku)
12. Amplía tipo `Me` (`api/auth.ts`): `display_name: string|null`, `photo_url: string|null`.
    Añade `updateDisplayName`, `uploadPhoto`, `deletePhoto` (patrón `request`).
13. A: `VaultRail.tsx` dividido — zona superior scroll (`flex:1; overflow-y:auto`), zona
    inferior fija (`flex-shrink:0`) con Archivos→/files, Papelera→/vaults/trash,
    Usuario→/settings. Usuario usa `useMe()`: `photo_url` o `initials(display_name||email)`.
    CSS en `notes.css`. Tests: orden, rutas, icono foto/iniciales, colapsado/expandido.
14. A7: quita de `AppLayout.tsx` los NavLink Archivos/Papelera, `ThemeToggle` y `AccountMenu`
    (se elimina `AccountMenu`). «Cerrar sesión» se reubica en la pantalla de usuario.
    `LogoutDialog` permanece montado. Actualiza `AppLayout.test.tsx`/`AccountMenu.test.tsx`.
15. B1-B3: `SettingsPage` (layout con nav lateral + `<Outlet>`) y rutas en `App.tsx`:
    `/settings` → redirige a `/settings/profile`; `/settings/profile` (nuevo),
    `/settings/password` (reusa `ChangePasswordPage`), `/settings/api-keys` (reusa),
    `/settings/theme` (`ThemeToggle`). `/settings/agent-access` se conserva. Oculta los
    enlaces cruzados hardcodeados de ApiKeys/AgentAccess cuando se embeben en la nav lateral
    (o déjalos; decisión del revisor). «Cerrar sesión» como acción del layout de settings.
16. B4+B10: sección Perfil — editor de nombre (input máx. 80, guardar → `updateDisplayName`
    → `refreshMe()`), foto (input file, recorte cuadrado canvas, previsualización, subir →
    `uploadPhoto` → `refreshMe()`, quitar → `deletePhoto` → `refreshMe()`). El riel refleja
    el cambio por `refreshMe()` (useMe compartido). Tests con mocks de api.
17. [doc] `frontend/README.md` (estructura settings/riel), `docs/API.md` (ya en paso 6),
    `.harness/backlog.md` (H-028/H-027 estado), `.harness/memory/history.md` (Session-End).

## Estrategia de prueba
- Frontend: vitest por componente (RTL, MemoryRouter, MeContext, WithSync), `npx tsc
  --noEmit`, `npm run build`.
- Backend: pytest dentro de la imagen Python 3.11 (prod); migración upgrade/downgrade sobre
  BD de prueba; aislamiento entre usuarios y rechazo de tipo/tamaño.
- Navegador real (Playwright/Chrome) 390/768/1280 px, ambos temas, usuario y bóveda
  desechables; capturas en `/home/cjhirashi/.openclaw/workspace-aira/tmp/h028-capturas/`.

## Docs que la historia deja obsoletos (Art. 11)
- `docs/API.md` (endpoints de perfil/foto) — paso 6.
- `backend/README.md` (columnas users / avatar en MinIO) — paso 6, si aplica.
- `frontend/README.md` (riel dividido, pantalla de usuario) — paso 17.
- `.harness/backlog.md`, `.harness/memory/history.md`.
- Skill global `skill-bovedas-synapse.md`: **no aplica** — no cambia lo que un agente ve/hace
  con `synapse_vault` (perfil humano, cookie-only). Se declarará la exención.
