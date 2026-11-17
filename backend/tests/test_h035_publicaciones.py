"""H-035: Publicación de notas — endpoints y servicio (fase 1 sin ruta pública /p/<token>).

TestClient + CouchDB real. Los agentes son claves con `agent_id`.
"""

from datetime import UTC, datetime

import pytest

from tests.test_h030_api import agent_client, post_note, vault_of, patch
from tests.test_h036_pdf import _template


def _publish_template(admin, vault_id, publish=None, name="acta"):
    """Crea una plantilla de test con la config de publicación especificada."""
    if publish is None:
        publish = {"activo": True}
    fm = {
        "titulo": "Acta",
        "alcance": ["*"],
        "atributos": [{"nombre": "cliente", "tipo": "texto"}],
        "estilo": {"publicar": publish, "pdf": {}},
        "estados": [{"nombre": "borrador", "color": "azul"}],
    }
    res = post_note(admin, vault_id, f"PLANTILLAS/plantilla-{name}.md", "# Estructura", fm)
    assert res.status_code == 201, res.text


def _doc(admin, vault_id, **fm):
    """Crea un documento de test."""
    res = post_note(
        admin,
        vault_id,
        "Actas/Reunión.md",
        "# Hola",
        {
            "titulo": "Acta de reunión",
            "descripcion": "Una acta importante",
            "estado": "borrador",
            "fecha_creacion": "2026-01-01",
            "fecha_actualizacion": "2026-01-02",
            **fm,
        },
    )
    assert res.status_code == 201, res.text
    doc = res.json()
    # Agregar etag que sale en la respuesta con encabezado ETag
    doc["etag"] = res.headers.get("ETag", doc.get("etag"))
    return doc


# --- Estado de publicación ---


def test_status_of_note_without_template_is_not_enabled(ready_admin):
    vault_id = vault_of(ready_admin)
    doc = _doc(ready_admin, vault_id)
    res = ready_admin.get(f"/vaults/{vault_id}/notes/{doc['id']}/publication")
    assert res.status_code == 200
    status = res.json()
    assert (
        status["enabled"] is False
        and status["published"] is False
        and status["token"] is None
        and status["path"] is None
        and status["published_at"] is None
        and status["stale"] is False
    )


def test_status_of_note_with_enabled_template(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id, publish={"activo": True})
    doc = _doc(ready_admin, vault_id, plantilla="acta")
    res = ready_admin.get(f"/vaults/{vault_id}/notes/{doc['id']}/publication")
    assert res.status_code == 200
    status = res.json()
    assert status["enabled"] is True and status["published"] is False


def test_status_with_disabled_publish_config(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id, publish={})
    doc = _doc(ready_admin, vault_id, plantilla="acta")
    res = ready_admin.get(f"/vaults/{vault_id}/notes/{doc['id']}/publication")
    assert res.status_code == 200
    assert res.json()["enabled"] is False


def test_status_with_activo_false(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id, publish={"activo": False})
    doc = _doc(ready_admin, vault_id, plantilla="acta")
    res = ready_admin.get(f"/vaults/{vault_id}/notes/{doc['id']}/publication")
    assert res.status_code == 200
    assert res.json()["enabled"] is False


# --- Publicar ---


