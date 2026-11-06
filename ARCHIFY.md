# Diagramas de Synapse

**Última actualización**: 2026-11-05

Los diagramas del producto se generan con la skill **Archify** (arquitectura, flujos, secuencias, estados) y las gráficas estadísticas con **Plotly**; ambos salen como **HTML autocontenido**. El criterio de cuál usar está en `CLAUDE.md` («Diagramas: Archify + Diagram Design»).

## Dónde viven

- **Documentos de diseño y de cada historia**: en la bóveda **Proyectos** de Synapse. El HTML se sube con `file_upload` (`synapse_vault`) y se enlaza en la nota con `<iframe src="https://synapse.cjhirashi.com/files/<id>"></iframe>`; el servidor solo conserva un `iframe` con esa forma exacta (sin `?` ni `#`). El procedimiento completo está en la skill global `skill-bovedas-synapse` (§6) y en la skill `diagramas-y-graficas-html`.
- **Repositorio**: los diagramas históricos de las specs de SDD Anchored siguen en `.harness/specs/<feature>/diagrams/` (0003, 0005 y 0008). Los README de paquete usan Mermaid para sus esquemas. No se crea una carpeta `diagrams/` nueva para las historias: su diagrama va en la nota de la bóveda.

## Cómo generar uno

1. Elige el tipo (architecture, workflow, sequence, dataflow o lifecycle) y describe lo que muestra; con `meta.locale: "es"` y las traducciones de la skill.
2. Corre `finalize` hasta que los cuatro gates (`validate`, `deliver`, `check`, `browser-check`) den `pass`; no subas un diagrama con algún gate en `fail`.
3. Revisa la captura real en claro y oscuro antes de subirlo.
4. Súbelo a la bóveda y enlázalo desde la nota; registra el `id` del archivo en la historia.
