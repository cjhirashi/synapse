"""Marcas de tiempo de los documentos (SPEC-0003, SPEC-0005 §2.3, SPEC-0008 §3).

Un único formato RFC 3339 en UTC y de ancho fijo: el orden de texto es el cronológico.
Lo usan las bóvedas, las notas, las reservas y el push validado.
"""
from datetime import UTC, datetime

TIMESTAMP_FORMAT = "%Y-%m-%dT%H:%M:%S.%fZ"


def utc_now() -> str:
    """Hora actual en RFC 3339 UTC, ancho fijo: el orden de texto es el cronológico."""
    return datetime.now(UTC).strftime(TIMESTAMP_FORMAT)


def parse_timestamp(value: str) -> datetime:
    return datetime.strptime(value, TIMESTAMP_FORMAT).replace(tzinfo=UTC)


def is_timestamp(value: str) -> bool:
    """¿`value` tiene exactamente el formato de `utc_now`? (`%f` acepta menos dígitos)."""
    try:
        return parse_timestamp(value).strftime(TIMESTAMP_FORMAT) == value
    except ValueError:
        return False
