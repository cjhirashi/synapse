# reference/ — arnés SDD Anchored listo para implantar

Esqueleto copiable del arnés **simplificado**. Diseño y justificación en
`../docs/model/` y `../docs/structure/`.

```
reference/
├── AGENTS.md            → copiar a la raíz del proyecto y rellenar
├── CLAUDE.md            → copiar a la raíz (incluye las reglas duras — no las quites)
├── .claude/
│   ├── settings.json    → copiar tal cual — hook Stop que corre gate/check.sh SIEMPRE.
│   │                       Sin esto el gate solo corre si el agente decide correrlo.
│   └── agents/          → binding de Claude Code
│       ├── orquestador.md · autor-de-spec.md · arquitecto.md      (base — copiar tal cual)
│       ├── implementador.md · revisor.md · explorador.md          (base — copiar tal cual)
│       ├── experto-ux-ui.md  → SOLO si el proyecto tiene frontend; rellena su nota de
│       │                        sistema de diseño y registra un ADR (ver ADR-003)
│       └── README.md    → (+ especialistas de dominio por proyecto, si aplica)
└── .harness/
    ├── constitution.md  → rellenar en la Génesis
    ├── method.md        → copiar TAL CUAL (agnóstico de proyecto)
    ├── gate/
    │   ├── check.sh     → copiar tal cual (chmod +x)
    │   └── services.txt → declarar los servicios (<ruta>:<python|node|mcp>)
    ├── memory/
    │   ├── state.md     → rellenar cabecera; sembrar correcciones si es brownfield
    │   └── history.md   → dejar; la 1ª entrada es la Génesis
    ├── decisions/
    │   └── ADR-000-template.md   → base para ADR-001 (adopción + perfil)
    └── specs/
        ├── README.md
        └── _template/{spec,plan,tasks}.md   → se copian a specs/NNN-slug/ por feature
```

## Implantación (resumen)

1. `cp -r reference/.harness reference/.claude <proyecto>/` ·
   `cp reference/{AGENTS,CLAUDE}.md <proyecto>/` (si ya hay `CLAUDE.md`/`AGENTS.md`, fusionar).
2. `chmod +x <proyecto>/.harness/gate/check.sh`.
3. **Génesis** (`method.md §1`):
   - *Greenfield:* recomendar arquitectura, el usuario decide → rellenar
     `constitution.md` Art. 2 + escribir `ADR-001`.
   - *Brownfield:* **detectar** la arquitectura del código y `docs/` → registrarla
     igual; sembrar `memory/state.md` con las lecciones/hazards conocidos.
4. Rellenar el resto de `constitution.md` (testing, seguridad, mapa de docs Art. 11,
   hazards) y `AGENTS.md`.
5. Declarar servicios en `gate/services.txt`.
6. `.harness/gate/check.sh` en verde.
7. Primera entrada Session-End en `memory/history.md`.

## Formato de Session-End (para monitoreo)

Cada cierre de sesión añade al principio de `memory/history.md` la entrada del
formato fijo de `method.md §10` (fase alcanzada, rebotes del verificador, Pausa,
drift, anclas movidas, estado del gate, docs, próximo paso). Ese formato es lo que
hace barato el monitoreo del rendimiento del arnés.
