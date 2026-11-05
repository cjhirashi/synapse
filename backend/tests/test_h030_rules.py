"""H-030 E3/E4/E6: reglas puras de carpetas reservadas, mensajes y permisos (sin E/S)."""
import pytest

from app.core import ag_rules
from app.core.agent_access import (
    Actor, Registration, check_registration_frontmatter, decide, decide_files, parse_registration,
)

CAB = "AG - MENSAJES/liza/20261105-0930-revisar-h030/000-cabecera.md"
MSG = "AG - MENSAJES/liza/20261105-0930-revisar-h030/001-de-aira.md"


# --- Estructura reservada (E3) ---

@pytest.mark.parametrize("path,zone", [
    ("AG - SKILLS/skill-x.md", "AG - SKILLS"), ("ag - skills/a/b.md", "AG - SKILLS"),
    ("AG – MENSAJES/x.md", None), ("BITACORA/2026-11/a.md", "BITACORA"), ("plantillas/p.md", "PLANTILLAS"),
    ("Otra/AG - SKILLS/x.md", None), ("AG - SKILLS", None), ("Nota.md", None),
])
def test_meta_folder_of(path, zone):
    assert ag_rules.meta_folder_of(path) == zone


@pytest.mark.parametrize("path,reserved", [
    ("AG - SKILLS", True), ("ag - skills.md", False), ("BITACORA", True), ("BITACORA.md", False), ("AG - SKILLS/x.md", False),
    ("Otra.md", False), ("sub/BITACORA.md", False),
])
def test_a_note_cannot_take_a_reserved_folder_name(path, reserved):
    assert (ag_rules.check_create(path) == "reserved-name:path") is reserved


def test_reserved_folder_is_not_moved_but_others_can_move_into_it():
    assert ag_rules.check_folder_move("AG - SKILLS") == "meta-folder:rename"
    assert ag_rules.check_folder_move("ag - agentes") == "meta-folder:rename"
    assert ag_rules.check_folder_move("AG - SKILLS/aira") is None
    assert ag_rules.check_folder_move("00 - AG - SKILLS") is None


def test_index_of_a_reserved_folder_is_never_deleted():
    assert ag_rules.check_index_delete("AG - MENSAJES/INDICE.md") == "meta-folder:index-delete"
    assert ag_rules.check_index_delete("AG - MENSAJES/liza/INDICE.md") is None
    assert ag_rules.check_index_delete("Otra/INDICE.md") is None


# --- Formato de AG - MENSAJES (E4) ---

@pytest.mark.parametrize("path,kind", [
    (CAB, "cabecera"), (MSG, "mensaje"), ("AG - MENSAJES/INDICE.md", "indice"),
    ("AG - MENSAJES/liza/INDICE.md", "indice"), ("AG - MENSAJES/liza/20261105-0930-x/INDICE.md", "indice"),
])
def test_valid_mensajes_paths(path, kind):
    assert ag_rules.parse_mensaje_path(path).kind == kind
    assert ag_rules.check_mensaje_path(path) is None


@pytest.mark.parametrize("path", [
    "AG - MENSAJES/nota.md", "AG - MENSAJES/liza/nota.md", "AG - MENSAJES/Liza/20261105-0930-x/000-cabecera.md",
    "AG - MENSAJES/liza/20261305-0930-x/000-cabecera.md",   # mes 13
    "AG - MENSAJES/liza/20261105-0930-/000-cabecera.md",    # asunto vacío
    "AG - MENSAJES/liza/20261105-0930-x/001-de-aira.txt", "AG - MENSAJES/liza/20261105-0930-x/000-de-aira.md",
    "AG - MENSAJES/liza/20261105-0930-x/1-de-aira.md", "AG - MENSAJES/liza/20261105-0930-x/sub/001-de-aira.md",
])
def test_invalid_mensajes_paths(path):
    assert ag_rules.check_mensaje_path(path) == "ag-mensajes:path"


def test_other_folders_are_not_checked_by_mensajes_rules():
    assert ag_rules.check_mensaje_path("Otra/nota.md") is None


