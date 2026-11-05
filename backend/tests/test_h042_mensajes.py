"""H-042 de punta a punta: conversaciones de `AG - MENSAJES` por REST y `/sync` (TestClient + CouchDB real).

Los agentes son claves con `agent_id`; el modo de cumplimiento se cambia con `monkeypatch`.
"""
import pytest

from app.core.config import settings
from app.core.models.agent_access_log import AgentAccessLog
from app.services import agent_access_guard
from tests.test_agent_api_key_access import _bearer_client
from tests.test_h030_api import (
    CAB, CONV, MSG1, MSG2, agent_client, detail, find, patch, post_note, register, vault_of,
)
from tests.test_note_sync_api import note_doc, push, user_db, vault  # noqa: F401
from tests.test_sync_api import child_of


@pytest.fixture(autouse=True)
def _fresh_registry_cache():
    agent_access_guard._CACHE.clear()
    yield
    agent_access_guard._CACHE.clear()


def reasons(res) -> list[str]:
    assert res.status_code == 201, res.text
    return [r["reason"] for r in res.json()]


def log_rows(db):
    db.expire_all()
    return [(r.op, r.agent_id, r.decision, r.reason) for r in db.query(AgentAccessLog).order_by(AgentAccessLog.at).all()]


def start(admin, vault_id):
    """aira abre la conversación con liza; devuelve los clientes de ambas."""
    aira, liza = agent_client(admin, "aira"), agent_client(admin, "liza")
    res = post_note(aira, vault_id, MSG1, "Necesito que revises el plan.")
    assert res.status_code == 201, res.text
    return aira, liza


# --- La sesión humana solo lee ---

def test_the_human_session_cannot_write_anything_under_mensajes(ready_admin):
    vault_id = vault_of(ready_admin)
    aira, _ = start(ready_admin, vault_id)
    # crear (un mensaje, una cabecera, una nota suelta, una carpeta nueva)
    for path in (MSG2, f"{CONV}/000-cabecera.md", "AG - MENSAJES/nota.md", "AG - MENSAJES/liza → aira - x - 2026-11-05/001-de-liza.md"):
        res = post_note(ready_admin, vault_id, path)
        assert res.status_code == 422 and detail(res) == "ag-mensajes:agents-only", path
    # editar, mover, borrar: el mensaje, la cabecera y los INDICES
    for path in (MSG1, CAB, "AG - MENSAJES/INDICE.md", f"{CONV}/INDICE.md"):
        note = find(ready_admin, vault_id, path)
        assert note is not None, path
        assert detail(patch(ready_admin, vault_id, note, content="x")) == "ag-mensajes:agents-only", path
        assert detail(patch(ready_admin, vault_id, note, path="Otra/x.md")) == "ag-mensajes:agents-only", path
        res = ready_admin.delete(f"/vaults/{vault_id}/notes/{note['id']}", headers={"If-Match": note["etag"]})
        assert res.status_code == 422 and detail(res) == "ag-mensajes:agents-only", path
    # mover una nota de fuera hacia dentro, y la carpeta de la conversación
    assert post_note(ready_admin, vault_id, "Fuera/a.md").status_code == 201
    outside = find(ready_admin, vault_id, "Fuera/a.md")
    assert detail(patch(ready_admin, vault_id, outside, path=f"{CONV}/003-de-aira.md")) == "ag-mensajes:agents-only"
    res = ready_admin.post(f"/vaults/{vault_id}/folders/move", json={"from": CONV, "to": "Archivo"})
    assert res.status_code == 422 and res.json()["errors"][0]["detail"] == "ag-mensajes:agents-only"
    res = ready_admin.post(f"/vaults/{vault_id}/folders/move", json={"from": "Fuera", "to": "AG - MENSAJES/Fuera"})
    assert res.status_code == 422 and res.json()["errors"][0]["detail"] == "ag-mensajes:agents-only"
    # leer sí
    listing = ready_admin.get(f"/vaults/{vault_id}/notes", params={"prefix": "AG - MENSAJES", "limit": 200}).json()["items"]
    assert {i["path"] for i in listing} >= {MSG1, CAB}
    assert ready_admin.get(f"/vaults/{vault_id}/notes/{find(ready_admin, vault_id, MSG1)['id']}").status_code == 200


# --- Abrir una conversación: el primer mensaje trae su cabecera ---

