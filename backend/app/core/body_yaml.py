"""H-040: Extracción y migración de YAML del cuerpo a atributos."""
import yaml
from datetime import date
from typing import Optional


def split_body_yaml(content: str) -> tuple[dict, str] | tuple[None, str]:
    """C-1, C-2: Extrae bloque YAML del inicio del contenido.

    Devuelve `(mapeo, resto)` si el contenido empieza por un bloque YAML válido
    (cumple D-1), o `(None, motivo)` con motivo ∈ {`no-empieza-por-yaml`,
    `sin-cierre`, `yaml-invalido`, `no-es-mapeo`}.

    D-1: El bloque YAML:
    - Empieza en el primer carácter (tras BOM opcional) con una línea `---`
    - Termina en la siguiente línea `---` o `...`
    - Lo de en medio es un mapeo YAML válido (yaml.safe_load)
    - Un `---` que no está al inicio, o un bloque que no es mapeo o no se puede
      leer, NO es migrable.
    """
    # Remover BOM si está presente
    text = content.lstrip("﻿")

    # Remover \r de líneas (normalizar a \n)
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Verificar que empiece con `---`
    if not text.startswith("---"):
        return None, "no-empieza-por-yaml"

    # Buscar la línea de cierre (`---` o `...`)
    lines = text.split("\n")
    if len(lines) < 2:
        return None, "sin-cierre"

    # Primer `---` está en lines[0]
    # Buscar el cierre a partir de lines[1]
    closing_index = None
    for i in range(1, len(lines)):
        stripped = lines[i].strip()
        if stripped == "---" or stripped == "...":
            closing_index = i
            break

    if closing_index is None:
        return None, "sin-cierre"

    # Extraer el bloque YAML (entre las dos líneas delimitadoras)
    yaml_lines = lines[1:closing_index]
    yaml_text = "\n".join(yaml_lines)

    # Parsear YAML
    try:
        yaml_data = yaml.safe_load(yaml_text)
    except yaml.YAMLError:
        return None, "yaml-invalido"

    # Si el YAML es None (bloque vacío), devolver mapeo vacío
    if yaml_data is None:
        yaml_data = {}

    # Validar que sea un mapeo
    if not isinstance(yaml_data, dict):
        return None, "no-es-mapeo"

    # Convertir claves no-string a string, y fechas a strings AAAA-MM-DD
    normalized_yaml = {}
    for key, value in yaml_data.items():
        # Convertir clave a string si no lo es
        key_str = str(key) if not isinstance(key, str) else key

        # Convertir fechas (date objects) a AAAA-MM-DD
        if isinstance(value, date):
            value = value.isoformat()

        normalized_yaml[key_str] = value

    # Construir el `rest` sin el bloque YAML ni líneas en blanco iniciales
    rest_lines = lines[closing_index + 1 :]
    # Remover líneas en blanco al inicio del rest
    while rest_lines and rest_lines[0].strip() == "":
        rest_lines.pop(0)
    rest = "\n".join(rest_lines)

    return normalized_yaml, rest


def merge_yaml_into_frontmatter(
    existing: dict, yaml_data: dict
) -> tuple[dict, list[dict]]:
    """C-3, C-4, C-5: Fusiona YAML en frontmatter.

    El atributo existente manda; si hay conflicto de valor, se reporta.
    Devuelve `(nuevo_frontmatter, reportados)`.

    Cada reportado es `{"key", "yaml_value", "attribute_value", "reason"}`.
    """
    from app.core.attribute_rules import migrate_frontmatter_detailed

    new_fm = dict(existing)
    reportados: list[dict] = []

    # Mapeo de alias (YAML → atributo estándar)
    alias_map = {
        "title": "titulo",
        "description": "descripcion",
        "etiquetas": "tags",
    }

    # Procesar cada clave del YAML
    for key, value in yaml_data.items():
        # Aplicar alias
        target_key = alias_map.get(key, key)

        # Si el atributo ya existe, reportar conflicto (el existente manda)
        if target_key in new_fm:
            if new_fm[target_key] != value:
                reportados.append(
                    {
                        "key": key,
                        "yaml_value": value,
                        "attribute_value": new_fm[target_key],
                        "reason": f"Conflicto: atributo '{target_key}' ya existe con otro valor; se conserva el existente.",
                    }
                )
            # El existente ya está en new_fm, no hacer nada
        else:
            # Agregar el atributo nuevo
            new_fm[target_key] = value

    # Aplicar reglas de migración de atributos
    migrated_fm, dropped = migrate_frontmatter_detailed(new_fm)

    # Fusionar los dropped con reportados si hay conflictos de validación
    for item in dropped:
        # Solo reportar si no es una conversión esperada
        if item["reason"] != "la ruta ahora la calcula el sistema desde la ubicación de la nota":
            reportados.append(item)

    return migrated_fm, reportados


def plan_note(doc: dict) -> Optional[dict]:
    """C-5, C-8: Plan completo de migración de una nota.

    Devuelve un dict con `frontmatter_new`, `content_new`, `reportados`,
    `validation_error`; o `None` si no hay YAML o la migración falla.
    """
    from app.core.attribute_rules import validate_general

    content = doc.get("content", "")
    frontmatter = doc.get("frontmatter", {})

    # Intentar extraer YAML
    yaml_data, rest = split_body_yaml(content)
    if yaml_data is None:
        # No hay YAML migrable
        return None

    # Fusionar YAML en frontmatter
    new_fm, reportados = merge_yaml_into_frontmatter(frontmatter, yaml_data)

    # Validar que el nuevo frontmatter sea válido
    validation_error = validate_general(new_fm)
    if validation_error:
        # No hay plan: el frontmatter es inválido
        return None

    return {
        "frontmatter_new": new_fm,
        "content_new": rest,
        "reportados": reportados,
        "validation_error": None,
    }
