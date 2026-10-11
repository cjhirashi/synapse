---
titulo: Constitución del arnés — ‹nombre del proyecto›
tipo: constitution
estado: draft
fecha: ‹YYYY-MM-DD›
metodo: SDD Anchored (versión simplificada)
---

# Constitución — ‹nombre del proyecto›

Principios innegociables que toda `spec.md` y todo `plan.md` heredan y respetan. Se
valida **antes** de redactar cada spec. Cambiar un artículo exige un `ADR-`.

Separación estricta: `.harness/` = **cómo trabajamos** · `docs/` = **el producto**.

---

## Artículo 1 · Arquitectura

El proyecto sigue el **patrón definido en la Génesis** (ver Artículo 2 y
`decisions/ADR-001-*`). Todo el desarrollo es **conforme a ese patrón**; el gate
verifica la conformidad. Cambiar de patrón exige un `ADR-` nuevo.

- ‹estilo de despliegue en una frase›
- ‹patrón interno: dónde vive la lógica de negocio, dirección de dependencias›
- Nada de dependencias nuevas de terceros sin justificación en un `plan.md`/`ADR-`.

## Artículo 2 · Perfil de arquitectura  *(definido en la Génesis)*

```yaml
estilo_aplicacion: monolito-modular
patron_interno:    por-capas        # routers → services → core/ports ← adapters
patron_interno_adr: ADR-001
servicios:
  backend:  { stack: "FastAPI + SQLAlchemy + Alembic", tipo: api }
  frontend: { stack: "React + TypeScript + Vite", tipo: web }
infraestructura: [ postgresql, couchdb ]
topologia_agentes: ninguna
sustratos_integracion:
  - rest-http
capas_transversales: [ auth ]
rutas:
  arnes: .harness/
  specs: .harness/specs/
  decisiones: .harness/decisions/
```

## Artículo 3 · Testing

- **TDD en la Fase 4** (test antes que código).
- Cobertura mínima **‹80›%** por módulo tocado (umbral que el verificador exige);
  objetivo **‹90›%** para código nuevo.
- Pruebas **por zona del patrón** (‹p. ej. hexagonal: dominio / aplicación / adaptador
  / sistema — o por-capas: modelo / servicio / ruta / flujo›).
- **Verificación real, no autoreporte:** el servicio **arranca**, el endpoint
  **responde**. Editar estado no es verificar. Evidencia = salida de terminal
  **pegada**, nunca "esperada".

## Artículo 4 · Persistencia

- ‹motor, quién gobierna las migraciones, particularidades de la dev DB›

## Artículo 5 · Seguridad

- Secretos fuera del repo. ‹esquema de auth›. ‹coste de llamadas externas → autorización explícita›.

## Artículo 6 · Contratos y errores

- APIs REST documentadas en OpenAPI 3.1; eventos en AsyncAPI 3.0; MCP con JSON Schema
  por *tool*. Errores de API con **Problem Details (RFC 9457)**.
- Versionado semántico; cambios destructivos bloqueados por el gate.
- ‹otros contratos: red/routing, etc.›

## Artículo 7 · Observabilidad

- ‹logging estructurado, correlación de trazas, métricas mínimas›

## Artículo 8 · Gates y aprobaciones

- **Value Captain:** ‹persona/rol›.  **Tech Lead:** ‹persona/rol›.  (Pueden coincidir.)
- 2 puntos de aprobación humana: tras **Specify** y tras **Plan**. La **IA no autoaprueba**.

## Artículo 9 · Convenciones

- Idioma: ‹código en inglés; specs/docs/interacción en español›.
- IDs: `RF-`/`RNF-`/`T-` (por feature) · `ADR-` (proyecto). Estables; número reservado
  al crear el archivo.
- Ramas y carpetas de feature: `NNN-slug` kebab-case, ≤ 5 palabras.
- Commits: **Conventional Commits** + sufijo `(RF-NNN)`.
- Anotación de tests con su `RF-`: ‹forma por lenguaje›.

## Artículo 10 · Regla de raíz (prohibido el parche)

- Toda corrección ataca la **causa raíz**, nunca el síntoma. Sin *workarounds*, sin
  código-tirita, sin `TODO`/`FIXME` sin ticket.
- Diferir la causa raíz es válido **sólo** como `RF-`/`RNF-`/`ADR-` explícito en el
  backlog, con justificación — nunca como código que se queda.
- El verificador rechaza la entrega cuya solución no explique y ataque la causa.

## Artículo 11 · Mapa de documentación del proyecto

| Documento | Ruta | Se actualiza cuando cambia… |
|---|---|---|
| ‹arc42 / architecture› | ‹docs/…› | estructura, componentes, decisiones |
| ‹ADRs de producto› | ‹docs/decisions/…› | una decisión arquitectónica del producto |
| ‹API reference› | ‹docs/API.md / openapi.yaml› | endpoints, payloads, errores |
| ‹README de servicio ‹x›› | ‹…/README.md› | comandos, setup, superficie pública |
| ‹deploy / env / puertos› | ‹docs/DEPLOYMENT.md / compose / caddy› | variables de entorno, puertos, infra |
| ‹Diagramas (Archify)› | ‹ARCHIFY.md + .harness/specs/{feature}/diagrams/› | arquitectura, flujos, secuencias |

> Las decisiones **del arnés** van en `.harness/decisions/`, no aquí.

## Artículo 12 · Anti-hipersistema

1. **3 archivos por feature** (`spec.md`, `plan.md`, `tasks.md`) + `contracts/` si
   aplica. Añadir un tipo de artefacto exige un `ADR-`.
2. El método vive en **`method.md`** (1 archivo). No crece sin podar.
3. **Un gate por frontera real.** Nada "por si acaso".
4. **Un canon por hecho.** Cero duplicación entre `AGENTS.md`, esta Constitución y `docs/`.
5. **Estado en disco, no en el chat.**
6. **Rúbrica primero.** Lo trivial no toca el arnés.

---

## Hazards conocidos del código

- ‹trampas heredadas del proyecto que cruzan sesiones — verificar si reaparecen›

## Historial de enmiendas

| Fecha | Artículo | Cambio | ADR |
|---|---|---|---|
| ‹YYYY-MM-DD› | — | Constitución inicial | ADR-001 |
