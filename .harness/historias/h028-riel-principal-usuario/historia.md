---
id: H-028
titulo: Riel principal dividido + pantalla de usuario (con H-027, sidebar de documentos)
estado: in-progress
autorizacion: Carlos vía AIRA (2026-11-10) — cambio menor directo, sin Gate 1 previo
rama: feature/h028-riel-principal-usuario
base: feature/sprint-1-auth (e303a24)
covers:
  - frontend/src/notes/VaultRail.tsx
  - frontend/src/layout/AppLayout.tsx
  - frontend/src/layout/AccountMenu.tsx
  - frontend/src/theme/ThemeToggle.tsx
  - frontend/src/settings/**
  - frontend/src/api/auth.ts
  - frontend/src/auth/RequireAuth.tsx
  - frontend/src/App.tsx
  - frontend/src/notes/NoteSidebar.tsx
  - frontend/src/notes/TreeRowMenu.tsx
  - frontend/src/notes/VaultWorkspacePage.tsx
  - backend/app/core/models/user.py
  - backend/app/routers/auth.py
  - backend/app/services/auth_service.py
  - backend/app/core/schemas.py
  - backend/alembic/versions/*011*
---

# H-028 — Riel principal dividido + pantalla de usuario (+ H-027 sidebar)

## Contexto
El riel izquierdo solo lista bóvedas; Archivos, Papelera, tema y menú de usuario viven
en la navbar superior. La historia reestructura el riel en dos zonas y crea una pantalla
de usuario completa (perfil con foto/nombre, contraseña, API keys, tema). H-027 limpia la
sidebar de documentos y corrige un bug móvil.

## Criterios de aceptación (EARS)

### A — Riel principal dividido
- A1. El riel DEBE tener una zona superior (bóvedas) que ocupa la altura disponible y hace
  scroll vertical solo cuando su contenido excede el máximo.
- A2. El riel DEBE tener una zona inferior de altura = su contenido, con tres entradas en
  orden: Archivos, Papelera, Usuario (Usuario al final).
- A3. CUANDO el usuario pulsa Archivos, el sistema DEBE abrir `/files`.
- A4. CUANDO el usuario pulsa Papelera, el sistema DEBE abrir `/vaults/trash`.
- A5. CUANDO el usuario pulsa Usuario, el sistema DEBE abrir `/settings`.
- A6. La entrada Usuario DEBE mostrar la foto del usuario o, si no hay, sus iniciales
  (de `display_name` si existe, si no del correo).
- A7. El sistema NO DEBE mostrar en la navbar los enlaces Archivos, Papelera, el selector
  de tema ni el menú de usuario.
- A8. El riel DEBE verse correctamente colapsado y expandido (H-008) y, en móvil, dentro
  del riel flotante con la lógica de H-009.
- A9. Las entradas inferiores DEBEN conservar accesibilidad (aria-label, foco, teclado) y
  usar tokens/paleta del tema (sin colores sueltos).

### B — Pantalla de usuario (`/settings`)
- B1. El sistema DEBE ofrecer en `/settings` una página con navegación lateral y secciones:
  Perfil, Contraseña, API keys, Tema. `/settings/agent-access` se conserva aparte.
- B2. Las secciones Contraseña y API keys DEBEN reutilizar las páginas existentes sin
  reescribirlas.
- B3. La sección Tema DEBE contener el control de tema que sale de la navbar.
- B4. La sección Perfil DEBE permitir editar el nombre (validado, recortado, máx. 80) y
  subir/quitar la foto.
- B5. `GET /auth/me` DEBE devolver además `display_name` y la URL de la foto.
- B6. CUANDO se sube una foto que no sea PNG/JPEG/WebP validada por contenido, o pese más
  de 2 MB, el sistema DEBE rechazarla.
- B7. La foto DEBE ser cuadrada (recorte en el cliente) y almacenarse en MinIO.
- B8. Un usuario NO DEBE poder ver ni modificar la foto o el nombre de otro usuario.
- B9. Una API key de agente NO DEBE poder editar el perfil del usuario.
- B10. CUANDO el usuario guarda nombre/foto, el riel DEBE reflejarlo sin recargar.

### C — Sidebar de documentos (H-027)
- C1. El sistema NO DEBE mostrar el bloque «Crear en…»; la carpeta destino DEBE seguir
  resaltada en el árbol y DEBE indicarse en el aria-label/título del botón de crear.
- C2. «Nueva nota» y «Nueva carpeta» DEBEN ser botones de solo icono, en la misma línea,
  centrados.
- C3. El sistema NO DEBE mostrar el aviso sobre el uso de `/` al crear; la función de `/`
  se conserva.
- C4. El sistema NO DEBE mostrar el título de la bóveda dentro de la sidebar; DEBE mostrarlo
  como franja delgada (nombre en su color) sobre la sidebar y la vista del documento, junto
  al botón ocultar/mostrar.
- C5. MIENTRAS la sidebar flotante está abierta en móvil, CUANDO el usuario abre el menú ⋮
  y elige Renombrar o Eliminar, el sistema NO DEBE cerrar la sidebar.
- C6. La confirmación de eliminar DEBE ser un diálogo flotante centrado (modal con portal,
  foco atrapado, Escape cierra). (Ya implementado vía `ConfirmDelete`→`ConfirmDialog`; se
  verifica y, si procede, solo se endurece.)

## Descartes / decisiones
- Recorte cuadrado en **cliente** (canvas) para no añadir Pillow al servidor; el servidor
  valida magic bytes + tamaño + tipo con `file_safety` existente.
- Foto servida por `GET /auth/me/photo` (cookie, sin `user_id` en la URL) → aislamiento por
  construcción. `get_current_user` (solo cookie) bloquea API keys de agente sin lógica extra.
- «Cerrar sesión» se mueve del `AccountMenu` (que se elimina) a la pantalla de usuario.
- C6 ya cumplido por `ConfirmDelete`; el trabajo de H-027 ahí es el fix de C5 (que el diálogo
  y el menú portaled no cuenten como «clic fuera»).
