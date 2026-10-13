---
id: ADR-002
tipo: adr
estado: accepted          # aprobada por el usuario el 2026-10-13 (SPEC-0005, D-1/D-2/D-4)
fecha: 2026-10-13
---

# ADR-002 · Canal de sincronización: proxy `/sync` en el backend con validación en el push

## Contexto y planteamiento del problema

SPEC-0005 añade una réplica PouchDB en el navegador de la base CouchDB del usuario
(`synapse_user_{id}`). Hoy CouchDB sólo se usa con la credencial admin desde la red interna
`synapse_internal`, y los invariantes de las bóvedas (validación, nombre único con reservas
`vault-name:*`, id canónico, soft delete) los aplica el servicio del backend (SPEC-0003), no
CouchDB. Hay que decidir por dónde replica el navegador, si puede escribir sin conexión y
qué documentos viajan, sin romper P2 (identidad sólo del token) ni P3 (permisos en todo
endpoint).

## Decisión

Elegimos un **proxy de replicación en el backend** (`/sync/…`, mismo origen que la SPA):

- exige la cookie de sesión y resuelve la base **sólo** desde el token (D-1);
- reenvía a CouchDB únicamente los endpoints del protocolo de replicación;
- **valida cada documento del push** con las mismas reglas que la API REST de 0003 y rechaza
  documento a documento, de modo que el cliente puede escribir sin conexión (D-2);
- **filtra** lo replicado a documentos `vault:*`; las reservas `vault-name:*` y los
  documentos de diseño no salen del servidor (D-4).

## Opciones consideradas

- **Proxy en el backend (elegida)** — P2/P3 en un único punto, CouchDB sigue en la red
  interna, sin CORS ni credenciales nuevas. Coste: el backend implementa el filtrado y la
  validación del protocolo de replicación.
- **CouchDB expuesto vía Caddy con autenticación JWT nativa y `_security` por base** —
  descartada: CouchDB pasa a estar en Internet, exige usuarios CouchDB por persona y los
  invariantes de 0003 tendrían que duplicarse en `validate_doc_update` (JavaScript), con la
  unicidad de nombre imposible de garantizar ahí.
- **Sin replicación nativa (copia local mantenida por el cliente vía API REST)** —
  descartada: reimplementa `_changes`, checkpoints y reanudación que PouchDB ya resuelve.
- Escritura: **sólo lectura offline** descartada por el usuario frente a offline-first real;
  **outbox reenviado por la API REST** descartado: duplica la cola que da la replicación.
- Alcance: **replicar la base completa** descartado: expondría las reservas de nombre al
  cliente (SPEC-0005 R-12).

## Consecuencias

- **Buenas:** la credencial admin nunca sale del backend (R-2); ningún documento entra al
  servidor sin pasar las reglas de 0003 (R-1); aislamiento verificable con tests reales.
- **Coste / malas:** dos réplicas sin conexión pueden crear bóvedas con el mismo nombre: la
  segunda se rechaza al sincronizar y el usuario la corrige (SPEC-0005 RF-006), no se evita
  en origen. El proxy añade latencia y carga al backend.

## Enlaces

- Afecta a: SPEC-0005 (RF-001, RF-002, RF-005, RF-006), P2, P3; SPEC-0003 (invariantes).
- Relacionado: ADR-001 (por-capas con puertos), ADR-003 (resolución de conflictos).
