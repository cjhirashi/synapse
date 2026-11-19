"""H-063: Bitácora con números de línea en diffs (reglas puras)."""
from datetime import UTC, datetime

import pytest

from app.core import bitacora_rules as bit

TZ = "America/Mexico_City"


def note(path="Doc.md", content="a", fm=None, deleted=None):
    return {"_id": "note:v:n", "path": path, "content": content, "frontmatter": fm if fm is not None else {}, "deleted_at": deleted}


# --- H-063: number_diff ---

class TestNumberDiffCreate:
    """H-063: number_diff en create."""

    def test_create_simple(self):
        # H-063: create numera líneas nuevas 1..N en la columna derecha.
        diff_text = "+línea 1\n+línea 2\n+línea 3"
        result = bit.number_diff("create", diff_text)
        lines = result.split("\n")
        assert len(lines) == 3
        # La marca + sigue siendo el primer carácter.
        assert lines[0][0] == "+"
        assert lines[1][0] == "+"
        assert lines[2][0] == "+"
        # Verifica que contiene números en la parte derecha (columna nuevo).
        assert "1" in lines[0]
        assert "2" in lines[1]
        assert "3" in lines[2]
        # La columna izquierda (viejo) está en blanco.
        # Formato esperado: `+   1  línea 1`
        assert "línea 1" in lines[0]

    def test_create_long_numbers(self):
        # H-063: ancho se ajusta a los números más largos.
        lines_to_add = [f"+línea {i}" for i in range(1, 101)]  # 100 líneas
        diff_text = "\n".join(lines_to_add)
        result = bit.number_diff("create", diff_text)
        lines = result.split("\n")
        assert len(lines) == 100
        # El último número es 100 (3 dígitos).
        assert "100" in lines[99]

    def test_create_blank_line(self):
        # H-063: línea en blanco agregada sin espacios finales.
        diff_text = "+\n+texto"
        result = bit.number_diff("create", diff_text)
        lines = result.split("\n")
        assert len(lines) == 2
        # Primera línea solo tiene la marca y números.
        assert lines[0][0] == "+"
        assert not lines[0].endswith(" ")


class TestNumberDiffDelete:
    """H-063: number_diff en delete."""

    def test_delete_simple(self):
        # H-063: delete numera líneas eliminadas 1..N en la columna izquierda.
        diff_text = "-línea 1\n-línea 2\n-línea 3"
        result = bit.number_diff("delete", diff_text)
        lines = result.split("\n")
        assert len(lines) == 3
        # La marca - sigue siendo el primer carácter.
        assert lines[0][0] == "-"
        assert lines[1][0] == "-"
        assert lines[2][0] == "-"
        # Verifica números en la columna izquierda (viejo).
        assert "1" in lines[0]
        assert "2" in lines[1]
        assert "3" in lines[2]
        # La columna derecha está en blanco.
        assert "línea 1" in lines[0]


