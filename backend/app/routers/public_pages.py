"""Ruta pública de publicaciones (H-035, fase 2): `GET /p/{token}` sin sesión."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, Response, status
from sqlalchemy.orm import Session

from app.adapters.database import get_db
from app.adapters.publication_repository import PublicationRepository
from app.core.errors import NoteNotFound, StorageUnavailable, VaultNotFound
from app.core.rate_limit import RateLimiter
from app.routers.vaults import get_vault_port
from app.services.note_content_service import NoteContentService
from app.services.publication_page import render_page, unavailable_page

router = APIRouter(include_in_schema=False)

limiter = RateLimiter(limit=120, window_seconds=60)  # por IP y minuto; cuentan también los 404

# Sin scripts ni iframes (`default-src 'none'`); el estilo en línea hace falta por los `style` ya filtrados del contenido.
PUBLIC_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; img-src 'self' data: https:; media-src 'self' https:; style-src 'unsafe-inline'; frame-src https://synapse.cjhirashi.com https://files-synapse.cjhirashi.com https://www.youtube-nocookie.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",  # al despublicar o republicar el cambio se ve al instante
}


def _client_key(request: Request) -> str:
    """Detrás del proxy la IP real llega en `CF-Connecting-IP`; sin ella (acceso directo) se usa la del socket."""
    return request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "unknown")


def _page(status_code: int, body: str, extra: dict | None = None) -> Response:
    return Response(content=body, status_code=status_code, media_type="text/html; charset=utf-8", headers={**PUBLIC_HEADERS, **(extra or {})})


@router.get("/p/{token}")
@router.head("/p/{token}")
def get_public_page(
    token: Annotated[str, Path(min_length=1)],
    request: Request,
    db: Session = Depends(get_db),
    port=Depends(get_vault_port),
):
    """Página pública de una publicación. Sin sesión: token inexistente, despublicado o de una nota borrada dan la misma respuesta 404."""
    if not limiter.allow(_client_key(request)):
        return _page(status.HTTP_429_TOO_MANY_REQUESTS, unavailable_page(), {"Retry-After": "60"})
    repo = PublicationRepository(db)
    pub = repo.get_by_token(token)
    if pub is None:
        return _page(status.HTTP_404_NOT_FOUND, unavailable_page())
    # Comprobar si la publicación está vencida (H-055)
    if pub.unpublish_at is not None and pub.unpublish_at <= datetime.now(UTC).replace(tzinfo=None):
        return _page(status.HTTP_404_NOT_FOUND, unavailable_page())
    # Sin sesión no hay actor ni guard: se lee con la base del dueño de la publicación para comprobar que la nota sigue viva.
    notes = NoteContentService(port, f"synapse_user_{pub.owner_id}")
    try:
        notes.get(pub.vault_id, pub.note_id)
    except (NoteNotFound, VaultNotFound):
        repo.delete(pub)  # el documento o su bóveda se borraron: la copia pública se retira
        repo.commit()
        return _page(status.HTTP_404_NOT_FOUND, unavailable_page())
    except StorageUnavailable:
        return _page(status.HTTP_503_SERVICE_UNAVAILABLE, unavailable_page())  # no se borra nada por un fallo pasajero
    return _page(status.HTTP_200_OK, render_page(pub))
