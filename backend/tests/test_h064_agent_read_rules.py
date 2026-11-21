"""H-064 F3c: campo `lectura` del registro y motor puro `agent_level_of` (sin E/S)."""
import pytest

from app.core.agent_access import Registration, parse_registration
from app.core.vault_access import Grant, MemberAccess, agent_level_of


# --- Parseo de `lectura` ---

@pytest.mark.parametrize("frontmatter,expected_lectura", [
    ({"estado": "activo", "carpetas": [], "lectura": None}, ("*",)),
    ({"estado": "activo", "carpetas": [], "lectura": ["*"]}, ("*",)),
    ({"estado": "activo", "carpetas": [], "lectura": ["A", "B"]}, ("A", "B")),
    ({"estado": "activo", "carpetas": [], "lectura": []}, ()),
])
def test_parse_lectura_valid(frontmatter, expected_lectura):
    reg = parse_registration("AG - AGENTES/test.md", frontmatter)
    assert reg is not None and reg.lectura == expected_lectura


@pytest.mark.parametrize("frontmatter", [
    {"estado": "activo", "carpetas": [], "lectura": "no es lista"},
    {"estado": "activo", "carpetas": [], "lectura": ["a//b"]},
    {"estado": "activo", "carpetas": [], "lectura": [""]},
    {"estado": "activo", "carpetas": [], "lectura": [123]},
])
def test_parse_lectura_invalid(frontmatter):
    assert parse_registration("AG - AGENTES/test.md", frontmatter) is None


# --- Motor `agent_level_of` sin techo (propietario) ---

@pytest.mark.parametrize("carpetas,lectura,path,expected", [
    # Escritura incluye lectura
    (("Pub",), ("*",), "Pub/x.md", "escritura"),
    (("Pub",), ("*",), "Otra/x.md", "lectura"),  # `*` en lectura cubre todo
    (("Pub",), (), "Pub/x.md", "escritura"),
    (("Pub",), (), "Otra/x.md", None),  # Otra no está ni en carpetas ni en lectura
    # Lectura pura
    ((), ("A",), "A/x.md", "lectura"),
    ((), ("A",), "B/x.md", None),
    ((), ("A", "B"), "A/x.md", "lectura"),
    ((), ("A", "B"), "B/y.md", "lectura"),
    ((), ("A", "B"), "C/z.md", None),
    # Comodín en carpetas
    (("*",), (), "Cualquier/cosa.md", "escritura"),
    (("*",), ("*",), "Cualquier/cosa.md", "escritura"),
    # Comodín en lectura
    ((), ("*",), "Cualquier/cosa.md", "lectura"),
])
def test_agent_level_of_no_ceiling(carpetas, lectura, path, expected):
    result = agent_level_of(carpetas, lectura, None, path)
    assert result == expected


# --- Motor `agent_level_of` con techo (invitado) ---

def test_agent_level_of_with_ceiling_read_only():
    """Techo solo lectura en Pub: aunque el agente escriba en `*`, solo lee en Pub y nada fuera de él."""
    ceiling = MemberAccess((Grant("Pub", "lectura"),))
    result = agent_level_of(("*",), ("*",), ceiling, "Pub/x.md")
    assert result == "lectura"  # El techo es lectura, baja el acceso
    result = agent_level_of(("*",), ("*",), ceiling, "Otra/x.md")
    assert result is None  # Otra no está en el techo


def test_agent_level_of_with_ceiling_write():
    """Techo escritura en Pub: el agente con escritura en `*` escribe en Pub."""
    ceiling = MemberAccess((Grant("Pub", "escritura"),))
    result = agent_level_of(("*",), ("*",), ceiling, "Pub/x.md")
    assert result == "escritura"


def test_agent_level_of_with_ceiling_read_only_agent():
    """Agente de solo lectura: lee en Pub (su techo) y nada fuera de él."""
    ceiling = MemberAccess((Grant("Pub", "lectura"),))
    result = agent_level_of((), ("*",), ceiling, "Pub/x.md")
    assert result == "lectura"
    result = agent_level_of((), ("*",), ceiling, "Otra/x.md")
    assert result is None


