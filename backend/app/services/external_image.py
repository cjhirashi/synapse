"""Imágenes externas de un documento (H-036): el servidor las descarga para incrustarlas en el PDF.

La persona es responsable de lo que carga en su documento, así que una imagen de la web se imprime. Lo único que no se hace es dejar que el
documento use al servidor para alcanzar su red interna: solo se conectan direcciones públicas (nunca loopback, red privada, enlace local,
metadatos de la nube ni los otros contenedores), se vuelve a comprobar en cada redirección y la conexión va a la IP ya comprobada (sin ventana
para que el DNS cambie de respuesta entre la comprobación y la descarga).
"""
import ipaddress
import socket
from typing import Callable
from urllib.parse import urljoin, urlsplit

MAX_BYTES = 8 * 1024 * 1024
TIMEOUT_SECONDS = 8.0
MAX_REDIRECTS = 3
USER_AGENT = "Synapse-PDF/1.0"

Resolver = Callable[[str, int], "list[str] | None"]
Getter = Callable[[str, str, str, float], "tuple[int, dict, bytes | None]"]  # (url, ip, host, timeout) → (estado, cabeceras, cuerpo o None si pasa del tope)


def resolve_public(host: str, port: int) -> list[str] | None:
    """Las IP de `host` si TODAS son públicas; `None` si alguna no lo es o no resuelve."""
    try:
        found = {item[4][0] for item in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)}
    except OSError:
        return None
    if not found:
        return None
    for address in found:
        try:
            if not ipaddress.ip_address(address.split("%")[0]).is_global:
                return None
        except ValueError:
            return None
    return sorted(found)


def _http_get(url: str, ip: str, host: str, timeout: float) -> tuple[int, dict, bytes | None]:
    """Una petición GET a la IP ya comprobada, con `Host` y SNI del nombre original (el certificado se verifica contra el nombre)."""
    import httpx

    parts = urlsplit(url)
    literal = f"[{ip}]" if ":" in ip else ip
    target = parts._replace(netloc=f"{literal}:{parts.port}" if parts.port else literal).geturl()
    with httpx.Client(timeout=timeout, follow_redirects=False, trust_env=False) as client:
        with client.stream("GET", target, headers={"Host": host, "User-Agent": USER_AGENT, "Accept": "image/*"}, extensions={"sni_hostname": host}) as response:
            if response.status_code in (301, 302, 303, 307, 308):
                return response.status_code, dict(response.headers), b""
            body = bytearray()
            for chunk in response.iter_bytes():
                body.extend(chunk)
                if len(body) > MAX_BYTES:
                    return response.status_code, dict(response.headers), None
            return response.status_code, dict(response.headers), bytes(body)


def fetch(url: str, allowed_types: tuple[str, ...], *, resolve: Resolver = resolve_public, get: Getter = _http_get) -> tuple[bytes, str] | None:
    """Bytes y tipo de una imagen de la web, o `None` si no se puede (no es pública, no es imagen, pasa de 8 MB, falla o tarda)."""
    for _ in range(MAX_REDIRECTS + 1):
        parts = urlsplit(url)
        if parts.scheme not in ("http", "https") or not parts.hostname or parts.username or parts.password:
            return None
        port = parts.port or (443 if parts.scheme == "https" else 80)
        addresses = resolve(parts.hostname, port)
        if not addresses:
            return None
        try:
            status, headers, body = get(url, addresses[0], parts.hostname, TIMEOUT_SECONDS)
        except Exception:  # noqa: BLE001 — cualquier fallo de red es «imagen no disponible», nunca rompe el PDF
            return None
        if status in (301, 302, 303, 307, 308):
            location = {k.lower(): v for k, v in headers.items()}.get("location")
            if not location:
                return None
            url = urljoin(url, location)
            continue
        if status != 200 or body is None:
            return None
        content_type = {k.lower(): v for k, v in headers.items()}.get("content-type", "").split(";")[0].strip().lower()
        return (body, content_type) if content_type in allowed_types else None
    return None
