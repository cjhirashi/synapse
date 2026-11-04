"""Validador de ETag según RFC 7232, incluyendo débil (W/) por intermediarios."""


def etag_matches(if_match: str, rev: str) -> bool:
    """Compara If-Match (con o sin W/) con el _rev vigente sin comillas.

    - Recorta espacios.
    - Si empieza por W/ (mayúscula exacta), lo quita.
    - Exige comillas dobles alrededor del valor restante.
    - Compara el valor interior con rev.
    - Retorna False para *, vacío, sin comillas, w/ minúscula, etc.
    """
    # Recorta espacios
    if_match = if_match.strip()

    # Si empieza por W/, lo quita
    if if_match.startswith('W/'):
        if_match = if_match[2:]

    # Verifica comillas dobles
    if not (if_match.startswith('"') and if_match.endswith('"')):
        return False

    # Extrae el valor interior
    value = if_match[1:-1]

    # Compara con rev
    return value == rev
