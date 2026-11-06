# AGENTS.md — Synapse

> **Punto de entrada** para cualquier agente que trabaje en este repo. Es un **mapa**,
> no una biblia: lee sólo lo que necesites, cuando lo necesites.
>
> **Cómo trabajamos:** este repo usa un arnés **Slice Development** (piloto desde
> 2026-10-25, reemplaza a SDD Anchored). El trabajo vive en **`.harness/backlog.md`**
> como historias chicas — NUNCA como spec grande planificada de punta a punta. Empieza
> por **`.harness/method.md §0`**. Los principios innegociables están en
> **`.harness/constitution.md`**.
>
> **Separación estricta:** `.harness/` = gobernanza · `docs/` = el producto.

## Antes de empezar (en orden)

1. Ejecuta **`.harness/gate/check.sh`**. Si cierra (exit 1 / ❌), **DETENTE** y reporta.
2. Lee **`.harness/memory/state.md`** (correcciones del usuario van arriba — se leen SIEMPRE).
3. Ojea **`.harness/backlog.md`** — historias `H-NNN` pendientes, sin refinar. Al tomar
   una, créala en `.harness/historias/NNN-slug/` (`historia.md` + `plan.md`) — método.md §3.
   `.harness/specs/` es el archivo histórico de SDD Anchored (pre-2026-10-25); no se crean
   `spec.md` nuevos ahí. **Desde 2026-11-02** el análisis (rondas pregunta/respuesta con Carlos), el plan, la
   autorización y el checklist de cada historia viven en su nota de la bóveda **Proyectos** de Synapse
   (`1 - Proyectos AIRA/5 - Proyectos/1  - AI Solutions/Synapse/9 - implentaciones/H-NNN - …`); `backlog.md` solo las indexa.

## Qué es Synapse

Almacén personal self-hosted de bóvedas de conocimiento: notas Markdown offline-first (estilo Obsidian) y archivos, sin IA interna; los agentes (OpenClaw) lo usan por API REST con una clave por agente. Stack: FastAPI + PostgreSQL (control plane) + CouchDB/PouchDB (bóvedas y notas) + MinIO (archivos) + React/Vite. En producción en `synapse.cjhirashi.com`. Cada bóveda trae carpetas de sistema (`AG - SKILLS`, `AG - MENSAJES`, `AG - AGENTES`, `BITACORA`, `PLANTILLAS`) con ÍNDICES y bitácora generados por el servidor, y una skill global (`backend/app/system_docs/`) que el servidor publica en todas las bóvedas.

**Arquitectura:** Hexagonal (services → `core/ports/`; adapters seleccionados por factory).
**Crítico:** Aislamiento por usuario. Base CouchDB `synapse_user_{id}`. **Nunca romper.**

## Servicios / módulos

| Módulo | Stack | Tests | Arranque |
|--------|-------|-------|----------|
| **Backend** | FastAPI + CouchDB | `pytest tests/ --cov=app` | `docker compose up -d` |
| **Frontend** | React | `npm run test:cov` | `docker compose up -d` |
| **Sync** | PouchDB + offline-first | Incluido en tests | Automático |

## Convenciones

- **Código:** inglés. **Specs/docs:** español.
- **Commits:** Conventional Commits + `(T-NNN)` o `(RF-NNN)`.
- **IDs:** `RF-`/`RNF-`/`T-` por feature; `ADR-` por proyecto.
- **Tests:** anotados con su `RF-` en comment.
- **Errores API:** RFC 9457 (Problem Details). Servicios y dependencias lanzan errores de dominio (`core/errors.py`), nunca `HTTPException`; sólo `core/problems.py` los traduce a HTTP (SPEC-0004).
- 🔴 **Docs en el mismo commit:** todo cambio de código actualiza los README/docs que deja obsoletos
  (mapa de documentación) o declara `Docs actualizadas: ninguna — <motivo>`. El gate lo exige.
- 🔴 **Skill global al día:** un cambio que altera lo que un agente ve o hace con `synapse_vault` actualiza
  `backend/app/system_docs/skill-bovedas-synapse.md` (versión + `--stamp`) en la misma entrega.

## 🔴 Regla Crítica — History Actualizado

**Al cierre de cada sesión, actualiza `.harness/memory/history.md`:**

Añade entrada Session-End con:
- **Fecha** (e.g., `[2026-10-11]`)
- **Fase alcanzada** (Specify/Plan/Tasks/Implement/Verify)
- **Rebotes del verificador** (0, N, o lista si hay)
- **Directiva de Pausa** (sí/no — si te bloqueas, describe)
- **Drift / re-anchor** (sí/no)
- **Gate status** (verde/rojo/warns)
- **Docs actualizadas** (lista qué cambiaron)
- **Decisiones de diseño** (qué se decidió por qué)
- **Próximo paso** (qué sigue cuando continúes)

