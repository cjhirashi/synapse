# Backlog — SPEC-0010 (slice-development, conversión 2026-10-24)

Tareas restantes de tasks.md (T-050, T-051-T-139) agrupadas en slices
verticales demoables, siguiendo los clusters ya naturales del plan. Cada
slice se refina solo al tomarla. Driver (IA) implementa paso rojo→verde,
commit por paso; navigator (AIRA) vigila: loop, scope creep, trampa en
tests. Checkpoint a Carlos al cerrar cada slice, no al final del backlog.

- [ ] **Slice 1 — Caché de parseo precalculado (RNF-001, enmienda ya aprobada)**:
  T-050, T-124…T-139. Demoable: nota de 200 KiB abre ≤150ms con caché
  precalculada, medido con `content-perf.spec.ts`.
- [ ] **Slice 2 — Frontmatter editable**: T-051 (deps), T-052…T-062. Demoable:
  editar propiedades en Visual o Código, guardar, sobrevive sync.
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
