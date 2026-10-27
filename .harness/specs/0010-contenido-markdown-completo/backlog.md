# Backlog — SPEC-0010 (slice-development, conversión 2026-10-24)

Tareas restantes de tasks.md (T-050, T-051-T-139) agrupadas en slices
verticales demoables, siguiendo los clusters ya naturales del plan. Cada
slice se refina solo al tomarla. Driver (IA) implementa paso rojo→verde,
commit por paso; navigator (AIRA) vigila: loop, scope creep, trampa en
tests. Checkpoint a Carlos al cerrar cada slice, no al final del backlog.

- [x] **Slice 1 — Caché de parseo precalculado (RNF-001, enmienda ya aprobada)**:
  T-050, T-124…T-139. Demoable: nota precalculada abre en p95 ≤ 150 ms (≤120 KiB)
  / ≤ 250 ms (~200 KiB extremo) con caché precalculada, medido en Chromium real
  con `content-perf.spec.ts`.
  **CERRADA (2026-10-25, AIRA).** T-137/T-138/T-139 corridas en Chromium real
  (Docker + CouchDB de test): el bloqueo headless anotado ya no aplicaba (settings
  autoriza `docker run --network host*` y `npx playwright*`). Causa raíz corregida
  en la corrida real: el Worker reventaba (`document is not defined`, build browser
  de `decode-named-character-reference`) → plugin de Vite scoped al Worker
  (08c4a5e). T-138(a) verde con tiering por tamaño (enmienda B-1b, SPEC §7):
  64 KiB 29 ms, 120 KiB 52 ms, 181 KiB 238 ms; todas `cache-hit`. T-139 sin
  degradación (0009 p95 33 ms; 40 grandes p95 30 ms; 0 tareas largas del
  programador). Commits f76f782, 08c4a5e, 2481dcc, 02e008b, 37b6eec. Session-End y
  cifras en `.harness/memory/history.md` (2026-10-25). **Checkpoint demostrable
  pendiente de Carlos** (ver él mismo las notas abriendo rápido / el p95 real).
- [x] **Slice 2 — Frontmatter editable**: T-051 (deps), T-052…T-062. Demoable:
  editar propiedades en Visual o Código, guardar, sobrevive sync.
  **CERRADA (2026-10-25, AIRA).** Sesión de edición D1 (props+body en Visual, texto
  compuesto en Código), validación YAML con aviso+línea, YAML heredado (migrate/
  looks-yaml con bloque protegido P-6). jsdom 1271/1271, typecheck, gate verde,
  integración `test:sync` notas 11/11, visual Chromium V-1/V-2/V-6 22/22. Commits
  efa1851, c1e8385, 7c44c4c, 80eeb90, a73b6f8, b419960, a0bf54a. Session-End en history.md.
- [x] **Slice 3 — Carpetas y rutas**: T-063…T-077. Demoable: crear/renombrar
  carpetas, migas de pan, nota con ruta inválida se repara.
  **CERRADA (2026-10-25, AIRA).** Bug `.md` (nombre de archivo vacío) corregido en
  servidor (`check_path`, `note.schema.json`) y cliente (`checkPath`), con batería
  común +6 casos y push real. `folders.ts`/`untitled.ts` por carpeta; `create` en
  carpeta activa + puerta RF-008 en `save`/`softDelete`; NoteSidebar con carpeta
  activa, «Nueva carpeta» real (validación + duplicada) y `NoteSidebarHandle`
  (startRename/remove/revealFolder); aviso RF-008 «Renombrar» en NoteEditor. Backend
  test_note_rules/contract/push verdes; frontend suite 1305/1305; gate verde; visual
  Chromium V-12 (crear/duplicar carpeta) verde. Commits e025fb9…95bb107. Session-End en history.md.
