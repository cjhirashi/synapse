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
- [ ] **Slice 3 — Carpetas y rutas**: T-063…T-077. Demoable: crear/renombrar
  carpetas, migas de pan, nota con ruta inválida se repara.
- [ ] **Slice 4 — Pegado, tablas, checkboxes**: T-078…T-083. Demoable: pegar
  markdown/VS Code, insertar tabla, marcar checkbox.
- [ ] **Slice 5 — Resaltado de código + Mermaid**: T-084…T-095. Demoable:
  bloque de código coloreado, diagrama Mermaid renderizado con zoom/pan.
- [ ] **Slice 6 — Historial de navegación**: T-096…T-101. Demoable: Atrás/Adelante
  entre notas abiertas, migas clicables.
- [ ] **Slice 7 — Perf final + seguridad + UX**: T-102…T-107. Demoable: p95
  real medido, guard de XSS con test mutante, hallazgos de UX corregidos.
- [ ] **Slice 8 — Docs y cierre**: T-108…T-123. Demoable: spec `implemented`,
  gate verde, capturas aprobadas por Carlos.

Orden fijo por dependencia: Slice 1 ya tiene la enmienda del plan aprobada
(Opción 2, caché precalculado) — es el siguiente a tomar.
