"""Regla del `style` de los div y span del cuerpo (H-036f): el servidor recorre el fixture que comparte con el cliente."""
import json
from pathlib import Path

import pytest

from app.core.html_style import clean_style

CASES = json.loads((Path(__file__).parent / "fixtures" / "estilo_html.json").read_text())["casos"]


@pytest.mark.parametrize("case", CASES, ids=[case["nombre"] for case in CASES])
def test_style_rule_matches_the_shared_fixture(case):
    assert clean_style(case["in"]) == case["out"]
