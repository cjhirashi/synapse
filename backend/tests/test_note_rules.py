"""Reglas puras de nota (SPEC-0008 RF-005, RF-013, RF-016; PLAN-0008 §2.1).

Recorre la batería común `fixtures/note_rules_cases.json`; el cliente (`noteRules.ts`) la
recorre con su propio test, así que cada caso fija que ambos lados coinciden.
"""
import copy
import json
from pathlib import Path

import pytest

from app.core import note_rules

CASES = json.loads((Path(__file__).parent / "fixtures/note_rules_cases.json").read_text())


def _built(case: dict) -> str:
    """El valor de texto del caso: `prefix + repeat*times + suffix` si trae `build`."""
    build = case["build"]
    return case.get("prefix", "") + build["repeat"] * build["times"] + build["suffix"]


def _value(case: dict):
    return _built(case) if "build" in case else case["input"]


def _id(case: dict) -> str:
    return json.dumps(_value(case), ensure_ascii=True)[:40]


@pytest.mark.parametrize("case", CASES["path"], ids=_id)
def test_rf_005_check_path_matches_the_battery(case):
    assert note_rules.check_path(_value(case)) == case["code"]


@pytest.mark.parametrize("case", [c for c in CASES["path"] if isinstance(_value(c), str)], ids=_id)
def test_rf_005_normalize_path_matches_the_battery(case):
    assert note_rules.normalize_path(_value(case)) == case["normalized"]


@pytest.mark.parametrize("case", CASES["path_key"], ids=lambda c: c["path"][:20])
def test_rf_013_path_key_matches_the_battery(case):
    assert note_rules.path_key(case["path"]) == case["key"]


@pytest.mark.parametrize("case", CASES["content"], ids=_id)
def test_rf_016_check_content_matches_the_battery(case):
    expected = None if case["valid"] else "validation-error:content"
    assert note_rules.check_content(_value(case)) == expected


def _frontmatter(case: dict):
    # En frontmatter el texto construido es el valor de una clave.
    if "nonfinite" in case:
        # Un número no finito no cabe en el JSON de la batería: se pone tras leerla (VB-1).
        value = copy.deepcopy(case["input"])
        *parents, last = case["nonfinite"]["at"]
        target = value
        for step in parents:
            target = target[step]
        target[last] = float(case["nonfinite"]["token"])
        return value
    if "depth" in case:
        # Anidamiento generado (el JSON de la batería no puede llevar miles de niveles): raíz = nivel 1.
        value: dict = {}
        for _ in range(case["depth"] - 1):
            value = {"k": value}
        return value
    if "build" not in case:
        return case["input"]
    return {case["build"]["key"]: _built(case)}


@pytest.mark.parametrize("case", CASES["frontmatter"], ids=lambda c: json.dumps(c["input"])[:40] + (f"depth{c['depth']}" if "depth" in c else ""))
def test_rf_005_check_frontmatter_matches_the_battery(case):
    expected = None if case["valid"] else "validation-error:frontmatter"
    assert note_rules.check_frontmatter(_frontmatter(case)) == expected


def test_rf_005_a_normalized_path_is_a_fixed_point():
    for case in CASES["path"]:
        if isinstance(_value(case), str):
            normalized = case["normalized"]
            assert note_rules.normalize_path(normalized) == normalized


# --- H-029: Reglas de los siete generales en el servidor ---

def test_h029_check_frontmatter_rejects_titulo_exceeds_max():
    fm = {"titulo": "a" * 201}
    assert note_rules.check_frontmatter(fm) == "validation-error:frontmatter"


def test_h029_check_frontmatter_rejects_titulo_not_text():
    fm = {"titulo": 123}
    assert note_rules.check_frontmatter(fm) == "validation-error:frontmatter"


def test_h029_check_frontmatter_rejects_descripcion_exceeds_max():
    fm = {"descripcion": "a" * 1001}
    assert note_rules.check_frontmatter(fm) == "validation-error:frontmatter"


