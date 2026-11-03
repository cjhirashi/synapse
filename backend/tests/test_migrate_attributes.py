"""H-029: herramienta de migración de atributos con informe en seco."""
import hashlib
import importlib.util
import json
import tempfile
from pathlib import Path

import pytest

from app.core import attribute_rules


class FakeCouch:
    """Doble en memoria de CouchDB para pruebas."""

    def __init__(self):
        self.databases: dict[str, dict[str, dict]] = {}
        self.conflict_ids: set[str] = set()

    def add_db(self, name: str):
        self.databases[name] = {}

    def add_note(
        self,
        db: str,
        note_id: str,
        frontmatter: dict,
        content: str = "test content",
        created_at: str = "2026-07-06T00:00:00Z",
        updated_at: str = "2026-07-15T00:00:00Z",
        deleted_at=None,
        rev: str = "1-abc",
    ):
        doc = {
            "_id": note_id,
            "_rev": rev,
            "type": "note",
            "frontmatter": frontmatter,
            "content": content,
            "created_at": created_at,
            "updated_at": updated_at,
            "deleted_at": deleted_at,
        }
        self.databases[db][note_id] = doc

    def add_note_with_conflicts(self, db: str, note_id: str, frontmatter: dict):
        doc = {
            "_id": note_id,
            "_rev": "2-xyz",
            "type": "note",
            "frontmatter": frontmatter,
            "content": "test",
            "created_at": "2026-07-06T00:00:00Z",
            "updated_at": "2026-07-15T00:00:00Z",
            "deleted_at": None,
            "_conflicts": ["1-abc", "1-def"],
        }
        self.databases[db][note_id] = doc

    def mark_for_conflict(self, note_id: str):
        """Marca un ID para retornar 409 en put()."""
        self.conflict_ids.add(note_id)

    def list_dbs(self) -> list[str]:
        return sorted(list(self.databases.keys()))

    def note_docs(self, db: str) -> list[dict]:
        if db not in self.databases:
            return []
        docs = []
        for doc in self.databases[db].values():
            docs.append(doc)
        return docs

    def put(self, db: str, doc: dict) -> tuple[int, dict]:
        """Simula PUT, retorna (status_code, response)."""
        note_id = doc["_id"]
        if db not in self.databases:
            return 404, {"error": "not_found"}
        if note_id not in self.databases[db]:
            return 404, {"error": "not_found"}

        # Simular conflicto si está marcado
        if note_id in self.conflict_ids:
            self.conflict_ids.remove(note_id)
            return 409, {"error": "conflict"}

        existing = self.databases[db][note_id]
        if doc.get("_rev") != existing.get("_rev"):
            return 409, {"error": "conflict"}
        self.databases[db][note_id] = doc
        return 201, {"ok": True, "id": note_id, "rev": "2-new"}


@pytest.fixture
def fake_couch():
    return FakeCouch()


