---
id: H-002.5
titulo: Ventana de configuración para gestionar API keys de agente
estado: refinando # Gate 1 pasado (Carlos dijo "así es" 2026-10-28); falta implementar.
covers:
  - frontend/src/settings/ApiKeysPage.tsx
  - frontend/src/settings/ApiKeysPage.test.tsx
  - frontend/src/settings/apiKeys.ts
  - frontend/src/settings/apiKeys.test.ts
  - frontend/src/layout/AccountMenu.tsx
  - frontend/src/layout/AccountMenu.test.tsx
  - frontend/src/App.tsx
anchor_commit: 82b1852
origen: backlog
---

# H-002.5 — Ventana de configuración para gestionar API keys de agente

## 1. Intención (lenguaje de usuario)

Carlos corrigió el alcance original de SPEC-0013 (2026-10-28): no quiere
crear sus API keys solo por `curl`/API directo — quiere una ventana de
configuración en el frontend donde él mismo, como usuario, pueda crear,
ver y revocar las keys que necesite. El backend de H-002.1…2.4 ya existe,
probado y desplegado; esta historia es **solo la interfaz** sobre esos
mismos endpoints (`/auth/agent-keys`), sin tocar el backend.

## 2. Alcance / fuera de alcance

- Dentro: página `/settings/api-keys` (mismo patrón que `/settings/password`
  ya existente), enlazada desde `AccountMenu.tsx`; listar/crear/revocar.
- Fuera: cambios al backend; límite de número de keys; editar una key
  existente (solo crear/revocar, como ya permite el backend).

## 3. Criterios de aceptación (EARS booleano)

- **C-1:** CUANDO el usuario logueado abre `/settings/api-keys`, el sistema
  DEBE mostrar la lista de sus propias keys (`label`, `created_at`,
  `last_used_at`, estado activa/revocada) vía `GET /auth/agent-keys`.
- **C-2:** CUANDO el usuario pulsa "Crear API key" e ingresa un `label`, el
  sistema DEBE crearla vía `POST /auth/agent-keys` y mostrar el secreto en
  texto plano **una sola vez**, con botón de copiar y aviso explícito de
  que no se volverá a mostrar.
- **C-3:** SI el `label` ya existe entre las keys vigentes del usuario
  (409 `AgentKeyLabelTaken`), ENTONCES el sistema DEBE mostrar un error
  claro sin cerrar el formulario, sin perder lo ya escrito.
- **C-4:** CUANDO el usuario pulsa "Revocar" sobre una key activa, el
  sistema DEBE pedir confirmación y, tras confirmar, llamar
  `DELETE /auth/agent-keys/{id}` y reflejar el nuevo estado en la lista
  sin recargar la página.
- **C-5:** El menú de cuenta (`AccountMenu.tsx`) DEBE incluir un enlace a
  "API keys" junto a "Cambiar contraseña", mismo patrón visual.
- **C-6:** Accesibilidad: formulario y lista navegables por teclado,
  botones con nombre accesible, foco visible — mismo estándar que
  `ChangePasswordPage.tsx` (RF-008 de 0012 como referencia de patrón, no
  como requisito heredado).

`[NEEDS CLARIFICATION] = 0`.

## 4. Casos límite y errores

- Lista vacía (sin keys aún): mensaje vacío claro, botón de crear visible.
- `GET`/`POST`/`DELETE` fallan por red o 5xx: error visible, no un
  formulario roto en silencio.
- Confirmar revocación es obligatorio (sin confirmación, nunca revoca por
  un clic accidental).

## 5. Descartes

Ninguno — Carlos aprobó la propuesta tal cual ("así es", 2026-10-28).

## 6. Plan (de ESTA historia solamente)

- Componentes: `frontend/src/settings/apiKeys.ts` (cliente fetch: list/
  create/revoke, mismo patrón que el cliente de `ChangePasswordPage.tsx`),
  `ApiKeysPage.tsx` (página), alta de ruta en `App.tsx`
  (`/settings/api-keys`), enlace nuevo en `AccountMenu.tsx`.
- Sin contratos nuevos (reusa `contracts/openapi.yaml` de 0013, ya
  declarado y probado en el backend).
- Estrategia de prueba: `apiKeys.test.ts` (cliente, mockeando `fetch`),
  `ApiKeysPage.test.tsx` (render, crear, error 409, revocar con
  confirmación — Testing Library), `AccountMenu.test.tsx` (enlace nuevo
  presente). E2E opcional si el patrón de `properties*` ya cubre el estilo
  de formulario — no es obligatorio para esta historia (no hay requisito
  de fidelidad visual nueva, reusa estilos existentes de `/settings`).
- Pasos TDD ordenados:
  1. `CHECK:` `apiKeys.ts` rojo (list/create/revoke contra `fetch` mockeado)
     / `EXPECT:` verde con el cliente mínimo.
  2. `CHECK:` `ApiKeysPage.test.tsx` rojo (lista vacía → crear → ver
     secreto una vez → error 409 → revocar con confirmación) / `EXPECT:`
     verde con la página.
  3. `CHECK:` `AccountMenu.test.tsx` rojo (enlace nuevo) / `EXPECT:` verde
     con el enlace agregado.
  4. Ruta en `App.tsx`, build de frontend, regresión completa de frontend.
- Impacto en documentación (Art. 11): `docs/API.md` ya documenta los
  endpoints (H-002.4); agregar una línea en `frontend/src/README.md`
  mencionando la página nueva. `frontend/README.md` si aplica.

## 7. Tabla de cobertura

| Criterio | Paso(s) | Test | Estado |
|---|---|---|---|
| C-1 | 2 | `ApiKeysPage.test.tsx` (lista) | Pending |
| C-2 | 1, 2 | `apiKeys.test.ts`, `ApiKeysPage.test.tsx` (crear+secreto) | Pending |
| C-3 | 2 | `ApiKeysPage.test.tsx` (409) | Pending |
| C-4 | 1, 2 | `apiKeys.test.ts`, `ApiKeysPage.test.tsx` (revocar) | Pending |
| C-5 | 3 | `AccountMenu.test.tsx` | Pending |
| C-6 | 2 | `ApiKeysPage.test.tsx` (teclado/foco) | Pending |

## 8. Checkpoint demostrable

Pendiente — Carlos debe abrir `/settings/api-keys` en su propia sesión y
crear/revocar una key él mismo antes de marcar `verified`.

## 9. Session-End (al cerrar)

- **Claim:** pendiente.
- **Evidencia:** pendiente.
- **Línea base:** pendiente.
- **Gaps:** ninguno todavía.
- **Riesgo residual:** ninguno todavía.
- **Próximo paso:** tomar la historia, ciclo driver/navigator §4.
