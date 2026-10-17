---
id: ADR-001
tipo: adr
estado: accepted
fecha: 2026-10-11
---

# ADR-001 · Adopción del arnés y patrón interno por-capas con puertos

## Contexto y planteamiento del problema

El Art. 2 de `constitution.md` sigue con la plantilla sin rellenar, aunque el código (`cf1632d`)
ya usa `routers → services → core/ports ← adapters`. Sin fijarlo, el gate no puede
verificar conformidad. El proyecto es un almacén de bóvedas (sin IA interna) con
FastAPI, PostgreSQL (control plane) y CouchDB (una base por usuario).

## Decisión

Elegimos **monolito modular con patrón por-capas y puertos para las fronteras de salida**
(PostgreSQL, CouchDB). La lógica vive en `services/` y `core/`; los adaptadores
implementan puertos; las rutas sólo traducen HTTP. `topologia_agentes: ninguna`,
`sustratos_integracion: [rest-http]`, `capas_transversales: [auth]`.

## Opciones consideradas

- **Por-capas con puertos (elegida)** — es lo que ya existe; mínimo coste; suficiente para el tamaño actual.
- **Hexagonal estricto** — más ceremonia (casos de uso, DTOs de dominio) sin beneficio hoy. Descartada.
- **Microservicios** — innecesario para un despliegue personal self-hosted. Descartada.

## Consecuencias

- **Buenas:** conformidad verificable, sin reescrituras; fronteras probables con dobles.
- **Coste / malas:** el núcleo usa modelos SQLAlchemy directamente (acoplamiento aceptado).

## Enlaces

- Afecta a: Art. 1–2 de la Constitución; PLAN-0002 §1.
- Reflejado en `constitution.md` Art. 2 (2026-10-11).
