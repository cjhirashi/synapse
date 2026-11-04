---
id: H-040
titulo: Migración del bloque YAML al inicio del cuerpo de las notas a atributos
estado: in-progress # orden de Carlos 2026-11-04 (vía `main`): ensayo primero, migración real solo con confirmación
covers:
  - backend/app/core/body_yaml.py
  - backend/app/core/attribute_rules.py
  - backend/scripts/migrate_body_yaml.py
  - backend/tests/test_body_yaml.py
  - backend/tests/test_migrate_body_yaml.py
  - backend/tests/test_attribute_rules.py
origen: Carlos 2026-11-04 (punto 4 de la orden a AIRA vía `main`); continúa la migración de H-029
---

# H-040 — Migración del YAML del cuerpo a atributos

## 1. Intención

Hay notas cuyo `content` empieza con un bloque YAML (`---` … `---`) en lugar de tener esos datos como atributos
(`frontmatter`). Se migran a atributos y el cuerpo queda sin el bloque. Primero un ensayo sin escribir (informe);
la migración real solo se ejecuta tras la confirmación de Carlos.

## 2. Decisiones (diseño de AIRA)

- **D-1 (qué es un bloque YAML):** la nota empieza, en el primer carácter (tras un BOM opcional), por una línea `---`;
  el bloque termina en la siguiente línea `---` (o `...`); lo de en medio es un mapeo YAML válido (`yaml.safe_load`).
  Un `---` que no está al inicio del texto, o un bloque que no es un mapeo o no se puede leer, NO es migrable: la nota
  queda intacta y se lista aparte. (En producción hay una nota que empieza por una línea en blanco y luego `---`: es una
  regla horizontal, no un YAML; la regla estricta la deja en paz.)
- **D-2 (mapeo de claves, el pedido por Carlos):** `title`/`titulo` → `titulo`; `description`/`descripcion` →
  `descripcion`; `tags`/`etiquetas` → `tags` (normalizadas con `normalize_tag`); `status`/`estado` → `estado`
  (normalizado a minúsculas con `legacy_estado`); fechas y `ruta` según las reglas de H-029
  (`migrate_frontmatter_detailed`); cualquier otra clave se conserva como atributo libre con su valor.
  La clave `etiquetas`→`tags` también se aplica a las notas que la tengan ya como atributo.
- **D-3 (conflicto con un atributo existente):** manda el atributo existente; el valor del YAML que difiera se reporta
  (no se pierde en silencio: queda en el informe con nota, clave y ambos valores) y el bloque se retira igualmente
  solo si TODA clave quedó migrada o reportada; los valores reportados quedan también en el respaldo.
- **D-4 (valores no JSON):** fechas YAML (`2026-11-03`) pasan a texto `AAAA-MM-DD`; cualquier otro tipo no
  representable se convierte a texto y se anota en el informe.
- **D-5 (seguridad de la escritura):** mismas garantías que `migrate_attributes.py`: informe en seco por defecto con
  resumen digest, `apply` solo si el plan actual coincide con el informe aprobado (código 2), respaldo previo de las notas
  a tocar (`backup`), escritura con el `_rev` leído (409 → se salta y se cuenta), relectura y verificación de que
  `path`/`created_at`/`updated_at`/`deleted_at` no cambiaron, `rollback` desde el respaldo. No toca notas en papelera,
  con conflictos, INDICEs, ni `updated_at`/`fecha_actualizacion` (como H-029).
- **D-6 (idempotencia):** tras migrar, el cuerpo ya no empieza por YAML; una segunda corrida no encuentra nada.

## 3. Criterios (EARS booleano)

- **C-1:** CUANDO el `content` de una nota empieza por un bloque YAML válido que es un mapeo, el sistema DEBE extraerlo y
  devolver el cuerpo restante sin el bloque ni las líneas en blanco que lo separaban.
- **C-2:** SI el texto empieza por `---` pero no cumple D-1, ENTONCES el sistema NO DEBE modificar la nota y DEBE
  listarla como no migrable con su motivo.
- **C-3:** El sistema DEBE mapear `title`, `description`, `tags`/`etiquetas`, `status` y sus equivalentes en español
  a `titulo`, `descripcion`, `tags`, `estado`, con tags y estado normalizados, y conservar las demás claves como libres.
- **C-4:** SI una clave del YAML ya existe como atributo con otro valor, ENTONCES el atributo DEBE conservarse y el valor
  del YAML DEBE aparecer en el informe.
- **C-5:** CUANDO una nota tiene el atributo `etiquetas`, el sistema DEBE migrarlo a `tags` normalizado.
- **C-6:** El modo informe NO DEBE escribir nada y DEBE listar, por bóveda, cuántas notas migrarían, las no migrables y el
  mapeo de claves con su conteo.
- **C-7:** El modo `apply` DEBE negarse a escribir si el plan no coincide con el informe aprobado, DEBE respaldar antes y
  DEBE ser idempotente.
- **C-8:** El frontmatter resultante DEBE pasar `validate_general`; si no, la nota NO DEBE modificarse y DEBE reportarse.

## 4. Cobertura

| Criterio | Paso | Prueba |
|---|---|---|
| C-1, C-2 | 1 | `test_body_yaml.py` |
| C-3, C-4, C-5, C-8 | 2 | `test_body_yaml.py`, `test_attribute_rules.py` |
| C-6 | 3 | `test_migrate_body_yaml.py` (CouchDB real de pruebas) |
| C-7 | 4, 5 | `test_migrate_body_yaml.py` |

`[NEEDS CLARIFICATION] = 0`. Decisión abierta para Carlos: la clave `date` (ver informe de ensayo).

## Avance (AIRA, 2026-11-04 17:00 CDMX)

- Pasos 1-3 hechos (`63bd25e`, `e6f0cd0`, `437f1f3`, reescritos en `bcdf11f`: cuerpo con sus saltos de línea, normalización antes de comparar,
  `vault_id` real, `---x` no es YAML, atributo `etiquetas` sin YAML también migra). Pruebas en verde en tmpfs (214).
- **Ensayo en producción (solo lectura, 20 bases):** 1258 notas vivas (600 más en papelera, intactas); solo **1** empieza por YAML
  (`Proyectos / 3 - Proyectos Banzi/Referencia/Familia ESP32 - comparativa.md`: `tags`, `date`, `author`, `status`), migrable sin
  conflictos. Otra empieza por `---` tras una línea en blanco (`Inglés / BITACORA.md`): regla horizontal, no migrable, no se toca.
  0 notas con atributo `etiquetas`, 0 conflictos de CouchDB. Decisión abierta para Carlos: `date` queda como atributo libre `date`
  (no `fecha_creacion`). Digest del plan: `e593ffcc…3551d`. `apply`/`backup`/`rollback` (pasos 4-5) NO implementados: esperan confirmación de Carlos.
