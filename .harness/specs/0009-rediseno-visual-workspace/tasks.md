---
id: TASKS-0009
tipo: tasks
feature: 0009-rediseno-visual-workspace
estado: approved
actualizado: 2026-10-23
---

# TASKS-0009 · Rediseño visual del workspace de bóvedas y notas

> Desglose de PLAN-0009 (**borrador**: el GATE 2 sigue pendiente). Si el GATE 2 cambia algún
> P-n, se ajustan las tareas marcadas con ese P-n entre corchetes (p. ej. `[P-1]`).
> Orden de method.md v1.9: línea base → re-anclajes → infraestructura visual (en rojo) →
> **maquetación con datos simulados** → **revisión visual temprana** → backend `Vault.icon` →
> cableado del cliente → RNF-001 → documentación y verificación completa.

## Reglas
- Cada tarea: ≤ 30 min, un solo propósito, `(cubre RF-NNN)`, zona del patrón (o `[doc]`).
- Orden por dependencias (PLAN-0009 §6). **Test antes que código**: cada test rojo va justo
  antes de la tarea que lo pone en verde.
- Cada tarea lleva su `CHECK:` (comando exacto, rutas relativas a la raíz del worktree) y su
  `EXPECT:` (resultado esperado; en un test rojo, el fallo esperado).
- **Tareas de percepción** (layout, iconografía, densidad, tema): el CHECK incluye capturas y
  mediciones en **Chromium real** (`npm run test:visual`, contenedor Playwright 1.56.0), no sólo DOM
  en jsdom. Las capturas van a `/tmp/s9/e2e/`; las de referencia del mockup están en `/tmp/s9/ref/`.
- `npm run test:visual` necesita el backend del worktree sirviendo la SPA compilada en
  `http://127.0.0.1:8010` (SPEC-0007) con CouchDB real; lo arranca y lo para
  `frontend/scripts/visual.sh` (T-005).
- La suite completa del backend tarda **~16 min**, no se cuelga y se corre **sola** (nada más
  contra el CouchDB `:15984` a la vez). No se corta.
- Cada test lleva en un comentario el `RF-` que cubre (Art. 9). Ninguna `HTTPException`: errores
  con el catálogo de SPEC-0004.
- `git add` explícito, nunca `-A`; nunca se añade `test.db`.
- RF-007: ningún test existente de 0008 cambia salvo los dos cambios explícitos del plan
  (nombre accesible del chip con ícono; aserciones de U-7 en `layoutCss.test.ts`).

## Tareas

### 0 · Línea base
- [x] T-000 — Instalar dependencias y compilar en el worktree limpio (cubre RNF-001: referencia de no regresión) [zona: sistema]
  - CHECK: `cd frontend && npm ci && npm run build`
  - EXPECT: `npm ci` sin errores; `build` exit 0 (typecheck + `vite build` "built in").
- [x] T-001 — Suite del frontend en verde y números anotados en `history.md` (cubre RF-007: línea base de la suite de 0008) [zona: sistema]
  - CHECK: `cd frontend && npx vitest run && npm run test:perf && npm run test:sync`
  - EXPECT: `Tests 799 passed (799)` (o el número vigente) con 0 failed; `test:perf` p95 < 300 ms; `test:sync` 25/25.
- [x] T-002 — Suite del backend en verde, **sola** contra CouchDB `:15984` (cubre RF-012: línea base) [zona: sistema]
  - CHECK: `bash .harness/gate/check.sh && (cd backend && python3 -m pytest -q)`
  - EXPECT: gate "Compuerta abierta"; `1054 passed` (o el número vigente), 0 failed, ~16 min.

### A · Re-anclajes previos (PLAN-0009 P-10)
- [x] T-003 — Nota de re-anclaje en `0008-vault-editor/spec.md` (modo `strict`): SPEC-0009 cambia el vestido de `notes/**` y `editor/**` sin tocar sus RF [doc] [P-10]
  - CHECK: `git diff --name-only -- .harness/specs/0008-vault-editor/spec.md && bash .harness/gate/check.sh | grep 0008`
  - EXPECT: el archivo aparece en el diff; la línea de 0008 en ✅ (no "DRIFT").
- [x] T-004 — Nota de re-anclaje en `0007-fastapi-sirve-spa/spec.md` (modo `strict`, dueña de `backend/README.md` y `frontend/README.md`) [doc] [P-10]
  - CHECK: `git diff --name-only -- .harness/specs/0007-fastapi-sirve-spa/spec.md && bash .harness/gate/check.sh | grep 0007`
  - EXPECT: el archivo aparece en el diff; la línea de 0007 en ✅.

### B · Infraestructura de verificación visual (rojo contra la UI actual)
- [x] T-005 — `@playwright/test` 1.56.0 (devDependency exacta), `frontend/playwright.config.ts` (Chromium, `deviceScaleFactor: 1`, `reducedMotion: "reduce"`, `baseURL` de `BASE_URL`, salida `/tmp/s9/e2e`), `frontend/scripts/visual.sh` (compila la SPA, arranca el backend del worktree en `:8010`, corre `npx playwright test` en `mcr.microsoft.com/playwright:v1.56.0-jammy --network host --ipc=host`, para el backend) y script `test:visual` (cubre RF-006) [zona: sistema] [P-9]
  - CHECK: `cd frontend && npm ls @playwright/test && npm run test:visual -- --list`
  - EXPECT: `@playwright/test@1.56.0`; la lista de pruebas sale vacía ("Total: 0 tests") sin error de configuración.
