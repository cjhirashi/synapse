---
titulo: Tasks — H-028 (+ H-027)
estado: desplegada
fecha_inicio: 2026-11-10
---

# Tasks — H-028 (+ H-027)

Tareas de implementación para la historia H-028. Pasos TDD del plan:
- **Backend:** T-1 a T-6 (API de perfil/foto)
- **Frontend (H-027):** T-7 a T-11 (sidebar de documentos)
- **Frontend (H-028):** T-12 a T-17 (riel + pantalla de usuario)

## Tabla de progreso

| ID    | Paso del plan | Descripción                                                              | Estado     | RF/T |
|-------|---------------|--------------------------------------------------------------------------|------------|------|
| T-1   | Backend 1     | Test migración round-trip + columnas nuevas (`display_name`, `avatar_*`) | **DONE** | B1-B3 |
| T-2   | Backend 2     | `GET /auth/me` devuelve `display_name=null`, `photo_url=null`            | **DONE** | B3-B4 |
| T-3   | Backend 3     | `PATCH /auth/me`: recorta, máx. 80, vacío→null, persiste                 | **DONE** | B5 |
| T-4   | Backend 4     | `PUT/DELETE/GET /auth/me/photo`: validación tipo/tamaño, URL en respuesta | **DONE** | B6-B9 |
| T-5   | Backend 5     | Aislamiento: usuario B no ve foto de A; API key rechazada (401/403)      | **DONE** | B8-B9 |
| T-6   | Backend 6     | Docs: `docs/API.md`, `backend/README.md` si aplica                       | **DONE** |      |
| T-7   | Frontend 7    | H-027: mousedown global ignora clics en `.note-menu`/`.confirm-dialog`   | **DONE** | C5 |
| T-8   | Frontend 8    | H-027: elimina bloque «Crear en…»; conserva `activeFolder`               | **DONE** | C1 |
| T-9   | Frontend 9    | H-027: botones «Nueva nota»/«Nueva carpeta» solo icono, centrados        | **DONE** | C2 |
| T-10  | Frontend 10   | H-027: elimina aviso `/` (`note-folder-hint`)                            | **DONE** | C3 |
| T-11  | Frontend 11   | H-027: nombre bóveda como franja delgada + sidebar+editor                | **DONE** | C4 |
| T-12  | Frontend 12   | Amplía tipo `Me`: `display_name`, `photo_url`; añade `updateDisplayName`, `uploadPhoto`, `deletePhoto` | **DONE** | |
| T-13  | Frontend 13   | A: `VaultRail.tsx` dividido — zona superior scroll, zona inferior fija (Archivos/Papelera/Usuario) | **DONE** | A1-A6 |
| T-14  | Frontend 14   | A7: elimina NavLink Archivos/Papelera de `AppLayout`, quita `ThemeToggle`/`AccountMenu` | **DONE** | A7 |
| T-15  | Frontend 15   | B1-B3: `SettingsPage` (layout nav lateral + `<Outlet>`), rutas en `App.tsx` | **DONE** | RF-015 |
| T-16  | Frontend 16   | B4+B10: sección Perfil (editor nombre + foto cuadrada + previsualización) | **DONE** | RF-016 |
| T-17  | Frontend 17   | Docs: `frontend/README.md`, `.harness/backlog.md`, `.harness/memory/history.md` | IN PROGRESS |      |

## Verificación pendiente (esta sesión)

- Suite backend completa (`pytest backend/tests/`) corriendo en primer plano tras arreglar
  `AuthService(..., object_storage=...)` en 3 sitios de test (bootstrap/provisioning/refresh)
  y construir `frontend/dist` (los asserts de `test_brand_assets.py`/`test_spa.py` sirven
  desde ahí). Pendiente: confirmación final en verde.
- Suite frontend completa (`npm test`) corrida y corregida: 4 archivos desactualizados por
  la división del riel (`layoutCss.test.ts`, `scrollbars.test.ts`, `iconSafety.dom.test.tsx`)
  ajustados a `.vault-rail-scroll`/`MeContext`/hrefs fijos del riel. Confirmado en verde (2972 tests).
- Pendiente: verificación visual Playwright/Chrome (390/768/1280px, ambos temas).
- Pendiente: commits por bloque, backlog.md, history.md.

## Notas

- **Backend:** 6 tareas, parte del contrato API.
- **Frontend H-027:** 5 tareas (pasos 7-11 del plan), trabajo concurrente permitido.
- **Frontend H-028:** 7 tareas (pasos 12-17), secuenciales. Actualmente: T-15 y T-16.
- **Docs:** actualizadas en el mismo commit por cada paso (Art. 11 de constitution.md).
- **TDD obligatorio:** test primero (debe fallar), código mínimo, refactor bajo test, RF anotado.
- **Modelo:** implementador = Haiku, revisor = Sonnet.
