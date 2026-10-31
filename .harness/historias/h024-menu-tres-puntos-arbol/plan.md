---
historia: H-024
estado: confirmado # diseño de AIRA (2026-10-30)
---

# Plan H-024 — Menú ⋮ por fila, renombrar/borrar con confirmación

Base: rama principal tras H-022/H-023 (el ⋮ debe convivir con el scroll horizontal). Worktree nuevo
`h024-menu-arbol`. jsdom no calcula layout: la fijación del ⋮ (C-10) se prueba como contrato de CSS y la
verifico después en Chromium real.

## Decisiones de diseño

- **Store (`noteStore.ts`):** el cuerpo de `moveFolder` pasa a un privado `relocateFolder(vaultId, from, destPath)`
  (mapeo prefijo→destino, chequeo «sin mover nada» y escritura). `moveFolder` = `relocateFolder(from, joinPath(to, nombre))`;
  `renameFolder(vaultId, from, newName)` = `relocateFolder(from, joinPath(parentFolder(from), newName))`.
  `softDeleteFolder(vaultId, path)` envía a la papelera todas las notas activas bajo `path/` (incluye subcarpetas) y
  devuelve cuántas; si una escritura falla a medias, lo ya borrado queda recuperable desde la papelera y se propaga el error.
  `countFolderNotes` lo calcula la UI desde `items` (ya cargados), sin tocar el store.
- **Confirmación (`ConfirmDelete.tsx`):** envoltorio sobre el `ConfirmDialog` existente (`editor/ConfirmDialog.tsx`,
  `alertdialog`, foco atrapado, Esc = cancelar, vuelve el foco al disparador): título «¿Borrar «X»?» y texto
  «Irá a la papelera.» (nota) o «Se llevarán a la papelera N notas.» (carpeta); botones Cancelar (`data-autofocus`) y Borrar.
  `NoteSidebar.remove(note)` pide la confirmación ANTES de `confirmDelete` (borrador) y de escribir; así cubre menú, Supr y el
  ⋮ del editor (`handle.remove`) con un solo punto de control. Estado `pendingDelete: {kind:"note"|"folder", ...} | null`.
- **Menú (`TreeRowMenu.tsx`):** copia el patrón de `editor/NoteMenu.tsx` (portal, foco itinerante, ↑/↓/Inicio/Fin, Esc, clic
  fuera, `aria-haspopup="menu"`), con dos ítems: Renombrar (Pencil) y Borrar (Trash2, peligro). Props: `label`, `onRename`,
  `onDelete`. El botón ⋮ es hermano del botón de la fila dentro del `li` (nunca anidado en un `<button>`), con
  `position: sticky; right: 0` dentro del `li` flex para quedar fijo al borde derecho al desplazar (C-10) y con
  `onClick` que no propaga ni abre la fila.
- **Visibilidad del ⋮:** `opacity: 0` por defecto, `1` con `li:hover`, `li:focus-within` y menú abierto; en
  `@media (hover: none)` o `(pointer: coarse)` siempre `1`, área ≥ 28 px.
- **Renombrado en línea:** estado `inlineRename: {kind, key, path, value} | null`; la fila en edición muestra un `<input>`
  en lugar del `<span class="note-tree-name">`, Enter confirma, Esc cancela, blur cancela. Nota → `notes.rename(id, joinPath(parentFolder(path), value→titleToPath), rev)`;
  carpeta → `notes.renameFolder`. `/` en `value` → aviso inválido. Duplicado de carpeta → `folderNameMessage("duplicate")` con
  `folderExists` (C-6). Errores con el `setError`/`run` existentes. Se retiran `.note-actions`, el formulario `.note-tree-rename`,
  `selected`/`selectedName` si quedan sin uso, y su CSS; `startRename(id)` del `handle` pasa a activar el renombrado en línea.
- **F2 y Supr** siguen: F2 → renombrado en línea de la fila enfocada (nota o carpeta); Supr → confirmación (nota o carpeta).

## Pasos TDD (un commit por paso, citando H-024)

1. **Store: `renameFolder` y `softDeleteFolder`** (C-5, C-6, C-8). Tests en `noteStore.test.ts`: renombrar conserva
   subestructura, rechaza con `NotePathTakenError` sin mover nada si el destino choca, ignora notas en papelera;
   `softDeleteFolder` borra todo bajo el prefijo incluidas subcarpetas, no toca carpetas hermanas con prefijo parecido
   (`A` vs `AB`) y devuelve el conteo; `moveFolder` sigue verde (refactor sin cambio de comportamiento).
2. **`ConfirmDelete`** (C-7, C-8b): foco inicial en Cancelar, Esc cancela, Borrar confirma, textos de nota y de carpeta con N.
3. **`TreeRowMenu`** (C-1, C-2, C-3): ⋮ accesible «Acciones de X», abre menú con 2 ítems, teclado, Esc/clic fuera cierran y
   devuelven el foco, activar un ítem llama a su prop y cierra.
4. **Integración del menú y borrado con confirmación** (C-2, C-7, C-8, C-8b): ⋮ en filas de nota y carpeta (no «Raíz»),
   el clic no abre ni selecciona la fila; Borrar abre `ConfirmDelete`; cancelar no borra; confirmar nota/carpeta borra y refresca
   (foco a la fila vecina como hoy); Supr y `handle.remove` también confirman; carpeta con la nota abierta dentro cierra el
   editor (`onDeleted`) y respeta `confirmDelete` de borrador. Actualizar los tests viejos de borrado para pasar por el diálogo.
5. **Renombrado en línea** (C-4, C-5, C-6, C-9): input en la fila, Enter/Esc/blur, nota y carpeta, `/` inválido, duplicado
   avisa y no mueve, carpeta renombrada queda desplegada y activa; F2; retirar panel `.note-actions` y formulario antiguo
   (sus tests se reemplazan, no se debilitan).
6. **CSS y no regresión** (C-10, C-11): contrato de CSS (⋮ `sticky`/`right: 0`, visible con hover/focus-within, siempre visible
   en `hover: none`, ≥ 28 px); suite de DnD (H-003), `tree.perf` y teclado del árbol verdes.
7. **Cierre:** `historia.md` → `implemented`; backlog a «Implementadas, pendientes de checkpoint»; Session-End en
   `memory/history.md`; `frontend/src/README.md` (nuevos archivos, Art. 11).

## Verificación

`npx vitest run` ×2 limpias, `npm run typecheck`, `npm run build`. Yo verifico después en Chromium real: ⋮ visible/oculto,
posición fija con scroll horizontal, menú dentro de la ventana, diálogo de confirmación, renombrar carpeta, borrar carpeta.