- [x] T-006 — `frontend/e2e/fixtures.ts`: siembra por API REST (usuario, 3 bóvedas; `icon` vía réplica en el navegador con `pouchdb` de la página mientras el servidor no tenga el campo — datos simulados) y por UI (2 niveles de carpetas, 4 notas, nombre de 120 caracteres, 40 bóvedas para V-6); helper `measure(selector)` (caja, colores y radios computados) y `tokens(theme)` que lee `src/styles/tokens.css` (cubre RF-006) [zona: sistema]
  - CHECK: `cd frontend && npm run test:visual -- --list`
  - EXPECT: compila sin errores de TypeScript; aún "Total: 0 tests".
- [x] T-007 — Test (rojo) V-1/V-2: riel (R-1…R-5, círculo 50 % inactivo, `--radius-md` activo, barra 3 × 20 `--accent`, fondo `--bg-secondary`) y tooltip (nombre completo, x ≥ 56, dentro del *viewport*) en oscuro/claro a 1440 y 1024, con capturas (cubre RF-001, RF-002) [zona: test]
  - CHECK: `cd frontend && npm run test:visual -- --grep "V-1|V-2"`
  - EXPECT: falla: chip 38 × 38 (≠ 34) con radio 10 px; no hay elemento de tooltip. Capturas `rail-*.png` generadas.
- [x] T-008 — Test (rojo) V-3: barra lateral (R-6…R-11; fondo del formulario ≠ fondo del panel del árbol; `svg[data-icon]` de carpeta/nota por fila; fila de 120 caracteres con elipsis y `scrollWidth = clientWidth`) con capturas (cubre RF-003, RF-004, RF-010) [zona: test]
  - CHECK: `cd frontend && npm run test:visual -- --grep "V-3"`
  - EXPECT: falla: ancho de la barra 280 (≠ 240); no hay `.note-tree-panel` ni `svg[data-icon]`.
- [x] T-009 — Test (rojo) V-4/V-5: barra superior del editor (R-12), columna centrada de 780 px (R-13, R-14, \|izq − der\| ≤ 2), x del panel 296 (R-15) en lectura/Visual/Código; estado vacío centrado ±4 px, con capturas (cubre RF-005, RF-008) [zona: test]
  - CHECK: `cd frontend && npm run test:visual -- --grep "V-4|V-5"`
  - EXPECT: falla: el cuerpo ocupa todo el ancho del panel (≠ 780) y el estado vacío está arriba a la izquierda.
- [x] T-010 — Test (rojo) V-6, V-8, V-9, V-10: 40 bóvedas con scroll propio del riel y el documento sin scroll; `data-theme="dark"` sin `localStorage`; colores computados ∈ tema activo de `tokens.css`; 390 px sin scroll horizontal (cubre RF-009, RF-006a, RF-006) [zona: test]
  - CHECK: `cd frontend && npm run test:visual -- --grep "V-6|V-8|V-9|V-10"`
  - EXPECT: falla V-8 (`data-theme` = resultado de "sistema", `light` en el contenedor) y V-6 (el documento hace scroll con la cabecera); V-9/V-10 pueden pasar ya (se anota cuáles).
- [x] T-011 — Test (rojo) V-7: selector de ícono en el formulario de bóveda (25 opciones de ícono, 6 de color) y, tras guardar, el chip del riel cambia sin navegación de documento (cubre RF-011, RF-012) [zona: test]
  - CHECK: `cd frontend && npm run test:visual -- --grep "V-7"`
  - EXPECT: falla: no existe el `radiogroup` "Ícono".

### C · Maquetación del frontend (datos simulados de ícono)
- [x] T-012 — Test (rojo) `theme/useTheme.test.tsx`: sin `localStorage` → `data-theme="dark"` y "Tema oscuro" `aria-pressed=true` sin escribir `localStorage`; con `light`/`system`/`dark` guardado → se respeta; el script de `index.html` usa el mismo defecto que `DEFAULT_THEME_MODE` (cubre RF-006a) [zona: test] [P-7]
  - CHECK: `cd frontend && npx vitest run src/theme/useTheme.test.tsx`
  - EXPECT: falla: `DEFAULT_THEME_MODE` no se exporta y el modo inicial es `system`.
- [x] T-013 — `DEFAULT_THEME_MODE = "dark"` en `theme/useTheme.ts` y mismo defecto en el script de `frontend/index.html` (cubre RF-006a) [zona: frontend] [P-7]
  - CHECK: `cd frontend && npx vitest run src/theme && npm run typecheck`
  - EXPECT: todos `passed`; typecheck sin errores.
