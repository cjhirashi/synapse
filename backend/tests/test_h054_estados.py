"""H-054: el `estado` de un documento con plantilla solo se asigna entre los `estados` de su plantilla."""
import importlib.util
from pathlib import Path

from app.core import plantilla_rules
from tests.test_h030_api import detail, find, patch, post_note, vault_of
from tests.test_h030b_api import TEMPLATE, make_template, reasons
from tests.test_note_sync_api import note_doc, push, vault  # noqa: F401
from tests.test_sync_api import child_of

ESTADOS = [{"nombre": "borrador", "color": "gris"}, {"nombre": "aprobado", "color": "verde"}]


def item(client, vault_id, path):
    found = find(client, vault_id, path)
    return {"id": found["id"], "etag": found["etag"]}


def test_a_state_outside_the_template_is_rejected_when_assigned_over_rest(ready_admin):
    vault_id = vault_of(ready_admin)
    assert make_template(ready_admin, vault_id, estados=ESTADOS).status_code == 201
    assert post_note(ready_admin, vault_id, "Ok.md", "", {"plantilla": "base", "estado": "aprobado"}).status_code == 201
    assert post_note(ready_admin, vault_id, "Sin.md", "", {"plantilla": "base"}).status_code == 201
    bad = post_note(ready_admin, vault_id, "Mal.md", "", {"plantilla": "base", "estado": "cerrado"})
    assert bad.status_code == 422 and detail(bad) == "plantilla:estado"
    # Sin plantilla el estado es libre.
    assert post_note(ready_admin, vault_id, "Libre.md", "", {"estado": "cerrado"}).status_code == 201


def test_only_assigning_or_reassigning_a_state_is_checked_so_existing_documents_stay_editable(ready_admin):
    vault_id = vault_of(ready_admin)
    assert make_template(ready_admin, vault_id, estados=ESTADOS).status_code == 201
    assert post_note(ready_admin, vault_id, "Doc.md", "", {"plantilla": "base", "estado": "aprobado"}).status_code == 201
    # La plantilla pierde «aprobado»: el documento queda con un estado ajeno.
    template = item(ready_admin, vault_id, "PLANTILLAS/plantilla-base.md")
    assert patch(ready_admin, vault_id, template, frontmatter={**TEMPLATE, "estados": ESTADOS[:1]}).status_code == 200
    doc = item(ready_admin, vault_id, "Doc.md")
    fm = {"plantilla": "base", "estado": "aprobado"}
    assert patch(ready_admin, vault_id, doc, content="Texto nuevo", frontmatter=fm).status_code == 200  # no cambia el estado
    doc = item(ready_admin, vault_id, "Doc.md")
    assert detail(patch(ready_admin, vault_id, doc, frontmatter={"plantilla": "base", "estado": "cancelado"})) == "plantilla:estado"
    assert patch(ready_admin, vault_id, doc, frontmatter={"plantilla": "base", "estado": "borrador"}).status_code == 200
    doc = item(ready_admin, vault_id, "Doc.md")
    assert patch(ready_admin, vault_id, doc, frontmatter={"plantilla": "base"}).status_code == 200  # sin estado siempre vale


def test_a_template_without_states_leaves_its_documents_without_a_state(ready_admin):
    vault_id = vault_of(ready_admin)
    assert make_template(ready_admin, vault_id).status_code == 201
    bad = post_note(ready_admin, vault_id, "Doc.md", "", {"plantilla": "base", "estado": "borrador"})
    assert detail(bad) == "plantilla:estado"


def test_assigning_a_template_to_a_document_with_a_foreign_state_is_rejected(ready_admin):
    vault_id = vault_of(ready_admin)
    assert make_template(ready_admin, vault_id, estados=ESTADOS).status_code == 201
    assert post_note(ready_admin, vault_id, "Doc.md", "", {"estado": "cerrado"}).status_code == 201
    doc = item(ready_admin, vault_id, "Doc.md")
    assert detail(patch(ready_admin, vault_id, doc, frontmatter={"plantilla": "base", "estado": "cerrado"})) == "plantilla:estado"
    assert patch(ready_admin, vault_id, doc, frontmatter={"plantilla": "base"}).status_code == 200


def test_the_same_rule_applies_over_sync(vault, ready_admin):
    vault_id = vault["id"]
    template = note_doc(vault_id, path="PLANTILLAS/plantilla-base.md", frontmatter={**TEMPLATE, "estados": ESTADOS})
    assert push(ready_admin, [template]).json() == []
    ok = note_doc(vault_id, path="Ok.md", frontmatter={"plantilla": "base", "estado": "borrador"})
    assert push(ready_admin, [ok]).json() == []
    bad = note_doc(vault_id, path="Mal.md", frontmatter={"plantilla": "base", "estado": "cerrado"})
    assert reasons(push(ready_admin, [bad])) == ["plantilla:estado"]
    # Editar el cuerpo de un documento sin tocar su estado no se valida.
    assert push(ready_admin, [child_of(ok, content="otro")]).json() == []


def test_estado_names_accepts_objects_and_the_old_plain_text():
    assert plantilla_rules.estado_names(ESTADOS) == ["borrador", "aprobado"]
    assert plantilla_rules.estado_names(["a", {"nombre": "b", "color": "azul"}, 3, {"x": 1}]) == ["a", "b"]
    assert plantilla_rules.estado_names(None) == []


def test_the_cleanup_script_finds_only_documents_with_a_foreign_state():
    path = Path(__file__).resolve().parents[1] / "scripts" / "clear_invalid_estados.py"
    spec = importlib.util.spec_from_file_location("clear_invalid_estados", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    notes = [
        {"path": "PLANTILLAS/plantilla-acta.md", "frontmatter": {"estados": ESTADOS}},
        {"path": "A.md", "frontmatter": {"plantilla": "acta", "estado": "aprobado"}},
        {"path": "B.md", "frontmatter": {"plantilla": "acta", "estado": "cerrado"}},
        {"path": "C.md", "frontmatter": {"plantilla": "acta"}},
        {"path": "D.md", "frontmatter": {"estado": "cerrado"}},
        {"path": "E.md", "frontmatter": {"plantilla": "borrada", "estado": "cerrado"}},
        {"path": "AG - SKILLS/skill-x.md", "frontmatter": {"plantilla": "acta", "estado": "archivado"}},
    ]
    assert [(n["path"], ref, estado) for n, ref, estado in module.invalid(notes)] == [("B.md", "acta", "cerrado")]
