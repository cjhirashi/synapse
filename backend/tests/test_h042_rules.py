"""H-042: reglas puras de las conversaciones de `AG - MENSAJES` (sin E/S)."""
import pytest

from app.core import conversation_rules as c
from app.core.agent_access import Actor

CONV = "aira → liza - Revisar el plan - 2026-11-05"
CAB = f"AG - MENSAJES/{CONV}/000-cabecera.md"
MSG = f"AG - MENSAJES/{CONV}/001-de-aira.md"
REPLY = f"AG - MENSAJES/{CONV}/002-de-liza.md"


@pytest.mark.parametrize("path,kind", [
    (CAB, "cabecera"), (MSG, "mensaje"), (REPLY, "mensaje"), ("AG - MENSAJES/INDICE.md", "indice"),
    (f"AG - MENSAJES/{CONV}/INDICE.md", "indice"),
    ("AG - MENSAJES/a1 → b-2 - Asunto - con guiones - y 2026-01-01 - 2026-02-28/999-de-b-2.md", "mensaje"),
])
def test_valid_paths(path, kind):
    assert c.parse_mensaje_path(path).kind == kind
    assert c.check_mensaje_path(path) is None


@pytest.mark.parametrize("path", [
    "AG - MENSAJES/nota.md",                                               # suelta
    "AG - MENSAJES/aira/nota.md", "AG - MENSAJES/liza/20261105-0930-x/000-cabecera.md",   # el formato anterior a H-042
    "AG - MENSAJES/aira -> liza - x - 2026-11-05/001-de-aira.md",          # la REST lo convierte; el parser exige la flecha
    "AG - MENSAJES/aira → aira - x - 2026-11-05/001-de-aira.md",           # a sí mismo
    "AG - MENSAJES/Aira → liza - x - 2026-11-05/001-de-aira.md",           # id con mayúscula
    "AG - MENSAJES/aira → liza -  - 2026-11-05/001-de-aira.md",            # asunto vacío
    "AG - MENSAJES/aira → liza - x - 2026-02-30/001-de-aira.md",           # fecha inexistente
    "AG - MENSAJES/aira → liza - x - 20261105/001-de-aira.md",             # fecha sin guiones
    f"AG - MENSAJES/aira → liza - {'x' * 101} - 2026-11-05/001-de-aira.md",  # asunto largo
    f"AG - MENSAJES/{CONV}/001-de-aira.txt", f"AG - MENSAJES/{CONV}/000-de-aira.md", f"AG - MENSAJES/{CONV}/1000-de-aira.md",
    f"AG - MENSAJES/{CONV}/1-de-aira.md", f"AG - MENSAJES/{CONV}/sub/001-de-aira.md", f"AG - MENSAJES/{CONV}/otra.md",
    f"AG - MENSAJES/{CONV}/sub/INDICE.md",
])
def test_invalid_paths(path):
    assert c.check_mensaje_path(path) == "ag-mensajes:path"


def test_other_folders_are_not_checked():
    assert c.check_mensaje_path("Otra/nota.md") is None


def test_the_subject_can_hold_the_separators_without_ambiguity():
    info = c.parse_mensaje_path(f"AG - MENSAJES/aira → liza - a → b - 2026-01-01 - 2026-11-05/001-de-liza.md")
    assert (info.de, info.para, info.asunto, info.inicio, info.sender, info.number) == (
        "aira", "liza", "a → b - 2026-01-01", "2026-11-05", "liza", 1)


def test_rest_accepts_the_ascii_arrow_once_and_only_between_the_ids():
    assert c.canonical_arrow("AG - MENSAJES/aira -> liza - x -> y - 2026-11-05/001-de-aira.md") == \
        "AG - MENSAJES/aira → liza - x -> y - 2026-11-05/001-de-aira.md"
    assert c.canonical_arrow(MSG) == MSG
    assert c.canonical_arrow("Otra/aira -> liza - x - 2026-11-05/a.md") == "Otra/aira -> liza - x - 2026-11-05/a.md"
    assert c.canonical_arrow("AG - MENSAJES/INDICE.md") == "AG - MENSAJES/INDICE.md"


def test_index_description_of_a_conversation_is_set_by_the_server():
    assert c.folder_description(f"AG - MENSAJES/{CONV}") == "Conversación de aira para liza: Revisar el plan. Iniciada el 2026-11-05."
    assert c.folder_description("AG - MENSAJES") is None and c.folder_description("Otra/x") is None


def test_cabecera_metadata_must_match_the_folder():
    info = c.parse_mensaje_path(CAB)
    ok = {"de": "aira", "para": "liza", "estado": "abierta"}
    assert c.check_cabecera(info, ok) is None
    for bad in [None, {}, {**ok, "para": "emma"}, {**ok, "de": "liza"}, {**ok, "estado": "pendiente"}, {**ok, "de": 1}]:
        assert c.check_cabecera(info, bad) == "ag-mensajes:cabecera"


def test_new_cabecera_is_open_and_carries_the_documents_attributes():
    frontmatter, body = c.new_cabecera(c.parse_mensaje_path(CAB))
    assert frontmatter["estado"] == "abierta" and (frontmatter["de"], frontmatter["para"]) == ("aira", "liza")
    assert {"titulo", "descripcion", "tags", "asunto", "inicio"} <= set(frontmatter)
    assert "cerrada_el" not in frontmatter and "Revisar el plan" in body