- [x] T-014 — Test (rojo) `vaults/vaultIcon.test.ts`: `ICON_SET` con los 24 glifos del plan (todos componentes), `PALETTE` = 5 claves existentes en `tokens.css`, `parseIcon`/`formatIcon` (ida y vuelta, `initials`, glifo y color desconocidos, `null`), `derivedColor` estable y en `PALETTE`, `initials` (casos del test actual del riel), contraste ≥ 4,5:1 del glifo `--text-primary` sobre `color-mix` 18 % de cada clave en ambos temas (cubre RF-001, RF-006) [zona: test] [P-1, P-2]
  - CHECK: `cd frontend && npx vitest run src/vaults/vaultIcon.test.ts`
  - EXPECT: falla al importar `./vaultIcon` (no existe).
- [x] T-015 — `vaults/vaultIcon.ts` (catálogo, paleta, `parseIcon`, `formatIcon`, `derivedColor`, `initials` movida desde `VaultRail.tsx` y re-exportada) (cubre RF-001) [zona: frontend] [P-1]
  - CHECK: `cd frontend && npx vitest run src/vaults/vaultIcon.test.ts src/notes/VaultRail.test.tsx && npm run typecheck`
  - EXPECT: todos `passed`.
- [x] T-016 — Test (rojo) `vaults/VaultChip.test.tsx`: ícono del set con `data-icon`, iniciales si `null`/`initials`/glifo desconocido, variable de color elegida o derivada en `style` (sólo `var(--clave)` de `PALETTE`; un color desconocido nunca llega al `style`) (cubre RF-001) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/vaults/VaultChip.test.tsx`
  - EXPECT: falla al importar `./VaultChip`.
- [x] T-017 — `vaults/VaultChip.tsx` + `vaults/VaultChip.css` (34 px, círculo → `--radius-md` en *hover*/activo, tinte `color-mix` 18 %, aro 2 px, glifo `--text-primary` 18 px / iniciales 12 px 700) (cubre RF-001, RF-006) [zona: frontend] [P-2, P-12]
  - CHECK: `cd frontend && npx vitest run src/vaults/VaultChip.test.tsx && npm run typecheck`
  - EXPECT: todos `passed`.
- [x] T-018 — Test (rojo) en `notes/VaultRail.test.tsx`: el riel usa `VaultChip` con el `icon` del documento sembrado en la réplica; tooltip con el nombre completo al `hover` y al foco, que desaparece al salir; sin atributo `title`; nombre accesible con iniciales igual que hoy y, con ícono, igual al nombre (cambio explícito de RF-007) (cubre RF-001, RF-002, RF-007) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/VaultRail.test.tsx`
  - EXPECT: fallan las pruebas nuevas (no hay tooltip; el chip es texto plano); las existentes siguen `passed`.
- [x] T-019 — `notes/VaultRail.tsx`: `VaultChip` + `RailTooltip` (portal en `document.body`, `position: fixed`, `aria-hidden`), sin `title`; barra de activa `::before` en `notes/notes.css` (cubre RF-001, RF-002) [zona: frontend]
  - CHECK: `cd frontend && npx vitest run src/notes/VaultRail.test.tsx && npm run typecheck`
  - EXPECT: todos `passed`.
- [x] T-020 — Test (rojo) en `notes/layoutCss.test.ts`: sustituye **explícitamente** las aserciones de U-7 (riel `sticky` + `max-height: 100vh`; icono `height: 38px`) por las del marco fijo (`.app-shell` `height: 100dvh`; `.app-body` `min-height: 0`; `.vault-rail` y `.app-main` `overflow-y: auto`; `.vault-rail` sin `position: sticky`); añade "sin literales de color" en `notes.css`, `editor.css` y `vaults/VaultChip.css` (cubre RF-009, RF-006, RF-007) [zona: test] [P-5]
  - CHECK: `cd frontend && npx vitest run src/notes/layoutCss.test.ts`
  - EXPECT: fallan las aserciones nuevas del marco (`.app-shell` sin `height: 100dvh`).
- [x] T-021 — Marco de altura fija en `layout/AppLayout.css` y riel con scroll propio en `notes/notes.css` (56 px, `--bg-secondary`, `padding: var(--space-3) 0`, `gap: var(--space-2)`) (cubre RF-009) [zona: frontend] [P-5]
  - CHECK: `cd frontend && npx vitest run src/notes/layoutCss.test.ts src/layout && npm run test:visual -- --grep "V-6"`
  - EXPECT: vitest `passed`; V-6 `passed` (riel `scrollHeight > clientHeight`, documento sin scroll) con capturas `rail-overflow-*.png`.