**Por qué:** AIRA lo lee diariamente. Es la bitácora viva del harness (parte del proyecto, no redundante).

## 🔴 Regla Crítica — Código Ordenado y Profesional

**Código DEBE reflejar orden, comentarios y metodología — no aleatoriedad.**

**Comentarios:**
- Obligatorios donde la lógica no es obvia
- Explicar POR QUÉ, no QUÉ
- Una línea antes de la sección, breve

**Orden Visual:**
- Estructura clara y predecible
- Agrupación lógica de funciones
- Separación visual entre bloques (línea en blanco)
- Indentación consistente (2 espacios JS, 4 Python)

**Patrones Consistentes:**
- **Mismo tipo = mismo patrón en TODO el repo**
- Todos los servicios usan la misma estructura
- Todos los endpoints: ruta → validar → procesar → responder
- Todos los tests: arrange → act → assert

**Profesionalismo Visual:**
- Código que diga "personas ordenadas" de inmediato
- Quien lee entiende la arquitectura en 2 minutos
- Patrones visuales claros

**Checklist (pre-commit):**
- [ ] ¿Hay comentarios donde no es obvio?
- [ ] ¿Está ordenado por bloques lógicos?
- [ ] ¿Sigue el patrón de archivos similares?
- [ ] ¿Indentación consistente?

## 🔴 Regla Crítica — Resolver Desde la Raíz

**Ante fallas: NUNCA parches. SIEMPRE resolver desde la causa raíz.**

**Prohibido:**
- ❌ If temporales (`if os.getenv("TESTING")`)
- ❌ Comentarios `TODO`, `HACK`, `FIXME` sin fecha
- ❌ Skipear tests ("lo arreglamos después")
- ❌ Agregar defensas alrededor del error

**Método (resolver desde la raíz):**

1. **Investigar:** Stacktrace de abajo hacia arriba — ¿dónde se originó?
2. **Comprender:** ¿Qué asunción era incorrecta?
3. **Fixar:** Cambiar la causa raíz, no el síntoma
4. **Validar:** Tests que confirmen que el fix es permanente
5. **Limpiar:** Eliminar workarounds y code smells

**Ejemplo:**
- **Síntoma:** Endpoint GET `/vaults` retorna bóveda de otro usuario
- **Raíz:** No validar `current_user.id == vault.owner_id`
- **Fix:** Agregar validación en el query
- **Validar:** Test que asegure aislamiento

**Por qué:** Parches = deuda técnica + código frágil. Fix desde raíz = profesional + mantenible.

## 🔴 Regla Crítica — Respuestas Concisas

**Chat = directo al grano. Claro, conciso, sin relleno.**

**✅ Bien:** Una frase qué + resultado + próximo (3-4 líneas max)
**❌ Mal:** "Como te mencioné", contexto basura, redundancias

**Por qué:** Tokens = recursos. Respuestas largas = consumo innecesario.

## Reglas P1-P5 (seguridad — SIEMPRE)

- **P1:** Gate siempre primero.
- **P2:** Datos scoped a `current_user.id`.
- **P3:** Permisos validados (owner check).
- **P4:** Sin secretos en repo.
- **P5:** Tests con BD real (nunca mocks).

## Mapa de documentación (producto)

| Doc | Ruta | Se actualiza cuando… |
|-----|------|---------------------|
| Backlog de historias | `.harness/backlog.md` | Nueva historia o reorden |
| Historia + plan | `.harness/historias/*/{historia.md,plan.md}` | Al tomar una historia (§3) |
| Decisiones | `.harness/decisions/ADR-*.md` | Cambio arquitectónico |
| API | `docs/API.md` | Endpoints, reglas o códigos de error cambian |
| README raíz y de cada paquete | `README.md`, `backend/**/README.md`, `frontend/**/README.md`, `backend/scripts/README.md` | Módulos, variables de entorno, scripts o estructura cambian |
| Skill global de bóvedas | `backend/app/system_docs/skill-bovedas-synapse.md` | Cambia lo que un agente ve o hace con `synapse_vault` |

Tabla completa: `.harness/constitution.md` Art. 11.

## Roles

Los roles base del arnés están en `.claude/agents/` (`orquestador`, `autor-de-spec`, `arquitecto`, `implementador`, `revisor`, `explorador`) y el especialista `experto-ux-ui`; el manual de cada uno, en su archivo de `.claude/agents/`.

**Agentes OpenClaw (externos, usan la API de Synapse):** AIRA (diseño y desarrollo de proyectos), Liza (coordinación), `main` (orquestación) y otros; cada uno con su clave por agente.

---

**Synapse — Slice Development (piloto desde 2026-10-25) — Harness Génesis Completada**
