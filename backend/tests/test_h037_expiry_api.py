"""H-037: Vencimiento de publicaciones — endpoints de expiry y listado.

TestClient + CouchDB real. Los agentes son claves con `agent_id`.
"""

import uuid
from datetime import UTC, datetime, timedelta, timezone

from app.core.models.publication import Publication
from tests.conftest import TestingSessionLocal
from tests.test_h030_api import agent_client, post_note
from tests.test_vaults_api import create

CDMX = timezone(timedelta(hours=-6))


def _utc_z(moment: datetime) -> str:
    """El instante enviado como lo devuelve la API: UTC con `Z`."""
    return moment.astimezone(UTC).replace(tzinfo=None).isoformat() + "Z"


def _publication_row(token: str) -> Publication | None:
    with TestingSessionLocal() as session:
        return session.query(Publication).filter_by(token=token).first()


def vault_of(admin, name=None) -> str:
    """Crea una bóveda única para tests de H-037."""
    if name is None:
        name = f"H037-{uuid.uuid4().hex[:8]}"
    res = create(admin, name=name)
    assert res.status_code == 201, res.text
    return res.json()["id"]


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


def _doc(admin, vault_id, path="Actas/Reunión.md", **fm):
    """Crea un documento de test."""
    res = post_note(
        admin,
        vault_id,
        path,
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
    doc["etag"] = res.headers.get("ETag", doc.get("etag"))
    return doc


# --- Publicar con vencimiento ---


def test_publish_with_unpublish_at_in_future_with_timezone(ready_admin):
    """Publicar con fecha de vencimiento a +1 día con zona → 201 con unpublish_at en ISO con Z."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")
    html = "<h1>Test</h1>"

    future = datetime.now(CDMX) + timedelta(days=1)
    expiry_str = future.isoformat()

    res = ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": html, "unpublish_at": expiry_str}
    )
    assert res.status_code == 201
    pub = res.json()
    assert pub["published"] is True
    assert pub["unpublish_at"] == _utc_z(future)
    assert _publication_row(pub["token"]).unpublish_at == future.astimezone(UTC).replace(tzinfo=None)


def test_publish_without_unpublish_at_field_gives_null(ready_admin):
    """Publicar sin campo unpublish_at → null en respuesta."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    res = ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>"}
    )
    assert res.status_code == 201
    pub = res.json()
    assert pub["unpublish_at"] is None


def test_publish_with_unpublish_at_null_gives_null(ready_admin):
    """Publicar con unpublish_at: null → null en respuesta."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    res = ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>", "unpublish_at": None}
    )
    assert res.status_code == 201
    pub = res.json()
    assert pub["unpublish_at"] is None


def test_publish_with_unpublish_at_without_timezone_gives_422(ready_admin):
    """Publicar con fecha sin zona → 422."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Fecha sin zona
    no_tz = "2026-02-20T18:00:00"

    res = ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>", "unpublish_at": no_tz}
    )
    assert res.status_code == 422
    # Verificar que NO quedó publicada
    status = ready_admin.get(f"/vaults/{vault_id}/notes/{doc['id']}/publication").json()
    assert status["published"] is False


def test_publish_with_unpublish_at_in_past_gives_422(ready_admin):
    """Publicar con fecha pasada → 422."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Fecha en el pasado
    past = datetime.now(UTC) - timedelta(hours=1)
    past_str = past.isoformat()

    res = ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>", "unpublish_at": past_str}
    )
    assert res.status_code == 422
    status = ready_admin.get(f"/vaults/{vault_id}/notes/{doc['id']}/publication").json()
    assert status["published"] is False


def test_publish_with_unpublish_at_plus_4_min_gives_422(ready_admin):
    """Publicar con fecha a +4 min (menor al mínimo de 5) → 422."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Fecha a +4 minutos
    near_future = datetime.now(UTC) + timedelta(minutes=4)
    near_str = near_future.isoformat()

    res = ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>", "unpublish_at": near_str}
    )
    assert res.status_code == 422
    status = ready_admin.get(f"/vaults/{vault_id}/notes/{doc['id']}/publication").json()
    assert status["published"] is False


