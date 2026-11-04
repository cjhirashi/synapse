"""H-039: `FolderService.move` sobre un doble en memoria de `VaultPort`."""
import uuid

import pytest

from app.core.errors import (
    FolderMoveInvalid, FolderNotFound, NotePathTaken, RevisionConflict, ValidationFailed, VaultNotFound,
    WikilinkRewriteConflict,
)
from app.services.folder_service import FolderService
from app.services.note_service import NoteService
from tests.test_vault_service import InMemoryVaultPort

DB = "synapse_user_owner"
VAULT = "7d1c9a8e-0000-4000-8000-000000000001"
WHEN = "2026-10-12T10:00:00.000000Z"


@pytest.fixture
def port():
    p = InMemoryVaultPort()
    p.put(DB, {"_id": f"vault:{VAULT}", "type": "vault", "name": "v", "created_at": WHEN, "deleted_at": None})
    return p


@pytest.fixture
def svc(port):
    return FolderService(port, DB)


def note(port, path, content="", *, deleted=False, frontmatter=None, created_at=WHEN):
    doc = {"_id": f"note:{VAULT}:{uuid.uuid4()}", "type": "note", "vault_id": VAULT, "path": path, "content": content,
           "created_at": created_at, "updated_at": created_at, "deleted_at": WHEN if deleted else None}
    if frontmatter is not None:
        doc["frontmatter"] = frontmatter
    if not deleted:
        NoteService(port, DB).reserve_path(doc["_id"], path)
    port.put(DB, doc)
    return port.get(DB, doc["_id"])


def live_paths(port):
    return sorted(d["path"] for d in port.list_notes(DB, VAULT, False, 500, None) if not d.get("deleted_at"))


def test_mueve_la_subestructura_y_el_indice_con_su_descripcion(port, svc):
    note(port, "A/INDICE.md", frontmatter={"descripcion": "Plan de A"})
    note(port, "A/Uno.md")
    note(port, "A/Sub/INDICE.md", frontmatter={"descripcion": "Sub de A"})
    note(port, "A/Sub/Dos.md")
    note(port, "Otra.md")
    result = svc.move(VAULT, "A", "Archivo/B")
    assert result.moved_notes == 4
    paths = live_paths(port)
    assert {"Archivo/B/Uno.md", "Archivo/B/Sub/Dos.md", "Archivo/B/INDICE.md", "Archivo/B/Sub/INDICE.md", "Otra.md"} <= set(paths)
    assert not any(p.startswith("A/") for p in paths)  # sin INDICE huérfano en el origen
    by_path = {d["path"]: d for d in port.list_notes(DB, VAULT, False, 500, None)}
    assert by_path["Archivo/B/INDICE.md"]["frontmatter"]["descripcion"] == "Plan de A"
    assert by_path["Archivo/B/Sub/INDICE.md"]["frontmatter"]["descripcion"] == "Sub de A"
    assert "Archivo/INDICE.md" in paths and "INDICE.md" in paths  # ancestros del destino asegurados


def test_reescribe_los_enlaces_de_la_boveda(port, svc):
    note(port, "A/Uno.md", "yo: [[A/Uno.md]]")
    note(port, "A/Dos.md")
    otra = note(port, "X.md", "[[A/Uno.md|uno]] [[A/Dos]] [[Uno]]")
    result = svc.move(VAULT, "A", "B")
    assert port.get(DB, otra["_id"])["content"] == "[[B/Uno.md|uno]] [[B/Dos]] [[Uno]]"
    assert result.rewrite.notes == 2 and result.rewrite.links == 3


def test_colision_en_el_destino_no_mueve_ni_escribe_nada(port, svc):
    uno = note(port, "A/Uno.md")
    note(port, "B/Uno.md")
    ajena = note(port, "X.md", "[[A/Uno.md]]")
    with pytest.raises(NotePathTaken):
        svc.move(VAULT, "A", "B")
    assert port.get(DB, uno["_id"])["_rev"] == uno["_rev"]
    assert port.get(DB, ajena["_id"])["_rev"] == ajena["_rev"]


