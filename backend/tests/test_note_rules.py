"""Reglas puras de nota (SPEC-0008 RF-005, RF-013, RF-016; PLAN-0008 §2.1).

Recorre la batería común `fixtures/note_rules_cases.json`; el cliente (`noteRules.ts`) la
recorre con su propio test, así que cada caso fija que ambos lados coinciden.
"""
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
    if "build" not in case:
        return case["input"]
    return {case["build"]["key"]: _built(case)}


@pytest.mark.parametrize("case", CASES["frontmatter"], ids=lambda c: json.dumps(c["input"])[:40])
def test_rf_005_check_frontmatter_matches_the_battery(case):
    expected = None if case["valid"] else "validation-error:frontmatter"
    assert note_rules.check_frontmatter(_frontmatter(case)) == expected


def test_rf_005_a_normalized_path_is_a_fixed_point():
    for case in CASES["path"]:
        if isinstance(_value(case), str):
            normalized = case["normalized"]
            assert note_rules.normalize_path(normalized) == normalized
