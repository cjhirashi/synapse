---
id: H-006
titulo: Iconos de notas/carpetas en la sidebar con el color de la bóveda, rellenos
estado: implemented # Gate 1 pasado (Carlos dijo "así es" + decisión de relleno, 2026-10-29). Implementado 2026-10-29; pendiente checkpoint demostrable de Carlos para 'verified'.
covers:
  - frontend/src/notes/NoteSidebar.tsx
  - frontend/src/notes/NoteSidebar.test.tsx
  - frontend/src/notes/VaultWorkspacePage.tsx
  - frontend/src/notes/VaultWorkspacePage.test.tsx
  - frontend/src/vaults/vaultIcon.ts
anchor_commit: 2636db7
origen: backlog
---

# H-006 — Iconos de notas/carpetas en la sidebar con el color de la bóveda

## 1. Intención (lenguaje de usuario)

Pedido directo de Carlos (2026-10-29, por capturas): hoy los iconos de
nota/carpeta en la sidebar izquierda (`NoteSidebar.tsx`) son neutros. Cada
bóveda ya tiene su propio color (`Vault.icon`, formato `glifo[:color]`,
`vaultIcon.ts` — es lo que pinta `VaultChip.tsx` hoy). Quiere que ese mismo
color se use también en los iconos de contenido de la sidebar, y que además
sean **rellenos** (Lucide es solo contorno; decisión de Carlos: rellenar los
mismos iconos con `fill`, sin cambiar de librería de iconos — ver §5).

## 2. Alcance / fuera de alcance

- Dentro: iconos de **nota** (`FileText`), **carpeta** (`Folder`/`FolderOpen`)
  y **"Raíz"** (`House`) en el árbol de `NoteSidebar.tsx` toman el color de
  la bóveda abierta (mismo color que ya muestra su `VaultChip`, mismo
  mecanismo: color elegido o `derivedColor(vault.id)`) y se pintan rellenos.
- Fuera: iconos de botones/acciones (➕ nueva nota `Plus`, nueva carpeta
  `FolderPlus`, papelera `Trash2`, flechas de expandir `ChevronDown`/
  `ChevronRight`, `CircleAlert` de error) — siguen neutros y de solo
  contorno, son controles, no contenido. No se toca `VaultChip.tsx` ni el
  selector de icono/color de la bóveda (`IconPicker.tsx`); no se cambia la
  librería de iconos del proyecto (decisión de Carlos, §5).

## 3. Criterios de aceptación (EARS booleano)

- **C-1:** CUANDO se abre una bóveda, el sistema DEBE pintar los iconos de
  nota (`FileText`), carpeta (`Folder`/`FolderOpen`) y "Raíz" (`House`) de
  `NoteSidebar.tsx` con el color de esa bóveda: el elegido en `Vault.icon`
  (`parseIcon(vault.icon).color`) o, si no hay uno elegido,
  `derivedColor(vault.id)` — exactamente la misma regla que ya usa
  `VaultChip.tsx` (reusar sus funciones de `vaultIcon.ts`, no reimplementar).
- **C-2:** Esos mismos iconos (`FileText`, `Folder`, `FolderOpen`, `House`)
  DEBEN verse rellenos (relleno = color de la bóveda, no solo contorno),
  usando el propio set de Lucide ya instalado (prop `fill`), sin añadir una
  librería de iconos nueva.
- **C-3:** Los iconos de botones/acciones y de disclosure (`Plus`,
  `FolderPlus`, `Trash2`, `ChevronDown`, `ChevronRight`, `CircleAlert`) NO
  DEBEN cambiar — siguen con su color/estilo actual (neutro, contorno).
- **C-4:** El color aplicado DEBE mantener el contraste exigido por P-2 de
  SPEC-0010 contra el fondo de la sidebar, en ambos temas (claro/oscuro) —
  reusa las claves de paleta ya validadas en `vaultIcon.ts`
  (`accent/info/success/warning/danger`), no valores nuevos.
- **C-5:** Cambiar de bóveda (abrir otra) DEBE actualizar el color de estos
  iconos al de la bóveda recién abierta, sin recargar la página.

`[NEEDS CLARIFICATION] = 0`.

## 4. Casos límite y errores

- Bóveda sin `icon` (null/ausente): color derivado de su id
  (`derivedColor`), igual que ya hace `VaultChip` hoy — no es un caso nuevo,
  es el mismo fallback ya probado.
- Bóveda con `icon` mal formado: `parseIcon` ya degrada a iniciales/color
  derivado sin lanzar (contrato existente) — nada nuevo que manejar aquí.

## 5. Descartes

- Cambiar a una librería de iconos con variante "solid" nativa (ej. Phosphor,
  Heroicons): descartado por Carlos — abriría la pregunta de si el resto del
  proyecto también debería migrar (identidad visual 1.1.4.1 manda Lucide),
  fuera de alcance de esta historia. Se usa el prop `fill` de los iconos
  Lucide ya existentes.

## 6. Plan (de ESTA historia solamente)

- No toca backend ni el modelo de datos de `Vault.icon` (ya existe, SPEC-0009).
- `VaultWorkspacePage.tsx` ya tiene el objeto `vault` completo (`vault.icon`,
  `vault.id`) y es quien renderiza `<NoteSidebar vaultId={vault.id} .../>`
  (línea ~281-283) — añadir una prop nueva a `NoteSidebar` (p. ej.
  `vaultColor: PaletteKey`, ya resuelta por el padre con
  `parseIcon(vault.icon).color ?? derivedColor(vault.id)`, mismo cálculo que
  hace `VaultChip`) en vez de que `NoteSidebar` vuelva a resolverlo.