def test_publish_with_unpublish_at_plus_6_min_gives_201(ready_admin):
    """Publicar con fecha a +6 min (mayor al mínimo) → 201."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Fecha a +6 minutos
    future = datetime.now(UTC) + timedelta(minutes=6)
    future_str = future.isoformat()

    res = ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>", "unpublish_at": future_str}
    )
    assert res.status_code == 201
    pub = res.json()
    assert pub["published"] is True
    assert pub["unpublish_at"] == _utc_z(future)


# --- Republicar conserva vencimiento ---


def test_republish_conserves_unpublish_at_and_token(ready_admin):
    """Republicar conserva unpublish_at y token."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar con vencimiento
    future = datetime.now(UTC) + timedelta(days=1)
    future_str = future.isoformat()

    pub1 = ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Uno</p>", "unpublish_at": future_str}
    ).json()

    token1 = pub1["token"]
    expiry1 = pub1["unpublish_at"]

    # Republicar (sin especificar unpublish_at)
    pub2 = ready_admin.put(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Dos</p>"}
    ).json()

    token2 = pub2["token"]
    expiry2 = pub2["unpublish_at"]

    assert token2 == token1
    assert expiry1 == _utc_z(future)
    assert expiry2 == expiry1


# --- PUT /expiry ---


def test_set_expiry_on_published_note(ready_admin):
    """PUT /expiry fija una fecha de vencimiento en una nota publicada."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar sin vencimiento
    ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>"}
    )

    # Fija una fecha
    future = datetime.now(UTC) + timedelta(days=1)
    future_str = future.isoformat()

    res = ready_admin.put(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication/expiry",
        json={"unpublish_at": future_str}
    )
    assert res.status_code == 200
    pub = res.json()
    assert pub["unpublish_at"] == _utc_z(future)
    assert _publication_row(pub["token"]).unpublish_at == future.astimezone(UTC).replace(tzinfo=None)


def test_set_expiry_changes_existing_expiry(ready_admin):
    """PUT /expiry cambia una fecha de vencimiento existente."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar con vencimiento a +1 día
    future1 = datetime.now(UTC) + timedelta(days=1)
    future1_str = future1.isoformat()

    ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>", "unpublish_at": future1_str}
    )

    # Cambiar a +2 días
    future2 = datetime.now(UTC) + timedelta(days=2)
    future2_str = future2.isoformat()

    res = ready_admin.put(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication/expiry",
        json={"unpublish_at": future2_str}
    )
    assert res.status_code == 200
    pub = res.json()
    assert pub["unpublish_at"] == _utc_z(future2)
    assert pub["unpublish_at"] != _utc_z(future1)


def test_set_expiry_removes_expiry_with_null(ready_admin):
    """PUT /expiry con null quita el vencimiento."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar con vencimiento
    future = datetime.now(UTC) + timedelta(days=1)
    future_str = future.isoformat()

    ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>", "unpublish_at": future_str}
    )

    # Quitar con null
    res = ready_admin.put(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication/expiry",
        json={"unpublish_at": None}
    )
    assert res.status_code == 200
    pub = res.json()
    assert pub["unpublish_at"] is None
    assert _publication_row(pub["token"]).unpublish_at is None


def test_set_expiry_on_unpublished_note_gives_404(ready_admin):
    """PUT /expiry en nota no publicada → 404."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    future = datetime.now(UTC) + timedelta(days=1)
    future_str = future.isoformat()

    res = ready_admin.put(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication/expiry",
        json={"unpublish_at": future_str}
    )
    assert res.status_code == 404
    assert res.json()["type"] == "urn:synapse:problem:not-published"