def test_the_first_message_creates_the_header_and_the_indexes(ready_admin):
    vault_id = vault_of(ready_admin)
    start(ready_admin, vault_id)
    head = find(ready_admin, vault_id, CAB)
    fm = head["frontmatter"]
    assert fm["estado"] == "abierta" and (fm["de"], fm["para"]) == ("aira", "liza")
    assert fm["asunto"] == "Revisar el plan" and fm["inicio"] == "2026-11-05" and "cerrada_el" not in fm
    assert {"titulo", "descripcion", "tags"} <= set(fm)
    index = find(ready_admin, vault_id, f"{CONV}/INDICE.md")
    assert index["frontmatter"]["descripcion"] == "Conversación de aira para liza: Revisar el plan. Iniciada el 2026-11-05."
    assert find(ready_admin, vault_id, "AG - MENSAJES/INDICE.md") is not None


def test_a_second_message_does_not_duplicate_the_header(ready_admin):
    vault_id = vault_of(ready_admin)
    _, liza = start(ready_admin, vault_id)
    assert post_note(liza, vault_id, MSG2, "Listo.").status_code == 201
    items = ready_admin.get(f"/vaults/{vault_id}/notes", params={"prefix": CONV, "limit": 200}).json()["items"]
    assert sorted(i["path"].rsplit("/", 1)[1] for i in items) == ["000-cabecera.md", "001-de-aira.md", "002-de-liza.md", "INDICE.md"]


def test_nobody_creates_the_header_by_hand(ready_admin):
    vault_id = vault_of(ready_admin)
    aira = agent_client(ready_admin, "aira")
    res = post_note(aira, vault_id, CAB, frontmatter={"de": "aira", "para": "liza", "estado": "abierta"})
    assert res.status_code == 422 and detail(res) == "ag-mensajes:cabecera-server"


@pytest.mark.parametrize("path", [
    "AG - MENSAJES/nota.md",                                                   # suelta
    "AG - MENSAJES/liza/20261105-0930-revisar/001-de-aira.md",                 # el formato anterior
    "AG - MENSAJES/aira → liza - x - 2026-02-30/001-de-aira.md",               # fecha inexistente
    "AG - MENSAJES/aira → aira - x - 2026-11-05/001-de-aira.md",               # a sí mismo
    "AG - MENSAJES/aira → liza -  - 2026-11-05/001-de-aira.md",                # sin asunto
    "AG - MENSAJES/Aira → liza - x - 2026-11-05/001-de-aira.md",               # id con mayúscula
    f"{CONV}/000-de-aira.md", f"{CONV}/sub/001-de-aira.md", f"{CONV}/1000-de-aira.md",
])
def test_invalid_conversation_formats_are_rejected(ready_admin, path):
    vault_id = vault_of(ready_admin)
    aira = agent_client(ready_admin, "aira")
    res = post_note(aira, vault_id, path)
    assert res.status_code == 422 and detail(res) == "ag-mensajes:path"


def test_the_ascii_arrow_is_stored_as_the_arrow_and_the_final_path_is_returned(ready_admin):
    vault_id = vault_of(ready_admin)
    aira = agent_client(ready_admin, "aira")
    res = post_note(aira, vault_id, "AG - MENSAJES/aira -> liza - Con flecha ASCII - 2026-11-05/001-de-aira.md", "hola")
    assert res.status_code == 201
    assert res.json()["path"] == "AG - MENSAJES/aira → liza - Con flecha ASCII - 2026-11-05/001-de-aira.md"
    assert find(aira, vault_id, "AG - MENSAJES/aira → liza - Con flecha ASCII - 2026-11-05/000-cabecera.md") is not None


def test_a_message_name_must_be_a_participant_and_its_from_attribute_must_match(ready_admin):
    vault_id = vault_of(ready_admin)
    emma = agent_client(ready_admin, "emma")
    assert detail(post_note(emma, vault_id, f"{CONV}/003-de-emma.md")) == "ag-mensajes:not-participant"
    aira = agent_client(ready_admin, "aira")
    assert detail(post_note(aira, vault_id, MSG1, frontmatter={"de": "liza"})) == "ag-mensajes:from-mismatch"
    assert post_note(aira, vault_id, MSG1, frontmatter={"de": "aira"}).status_code == 201


def test_two_messages_with_the_same_number_collide(ready_admin):
    vault_id = vault_of(ready_admin)
    _, liza = start(ready_admin, vault_id)
    assert post_note(liza, vault_id, MSG2).status_code == 201
    res = post_note(liza, vault_id, MSG2)
    assert res.status_code == 409 and res.json()["type"].endswith("note-path-taken")


