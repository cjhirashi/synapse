"""H-031: la herramienta de migración borra la lista indicada y crea un INDICE por carpeta."""
import importlib.util
from pathlib import Path

from tests.test_note_content_service import DB, VAULT, _put_note, _put_vault
from tests.test_vault_service import InMemoryVaultPort

_spec = importlib.util.spec_from_file_location("migrate_indices", Path(__file__).parents[1] / "scripts" / "migrate_indices.py")
migrate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migrate)


def _paths(port) -> list[str]:
    return sorted(d["path"] for d in port.docs[DB].values() if d.get("type") == "note" and not d.get("deleted_at"))


def _setup():
    port = InMemoryVaultPort()
    _put_vault(port)
    docs = {p: _put_note(port, p) for p in ["A/README.md", "A/Nota.md", "B/README.md", "Sin título.md", "Raiz.md"]}
    return port, docs


def test_dry_run_reports_and_changes_nothing():
    port, docs = _setup()
    doomed = {docs["A/README.md"]["_id"], docs["B/README.md"]["_id"]}
    report = migrate.run(port, DB, doomed, apply=False)
    assert report["a_borrar"] == 2 and report["carpetas"] == 3  # "", "A" y "B" (B se conserva con su INDICE)
    assert len(_paths(port)) == 5


def test_apply_deletes_listed_notes_and_creates_one_index_per_folder():
    port, docs = _setup()
    doomed = {docs["A/README.md"]["_id"], docs["B/README.md"]["_id"], docs["Sin título.md"]["_id"]}
    report = migrate.run(port, DB, doomed, apply=True)
    assert report["rechazados"] == []
    assert _paths(port) == ["A/INDICE.md", "A/Nota.md", "B/INDICE.md", "INDICE.md", "Raiz.md"]
    assert migrate.run(port, DB, set(), apply=True)["a_borrar"] == 0
    assert _paths(port).count("INDICE.md") == 1


def test_already_absent_notes_are_counted_not_failed():
    port, docs = _setup()
    gone = {f"note:{VAULT}:00000000-0000-4000-8000-000000000000"}
    assert migrate.run(port, DB, gone, apply=True)["ya_ausentes"] == 1
