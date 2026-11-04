"""H-031: el cuerpo generado cumple la especificación compartida (`fixtures/indice_cuerpo.json`)."""
import json
from pathlib import Path

import pytest

from app.core.index_body import body_lines, render_body

SPEC = json.loads((Path(__file__).parent / "fixtures" / "indice_cuerpo.json").read_text(encoding="utf-8"))


def test_limit_matches_the_spec():
    from app.core.index_body import DESCRIPCION_MAX
    assert DESCRIPCION_MAX == SPEC["limits"]["descripcion_max"]


@pytest.mark.parametrize("case", SPEC["generate"], ids=lambda c: c["name"])
def test_generate(case):
    assert body_lines(case["vault"], case["folder"], case["notes"], case.get("extra", [])) == case["body_lines"]


def test_rendered_body_ends_with_a_single_newline():
    case = SPEC["generate"][0]
    text = render_body(case["vault"], case["folder"], case["notes"])
    assert text == "\n".join(case["body_lines"]) + "\n"
