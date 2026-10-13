---
id: ADR-003
tipo: adr
estado: accepted          # aprobada por el usuario el 2026-10-13 (SPEC-0005, D-3)
fecha: 2026-10-13
---

# ADR-003 · Resolución de conflictos: automática por campo, con caída al usuario

## Contexto y planteamiento del problema

Con escritura sin conexión (ADR-002), dos dispositivos pueden editar la misma bóveda. CouchDB
no pierde ninguna versión, pero elige un "ganador" determinista y arbitrario y deja el
resto en `_conflicts`, donde nadie lo ve (hazard 1 de `state.md`). Hay que decidir cómo se
resuelve para que ninguna edición se pierda sin decisión explícita.

## Decisión

Elegimos **resolución automática campo a campo y, si no basta, el usuario elige**:

- si las versiones cambiaron campos distintos (`name`, `description`, `tags`), se combinan
  solas;
- si chocan en el mismo campo, se muestran ambas versiones y el usuario elige (o combina);
- **borrado frente a edición: gana la edición** y la bóveda queda restaurada;
- la versión resuelta vuelve a pasar por la validación del push (ADR-002): si el nombre
  combinado choca con otra bóveda, sigue el flujo de rechazo.

## Opciones consideradas

- **Automática por campo con caída al usuario (elegida)** — resuelve sola la mayoría de
  los casos sin perder nada; sólo pregunta cuando hay un choque real.
- **El usuario elige siempre** — descartada: obliga a intervenir incluso cuando los cambios
  no se pisan.
- **Última escritura gana por `updated_at`** — descartada: pierde una edición en silencio y
  depende del reloj de cada dispositivo (SPEC-0005 R-8).

## Consecuencias

- **Buenas:** sin pérdida silenciosa (R-3); intervención mínima del usuario.
- **Coste / malas:** decidir "qué campo cambió" exige comparar contra la versión común
  (ancestro); cómo se obtiene, y qué hacer si ya no está disponible, se fija en SPEC-0005 y
  su plan. Hace falta una vista de conflictos en la UI.

## Enlaces

- Afecta a: SPEC-0005 (RF-012…RF-015; rechazo en RF-006), hazard 1 de `state.md`.
- Relacionado: ADR-002.
