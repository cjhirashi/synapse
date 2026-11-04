"""H-039: `PATCH .../notes/{id}` que cambia `path` reescribe los wikilinks de la bóveda (API real, CouchDB real)."""
import re

from tests.test_vaults_api import assert_problem, create


def post_note(client, vault_id, path, content="", **fields):
    res = client.post(f"/vaults/{vault_id}/notes", json={"path": path, "content": content, **fields})
    assert res.status_code == 201, res.text
    return res.json(), res.headers["etag"]


def get_note(client, vault_id, note_id):
    res = client.get(f"/vaults/{vault_id}/notes/{note_id}")
    assert res.status_code == 200, res.text
    return res.json(), res.headers["etag"]


def patch(client, vault_id, note_id, etag, **body):
    return client.patch(f"/vaults/{vault_id}/notes/{note_id}", json=body, headers={"If-Match": etag})


def test_renombrar_reescribe_enlaces_de_ruta_y_de_nombre_unico(ready_admin):
    vault = create(ready_admin).json()["id"]
    plan, etag = post_note(ready_admin, vault, "Proyectos/Plan.md", "# Plan")
    otra, otra_etag = post_note(ready_admin, vault, "Notas/Otra.md", "ver [[Proyectos/Plan.md|el plan]], [[Plan]] y [[Proyectos/Plan]]")
    ajena, ajena_etag = post_note(ready_admin, vault, "Notas/Ajena.md", "nada que ver [[Otra]]")

    res = patch(ready_admin, vault, plan["id"], etag, path="Archivo/Apunte.md")
    assert res.status_code == 200, res.text
    assert res.json()["path"] == "Archivo/Apunte.md"
    assert re.fullmatch(r"notes=1; links=3; ambiguous=0; pending=0", res.headers["x-wikilinks-rewritten"])

    body, new_etag = get_note(ready_admin, vault, otra["id"])
    assert body["content"] == "ver [[Archivo/Apunte.md|el plan]], [[Apunte]] y [[Archivo/Apunte]]"
    assert new_etag != otra_etag
    assert body["frontmatter"]["fecha_actualizacion"]
    assert get_note(ready_admin, vault, ajena["id"])[1] == ajena_etag  # no afectada: mismo ETag


def test_mover_sin_renombrar_solo_toca_enlaces_de_ruta(ready_admin):
    vault = create(ready_admin).json()["id"]
    plan, etag = post_note(ready_admin, vault, "A/Plan.md")
    otra, _ = post_note(ready_admin, vault, "X.md", "[[Plan]] [[A/Plan.md]]")
    res = patch(ready_admin, vault, plan["id"], etag, path="B/Plan.md")
    assert res.headers["x-wikilinks-rewritten"] == "notes=1; links=1; ambiguous=0; pending=0"
    assert get_note(ready_admin, vault, otra["id"])[0]["content"] == "[[Plan]] [[B/Plan.md]]"


def test_nombre_duplicado_se_reporta_ambiguo(ready_admin):
    vault = create(ready_admin).json()["id"]
    plan, etag = post_note(ready_admin, vault, "A/Plan.md")
    post_note(ready_admin, vault, "C/Plan.md")
    otra, _ = post_note(ready_admin, vault, "X.md", "[[Plan]] [[A/Plan.md]]")
    res = patch(ready_admin, vault, plan["id"], etag, path="A/Apunte.md")
    assert res.headers["x-wikilinks-rewritten"] == "notes=1; links=1; ambiguous=1; pending=0"
    assert get_note(ready_admin, vault, otra["id"])[0]["content"] == "[[Plan]] [[A/Apunte.md]]"


def test_patch_sin_cambio_de_path_no_lleva_cabecera_ni_reescribe(ready_admin):
    vault = create(ready_admin).json()["id"]
    plan, etag = post_note(ready_admin, vault, "A/Plan.md", "x")
    otra, otra_etag = post_note(ready_admin, vault, "X.md", "[[A/Plan.md]]")
    res = patch(ready_admin, vault, plan["id"], etag, content="y")
    assert res.status_code == 200 and "x-wikilinks-rewritten" not in res.headers
    assert get_note(ready_admin, vault, otra["id"])[1] == otra_etag


def test_la_nota_movida_devuelve_su_etag_vigente_aunque_se_reescriba_a_si_misma(ready_admin):
    vault = create(ready_admin).json()["id"]
    plan, etag = post_note(ready_admin, vault, "A/Plan.md", "yo: [[A/Plan.md]]")
    res = patch(ready_admin, vault, plan["id"], etag, path="B/Plan.md")
    assert res.status_code == 200
    body, current_etag = get_note(ready_admin, vault, plan["id"])
    assert body["content"] == "yo: [[B/Plan.md]]"
    assert res.headers["etag"] == current_etag


def test_codigo_y_papelera_no_se_tocan(ready_admin):
    vault = create(ready_admin).json()["id"]
    plan, etag = post_note(ready_admin, vault, "A/Plan.md")
    code, _ = post_note(ready_admin, vault, "Code.md", "`[[A/Plan.md]]`\n\n```\n[[A/Plan.md]]\n```")
    gone, gone_etag = post_note(ready_admin, vault, "Gone.md", "[[A/Plan.md]]")
    assert ready_admin.delete(f"/vaults/{vault}/notes/{gone['id']}", headers={"If-Match": gone_etag}).status_code == 204
    res = patch(ready_admin, vault, plan["id"], etag, path="B/Plan.md")
    assert res.headers["x-wikilinks-rewritten"] == "notes=0; links=0; ambiguous=0; pending=0"
    assert get_note(ready_admin, vault, code["id"])[0]["content"].count("[[A/Plan.md]]") == 2


def test_error_de_precondicion_no_reescribe(ready_admin):
    vault = create(ready_admin).json()["id"]
    plan, _ = post_note(ready_admin, vault, "A/Plan.md")
    otra, otra_etag = post_note(ready_admin, vault, "X.md", "[[A/Plan.md]]")
    assert_problem(patch(ready_admin, vault, plan["id"], '"1-viejo"', path="B/Plan.md"), 412, "precondition-failed")
    assert get_note(ready_admin, vault, otra["id"])[1] == otra_etag
