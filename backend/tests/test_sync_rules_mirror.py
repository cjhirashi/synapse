"""Reglas espejo (SPEC-0005 RF-005, RF-015; SPEC-0009 RF-012; PLAN-0005 §5).

`tests/fixtures/vault_rules_cases.json` es la batería común: el cliente (`vaultRules.ts`)
normaliza y valida antes de escribir en la réplica, y el push la vuelve a aplicar sin
normalizar. Este test fija que cada caso coincide con el servidor; `vaultRules.test.ts` fija
lo mismo en el cliente. Si las reglas de `core/schemas.py` cambian, este test falla hasta
actualizar la batería, y entonces falla el del cliente hasta actualizar `vaultRules.ts`.
"""
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.services.sync_push import _FIELD_RULES
from app.services.vault_service import name_key

CASES = json.loads((Path(__file__).parent / "fixtures/vault_rules_cases.json").read_text())


def _id(case: dict) -> str:
    return f"{case['field']}:{json.dumps(case['input'], ensure_ascii=True)[:40]}"


@pytest.mark.parametrize("case", CASES["fields"], ids=_id)
def test_rf_005_each_field_case_matches_the_server_rules(case):
    # Las mismas reglas que aplica el push (validación estricta, sin conversión de tipos).
    rule = _FIELD_RULES[case["field"]]
    try:
        normalized = rule.validate_python(case["input"], strict=True)
    except ValidationError:
        assert case["valid"] is False
    else:
        assert case["valid"] is True
        assert normalized == case["normalized"]


def test_rf_012_icon_cases_are_in_the_common_battery():
    """RF-012: la batería común trae los casos de `icon` (válidos, inválidos y `null`); los recorre el test de arriba
    contra la regla del servidor y `vaultRules.test.ts` contra la del cliente."""
    icon_cases = [case for case in CASES["fields"] if case["field"] == "icon"]
    assert any(case["valid"] and case["input"] is None for case in icon_cases)
    assert any(case["valid"] and case["input"] == "book-open:success" for case in icon_cases)
    assert sum(1 for case in icon_cases if not case["valid"]) >= 10
    assert {"javascript:x", "javascript:alert(1)"} <= {case["input"] for case in icon_cases if isinstance(case["input"], str)}


@pytest.mark.parametrize("case", CASES["name_keys"], ids=lambda c: c["name"][:20])
def test_rf_015_each_name_key_matches_the_server_key(case):
    assert name_key(case["name"]) == case["key"]


def test_the_battery_covers_every_field_and_both_verdicts():
    for field in _FIELD_RULES:
        verdicts = {c["valid"] for c in CASES["fields"] if c["field"] == field}
        assert verdicts == {True, False}, field