- [x] T-022 — Test (rojo) en `notes/VaultWorkspacePage.test.tsx`: cabecera `.vault-workspace-header` con el `h1` del nombre e ícono; estado vacío `.vault-workspace-empty` con ícono y el mismo texto (cubre RF-003, RF-008) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/VaultWorkspacePage.test.tsx`
  - EXPECT: fallan las 2 pruebas nuevas; las existentes `passed`.
- [x] T-023 — `notes/VaultWorkspacePage.tsx`: cabecera de la barra y estado vacío centrado (cubre RF-003, RF-008) [zona: frontend]
  - CHECK: `cd frontend && npx vitest run src/notes/VaultWorkspacePage.test.tsx && npm run typecheck`
  - EXPECT: todos `passed`.
- [x] T-024 — Test (rojo) en `notes/NoteSidebar.test.tsx`: formulario en `.note-sidebar-new` fuera de `.note-tree-panel`; el `role="tree"` dentro del panel; cada carpeta con `svg[data-icon="folder"|"folder-open"]` según esté plegada; cada nota con `svg[data-icon="file-text"]`; papelera como pie; la fila larga conserva el nombre completo en `title` (cubre RF-003, RF-004, RF-010) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/notes/NoteSidebar.test.tsx`
  - EXPECT: fallan las pruebas nuevas; las existentes `passed`.
- [x] T-025 — `notes/NoteSidebar.tsx`: panel del árbol, íconos de carpeta/nota, formulario como bloque, pie de papelera (mismos roles y nombres) (cubre RF-003, RF-004) [zona: frontend]
  - CHECK: `cd frontend && npx vitest run src/notes && npm run typecheck`
  - EXPECT: todos `passed` (incluida toda la batería de 0008 de `notes/`).
- [x] T-026 — `notes/notes.css` de la barra lateral: 240 px, cabecera 51 px, formulario `--bg-tertiary`, panel `--bg-secondary`, filas 27/25 px a 12 px, sangría 24 px por nivel (+20 px la nota), seleccionada `--accent-soft` + barra 3 px + `--text-primary`, elipsis (cubre RF-003, RF-004, RF-010) [zona: frontend] [P-3]
  - CHECK: `cd frontend && npx vitest run src/notes && npm run test:visual -- --grep "V-3"`
  - EXPECT: vitest `passed` (incluido `accentContrast.test.ts` sin cambios); V-3 `passed` con capturas `sidebar-*.png`.
- [x] T-027 — Test (rojo) en `editor/NoteEditor.test.tsx`: la cabecera es `.note-editor-header` con el `h2`, el contenido va dentro de `.note-editor-column`; roles, nombres y `aria-pressed` de Visual/Código, Guardar y Leer/Editar sin cambios (cubre RF-005, RF-007) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/editor/NoteEditor.test.tsx`
  - EXPECT: falla la prueba de `.note-editor-column`; las existentes `passed`.
- [x] T-028 — `editor/NoteEditor.tsx` (+ `MilkdownView.tsx`/`CodeView.tsx` si hace falta) con la columna; `editor/editor.css`: barra 43 px `--bg-secondary`, cuerpo sin tarjeta, columna `max-width: 780px` + `margin-inline: auto` + `padding: var(--space-8) var(--space-16)`, párrafos 14 px / 1.8; panel del editor a alto completo en `notes/notes.css` (cubre RF-005) [zona: frontend]
  - CHECK: `cd frontend && npx vitest run src/editor src/notes && npm run test:visual -- --grep "V-4|V-5"`
  - EXPECT: vitest `passed`; V-4 y V-5 `passed` (columna 780 ± 2, centrada ≤ 2 px; vacío ±4 px) con capturas `editor-*.png`, `empty-*.png`.
- [x] T-029 — Test (rojo) `vaults/IconPicker.test.tsx`: `radiogroup` "Ícono" (Iniciales + 24) y "Color" (Automático + 5) con nombres en español, flechas mueven la selección, `onChange` emite `formatIcon(glifo, color)`; `VaultListPage.test.tsx`: cada fila muestra el chip (cubre RF-011) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/vaults/IconPicker.test.tsx src/vaults/VaultListPage.test.tsx`
  - EXPECT: falla al importar `./IconPicker`; la prueba nueva de `VaultListPage` falla.
- [x] T-030 — `vaults/IconPicker.tsx` (controlado, **sin persistir** todavía) montado en `vaults/VaultForm.tsx` con estado local; chip en `vaults/VaultListPage.tsx` (cubre RF-011) [zona: frontend]
  - CHECK: `cd frontend && npx vitest run src/vaults && npm run typecheck`
  - EXPECT: todos `passed`.
- [x] T-031 — Suite completa del frontend tras la maquetación: sólo cambiaron los tests explícitos de RF-007 (cubre RF-007) [zona: sistema]
  - CHECK: `cd frontend && npx vitest run && npm run typecheck && git diff --stat <commit de T-002> -- 'src/**/*.test.ts*' && npm run test:perf`
  - EXPECT: 0 failed; en el diff de tests de 0008 sólo `VaultRail.test.tsx` (pruebas añadidas + nombre con ícono) y `layoutCss.test.ts` (U-7 sustituido); `test:perf` p95 < 300 ms.