# --- Responder, inmutabilidad y quién cierra ---

def test_the_receiver_answers_and_nobody_edits_a_message(ready_admin):
    vault_id = vault_of(ready_admin)
    aira, liza = start(ready_admin, vault_id)
    assert post_note(liza, vault_id, MSG2, "Hecho.").status_code == 201
    for client in (aira, liza):
        for path in (MSG1, MSG2):
            msg = find(client, vault_id, path)
            assert detail(patch(client, vault_id, msg, content="otro")) == "ag-mensajes:immutable"
            assert detail(patch(client, vault_id, msg, path=f"{CONV}/005-de-aira.md")) == "ag-mensajes:immutable"
            res = client.delete(f"/vaults/{vault_id}/notes/{msg['id']}", headers={"If-Match": msg["etag"]})
            assert res.status_code == 422 and detail(res) == "ag-mensajes:immutable"
    # nada entra ni sale del buzón por un renombre
    assert post_note(aira, vault_id, "Fuera/a.md").status_code == 201
    assert detail(patch(aira, vault_id, find(aira, vault_id, "Fuera/a.md"), path=f"{CONV}/004-de-aira.md")) == "ag-mensajes:immutable"
    assert detail(patch(aira, vault_id, find(aira, vault_id, MSG1), path="Fuera/m.md")) == "ag-mensajes:immutable"


def test_close_and_reopen_by_the_participants_with_the_server_stamp(ready_admin):
    vault_id = vault_of(ready_admin)
    aira, liza = start(ready_admin, vault_id)
    head = find(aira, vault_id, CAB)
    # basta mandar `estado`: el resto de la cabecera lo conserva el servidor, y lo demás que se envíe se ignora
    closed = patch(liza, vault_id, head, frontmatter={"estado": "cerrada", "cerrada_el": "1999-01-01T00:00:00.000000Z", "titulo": "Otro"})
    assert closed.status_code == 200, closed.text
    fm = closed.json()["frontmatter"]
    assert fm["estado"] == "cerrada" and fm["titulo"] != "Otro" and fm["asunto"] == "Revisar el plan"
    assert fm["cerrada_el"].startswith("20") and fm["cerrada_el"] != "1999-01-01T00:00:00.000000Z"
    # la reabre a mano el otro participante
    reopened = patch(aira, vault_id, find(aira, vault_id, CAB), frontmatter={"estado": "abierta"})
    assert reopened.status_code == 200 and "cerrada_el" not in reopened.json()["frontmatter"]
    # el contenido de la cabecera no se toca
    assert detail(patch(aira, vault_id, find(aira, vault_id, CAB), content="otro")) == "ag-mensajes:immutable"
    # un estado inválido
    assert detail(patch(aira, vault_id, find(aira, vault_id, CAB), frontmatter={"estado": "pendiente"})) == "ag-mensajes:cabecera"


def test_writing_into_a_closed_conversation_reopens_it(ready_admin):
    vault_id = vault_of(ready_admin)
    aira, liza = start(ready_admin, vault_id)
    assert patch(aira, vault_id, find(aira, vault_id, CAB), frontmatter={"estado": "cerrada"}).status_code == 200
    assert post_note(liza, vault_id, MSG2, "ya vi").status_code == 201
    fm = find(aira, vault_id, CAB)["frontmatter"]
    assert fm["estado"] == "abierta" and "cerrada_el" not in fm


def test_in_shadow_a_third_party_closing_is_logged_and_allowed(ready_admin, db, monkeypatch):
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "shadow")
    vault_id = vault_of(ready_admin)
    start(ready_admin, vault_id)
    emma = agent_client(ready_admin, "emma")
    assert patch(emma, vault_id, find(emma, vault_id, CAB), frontmatter={"estado": "cerrada"}).status_code == 200
    rows = log_rows(db)
    assert ("mensaje-update", "emma", "deny", "mensaje-not-participant") in rows
    assert ("mensaje-create", "aira", "allow", None) in rows


def test_when_enforcing_an_outsider_cannot_close_and_is_told_why(ready_admin, monkeypatch):
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    vault_id = vault_of(ready_admin)
    start(ready_admin, vault_id)
    emma = agent_client(ready_admin, "emma")
    res = patch(emma, vault_id, find(emma, vault_id, CAB), frontmatter={"estado": "cerrada"})
    assert res.status_code == 403 and res.json()["type"].endswith("agent-access-denied")
    assert res.json()["detail"] == "Only the two agents of a conversation can close or reopen it"
    assert find(emma, vault_id, CAB)["frontmatter"]["estado"] == "abierta"


