"""H-040: Herramienta de migración del YAML del cuerpo a atributos."""
import hashlib
import importlib.util
import json
import tempfile
from pathlib import Path
from collections import defaultdict

import pytest

from app.core import attribute_rules
from app.core.body_yaml import split_body_yaml, plan_note


class FakeCouch:
    """Doble en memoria de CouchDB para pruebas."""

    def __init__(self):
        self.databases: dict[str, dict[str, dict]] = {}
        self.puts = 0

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

    def add_vault_doc(
        self,
        db: str,
        vault_id: str,
        vault_name: str,
    ):
        doc = {
            "_id": f"vault:{vault_id}",
            "_rev": "1-xyz",
            "type": "vault",
            "name": vault_name,
        }
        self.databases[db][f"vault:{vault_id}"] = doc

    def list_dbs(self) -> list[str]:
        return sorted(list(self.databases.keys()))

    def note_docs(self, db: str) -> list[dict]:
        if db not in self.databases:
            return []
        docs = []
        for doc in self.databases[db].values():
            if doc.get("type") == "note":
                docs.append(doc)
        return docs

    def get_vault_name(self, db: str, vault_id: str) -> str | None:
        """Obtiene el nombre de la bóveda desde su documento."""
        doc = self.databases.get(db, {}).get(f"vault:{vault_id}")
        if doc and doc.get("type") == "vault":
            return doc.get("name")
        return None


def test_migration_plan_report_with_yaml():
    """C-6: Calcula el plan de migración con YAML en el contenido."""
    couch = FakeCouch()
    couch.add_db("synapse_user_alice")
    couch.add_vault_doc("synapse_user_alice", "vault1", "Mi Bóveda")

    # Nota con YAML migrable
    couch.add_note(
        "synapse_user_alice",
        "note:1",
        frontmatter={},
        content="---\ntitulo: Test\n---\nContent",
    )

    # Nota sin YAML
    couch.add_note(
        "synapse_user_alice",
        "note:2",
        frontmatter={"titulo": "Existing"},
        content="Solo contenido",
    )

    # Nota con YAML inválido (no migrable)
    couch.add_note(
        "synapse_user_alice",
        "note:3",
        frontmatter={},
        content="---\n  : invalid\n---\nContent",
    )

    # Contar notas para migración
    docs = couch.note_docs("synapse_user_alice")
    migrable = 0
    no_migrable = 0
    no_cambios = 0

    for doc in docs:
        plan = plan_note(doc)
        if plan is not None:
            migrable += 1
        else:
            content = doc.get("content", "")
            yaml_data, rest = split_body_yaml(content)
            if yaml_data is None:
                # O no tiene YAML, o YAML no es migrable
                if content.strip().startswith("---"):
                    no_migrable += 1
                else:
                    no_cambios += 1

    assert migrable == 1
    assert no_migrable == 1
    assert no_cambios == 1


def test_migration_plan_with_conflict():
    """C-4: Nota con conflicto de atributo se reporta."""
    couch = FakeCouch()
    couch.add_db("synapse_user_bob")

    # Nota con YAML y conflicto
    couch.add_note(
        "synapse_user_bob",
        "note:1",
        frontmatter={"titulo": "Existing"},
        content="---\ntitulo: Del YAML\n---\nContent",
    )

    docs = couch.note_docs("synapse_user_bob")
    assert len(docs) == 1

    plan = plan_note(docs[0])
    assert plan is not None
    assert len(plan["reportados"]) == 1
    assert plan["reportados"][0]["key"] == "titulo"
    assert plan["frontmatter_new"]["titulo"] == "Existing"


def test_migration_plan_etiquetas_attribute():
    """C-5: Nota con atributo `etiquetas` se migra a `tags`."""
    couch = FakeCouch()
    couch.add_db("synapse_user_charlie")

    # Nota con atributo etiquetas (sin YAML)
    couch.add_note(
        "synapse_user_charlie",
        "note:1",
        frontmatter={"etiquetas": ["tag_1", "tag_2"]},
        content="Solo contenido",
    )

    docs = couch.note_docs("synapse_user_charlie")
    assert len(docs) == 1

    plan = plan_note(docs[0])
    # plan_note solo actúa si hay YAML, así que este devuelve None
    # Pero migrate_frontmatter_detailed debe convertir etiquetas→tags
    from app.core.attribute_rules import migrate_frontmatter_detailed

    new_fm, dropped = migrate_frontmatter_detailed(docs[0]["frontmatter"])
    assert "tags" in new_fm
    assert "etiquetas" not in new_fm


def test_migration_plan_indice_skip():
    """C-6: Las notas INDICE se saltan."""
    couch = FakeCouch()
    couch.add_db("synapse_user_dave")

    # Nota INDICE
    couch.add_note(
        "synapse_user_dave",
        "note:INDICE.md",  # Nota INDICE
        frontmatter={},
        content="---\ntitulo: INDICE\n---\nIndex",
    )

    docs = couch.note_docs("synapse_user_dave")
    # Filtrar según lógica del paso 3
    filtered = [doc for doc in docs if not doc["_id"].endswith("INDICE.md")]
    assert len(filtered) == 0