def test_set_expiry_with_plus_4_min_gives_422(ready_admin):
    """PUT /expiry con +4 min → 422."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar primero
    ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>"}
    )

    # Intentar fija con +4 min
    near_future = datetime.now(UTC) + timedelta(minutes=4)
    near_str = near_future.isoformat()

    res = ready_admin.put(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication/expiry",
        json={"unpublish_at": near_str}
    )
    assert res.status_code == 422
    assert ready_admin.get(f"/vaults/{vault_id}/notes/{doc['id']}/publication").json()["unpublish_at"] is None


def test_set_expiry_missing_field_gives_422(ready_admin):
    """PUT /expiry sin campo unpublish_at → 422."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar primero
    ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>"}
    )

    res = ready_admin.put(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication/expiry",
        json={}
    )
    assert res.status_code == 422


def test_set_expiry_works_even_if_template_disabled(ready_admin):
    """PUT /expiry funciona aunque la plantilla ya no tenga publicar activo."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar
    ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>"}
    )

    # Apagar la plantilla
    template = ready_admin.get(f"/vaults/{vault_id}/notes").json()["items"]
    template_note = next(n for n in template if n["path"] == "PLANTILLAS/plantilla-acta.md")
    ready_admin.patch(
        f"/vaults/{vault_id}/notes/{template_note['id']}",
        json={"frontmatter": {**template_note["frontmatter"], "estilo": {"publicar": {}, "pdf": {}}}},
        headers={"If-Match": template_note["etag"]},
    )

    # Fija expiry (debe funcionar)
    future = datetime.now(UTC) + timedelta(days=1)
    future_str = future.isoformat()

    assert ready_admin.get(f"/vaults/{vault_id}/notes/{doc['id']}/publication").json()["enabled"] is False
    res = ready_admin.put(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication/expiry",
        json={"unpublish_at": future_str}
    )
    assert res.status_code == 200
    assert res.json()["unpublish_at"] == _utc_z(future)


# --- GET /vaults/{vault_id}/publications ---


def test_list_publications_empty_at_start(ready_admin):
    """GET /vaults/{vault_id}/publications vacío al inicio."""
    vault_id = vault_of(ready_admin)
    res = ready_admin.get(f"/vaults/{vault_id}/publications")
    assert res.status_code == 200
    items = res.json()["items"]
    assert items == []


def test_list_publications_with_two_items_ordered_newest_first(ready_admin):
    """GET listado con dos publicaciones salen de más reciente a más antigua."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)

    # Primera publicación
    doc1 = _doc(ready_admin, vault_id, "Actas/Primera.md", plantilla="acta")
    pub1 = ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc1['id']}/publication",
        json={"html": "<p>Primera</p>"}
    ).json()

    # Segunda publicación
    doc2 = _doc(ready_admin, vault_id, "Actas/Segunda.md", plantilla="acta")
    pub2 = ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc2['id']}/publication",
        json={"html": "<p>Segunda</p>"}
    ).json()

    res = ready_admin.get(f"/vaults/{vault_id}/publications")
    items = res.json()["items"]

    assert len(items) == 2
    # La segunda debe estar primero (más reciente)
    assert items[0]["token"] == pub2["token"]
    assert items[1]["token"] == pub1["token"]

    assert [i["note_path"] for i in items] == ["Actas/Segunda.md", "Actas/Primera.md"]
    assert items[0] == {
        "note_id": doc2["id"], "note_path": "Actas/Segunda.md", "title": "Acta de reunión", "token": pub2["token"],
        "path": f"/p/{pub2['token']}", "published_at": pub2["published_at"], "republished_at": None, "unpublish_at": None,
        "stale": False, "deleted": False,
    }


