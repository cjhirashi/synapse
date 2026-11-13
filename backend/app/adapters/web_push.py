"""Envío de Web Push (H-053): frontera con `pywebpush` y las claves VAPID. Solo este módulo importa la librería.

El mensaje viaja cifrado de extremo a extremo (aes128gcm) hacia el servicio de push del navegador; el servidor no abre
conexiones a ningún otro destino: `endpoint_allowed` limita las suscripciones a los servicios de push conocidos.
"""
import json
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlparse

from app.core.config import settings

PUSH_HOSTS = ("fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "notify.windows.com")
PUSH_SUFFIXES = (".push.services.mozilla.com", ".push.apple.com", ".notify.windows.com", ".googleapis.com")

Result = Literal["ok", "gone", "error"]


@dataclass(frozen=True)
class Target:
    endpoint: str
    p256dh: str
    auth: str


def push_configured() -> bool:
    return bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY and settings.VAPID_SUBJECT)


def endpoint_allowed(endpoint: str) -> bool:
    """Solo https hacia un servicio de push conocido (evita que una suscripción apunte a un destino interno)."""
    try:
        parsed = urlparse(endpoint)
    except ValueError:
        return False
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host or parsed.username or parsed.password or (parsed.port not in (None, 443)):
        return False
    return host in PUSH_HOSTS or host.endswith(PUSH_SUFFIXES)


def send(target: Target, payload: dict) -> Result:
    """Envía un mensaje. `gone` = el servicio dice que la suscripción ya no existe (404/410): hay que borrarla."""
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={"endpoint": target.endpoint, "keys": {"p256dh": target.p256dh, "auth": target.auth}},
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=86400,
            timeout=10,
        )
        return "ok"
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        return "gone" if status in (404, 410) else "error"
    except Exception:
        return "error"