def test_when_enforcing_the_sender_is_the_key_and_the_first_word_is_the_requesters(ready_admin, monkeypatch):
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    vault_id = vault_of(ready_admin)
    aira, liza = agent_client(ready_admin, "aira"), agent_client(ready_admin, "liza")
    # liza no abre la conversación que dice que pidió aira
    res = post_note(liza, vault_id, f"{CONV}/001-de-liza.md")
    assert res.status_code == 403 and res.json()["detail"] == "Only the requesting agent of a conversation can write its first message"
    # aira no escribe como liza
    res = post_note(aira, vault_id, MSG2)
    assert res.status_code == 403 and res.json()["detail"] == "A message can only be written by the agent named in its file name"
    assert find(aira, vault_id, CAB) is None  # lo rechazado no deja una cabecera huérfana
    assert post_note(aira, vault_id, MSG1).status_code == 201 and post_note(liza, vault_id, MSG2).status_code == 201


def test_a_read_only_agent_can_open_a_conversation_with_a_manager(ready_admin, monkeypatch):
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    vault_id = vault_of(ready_admin)
    register(ready_admin, vault_id, "liza", ["Permitida"])
    nobody = agent_client(ready_admin, "nadie")  # no registrado en la bóveda
    assert post_note(nobody, vault_id, "Permitida/x.md").status_code == 403
    path = "AG - MENSAJES/nadie → liza - Necesito acceso - 2026-11-05/001-de-nadie.md"
    assert post_note(nobody, vault_id, path, "¿Me das acceso?").status_code == 201
    liza = agent_client(ready_admin, "liza")
    assert post_note(liza, vault_id, path.replace("001-de-nadie", "002-de-liza"), "Sí.").status_code == 201


def test_the_system_does_not_validate_the_receiver_against_the_registry(ready_admin, monkeypatch):
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    vault_id = vault_of(ready_admin)
    aira = agent_client(ready_admin, "aira")
    # nadie registrado, ni quien escribe ni quien recibe: la forma del id basta
    assert post_note(aira, vault_id, "AG - MENSAJES/aira → desconocido - Hola - 2026-11-05/001-de-aira.md").status_code == 201


def test_is_admin_no_longer_gives_powers_over_conversations(ready_admin, monkeypatch):
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    vault_id = vault_of(ready_admin)
    start(ready_admin, vault_id)
    boss = agent_client(ready_admin, "main", admin_flag=True)
    res = patch(boss, vault_id, find(boss, vault_id, CAB), frontmatter={"estado": "cerrada"})
    assert res.status_code == 403 and res.json()["type"].endswith("agent-access-denied")


def test_a_general_key_is_evaluated_as_the_agent_it_declares_and_denied_when_enforcing(ready_admin, db, monkeypatch):
    vault_id = vault_of(ready_admin)
    general = _bearer_client(ready_admin, ready_admin.post("/auth/agent-keys", json={"label": "OpenClaw"}).json()["key"])
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "shadow")
    general.headers["X-Agent-Id"] = "aira"
    assert post_note(general, vault_id, MSG1).status_code == 201
    general.headers["X-Agent-Id"] = "emma"  # declara ser otro: en sombra solo se registra
    assert post_note(general, vault_id, MSG2).status_code == 201
    rows = log_rows(db)
    assert ("mensaje-create", "aira", "allow", None) in rows and ("mensaje-create", "emma", "deny", "mensaje-not-sender") in rows
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    res = post_note(general, vault_id, f"{CONV}/003-de-aira.md")
    assert res.status_code == 403


def test_wikilinks_do_not_rewrite_a_message_when_the_linked_note_moves(ready_admin):
    vault_id = vault_of(ready_admin)
    assert post_note(ready_admin, vault_id, "Plan/Roadmap.md", "x").status_code == 201
    aira = agent_client(ready_admin, "aira")
    assert post_note(aira, vault_id, MSG1, "Mira [[Roadmap]] por favor").status_code == 201
    assert post_note(ready_admin, vault_id, "Otra/nota.md", "Ver [[Roadmap]]").status_code == 201
    res = ready_admin.post(f"/vaults/{vault_id}/folders/move", json={"from": "Plan", "to": "Archivo/Plan"})
    assert res.status_code == 200, res.text
    msg = ready_admin.get(f"/vaults/{vault_id}/notes/{find(ready_admin, vault_id, MSG1)['id']}").json()
    assert msg["content"] == "Mira [[Roadmap]] por favor"


