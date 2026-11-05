"""H-030b, reglas puras: bitácora (qué se registra, nombres y texto del día), plantillas, skill de cajón y
nombres canónicos en MAYÚSCULAS de las carpetas reservadas."""
from datetime import UTC, datetime

import pytest

from app.core import ag_rules, bitacora_rules as bit, meta_rules, plantilla_rules as pl
from app.core.attribute_rules import validate_general

TZ = "America/Mexico_City"


def note(path="Doc.md", content="a", fm=None, deleted=None):
    return {"_id": "note:v:n", "path": path, "content": content, "frontmatter": fm if fm is not None else {}, "deleted_at": deleted}


# --- Nombres canónicos (MAYÚSCULAS) ---

@pytest.mark.parametrize("path", ["Plantillas/x.md", "plantillas/x.md", "Bitacora/2026-11/a.md", "ag - skills/x.md", "Ag - Mensajes/x.md"])
def test_reserved_folder_must_be_written_in_canonical_case(path):
    assert ag_rules.check_create(path) == "meta-folder:case"


@pytest.mark.parametrize("path", ["PLANTILLAS/x.md", "BITACORA/x.md", "AG - SKILLS/x.md", "Plantillas.md", "Otra/Plantillas/x.md", "PLANTILLAS-2/x.md"])
def test_canonical_or_unrelated_paths_pass_the_case_rule(path):
    assert ag_rules.check_create(path) is None


def test_legacy_folder_may_only_be_renamed_to_its_canonical_form():
    assert ag_rules.check_folder_move("Plantillas", "PLANTILLAS") is None
    assert ag_rules.check_folder_move("Plantillas", "Otra") == "meta-folder:rename"
    assert ag_rules.check_folder_move("PLANTILLAS", "Otra") == "meta-folder:rename"
    assert ag_rules.check_folder_move("PLANTILLAS", "PLANTILLAS") == "meta-folder:rename"
    assert ag_rules.check_folder_move("Cualquiera", "Otra") is None


# --- Qué se registra (P7) ---

def test_classify_basic_operations():
    assert bit.classify(None, note()) == "create"
    assert bit.classify(note(), note(content="b")) == "edit"
    assert bit.classify(note(fm={"tags": ["x"]}), note(fm={"tags": ["y"]})) == "edit"
    assert bit.classify(note("A/x.md"), note("A/y.md")) == "rename"
    assert bit.classify(note("A/x.md"), note("B/x.md")) == "move"
    assert bit.classify(note(), note(deleted="2026-11-05T00:00:00.000000Z")) == "delete"
    assert bit.classify(note(deleted="2026-11-05T00:00:00.000000Z"), note()) == "restore"


def test_a_change_that_only_touches_the_update_date_is_not_logged():
    old = note(fm={"titulo": "T", "fecha_actualizacion": "2026-11-04"})
    new = note(fm={"titulo": "T", "fecha_actualizacion": "2026-11-05"})
    assert bit.classify(old, new) is None


def test_indexes_are_not_logged_unless_their_description_is_edited():
    assert bit.classify(None, note("A/INDICE.md", "")) is None
    assert bit.classify(note("A/INDICE.md", ""), note("B/INDICE.md", "")) is None
    assert bit.classify(note("A/INDICE.md", "", {"descripcion": "x"}), note("A/INDICE.md", "", {"descripcion": "y"})) == "edit"
    assert bit.classify(note("A/INDICE.md", ""), note("A/INDICE.md", "", {"fecha_actualizacion": "2026-11-05"})) is None


def test_writes_inside_bitacora_are_not_logged():
    assert bit.classify(None, note("BITACORA/2026-11/2026-11-05.md")) is None
    assert bit.classify(note("BITACORA/2026-11/2026-11-05.md"), note("BITACORA/2026-11/2026-11-05.md", "z")) is None


# --- Nombres y texto del día ---

def test_day_path_and_parse():
    assert bit.day_path("2026-11-05") == "BITACORA/2026-11/2026-11-05.md"
    assert bit.parse_day_path("BITACORA/2026-11/2026-11-05.md") == "2026-11-05"
    for bad in ("BITACORA/2026-11/2026-12-05.md", "BITACORA/2026-11/2026-11-31.md", "BITACORA/INDICE.md", "x/2026-11/2026-11-05.md"):
        assert bit.parse_day_path(bad) is None