def load_migrate_script() -> object:
    """Carga el módulo migrate_attributes.py como si fuera una librería."""
    spec = importlib.util.spec_from_file_location(
        "migrate_attributes",
        Path(__file__).parent.parent / "scripts" / "migrate_attributes.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestReportMode:
    """Modo report: lectura, cálculos, generación de informe en seco."""

    def test_report_empty_databases(self, fake_couch, tmp_path):
        """Con bases vacías, el informe no escribe y report está vacío."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_db("synapse_user_bob")

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"

        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        assert report_file.exists()
        report = json.loads(report_file.read_text())
        assert report["total_notes"] == 0
        assert report["notes_changed"] == 0
        assert report["notes_unchanged"] == 0

    def test_report_live_notes_with_frontmatter(self, fake_couch, tmp_path):
        """Cuenta notas vivas con frontmatter no vacío."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"título": "Test", "tags": ["AI"]},
        )
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n2",
            {"título": "Test2"},
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"

        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        report = json.loads(report_file.read_text())
        assert report["total_notes"] == 2
        assert report["notes_changed"] == 2  # ambas migran

    def test_report_excludes_deleted_notes(self, fake_couch, tmp_path):
        """Excluye notas con deleted_at."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"título": "Live"},
        )
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n2",
            {"título": "Deleted"},
            deleted_at="2026-11-01T00:00:00Z",
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"

        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        report = json.loads(report_file.read_text())
        assert report["total_notes"] == 1

    def test_report_excludes_notes_with_conflicts(self, fake_couch, tmp_path):
        """Excluye y lista notas con _conflicts."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"título": "OK"},
        )
        fake_couch.add_note_with_conflicts(
            "synapse_user_alice",
            "note:vault1:conflict",
            {"título": "Has conflict"},
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"

        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        report = json.loads(report_file.read_text())
        assert report["total_notes"] == 1  # excluye el conflicto
        assert "note:vault1:conflict" in report.get("notes_with_conflicts", [])

    def test_report_excludes_notes_without_frontmatter(self, fake_couch, tmp_path):
        """Excluye notas con frontmatter vacío."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {},
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"

        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        report = json.loads(report_file.read_text())
        assert report["total_notes"] == 0

    def test_report_maps_source_keys(self, fake_couch, tmp_path):
        """Reporta cambio de claves (título -> titulo)."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"título": "Test", "status": "active"},
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"

        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        report = json.loads(report_file.read_text())
        assert report["source_keys"]["título"] == {
            "count": 1,
            "target": "titulo",
        }
        assert report["source_keys"]["status"] == {
            "count": 1,
            "target": "estado",
        }

    def test_report_tags_changed(self, fake_couch, tmp_path):
        """Reporta cambios en tags."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"tags": ["IA", "My Tag"]},
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"

        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        report = json.loads(report_file.read_text())
        tags_changed = report.get("tags_changed", {})
        assert tags_changed["count"] == 1
        assert len(tags_changed["examples"]) > 0

    def test_report_no_content_in_output(self, fake_couch, tmp_path):
        """No incluye content ni títulos en el informe."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"título": "Secret Title"},
            content="CENTINELA_CONTENT_123",
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"

        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        report_text = report_file.read_text()
        assert "CENTINELA_CONTENT_123" not in report_text
        assert "Secret Title" not in report_text

    def test_report_plan_digest(self, fake_couch, tmp_path):
        """Incluye plan_digest: sha256 de lista ordenada."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"título": "A"},
        )
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n2",
            {"título": "B"},
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"

        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        report = json.loads(report_file.read_text())
        assert "plan_digest" in report
        assert len(report["plan_digest"]) == 64  # sha256

    def test_report_estado_assignments(self, fake_couch, tmp_path):
        """Reporta valores de estado asignados y valores sin equivalente."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"status": "active"},
        )
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n2",
            {"status": "invalid_status"},
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"

        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        report = json.loads(report_file.read_text())
        estado_rep = report.get("estado", {})
        assert estado_rep.get("vigente", 0) == 1
        assert "_original_invalid_status" in estado_rep

    def test_report_only_db_filter(self, fake_couch, tmp_path):
        """--only-db filtra a una sola base."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_db("synapse_user_bob")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"título": "A"},
        )
        fake_couch.add_note(
            "synapse_user_bob",
            "note:vault2:n1",
            {"título": "B"},
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"

        migrate.run_report(fake_couch, report_file, summary_file, only_db="synapse_user_alice")

        report = json.loads(report_file.read_text())
        assert report["total_notes"] == 1


class TestApplyMode:
    """Modo apply: validar digest, escribir cambios, verificar."""

    def test_apply_validates_digest(self, fake_couch, tmp_path):
        """Apply aborta si digest difiere del informe."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"título": "Test"},
        )

        # Crear reporte
        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"
        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        # Modificar el estado: cambiar digest
        report = json.loads(report_file.read_text())
        report["plan_digest"] = "0" * 64
        report_file.write_text(json.dumps(report))

        # Apply debe abortar con código 2
        result = migrate.run_apply(fake_couch, report_file, dry_apply=False)
        assert result == 2

    def test_apply_conserves_fields(self, fake_couch, tmp_path):
        """Apply conserva updated_at, created_at, content."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"título": "Test"},
            content="ORIGINAL_CONTENT",
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-07-15T10:30:00Z",
        )

        # Crear reporte
        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"
        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        # Apply
        result = migrate.run_apply(fake_couch, report_file, dry_apply=False)
        assert result == 0

        # Verificar campos conservados
        doc = fake_couch.databases["synapse_user_alice"]["note:vault1:n1"]
        assert doc["content"] == "ORIGINAL_CONTENT"
        assert doc["created_at"] == "2026-01-01T00:00:00Z"
        assert doc["updated_at"] == "2026-07-15T10:30:00Z"
        assert doc["frontmatter"]["titulo"] == "Test"

    def test_apply_handles_409_and_continues(self, fake_couch, tmp_path):
        """Apply anota 409 y sigue sin abortar."""
        fake_couch.add_db("synapse_user_alice")
        # Nota 1: OK
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"título": "Test1"},
        )
        # Nota 2: simulamos 409
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n2",
            {"título": "Test2"},
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"
        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        # Marcar nota 2 para retornar 409 en put()
        fake_couch.mark_for_conflict("note:vault1:n2")

        result = migrate.run_apply(fake_couch, report_file, dry_apply=False)
        # Retorna 0 porque una nota se escribió y otra dio 409
        assert result == 0

    def test_apply_idempotent(self, fake_couch, tmp_path):
        """Segunda ejecución con notas ya migradas no escribe."""
        fake_couch.add_db("synapse_user_alice")
        # Nota ya migrada (en formato nuevo)
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"titulo": "Test"},
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"
        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        # El reporte debe estar vacío (sin cambios)
        report = json.loads(report_file.read_text())
        assert report["notes_changed"] == 0

        result = migrate.run_apply(fake_couch, report_file, dry_apply=False)
        assert result == 0

    def test_apply_already_migrated_note_unchanged(self, fake_couch, tmp_path):
        """Nota ya migrada no cambia."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"titulo": "Test"},  # ya en formato nuevo
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"
        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        report = json.loads(report_file.read_text())
        # El informe debe decir que no hay cambios
        assert report["notes_unchanged"] == 1

    def test_apply_dry_apply(self, fake_couch, tmp_path):
        """--dry-apply hace todo menos el PUT."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"título": "Test"},
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"
        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        rev_before = fake_couch.databases["synapse_user_alice"]["note:vault1:n1"]["_rev"]

        # Dry apply
        result = migrate.run_apply(fake_couch, report_file, dry_apply=True)
        assert result == 0

        # La revisión no cambió (no escribió)
        rev_after = fake_couch.databases["synapse_user_alice"]["note:vault1:n1"]["_rev"]
        assert rev_before == rev_after

    def test_apply_validates_after_write(self, fake_couch, tmp_path):
        """Tras escribir, verifica que updated_at, created_at y content sean iguales."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"título": "Test"},
            content="ORIGINAL",
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-07-15T10:30:00Z",
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"
        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        result = migrate.run_apply(fake_couch, report_file, dry_apply=False)
        assert result == 0

    def test_apply_detects_validation_failure(self, fake_couch, tmp_path):
        """Si una nota pasa migración pero falla validación, se detecta."""
        fake_couch.add_db("synapse_user_alice")
        # Nota con titulo muy largo (> 200 chars) que falla validate_general
        long_title = "A" * 201
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"titulo": long_title},
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"
        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        # El report debe decir que hay errores de validación
        report = json.loads(report_file.read_text())
        assert report["notes_with_validation_errors"] > 0


