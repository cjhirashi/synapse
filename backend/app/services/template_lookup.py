"""Búsqueda de plantillas en una bóveda (H-035, H-036)."""

from app.core.plantilla_rules import template_path
from app.services.note_content_service import NoteContentService

_TEMPLATE_PAGES = 5  # hasta 1 000 plantillas; en la práctica hay un puñado


def find_template(notes: NoteContentService, vault_id: str, name: object) -> dict | None:
    """Busca una plantilla por nombre en la carpeta PLANTILLAS y retorna su frontmatter completo.
    Retorna None si `name` no es texto o no existe."""
    if not isinstance(name, str) or not name:
        return None
    wanted, cursor = template_path(name), None
    for _ in range(_TEMPLATE_PAGES):
        page = notes.list(vault_id, deleted=False, limit=200, cursor=cursor, prefix="PLANTILLAS")
        for item in page.items:
            if item.path == wanted:
                return item.frontmatter or {}
        cursor = page.next_cursor
        if cursor is None:
            break
    return None
