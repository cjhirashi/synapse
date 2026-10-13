---
id: SPEC-0005
tipo: spec
feature: 0005-integration-real-db
estado: draft            # draft | in-review | approved | implemented | verified | deprecated
# --- anclaje (fusionado; ver method.md §9) ---
anchor_commit: d7927ad   # último commit reconciliado (lo mueve el cierre)
anchor_mode: advisory    # advisory | strict  (pasa a strict en implemented/verified)
covers:                  # borrador: se cierra al terminar la Fase 1
  - backend/tests/integration/**
# --- aprobaciones humanas ---
aprobaciones:
  fase_1: pendiente
  fase_2: pendiente
actualizado: 2026-10-13
---

# SPEC-0005 · Tests de integración contra backends reales

> Borrador de apertura de la Fase 1 (elicitación con el usuario, `method.md §3`). Nace de
> T-006 de `TAREAS.md` y del backlog 4 de `state.md`. Nada de lo de abajo está decidido:
> las preguntas abiertas están en «Marcadores abiertos».

## 1. Contexto del dominio
- **Problema:** la suite prueba CouchDB real, pero el control plane (usuarios, refresh
  tokens) corre en SQLite — excepción declarada a P5 (plan 0002 §7). Un fallo que sólo
  aparece en PostgreSQL (tipos, colaciones, `UNIQUE` sensible a mayúsculas, concurrencia)
  no lo detecta ningún test.
- **Ya cubierto hoy (no se repite):** CouchDB real en toda la suite (`test_real_backends.py`),
  aislamiento por base de usuario (`test_isolation.py`, `test_vaults_isolation.py`), flujo
  de alta (`test_flow.py`), migraciones probadas a mano en PostgreSQL 15 (backlog 3).
- **Dependencias:** PostgreSQL 15 (misma versión que `docker-compose.yml`), CouchDB 3.

## 2. Alcance
### En alcance (propuesta)
- Correr los tests del control plane contra PostgreSQL real y cerrar la excepción a P5.
- Migraciones Alembic aplicadas de verdad (`upgrade head` / `downgrade base`) en la suite.
- Un recorrido de integración único: alta → login → CRUD de bóvedas → aislamiento entre
  dos usuarios → logout, todo con backends reales.
### Fuera de alcance (propuesta)
- Tests de rendimiento nuevos, sincronización PouchDB, tests de navegador (E2E del frontend).

## 3. Modelo de datos y contratos de E/S
- Sin fronteras nuevas: la feature sólo añade tests e infraestructura de pruebas.

## 4. Criterios de aceptación (EARS)
> Borrador; se redactan con el usuario.

- **RF-001** — La suite del backend DEBE ejecutar los tests del control plane contra un
  PostgreSQL real. [NEEDS CLARIFICATION: ¿todos o sólo un subconjunto marcado?]
- **RF-002** — CUANDO arranca la suite, el sistema DEBE crear el esquema con las
  migraciones Alembic, no con `create_all`.
- **RF-003** — La suite DEBE incluir al menos tres escenarios de aislamiento de extremo a
  extremo entre dos usuarios (T-006).

## 5. Casos límite y manejo de errores
- SI el PostgreSQL de pruebas no responde ENTONCES la suite DEBE abortar con un mensaje
  claro (igual que hoy con CouchDB). [NEEDS CLARIFICATION: confirmar]

## 6. Registro de decisiones y descartes
| Decisión | Justificación | Alternativa descartada | ADR |
|---|---|---|---|
| — | — | — | — |

## Marcadores abiertos
- `[NEEDS CLARIFICATION: ¿PostgreSQL para toda la suite (sustituye a SQLite) o sólo para un marcador `integration`, dejando SQLite en el ciclo rápido?]`
- `[NEEDS CLARIFICATION: ¿cómo se provee PostgreSQL en pruebas: contenedor fijo como el CouchDB de pruebas (puerto propio), o testcontainers?]`
- `[NEEDS CLARIFICATION: ¿se aceptan tests en `backend/tests/integration/` (ruta de T-006) o se siguen las convenciones actuales (`test_*.py` planos)?]`
