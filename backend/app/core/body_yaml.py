"""H-040: bloque YAML al inicio del cuerpo de una nota -> atributos (frontmatter).

Reglas puras, sin E/S. El mapeo de claves (title/titulo, description/descripcion, tags/etiquetas,
status/estado, fechas) lo hace `attribute_rules.migrate_frontmatter_detailed`.
"""
import math
from datetime import date, datetime

import yaml

from app.core.attribute_rules import migrate_frontmatter_detailed, normalize_key, validate_general

_BOM = "\ufeff"
_CLOSERS = ("---", "...")
# Alias que solo valen para un bloque YAML del cuerpo (no para los atributos ya guardados): `date` es la fecha de
# creación de la nota (decisión de Carlos, 2026-11-04).
YAML_ONLY_ALIASES = {"date": "fecha_creacion"}


def apply_yaml_aliases(yaml_data: dict) -> dict:
    """Renombra las claves de `YAML_ONLY_ALIASES`. Si el YAML ya trae la clave destino, el alias NO se renombra
    (queda como atributo libre, así el dato no se pierde ni se pisa)."""
    present = {normalize_key(k) for k in yaml_data}
    out: dict = {}
    for key, value in yaml_data.items():
        target = YAML_ONLY_ALIASES.get(normalize_key(key) or "")
        out[target if target and target not in present else key] = value
    return out


def _jsonable(value):
    """Valor YAML -> valor JSON: fechas a texto (`AAAA-MM-DD`; con hora, ISO), claves a texto, lo no
    representable (bytes, conjuntos, NaN/infinito) a texto."""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_jsonable(v) for v in value]
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    return str(value)


def split_body_yaml(content: str) -> tuple[dict, str] | tuple[None, str]:
    """`(mapeo, resto)` si `content` empieza por un bloque YAML válido (D-1); si no, `(None, motivo)` con
    motivo en {`no-empieza-por-yaml`, `sin-cierre`, `yaml-invalido`, `no-es-mapeo`}.

    El bloque empieza en la primera línea (tras un BOM opcional), que debe ser exactamente `---`, y termina
    en la siguiente línea `---` o `...`. `resto` conserva los saltos de línea originales y pierde el bloque
    y las líneas en blanco que lo separaban del texto.
    """
    text = content[1:] if content.startswith(_BOM) else content
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].rstrip() != "---":
        return None, "no-empieza-por-yaml"
    closing = next((i for i in range(1, len(lines)) if lines[i].rstrip() in _CLOSERS), None)
    if closing is None:
        return None, "sin-cierre"
    try:
        data = yaml.safe_load("".join(lines[1:closing]))
    except yaml.YAMLError:
        return None, "yaml-invalido"
    if data is None:
        data = {}
    if not isinstance(data, dict):
        return None, "no-es-mapeo"
    rest_lines = lines[closing + 1:]
    while rest_lines and not rest_lines[0].strip():
        rest_lines.pop(0)
    return _jsonable(data), "".join(rest_lines)


def merge_yaml_into_frontmatter(existing: dict, yaml_data: dict) -> tuple[dict, list[dict]]:
    """Fusiona el YAML en los atributos. Ambos pasan por las reglas de atributos (alias y normalización), así
    que se comparan ya normalizados. Si un atributo existe con otro valor, MANDA EL EXISTENTE.

    Devuelve `(nuevo_frontmatter, reportados)`; cada reportado es `{key, yaml_value, attribute_value, reason}`:
    un valor del YAML que no se guardó (conflicto con el atributo, o no cabe en su atributo).
    """
    merged, existing_dropped = migrate_frontmatter_detailed(existing)
    from_yaml, yaml_dropped = migrate_frontmatter_detailed(apply_yaml_aliases(yaml_data))
    reported: list[dict] = []
    for key, value in from_yaml.items():
        if key not in merged:
            merged[key] = value
        elif merged[key] != value:
            reported.append({
                "key": key, "yaml_value": value, "attribute_value": merged[key],
                "reason": "el atributo ya existe con otro valor; se conserva el atributo",
            })
    for item in yaml_dropped:
        reported.append({"key": item["key"], "yaml_value": item["value"], "attribute_value": None, "reason": item["reason"]})
    for item in existing_dropped:
        reported.append({"key": item["key"], "yaml_value": None, "attribute_value": item["value"],
                         "reason": f"atributo existente descartado: {item['reason']}"})
    return merged, reported


def plan_note(doc: dict) -> dict | None:
    """Plan de migración de una nota, o `None` si nada que migrar (ni bloque YAML ni atributo `etiquetas`).

    `{"ok": True, "frontmatter_new", "content_new", "reportados", "yaml_keys", "tiene_yaml"}` si es migrable, o
    `{"ok": False, "motivo"}` si empieza por `---` pero no se puede migrar (la nota queda intacta).
    """
    content = doc.get("content") or ""
    existing = doc.get("frontmatter") or {}
    data, rest = split_body_yaml(content)
    has_yaml = data is not None
    if data is None:
        if rest != "no-empieza-por-yaml":
            return {"ok": False, "motivo": rest}
        if "etiquetas" not in existing:
            return None
        data, rest, has_yaml = {}, content, False  # C-5: solo hay que pasar el atributo `etiquetas` a `tags`
    frontmatter, reported = merge_yaml_into_frontmatter(existing, data)
    error = validate_general(frontmatter)
    if error:
        return {"ok": False, "motivo": f"frontmatter-invalido:{error}"}
    return {"ok": True, "frontmatter_new": frontmatter, "content_new": rest, "reportados": reported,
            "yaml_keys": list(data), "tiene_yaml": has_yaml}