### D · Revisión visual temprana (antes de cualquier tarea de backend)
- [x] T-032 — **Revisión visual temprana** con datos simulados: `test:visual` de V-1…V-6, V-8…V-10 en oscuro y claro a 1440, 1024 y 390; lectura de cada captura junto a `/tmp/s9/ref/mockup-{tema}-{ancho}.png`; tabla R-1…R-15 (medida obtenida vs. objetivo §5.4) pegada en `history.md`; todo desvío se corrige aquí con una tarea nueva antes de seguir (cubre RF-001…RF-006, RF-006a, RF-008…RF-010) [zona: sistema]
  - CHECK: `cd frontend && npm run test:visual -- --grep "V-(1|2|3|4|5|6|8|9|10)\\b" && ls /tmp/s9/e2e/*.png | wc -l && cat /tmp/s9/e2e/measurements.json`
  - EXPECT: todas `passed` (V-7 queda fuera: depende del backend); ≥ 30 capturas (5 escenarios × 2 temas × 2 anchos + tooltip, desbordamiento, tema y 390 en ambos temas); cada R-n dentro de tolerancia en `measurements.json`.

### E · Backend `Vault.icon`
- [x] T-033 — Test (rojo): casos `icon` en `backend/tests/fixtures/vault_rules_cases.json` (válidos `folder`, `folder-heart`, `book-open:success`, `initials:warning`, 64 caracteres, `null`; inválidos vacío, 65, `Folder`, ` folder`, `a::b`, `a:`, `:a`, `-a`, `a-`, `a_b`, `<svg>`, `javascript:x`, `carpeta-ñ`, `1`, `[]`) y en `test_vault_schemas.py` (`VaultCreate`/`VaultUpdate`/`VaultOut` con `icon`; los `examples` de `contracts/vault-icon.schema.json` válidos) (cubre RF-012) [zona: test] [P-1]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_vault_schemas.py tests/test_sync_rules_mirror.py`
  - EXPECT: fallan los casos `icon`: `KeyError: 'icon'` en `_FIELD_RULES` y `extra_forbidden` en `VaultCreate`.
- [x] T-034 — `VaultIcon` en `core/schemas.py` y campos `icon` en `VaultCreate`/`VaultUpdate`/`VaultOut` (cubre RF-012) [zona: núcleo]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_vault_schemas.py`
  - EXPECT: `passed`, 0 failed (`test_sync_rules_mirror.py` sigue rojo hasta T-038).
- [x] T-035 — Test (rojo) `test_vault_service.py`: `create` con y sin `icon`; `update` con `icon` ausente (conserva), valor (cambia), `null` (borra); documento sin clave `icon` → `VaultOut.icon is None` (cubre RF-012) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_vault_service.py`
  - EXPECT: fallan las pruebas nuevas (`KeyError: 'icon'` / `icon` no persistido).
- [x] T-036 — `services/vault_service.py`: `create` escribe `icon`; `_to_out` con `doc.get("icon")` (cubre RF-012) [zona: servicio]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_vault_service.py tests/test_vault_repository.py`
  - EXPECT: `passed`, 0 failed.
- [x] T-037 — Test (rojo) `test_sync_push.py` (CouchDB real): revisión de bóveda con `icon` válido aceptada; sin clave aceptada; `icon` inválido → `validation-error:icon`; nota con clave `icon` → rechazo `validation-error:icon` de clave no admitida (cubre RF-012) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_sync_push.py -k icon`
  - EXPECT: falla la aceptación con `icon` válido (`validation-error:icon` por clave no admitida).
- [x] T-038 — `services/sync_push.py`: `_VAULT_KEYS` + `icon`, `_VAULT_REQUIRED` sin `icon`, `_FIELD_RULES["icon"]`, comprobación sólo si la clave está (cubre RF-012) [zona: servicio]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_sync_push.py tests/test_sync_rules_mirror.py tests/test_note_sync_push.py`
  - EXPECT: `passed`, 0 failed (batería de 0005/0008 sin tocar).
- [x] T-039 — Test (rojo) `test_vaults_api.py` (CouchDB real): `POST`/`PATCH`/`GET`/listado con `icon`; `PATCH {"icon": null}` borra; `icon` inválido → 422 RFC 9457 con `pointer` `/icon` y mensaje del catálogo, sin eco del valor (cubre RF-012) [zona: test]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_vaults_api.py -k icon`
  - EXPECT: con T-034/T-036 ya hechos, falla sólo si la ruta no publica `icon`; si pasa en verde a la primera, se anota (la ruta no necesita código) y se comprueba el rojo con un mutante (quitar `icon` de `VaultOut`).
- [x] T-040 — Re-exportar `0003-vault-crud/contracts/openapi.yaml` con `backend/scripts/export_openapi.py` (cubre RF-012) [zona: contrato]
  - CHECK: `cd backend && python3 scripts/export_openapi.py && python3 -m pytest -q tests/test_contract.py && git diff --stat -- ../.harness/specs/0005-sync/contracts/`
  - EXPECT: `test_contract.py` `passed`; el diff sólo toca el contrato de 0003 (ninguna línea en 0005); Spectral del gate sin errores.
- [x] T-041 — Suite completa del backend, **sola** contra CouchDB (cubre RF-012) [zona: sistema]
  - CHECK: `cd backend && python3 -m pytest -q`
  - EXPECT: 0 failed; nº de tests = línea base de T-002 + los nuevos; cobertura ≥ 80 % en los módulos tocados.

### F · Cableado del cliente
- [x] T-042 — Test (rojo) `sync/vaultRules.test.ts`: la batería común con los casos `icon` pasa por `checkIcon`; `validateVault` acepta y rechaza `icon` (cubre RF-012) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/sync/vaultRules.test.ts`
  - EXPECT: fallan los casos `icon` (`checkIcon` no existe).
