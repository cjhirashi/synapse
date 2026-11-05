"""H-041 E2: nombres canónicos de skills y plantillas. Reglas puras sobre la especificación compartida
`fixtures/nombres_reglas.json` (el cliente también la recorre)."""
import json
from pathlib import Path

import pytest

from app.core import doc_names, plantilla_rules

SPEC = json.loads((Path(__file__).parent / "fixtures" / "nombres_reglas.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", SPEC["names"], ids=lambda c: c["raw"][:30] or "vacío")
def test_spec_names(case):
    raw = doc_names._strip_ext(case["raw"])
    assert doc_names.canonical_base(raw, doc_names.SKILL_PREFIX, SPEC["limits"]["skill_base_max"] - 6) == case["skill"]
    assert doc_names.canonical_base(raw, doc_names.PLANTILLA_PREFIX, SPEC["limits"]["plantilla_rest_max"]) == case["plantilla"]


@pytest.mark.parametrize("case", SPEC["paths"], ids=lambda c: c["path"][:50])
def test_spec_paths(case):
    assert doc_names.canonical_path(case["path"]) == (case["expected"], case["error"])


@pytest.mark.parametrize("case", SPEC["canonical"], ids=lambda c: c["path"][:50])
def test_spec_canonical(case):
    assert doc_names.is_canonical(case["path"]) == case["expected"]


def test_the_limits_in_the_spec_match_the_code():
    assert SPEC["limits"] == {"skill_base_max": doc_names.SKILL_BASE_MAX, "plantilla_rest_max": plantilla_rules.PLANTILLA_NAME_MAX
                              if hasattr(plantilla_rules, "PLANTILLA_NAME_MAX") else doc_names.PLANTILLA_NAME_MAX}


@pytest.mark.parametrize("raw", ["gestión de variables", "Ünïcödé ñandú", "x.y.z", "a" * 58, "skill-" + "b" * 58])
def test_a_canonical_skill_name_is_valid_for_openclaw_and_idempotent(raw):
    base = doc_names.canonical_base(raw, "skill-", 58)
    assert base is not None and len(base) <= 64 and base == base.lower() and base.isascii()
    assert all(c.isalnum() or c == "-" for c in base) and "--" not in base and not base.endswith("-")
    assert doc_names.canonical_base(base, "skill-", 58) == base  # normalizar dos veces no cambia nada


@pytest.mark.parametrize("raw", ["Acta final", "plantilla-acta", "Ñandú"])
def test_a_canonical_template_name_is_one_plantilla_rules_accepts(raw):
    base = doc_names.canonical_base(raw, "plantilla-", 64)
    assert plantilla_rules.template_name(f"PLANTILLAS/{base}.md") == base[len("plantilla-"):]


# --- REST y /sync de punta a punta (TestClient + CouchDB real) ---

from app.routers.vaults import get_vault_port  # noqa: E402
from tests.test_h030_api import agent_client, detail, find, patch, post_note, vault_of  # noqa: E402
from tests.test_h030b_api import TEMPLATE  # noqa: E402
from tests.test_h041_system import _legacy  # noqa: E402
from tests.test_note_sync_api import note_doc, push, vault  # noqa: E402,F401
from tests.test_vaults_api import user_db  # noqa: E402

SK = "AG - SKILLS"


def paths_of(client, vault_id) -> set[str]:
    return {i["path"] for i in client.get(f"/vaults/{vault_id}/notes", params={"limit": 200}).json()["items"]}


def test_rest_structures_the_skill_name_and_returns_the_final_path(ready_admin):
    vault_id = vault_of(ready_admin)
    created = post_note(ready_admin, vault_id, f"{SK}/Gestión de variables", "# Paso 1")
    assert created.status_code == 201 and created.json()["path"] == f"{SK}/skill-gestion-de-variables.md"
    assert f"{SK}/skill-gestion-de-variables.md" in paths_of(ready_admin, vault_id)
    # El prefijo no se duplica y el espacio, los acentos y las mayúsculas se normalizan.
    assert post_note(ready_admin, vault_id, f"{SK}/Skill - Revisión Final.MD", "x").json()["path"] == f"{SK}/skill-revision-final.md"
    # El agente recibe lo mismo (la normalización es del servidor, no del cliente que escribe).
    aira = agent_client(ready_admin, "aira")
    assert post_note(aira, vault_id, f"{SK}/Diseño ñandú", "x").json()["path"] == f"{SK}/skill-diseno-nandu.md"


def test_a_name_that_collides_after_normalizing_is_rejected_not_suffixed(ready_admin):
    vault_id = vault_of(ready_admin)
    assert post_note(ready_admin, vault_id, f"{SK}/Gestión de variables", "x").status_code == 201
    for spelling in ("gestion-de-variables", "GESTIÓN   DE   VARIABLES", "skill-gestion-de-variables.md"):
        assert post_note(ready_admin, vault_id, f"{SK}/{spelling}", "x").status_code == 409, spelling
    assert sorted(i for i in paths_of(ready_admin, vault_id) if "/" in i and i.startswith(SK) and "INDICE" not in i) == [
        f"{SK}/skill-gestion-de-variables.md"]


@pytest.mark.parametrize("path,code", [
    (f"{SK}/漢字.md", "skill:name"), (f"{SK}/!!!", "skill:name"), (f"{SK}/skill", "skill:name"),
    (f"{SK}/" + "a" * 59, "skill:name"), (f"{SK}/sub/otra", "skill:path"), (f"{SK}/sub/skill-otra.md", "skill:path")])
def test_invalid_skill_names_and_subfolders_are_rejected(ready_admin, path, code):
    res = post_note(ready_admin, vault_of(ready_admin), path, "x")
    assert res.status_code == 422 and detail(res) == code


def test_a_skill_name_at_the_limit_is_accepted(ready_admin):
    vault_id = vault_of(ready_admin)
    res = post_note(ready_admin, vault_id, f"{SK}/" + "a" * 58, "x")
    assert res.status_code == 201 and len(res.json()["path"].split("/")[1][:-3]) == 64


def test_rest_structures_the_template_name_too(ready_admin):
    vault_id = vault_of(ready_admin)
    created = post_note(ready_admin, vault_id, "PLANTILLAS/Acta Final", "# x", TEMPLATE)
    assert created.status_code == 201 and created.json()["path"] == "PLANTILLAS/plantilla-acta-final.md"
    assert detail(post_note(ready_admin, vault_id, "PLANTILLAS/sub/Acta", "# x", TEMPLATE)) == "plantilla:path"
    assert detail(post_note(ready_admin, vault_id, "PLANTILLAS/!!!", "# x", TEMPLATE)) == "plantilla:path"


def test_renaming_or_moving_into_skills_structures_the_name_and_leaving_does_not(ready_admin):
    vault_id = vault_of(ready_admin)
    note = post_note(ready_admin, vault_id, "Notas/Mi doc.md", "x")
    item = {"id": note.json()["id"], "etag": note.headers["ETag"]}
    moved = patch(ready_admin, vault_id, item, path=f"{SK}/Mi doc.md")
    assert moved.status_code == 200 and moved.json()["path"] == f"{SK}/skill-mi-doc.md"
    item["etag"] = moved.headers["ETag"]
    renamed = patch(ready_admin, vault_id, item, path=f"{SK}/Otro Nombre.md")
    assert renamed.json()["path"] == f"{SK}/skill-otro-nombre.md"
    item["etag"] = renamed.headers["ETag"]
    out = patch(ready_admin, vault_id, item, path="Notas/Libre Otra Vez.md")
    assert out.status_code == 200 and out.json()["path"] == "Notas/Libre Otra Vez.md"


def test_a_name_that_normalizes_to_a_system_path_is_the_system_lock(ready_admin):
    vault_id = vault_of(ready_admin)
    res = post_note(ready_admin, vault_id, f"{SK}/Skill Bóvedas Synapse", "x")
    assert res.status_code == 422 and detail(res) == "sistema:readonly"


def test_an_old_non_canonical_skill_is_tolerated_until_it_is_renamed(ready_admin, db):
    vault_id = vault_of(ready_admin)
    note_id = _legacy(get_vault_port(), user_db(db), vault_id, f"{SK}/aira/vieja.md", "uno", {"titulo": "vieja"})
    item = find(ready_admin, vault_id, f"{SK}/aira/vieja.md")
    assert item["id"] == note_id
    edited = patch(ready_admin, vault_id, item, content="dos")  # editar el contenido no toca su ruta
    assert edited.status_code == 200 and edited.json()["path"] == f"{SK}/aira/vieja.md"
    item["etag"] = edited.headers["ETag"]
    res = patch(ready_admin, vault_id, item, path=f"{SK}/aira/otra.md")  # pero al renombrar se exige la forma canónica
    assert res.status_code == 422 and detail(res) == "skill:path"


def test_sync_rejects_skills_that_are_not_canonical(vault, ready_admin):
    vault_id = vault["id"]

    def reasons(res):
        assert res.status_code == 201, res.text
        return [r["reason"] for r in res.json()]

    assert reasons(push(ready_admin, [note_doc(vault_id, path=f"{SK}/gestion.md")])) == ["skill:name"]
    assert reasons(push(ready_admin, [note_doc(vault_id, path=f"{SK}/skill-Gestion.md")])) == ["skill:name"]
    assert reasons(push(ready_admin, [note_doc(vault_id, path=f"{SK}/skill-gestión.md")])) == ["skill:name"]
    assert reasons(push(ready_admin, [note_doc(vault_id, path=f"{SK}/sub/skill-a.md")])) == ["skill:path"]
    assert push(ready_admin, [note_doc(vault_id, path=f"{SK}/skill-gestion.md")]).json() == []
    assert push(ready_admin, [note_doc(vault_id, path=f"{SK}/INDICE.md", content="")]).json() == []
    assert push(ready_admin, [note_doc(vault_id, path="Notas/Cualquier Nombre.md")]).json() == []


def test_a_folder_move_into_skills_does_not_rename_notes_so_it_rejects_non_canonical_names(ready_admin):
    vault_id = vault_of(ready_admin)
    assert post_note(ready_admin, vault_id, "Pendiente/Mi doc.md", "x").status_code == 201
    res = ready_admin.post(f"/vaults/{vault_id}/folders/move", json={"from": "Pendiente", "to": SK})
    assert res.status_code == 422 and detail(res) == "skill:name"
    assert post_note(ready_admin, vault_id, "Listas/skill-ok.md", "x").status_code == 201
    assert ready_admin.post(f"/vaults/{vault_id}/folders/move", json={"from": "Listas", "to": SK}).status_code == 200
    assert f"{SK}/skill-ok.md" in paths_of(ready_admin, vault_id)