- [x] **Slice 4 — Pegado, tablas, checkboxes**: T-078…T-083. Demoable: pegar
  markdown/VS Code, insertar tabla, marcar checkbox.
  **EN CURSO (2026-10-25, AIRA): T-082/T-083 (casilla de tarea alternable, RF-039)
  cerradas y verdes** (taskItemView 9/9; commit befb1e8). **Faltan:** T-078/T-079
  (pegado markdown/VS Code con `@milkdown/plugin-clipboard` + handlePaste) y
  T-080/T-081 (insertar tabla / fila / columna por `registerCommands`). Son
  integración profunda de Milkdown; se dejaron sin empezar para no partirlas a medias
  al final de una sesión muy larga. El repo queda verde (no bloquea nada).
  **CERRADA (2026-10-26).** T-078…T-083. Pegado markdown en Visual (plugin-clipboard + ajuste VS Code P-8), insertar tabla + añadir fila/columna (cursor a la primera celda), casilla alternable. jsdom 1321/1321, typecheck, gate verde, Chromium V-4 14/14. Causas raíz: `preparsedMdastCtx` no consumido (rehidratación al pegar) y cursor fuera de la tabla tras insertar. Gap: enlace `javascript:` pegado pierde la marca (queda texto). Commits bed75eb…b528bc1.
- [x] **Slice 5 — Resaltado de código + Mermaid**: T-084…T-095 + Enmienda 2 (PLAN §11, T-140…T-149). Demoable:
  bloque de código coloreado, diagrama Mermaid renderizado con zoom/pan.
  **CERRADA (2026-10-27).** Resaltado Lezer por tandas en idle, Mermaid estricto (3 capas) dibujado por visibilidad + idle, zoom/pan con svg-pan-zoom diferido. jsdom 1443/1443, typecheck, gate, test:bundle OK (entrada 146 382 B, editor 345 523 B), content-visual 100/100, RNF-001 p95 (20 contextos): 64 KiB 34,8 · 120 KiB 44,0 · 181 KiB 235,7 ms; tarea larga máx 52 ms. Causas raíz: Mermaid medía mal con la regla global de reduced-motion; Mermaid+resaltado en el camino crítico (+80/+60 ms).
- [x] **Slice 6 — Historial de navegación**: T-096…T-101. Demoable: Atrás/Adelante
  entre notas abiertas, migas clicables.
  **CERRADA (2026-10-27).** `noteHistory` (ids, tope 50, sessionStorage por bóveda), Atrás/Adelante con salto de borradas, aviso de borrador (cancelar conserva nota/borrador/posición y devuelve el foco), Alt+←/→ fuera de editores, migas que revelan carpeta, menú ⋮ con flujos reales (renombrar, borrar con confirmación, copiar ruta con región viva, ver en Código). jsdom 1482/1482, typecheck, gate, bundle OK (entrada 147 156 B), Chromium V-10/V-11/V-12 29/29 + Alt+←/→ sin salir de la bóveda.
- [x] **Slice 7 — Perf final + seguridad + UX**: T-102…T-107. Demoable: p95
  real medido, guard de XSS con test mutante, hallazgos de UX corregidos.
  **CERRADA (2026-10-27), con una salvedad.** Perf (p95 64/120/181 KiB = 33,4/56,7/242,3 ms; 0009 26,6 ms), bundle (entrada 147 156 B) y V-15 verdes; `securityGuard` + mutante físico detectado; validación UX (8 consultas `ui-ux-pro-max`, árbol a11y, informe `/tmp/s10/ux/validacion-0010.md`): 0 Critical/High, 1 Medium (diagrama ancho, decisión de producto), 2 Low. **Salvedad:** T-106/T-107 las ejecutó el implementador por el plazo; el experto-ux-ui debe confirmarlas.