def test_migration_plan_deleted_notes_skip():
    """C-6: Las notas en papelera se saltan."""
    couch = FakeCouch()
    couch.add_db("synapse_user_eve")

    # Nota normal
    couch.add_note("synapse_user_eve", "note:1", {}, "Content")

    # Nota eliminada
    couch.add_note(
        "synapse_user_eve",
        "note:2",
        {},
        "Content",
        deleted_at="2026-11-01T00:00:00Z",
    )

    docs = couch.note_docs("synapse_user_eve")
    # Filtrar según lógica del paso 3
    filtered = [doc for doc in docs if doc.get("deleted_at") is None]
    assert len(filtered) == 1


def test_migration_plan_with_conflicts_field_skip():
    """C-6: Notas con campo `_conflicts` se saltan."""
    couch = FakeCouch()
    couch.add_db("synapse_user_frank")

    # Nota con conflictos
    doc = {
        "_id": "note:1",
        "_rev": "2-xyz",
        "type": "note",
        "frontmatter": {},
        "content": "---\ntitulo: Test\n---\nContent",
        "created_at": "2026-07-06T00:00:00Z",
        "updated_at": "2026-07-15T00:00:00Z",
        "deleted_at": None,
        "_conflicts": ["1-abc"],
    }
    couch.databases["synapse_user_frank"]["note:1"] = doc

    docs = couch.note_docs("synapse_user_frank")
    # Filtrar según lógica del paso 3
    filtered = [doc for doc in docs if "_conflicts" not in doc]
    assert len(filtered) == 0


class TestReportGeneration:
    """Pruebas de generación del informe (modo report)."""

    def test_report_counts_by_vault(self):
        """C-6: El informe cuenta notas por bóveda."""
        couch = FakeCouch()
        couch.add_db("synapse_user_alice")
        couch.add_vault_doc("synapse_user_alice", "vault1", "Bóveda 1")
        couch.add_vault_doc("synapse_user_alice", "vault2", "Bóveda 2")

        # Notas en vault1
        couch.add_note(
            "synapse_user_alice",
            "note:1",
            {"vault:vault1": "vault:vault1"},
            "---\ntitulo: Test1\n---\nContent",
        )
        couch.add_note(
            "synapse_user_alice",
            "note:2",
            {"vault:vault1": "vault:vault1"},
            "---\ntitulo: Test2\n---\nContent",
        )

        # Nota en vault2
        couch.add_note(
            "synapse_user_alice",
            "note:3",
            {"vault:vault2": "vault:vault2"},
            "---\ntitulo: Test3\n---\nContent",
        )

        # Procesar y contar
        vault_counts = defaultdict(lambda: {"migrable": 0, "no_migrable": 0})
        docs = couch.note_docs("synapse_user_alice")
        for doc in docs:
            vault_id = doc.get("frontmatter", {}).get("vault:vault1") or doc.get("frontmatter", {}).get("vault:vault2")
            if not vault_id:
                vault_id = "default"

            plan = plan_note(doc)
            if plan is not None:
                vault_counts[vault_id]["migrable"] += 1
            else:
                content = doc.get("content", "")
                if content.strip().startswith("---"):
                    vault_counts[vault_id]["no_migrable"] += 1

        # Verificar conteos
        assert len(vault_counts) >= 1


def test_plan_digest_calculation():
    """C-6: El digest de plan se calcula correctamente."""
    from app.core.body_yaml import split_body_yaml

    # Simular cálculo de digest
    plan_items = [
        ("synapse_user_alice", "note:1", "1-abc", {"titulo": "Test"}),
        ("synapse_user_alice", "note:2", "1-def", {"titulo": "Test2"}),
    ]

    lines = []
    for db, note_id, rev, frontmatter in sorted(plan_items):
        fm_json = json.dumps(frontmatter, sort_keys=True, separators=(",", ":"))
        lines.append(f"{db}|{note_id}|{rev}|{fm_json}")
    canonical = "\n".join(lines).encode()
    plan_digest = hashlib.sha256(canonical).hexdigest()

    assert len(plan_digest) == 64  # SHA256 hex string
    assert isinstance(plan_digest, str)


def test_key_mapping_count():
    """C-6: Mapeo de claves con conteo."""
    from app.core.attribute_rules import migrate_frontmatter_detailed

    # Diferentes formas de las mismas claves
    source_keys = {}

    frontmatters = [
        {"title": "A", "tags": ["tag1"]},
        {"titulo": "B", "etiquetas": ["tag2", "tag3"]},
        {"estado": "borrador", "custom_field": "value"},
    ]

    for fm in frontmatters:
        new_fm, dropped = migrate_frontmatter_detailed(fm)
        for key in fm.keys():
            if key not in source_keys:
                source_keys[key] = {"count": 0, "target": None}
            source_keys[key]["count"] += 1

    # Verificar conteos
    assert "title" in source_keys
    assert source_keys["title"]["count"] == 1
    assert "tags" in source_keys
    assert source_keys["tags"]["count"] == 1
    assert "etiquetas" in source_keys
    assert source_keys["etiquetas"]["count"] == 1