def test_indice_del_destino_manda_y_el_del_origen_se_descarta(port, svc):
    src = note(port, "A/INDICE.md", frontmatter={"descripcion": "origen"})
    note(port, "A/Uno.md")
    dst = note(port, "B/INDICE.md", frontmatter={"descripcion": "destino"})
    svc.move(VAULT, "A", "B")
    assert port.get(DB, src["_id"])["deleted_at"]
    assert port.get(DB, dst["_id"])["frontmatter"]["descripcion"] == "destino"
    assert "B/Uno.md" in live_paths(port)


def test_papelera_en_el_destino_no_bloquea(port, svc):
    note(port, "A/Uno.md")
    note(port, "B/Uno.md", deleted=True)
    assert svc.move(VAULT, "A", "B").moved_notes == 1


def test_las_notas_en_papelera_no_se_mueven(port, svc):
    gone = note(port, "A/Vieja.md", deleted=True)
    note(port, "A/Uno.md")
    svc.move(VAULT, "A", "B")
    assert port.get(DB, gone["_id"])["path"] == "A/Vieja.md"


@pytest.mark.parametrize("from_,to", [("", "B"), ("A", ""), ("A", "A/B"), ("A/", "B"), ("A", "B//C"), ("A", "a/b")])
def test_rutas_invalidas(port, svc, from_, to):
    note(port, "A/Uno.md")
    with pytest.raises(FolderMoveInvalid):
        svc.move(VAULT, from_, to)


def test_ni_origen_ni_destino_con_notas_es_404(port, svc):
    with pytest.raises(FolderNotFound):
        svc.move(VAULT, "A", "B")


def test_bobeda_inexistente_o_en_papelera(port, svc):
    with pytest.raises(VaultNotFound):
        svc.move("7d1c9a8e-0000-4000-8000-0000000000ff", "A", "B")
    port.put(DB, {**port.get(DB, f"vault:{VAULT}"), "deleted_at": WHEN})
    with pytest.raises(VaultNotFound):
        svc.move(VAULT, "A", "B")


def test_mismo_origen_y_destino_no_hace_nada(port, svc):
    uno = note(port, "A/Uno.md")
    assert svc.move(VAULT, "A", "A").moved_notes == 0
    assert port.get(DB, uno["_id"])["_rev"] == uno["_rev"]


def test_reejecutar_es_idempotente_y_repara_enlaces_pendientes(port, svc):
    note(port, "A/Uno.md")
    svc.move(VAULT, "A", "B")
    # un enlace a la ruta vieja que quedó pendiente (p. ej. una corrida interrumpida)
    colgado = note(port, "X.md", "[[A/Uno.md]]")
    again = svc.move(VAULT, "A", "B")
    assert again.moved_notes == 0 and again.rewrite.links == 1
    assert port.get(DB, colgado["_id"])["content"] == "[[B/Uno.md]]"
    third = svc.move(VAULT, "A", "B")
    assert third.moved_notes == 0 and third.rewrite.notes == 0


def test_corrida_parcial_se_completa_al_reejecutar(port, svc):
    note(port, "A/Uno.md", created_at="2026-10-12T11:00:00.000000Z")  # el listado va de más nueva a más vieja
    dos = note(port, "A/Dos.md", created_at="2026-10-12T10:00:00.000000Z")
    ajena = note(port, "X.md", "[[A/Uno.md]] [[A/Dos.md]]")
    port.fail_next("put", when=lambda db, doc: doc["_id"] == dos["_id"] and doc["path"] == "B/Dos.md",
                   error=RevisionConflict("x"))
    with pytest.raises(WikilinkRewriteConflict):
        svc.move(VAULT, "A", "B")
    assert svc.move(VAULT, "A", "B").moved_notes == 1  # lo que faltaba
    assert port.get(DB, ajena["_id"])["content"] == "[[B/Uno.md]] [[B/Dos.md]]"
    assert not any(p.startswith("A/") for p in live_paths(port))


def test_rutas_largas_se_validan(port, svc):
    note(port, "A/Uno.md")
    with pytest.raises(ValidationFailed):
        svc.move(VAULT, "A", "x" * 299)