def test_list_publications_note_path_correct(ready_admin):
    """GET listado: note_path correcto."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>"}
    )

    res = ready_admin.get(f"/vaults/{vault_id}/publications")
    items = res.json()["items"]

    assert len(items) == 1
    assert items[0]["note_path"] == "Actas/Reunión.md"
    assert items[0]["stale"] is False


def test_list_publications_stale_true_after_note_edit(ready_admin):
    """GET listado: stale es true después de editar la nota."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>"}
    )

    # Editar la nota
    ready_admin.patch(
        f"/vaults/{vault_id}/notes/{doc['id']}",
        json={"content": "# Nuevo"},
        headers={"If-Match": doc["etag"]},
    )

    res = ready_admin.get(f"/vaults/{vault_id}/publications")
    items = res.json()["items"]

    assert len(items) == 1
    assert items[0]["stale"] is True


def test_list_publications_deleted_true_after_note_deletion(ready_admin):
    """GET listado: deleted es true y note_path es null después de borrar la nota."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>"}
    )

    # Borrar la nota
    ready_admin.delete(
        f"/vaults/{vault_id}/notes/{doc['id']}",
        headers={"If-Match": doc["etag"]},
    )

    res = ready_admin.get(f"/vaults/{vault_id}/publications")
    items = res.json()["items"]

    assert len(items) == 1
    assert items[0]["deleted"] is True
    assert items[0]["note_path"] is None


def test_list_publications_other_user_not_visible(ready_admin):
    """GET listado: una publicación de otro dueño en la misma bóveda no aparece."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")
    mine = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>Mía</p>"}).json()
    with TestingSessionLocal() as session:
        session.add(Publication(
            id=str(uuid.uuid4()), owner_id="otro-dueno", vault_id=vault_id, note_id="nota-ajena", token="token-ajeno", title="Ajena",
            html="<p>x</p>", meta="{}", toc="[]", note_rev="r", published_at=datetime.now(UTC).replace(tzinfo=None),
        ))
        session.commit()

    items = ready_admin.get(f"/vaults/{vault_id}/publications").json()["items"]
    assert [i["token"] for i in items] == [mine["token"]]


def test_list_publications_agent_key_gives_401(ready_admin):
    """GET listado con clave de agente → 401, igual que el resto de la gestión."""
    vault_id = vault_of(ready_admin)
    assert agent_client(ready_admin, "aira").get(f"/vaults/{vault_id}/publications").status_code == 401


# --- Página pública con vencimiento ---


def test_public_page_with_past_expiry_gives_404_and_keeps_the_row(ready_admin):
    """Vencida pero sin barrer: 404 idéntico al de un token inexistente, y la fila sigue (la borra el trabajo de fondo)."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")
    token = ready_admin.post(f"/vaults/{vault_id}/notes/{doc['id']}/publication", json={"html": "<p>Visible</p>"}).json()["token"]
    assert ready_admin.get(f"/p/{token}").status_code == 200

    with TestingSessionLocal() as session:
        session.query(Publication).filter_by(token=token).update({"unpublish_at": datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=1)})
        session.commit()

    expired = ready_admin.get(f"/p/{token}")
    unknown = ready_admin.get("/p/token-que-no-existe")
    assert expired.status_code == 404
    assert expired.text == unknown.text
    assert expired.headers["cache-control"] == unknown.headers["cache-control"] == "no-store"
    assert _publication_row(token) is not None


def test_public_page_with_future_expiry_gives_200(ready_admin):
    """GET /p/{token} con unpublish_at en el futuro → 200."""
    vault_id = vault_of(ready_admin)
    _publish_template(ready_admin, vault_id)
    doc = _doc(ready_admin, vault_id, plantilla="acta")

    # Publicar con vencimiento futuro
    future = datetime.now(UTC) + timedelta(days=1)
    future_str = future.isoformat()

    pub = ready_admin.post(
        f"/vaults/{vault_id}/notes/{doc['id']}/publication",
        json={"html": "<p>Test</p>", "unpublish_at": future_str}
    ).json()

    token = pub["token"]

    res = ready_admin.get(f"/p/{token}")
    assert res.status_code == 200
    assert "Test" in res.text