def test_day_boundaries_use_the_owner_time_zone():
    # 2026-11-05 03:30 UTC es 2026-11-04 21:30 en Ciudad de México (UTC-6 en noviembre).
    at = datetime(2026, 11, 5, 3, 30, tzinfo=UTC)
    assert bit.local_date(at, TZ) == "2026-11-04"
    assert bit.local_date(at, "UTC") == "2026-11-05"
    start, end = bit.utc_bounds("2026-11-04", TZ)
    assert start == datetime(2026, 11, 4, 6, 0, tzinfo=UTC) and end == datetime(2026, 11, 5, 6, 0, tzinfo=UTC)
    assert start <= at < end


def test_render_day_lists_entries_in_order_with_local_time_and_escapes_backticks():
    entries = [
        bit.Entry(datetime(2026, 11, 5, 20, 0, tzinfo=UTC), "rename", "A/nuevo.md", "A/viejo.md", "Nuevo", "agent", "aira", "applied"),
        bit.Entry(datetime(2026, 11, 5, 18, 0, 5, tzinfo=UTC), "edit", "A/`raro`.md", None, None, "human", "carlos@x.com", "applied"),
        bit.Entry(datetime(2026, 11, 5, 21, 0, tzinfo=UTC), "create", "B.md", None, "B", "general", "clave general op", "pending"),
    ]
    text = bit.render_day("2026-11-05", TZ, entries)
    lines = [l for l in text.splitlines() if l.startswith("- ")]
    assert lines[0].startswith("- **12:00:05** · carlos@x.com (usuario) · edición · ``A/`raro`.md``")
    assert "renombre «Nuevo» · antes `A/viejo.md`, ahora `A/nuevo.md`" in lines[1]
    assert lines[2].endswith("[sin confirmar]")
    assert "3 cambios." in text and "America/Mexico_City" in text


def test_render_empty_day():
    assert "Sin cambios registrados." in bit.render_day("2026-11-05", TZ, [])


# --- Reglas de escritura META ---

def test_bitacora_is_read_only_for_everyone():
    for kind in ("human", "agent", "general"):
        assert meta_rules.check_note_write(path="BITACORA/2026-11/2026-11-05.md", actor_kind=kind) == "bitacora:readonly"
        assert meta_rules.check_note_write(path="Otra/x.md", prev_path="BITACORA/2026-11/2026-11-05.md", actor_kind=kind) == "bitacora:readonly"
        assert meta_rules.check_note_write(path="BITACORA/2026-11/2026-11-05.md", deleted=True, actor_kind=kind) == "bitacora:readonly"
    assert meta_rules.check_note_write(path="BITACORA/2026-11/INDICE.md") is None  # los INDICES siguen H-031
    assert meta_rules.check_note_write(path="BITACORA.md") is None


def test_skill_cajon_is_only_editable_by_a_human_session():
    path = "AG - SKILLS/skill-bovedas-synapse.md"
    assert meta_rules.check_note_write(path=path, prev_path=path, actor_kind="human") is None
    for kind in ("agent", "general"):
        assert meta_rules.check_note_write(path=path, prev_path=path, actor_kind=kind) == "skill-cajon:human-only"
        assert meta_rules.check_note_write(path=path, deleted=True, actor_kind=kind) == "skill-cajon:human-only"
    assert meta_rules.check_note_write(path="AG - SKILLS/skill-otra.md", actor_kind="agent") is None
    assert meta_rules.check_note_write(path="ag - skills/SKILL-bovedas-synapse.md", actor_kind="agent") == "skill-cajon:human-only"


GOOD = {"alcance": ["*"], "atributos": [{"nombre": "cliente", "tipo": "texto"}], "estilo": {"publicar": {}, "pdf": {}}}


def test_template_path_must_be_flat_and_prefixed():
    ok = "PLANTILLAS/plantilla-base.md"
    assert pl.template_name(ok) == "base"
    for bad in ("PLANTILLAS/base.md", "PLANTILLAS/sub/plantilla-base.md", "PLANTILLAS/plantilla-.md", "PLANTILLAS/plantilla-Base.md",
                "PLANTILLAS/plantilla-a_b.md", "PLANTILLAS/plantilla-base.txt"):
        assert meta_rules.check_note_write(path=bad, frontmatter=GOOD) == "plantilla:path", bad
    assert meta_rules.check_note_write(path=ok, frontmatter=GOOD) is None
    assert meta_rules.check_note_write(path="PLANTILLAS/INDICE.md", frontmatter={}) is None