- Aplicar el color: mismo patrón que `VaultChip.tsx` (`style={{"--chip-color":
  colorVar(color)} as CSSProperties}` + CSS que lee esa variable) — revisar
  `VaultChip.css` para el patrón exacto antes de escribir CSS nuevo en
  `notes.css`. Prop `fill="currentColor"` (o la variable) en los componentes
  Lucide `FileText`/`Folder`/`FolderOpen`/`House` de las filas de árbol,
  dejando `stroke` igual para no perder el contorno del icono.
- Estrategia de prueba: `NoteSidebar.test.tsx` — color correcto en iconos de
  nota/carpeta/raíz (elegido y derivado), botones/chevrons sin cambio,
  cambio de color al cambiar de bóveda (si el test monta con props distintas).
  `VaultWorkspacePage.test.tsx` si hace falta probar que la prop se calcula y
  pasa bien.
- Pasos TDD ordenados:
  1. `CHECK:` `NoteSidebar.test.tsx` rojo — icono de nota/carpeta/raíz toman
     el color pasado por prop, relleno / `EXPECT:` verde con la prop nueva y
     el `fill` aplicado.
  2. `CHECK:` `NoteSidebar.test.tsx` rojo — botones/chevrons NO cambian
     (C-3) / `EXPECT:` verde (ya debería pasar solo con el paso 1 bien
     acotado; test de regresión explícito).
  3. `CHECK:` `VaultWorkspacePage.test.tsx` rojo — la prop que le pasa a
     `NoteSidebar` es el color correcto (elegido o derivado) / `EXPECT:`
     verde con el cálculo en el padre.
  4. Build de frontend, regresión completa de frontend.
- Impacto en documentación (Art. 11): línea en `frontend/src/README.md`
  junto a la mención de `vaultIcon.ts`/`VaultChip`.

## 7. Tabla de cobertura

| Criterio | Paso(s) | Test | Estado |
|---|---|---|---|
| C-1 | 1, 3 | `NoteSidebar.test.tsx` «H-006 C-1, C-2…» + `VaultWorkspacePage.test.tsx` «H-006 C-1…» (elegido y derivado) | Cubierto ✓ |
| C-2 | 1 | `NoteSidebar.test.tsx` «H-006 C-1, C-2: … rellenos» (fill en nota/carpeta/raíz) | Cubierto ✓ |
| C-3 | 2 | `NoteSidebar.test.tsx` «H-006 C-3: los iconos de acción … NO cambian» | Cubierto ✓ |
| C-4 | 1 | reusa paleta ya validada, sin test nuevo de contraste (no hay valores nuevos) | N/A |
| C-5 | 3 | `VaultWorkspacePage.test.tsx` «H-006 C-5…» + `NoteSidebar.test.tsx` «H-006 C-5…» (rerender) | Cubierto ✓ |

Cobertura de la suite (`npm run test:cov`, 2026-10-29): 88 archivos, **1683 tests en verde**;
`NoteSidebar.tsx` 98,35 % líneas / 89,7 % ramas, `src/notes` 97,41 %, `vaultIcon.ts` 100 %,
total 97,61 %. `npm run build` (tsc + vite) en verde.

## 8. Checkpoint demostrable

Pendiente — Carlos debe abrir una bóveda y ver sus iconos de nota/carpeta
rellenos con el color de esa bóveda, y confirmar que cambiar de bóveda
cambia el color, antes de marcar `verified`.

## 9. Session-End (al cerrar)

- **Claim:** los iconos de contenido de la sidebar (nota `FileText`, carpeta
  `Folder`/`FolderOpen`, «Raíz» `House`) toman el color de la bóveda abierta y
  se pintan rellenos; los controles (`Plus`, `FolderPlus`, `Trash2`, chevrons,
  `CircleAlert`) siguen neutros de contorno. El color se resuelve en el padre
  (`VaultWorkspacePage`) con la misma regla que `VaultChip`
  (`parseIcon(vault.icon).color ?? derivedColor(vault.id)`) y viaja a
  `NoteSidebar` por la prop `vaultColor`; la sidebar lo publica en la variable
  CSS `--vault-icon-color` del `<aside>` y los iconos la leen para trazo y
  `fill` (C-1…C-5).
- **Evidencia:** 2 commits citando H-006 (`cecafc6` implementación + tests de
  NoteSidebar; `a086d82` tests de VaultWorkspacePage + doc). `npm run build`
  (tsc + vite) en verde. `npm run test:cov`: 88 archivos, 1683 tests en verde;
  `NoteSidebar.tsx` 98,35 % líneas, `src/notes` 97,41 %, total 97,61 %.
  Tests nuevos: `NoteSidebar.test.tsx` «H-006 C-1, C-2 / C-3 / C-5» y
  `VaultWorkspacePage.test.tsx` «H-006 C-1 (elegido) / C-1 (derivado) / C-5».
- **Gaps:** ninguno funcional. Nota de implementación: la wiring del padre
  (`VaultWorkspacePage`) viajó en el commit 1 (necesaria para que el build
  compile con la prop requerida) y su test adversarial llegó en el commit 2;
  el rojo→verde del comportamiento central ocurrió en el paso 1.
- **Riesgo residual:** un icono relleno con trazo del mismo color pierde el
  detalle interno del glifo (queda como silueta sólida); es el efecto buscado
  por la decisión de Carlos (§5, `fill` de Lucide sin librería nueva). Si
  visualmente no convence, es ajuste de CSS, no de contrato.
- **Próximo paso:** checkpoint demostrable — Carlos abre una bóveda, ve los
  iconos de nota/carpeta rellenos con su color y confirma que cambiar de
  bóveda cambia el color (§8), antes de pasar a `verified`. Merge/push lo hace
  Carlos.