- [x] T-043 — `sync/vaultRules.ts`: `VaultField` + `"icon"`, `VaultFields.icon`, `checkIcon`, `ICON_MAX`; `vaults/fields.ts` y `sync/RejectionsPage.tsx` con el mensaje de `validation-error:icon` (cubre RF-012) [zona: frontend]
  - CHECK: `cd frontend && npx vitest run src/sync/vaultRules.test.ts src/sync/RejectionsPage.test.tsx src/vaults && npm run typecheck`
  - EXPECT: todos `passed`.
- [x] T-044 — Test (rojo) `sync/vaultStore.test.ts`: `create` con/sin `icon` (por omisión `null`); `update` valida y fusiona `icon`; documento sin clave → `icon: null` (cubre RF-012) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/sync/vaultStore.test.ts`
  - EXPECT: fallan las pruebas nuevas.
- [x] T-045 — `sync/vaultStore.ts`: `icon` en `VaultDoc`/`Vault`/`toVault`, `FIELD_ORDER`/`FIELD_RULES` (cubre RF-012) [zona: frontend]
  - CHECK: `cd frontend && npx vitest run src/sync/vaultStore.test.ts && npm run typecheck`
  - EXPECT: todos `passed`.
- [x] T-046 — Test (rojo) `sync/merge.test.ts` (+ `conflicts.test.ts`): `icon` cambiado en un lado se fusiona; iguales no cuentan; choque → gana W sin `manual`; `sameExceptUpdatedAt` compara `icon`; documento sin clave = `null` (cubre RF-012) [zona: test] [P-6]
  - CHECK: `cd frontend && npx vitest run src/sync/merge.test.ts src/sync/conflicts.test.ts`
  - EXPECT: fallan las pruebas nuevas (`icon` se pierde en la fusión).
- [x] T-047 — `sync/merge.ts`, `sync/conflicts.ts`, `sync/ConflictView.tsx` (la resolución manual conserva el `icon` de la ganadora) (cubre RF-012) [zona: frontend] [P-6]
  - CHECK: `cd frontend && npx vitest run src/sync && npm run typecheck`
  - EXPECT: todos `passed`.
- [x] T-048 — Test (rojo) `vaults/VaultForm.test.tsx` y `notes/VaultRail.test.tsx`: guardar desde el selector persiste `icon` (sólo si cambió) en la réplica y el riel muestra el chip nuevo sin recargar (`dataVersion`) (cubre RF-011, RF-012) [zona: test]
  - CHECK: `cd frontend && npx vitest run src/vaults/VaultForm.test.tsx src/notes/VaultRail.test.tsx`
  - EXPECT: fallan las pruebas nuevas (el selector aún no persiste).
- [x] T-049 — `vaults/VaultForm.tsx`: `icon` en `changes` y en `create`/`update` (cubre RF-011, RF-012) [zona: frontend]
  - CHECK: `cd frontend && npx vitest run src/vaults src/notes && npm run typecheck`
  - EXPECT: todos `passed`.
- [x] T-050 — Test (rojo → verde) `sync/vaultIcon.integration.test.ts` (`test:sync`, backend y CouchDB reales): `icon` escrito en una réplica llega a la otra y el push lo acepta; uno inválido forzado en la réplica aparece rechazado en `/rejections` con `validation-error:icon` (cubre RF-012) [zona: test]
  - CHECK: `cd frontend && npm run test:sync`
  - EXPECT: 25 + 2 pruebas `passed`, 0 failed (antes de T-038 se comprueba el rojo con la rama de T-033).
- [x] T-051 — V-7 en navegador real con persistencia (cubre RF-011, RF-012) [zona: sistema]
  - CHECK: `cd frontend && npm run test:visual -- --grep "V-7"`
  - EXPECT: `passed`; capturas `picker-dark.png`, `picker-light.png`; el chip del riel cambia sin navegación de documento.

### G · RNF-001 en Chromium real
- [x] T-052 — Test `frontend/e2e/workspace-perf.spec.ts`: 1 000 notas sembradas, 30 navegaciones SPA a `/vaults/{id}`, tiempo hasta el árbol en el DOM (`MutationObserver` + `performance.now()`), falla si p95 > 150 ms; imprime mediana y p95. Rojo comprobado con un mutante (umbral 1 ms) (cubre RNF-001) [zona: test] [P-8]
  - CHECK: `cd frontend && npm run test:visual -- --grep "RNF-001"`
  - EXPECT: `passed`; salida `RNF-001 (0009): mediana … p95 ≤ 150 ms`; con el mutante, `failed`.
- [x] T-053 — Regresión en jsdom sin cambios (cubre RNF-001) [zona: sistema]
  - CHECK: `cd frontend && npm run test:perf`
  - EXPECT: `RNF-001 (0008): p95 … ms` < 300 ms.

### H · Documentación (PLAN-0009 §8) y verificación completa
- [x] T-054 — `contracts/vault-icon.schema.json`: confirmar que coincide con `VaultIcon` (patrón y `maxLength`) con un test en `test_vault_schemas.py` [doc]
  - CHECK: `cd backend && python3 -m pytest -q tests/test_vault_schemas.py -k contract`
  - EXPECT: `passed`.
- [x] T-055 — `0003-vault-crud/contracts/openapi.yaml`: re-export final tras cualquier cambio posterior a T-040 [doc]
  - CHECK: `cd backend && python3 scripts/export_openapi.py && git diff --exit-code -- ../.harness/specs/0003-vault-crud/contracts/ && python3 -m pytest -q tests/test_contract.py`
  - EXPECT: sin diff; `passed`.
- [x] T-056 — `backend/README.md` §Bóvedas (`icon`: gramática, `null`, `PATCH` con `null`, sin catálogo en el servidor) y §Sincronización (clave opcional `icon`, `validation-error:icon`) [doc]
  - CHECK: `grep -n "icon" backend/README.md`
  - EXPECT: ≥ 2 apariciones, en §Bóvedas y en §Sincronización.
- [x] T-057 — `backend/app/core/README.md`: `VaultIcon` en `schemas.py` [doc]
  - CHECK: `grep -n "VaultIcon" backend/app/core/README.md`
  - EXPECT: ≥ 1 línea.
- [x] T-058 — `backend/app/services/README.md`: `sync_push` con claves admitidas vs. obligatorias de bóveda [doc]
  - CHECK: `grep -n "icon" backend/app/services/README.md`
  - EXPECT: ≥ 1 línea en la sección de `sync_push`.
- [x] T-059 — `backend/tests/README.md`: casos `icon` en `vault_rules_cases.json` [doc]
  - CHECK: `grep -n "icon" backend/tests/README.md`
  - EXPECT: ≥ 1 línea.
- [x] T-060 — `frontend/README.md`: `npm run test:visual` (contenedor Playwright 1.56.0, backend en `:8010`, capturas en `/tmp/s9/e2e`) y RNF-001 en navegador [doc]
  - CHECK: `grep -n "test:visual" frontend/README.md`
  - EXPECT: ≥ 1 línea.
- [x] T-061 — `frontend/src/README.md`: `vaults/vaultIcon.ts`, `VaultChip`, `IconPicker`, tooltip del riel, marco de altura fija con scroll por columna, tema oscuro por defecto, `e2e/` [doc]
  - CHECK: `grep -nE "VaultChip|IconPicker|tema oscuro|e2e/" frontend/src/README.md`
  - EXPECT: las 4 apariciones.
- [x] T-062 — `0008-vault-editor/diagrams/` y `ARCHIFY.md`: verificar que no cambian (diagrama de datos, sin flujo nuevo) y dejar constancia en `history.md` [doc]
  - CHECK: `git diff --stat -- .harness/specs/0008-vault-editor/diagrams/ ARCHIFY.md`
  - EXPECT: sin cambios; línea de verificación en `history.md`.
- [ ] T-063 — Notas de re-anclaje de cierre en `0002`, `0003`, `0005`, `0007`, `0008` `spec.md` (sin cambio de requisitos) [doc] [P-10]
  - CHECK: `bash .harness/gate/check.sh | grep -E "000[2-8]"`
  - EXPECT: ninguna línea con "DRIFT".
- [ ] T-064 — `.harness/memory/state.md`: estado de 0009 [doc]
  - CHECK: `grep -n "0009" .harness/memory/state.md`
  - EXPECT: fila de 0009 con estado y evidencia.
- [ ] T-065 — Verificación completa en navegador: `test:visual` (V-1…V-10 + RNF-001) en ambos temas y anchos; lectura de cada captura junto al mockup; tabla R-1…R-15 final y salida pegadas en `history.md` (Gate 4: capturas reales contra la referencia) (cubre RF-001…RF-012, RF-006a, RNF-001) [zona: sistema]
  - CHECK: `cd frontend && npm run test:visual && cat /tmp/s9/e2e/measurements.json`
  - EXPECT: todas `passed`, 0 failed; cada R-n dentro de tolerancia.
- [ ] T-066 — Suites completas finales (backend **solo**, luego frontend) y gate (cubre RF-007, RF-012, RNF-001) [zona: sistema]
  - CHECK: `(cd backend && python3 -m pytest -q) && (cd frontend && npx vitest run && npm run typecheck && npm run build && npm run test:sync && npm run test:perf) && bash .harness/gate/check.sh`
  - EXPECT: 0 failed en todas; build exit 0; gate "Compuerta abierta" sin errores.

### I · Enmienda 1 (PLAN-0009 §10) — A1-1…A1-5
- [x] T-067 — A1-1/A1-2: tests (rojo, commit propio) tamaño/alto de Renombrar/Borrar igual al de los controles de la barra lateral (V-3) y thumb activo visible en claro/oscuro; estilos base de `button` en `:where(...)`; capturas de no regresión (login, lista de bóvedas, papelera, diálogos) (cubre RF-003, RF-006, RF-007) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run && npm run test:visual -- --grep-invert "V-7"` + capturas antes/después leídas
  - EXPECT: rojo → `passed`; sin cambios no deseados en las pantallas de no regresión.