def test_cabecera_metadata():
    info = ag_rules.parse_mensaje_path(CAB)
    ok = {"de": "aira", "para": "liza", "estado": "abierta"}
    assert ag_rules.check_cabecera(info, ok) is None
    for bad in [None, {}, {**ok, "para": "emma"}, {**ok, "estado": "pendiente"}, {**ok, "de": "Aira"}, {**ok, "de": 1}]:
        assert ag_rules.check_cabecera(info, bad) == "ag-mensajes:cabecera"


def test_message_note_from_must_match_the_file_name():
    info = ag_rules.parse_mensaje_path(MSG)
    assert ag_rules.check_mensaje_note(info, {"de": "aira"}) is None
    assert ag_rules.check_mensaje_note(info, None) is None
    assert ag_rules.check_mensaje_note(info, {"de": "emma"}) == "ag-mensajes:from-mismatch"


def test_server_stamps_cerrada_el():
    now = "2026-11-05T10:00:00.000000Z"
    opened = {"de": "a", "para": "b", "estado": "abierta", "cerrada_el": "2000-01-01T00:00:00.000000Z"}
    assert "cerrada_el" not in ag_rules.stamp_cabecera(None, opened, now)  # el cliente no la fija
    closed = {**opened, "estado": "cerrada"}
    assert ag_rules.stamp_cabecera({"estado": "abierta"}, closed, now)["cerrada_el"] == now
    already = {"estado": "cerrada", "cerrada_el": "2026-11-01T00:00:00.000000Z"}
    assert ag_rules.stamp_cabecera(already, closed, now)["cerrada_el"] == "2026-11-01T00:00:00.000000Z"
    assert "cerrada_el" not in ag_rules.stamp_cabecera(already, {**closed, "estado": "abierta"}, now)


def test_agent_message_rules():
    msg, cab = ag_rules.parse_mensaje_path(MSG), ag_rules.parse_mensaje_path(CAB)
    kw = dict(agent_id="aira", is_admin=False)
    old = {"de": "aira", "para": "liza", "estado": "abierta"}
    assert ag_rules.check_agent_mensaje_op("create", msg, **kw) is None
    assert ag_rules.check_agent_mensaje_op("create", ag_rules.parse_mensaje_path(MSG.replace("aira", "emma")), **kw) == "ag-mensajes:from-mismatch"
    assert ag_rules.check_agent_mensaje_op("create", cab, new_frontmatter=old, **kw) is None
    assert ag_rules.check_agent_mensaje_op("create", cab, new_frontmatter={**old, "de": "emma"}, **kw) == "ag-mensajes:from-mismatch"
    for op in ("update", "delete", "rename_or_move"):
        assert ag_rules.check_agent_mensaje_op(op, msg, **kw) == "ag-mensajes:immutable"
    assert ag_rules.check_agent_mensaje_op("delete", cab, old_frontmatter=old, **kw) == "ag-mensajes:immutable"
    closed = {**old, "estado": "cerrada"}
    assert ag_rules.check_agent_mensaje_op("update", cab, old_frontmatter=old, new_frontmatter=closed, **kw) is None
    assert ag_rules.check_agent_mensaje_op(
        "update", cab, old_frontmatter=old, new_frontmatter={**closed, "titulo": "otro"}, **kw) == "ag-mensajes:immutable"
    outsider = dict(agent_id="emma", is_admin=False)
    assert ag_rules.check_agent_mensaje_op("update", cab, old_frontmatter=old, new_frontmatter=closed, **outsider) == "ag-mensajes:forbidden"
    assert ag_rules.check_agent_mensaje_op("update", cab, old_frontmatter=old, new_frontmatter=closed, agent_id="emma", is_admin=True) is None
    assert ag_rules.check_agent_mensaje_op("update", cab, old_frontmatter=old, new_frontmatter=closed, agent_id="liza", is_admin=False) is None


# --- Registro y permisos (E6) ---

def _reg(agent, carpetas, estado="activo"):
    return Registration(agent, tuple(carpetas), estado)


REGISTRY = {
    "aira": _reg("aira", ["1 - Proyectos AIRA", "00- BITACORA"]),
    "emma": _reg("emma", ["*"]),
    "paused": _reg("paused", ["*"], "suspendido"),
}


def _agent(agent_id, admin=False):
    return Actor("agent", agent_id, admin, f"op-{agent_id}")