def test_h029_check_frontmatter_rejects_descripcion_not_text():
    fm = {"descripcion": ["not", "text"]}
    assert note_rules.check_frontmatter(fm) == "validation-error:frontmatter"


def test_h029_check_frontmatter_rejects_tags_with_spaces():
    fm = {"tags": ["tag with space"]}
    assert note_rules.check_frontmatter(fm) == "validation-error:frontmatter"


def test_h029_check_frontmatter_rejects_tags_with_uppercase():
    fm = {"tags": ["TAG"]}
    assert note_rules.check_frontmatter(fm) == "validation-error:frontmatter"


def test_h029_check_frontmatter_rejects_tags_empty_string():
    fm = {"tags": [""]}
    assert note_rules.check_frontmatter(fm) == "validation-error:frontmatter"


def test_h029_check_frontmatter_rejects_tags_exceeds_max_elements():
    fm = {"tags": ["tag" + str(i) for i in range(21)]}
    assert note_rules.check_frontmatter(fm) == "validation-error:frontmatter"


def test_h029_check_frontmatter_rejects_tags_element_exceeds_max_length():
    fm = {"tags": ["a" * 33]}
    assert note_rules.check_frontmatter(fm) == "validation-error:frontmatter"


@pytest.mark.parametrize("estado", ["En Revisión", "en_proceso", "", None, True, "x" * 33])
def test_h029_check_frontmatter_rejects_estado_not_in_stored_form(estado):
    assert note_rules.check_frontmatter({"estado": estado}) == "validation-error:frontmatter"


def test_h029_check_frontmatter_rejects_reserved_key_ruta():
    fm = {"ruta": "some/path"}
    assert note_rules.check_frontmatter(fm) == "validation-error:frontmatter"


@pytest.mark.parametrize("key", ["fecha_creacion", "fecha_actualizacion"])
@pytest.mark.parametrize("value", ["2024-02-30", "YYYY-MM-DD", "2024-01-01 (v2)", 20240101, None])
def test_h029_check_frontmatter_rejects_invalid_dates(key, value):
    assert note_rules.check_frontmatter({key: value}) == "validation-error:frontmatter"


@pytest.mark.parametrize("key", ["fecha_creacion", "fecha_actualizacion"])
def test_h029_check_frontmatter_accepts_valid_dates(key):
    assert note_rules.check_frontmatter({key: "2024-01-01"}) is None


def test_h029_check_frontmatter_accepts_valid_titulo():
    fm = {"titulo": "Valid Title"}
    assert note_rules.check_frontmatter(fm) is None


def test_h029_check_frontmatter_accepts_valid_descripcion():
    fm = {"descripcion": "Valid description"}
    assert note_rules.check_frontmatter(fm) is None


def test_h029_check_frontmatter_accepts_valid_tags():
    fm = {"tags": ["tag1", "tag2", "tag3"]}
    assert note_rules.check_frontmatter(fm) is None


@pytest.mark.parametrize("estado", ["borrador", "en revisión", "aprobado", "en implementación", "implementado", "en pruebas", "activo"])
def test_h029_check_frontmatter_accepts_standard_and_new_estados(estado):
    assert note_rules.check_frontmatter({"estado": estado}) is None


def test_h029_check_frontmatter_accepts_free_keys_with_accents_and_spaces():
    fm = {"custom_key": "Valor con acentos: é, ñ"}
    assert note_rules.check_frontmatter(fm) is None


def test_h029_check_frontmatter_accepts_other_keys_that_look_like_generals():
    assert note_rules.check_frontmatter({"fecha_creado": "x", "Estado": "x", "ruta_origen": "x"}) is None


def test_h029_check_frontmatter_accepts_null_frontmatter():
    assert note_rules.check_frontmatter(None) == "validation-error:frontmatter"


def test_h029_check_frontmatter_accepts_empty_frontmatter():
    assert note_rules.check_frontmatter({}) is None
