"""H-029: casos compartidos con el frontend (`tests/fixtures/attribute_rules.json`)."""
import json
from pathlib import Path

import pytest

from app.core import attribute_rules as rules

SPEC = json.loads((Path(__file__).parent / "fixtures" / "attribute_rules.json").read_text(encoding="utf-8"))


def test_limits_and_lists_match_the_spec():
    limits = SPEC["limits"]
    assert (rules.TITULO_MAX, rules.DESCRIPCION_MAX, rules.TAGS_MAX, rules.TAG_MAX_LEN, rules.ESTADO_MAX_LEN) == (
        limits["titulo_max"], limits["descripcion_max"], limits["tags_max"], limits["tag_max_len"], limits["estado_max_len"])
    assert list(rules.ESTADOS_ESTANDAR) == SPEC["estados_estandar"]
    assert list(rules.RESERVED_KEYS) == SPEC["reserved_keys"]
    assert rules.ESTADO_SYNONYMS == SPEC["legacy_estado"]["table"]


@pytest.mark.parametrize("given,expected", SPEC["normalize_key"]["cases"])
def test_normalize_key(given, expected):
    assert rules.normalize_key(given) == expected


@pytest.mark.parametrize("given,expected", SPEC["normalize_tag"]["cases"])
def test_normalize_tag(given, expected):
    assert rules.normalize_tag(given) == expected


@pytest.mark.parametrize("given,expected", SPEC["normalize_estado"]["cases"])
def test_normalize_estado(given, expected):
    assert rules.normalize_estado(given) == expected


@pytest.mark.parametrize("given,expected", SPEC["legacy_estado"]["cases"])
def test_legacy_estado(given, expected):
    assert rules.legacy_estado(given) == expected


@pytest.mark.parametrize("given,expected", SPEC["normalize_date"]["cases"])
def test_normalize_date(given, expected):
    assert rules.normalize_date(given) == expected


@pytest.mark.parametrize("case", SPEC["migrate_frontmatter"]["cases"], ids=lambda c: c["name"])
def test_migrate_frontmatter(case):
    out, dropped = rules.migrate_frontmatter_detailed(case["in"])
    assert out == case["out"]
    assert [d["key"] for d in dropped] == case["dropped"]
    if "out_order" in case:
        assert list(out) == case["out_order"]
    assert rules.migrate_frontmatter(out) == out


@pytest.mark.parametrize("given,expected", SPEC["validate_general"]["cases"])
def test_validate_general(given, expected):
    assert rules.validate_general(given) == expected


def test_migrated_frontmatter_always_passes_validation():
    for case in SPEC["migrate_frontmatter"]["cases"]:
        assert rules.validate_general(rules.migrate_frontmatter(case["in"])) is None, case["name"]


def test_no_migrated_key_ends_with_original():
    for case in SPEC["migrate_frontmatter"]["cases"]:
        assert not [k for k in rules.migrate_frontmatter(case["in"]) if k not in case["in"] and k.endswith("_original")]
