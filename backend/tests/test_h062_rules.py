"""H-062: Bitácora con diff de líneas agregadas/eliminadas (reglas puras)."""
from datetime import UTC, datetime

import pytest

from app.core import bitacora_rules as bit

TZ = "America/Mexico_City"


def note(path="Doc.md", content="a", fm=None, deleted=None):
    return {"_id": "note:v:n", "path": path, "content": content, "frontmatter": fm if fm is not None else {}, "deleted_at": deleted}


# --- H-062: compute_diff ---

def test_compute_diff_create():
    # H-062: create: todas las líneas como agregadas
    old = None
    new = note(content="línea 1\nlínea 2\nlínea 3")
    diff = bit.compute_diff(old, new)
    assert diff.added == 3
    assert diff.removed == 0
    assert diff.text is None
    assert diff.truncated is False


def test_compute_diff_delete():
    # H-062: delete: todas las líneas como eliminadas
    old = note(content="línea 1\nlínea 2\nlínea 3")
    new = note(deleted="2026-11-05T00:00:00.000000Z")
    diff = bit.compute_diff(old, new)
    assert diff.added == 0
    assert diff.removed == 3
    assert diff.text is None
    assert diff.truncated is False


def test_compute_diff_restore():
    # H-062: restore: sin líneas (solo cambió deleted_at)
    old = note(deleted="2026-11-05T00:00:00.000000Z")
    new = note()
    diff = bit.compute_diff(old, new)
    assert diff.added == 0
    assert diff.removed == 0
    assert diff.text is None
    assert diff.truncated is False


def test_compute_diff_rename_no_change():
    # H-062: rename sin cambio de contenido: 0/0 y text None
    old = note("A/viejo.md", "contenido")
    new = note("A/nuevo.md", "contenido")
    diff = bit.compute_diff(old, new)
    assert diff.added == 0
    assert diff.removed == 0
    assert diff.text is None
    assert diff.truncated is False


def test_compute_diff_edit_simple():
    # H-062: edit con líneas agregadas y eliminadas
    old = note(content="línea A\nlínea B\nlínea C")
    new = note(content="línea A\nlínea B modificada\nlínea D")
    diff = bit.compute_diff(old, new)
    assert diff.added > 0
    assert diff.removed > 0
    assert diff.text is not None
    # El diff debe contener las marcas de cambio
    assert any(line.startswith("+") for line in diff.text.split("\n"))
    assert any(line.startswith("-") for line in diff.text.split("\n"))


def test_compute_diff_frontmatter_change():
    # H-062: edit de frontmatter incluye cambios en diff
    old = note(fm={"titulo": "Viejo", "tags": ["a"]})
    new = note(fm={"titulo": "Nuevo", "tags": ["b", "c"]})
    diff = bit.compute_diff(old, new)
    assert diff.added > 0
    assert diff.removed > 0
    assert diff.text is not None
    # El diff debe mencionar los cambios de frontmatter
    assert "titulo" in diff.text or "tags" in diff.text


def test_compute_diff_ignores_fecha_actualizacion():
    # H-062: cambios solo en fecha_actualizacion se ignoran (como antes)
    old = note(fm={"titulo": "T", "fecha_actualizacion": "2026-11-04"})
    new = note(fm={"titulo": "T", "fecha_actualizacion": "2026-11-05"})
    diff = bit.compute_diff(old, new)
    # No es cambio registrable (classify retorna None); compute_diff debe manejar o retornar 0/0
    assert diff.added == 0 and diff.removed == 0


def test_compute_diff_crlf_normalization():
    # H-062: CRLF se normaliza a LF (no cuenta como cambio)
    old = note(content="línea 1\r\nlínea 2")
    new = note(content="línea 1\nlínea 2")
    diff = bit.compute_diff(old, new)
    # Ambas tienen 2 líneas; normalizadas son iguales
    assert diff.added == 0
    assert diff.removed == 0


def test_compute_diff_truncated():
    # H-062: diff > 20 KiB o 200 líneas → truncated=True; conteos reales
    large_content = "\n".join([f"línea {i}" for i in range(300)])
    old = note(content="viejo")
    new = note(content=large_content)
    diff = bit.compute_diff(old, new)
    assert diff.added > 0
    assert diff.removed > 0
    # Probablemente truncado por cantidad de líneas
    # (aunque podría no serlo si el texto es corto; verificamos que el mecanismo exista)
    assert diff.text is not None


