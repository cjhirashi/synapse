---
id: H-006
titulo: Iconos de notas/carpetas en la sidebar con el color de la bóveda (contorno, sin relleno)
estado: refinando # Gate 1 pasado ("así es", 2026-10-29). CORREGIDO 2026-10-29: Carlos pidió relleno primero, luego "no rellenes, usa Lucide como vienen" — revertido a solo-contorno. Falta re-implementar C-2.
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
color se use también en los iconos de contenido de la sidebar.

**Corrección del mismo día:** Carlos pidió primero que se vieran rellenos
(decisión registrada abajo); al verlo implementado pidió lo contrario —
"no rellenes los iconos, usalos como vienen en Lucid[e]". Queda **solo
contorno coloreado** (`stroke`/`color`, como ya pinta Lucide por defecto),
sin `fill`. No se cambia de librería de iconos.

## 2. Alcance / fuera de alcance

- Dentro: iconos de **nota** (`FileText`), **carpeta** (`Folder`/`FolderOpen`)
  y **"Raíz"** (`House`) en el árbol de `NoteSidebar.tsx` toman el color de
  la bóveda abierta (mismo color que ya muestra su `VaultChip`, mismo
  mecanismo: color elegido o `derivedColor(vault.id)`), de solo contorno
  (sin relleno — corrección 2026-10-29, ver §1).
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
- **C-2** (corregido 2026-10-29): Esos mismos iconos (`FileText`, `Folder`,
  `FolderOpen`, `House`) DEBEN verse de **solo contorno** — el color de la
  bóveda se aplica al `stroke`/`color` por defecto de Lucide, **sin** el
  prop `fill`. (Versión anterior pedía relleno; Carlos la revirtió al
  verla.) Sin añadir ni cambiar librería de iconos.
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
  fuera de alcance de esta historia.
- Rellenar los iconos con el prop `fill` de Lucide: era la decisión inicial
  de Carlos (2026-10-29), **revertida el mismo día** al verla implementada
  — pidió usar los iconos "como vienen en Lucid[e]" (solo contorno). Queda
  como C-2.

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
| C-1 | 1, 3 | `NoteSidebar.test.tsx`, `VaultWorkspacePage.test.tsx` | Pending |
| C-2 | 1 | `NoteSidebar.test.tsx` | Pending |
| C-3 | 2 | `NoteSidebar.test.tsx` | Pending |
| C-4 | 1 | reusa paleta ya validada, sin test nuevo de contraste (no hay valores nuevos) | N/A |
| C-5 | 3 | `VaultWorkspacePage.test.tsx` | Pending |

## 8. Checkpoint demostrable

Pendiente — Carlos debe abrir una bóveda y ver sus iconos de nota/carpeta
rellenos con el color de esa bóveda, y confirmar que cambiar de bóveda
cambia el color, antes de marcar `verified`.

## 9. Session-End (al cerrar)

- **Claim:** pendiente.
- **Evidencia:** pendiente.
- **Gaps:** ninguno todavía.
- **Riesgo residual:** ninguno todavía.
- **Próximo paso:** tomar la historia, ciclo driver/navigator §4.