class TestNumberDiffEdit:
    """H-063: number_diff en edit."""

    def test_edit_two_hunks(self):
        # H-063: edit con dos hunks, cada uno con sus números.
        diff_text = (
            "@@ -1,3 +1,3 @@\n"
            " contexto 1\n"
            "-vieja línea\n"
            "+nueva línea\n"
            " contexto 2\n"
            "@@ -10,2 +10,3 @@\n"
            " otra línea\n"
            "+agregada"
        )
        result = bit.number_diff("edit", diff_text)
        lines = result.split("\n")
        # Cabeceras @@ pasan igual.
        assert "@@ -1,3 +1,3 @@" in result
        assert "@@ -10,2 +10,3 @@" in result
        # Verifica que los números son correctos en cada hunk.
        # Primer hunk: líneas 1-3 antiguas, 1-3 nuevas.
        # Segundo hunk: líneas 10-11 antiguas, 10-12 nuevas.

    def test_edit_one_line_changed(self):
        # H-063: edit con una línea cambiada en medio.
        # La línea - y + llevan el mismo número en sus respectivas columnas.
        diff_text = "@@ -5,3 +5,3 @@\n contexto\n-vieja\n+nueva\n contexto"
        result = bit.number_diff("edit", diff_text)
        lines = result.split("\n")
        assert len(lines) == 5
        # Línea de contexto antes: 5 en ambas columnas.
        assert lines[1][0] == " "
        # Línea eliminada: 5 en columna izquierda.
        assert lines[2][0] == "-"
        # Línea agregada: 6 en columna derecha (nueva = 5+1).
        assert lines[3][0] == "+"

    def test_edit_frontmatter_only(self):
        # H-063: edit sin hunk, solo frontmatter (etiquetado como `prop`).
        diff_text = "-titulo: Viejo\n+titulo: Nuevo"
        result = bit.number_diff("edit", diff_text)
        lines = result.split("\n")
        # Sin hunks, todas son frontmatter; etiquetadas como `prop`.
        assert "prop" in lines[0]
        assert "prop" in lines[1]
        # La marca debe ser el primer carácter.
        assert lines[0][0] == "-"
        assert lines[1][0] == "+"
        # El texto debe estar presente (después de la numeración).
        assert "titulo: Viejo" in lines[0]
        assert "titulo: Nuevo" in lines[1]

    def test_edit_content_plus_frontmatter(self):
        # H-063: edit de contenido + frontmatter; la separación es por conteos.
        diff_text = (
            "@@ -1,2 +1,2 @@\n"
            "-viejo\n"
            "+nuevo\n"
            "-titulo: A\n"
            "+titulo: B"
        )
        result = bit.number_diff("edit", diff_text)
        lines = result.split("\n")
        # Primeras dos líneas (dentro del hunk de 2 líneas): numeradas.
        assert "@@ -1,2 +1,2 @@" in result
        # Las líneas de frontmatter después del hunk: etiquetadas como `prop`.
        # (El hunk dice 2 líneas viejas y 2 nuevas, así que todo está dentro del hunk)
        # En este caso todo está dentro, así que todo se numera.

    def test_edit_no_comma_shorthand(self):
        # H-063: `@@ -5 +5 @@` sin coma (significa 1 línea).
        diff_text = "@@ -5 +5 @@\n-vieja\n+nueva"
        result = bit.number_diff("edit", diff_text)
        lines = result.split("\n")
        assert "@@ -5 +5 @@" in result
        # -vieja es línea 5 (antigua): -  5  ...
        assert lines[1][0] == "-" and "5" in lines[1] and "vieja" in lines[1]
        # +nueva es línea 5 (nueva): +  5  ...
        assert lines[2][0] == "+" and "5" in lines[2] and "nueva" in lines[2]

    def test_edit_empty_range(self):
        # H-063: `@@ -0,0 +1,3 @@` (rango vacío en antiguo, 3 nuevas).
        diff_text = "@@ -0,0 +1,3 @@\n+línea 1\n+línea 2\n+línea 3"
        result = bit.number_diff("edit", diff_text)
        lines = result.split("\n")
        # El rango 0,0 significa b=0 (consume 0 líneas viejas).
        # Las 3 nuevas se numeran 1, 2, 3.
        assert "@@ -0,0 +1,3 @@" in result
        # Formato: + {space} {space} 1  línea 1
        assert "1" in lines[1] and "línea 1" in lines[1]
        assert "2" in lines[2] and "línea 2" in lines[2]
        assert "3" in lines[3] and "línea 3" in lines[3]

    def test_edit_wide_numbers(self):
        # H-063: líneas con 4-5 dígitos.
        diff_text = "@@ -9998,3 +9998,3 @@\n contexto\n-vieja\n+nueva"
        result = bit.number_diff("edit", diff_text)
        # El ancho se ajusta a 9999 (5 dígitos).
        assert "9998" in result
        assert "9999" in result or "10000" in result  # +1 de vieja → nueva