def test_a_read_only_agent_under_a_write_ceiling_cannot_write():
    ceiling = MemberAccess((Grant("Pub", "escritura"),))
    assert agent_level_of((), ("*",), ceiling, "Pub/x.md") == "lectura"
    assert agent_level_of(("Pub",), (), ceiling, "Pub/x.md") == "escritura"
    assert agent_level_of(("Otra",), (), ceiling, "Otra/x.md") is None  # el techo no cubre Otra: ni lee


def test_agent_level_of_with_ceiling_hides_reserved():
    """Aunque el techo sea `*`, las zonas reservadas del propietario no se ven."""
    ceiling = MemberAccess((Grant("*", "lectura"),))
    result = agent_level_of(("*",), ("*",), ceiling, "AG - AGENTES/x.md")
    assert result is None  # Zona oculta


def test_agent_level_of_with_ceiling_star_means_guest_scope():
    """`lectura=("*",)` con techo = exactamente el alcance del invitado."""
    ceiling = MemberAccess((Grant("Public", "lectura"), Grant("Shared", "lectura")))
    result = agent_level_of((), ("*",), ceiling, "Public/x.md")
    assert result == "lectura"
    result = agent_level_of((), ("*",), ceiling, "Shared/x.md")
    assert result == "lectura"
    result = agent_level_of((), ("*",), ceiling, "Private/x.md")
    assert result is None


# --- API del registro (H-064 F3c): `lectura` se guarda, se conserva y se valida ---

def _put(admin, vault_id, **body):
    body.setdefault("carpetas", ["Pub"])
    return admin.put(f"/vaults/{vault_id}/agent-access/aira", json=body)


def test_put_without_lectura_stores_the_default_and_get_returns_it(ready_admin):
    from tests.test_h030_api import vault_of

    vault_id = vault_of(ready_admin)
    res = _put(ready_admin, vault_id)
    assert res.status_code == 200, res.text
    assert res.json()["lectura"] == ["*"]
    (agent,) = ready_admin.get(f"/vaults/{vault_id}/agent-access").json()["agents"]
    assert agent["lectura"] == ["*"] and agent["carpetas"] == ["Pub"]


def test_put_with_lectura_stores_it_and_a_later_put_without_it_keeps_it(ready_admin):
    from tests.test_h030_api import vault_of

    vault_id = vault_of(ready_admin)
    assert _put(ready_admin, vault_id, lectura=["A", "B/C"]).json()["lectura"] == ["A", "B/C"]
    kept = _put(ready_admin, vault_id, carpetas=["Otra"], estado="suspendido")
    assert kept.status_code == 200, kept.text
    assert kept.json()["lectura"] == ["A", "B/C"] and kept.json()["estado"] == "suspendido"
    (agent,) = ready_admin.get(f"/vaults/{vault_id}/agent-access").json()["agents"]
    assert agent["lectura"] == ["A", "B/C"] and agent["carpetas"] == ["Otra"]
    assert _put(ready_admin, vault_id, lectura=[]).json()["lectura"] == []


def test_a_bad_lectura_is_rejected_by_the_put_and_by_a_hand_edited_note(ready_admin):
    from tests.test_h030_api import detail, post_note, vault_of

    vault_id = vault_of(ready_admin)
    assert _put(ready_admin, vault_id, lectura=["a//b"]).status_code == 422
    assert _put(ready_admin, vault_id, lectura=[""]).status_code == 422
    assert ready_admin.get(f"/vaults/{vault_id}/agent-access").json()["agents"] == []
    res = post_note(ready_admin, vault_id, "AG - AGENTES/aira.md", frontmatter={"estado": "activo", "carpetas": [], "lectura": "A"})
    assert res.status_code == 422 and detail(res) == "ag-agentes:registro"


def test_a_hand_written_registry_note_without_lectura_reads_as_the_default(ready_admin):
    from tests.test_h030_api import post_note, vault_of

    vault_id = vault_of(ready_admin)
    assert post_note(ready_admin, vault_id, "AG - AGENTES/aira.md", frontmatter={"estado": "activo", "carpetas": ["Pub"]}).status_code == 201
    (agent,) = ready_admin.get(f"/vaults/{vault_id}/agent-access").json()["agents"]
    assert agent["lectura"] == ["*"]
