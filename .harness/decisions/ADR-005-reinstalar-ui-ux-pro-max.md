---
id: ADR-005
tipo: adr
estado: accepted          # autorizada por Carlos directo, 2026-10-23
fecha: 2026-10-23
---

# ADR-005 · Reinstalar la skill `ui-ux-pro-max`

## Contexto y planteamiento del problema

ADR-004 (2026-10-15) retiró `ui-ux-pro-max` de Synapse por decisión explícita de
Carlos, con el razonamiento de que el sistema de diseño ya documentado en
`diseño/1.1.4 - Diseño UI-UX/1.1.4.1 - Sistema de Diseño.md` bastaba, y dejó
registrado el costo esperado: *"se pierde la generación automática de sistemas de
diseño; el de `diseño/` es manual y puede quedar desactualizado si no se mantiene."*

SPEC-0008 (editor de notas) y SPEC-0009 (su rediseño visual) se implementaron y
Carlos probó el resultado en navegador real (capturas 2026-10-23): el acabado
quedó notablemente por debajo del mockup original de `1.1.4.4` — sin panel de
propiedades, tablas sin renderizar, bloques de código sin resaltado de sintaxis,
creación de notas/carpetas sin ninguna guía visual. Una parte de esos hallazgos son
huecos de completitud funcional (ajenos a un skill de diseño, ver AIRA →
`ds-scoring-credito`/feedback a Claude Code del mismo día), pero el juicio de
Carlos es que el nivel general de pulido visual también se quedó corto — exactamente
el costo que ADR-004 ya había anticipado.

## Decisión

Elegimos **reinstalar `ui-ux-pro-max`** en Synapse, autorizado por Carlos directo
(2026-10-23): `npx ui-ux-pro-max-cli@latest init --ai claude` en la raíz del repo
(mismo mecanismo que `design-html`), con entrada correspondiente en
`.claude/settings.json` y nota de uso en `.claude/agents/experto-ux-ui.md`.

El documento `diseño/1.1.4.1` sigue siendo la referencia de identidad visual ya
establecida (acento cian, iconografía Lucide, tokens ya implementados y verificados
hoy mismo en `frontend/src/styles/tokens.css`) — `ui-ux-pro-max` no lo reemplaza, lo
usa el `experto-ux-ui` como motor de generación/validación (paletas, tipografía,
WCAG, estados, responsive) dentro de esa identidad ya fijada.

## Opciones consideradas

- **Reinstalar `ui-ux-pro-max` (elegida)** — revierte el costo que ADR-004 ya
  anticipaba, ahora materializado; el `experto-ux-ui` pasa de solo criticar contra
  un checklist a tener un motor real de generación/validación.
- **Dejarlo fuera y reforzar solo al `experto-ux-ui`** — descartada: el agente ya
  existía en SPEC-0008/0009 y el resultado fue insuficiente; sin un motor de
  generación detrás, su checklist es necesario pero no suficiente.
- **Reemplazar `diseño/1.1.4.1` por lo que genere `ui-ux-pro-max` desde cero** —
  descartada explícitamente: `1.1.4.1` ya está implementado y verificado en el
  código real (tokens, toggle de tema, cjhirashi-career comparte la misma familia
  de estilo "Glass Steel"); regenerar desde cero perdería esa coherencia ya lograda.

## Consecuencias

- **Buenas:** el `experto-ux-ui` tiene un motor real de generación/validación
  (79 estilos, 192 paletas, 74 pares tipográficos, validación WCAG AA) en vez de
  solo un checklist manual; se recupera justo lo que ADR-004 sacrificó a cambio de
  `security-review`/`verify` (ambas se mantienen, esto no las retira).
- **Coste / malas:** paquete instalado trae skills fuera de alcance de Synapse
  (branding, banners, slides) porque vienen empaquetadas con el instalador, sin uso
  previsto aquí — documentado así en `.claude/settings.json`, no se borran a mano
  porque el instalador las regenera en cualquier `init` futuro.

## Enlaces

- Afecta a: `.claude/settings.json`, `.claude/agents/experto-ux-ui.md`,
  `.claude/skills/` (nuevo).
- Relacionado: ADR-004 (decisión que esta ADR revierte parcialmente — `security-review`
  y `verify` de ADR-004 se mantienen intactas).
- Origen: hallazgos de Carlos sobre SPEC-0008/0009 (2026-10-23), relayados a Claude
  Code el mismo día.
