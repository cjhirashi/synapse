"""Esquemas de entrada de bóvedas (SPEC-0003): límites, normalización y campos permitidos.

Son tests unitarios del núcleo: no necesitan CouchDB ni la app.
"""
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.schemas import VaultCreate, VaultOut, VaultUpdate


def _error_types(exc: ValidationError) -> set[str]:
    return {e["type"] for e in exc.errors()}


# --- RF-005: límites ---

@pytest.mark.parametrize("name", ["a", "a" * 100, "  " + "a" * 100 + "  "])
def test_rf_005_name_within_limits_is_accepted(name):
    assert VaultCreate(name=name).name == name.strip()


@pytest.mark.parametrize("name", ["", "   ", "a" * 101])
def test_rf_005_name_out_of_limits_after_strip_is_rejected(name):
    with pytest.raises(ValidationError):
        VaultCreate(name=name)


# SPEC-0003 enmienda 1 (E2): ningún carácter de control (categoría Unicode `Cc`).
@pytest.mark.parametrize("name", ["a\x00b", "uno\ndos", "a\tb", "a\x7fb", "a\x85b", "a\x1bb"])
@pytest.mark.parametrize("schema", [VaultCreate, VaultUpdate])
def test_rf_005_name_with_control_characters_is_rejected(schema, name):
    with pytest.raises(ValidationError) as exc:
        schema(name=name)
    assert _error_types(exc.value) == {"control_characters"}


def test_rf_005_surrounding_whitespace_controls_are_stripped_not_rejected():
    # Se quita el espacio de los extremos antes de comprobar (RF-006).
    assert VaultCreate(name="\tNotas\n").name == "Notas"


@pytest.mark.parametrize("name", ["Straße", "Notas · 2026", "ﬁcha", "名前", "a\u200db"])
def test_rf_005_other_unicode_names_are_accepted(name):
    assert VaultCreate(name=name).name == name


def test_rf_005_name_is_required():
    with pytest.raises(ValidationError) as exc:
        VaultCreate()
    assert _error_types(exc.value) == {"missing"}


def test_rf_005_description_up_to_2000_characters():
    assert len(VaultCreate(name="n", description="d" * 2000).description) == 2000
    with pytest.raises(ValidationError):
        VaultCreate(name="n", description="d" * 2001)


def test_rf_005_at_most_20_tags():
    assert len(VaultCreate(name="n", tags=[f"t{i}" for i in range(20)]).tags) == 20
    with pytest.raises(ValidationError):
        VaultCreate(name="n", tags=[f"t{i}" for i in range(21)])


@pytest.mark.parametrize("tag", ["", "   ", "t" * 33])
def test_rf_005_each_tag_has_1_to_32_characters(tag):
    with pytest.raises(ValidationError):
        VaultCreate(name="n", tags=[tag])
    assert VaultCreate(name="n", tags=["t" * 32]).tags == ["t" * 32]


# --- RF-006: normalización ---

def test_rf_006_name_is_stripped():
    assert VaultCreate(name="  Notas  ").name == "Notas"


def test_rf_006_tags_are_lowercased_and_deduplicated_keeping_order():
    vault = VaultCreate(name="n", tags=[" Work ", "home", "WORK", "Home", "misc"])
    assert vault.tags == ["work", "home", "misc"]


def test_rf_006_defaults_are_empty():
    vault = VaultCreate(name="n")
    assert vault.description is None and vault.tags == []


# --- RF-023: sólo name, description y tags ---

@pytest.mark.parametrize("field", ["owner_id", "id", "deleted_at", "created_at"])
@pytest.mark.parametrize("schema", [VaultCreate, VaultUpdate])
def test_rf_023_unknown_fields_are_rejected(schema, field):
    with pytest.raises(ValidationError) as exc:
        schema(name="n", **{field: "x"})
    assert _error_types(exc.value) == {"extra_forbidden"}


# --- RF-009: PATCH aplica sólo lo enviado ---

def test_rf_009_update_marks_only_sent_fields():
    assert VaultUpdate(description="d").model_dump(exclude_unset=True) == {"description": "d"}
    assert VaultUpdate().model_dump(exclude_unset=True) == {}


def test_rf_009_update_null_description_clears_it():
    assert VaultUpdate(description=None).model_dump(exclude_unset=True) == {"description": None}


@pytest.mark.parametrize("field", ["name", "tags"])
def test_rf_009_update_null_name_or_tags_is_rejected(field):
    with pytest.raises(ValidationError):
        VaultUpdate(**{field: None})


def test_rf_009_update_applies_the_same_rules_as_create():
    update = VaultUpdate(name="  Notas ", tags=["A", "a"])
    assert update.name == "Notas" and update.tags == ["a"]
    with pytest.raises(ValidationError):
        VaultUpdate(name="a" * 101)


# --- RF-012 (SPEC-0009): `icon`, `glifo[:color]` ASCII de hasta 64 caracteres ---
# La batería de casos vive en `fixtures/vault_rules_cases.json` (la recorre test_sync_rules_mirror);
# aquí se fija el comportamiento de los esquemas REST y los ejemplos del contrato de 0009.

_ICON_CONTRACT = (
    Path(__file__).parents[2]
    / ".harness/specs/0009-rediseno-visual-workspace/contracts/vault-icon.schema.json"
)
_ICON_EXAMPLES = json.loads(_ICON_CONTRACT.read_text())["oneOf"][1]["examples"]


@pytest.mark.parametrize("icon", [*_ICON_EXAMPLES, "initials", None])
def test_rf_012_create_and_update_accept_a_valid_icon(icon):
    assert VaultCreate(name="n", icon=icon).icon == icon
    assert VaultUpdate(icon=icon).icon == icon


@pytest.mark.parametrize("icon", ["", "a" * 65, "Folder", "a::b", "a_b", "<svg>", 1, []])
@pytest.mark.parametrize("schema", [VaultCreate, VaultUpdate])
def test_rf_012_an_invalid_icon_is_rejected(schema, icon):
    with pytest.raises(ValidationError) as exc:
        schema(name="n", icon=icon)
    assert {e["loc"] for e in exc.value.errors()} == {("icon",)}


def test_rf_012_icon_is_optional_and_unset_is_distinguishable_from_null():
    assert VaultCreate(name="n").icon is None
    assert "icon" not in VaultUpdate(name="n").model_dump(exclude_unset=True)
    # `null` explícito borra la elección (como `description`).
    assert VaultUpdate(icon=None).model_dump(exclude_unset=True) == {"icon": None}


def test_rf_012_vault_out_publishes_icon_as_required_and_nullable():
    base = dict(id="i", name="n", description=None, tags=[], owner_id="o",
                created_at="t", updated_at="t", deleted_at=None)
    assert VaultOut(**base, icon="folder:info").icon == "folder:info"
    assert VaultOut(**base, icon=None).icon is None
    with pytest.raises(ValidationError):
        VaultOut(**base)
