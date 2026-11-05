"""H-030 E3/E4/E6: reglas puras de carpetas reservadas, mensajes y permisos (sin E/S)."""
import pytest

from app.core import ag_rules
from app.core.agent_access import (
    Actor, Registration, check_registration_frontmatter, decide, decide_files, parse_registration,
)


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
    assert ag_rules.check_index_delete("AG - MENSAJES/aira → liza - x - 2026-11-05/INDICE.md") is None
    assert ag_rules.check_index_delete("Otra/INDICE.md") is None


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