@pytest.mark.parametrize("agent,path,allowed,reason", [
    ("aira", "1 - Proyectos AIRA/x/n.md", True, None),
    ("aira", "2 - Proyectos Tukey/n.md", False, "folder-not-assigned"),
    ("aira", "1 - Proyectos AIRAx/n.md", False, "folder-not-assigned"),
    ("aira", "n.md", False, "folder-not-assigned"),
    ("aira", "AG - SKILLS/skill-a.md", True, None),  # H-041: un gestor escribe en AG - SKILLS; cada skill, solo su propietario
    ("aira", "AG - SKILLS/skill-boveda.md", True, None),
    ("aira", "AG - AGENTES/aira.md", False, "registry-readonly"),
    ("aira", "AG - MENSAJES/liza/20261105-0930-x/001-de-aira.md", True, None),
    ("aira", "BITACORA/x.md", False, "folder-not-assigned"),
    ("emma", "Plantillas/x.md", True, None),
    ("emma", "cualquier/cosa.md", True, None),
    ("emma", "AG - AGENTES/emma.md", False, "registry-readonly"),
    ("emma", "AG - SKILLS/skill-x.md", True, None),
    ("paused", "AG - SKILLS/skill-x.md", False, "suspended"),
    ("nadie", "AG - SKILLS/skill-x.md", False, "not-registered"),
    ("paused", "x.md", False, "suspended"),
    ("paused", "AG - MENSAJES/liza/20261105-0930-x/001-de-paused.md", True, None),
    ("nadie", "x.md", False, "not-registered"),
    ("nadie", "AG - MENSAJES/liza/20261105-0930-x/001-de-nadie.md", True, None),
])
def test_registered_and_unregistered_agents(agent, path, allowed, reason):
    verdict = decide(_agent(agent), REGISTRY, [path], honor_declared=False)
    assert (verdict.allowed, verdict.reason) == (allowed, reason)


def test_human_and_admin_agent_are_unrestricted_and_all_paths_must_pass():
    assert decide(Actor("human"), {}, ["AG - AGENTES/x.md"], honor_declared=False).allowed
    assert decide(_agent("main", admin=True), {}, ["AG - AGENTES/x.md"], honor_declared=False).allowed
    both = decide(_agent("aira"), REGISTRY, ["1 - Proyectos AIRA/a.md", "Otra/b.md"], honor_declared=False)
    assert not both.allowed  # un renombre que sale de su carpeta se rechaza aunque el origen sea suyo


def test_general_key_is_unregistered_unless_it_declares_an_agent_in_shadow():
    general = Actor("general", None, False, "OpenClaw", None)
    assert decide(general, REGISTRY, ["x.md"], honor_declared=False).reason == "general-key"
    declared = Actor("general", None, False, "OpenClaw", "emma")
    assert decide(declared, REGISTRY, ["x.md"], honor_declared=True).allowed
    assert decide(declared, REGISTRY, ["x.md"], honor_declared=False).reason == "general-key"
    # mensajes siempre se permiten, también a una clave general
    assert decide(general, REGISTRY, ["AG - MENSAJES/liza/20261105-0930-x/001-de-aira.md"], honor_declared=False).allowed


def test_files_need_an_active_registration():
    assert decide_files(_agent("aira"), REGISTRY, honor_declared=False).allowed
    assert decide_files(_agent("paused"), REGISTRY, honor_declared=False).reason == "suspended"
    assert decide_files(_agent("nadie"), REGISTRY, honor_declared=False).reason == "not-registered"
    assert decide_files(Actor("human"), {}, honor_declared=False).allowed


def test_registration_parsing():
    fm = {"estado": "activo", "carpetas": ["A/B", "*"], "agente": "aira"}
    assert parse_registration("AG - AGENTES/aira.md", fm) == Registration("aira", ("A/B", "*"), "activo")
    for path, frontmatter in [
        ("AG - AGENTES/aira.md", {**fm, "estado": "raro"}), ("AG - AGENTES/aira.md", {**fm, "carpetas": "A"}),
        ("AG - AGENTES/aira.md", {**fm, "carpetas": ["a//b"]}), ("AG - AGENTES/sub/aira.md", fm),
        ("Otra/aira.md", fm), ("AG - AGENTES/aira.md", None),
    ]:
        assert parse_registration(path, frontmatter) is None
        assert check_registration_frontmatter(path, frontmatter) == "ag-agentes:registro"
