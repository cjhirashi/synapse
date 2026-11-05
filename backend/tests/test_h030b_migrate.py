"""H-030b: herramienta `scripts/h030b_migrate.py` (en seco, aplicar y revertir) sobre CouchDB real."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import h030b_migrate as migrate  # noqa: E402
from app.core import plantilla_rules as pl  # noqa: E402
from app.core.note_rules import check_frontmatter  # noqa: E402
from app.routers.vaults import get_vault_port  # noqa: E402
from tests.test_h030_api import find, post_note  # noqa: E402
from tests.test_vaults_api import create, user_db  # noqa: E402


def test_slug_of_legacy_template_names():
    assert migrate.slug("1 - PL - Base.md") == "base"
    assert migrate.slug("Plantilla - Cover Letter.md") == "cover-letter"
    assert migrate.slug("Plantilla — Claude Code.md") == "claude-code"
    assert migrate.slug("Documento Base.md") == "documento-base"
    assert migrate.slug("Plantilla - Investigación Trabajo.md") == "investigacion-trabajo"


def test_legacy_frontmatter_is_converted_to_a_valid_definition_without_loss():
    fm, avisos = migrate.convert_frontmatter({
        "titulo": "Plantilla - CV", "tipo": "Plantilla", "tags": ["plantilla"], "estado": "aprobado",
        "fecha_creacion": "2026-08-05", "fecha_inicio": "YYYY-MM-DD", "fecha_creado": None, "n": 3, "listo": True,
        "ruta": "x", "raro": {"a": 1}})
    assert pl.check_definition(fm) is None and check_frontmatter(fm) is None
    assert {k: fm[k] for k in ("titulo", "tags", "estado", "fecha_creacion")} == {
        "titulo": "Plantilla - CV", "tags": ["plantilla"], "estado": "aprobado", "fecha_creacion": "2026-08-05"}
    by_name = {a["nombre"]: a for a in fm["atributos"]}
    assert by_name["tipo"] == {"nombre": "tipo", "tipo": "texto", "valor": "Plantilla"}
    assert by_name["fecha_creado"] == {"nombre": "fecha_creado", "tipo": "texto"}
    assert by_name["n"]["tipo"] == "numero" and by_name["listo"]["tipo"] == "booleano"
    assert len(avisos) == 2  # `ruta` (la calcula el sistema) y el objeto anidado no caben como atributo


def test_dry_run_plans_conversions_and_reports_other_agents_folders():
    def doc(i, path, fm=None):
        return {"_id": f"note:v:{i}", "path": path, "content": "x", "frontmatter": fm or {}, "deleted_at": None}

    notes = [doc(1, "01 - PLANTILLAS/INDICE.md"), doc(2, "01 - PLANTILLAS/1 - PL - Base.md", {"titulo": "B"}),
             doc(3, "00- BITACORA/Bitácora - Cambios META.md"), doc(4, "00- BITACORA/INDICE.md"),
             doc(5, "02 PLANTILLAS/Otra.md"), doc(6, "Plantillas/INDICE.md"), doc(7, "BITACORA/INDICE.md")]
    plan = migrate.plan_vault("Proyectos", notes)
    assert {(m["doc"]["path"], m["new_path"]) for m in plan["moves"]} == {
        ("01 - PLANTILLAS/1 - PL - Base.md", "PLANTILLAS/plantilla-base.md"),
        ("00- BITACORA/Bitácora - Cambios META.md", "BITACORA/HISTORICO/Bitácora - Cambios META.md"),
        ("Plantillas/INDICE.md", "PLANTILLAS/INDICE.md")}
    assert [d["path"] for d in plan["trash"]] == ["00- BITACORA/INDICE.md", "01 - PLANTILLAS/INDICE.md"]
    assert plan["sin_tocar"] == ["02 PLANTILLAS"]
    assert not any(m.get("colision") for m in plan["moves"])


def test_two_legacy_templates_with_the_same_slug_collide():
    notes = [{"_id": "n1", "path": "01 - PLANTILLAS/Plantilla - Base.md", "frontmatter": {}, "content": ""},
             {"_id": "n2", "path": "01 - PLANTILLAS/1 - PL - Base.md", "frontmatter": {}, "content": ""}]
    assert any(m.get("colision") for m in migrate.plan_vault("Proyectos", notes)["moves"])


def test_apply_and_revert_on_real_couchdb(ready_admin, db):
    res = create(ready_admin, name="Proyectos")
    vault_id = res.json()["id"]
    for path, fm in [("01 - PLANTILLAS/1 - PL - Base.md", {"titulo": "PL - Base", "tipo": "Plantilla"}),
                     ("00- BITACORA/Bitácora - Cambios META.md", {"titulo": "Histórico"})]:
        assert post_note(ready_admin, vault_id, path, "cuerpo", fm).status_code == 201
    assert post_note(ready_admin, vault_id, "Otra/Doc.md", "ver [[1 - PL - Base]]").status_code == 201
    port, db_name = get_vault_port(), user_db(db)
    owner_id = db_name.removeprefix("synapse_user_")

    dry = migrate.run(port, db_name, owner_id, apply=False)
    entry = next(e for e in dry if e["vault_id"] == vault_id)
    assert {m["después"] for m in entry["mover"]} == {"PLANTILLAS/plantilla-base.md", "BITACORA/HISTORICO/Bitácora - Cambios META.md"}
    assert find(ready_admin, vault_id, "PLANTILLAS/plantilla-base.md") is None  # en seco no escribe

    applied = migrate.run(port, db_name, owner_id, apply=True)
    entry = next(e for e in applied if e["vault_id"] == vault_id)
    assert "error" not in entry and len(entry["respaldo"]) == 4  # 2 notas movidas + 2 INDICES a la papelera
    template = find(ready_admin, vault_id, "PLANTILLAS/plantilla-base.md")
    assert template["frontmatter"]["alcance"] == ["*"] and template["frontmatter"]["atributos"][0]["nombre"] == "tipo"
    assert find(ready_admin, vault_id, "01 - PLANTILLAS/1 - PL - Base.md") is None
    assert find(ready_admin, vault_id, "BITACORA/HISTORICO/Bitácora - Cambios META.md") is not None
    other = find(ready_admin, vault_id, "Otra/Doc.md")
    assert "[[plantilla-base]]" in ready_admin.get(f"/vaults/{vault_id}/notes/{other['id']}").json()["content"]
    assert find(ready_admin, vault_id, "BITACORA/HISTORICO/INDICE.md")["frontmatter"]["descripcion"]

    report = Path("/dev/shm/h030b-test-report.json") if Path("/dev/shm").exists() else Path("h030b-test-report.json")
    report.write_text(json.dumps([entry]))
    migrate.revert(str(report))
    assert find(ready_admin, vault_id, "01 - PLANTILLAS/1 - PL - Base.md") is not None
    assert find(ready_admin, vault_id, "PLANTILLAS/plantilla-base.md") is None
    assert find(ready_admin, vault_id, "00- BITACORA/INDICE.md") is not None
    report.unlink()
