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
        self.mutate_after_put: dict[str, dict] = {}
        self.put_status: dict[str, int] = {}
        self.puts = 0
        self.note_docs_calls = 0
        self.listing_error: Exception | None = None

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
        if self.listing_error:
            raise self.listing_error
        return sorted(list(self.databases.keys()))

    def get_doc(self, db: str, doc_id: str):
        doc = self.databases.get(db, {}).get(doc_id)
        return json.loads(json.dumps(doc)) if doc else None

    def note_docs(self, db: str) -> list[dict]:
        self.note_docs_calls += 1
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

        if note_id in self.put_status:
            return self.put_status[note_id], {"error": "boom"}
        existing = self.databases[db][note_id]
        if doc.get("_rev") != existing.get("_rev"):
            return 409, {"error": "conflict"}
        self.puts += 1
        stored = {**doc, "_rev": f"{self.puts + 1}-new", **self.mutate_after_put.get(note_id, {})}
        self.databases[db][note_id] = stored
        return 201, {"ok": True, "id": note_id, "rev": stored["_rev"]}


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


class TestApplySafety:
    """Seguridad de `apply`: lo que se relee debe coincidir, los fallos no se tragan y el resumen es claro."""

    def _prepared(self, fake_couch, tmp_path, **notes):
        migrate = load_migrate_script()
        fake_couch.add_db("synapse_user_alice")
        for note_id, fm in (notes or {"n1": {"título": "Hola", "status": "active"}}).items():
            fake_couch.add_note("synapse_user_alice", f"note:v:{note_id}", fm, content="CUERPO", updated_at="2026-07-15T10:30:00Z")
        report = tmp_path / "r.json"
        migrate.run_report(fake_couch, report, tmp_path / "s.md", only_db=None)
        return migrate, report

    def test_a_note_whose_reread_updated_at_differs_is_reported_and_exit_is_3(self, fake_couch, tmp_path, capsys):
        migrate, report = self._prepared(fake_couch, tmp_path)
        fake_couch.mutate_after_put["note:v:n1"] = {"updated_at": "2099-01-01T00:00:00Z"}
        assert migrate.run_apply(fake_couch, report) == 3
        assert "updated_at" in capsys.readouterr().out

    def test_a_note_whose_reread_content_differs_is_reported(self, fake_couch, tmp_path, capsys):
        migrate, report = self._prepared(fake_couch, tmp_path)
        fake_couch.mutate_after_put["note:v:n1"] = {"content": "OTRO"}
        assert migrate.run_apply(fake_couch, report) == 3
        assert "content" in capsys.readouterr().out

    def test_a_reread_frontmatter_that_is_not_the_planned_one_is_reported(self, fake_couch, tmp_path):
        migrate, report = self._prepared(fake_couch, tmp_path)
        fake_couch.mutate_after_put["note:v:n1"] = {"frontmatter": {"titulo": "otro"}}
        assert migrate.run_apply(fake_couch, report) == 3

    def test_summary_counts_written_409_and_conflicted(self, fake_couch, tmp_path, capsys):
        migrate, report = self._prepared(fake_couch, tmp_path, a={"título": "A"}, b={"título": "B"})
        fake_couch.add_note_with_conflicts("synapse_user_alice", "note:v:c", {"título": "C"})
        fake_couch.mark_for_conflict("note:v:b")
        assert migrate.run_apply(fake_couch, report) == 0
        out = capsys.readouterr().out
        assert "Escritas: 1" in out and "409 (cambió entretanto): 1" in out and "omitidas por conflictos: 1" in out

    def test_a_write_error_other_than_409_exits_4_and_is_listed(self, fake_couch, tmp_path, capsys):
        migrate, report = self._prepared(fake_couch, tmp_path)
        fake_couch.put_status["note:v:n1"] = 500
        assert migrate.run_apply(fake_couch, report) == 4
        assert "note:v:n1: HTTP 500" in capsys.readouterr().out

    def test_the_plan_reads_each_database_once_not_once_per_note(self, fake_couch, tmp_path):
        notes = {f"n{i}": {"título": f"T{i}"} for i in range(6)}
        migrate, report = self._prepared(fake_couch, tmp_path, **notes)
        fake_couch.note_docs_calls = 0
        assert migrate.run_apply(fake_couch, report) == 0
        assert fake_couch.note_docs_calls == 1

    def test_a_note_edited_after_the_report_aborts_with_2_and_writes_nothing(self, fake_couch, tmp_path):
        migrate, report = self._prepared(fake_couch, tmp_path)
        fake_couch.databases["synapse_user_alice"]["note:v:n1"]["_rev"] = "9-edited"
        assert migrate.run_apply(fake_couch, report) == 2
        assert fake_couch.puts == 0

    def test_a_second_run_writes_nothing_and_says_so(self, fake_couch, tmp_path, capsys):
        migrate, report = self._prepared(fake_couch, tmp_path)
        assert migrate.run_apply(fake_couch, report) == 0
        puts = fake_couch.puts
        capsys.readouterr()
        assert migrate.run_apply(fake_couch, report) == 0
        assert fake_couch.puts == puts
        assert "Nada que migrar" in capsys.readouterr().out

    def test_a_dry_apply_does_not_write(self, fake_couch, tmp_path):
        migrate, report = self._prepared(fake_couch, tmp_path)
        assert migrate.run_apply(fake_couch, report, dry_apply=True) == 0
        assert fake_couch.puts == 0