- [x] T-068 — A1-4/A1-5: "Editar" sin hueco a la derecha en lectura (medida en V-4) y color derivado sin `danger` (cubre RF-005, RF-001) [zona: pantalla]
  - CHECK: `cd frontend && npx vitest run src/notes src/editor && npm run test:visual -- --grep-invert "V-7"`
  - EXPECT: rojo → `passed`.
- [x] T-069 — A1-3: R-1…R-15 completos en `measurements.json` y tabla en `history.md`; cierre de T-032 (cubre RF-001…RF-006a, RF-008…RF-010) [zona: sistema]
  - CHECK: `python3 -c "import json;m=json.load(open('/tmp/s9/e2e/measurements.json'));print(sorted(k for k in m if k.startswith('R-')))"`
  - EXPECT: R-1…R-15 presentes y dentro de tolerancia.

## Cobertura (el gate exige 100 %; `Estado` lo rellena el gate)
| RF / doc | Tareas | Test(s) | Estado |
|---|---|---|---|
| RF-001 | T-007, T-014, T-015, T-016, T-017, T-018, T-019, T-032, T-065, T-068 | vaultIcon.test, VaultChip.test, VaultRail.test, e2e V-1 | Pendiente |
| RF-002 | T-007, T-018, T-019, T-032, T-065 | VaultRail.test (tooltip), e2e V-2 | Pendiente |
| RF-003 | T-008, T-022, T-023, T-024, T-025, T-026, T-032, T-065, T-067 | VaultWorkspacePage.test, NoteSidebar.test, e2e V-3 | Pendiente |
| RF-004 | T-008, T-024, T-025, T-026, T-032, T-065 | NoteSidebar.test (data-icon), e2e V-3 | Pendiente |
| RF-005 | T-009, T-027, T-028, T-032, T-065, T-068 | NoteEditor.test, layoutCss.test, e2e V-4 | Pendiente |
| RF-006 | T-005, T-006, T-010, T-014, T-017, T-020, T-032, T-065, T-067 | layoutCss.test (sin literales), vaultIcon.test (contraste), e2e V-9 | Pendiente |
| RF-006a | T-010, T-012, T-013, T-032, T-065 | useTheme.test, e2e V-8 | Pendiente |
| RF-007 | T-001, T-018, T-020, T-027, T-031, T-066, T-067 | suite de 0008 sin cambios no explícitos, VaultRail.test (nombre accesible), NoteEditor.test | Pendiente |
| RF-008 | T-009, T-022, T-023, T-028, T-032, T-065 | VaultWorkspacePage.test (vacío), e2e V-5 | Pendiente |
| RF-009 | T-010, T-020, T-021, T-032, T-065 | layoutCss.test (marco fijo), e2e V-6 | Pendiente |
| RF-010 | T-008, T-024, T-026, T-032, T-065 | NoteSidebar.test (title), e2e V-3 (fila larga) | Pendiente |
| RF-011 | T-011, T-029, T-030, T-048, T-049, T-051, T-065 | IconPicker.test, VaultListPage.test, VaultForm.test, e2e V-7 | Pendiente |
| RF-012 | T-002, T-011, T-033…T-051, T-065, T-066 | test_vault_schemas, test_sync_rules_mirror, test_vault_service, test_sync_push, test_vaults_api, test_contract, vaultRules.test, vaultStore.test, merge.test, VaultForm.test, VaultRail.test, vaultIcon.integration.test, e2e V-7 | Pendiente |
| RNF-001 | T-000, T-052, T-053, T-065, T-066 | e2e workspace-perf (p95 ≤ 150 ms), tree.perf.test (< 300 ms) | Pendiente |
| doc: contracts/vault-icon.schema.json | T-054 | test_vault_schemas (contract) | Pendiente |
| doc: 0003 openapi.yaml | T-040, T-055 | test_contract | Pendiente |
| doc: backend/README.md | T-056 | — | Pendiente |
| doc: backend/app/core/README.md | T-057 | — | Pendiente |
| doc: backend/app/services/README.md | T-058 | — | Pendiente |
| doc: backend/tests/README.md | T-059 | — | Pendiente |
| doc: frontend/README.md | T-060 | — | Pendiente |
| doc: frontend/src/README.md | T-061 | — | Pendiente |
| doc: 0008 diagrams / ARCHIFY.md (sin cambio) | T-062 | — | Pendiente |
| doc: re-anclajes 0002/0003/0005/0007/0008 | T-003, T-004, T-063 | gate (sin DRIFT) | Pendiente |
| doc: state.md | T-064 | — | Pendiente |

> Esta tabla **es** la trazabilidad de la feature (no hay `traceability-matrix.md`).
> Fila sin test, en `Fail` o `Pendiente` → el gate no abre.
