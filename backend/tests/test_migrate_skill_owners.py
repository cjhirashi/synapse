"""Migración de `propietario` (texto → lista) y copropietarios por script: informe en seco, escritura idempotente y sin
tocar `version`, contenido ni `estado`."""
import importlib.util
from pathlib import Path

import pytest

from app.routers.vaults import get_vault_port
from tests.test_h030_api import agent_client, post_note, register, vault_of
from tests.test_h041_skills import SK, _fm
from tests.test_vaults_api import user_db
from app.core import skill_rules as sr
from app.services import agent_access_guard

_spec = importlib.util.spec_from_file_location(
    "migrate_skill_owners", Path(__file__).resolve().parents[1] / "scripts" / "migrate_skill_owners.py")
migrate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migrate)


@pytest.fixture(autouse=True)
def _fresh_registry_cache():
    agent_access_guard._CACHE.clear()
    yield
    agent_access_guard._CACHE.clear()


def _legacy(db, vault_id, note_id, owner):
    """Deja la skill con `propietario` de texto, como estaba antes de la lista."""
    port = get_vault_port()
    doc = port.get(user_db(db), f"note:{vault_id}:{note_id}")
    doc["frontmatter"]["propietario"] = owner
    port.put(user_db(db), doc)


def test_migration_turns_text_into_a_list_and_adds_the_co_owner_only_where_asked(ready_admin, db):
    vault_id = vault_of(ready_admin)
    for agent in ("paulina", "fedora", "aira"):
        register(ready_admin, vault_id, agent, ["*"])
    clients = {a: agent_client(ready_admin, a) for a in ("paulina", "fedora", "aira")}
    ids = {}
    for name, owner in (("uno", "paulina"), ("dos", "paulina"), ("tres", "aira")):
        res = post_note(clients[owner], vault_id, f"{SK}/{name}", "# cuerpo", _fm(version="1.2.3"))
        ids[name] = res.json()["id"]
        _legacy(db, vault_id, ids[name], owner)
    port = get_vault_port()
    spec = {vault_id: {"paulina": ["fedora"]}}
    dry = migrate.run(port, apply=False, email=None, only_vault=vault_id, coowner=spec)
    assert [(s["path"].rsplit("/", 1)[1], s["antes"], s["despues"]) for s in dry[0]["skills"]] == [
        ("skill-dos.md", "paulina", ["paulina", "fedora"]), ("skill-tres.md", "aira", ["aira"]),
        ("skill-uno.md", "paulina", ["paulina", "fedora"])]
    assert all(not s["no_gestores"] for s in dry[0]["skills"])
    assert port.get(user_db(db), f"note:{vault_id}:{ids['uno']}")["frontmatter"]["propietario"] == "paulina"  # en seco no escribe

    done = migrate.run(port, apply=True, email=None, only_vault=vault_id, coowner=spec)
    assert len(done[0]["skills"]) == 3 and all(s["escrita"] for s in done[0]["skills"])
    for name, expected in (("uno", ["paulina", "fedora"]), ("dos", ["paulina", "fedora"]), ("tres", ["aira"])):
        note = ready_admin.get(f"/vaults/{vault_id}/notes/{ids[name]}").json()
        assert note["frontmatter"]["propietario"] == expected
        assert note["frontmatter"]["version"] == "1.2.3" and note["frontmatter"]["estado"] == "borrador"
        assert note["content"] == "# cuerpo"
    # Idempotente.
    assert migrate.run(port, apply=True, email=None, only_vault=vault_id, coowner=spec) == []
    # Fedora edita una skill de Paulina; una ajena (de aira) no.
    fedora = clients["fedora"]
    from app.core.config import settings
    from tests.test_h030_api import patch

    settings.AGENT_ACCESS_MODE = "enforce"
    try:
        ok = ready_admin.get(f"/vaults/{vault_id}/notes/{ids['uno']}")
        assert patch(fedora, vault_id, {"id": ids["uno"], "etag": ok.headers["ETag"]}, content="de fedora").status_code == 200
        other = ready_admin.get(f"/vaults/{vault_id}/notes/{ids['tres']}")
        assert patch(fedora, vault_id, {"id": ids["tres"], "etag": other.headers["ETag"]}, content="x").status_code == 403
    finally:
        settings.AGENT_ACCESS_MODE = "shadow"
    assert sr.owners_of(port.get(user_db(db), f"note:{vault_id}:{ids['uno']}")["frontmatter"]) == ["paulina", "fedora"]