# --- /sync ---

def test_sync_the_human_push_is_rejected_for_everything_under_mensajes(vault, ready_admin):
    aira = agent_client(ready_admin, "aira")
    assert push(aira, [note_doc(vault["id"], path=MSG1, content="hola")]).json() == []
    msg = note_doc(vault["id"], path=MSG2, content="x")
    assert reasons(push(ready_admin, [msg])) == ["ag-mensajes:agents-only"]
    assert reasons(push(ready_admin, [note_doc(vault["id"], path="AG - MENSAJES/INDICE.md", content="")])) == ["ag-mensajes:agents-only"]


def test_sync_an_agent_pushes_the_first_message_and_the_server_adds_the_header(vault, ready_admin):
    aira = agent_client(ready_admin, "aira")
    assert push(aira, [note_doc(vault["id"], path=MSG1, content="hola")]).json() == []
    head = find(ready_admin, vault["id"], CAB)
    assert head is not None and head["frontmatter"]["estado"] == "abierta" and head["frontmatter"]["para"] == "liza"


def test_sync_format_names_and_header_are_validated(vault, ready_admin):
    aira = agent_client(ready_admin, "aira")
    assert reasons(push(aira, [note_doc(vault["id"], path="AG - MENSAJES/suelta.md")])) == ["ag-mensajes:path"]
    assert reasons(push(aira, [note_doc(vault["id"], path="AG - MENSAJES/aira -> liza - x - 2026-11-05/001-de-aira.md")])) == ["ag-mensajes:path"]
    assert reasons(push(aira, [note_doc(vault["id"], path=f"{CONV}/003-de-emma.md")])) == ["ag-mensajes:not-participant"]
    assert reasons(push(aira, [note_doc(vault["id"], path=MSG1, frontmatter={"de": "liza"})])) == ["ag-mensajes:from-mismatch"]
    head = note_doc(vault["id"], path=CAB, frontmatter={"de": "aira", "para": "liza", "estado": "abierta"})
    assert reasons(push(aira, [head])) == ["ag-mensajes:cabecera-server"]


def test_sync_messages_are_immutable(vault, ready_admin):
    aira = agent_client(ready_admin, "aira")
    msg = note_doc(vault["id"], path=MSG1, content="hola")
    assert push(aira, [msg]).json() == []
    assert reasons(push(aira, [child_of(msg, content="editado")])) == ["ag-mensajes:immutable"]
    assert reasons(push(aira, [child_of(msg, deleted_at="2026-11-05T10:00:00.000000Z")])) == ["ag-mensajes:immutable"]
    assert reasons(push(aira, [child_of(msg, path=f"{CONV}/004-de-aira.md")])) == ["ag-mensajes:immutable"]


def test_sync_a_message_pushed_into_a_closed_conversation_reopens_it(vault, ready_admin):
    aira, liza = agent_client(ready_admin, "aira"), agent_client(ready_admin, "liza")
    assert push(aira, [note_doc(vault["id"], path=MSG1, content="hola")]).json() == []
    assert patch(aira, vault["id"], find(aira, vault["id"], CAB), frontmatter={"estado": "cerrada"}).status_code == 200
    assert push(liza, [note_doc(vault["id"], path=MSG2, content="ya vi")]).json() == []
    fm = find(aira, vault["id"], CAB)["frontmatter"]
    assert fm["estado"] == "abierta" and "cerrada_el" not in fm


def test_sync_agent_rules_follow_the_switch(vault, ready_admin, db, monkeypatch):
    aira, liza = agent_client(ready_admin, "aira"), agent_client(ready_admin, "liza")
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "shadow")
    assert push(liza, [note_doc(vault["id"], path=f"{CONV}/001-de-liza.md")]).json() == []   # no es quien abre: se registra
    assert ("mensaje-create", "liza", "deny", "mensaje-not-initiator") in log_rows(db)
    monkeypatch.setattr(settings, "AGENT_ACCESS_MODE", "enforce")
    other = "AG - MENSAJES/aira → liza - Otra - 2026-11-05"
    assert reasons(push(liza, [note_doc(vault["id"], path=f"{other}/001-de-liza.md")])) == ["agent-access-denied"]
    assert reasons(push(aira, [note_doc(vault["id"], path=f"{other}/002-de-liza.md")])) == ["agent-access-denied"]
    assert push(aira, [note_doc(vault["id"], path=f"{other}/001-de-aira.md")]).json() == []