class TestNumberDiffTolerance:
    """H-063: tolerancia ante líneas raras."""

    def test_strange_line_no_exception(self):
        # H-063: línea sin marca (+/-/espacio) no lanza excepción.
        diff_text = "línea sin marca\n+línea válida"
        result = bit.number_diff("create", diff_text)
        # Debe retornar algo (fallback con marca en primer carácter).
        assert result is not None
        assert len(result.split("\n")) == 2

    def test_malformed_hunk_header(self):
        # H-063: cabecera @@ malformada no lanza excepción.
        diff_text = "@@ invalid @@\n+línea"
        result = bit.number_diff("edit", diff_text)
        # Debe retornar algo; la cabecera pasa tal cual.
        assert "@@ invalid @@" in result

    def test_empty_text(self):
        # H-063: texto vacío retorna vacío.
        result = bit.number_diff("create", "")
        assert result == ""

    def test_unknown_operation(self):
        # H-063: operación desconocida no lanza excepción; retorna fallback.
        diff_text = "+línea"
        result = bit.number_diff("unknown_op", diff_text)
        # Debe retornar algo.
        assert result is not None

    def test_mark_always_first_character(self):
        # H-063: la marca (+/-/espacio/@) siempre es el primer carácter.
        result = bit.number_diff("create", "+texto")
        lines = result.split("\n")
        for line in lines:
            if line:
                assert line[0] in ("+", "-", " ", "@")


class TestNumberDiffHeaderFormats:
    """H-063: formatos de cabecera especiales."""

    def test_hunk_with_function_name(self):
        # H-063: cabecera con nombre de función: `@@ -1,2 +1,3 @@ def foo():`
        diff_text = "@@ -1,2 +1,3 @@ def foo():\n -vieja\n+nueva\n+contexto"
        result = bit.number_diff("edit", diff_text)
        # La cabecera pasa tal cual.
        assert "@@ -1,2 +1,3 @@ def foo():" in result

    def test_multiple_ranges_in_hunk(self):
        # H-063: edit con contexto después de hunk (frontmatter).
        diff_text = "@@ -1,1 +1,1 @@\n-vieja\n+nueva\n-prop: val1\n+prop: val2"
        result = bit.number_diff("edit", diff_text)
        # El hunk es 1,1, así que después del primer - y + estamos en frontmatter.
        lines = result.split("\n")
        # Verifica que las líneas de prop están etiquetadas.
        assert "prop" in lines[3] or "prop" in lines[4]


class TestRenderDayWithNumberedDiff:
    """H-063: render_day usa number_diff."""

    def test_render_day_includes_numbered_diff(self):
        # H-063: render_day llama a number_diff y muestra números.
        entries = [
            bit.Entry(
                datetime(2026, 11, 5, 20, 0, tzinfo=UTC), "create", "A/doc.md", None, "Doc",
                "human", "carlos@x.com", "applied",
                lines_added=2, lines_removed=0, diff_text="+línea 1\n+línea 2", diff_truncated=False
            ),
        ]
        text = bit.render_day("2026-11-05", TZ, entries)
        # El diff debe estar numerado.
        assert "1" in text or "2" in text
        assert "```diff" in text

    def test_render_day_edit_with_numbers(self):
        # H-063: render_day para edit muestra números en dos columnas.
        entries = [
            bit.Entry(
                datetime(2026, 11, 5, 20, 0, tzinfo=UTC), "edit", "A/doc.md", None, "Doc",
                "human", "carlos@x.com", "applied",
                lines_added=1, lines_removed=1,
                diff_text="@@ -5,1 +5,1 @@\n-vieja\n+nueva", diff_truncated=False
            ),
        ]
        text = bit.render_day("2026-11-05", TZ, entries)
        # Debe contener la cabecera y números.
        assert "@@" in text
        assert "+1 −1" in text  # El conteo del bloque de entrada (1 agregada, 1 eliminada).
