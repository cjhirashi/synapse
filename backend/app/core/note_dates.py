"""Fechas de una nota escrita por la API REST (H-029).

`fecha_creacion` y `fecha_actualizacion` son atributos de la nota (`AAAA-MM-DD`). Lo que escribe la
app las sella en el dispositivo; lo que escribe un agente por REST las sella el servidor, con la fecha
de Ciudad de México (la zona de Carlos), para que ninguna nota quede sin ellas.
"""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.core.attribute_rules import normalize_date

_TZ = ZoneInfo("America/Mexico_City")


def today_cdmx(now: datetime | None = None) -> str:
    return (now or datetime.now(_TZ)).astimezone(_TZ).date().isoformat()


def stamp_dates(frontmatter: dict | None, today: str, created_at: str | None = None) -> dict:
    """Copia del frontmatter con `fecha_actualizacion = today` y `fecha_creacion` conservada si es válida;
    si falta, la fecha de `created_at` (ISO UTC, a fecha de CDMX) y si tampoco hay, `today`."""
    out = dict(frontmatter or {})
    creation = normalize_date(out.get("fecha_creacion"))
    if creation is None:
        creation = _date_of(created_at) or today
    out["fecha_creacion"] = creation
    out["fecha_actualizacion"] = today
    return out


def _date_of(iso: str | None) -> str | None:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(_TZ).date().isoformat()
    except ValueError:
        return None