class TestRealFormats:
    """Pruebas con formatos reales de frontmatter."""

    def test_report_real_format_complete(self, fake_couch, tmp_path):
        """Formato real con todas las claves."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:readme",
            {
                "título": "Mi README",
                "descripción": "Guía de instalación",
                "tags": ["IA", "Mi Tag"],
                "status": "active",
                "tipo": "README",
                "fecha_creación": "2026-07-06",
                "última_actualización": "2026-07-15",
                "ruta": "a/b.md",
            },
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"
        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        report = json.loads(report_file.read_text())
        assert report["total_notes"] == 1
        assert report["notes_changed"] == 1

    def test_apply_real_format_complete(self, fake_couch, tmp_path):
        """Apply con formato real completo."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:readme",
            {
                "título": "Mi README",
                "descripción": "Guía de instalación",
                "tags": ["IA", "Mi Tag"],
                "status": "active",
                "tipo": "README",
            },
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"
        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        result = migrate.run_apply(fake_couch, report_file, dry_apply=False)
        assert result == 0

        # Verificar que el frontmatter se migró correctamente
        doc = fake_couch.databases["synapse_user_alice"]["note:vault1:readme"]
        fm = doc["frontmatter"]
        assert fm["titulo"] == "Mi README"
        assert fm["descripcion"] == "Guía de instalación"
        assert fm["tags"] == ["ia", "mi_tag"]
        assert fm["estado"] == "vigente"
        assert fm["tipo"] == "README"

    def test_report_minimal_format(self, fake_couch, tmp_path):
        """Formato mínimo: solo status."""
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note(
            "synapse_user_alice",
            "note:vault1:n1",
            {"status": "en-proceso"},
        )

        migrate = load_migrate_script()
        report_file = tmp_path / "report.json"
        summary_file = tmp_path / "summary.md"
        migrate.run_report(fake_couch, report_file, summary_file, only_db=None)

        report = json.loads(report_file.read_text())
        assert report["total_notes"] == 1