@pytest.mark.parametrize("changes,code", [
    ({"alcance": []}, "plantilla:alcance"),
    ({"alcance": ["*", "A"]}, "plantilla:alcance"),
    ({"alcance": "*"}, "plantilla:alcance"),
    ({"alcance": ["A//B"]}, "plantilla:alcance"),
    ({"atributos": [{"nombre": "Cliente", "tipo": "texto"}]}, "plantilla:atributos"),
    ({"atributos": [{"nombre": "titulo", "tipo": "texto"}]}, "plantilla:atributos"),
    ({"atributos": [{"nombre": "a", "tipo": "otro"}]}, "plantilla:atributos"),
    ({"atributos": [{"nombre": "a", "tipo": "numero", "valor": "x"}]}, "plantilla:atributos"),
    ({"atributos": [{"nombre": "a", "tipo": "texto"}, {"nombre": "a", "tipo": "texto"}]}, "plantilla:atributos"),
    ({"estilo": {"publicar": {"tema": "x"}}}, "plantilla:estilo"),
    ({"estilo": {"otro": {}}}, "plantilla:estilo"),
    ({"estilo": []}, "plantilla:estilo"),
])
def test_template_definition_is_validated_by_shape(changes, code):
    assert pl.check_definition({**GOOD, **changes}) == code


def test_template_definition_defaults_and_values():
    assert pl.check_definition({"alcance": ["Proyectos/Notas", "Otra"]}) is None
    full = {"alcance": ["*"], "atributos": [
        {"nombre": "a", "tipo": "texto", "valor": "x"}, {"nombre": "b", "tipo": "numero", "valor": 3},
        {"nombre": "c", "tipo": "fecha", "valor": "2026-11-05"}, {"nombre": "d", "tipo": "lista", "valor": ["x"]},
        {"nombre": "e", "tipo": "booleano", "valor": True}, {"nombre": "f", "tipo": "texto", "valor": None}]}
    assert pl.check_definition(full) is None


def test_template_scope():
    assert pl.applies_to(["*"], "Cualquiera/Sub")
    assert pl.applies_to(["Proyectos"], "Proyectos") and pl.applies_to(["Proyectos"], "proyectos/Sub")
    assert not pl.applies_to(["Proyectos"], "Otros") and not pl.applies_to(["Proyectos"], "")


def test_plantilla_reference_attribute():
    assert validate_general({"plantilla": "base"}) is None
    for bad in ("Base", "a_b", "", 3, None, "x" * 65, "-a"):
        assert validate_general({"plantilla": bad}) == "plantilla", bad


# --- Especificación compartida con el cliente (tests/fixtures/plantilla_reglas.json) ---

import json
from pathlib import Path

SPEC = json.loads((Path(__file__).parent / "fixtures" / "plantilla_reglas.json").read_text())


@pytest.mark.parametrize("case", SPEC["definition"], ids=lambda c: c["name"])
def test_spec_definition(case):
    assert pl.check_definition(case["frontmatter"]) == case["expected"]


@pytest.mark.parametrize("case", SPEC["template_name"], ids=lambda c: c["path"])
def test_spec_template_name(case):
    assert pl.template_name(case["path"]) == case["expected"]


@pytest.mark.parametrize("case", SPEC["plantilla_ref"], ids=lambda c: repr(c["value"])[:20])
def test_spec_plantilla_ref(case):
    assert validate_general({"plantilla": case["value"]}) == case["expected"]


@pytest.mark.parametrize("case", SPEC["reserved_case"], ids=lambda c: c["path"])
def test_spec_reserved_case(case):
    assert ag_rules.check_create(case["path"]) == case["expected"]


@pytest.mark.parametrize("case", SPEC["folder_move"], ids=lambda c: f'{c["from"]}->{c["to"]}')
def test_spec_folder_move(case):
    assert ag_rules.check_folder_move(case["from"], case["to"]) == case["expected"]


@pytest.mark.parametrize("case", SPEC["note_write"], ids=lambda c: f'{c["path"]}|{c["actor"]}|{c["deleted"]}')
def test_spec_note_write(case):
    got = meta_rules.check_note_write(
        path=case["path"], prev_path=case["prev_path"], deleted=case["deleted"], frontmatter=case["frontmatter"],
        actor_kind=case["actor"])
    assert got == case["expected"]


@pytest.mark.parametrize("case", SPEC["applies_to"], ids=lambda c: f'{c["alcance"]}|{c["folder"]}')
def test_spec_applies_to(case):
    assert pl.applies_to(case["alcance"], case["folder"]) == case["expected"]
