"""H-039: `WikilinkRewriteService` sobre un doble en memoria de `VaultPort` (semántica de `_rev` de CouchDB)."""
import uuid

import pytest

from app.core.wikilink_rewrite import Rename
from app.services.wikilink_rewrite_service import WikilinkRewriteService
from tests.test_vault_service import InMemoryVaultPort

DB = "synapse_user_owner"
VAULT = "7d1c9a8e-0000-4000-8000-000000000001"
WHEN = "2026-10-12T10:00:00.000000Z"
TODAY = "2026-11-04"


@pytest.fixture
def port():
    return InMemoryVaultPort()


def note(port, path, content="", *, deleted=False, frontmatter=None):
    doc = {"_id": f"note:{VAULT}:{uuid.uuid4()}", "type": "note", "vault_id": VAULT, "path": path, "content": content,
           "created_at": WHEN, "updated_at": WHEN, "deleted_at": WHEN if deleted else None}
    if frontmatter is not None:
        doc["frontmatter"] = frontmatter
    port.put(DB, doc)
    return port.get(DB, doc["_id"])


def service(port):
    return WikilinkRewriteService(port, DB, today=lambda: TODAY)


def moved(port, old, new, **kw):
    """Una nota ya movida: se guarda con su ruta NUEVA y el renombre la describe."""
    doc = note(port, new, **kw)
    return {doc["_id"]: Rename(old, new)}, doc


def test_reescribe_solo_las_notas_con_enlace_afectado(port):
    mv, _ = moved(port, "A/Plan.md", "B/Plan.md")
    hit = note(port, "X.md", "ver [[A/Plan.md|el plan]]")
    miss = note(port, "Y.md", "ver [[Otra]]")
    plain = note(port, "Z.md", "sin enlaces")
    report = service(port).rewrite(VAULT, mv)
    assert (report.notes, report.links, report.ambiguous, report.pending) == (1, 1, 0, 0)
    after = port.get(DB, hit["_id"])
    assert after["content"] == "ver [[B/Plan.md|el plan]]"
    assert after["_rev"] != hit["_rev"]
    assert after["frontmatter"]["fecha_actualizacion"] == TODAY
    assert after["updated_at"] != WHEN
    assert port.get(DB, miss["_id"])["_rev"] == miss["_rev"]
    assert port.get(DB, plain["_id"])["_rev"] == plain["_rev"]


def test_no_toca_la_papelera_ni_los_indices(port):
    mv, _ = moved(port, "A/Plan.md", "B/Plan.md")
    trashed = note(port, "T.md", "[[A/Plan.md]]", deleted=True)
    index = note(port, "C/INDICE.md", "[[A/Plan.md]]")
    report = service(port).rewrite(VAULT, mv)
    assert report.notes == 0
    assert port.get(DB, trashed["_id"])["_rev"] == trashed["_rev"]
    assert port.get(DB, index["_id"])["_rev"] == index["_rev"]


def test_solo_nombre_unico_se_reescribe_al_renombrar(port):
    mv, _ = moved(port, "A/Nota.md", "A/Apunte.md")
    other = note(port, "X.md", "[[Nota]] y [[A/Nota]]")
    service(port).rewrite(VAULT, mv)
    assert port.get(DB, other["_id"])["content"] == "[[Apunte]] y [[A/Apunte]]"


def test_nombre_ambiguo_no_se_toca_y_se_reporta(port):
    mv, _ = moved(port, "A/Nota.md", "A/Apunte.md")
    note(port, "B/Nota.md", "")  # segunda nota viva con el mismo nombre
    other = note(port, "X.md", "[[Nota]] y [[A/Nota.md]]")
    report = service(port).rewrite(VAULT, mv)
    assert port.get(DB, other["_id"])["content"] == "[[Nota]] y [[A/Apunte.md]]"
    assert (report.links, report.ambiguous) == (1, 1)


def test_mover_sin_renombrar_deja_los_enlaces_por_nombre(port):
    mv, _ = moved(port, "A/Nota.md", "B/Nota.md")
    other = note(port, "X.md", "[[Nota]] [[A/Nota.md]]")
    service(port).rewrite(VAULT, mv)
    assert port.get(DB, other["_id"])["content"] == "[[Nota]] [[B/Nota.md]]"


