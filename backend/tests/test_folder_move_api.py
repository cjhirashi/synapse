"""H-039: `POST /vaults/{id}/folders/move` de punta a punta (API real, CouchDB real)."""
import uuid

from tests.test_note_rewrite_api import get_note, post_note
from tests.test_vaults_api import assert_problem, create


def move(client, vault_id, from_, to):
    return client.post(f"/vaults/{vault_id}/folders/move", json={"from": from_, "to": to})


def paths(client, vault_id):
    items, cursor = [], None
    while True:
        res = client.get(f"/vaults/{vault_id}/notes", params={"limit": 200, **({"cursor": cursor} if cursor else {})})
        body = res.json()
        items += body["items"]
        cursor = body["next_cursor"]
        if not cursor:
            return {i["path"]: i for i in items}


def test_mueve_la_carpeta_con_su_indice_y_reescribe_enlaces(ready_admin):
    vault = create(ready_admin).json()["id"]
    post_note(ready_admin, vault, "Proyectos/Plan.md", "# Plan")
    post_note(ready_admin, vault, "Proyectos/Sub/Dos.md", "yo: [[Proyectos/Sub/Dos.md]]")
    idx = paths(ready_admin, vault)["Proyectos/INDICE.md"]
    _, idx_etag = get_note(ready_admin, vault, idx["id"])
    assert ready_admin.patch(f"/vaults/{vault}/notes/{idx['id']}", headers={"If-Match": idx_etag},
                             json={"frontmatter": {"descripcion": "Los proyectos de Carlos"}}).status_code == 200
    otra, _ = post_note(ready_admin, vault, "Otra.md", "[[Proyectos/Plan.md|plan]] [[Plan]] [[Proyectos/Sub/Dos]]")

    res = move(ready_admin, vault, "Proyectos", "Archivo/Proyectos 2025")
    assert res.status_code == 200, res.text
    assert res.json() == {"from": "Proyectos", "to": "Archivo/Proyectos 2025", "moved_notes": 4,
                          "rewrite": {"notes": 2, "links": 3, "ambiguous": 0, "pending": 0}}
    assert res.headers["x-wikilinks-rewritten"] == "notes=2; links=3; ambiguous=0; pending=0"

    now = paths(ready_admin, vault)
    assert not any(p.startswith("Proyectos/") for p in now)
    assert {"Archivo/Proyectos 2025/Plan.md", "Archivo/Proyectos 2025/Sub/Dos.md", "Archivo/Proyectos 2025/INDICE.md",
            "Archivo/INDICE.md", "Archivo/Proyectos 2025/Sub/INDICE.md"} <= set(now)
    moved_idx = get_note(ready_admin, vault, now["Archivo/Proyectos 2025/INDICE.md"]["id"])[0]
    assert moved_idx["frontmatter"]["descripcion"] == "Los proyectos de Carlos"
    assert get_note(ready_admin, vault, otra["id"])[0]["content"] == \
        "[[Archivo/Proyectos 2025/Plan.md|plan]] [[Plan]] [[Archivo/Proyectos 2025/Sub/Dos]]"


def test_reejecutar_es_idempotente(ready_admin):
    vault = create(ready_admin).json()["id"]
    post_note(ready_admin, vault, "A/Uno.md")
    assert move(ready_admin, vault, "A", "B").json()["moved_notes"] == 2  # la nota y su INDICE
    again = move(ready_admin, vault, "A", "B")
    assert again.status_code == 200 and again.json()["moved_notes"] == 0


def test_colision_es_409_y_no_mueve_nada(ready_admin):
    vault = create(ready_admin).json()["id"]
    post_note(ready_admin, vault, "A/Uno.md")
    post_note(ready_admin, vault, "B/Uno.md")
    before = paths(ready_admin, vault)
    assert_problem(move(ready_admin, vault, "A", "B"), 409, "note-path-taken")
    assert paths(ready_admin, vault).keys() == before.keys()


def test_errores_de_validacion_y_404(ready_admin):
    vault = create(ready_admin).json()["id"]
    post_note(ready_admin, vault, "A/Uno.md")
    assert move(ready_admin, vault, "A", "A/B").status_code == 422
    assert move(ready_admin, vault, "", "B").status_code == 422
    assert move(ready_admin, vault, "A", "").status_code == 422
    assert_problem(move(ready_admin, vault, "Nada", "Tampoco"), 404, "folder-not-found")
    assert_problem(move(ready_admin, str(uuid.uuid4()), "A", "B"), 404, "vault-not-found")
    assert ready_admin.post(f"/vaults/{vault}/folders/move", json={"from": "A"}).status_code == 422


def test_sin_sesion_es_401(client):
    assert client.post(f"/vaults/{uuid.uuid4()}/folders/move", json={"from": "A", "to": "B"}).status_code == 401
