"""Horas silenciosas del push (H-053): ventana HH:MM en America/Mexico_City que puede cruzar la medianoche."""
from datetime import datetime
from zoneinfo import ZoneInfo

CDMX = ZoneInfo("America/Mexico_City")


def parse_hhmm(value: str) -> int | None:
    """Minutos desde las 00:00, o `None` si no es una hora HH:MM válida."""
    if len(value) != 5 or value[2] != ":" or not (value[:2] + value[3:]).isdigit():
        return None
    hours, minutes = int(value[:2]), int(value[3:])
    return hours * 60 + minutes if hours < 24 and minutes < 60 else None


def in_quiet_hours(now_utc: datetime, enabled: bool, start: str, end: str) -> bool:
    """¿`now_utc` (naive UTC o aware) cae dentro de la ventana silenciosa? Con la función apagada o ventana inválida, no."""
    s, e = parse_hhmm(start), parse_hhmm(end)
    if not enabled or s is None or e is None or s == e:
        return False
    aware = now_utc.replace(tzinfo=ZoneInfo("UTC")) if now_utc.tzinfo is None else now_utc
    local = aware.astimezone(CDMX)
    minute = local.hour * 60 + local.minute
    return s <= minute < e if s < e else (minute >= s or minute < e)
