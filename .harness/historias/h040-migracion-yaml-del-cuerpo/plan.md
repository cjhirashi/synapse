---
historia: H-040
estado: confirmado # diseño de AIRA 2026-11-04
---

# Plan H-040 — Migración del YAML del cuerpo

Worktree `h040-yaml-cuerpo` (rama `feature/h040-migracion-yaml-cuerpo`). Pruebas: `cd backend && python3 -m pytest <archivo> -q`
(CouchDB de pruebas en `localhost:15984`). Patrón a imitar: `backend/scripts/migrate_attributes.py` + `tests/test_migrate_attributes.py`
(reutilizar `CouchClient`, `calculate_plan_digest`, el estilo de `run_report`/`run_backup`/`run_apply`/`run_rollback`). Un commit por
paso, citando H-040.

## Pasos TDD

1. **`core/body_yaml.py::split_body_yaml(content: str) -> tuple[dict, str] | tuple[None, str]`** (C-1, C-2). Devuelve
   `(mapeo, resto)` si cumple D-1, o `(None, motivo)` con motivo ∈ {`no-empieza-por-yaml`, `sin-cierre`, `yaml-invalido`,
   `no-es-mapeo`}. `yaml.safe_load`; fechas → `AAAA-MM-DD`; claves no texto → texto. `resto` sin el bloque y sin las líneas
   en blanco iniciales. Casos: BOM, `\r\n`, cierre con `...`, bloque vacío, lista en vez de mapeo, YAML inválido, `---` tras línea en blanco,
   contenido sin YAML, `---` de regla horizontal dentro del texto. Término: `pytest tests/test_body_yaml.py` verde.
2. **Alias y fusión** (C-3, C-4, C-5, C-8). En `attribute_rules.py`: alias `title→titulo`, `description→descripcion`,
   `etiquetas→tags` dentro de `migrate_frontmatter_detailed` (por `normalize_key`). En `body_yaml.py`:
   `merge_yaml_into_frontmatter(existing: dict, yaml_data: dict) -> tuple[dict, list[dict]]` (el atributo existente manda;
   devuelve el nuevo frontmatter y la lista de reportados `{key, yaml_value, attribute_value, reason}`) y
   `plan_note(doc) -> dict | None` con el resultado completo (nuevo frontmatter, nuevo content, reportados, conflicto de validación).
   Pruebas: mapeo de cada alias, `etiquetas` como atributo, conflicto de valor, clave libre conservada, `validate_general` falla → sin cambio. Término:
   `pytest tests/test_body_yaml.py tests/test_attribute_rules.py tests/test_migrate_attributes.py` verde.
3. **Herramienta, modo informe** `scripts/migrate_body_yaml.py --mode report --report-file … --summary-file … [--only-db]` (C-6):
   recorre todas las bases `synapse_user_*`, notas vivas, sin conflictos, no INDICE; cuenta por bóveda (nombre de la bóveda desde su documento
   `vault:{id}`) las que migrarían, las no migrables (con motivo), las notas con atributo `etiquetas`, el mapeo de claves con conteo, los reportados
   por conflicto, `plan_digest` (sha256 del plan `db|id|rev|frontmatter_nuevo|content_nuevo`). No escribe. Pruebas con CouchDB real: notas sembradas, informe exacto, 0 escrituras (comparar `_rev`). Término: verde.
4. **Modos `backup` y `rollback`** (C-7): el respaldo guarda los documentos completos que el plan tocaría (JSON, permisos 600); `rollback` restaura
   solo si la nota sigue en la revisión escrita por la migración. Pruebas: respaldo y rollback devuelven el documento original.
5. **Modo `apply`** (C-7): exige `--report-file`; si el plan actual no coincide con el digest → sale con 2 sin escribir; escribe con el `_rev` leído
   (409 → se cuenta y se salta), relee y verifica que `path`/`created_at`/`updated_at`/`deleted_at` no cambiaron (código 3 si difieren); segunda corrida no hace
   nada (idempotente); `--dry-apply` no escribe. Pruebas: aplicar, idempotencia, digest distinto, 409 simulado, nota editada entre informe y apply.
6. **[doc]** `backend/tests/README.md` (los dos archivos de prueba), `backend/app/README.md` (si lista `core/`), `docs/API.md` solo si describe atributos y menciona el YAML
   (decide con `grep -n "YAML" docs/API.md`; si no toca, declarar `Docs actualizadas: ninguna — <motivo>`). Término: gate sin ❌ de docs.
7. **Suite completa del backend** en verde (segundo plano, ~15 min); `historia.md` → `implemented`; Session-End en `.harness/memory/history.md`; backlog.

## Ensayo en producción (AIRA, solo lectura)

`docker cp` del código a `/tmp/h040` en `synapse-backend` y `--mode report` contra las 20 bases. El informe se entrega a Carlos/`main`; **`apply` no se ejecuta** hasta que lo confirmen.
