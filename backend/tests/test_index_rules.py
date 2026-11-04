"""H-031: reglas puras de INDICES automáticos (casos compartidos con el frontend)."""
import json
from pathlib import Path

import pytest

from app.core import index_rules as rules

SPEC = json.loads((Path(__file__).parent / "fixtures" / "indice_cuerpo.json").read_text(encoding="utf-8"))


def test_index_name_matches_spec():
    assert rules.INDEX_NAME == SPEC["index_name"]


class TestIsIndexPath:
    """Casos de nombres reservados de la especificación."""

    @pytest.mark.parametrize("path,expected", SPEC["reserved_names"]["cases"])
    def test_reserved_names(self, path: str, expected: bool):
        assert rules.is_index_path(path) == expected


class TestFolderOf:
    """Función `folder_of`: carpeta que contiene una nota."""

    def test_root_file(self):
        assert rules.folder_of("Nota.md") == ""

    def test_nested_file(self):
        assert rules.folder_of("A/B/Nota.md") == "A/B"

    def test_single_level(self):
        assert rules.folder_of("Carpeta/Nota.md") == "Carpeta"


class TestIndexPathFor:
    """Función `index_path_for`: ruta del INDICE para una carpeta."""

    def test_root_folder(self):
        assert rules.index_path_for("") == "INDICE.md"

    def test_nested_folder(self):
        assert rules.index_path_for("A/B") == "A/B/INDICE.md"

    def test_single_level(self):
        assert rules.index_path_for("Carpeta") == "Carpeta/INDICE.md"


class TestAncestorFolders:
    """Función `ancestor_folders`: carpetas ancestro desde raíz hacia dentro."""

    def test_root_file(self):
        assert rules.ancestor_folders("Nota.md") == [""]

    def test_nested_file(self):
        assert rules.ancestor_folders("A/B/Nota.md") == ["", "A", "A/B"]

    def test_single_level_file(self):
        assert rules.ancestor_folders("A/Nota.md") == ["", "A"]


class TestChangedKeys:
    """Función `changed_keys`: claves del frontmatter que cambian."""

    def test_no_change(self):
        old = {"descripcion": "A", "estado": "nuevo"}
        new = {"descripcion": "A", "estado": "nuevo"}
        assert rules.changed_keys(old, new) == []

    def test_value_changed(self):
        old = {"descripcion": "A"}
        new = {"descripcion": "B"}
        assert rules.changed_keys(old, new) == ["descripcion"]

    def test_key_added(self):
        old = {"descripcion": "A"}
        new = {"descripcion": "A", "estado": "nuevo"}
        assert "estado" in rules.changed_keys(old, new)
        assert "descripcion" not in rules.changed_keys(old, new)

    def test_key_removed(self):
        old = {"descripcion": "A", "estado": "nuevo"}
        new = {"descripcion": "A"}
        assert "estado" in rules.changed_keys(old, new)
        assert "descripcion" not in rules.changed_keys(old, new)

    def test_ignores_fecha_creacion(self):
        old = {"descripcion": "A", "fecha_creacion": "2026-01-01"}
        new = {"descripcion": "A", "fecha_creacion": "2026-01-02"}
        assert "fecha_creacion" not in rules.changed_keys(old, new)

    def test_ignores_fecha_actualizacion(self):
        old = {"descripcion": "A", "fecha_actualizacion": "2026-01-01"}
        new = {"descripcion": "A", "fecha_actualizacion": "2026-01-02"}
        assert "fecha_actualizacion" not in rules.changed_keys(old, new)

    def test_both_none(self):
        assert rules.changed_keys(None, None) == []

    def test_old_none(self):
        new = {"descripcion": "A", "estado": "nuevo"}
        changed = rules.changed_keys(None, new)
        assert "descripcion" in changed
        assert "estado" in changed

    def test_new_none(self):
        old = {"descripcion": "A", "estado": "nuevo"}
        changed = rules.changed_keys(old, None)
        assert "descripcion" in changed
        assert "estado" in changed


class TestCheckOp:
    """Operaciones y sus validaciones (casos de la especificación)."""

    @pytest.mark.parametrize("case", SPEC["rules"]["cases"], ids=lambda c: f"{c['op']}/{c.get('path', '')}/{c.get('to', '')}")
    def test_check_op_cases(self, case):
        code = rules.check_op(
            case["op"],
            case["path"],
            to=case.get("to"),
            changed=case.get("changed", []),
            content_changed=case.get("content_changed", False),
            other_live_below_after=case.get("other_live_below_after", 0),
        )
        assert code == case["code"], f"Case: {case}"


class TestCheckOpDetails:
    """Pruebas adicionales de `check_op` para casos específicos."""

    def test_create_user_with_index_name(self):
        assert rules.check_op("create_user", "INDICE.md") == "reserved-name:path"
        assert rules.check_op("create_user", "A/INDICE.md") == "reserved-name:path"
        assert rules.check_op("create_user", "indice.md") == "reserved-name:path"

    def test_create_user_with_normal_name(self):
        assert rules.check_op("create_user", "Nota.md") is None
        assert rules.check_op("create_user", "A/Nota.md") is None

    def test_system_create_always_passes(self):
        assert rules.check_op("system_create", "INDICE.md") is None
        assert rules.check_op("system_create", "A/INDICE.md") is None

    def test_rename_from_index(self):
        assert rules.check_op("rename_or_move", "INDICE.md", to="Nota.md") == "index-readonly:path"

    def test_rename_to_index(self):
        assert rules.check_op("rename_or_move", "Nota.md", to="INDICE.md") == "reserved-name:path"

    def test_rename_normal_note(self):
        assert rules.check_op("rename_or_move", "Nota1.md", to="Nota2.md") is None

    def test_edit_index_changing_content(self):
        assert rules.check_op("edit", "A/INDICE.md", content_changed=True) == "index-readonly:content"

    def test_edit_index_changing_other_attr(self):
        assert rules.check_op("edit", "A/INDICE.md", changed=["estado"]) == "index-readonly:attr"
        assert rules.check_op("edit", "A/INDICE.md", changed=["titulo"]) == "index-readonly:attr"
        assert rules.check_op("edit", "A/INDICE.md", changed=["tags"]) == "index-readonly:attr"

    def test_edit_index_changing_only_descripcion(self):
        assert rules.check_op("edit", "A/INDICE.md", changed=["descripcion"]) is None

    def test_edit_index_changing_descripcion_and_other(self):
        assert rules.check_op("edit", "A/INDICE.md", changed=["descripcion", "estado"]) == "index-readonly:attr"

    def test_edit_normal_note(self):
        assert rules.check_op("edit", "A/Nota.md", changed=["titulo"]) is None

    def test_delete_root_index_always_fails(self):
        assert rules.check_op("delete", "INDICE.md", other_live_below_after=0) == "index-root:delete"
        assert rules.check_op("delete", "INDICE.md", other_live_below_after=5) == "index-root:delete"

    def test_delete_nested_index_with_notes_below(self):
        assert rules.check_op("delete", "A/INDICE.md", other_live_below_after=3) == "index-readonly:delete"
        assert rules.check_op("delete", "A/INDICE.md", other_live_below_after=1) == "index-readonly:delete"

    def test_delete_nested_index_empty(self):
        assert rules.check_op("delete", "A/INDICE.md", other_live_below_after=0) is None
        assert rules.check_op("delete", "A/B/C/INDICE.md", other_live_below_after=0) is None

    def test_delete_normal_note(self):
        assert rules.check_op("delete", "A/Nota.md", other_live_below_after=5) is None
        assert rules.check_op("delete", "Nota.md", other_live_below_after=0) is None