def test_message_note_from_must_match_the_file_name():
    info = c.parse_mensaje_path(MSG)
    assert c.check_mensaje_note(info, {"de": "aira"}) is None and c.check_mensaje_note(info, None) is None
    assert c.check_mensaje_note(info, {"de": "emma"}) == "ag-mensajes:from-mismatch"


def test_server_stamps_cerrada_el():
    now = "2026-11-05T10:00:00.000000Z"
    opened = {"de": "a", "para": "b", "estado": "abierta", "cerrada_el": "2000-01-01T00:00:00.000000Z"}
    assert "cerrada_el" not in c.stamp_cabecera(None, opened, now)
    closed = {**opened, "estado": "cerrada"}
    assert c.stamp_cabecera({"estado": "abierta"}, closed, now)["cerrada_el"] == now
    already = {"estado": "cerrada", "cerrada_el": "2026-11-01T00:00:00.000000Z"}
    assert c.stamp_cabecera(already, closed, now)["cerrada_el"] == "2026-11-01T00:00:00.000000Z"
    assert "cerrada_el" not in c.stamp_cabecera(already, {**closed, "estado": "abierta"}, now)


def test_a_header_update_takes_only_estado_from_the_request():
    old = {"de": "aira", "para": "liza", "estado": "abierta", "titulo": "T"}
    assert c.merge_cabecera_update(old, {"estado": "cerrada"}) == {**old, "estado": "cerrada"}
    assert c.merge_cabecera_update(old, {"estado": "cerrada", "titulo": "Otro", "de": "emma"}) == {**old, "estado": "cerrada"}
    assert c.merge_cabecera_update(old, None) == old and c.merge_cabecera_update(old, {"x": 1}) == old


def test_form_rules_for_agents():
    msg, rep, cab = (c.parse_mensaje_path(p) for p in (MSG, REPLY, CAB))
    stranger = c.parse_mensaje_path(f"AG - MENSAJES/{CONV}/003-de-emma.md")
    old = {"de": "aira", "para": "liza", "estado": "abierta", "titulo": "T"}
    assert c.check_write("create", msg) is None and c.check_write("create", rep) is None
    assert c.check_write("create", stranger) == "ag-mensajes:not-participant"
    assert c.check_write("create", cab) == "ag-mensajes:cabecera-server"
    for op in ("update", "delete", "rename_or_move", "restore"):
        assert c.check_write(op, msg) == "ag-mensajes:immutable"
    assert c.check_write("delete", cab, old_frontmatter=old) == "ag-mensajes:immutable"
    closed = {**old, "estado": "cerrada", "cerrada_el": "2026-11-05T10:00:00.000000Z"}
    assert c.check_write("update", cab, old_frontmatter=old, new_frontmatter=closed) is None
    assert c.check_write("update", cab, old_frontmatter=old, new_frontmatter={**closed, "titulo": "Otro"}) == "ag-mensajes:immutable"
    assert c.check_write("update", cab, old_frontmatter=old, new_frontmatter=closed, content_changed=True) == "ag-mensajes:immutable"
    assert c.check_write("update", c.parse_mensaje_path("AG - MENSAJES/INDICE.md")) is None  # los INDICES siguen a H-031


def _decide(kind, agent_id, path, *, op="create", first=False, declared=None, honor=True):
    actor = Actor("agent", agent_id) if kind == "agent" else Actor("general", None, False, "general", declared)
    return c.decide_mensaje(actor, op, c.parse_mensaje_path(path), first_message=first, honor_declared=honor)


def test_agent_rules_sender_initiator_and_participants():
    # el remitente del nombre es el agente de la clave
    assert _decide("agent", "aira", MSG).allowed
    assert _decide("agent", "emma", MSG).reason == "mensaje-not-sender"
    assert _decide("agent", "aira", REPLY).reason == "mensaje-not-sender"
    # el primer mensaje lo escribe quien abre
    assert _decide("agent", "aira", MSG, first=True).allowed
    assert _decide("agent", "liza", REPLY, first=True).reason == "mensaje-not-initiator"
    # solo los dos participantes cierran o reabren; is_admin no interviene (no hay parámetro)
    assert _decide("agent", "liza", CAB, op="update").allowed and _decide("agent", "aira", CAB, op="update").allowed
    assert _decide("agent", "emma", CAB, op="update").reason == "mensaje-not-participant"


def test_agent_rules_and_the_general_key():
    assert _decide("general", None, MSG, declared="aira").allowed                      # sombra: evalúa al que declara
    assert _decide("general", None, MSG, declared="emma").reason == "mensaje-not-sender"
    assert _decide("general", None, MSG).reason == "general-key"                       # sin identidad
    assert _decide("general", None, MSG, declared="aira", honor=False).reason == "general-key"  # enforce: no tiene identidad


def test_a_human_is_not_evaluated_by_the_agent_rules():
    assert c.decide_mensaje(Actor("human"), "create", c.parse_mensaje_path(MSG), first_message=True, honor_declared=True).allowed
