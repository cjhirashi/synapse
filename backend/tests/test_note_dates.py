"""H-029: fechas de la nota escritas por la API REST."""
from datetime import datetime, timezone

import pytest

from app.core.note_dates import stamp_dates, today_cdmx


def test_today_is_the_cdmx_date_not_the_utc_one():
    # 2026-11-04 03:30 UTC todavía es 3 de noviembre en CDMX (UTC-6).
    assert today_cdmx(datetime(2026, 11, 4, 3, 30, tzinfo=timezone.utc)) == "2026-11-03"
    assert today_cdmx(datetime(2026, 11, 4, 6, 30, tzinfo=timezone.utc)) == "2026-11-04"


def test_a_note_without_frontmatter_gets_both_dates():
    assert stamp_dates(None, "2026-11-03") == {"fecha_creacion": "2026-11-03", "fecha_actualizacion": "2026-11-03"}


def test_an_existing_valid_creation_date_is_kept_and_the_update_date_is_refreshed():
    out = stamp_dates({"fecha_creacion": "2026-07-06", "fecha_actualizacion": "2026-07-15", "tipo": "x"}, "2026-11-03")
    assert out == {"fecha_creacion": "2026-07-06", "fecha_actualizacion": "2026-11-03", "tipo": "x"}


@pytest.mark.parametrize("bad", ["YYYY-MM-DD", "2026-02-30", None, 5])
def test_an_invalid_creation_date_falls_back_to_created_at_in_cdmx(bad):
    out = stamp_dates({"fecha_creacion": bad}, "2026-11-03", "2026-10-29T03:00:00.000000Z")
    assert out["fecha_creacion"] == "2026-10-28"  # las 03:00 UTC del 29 son las 21:00 del 28 en CDMX


def test_the_input_is_not_mutated():
    fm = {"tipo": "x"}
    stamp_dates(fm, "2026-11-03")
    assert fm == {"tipo": "x"}