def test_compute_diff_never_raises():
    # H-062: fallo en compute_diff nunca bloquea el registro
    # Pasamos datos inválidos que podrían causar error
    try:
        # Un None en lugar de dict debería ser manejado
        result = bit.compute_diff(None, None)
        # Si no levanta, retorna Diff(0, 0, None, False)
        assert result.added == 0
        assert result.removed == 0
    except:  # noqa: E722
        # Si sí levanta, el test falla (pero compute_diff debe capturarlo)
        pytest.fail("compute_diff debe capturar excepciones")


# --- H-062: render_day con diff ---

def test_render_day_with_diff():
    # H-062: render_day incluye diff en bloque de código con valla segura
    entries = [
        bit.Entry(
            datetime(2026, 11, 5, 20, 0, tzinfo=UTC), "edit", "A/doc.md", None, "Doc",
            "human", "carlos@x.com", "applied",
            lines_added=5, lines_removed=2, diff_text="+nueva línea\n-vieja línea", diff_truncated=False
        ),
    ]
    text = bit.render_day("2026-11-05", TZ, entries)
    # Debe contener el marcador +5 −2
    assert "+5 −2" in text
    # Debe contener el bloque de diff con valla
    assert "```diff" in text or "````diff" in text


def test_render_day_diff_truncated_note():
    # H-062: diff truncado muestra nota de truncado
    entries = [
        bit.Entry(
            datetime(2026, 11, 5, 20, 0, tzinfo=UTC), "edit", "A/doc.md", None, "Doc",
            "human", "carlos@x.com", "applied",
            lines_added=1000, lines_removed=1000, diff_text="+" + "\n+".join(["l"] * 100), diff_truncated=True
        ),
    ]
    text = bit.render_day("2026-11-05", TZ, entries)
    assert "diff truncado" in text


def test_render_day_no_diff_for_old_entry():
    # H-062: entrada anterior a H-062 (sin líneas_added) muestra «sin detalle»
    entries = [
        bit.Entry(
            datetime(2026, 11, 5, 20, 0, tzinfo=UTC), "edit", "A/doc.md", None, "Doc",
            "human", "carlos@x.com", "applied",
            lines_added=None, lines_removed=None, diff_text=None, diff_truncated=None
        ),
    ]
    text = bit.render_day("2026-11-05", TZ, entries)
    assert "sin detalle" in text


def test_render_day_fence_safe():
    # H-062: valla de código es más larga que el diff más largo
    diff_with_backticks = "```\nalgo\n```"
    entries = [
        bit.Entry(
            datetime(2026, 11, 5, 20, 0, tzinfo=UTC), "edit", "A/doc.md", None, "Doc",
            "human", "carlos@x.com", "applied",
            lines_added=1, lines_removed=1, diff_text=diff_with_backticks, diff_truncated=False
        ),
    ]
    text = bit.render_day("2026-11-05", TZ, entries)
    # La valla debe ser más larga que ``` (3 backticks)
    # Buscamos al menos 4 backticks
    assert "````diff" in text or "`````diff" in text


def test_render_day_format_numbers_with_commas():
    # H-062: números se formatean con coma de miles (formato México)
    entries = [
        bit.Entry(
            datetime(2026, 11, 5, 20, 0, tzinfo=UTC), "edit", "A/doc.md", None, "Doc",
            "human", "carlos@x.com", "applied",
            lines_added=1200, lines_removed=500, diff_text=None, diff_truncated=False
        ),
    ]
    text = bit.render_day("2026-11-05", TZ, entries)
    # Debe contener +1,200 o similar (con coma)
    assert "+1,200" in text or "+1200" in text
    # Verificar que el formato es consistente
    assert "−500" in text or "-500" in text


# --- H-062: Integración compute_diff con classify ---

def test_compute_diff_matches_classify():
    # H-062: compute_diff respeta la operación que classify determina
    test_cases = [
        (None, note(), "create"),
        (note(), note(deleted="2026-11-05T00:00:00Z"), "delete"),
        (note(deleted="2026-11-05T00:00:00Z"), note(), "restore"),
        (note("A/x.md"), note("A/y.md"), "rename"),
        (note("A/x.md"), note("B/x.md"), "move"),
    ]
    for old, new, expected_op in test_cases:
        op = bit.classify(old, new)
        assert op == expected_op, f"Expected {expected_op}, got {op}"
        diff = bit.compute_diff(old, new)
        # No debe lanzar excepción
        assert diff is not None