- [x] **Slice 8 — Docs y cierre**: T-108…T-123. Demoable: spec `implemented`,
  gate verde, capturas aprobadas por Carlos.
  **CERRADA (2026-10-27, AIRA).** T-108…T-110, T-112…T-122 hechas (vitest 1493/1493,
  typecheck, `test:sync` 29/29, `test:perf` 0008 p95 123,9 ms, build + `test:bundle` OK,
  Chromium completo 148 passed, pytest backend 1151 passed, gate abierta). **T-111
  aplicado a mano por AIRA** en el checkout principal (`diseño/1.1.4.1 - Sistema de
  Diseño.md`, sección "Extensión de contenido (SPEC-0010, ADR-006)" con los 6 tokens y
  la regla de `--accent`/`--text-muted`). **T-123: veredicto de AIRA — APROBADO.**
  Capturas de `/tmp/s10/e2e` contrastadas contra `/tmp/s10/ref/mockup-*` y
  `obsidian-breadcrumb.png` ya comparadas en detalle en `history.md` (cabecera 43px
  estilo Obsidian, bloques de código, Mermaid con tema, tablas/casillas/propiedades vía
  V-1…V-12): coinciden dentro de tolerancia. Único gap conocido (diagramas Mermaid
  anchos) ya resuelto vía RF-052 (aprobado por Carlos). M-A (225-258ms primera apertura
  en frío) aceptado por Carlos. Confirmación del experto-ux-ui de T-106/T-107 ya
  registrada (0 Critical/High). Pendiente no bloqueante: cobertura backend ≥80% no
  corrida con `--cov` en esta pasada — no impide el merge, queda para una pasada futura.

Orden fijo por dependencia: Slice 1 ya tiene la enmienda del plan aprobada
(Opción 2, caché precalculado) — es el siguiente a tomar.

## Riesgos conocidos (Converge 1, 2026-10-27)
- **L-4:** las imágenes `http(s)` externas de una nota se cargan (el navegador las pide al abrir la nota). Es el comportamiento
  heredado de 0008 (`safeUrl` permite `http`/`https` en imágenes); no hay CSP en el backend. Aceptado como riesgo conocido; una
  política (proxy de imágenes o `img-src`) queda para una feature de seguridad aparte.
- **UX-H1:** diagrama Mermaid muy ancho (escala ≈ 0,15 al ajustar): EN ESPERA de AIRA (enmienda de RF-052; propuesta A en `history.md`).
- **LOW-1 (backend, Converge 3):** un documento con frontmatter de 62 niveles o más hace 422 al lote ENTERO de `_bulk_docs`
  (el tope general de 64 niveles es del cuerpo, no del documento). El cliente oficial no puede producirlo (su tope es 32); un
  agente que escribiera por `/sync` un frontmatter así perdería el lote, no sólo el documento. Aceptado y documentado en el
  esquema y la spec; no se cambia.
- **Preexistente — ruido de `localStorage`** en `frontend/src/sync/vaultIcon.integration.test.ts`: no se toca.
- **M-A (clic en frío):** el clic en la primera nota ANTES de que termine la precarga del chunk del editor sigue en 225–258 ms a
  181 KiB; lo decide AIRA (no se toca).
- **`journey`:** el diagrama `journey` de Mermaid emite `foreignObject`/`switch` incluso en modo estricto y RF-051 los prohíbe:
  se muestra como error del bloque (comportamiento preexistente; todos los demás tipos probados dibujan, e2e V-7).
- **Medium latente:** `FORBIDDEN_CSS` (`renderMermaid.ts`) rechaza `url('#g')` / `url("#g")` DENTRO de `style` porque el regex
  retrocede sobre la comilla. Hoy ningún tipo de Mermaid emite esa forma (usan `url(#id)` sin comillas).
- **Low:** `attr(` no está en `FORBIDDEN_CSS`.
- **Low:** la forma `img` de Mermaid (nodos con imagen) pide la imagen externa ANTES de `verifySvg` (amplía L-4).
- **Low:** `link A "url"` de classDiagram rechaza el diagrama entero (la verificación no admite el `<a>`; no se ignora la sentencia).
- **Low:** un checkpoint `_local` con `NaN` responde 503.
- **Pendientes de AIRA:** UX-H1 / enmienda de RF-052 (diagrama muy ancho) y M-A (clic en frío antes de la precarga).
- **T-111 no aplicada:** el manual `diseño/1.1.4 - Diseño UI-UX/1.1.4.1 - Sistema de Diseño.md` está sólo en el checkout principal (sin
  versionar) y el sistema de permisos denegó escribir en él desde este worktree; el texto exacto (tabla de los 6 tokens y la
  regla de texto) está en `history.md`, entrada de 2026-10-27 «T-111». Aplicarlo a mano.
- **T-123 pendiente:** veredicto de AIRA sobre la comparación de capturas (RNF-005).

