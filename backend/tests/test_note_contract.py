"""Contrato del documento de nota frente a `core/note_rules.py` (SPEC-0008 RF-005; PLAN-0008 §4).

`note.schema.json` es el canon de la forma; las reglas de Python no pueden desviarse de él
sin que este test falle.
"""
import json
import re
from pathlib import Path

from app.core import note_rules
from app.services import sync_push

SCHEMA = json.loads(
    (Path(__file__).resolve().parents[2]
     / ".harness/specs/0008-vault-editor/contracts/note.schema.json").read_text()
)


def test_rf_005_the_schema_is_closed_and_lists_the_same_keys_as_the_rules():
    assert SCHEMA["additionalProperties"] is False
    assert set(SCHEMA["required"]) == set(note_rules.NOTE_REQUIRED)
    assert set(SCHEMA["properties"]) == set(note_rules.NOTE_KEYS)


def test_rf_005_optional_keys_are_exactly_the_ones_the_spec_allows():
    # Spec §3: sólo `frontmatter` es opcional.
    assert set(note_rules.NOTE_KEYS) - set(note_rules.NOTE_REQUIRED) == {"frontmatter"}


def test_rf_005_the_schema_limits_equal_the_rule_constants():
    properties = SCHEMA["properties"]
    assert properties["path"]["maxLength"] == note_rules.PATH_MAX
    assert properties["content"]["x-max-utf8-bytes"] == note_rules.CONTENT_MAX_BYTES
    assert properties["frontmatter"]["x-max-json-utf8-bytes"] == note_rules.FRONTMATTER_MAX_BYTES


def test_rf_006_the_rev_pattern_bounds_the_generation_like_the_push():
    # El push acota la generación de `_rev` (H-2): el contrato no puede prometer más. El
    # patrón del servidor lleva grupos de captura; el del esquema es el mismo sin ellos.
    server = sync_push._REV.pattern.replace("(", "").replace(")", "")
    schema = SCHEMA["properties"]["_rev"]["pattern"]
    assert schema == f"^{server}$"
    assert re.search(schema, "1" * 16 + "-abc") and not re.search(schema, "1" * 17 + "-abc")