class TestFailLoudly:
    """CouchDB caído o con error no puede parecer «sin notas»."""

    def test_the_report_raises_when_couchdb_fails(self, fake_couch, tmp_path):
        migrate = load_migrate_script()
        fake_couch.listing_error = migrate.CouchError("GET _all_dbs: HTTP 500")
        with pytest.raises(migrate.CouchError):
            migrate.run_report(fake_couch, tmp_path / "r.json", tmp_path / "s.md", only_db=None)

    def test_the_client_raises_on_http_500_and_returns_404_and_409(self, monkeypatch):
        from urllib.error import HTTPError

        migrate = load_migrate_script()
        client = migrate.CouchClient("http://x:5984", "u", "p")

        def boom(code):
            def _open(*_a, **_k):
                raise HTTPError("http://x", code, "err", {}, None)
            return _open

        monkeypatch.setattr(migrate, "urlopen", boom(500))
        with pytest.raises(migrate.CouchError):
            client.list_dbs()
        monkeypatch.setattr(migrate, "urlopen", boom(404))
        assert client.get_doc("synapse_user_a", "note:v:n") is None
        monkeypatch.setattr(migrate, "urlopen", boom(409))
        assert client.put("synapse_user_a", {"_id": "note:v:n", "_rev": "1-a"})[0] == 409

    def test_the_command_requires_the_couchdb_variables(self, monkeypatch, tmp_path):
        migrate = load_migrate_script()
        for key in ("COUCHDB_URL", "COUCHDB_USER", "COUCHDB_PASSWORD"):
            monkeypatch.delenv(key, raising=False)
        monkeypatch.setattr("sys.argv", ["x", "--mode", "report", "--report-file", str(tmp_path / "r"), "--summary-file", str(tmp_path / "s")])
        with pytest.raises(SystemExit) as exc:
            migrate.main()
        assert exc.value.code == 2


class TestReportTargets:
    def test_destinations_use_the_normalized_key(self, fake_couch, tmp_path):
        migrate = load_migrate_script()
        fake_couch.add_db("synapse_user_alice")
        fake_couch.add_note("synapse_user_alice", "note:v:n1", {
            "Estado": "Activo", "fecha_creación": "2026-07-06", "última_actualización": "2026-07-15",
            "ruta": "a/b.md", "título": "T", "categoría": "c"})
        migrate.run_report(fake_couch, tmp_path / "r.json", tmp_path / "s.md", only_db=None)
        keys = json.loads((tmp_path / "r.json").read_text())["source_keys"]
        assert keys["Estado"]["target"] == "estado"
        assert keys["fecha_creación"]["target"] == "fecha_creacion_original"
        assert keys["última_actualización"]["target"] == "fecha_actualizacion_original"
        assert keys["ruta"]["target"] == "ruta_original"
        assert keys["categoría"]["target"] is None