def test_la_nota_movida_tambien_se_reescribe(port):
    mv, moved_doc = moved(port, "A/Uno.md", "B/Uno.md", content="yo: [[A/Uno.md]]")
    report = service(port).rewrite(VAULT, mv)
    assert report.notes == 1
    assert port.get(DB, moved_doc["_id"])["content"] == "yo: [[B/Uno.md]]"


def test_varios_renombres_a_la_vez(port):
    ids = {}
    for old, new in [("A/Uno.md", "B/Uno.md"), ("A/Dos.md", "B/Dos.md")]:
        mv, _ = moved(port, old, new)
        ids.update(mv)
    other = note(port, "X.md", "[[A/Uno.md]] [[A/Dos]]")
    report = service(port).rewrite(VAULT, ids)
    assert port.get(DB, other["_id"])["content"] == "[[B/Uno.md]] [[B/Dos]]"
    assert (report.notes, report.links) == (1, 2)


def test_recorre_mas_de_una_pagina(port):
    mv, _ = moved(port, "A/Plan.md", "B/Plan.md")
    docs = [note(port, f"N{i:03}.md", "[[A/Plan.md]]") for i in range(130)]
    report = service(port).rewrite(VAULT, mv)
    assert (report.notes, report.links) == (130, 130)
    assert all(port.get(DB, d["_id"])["content"] == "[[B/Plan.md]]" for d in docs)


def test_conflicto_de_rev_se_resuelve_sobre_el_contenido_fresco(port):
    mv, _ = moved(port, "A/Plan.md", "B/Plan.md")
    other = note(port, "X.md", "[[A/Plan.md]]")

    def concurrent_edit():
        fresh = port.get(DB, other["_id"])
        port.put(DB, {**fresh, "content": "[[A/Plan.md]] y una edición ajena"})

    port.before_next_put(concurrent_edit, when=lambda doc: doc["_id"] == other["_id"])
    report = service(port).rewrite(VAULT, mv)
    assert (report.notes, report.links, report.pending) == (1, 1, 0)
    assert port.get(DB, other["_id"])["content"] == "[[B/Plan.md]] y una edición ajena"


def test_nota_ajena_que_no_cede_queda_pendiente_y_las_demas_siguen(port):
    mv, _ = moved(port, "A/Plan.md", "B/Plan.md")
    stubborn = note(port, "S.md", "[[A/Plan.md]]")
    fine = note(port, "F.md", "[[A/Plan.md]]")
    real_put = port.put

    def always_conflicting(db, doc):  # otra escritura gana justo antes de cada intento
        if doc["_id"] == stubborn["_id"]:
            real_put(db, {**port.get(db, doc["_id"]), "updated_at": utc()})
        return real_put(db, doc)

    port.put = always_conflicting
    report = service(port).rewrite(VAULT, mv)
    assert (report.notes, report.pending, report.pending_ids) == (1, 1, (stubborn["_id"],))
    assert port.get(DB, fine["_id"])["content"] == "[[B/Plan.md]]"
    assert port.get(DB, stubborn["_id"])["content"] == "[[A/Plan.md]]"


def utc():
    from app.core.timestamps import utc_now
    return utc_now()


def test_nota_borrada_durante_la_operacion_se_omite(port):
    mv, _ = moved(port, "A/Plan.md", "B/Plan.md")
    other = note(port, "X.md", "[[A/Plan.md]]")
    port.before_next_get(
        lambda: port.put(DB, {**port.get(DB, other["_id"]), "deleted_at": WHEN}),
        when=lambda doc_id: doc_id == other["_id"])
    report = service(port).rewrite(VAULT, mv)
    assert (report.notes, report.pending) == (0, 0)


def test_sin_cambio_de_ruta_no_hace_nada(port):
    mv, _ = moved(port, "A/Plan.md", "A/plan.md")  # misma path_key
    other = note(port, "X.md", "[[A/Plan.md]]")
    assert service(port).rewrite(VAULT, mv).notes == 0
    assert port.get(DB, other["_id"])["_rev"] == other["_rev"]


def test_cabecera_del_informe():
    from app.services.wikilink_rewrite_service import RewriteReport
    assert RewriteReport(3, 5, 1, 0).header() == "notes=3; links=5; ambiguous=1; pending=0"
