---
id: H-002.5
titulo: Ventana de configuración para gestionar API keys de agente
estado: implemented # 4 pasos TDD en verde + build + test:cov (2026-10-28). Falta checkpoint demostrable de Carlos para 'verified'.
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

Estado: `Green` = test ejecutado y en verde (suite `test:cov` 2026-10-28: 88 archivos,
1654 tests, 0 fallos; build exit 0). Cobertura de los archivos `covers`: `apiKeys.ts`
100 %, `ApiKeysPage.tsx` 91.6 % stmts, `AccountMenu.tsx` 96.4 %, `App.tsx`/`RequireAuth.tsx`
100 % líneas, `problems.ts` 100 %.

| Criterio | Paso(s) | Test | Estado |
|---|---|---|---|
| C-1 | 2, 4 | `ApiKeysPage.test.tsx` (lista, vacía, error de carga), `App.test.tsx` (ruta) | Green |
| C-2 | 1, 2 | `apiKeys.test.ts` (POST), `ApiKeysPage.test.tsx` (crear+secreto una vez+copiar) | Green |
| C-3 | 1, 2 | `apiKeys.test.ts` (409), `ApiKeysPage.test.tsx` (error sin cerrar el form) | Green |
| C-4 | 1, 2 | `apiKeys.test.ts` (DELETE), `ApiKeysPage.test.tsx` (revocar + confirmar + cancelar) | Green |
| C-5 | 3 | `AccountMenu.test.tsx` (enlace nuevo, cierre del menú) | Green |
| C-6 | 2 | `ApiKeysPage.test.tsx` (foco al abrir, Escape cierra la confirmación) | Green |

## 8. Checkpoint demostrable

Pendiente — Carlos debe abrir `/settings/api-keys` en su propia sesión y
crear/revocar una key él mismo antes de marcar `verified`.

## 9. Session-End (2026-10-28, Driver)

- **Claim:** H-002.5 implementada. Los 4 pasos de §6 corrieron en TDD (verde) y están
  commiteados por separado citando H-002.5; `estado: implemented`. Falta sólo el
  **checkpoint demostrable** de Carlos para `verified`. Backend intacto.
- **Evidencia (ejecutada):**
  - Paso 1 — `frontend/src/settings/apiKeys.ts` + `apiKeys.test.ts` → 4/4. Commit `f452c87`.
  - Paso 2 — `frontend/src/settings/ApiKeysPage.tsx` + `ApiKeysPage.test.tsx` → 8/8
    (C-1…C-4, C-6); `PROBLEM.agentKeyLabelTaken` en `api/problems.ts`; bloque CSS en
    `styles/global.css`. Commit `aa57762`.
  - Paso 3 — enlace «API keys» en `layout/AccountMenu.tsx` (const `API_KEYS_PATH` en
    `auth/RequireAuth.tsx`) + `AccountMenu.test.tsx` → 2/2 (C-5). Commit `6242614`.
  - Paso 4 — ruta `/settings/api-keys` en `App.tsx` + test de ruta en `App.test.tsx` → 19/19
    (nuevo + regresión); línea en `frontend/src/README.md`. Commit `cd246f6`.
  - Build: `npm run build` exit 0 (typecheck + `✓ built in 34.44s`).
  - Suite: `npm run test:cov` → **88 archivos, 1654 tests, 0 fallos**.
- **Línea base:** 1654 tests en verde (incluye los 14 nuevos de la historia). Cobertura de
  los `covers`: `apiKeys.ts` 100 %, `problems.ts` 100 %, `App.tsx`/`RequireAuth.tsx` 100 %
  líneas, `AccountMenu.tsx` 96.4 %, `ApiKeysPage.tsx` 91.6 % stmts.
- **Gaps:** cobertura de ramas de `ApiKeysPage.tsx` por debajo del 100 % (líneas 97-98,
  110, 165-168): el `catch` de copiar sin `navigator.clipboard`, el aviso de error de
  revocación y los `navigate("/login")` por 401 no tienen test propio (son caminos de error
  defensivos; los criterios C-1…C-6 sí están cubiertos). No bloquea.
- **Nota de entorno:** el worktree no traía `frontend/node_modules`; se enlazó por symlink a
  las deps ya instaladas del repo principal (mismas versiones: vite 5.4.8, vitest 2.1.2).
  Convención de git worktrees, reversible, no versionado.
- **Riesgo residual:** ninguno de código. Falta la verificación en runtime del usuario.
- **Próximo paso:** checkpoint demostrable — Carlos abre `/settings/api-keys`, crea y revoca
  una key; luego `verified`, ancla y merge (lo hace AIRA; no hice push ni merge).
