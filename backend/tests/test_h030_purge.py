"""H-030 E7: purga de conversaciones cerradas de `AG - MENSAJES`, volcado y herramientas de carga."""
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest

from app.core.config import settings
from app.core.timestamps import TIMESTAMP_FORMAT
from app.routers.vaults import get_vault_port
from app.services import agent_access_guard, mensajes_purge
from tests.test_h030_api import HEAD, agent_client, find, patch, post_note, vault_of
from tests.test_notes_router import AUTH
from tests.test_vaults_api import stored_docs, user_db

NOW = datetime(2026, 11, 30, 12, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def _fresh_registry_cache():
    agent_access_guard._CACHE.clear()


def _conv(n: int) -> str:
    return f"AG - MENSAJES/liza/2026110{n}-0900-tema{n}"


def _set_frontmatter(db_name: str, note_id: str, vault_id: str, **changes):
    url = f"{settings.COUCHDB_URL}/{db_name}/note:{vault_id}:{note_id}"
    doc = httpx.get(url, auth=AUTH).json()
    doc["frontmatter"] = {k: v for k, v in {**doc["frontmatter"], **changes}.items() if v is not None}
    httpx.put(url, json=doc, auth=AUTH).raise_for_status()


def _closed_conversation(aira, db_name: str, vault_id: str, n: int, days_ago: float | None):
    """Conversación `n` cerrada; `days_ago=None` la deja abierta."""
    folder = _conv(n)
    assert post_note(aira, vault_id, f"{folder}/000-cabecera.md", frontmatter={**HEAD, "titulo": f"t{n}"}).status_code == 201
    assert post_note(aira, vault_id, f"{folder}/001-de-aira.md", "contenido").status_code == 201
    if days_ago is not None:
        head = find(aira, vault_id, f"{folder}/000-cabecera.md")
        assert patch(aira, vault_id, head, frontmatter={**HEAD, "titulo": f"t{n}", "estado": "cerrada"}).status_code == 200
        stamp = (NOW - timedelta(days=days_ago)).strftime(TIMESTAMP_FORMAT)
        _set_frontmatter(db_name, head["id"], vault_id, cerrada_el=stamp)
    return folder


def test_only_old_closed_conversations_are_purged_with_dump_and_log(ready_admin, db, tmp_path):
    vault_id, db_name, port = vault_of(ready_admin), user_db(db), get_vault_port()
    aira = agent_client(ready_admin, "aira")
    old = _closed_conversation(aira, db_name, vault_id, 1, 16)
    _closed_conversation(aira, db_name, vault_id, 2, 14)      # cerrada hace poco: se queda
    _closed_conversation(aira, db_name, vault_id, 3, None)     # abierta: se queda
    before = {k for k in stored_docs(db_name) if k.startswith("note")}

    plan = mensajes_purge.plan(port, db_name, vault_id, NOW)
    assert [c.folder for c in plan.candidates] == [old] and plan.alerts == []
    [candidate] = plan.candidates
    assert len(candidate.docs) == 3  # cabecera, mensaje e INDICE de la conversación

    dump = tmp_path / "20261130" / f"{vault_id}.jsonl"
    deleted = mensajes_purge.execute(port, db_name, "owner", vault_id, candidate, dump)
    assert deleted == len(candidate.docs)
    lines = [json.loads(line) for line in dump.read_text().splitlines()]
    assert {l["doc"]["path"] for l in lines} == {d["path"] for d in candidate.docs}
    assert any(l["doc"]["content"] == "contenido" for l in lines)

    after = {k for k in stored_docs(db_name) if k.startswith("note")}
    gone = before - after
    assert {k.split(":")[1] for k in gone if k.startswith("note:")} == {vault_id}
    paths_left = [i["path"] for i in ready_admin.get(f"/vaults/{vault_id}/notes", params={"limit": 200}).json()["items"]]
    assert not any(p.startswith(old) for p in paths_left)
    assert any(p.startswith(_conv(2)) for p in paths_left) and any(p.startswith(_conv(3)) for p in paths_left)
    # idempotente
    assert mensajes_purge.plan(port, db_name, vault_id, NOW).candidates == []
    # las rutas quedan libres: la misma conversación puede volver a crearse
    assert post_note(aira, vault_id, f"{old}/000-cabecera.md", frontmatter=HEAD).status_code == 201


def test_recipient_index_goes_with_its_last_conversation(ready_admin, db, tmp_path):
    vault_id, db_name, port = vault_of(ready_admin), user_db(db), get_vault_port()
    aira = agent_client(ready_admin, "aira")
    _closed_conversation(aira, db_name, vault_id, 1, 20)
    [candidate] = mensajes_purge.plan(port, db_name, vault_id, NOW).candidates
    mensajes_purge.execute(port, db_name, "owner", vault_id, candidate, tmp_path / "d.jsonl")
    paths = [i["path"] for i in ready_admin.get(f"/vaults/{vault_id}/notes", params={"limit": 200}).json()["items"]]
    assert not any(p.startswith("AG - MENSAJES/liza") for p in paths)


def test_closed_without_cerrada_el_is_ignored_and_alerted(ready_admin, db):
    vault_id, db_name, port = vault_of(ready_admin), user_db(db), get_vault_port()
    aira = agent_client(ready_admin, "aira")
    folder = _closed_conversation(aira, db_name, vault_id, 1, 30)
    head = find(aira, vault_id, f"{folder}/000-cabecera.md")
    _set_frontmatter(db_name, head["id"], vault_id, cerrada_el=None)
    plan = mensajes_purge.plan(port, db_name, vault_id, NOW)
    assert plan.candidates == [] and "sin cerrada_el" in plan.alerts[0]


def test_dumps_older_than_30_days_are_removed(tmp_path):
    for name in ("20261001", "20261101", "20261125", "no-es-fecha"):
        (tmp_path / name).mkdir()
        (tmp_path / name / "v.jsonl").write_text("x")
    removed = mensajes_purge.prune_dumps(tmp_path, NOW)
    assert removed == ["20261001"] and (tmp_path / "20261101").exists() and (tmp_path / "no-es-fecha").exists()


def test_load_tool_reports_collisions_in_dry_run():
    from importlib import util

    spec = util.spec_from_file_location("ensure_ag_folders", Path(__file__).parents[1] / "scripts/ensure_ag_folders.py")
    module = util.module_from_spec(spec)
    spec.loader.exec_module(module)
    notes = [
        {"path": "AG - SKILLS"}, {"path": "BITACORA.md"}, {"path": "AG - MENSAJES/suelta.md"}, {"path": "AG - MENSAJES/INDICE.md"},
        {"path": "AG - AGENTES/aira.md", "frontmatter": {"estado": "raro"}},
        {"path": "AG - AGENTES/emma.md", "frontmatter": {"estado": "activo", "carpetas": ["*"]}},
        {"path": "BITACORA/2026-11.md"}, {"path": "Normal/nota.md"},
    ]
    found = module.collisions(notes)
    # BITACORA ya no choca (H-030b: es del servidor, y `BITACORA.md` con extensión no tapa la carpeta).
    assert len(found) == 3
    assert any("nombre reservado" in f for f in found) and any("fuera del formato" in f for f in found)
    assert any("no es un registro válido" in f for f in found)
