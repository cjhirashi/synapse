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


def test_rf_007_path_pattern_plus_maxlength_match_check_path_over_the_battery():
    # SPEC-0010 RF-007: el patrón `path` + `maxLength` del esquema aceptan EXACTAMENTE las rutas
    # (ya normalizadas) que `check_path` no rechaza; en particular, un último segmento `.md` sin
    # nombre (`X/.md`, `.md`) queda fuera de ambos.
    pattern = SCHEMA["properties"]["path"]["pattern"]
    max_len = SCHEMA["properties"]["path"]["maxLength"]
    cases = json.loads(
        (Path(__file__).resolve().parent / "fixtures/note_rules_cases.json").read_text()
    )["path"]
    for case in cases:
        normalized = case.get("normalized")
        if not isinstance(normalized, str):
            continue  # entradas no-cadena (5, None): no hay forma normalizada que validar
        try:
            normalized.encode("utf-8")
        except UnicodeEncodeError:
            continue  # sustitutos sueltos: `check_path` los rechaza aparte; un patrón regex no lo expresa
        last = normalized.split("/")[-1]
        if note_rules.path_key(last) == ".md" and last.casefold() != ".md":
            # `.ｍｄ`/`．md` (anchos completos): el servidor las equipara a `.md` por NFKC (L4, Converge 1); un patrón
            # regex no puede expresar NFKC, así que el esquema sólo cubre la forma literal y la regla lo completa.
            assert note_rules.check_path(normalized) == "validation-error:path"
            continue
        by_schema = len(normalized) <= max_len and re.match(pattern, normalized) is not None
        by_rule = note_rules.check_path(normalized) is None
        assert by_schema == by_rule, (repr(normalized), by_schema, by_rule)


def test_rf_006_the_rev_pattern_bounds_the_generation_like_the_push():
    # El push acota la generación de `_rev` (H-2): el contrato no puede prometer más. El
    # patrón del servidor lleva grupos de captura; el del esquema es el mismo sin ellos.
    server = sync_push._REV.pattern.replace("(", "").replace(")", "")
    schema = SCHEMA["properties"]["_rev"]["pattern"]
    assert schema == f"^{server}$"
    assert re.search(schema, "1" * 16 + "-abc") and not re.search(schema, "1" * 17 + "-abc")
