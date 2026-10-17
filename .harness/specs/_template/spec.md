---
id: SPEC-NNN
tipo: spec
feature: NNN-slug
estado: draft            # draft | in-review | approved | implemented | verified | deprecated
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: ‹sha›     # último commit reconciliado (lo mueve el cierre)
anchor_mode: advisory    # advisory | strict  (pasa a strict en implemented/verified)
covers:                  # globs de archivos que ESTA feature posee: código, tests y doc
  - ‹src/…/**›
  - ‹tests/**/*‹area›*›
  - ‹docs/‹doc-que-esta-feature-vuelve-obsoleta›.md›
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: pendiente       # o { por: "Nombre", fecha: YYYY-MM-DD }  (tras Specify)
  fase_2: pendiente       #                                          (tras Plan)
actualizado: ‹YYYY-MM-DD›
---

# SPEC-NNN · ‹Nombre de la funcionalidad›

> Producida en Fase 1 por **elicitación interactiva** con el usuario (`method.md §3`):
> el agente pregunta, propone mejoras y buenas prácticas, ofrece alternativas; el
> usuario decide. Se itera hasta `[NEEDS CLARIFICATION] = 0` y el "así es". El agente
> **cuestiona y mejora, no transcribe.**

## 1. Contexto del dominio
- Problema de negocio en **una frase**.
- Límites del sistema y dependencias de infraestructura identificadas.

## 2. Alcance
### En alcance
- ‹flujos y requisitos que SÍ cubre›
### Fuera de alcance
- ‹lo que explícitamente NO hará — evita feature creep e improvisación del agente›

## 3. Modelo de datos y contratos de E/S  ← INVENTARIO DE FRONTERAS
| Frontera | Dirección | Tipo | Contrato en `contracts/` |
|---|---|---|---|
| ‹...› | entrada | REST | `openapi.yaml#/paths/…` |
| ‹...› | salida | MCP/tool | `mcp/tools.schema.json#…` |
- Esquemas JSON de petición/respuesta; tipos, nulabilidad, validaciones, nomenclatura.
- Sobre de error: **RFC 9457**.

## 4. Criterios de aceptación (EARS)
> Cada criterio: un `RF-NNN`, booleano y testeable. Patrones: ubicuo · `MIENTRAS` ·
> `CUANDO` · `DONDE` · `SI…ENTONCES` · complejo (`method.md §4`).

- **RF-001** — ‹El sistema DEBE …›
- **RF-002** — ‹CUANDO ‹evento› el sistema DEBE ‹respuesta››
- **RF-003** — ‹SI ‹fallo› ENTONCES el sistema DEBE ‹respuesta››

## 5. Casos límite y manejo de errores
- Fallos parciales, timeouts, límites de tamaño, reintentos, idempotencia — cada uno
  con su `RF-` (normalmente `SI…ENTONCES`).

## 6. Registro de decisiones y descartes
| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| ‹…› | ‹…› | ‹…› | ‹ADR-00X o —› |

## 7. Requisitos no funcionales (RNF)  *(opcional)*
- **RNF-001** — ‹rendimiento / seguridad / observabilidad, medible›

## Marcadores abiertos
- `[NEEDS CLARIFICATION: …]`   (deben quedar en 0 para pasar el Gate 1)
