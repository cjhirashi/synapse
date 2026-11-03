"""H-029: casos compartidos con el frontend (`tests/fixtures/attribute_rules.json`)."""
import json
from pathlib import Path

import pytest

from app.core import attribute_rules as rules

SPEC = json.loads((Path(__file__).parent / "fixtures" / "attribute_rules.json").read_text(encoding="utf-8"))


def test_limits_and_lists_match_the_spec():
    assert (rules.TITULO_MAX, rules.DESCRIPCION_MAX, rules.TAGS_MAX, rules.TAG_MAX_LEN) == (
        SPEC["limits"]["titulo_max"], SPEC["limits"]["descripcion_max"],
        SPEC["limits"]["tags_max"], SPEC["limits"]["tag_max_len"])
    assert list(rules.ESTADOS) == SPEC["estados"]
    assert list(rules.RESERVED_KEYS) == SPEC["reserved_keys"]
    assert rules.ESTADO_SYNONYMS == SPEC["estado_synonyms"]["table"]


@pytest.mark.parametrize("given,expected", SPEC["normalize_key"]["cases"])
def test_normalize_key(given, expected):
    assert rules.normalize_key(given) == expected


@pytest.mark.parametrize("given,expected", SPEC["normalize_tag"]["cases"])
def test_normalize_tag(given, expected):
    assert rules.normalize_tag(given) == expected


@pytest.mark.parametrize("given,expected", SPEC["estado_synonyms"]["cases"])
def test_estado_of(given, expected):
    assert rules.estado_of(given) == expected


@pytest.mark.parametrize("case", SPEC["migrate_frontmatter"]["cases"], ids=lambda c: c["name"])
def test_migrate_frontmatter(case):
    out = rules.migrate_frontmatter(case["in"])
    assert out == case["out"]
    if "out_order" in case:
        assert list(out) == case["out_order"]
    assert rules.migrate_frontmatter(out) == out


@pytest.mark.parametrize("given,expected", SPEC["validate_general"]["cases"])
def test_validate_general(given, expected):
    assert rules.validate_general(given) == expected


def test_migrated_frontmatter_always_passes_validation():
    for case in SPEC["migrate_frontmatter"]["cases"]:
        assert rules.validate_general(rules.migrate_frontmatter(case["in"])) is None, case["name"]
