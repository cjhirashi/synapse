"""Pruebas de reglas puras de reescritura de wikilinks (H-039 C-1..C-6).

Sin E/S, sin CouchDB. Las cases del fixture se recorren y se verifica exactitud
de content, links, ambiguous.
"""
import json
from pathlib import Path

import pytest

from app.core.wikilink_rewrite import (
    Rename,
    plan_renames,
    rewrite_note,
)

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def load_wikilink_cases():
    """Carga el fixture de casos de reescritura."""
    fixture_path = FIXTURES_DIR / "wikilink_rewrite_cases.json"
    with open(fixture_path, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("rewrite", [])


class TestRewriteNoteCases:
    """Recorre todos los casos del fixture."""

    @pytest.mark.parametrize("case", load_wikilink_cases(), ids=lambda c: c["name"])
    def test_rewrite_case(self, case):
        """Prueba un caso individual del fixture."""
        name = case["name"]
        renames = [Rename(old, new) for old, new in case["renames"]]
        census = case["census"]
        content = case["content"]
        expected_content = case["expected"]
        expected_links = case["links"]
        expected_ambiguous = sorted(case["ambiguous"])

        # Generar el plan
        plan = plan_renames(renames, census)

        # Reescribir la nota
        result = rewrite_note(content, plan)

        # Verificar exactitud
        assert result.content == expected_content, (
            f"Case '{name}': content mismatch\n"
            f"  Expected: {repr(expected_content)}\n"
            f"  Got:      {repr(result.content)}"
        )
        assert result.links == expected_links, (
            f"Case '{name}': links mismatch\n"
            f"  Expected: {expected_links}\n"
            f"  Got:      {result.links}"
        )
        assert sorted(result.ambiguous) == expected_ambiguous, (
            f"Case '{name}': ambiguous mismatch\n"
            f"  Expected: {expected_ambiguous}\n"
            f"  Got:      {sorted(result.ambiguous)}"
        )


class TestPlanRenames:
    """Pruebas directas de plan_renames."""

    def test_plan_renames_path_complete(self):
        """Path completo genera path_renames."""
        renames = [Rename("A/Nota.md", "B/Nota.md")]
        census = {"nota.md": 1}

        plan = plan_renames(renames, census)

        # Con y sin .md deben mappear a lo mismo
        assert "a/nota.md" in plan.path_renames
        assert plan.path_renames["a/nota.md"] == "B/Nota.md"

    def test_plan_renames_name_unique_changes(self):
        """Nombre único que cambia genera name_renames."""
        renames = [Rename("A/Nota.md", "A/Nuevo.md")]
        census = {"nota.md": 1}

        plan = plan_renames(renames, census)

        # El nombre viejo debe estar en name_renames
        assert "nota.md" in plan.name_renames
        assert plan.name_renames["nota.md"] == "A/Nuevo.md"

    def test_plan_renames_name_ambiguous(self):
        """Nombre ambiguo (count > 1) va a ambiguous_names."""
        renames = [Rename("A/Nota.md", "A/Nuevo.md")]
        census = {"nota.md": 2}

        plan = plan_renames(renames, census)

        # Debe estar en ambiguous, NO en name_renames
        assert "nota.md" in plan.ambiguous_names
        assert "nota.md" not in plan.name_renames

    def test_plan_renames_no_name_change(self):
        """Nombre no cambia -> no entra en name_renames."""
        renames = [Rename("A/Nota.md", "B/Nota.md")]
        census = {"nota.md": 1}

        plan = plan_renames(renames, census)

        # El nombre no cambió, así que no debe estar en name_renames
        assert "nota.md" not in plan.name_renames


class TestRewriteNoteEdgeCases:
    """Pruebas de casos extremos y especiales."""

    def test_empty_content(self):
        """Contenido vacío se devuelve como está."""
        renames = [Rename("A/Nota.md", "B/Nota.md")]
        census = {"nota.md": 1}
        plan = plan_renames(renames, census)

        result = rewrite_note("", plan)

        assert result.content == ""
        assert result.links == 0
        assert result.ambiguous == []

    def test_no_wikilinks(self):
        """Contenido sin wikilinks."""
        renames = [Rename("A/Nota.md", "B/Nota.md")]
        census = {"nota.md": 1}
        plan = plan_renames(renames, census)

        content = "Solo texto plano, sin [[wikilinks]] de verdad"
        # Aunque sea un patrón superficialmente similar, no es válido sin cerrar
        result = rewrite_note(content, plan)

        assert result.content == content
        assert result.links == 0

    def test_empty_plan(self):
        """Plan vacío -> nada cambia."""
        plan = plan_renames([], {})

        content = "[[A/Nota.md]]"
        result = rewrite_note(content, plan)

        assert result.content == content
        assert result.links == 0

    def test_code_fence_triple_backtick(self):
        """Wikilinks dentro de ``` no se tocan."""
        renames = [Rename("A/Nota.md", "B/Nota.md")]
        census = {"nota.md": 1}
        plan = plan_renames(renames, census)

        content = """Before
```
[[A/Nota.md]]
```
After"""
        result = rewrite_note(content, plan)

        assert "[[B/Nota.md]]" not in result.content
        assert result.links == 0

    def test_code_fence_triple_tilde(self):
        """Wikilinks dentro de ~~~ no se tocan."""
        renames = [Rename("A/Nota.md", "B/Nota.md")]
        census = {"nota.md": 1}
        plan = plan_renames(renames, census)

        content = """Before
~~~
[[A/Nota.md]]
~~~
After"""
        result = rewrite_note(content, plan)

        assert "[[B/Nota.md]]" not in result.content
        assert result.links == 0

    def test_inline_code_backtick(self):
        """Wikilinks dentro de `...` no se tocan."""
        renames = [Rename("A/Nota.md", "B/Nota.md")]
        census = {"nota.md": 1}
        plan = plan_renames(renames, census)

        content = "Esto es `[[A/Nota.md]]` código."
        result = rewrite_note(content, plan)

        assert "[[B/Nota.md]]" not in result.content
        assert result.links == 0

    def test_markdown_link_not_touched(self):
        """Wikilinks en markdown [...](A/B.md) no se tocan."""
        renames = [Rename("A/Nota.md", "B/Nota.md")]
        census = {"nota.md": 1}
        plan = plan_renames(renames, census)

        content = "Ver [enlace](A/Nota.md) y [[A/Nota.md]] aquí."
        result = rewrite_note(content, plan)

        # El enlace markdown no debe cambiar
        assert "[enlace](A/Nota.md)" in result.content
        # El wikilink sí
        assert "[[B/Nota.md]]" in result.content
        assert result.links == 1

    def test_markdown_image_not_touched(self):
        """Wikilinks en markdown ![](A/B.md) no se tocan."""
        renames = [Rename("A/Nota.md", "B/Nota.md")]
        census = {"nota.md": 1}
        plan = plan_renames(renames, census)

        content = "Imagen ![alt](A/Nota.md) y [[A/Nota.md]] aquí."
        result = rewrite_note(content, plan)

        # La imagen markdown no debe cambiar
        assert "![alt](A/Nota.md)" in result.content
        # El wikilink sí
        assert "[[B/Nota.md]]" in result.content
        assert result.links == 1

    def test_escaped_pipe_in_table(self):
        """Wikilinks con \\| (tablas) conservan el escape."""
        renames = [Rename("A/Nota.md", "B/Nota.md")]
        census = {"nota.md": 1}
        plan = plan_renames(renames, census)

        content = "| [[A/Nota.md\\|texto]] |"
        result = rewrite_note(content, plan)

        assert result.content == "| [[B/Nota.md\\|texto]] |"
        assert result.links == 1

    def test_multiple_renames_same_census(self):
        """Múltiples renombres con un censo compartido."""
        renames = [
            Rename("Proyectos/A.md", "Archivo/A.md"),
            Rename("Proyectos/B.md", "Archivo/B.md"),
        ]
        census = {"a.md": 1, "b.md": 1}
        plan = plan_renames(renames, census)

        content = "[[Proyectos/A.md]] y [[Proyectos/B.md]]"
        result = rewrite_note(content, plan)

        assert result.content == "[[Archivo/A.md]] y [[Archivo/B.md]]"
        assert result.links == 2