def test_publish_a_note_with_enabled_template(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")
    html = "<h1>Título</h1><p>Contenido</p>"
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": html})
    assert res.status_code == 201
    status = res.json()
    assert (
        status["enabled"] is True
        and status["published"] is True
        and len(status["token"]) >= 32
        and status["path"] == f"/p/{status['token']}"
        and status["published_at"] is not None
        and status["republished_at"] is None
        and status["stale"] is False
    )


def test_publish_twice_raises_already_published(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")
    ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"})
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>y</p>"})
    assert res.status_code == 409
    assert "already-published" in res.json()["type"]


def test_publish_without_enabled_template_raises_not_enabled(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id, publish={})
    doc = _doc(ready_admin, vault_id, plantilla="acta")
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"})
    assert res.status_code == 409
    assert "publish-not-enabled" in res.json()["type"]


def test_publish_note_without_template(ready_admin):
    vault_id = vault_of(ready_admin)
    doc = _doc(ready_admin, vault_id)
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"})
    assert res.status_code == 409
    assert "publish-not-enabled" in res.json()["type"]


# --- Republicar ---


def test_republish_updates_token_stays_same_and_adds_republished_at(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar
    pub1 = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<h1>Uno</h1>"}).json()
    token1 = pub1["token"]
    published_at1 = pub1["published_at"]

    # Republicar
    pub2 = ready_admin.put(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<h1>Dos</h1>"}).json()
    token2 = pub2["token"]
    published_at2 = pub2["published_at"]

    assert token2 == token1
    assert published_at2 == published_at1
    assert pub2["republished_at"] is not None
    assert pub2["stale"] is False


def test_republish_without_publication_raises_not_published(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")
    res = ready_admin.put(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"})
    assert res.status_code == 404
    assert "not-published" in res.json()["type"]


def test_republish_with_disabled_template_raises_not_enabled(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar primero
    ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"})

    # Cambiar la plantilla para deshabilitar publicación
    template = ready_admin.get(f"/vaults/{vault_id}/notes").json()["items"]
    template_note = next(n for n in template if n["path"] == "PLANTILLAS/plantilla-acta.md")
    res_patch = ready_admin.patch(
        f"/vaults/{vault_id}/notes/{template_note['id']}",
        json={"frontmatter": {**template_note["frontmatter"], "estilo": {"publicar": {}, "pdf": {}}}},
        headers={"If-Match": template_note["etag"]},
    )
    assert res_patch.status_code == 200

    # Intentar republicar
    res = ready_admin.put(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>y</p>"})
    assert res.status_code == 409
    assert "publish-not-enabled" in res.json()["type"]


# --- Despublicar ---


def test_unpublish_removes_the_publication(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar
    ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"})

    # Despublicar
    res = ready_admin.delete(f"/vaults/{vault_id}/notes/{doc['id']}/publication")
    assert res.status_code == 204

    # Verificar que ya no está publicada
    status = ready_admin.get(f"/vaults/{vault_id}/notes/{doc['id']}/publication").json()
    assert status["published"] is False


def test_unpublish_without_publication_raises_not_published(ready_admin):
    vault_id = vault_of(ready_admin)
    doc = _doc(ready_admin, vault_id)
    res = ready_admin.delete(f"/vaults/{vault_id}/notes/{doc['id']}/publication")
    assert res.status_code == 404
    assert "not-published" in res.json()["type"]


def test_unpublish_always_works_even_if_template_disabled(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar
    ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"})

    # Cambiar plantilla
    template = ready_admin.get(f"/vaults/{vault_id}/notes").json()["items"]
    template_note = next(n for n in template if n["path"] == "PLANTILLAS/plantilla-acta.md")
    ready_admin.patch(
        f"/vaults/{vault_id}/notes/{template_note['id']}",
        json={"frontmatter": {**template_note["frontmatter"], "estilo": {"publicar": {}, "pdf": {}}}},
        headers={"If-Match": template_note["etag"]},
    )

    # Despublicar debe funcionar
    res = ready_admin.delete(f"/vaults/{vault_id}/notes/{doc['id']}/publication")
    assert res.status_code == 204


def test_republish_new_token_after_unpublish_and_republish(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar
    pub1 = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>uno</p>"}).json()
    token1 = pub1["token"]

    # Despublicar
    ready_admin.delete(f"/vaults/{vault_id}/notes/{doc['id']}/publication")

    # Publicar de nuevo
    pub2 = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>dos</p>"}).json()
    token2 = pub2["token"]

    assert token2 != token1


# --- Estale ---


def test_stale_becomes_true_after_note_edit(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar
    pub = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"}).json()
    assert pub["stale"] is False

    # Editar la nota
    ready_admin.patch(
        f"/vaults/{vault_id}/notes/{doc['id']}",
        json={"content": "# Nuevo contenido"},
        headers={"If-Match": doc["etag"]},
    )

    # Verificar que stale es true
    status = ready_admin.get(f"/vaults/{vault_id}/notes/{doc['id']}/publication").json()
    assert status["stale"] is True


def test_republish_clears_stale_flag(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar
    ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"})

    # Editar
    ready_admin.patch(
        f"/vaults/{vault_id}/notes/{doc['id']}",
        json={"content": "# Nuevo"},
        headers={"If-Match": doc["etag"]},
    )

    # Republicar
    pub = ready_admin.put(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>y</p>"}).json()
    assert pub["stale"] is False


# --- Validación ---


def test_publish_validates_input(ready_admin):
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # HTML vacío
    assert ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": ""}).status_code == 422

    # HTML muy grande
    assert (
        ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "x" * 2_000_001}).status_code
        == 422
    )

    # Campo extra
    assert ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>", "extra": "y"}).status_code == 422

    # Falta HTML
    assert ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={}).status_code == 422


def test_agents_cannot_publish(ready_admin):
    from tests.test_h030_api import register

    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    aira = agent_client(ready_admin, "aira")
    register(ready_admin, vault_id, "aira", ["*"])

    assert aira.get(f"/vaults/{vault_id}/notes/{doc['id']}/publication").status_code == 401
    assert aira.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"}).status_code == 401
    assert aira.put(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"}).status_code == 401
    assert aira.delete(f"/vaults/{vault_id}/notes/{doc['id']}/publication").status_code == 401


def test_nonexistent_note_returns_404(ready_admin):
    vault_id = vault_of(ready_admin)
    fake_id = "00000000-0000-4000-8000-000000000000"

    assert ready_admin.get(f"/vaults/{vault_id}/notes/{fake_id}/publication").status_code == 404
    assert ready_admin.post(f"/vaults/{vault_id}/notes/{fake_id}/publication", json={"html": "<p>x</p>"}).status_code == 404
    assert ready_admin.put(f"/vaults/{vault_id}/notes/{fake_id}/publication", json={"html": "<p>x</p>"}).status_code == 404
    assert ready_admin.delete(f"/vaults/{vault_id}/notes/{fake_id}/publication").status_code == 404


# --- Instantánea: HTML, título, metadatos ---


def test_snapshot_cleans_html_and_numbers_headings(ready_admin, db):
    from app.adapters.publication_repository import PublicationRepository
    from app.core.models.user import User

    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    html = "<h1>Uno &amp; dos</h1><p>x</p><h2>Tres</h2><script>alert(1)</script><iframe src='https://x.test'></iframe>"
    ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": html})

    # Leer la publicación de la base
    repo = PublicationRepository(db)
    owner = db.query(User).filter(User.email == "cjhirashi@gmail.com").first()
    pub = repo.get_for_note(owner.id, vault_id, doc["id"])

    # Verificar limpieza
    assert "<script" not in pub.html
    assert "<iframe" not in pub.html
    assert 'id="h-1"' in pub.html
    assert 'id="h-2"' in pub.html

    # Verificar TOC
    import json
    toc = json.loads(pub.toc)
    assert toc == [
        {"level": 1, "id": "h-1", "text": "Uno & dos"},
        {"level": 2, "id": "h-2", "text": "Tres"},
    ]


def test_snapshot_title_from_frontmatter_or_path(ready_admin, db):
    from app.adapters.publication_repository import PublicationRepository
    from app.core.models.user import User

    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)

    # Con título en frontmatter
    doc1 = _doc(ready_admin, vault_id, plantilla="acta", titulo="Mi Título Personalizado")
    ready_admin.post(f"/vaults/{vault_id}/notes/{doc1['id']}/publication", json={"html": "<p>x</p>"})

    repo = PublicationRepository(db)
    owner = db.query(User).filter(User.email == "cjhirashi@gmail.com").first()
    pub1 = repo.get_for_note(owner.id, vault_id, doc1["id"])
    assert pub1.title == "Mi Título Personalizado"

    # Sin título (usar path)
    res = post_note(ready_admin, vault_id, "Docs/MiDocumento.md", "# Hola", {"plantilla": "acta"})
    doc2 = res.json()
    ready_admin.post(f"/vaults/{vault_id}/notes/{doc2['id']}/publication", json={"html": "<p>x</p>"})

    pub2 = repo.get_for_note(owner.id, vault_id, doc2["id"])
    assert pub2.title == "MiDocumento"


def test_snapshot_meta_includes_descripcion_fechas_estado_y_color(ready_admin, db):
    from app.adapters.publication_repository import PublicationRepository
    from app.core.models.user import User
    import json

    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta", descripcion="Una acta importante", estado="borrador")

    ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>x</p>"})

    repo = PublicationRepository(db)
    owner = db.query(User).filter(User.email == "cjhirashi@gmail.com").first()
    pub = repo.get_for_note(owner.id, vault_id, doc["id"])
    meta = json.loads(pub.meta)

    assert meta["descripcion"] == "Una acta importante"
    assert meta["estado"] == "borrador"
    assert meta["estado_color"] == "azul"
    assert "creacion" in meta
    assert "actualizacion" in meta


def test_snapshot_empty_heading_has_id_but_not_in_toc(ready_admin, db):
    from app.adapters.publication_repository import PublicationRepository
    from app.core.models.user import User
    import json

    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    html = "<h1>Uno</h1><h3></h3><h2>Dos</h2>"
    ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": html})

    repo = PublicationRepository(db)
    owner = db.query(User).filter(User.email == "cjhirashi@gmail.com").first()
    pub = repo.get_for_note(owner.id, vault_id, doc["id"])

    # El h3 vacío tiene id
    assert 'id="h-2"' in pub.html

    # Pero no entra al TOC
    toc = json.loads(pub.toc)
    assert len(toc) == 2
    assert toc[0]["text"] == "Uno"
    assert toc[1]["text"] == "Dos"
