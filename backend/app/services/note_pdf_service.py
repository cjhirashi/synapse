"""PDF de una nota (H-036): lee la nota y el formato de su plantilla y se lo pasa a `pdf_service`. Solo la persona dueña (sesión)."""
import re
import unicodedata
from datetime import UTC, datetime

from app.adapters.file_repository import FileRepository
from app.core import pdf_style
from app.core.errors import PdfNotEnabled, StorageUnavailable
from app.core.plantilla_rules import template_path
from app.core.ports.object_storage_port import ObjectStoragePort
from app.services import pdf_service
from app.services.note_content_service import NoteContentService

_TEMPLATE_PAGES = 5  # hasta 1 000 plantillas; en la práctica hay un puñado


class NotePdfService:
    def __init__(self, notes: NoteContentService, files: FileRepository, storage: ObjectStoragePort, owner_id: str) -> None:
        self._notes = notes
        self._files = files
        self._storage = storage
        self._owner_id = owner_id

    def generate(self, vault_id: str, note_id: str, source_html: str, now: datetime | None = None) -> tuple[bytes, str]:
        """PDF de la nota y su nombre de archivo. `PdfNotEnabled` si su plantilla no lo activa."""
        note = self._notes.get(vault_id, note_id).note
        frontmatter = note.frontmatter or {}
        style = pdf_style.resolve(self._template_pdf(vault_id, frontmatter.get("plantilla")))
        if not style["activo"]:
            raise PdfNotEnabled()
        title = str(frontmatter.get("titulo") or "").strip() or note.path.rsplit("/", 1)[-1].removesuffix(".md")
        document = pdf_service.build_document(
            source_html, style, title=title, frontmatter=frontmatter, read_image=self._read_image, now=now or datetime.now(UTC))
        return pdf_service.make_pdf(document, self._read_image), file_name(title)

    def _template_pdf(self, vault_id: str, name: object) -> object:
        if not isinstance(name, str) or not name:
            return None
        wanted, cursor = template_path(name), None
        for _ in range(_TEMPLATE_PAGES):
            page = self._notes.list(vault_id, deleted=False, limit=200, cursor=cursor, prefix="PLANTILLAS")
            for item in page.items:
                if item.path == wanted:
                    estilo = (item.frontmatter or {}).get("estilo")
                    return estilo.get("pdf") if isinstance(estilo, dict) else None
            cursor = page.next_cursor
            if cursor is None:
                break
        return None

    def _read_image(self, file_id: str) -> tuple[bytes, str] | None:
        """Bytes y tipo de una imagen de la persona; `None` si no existe, es de otra persona o no es imagen."""
        record = self._files.get(file_id)
        if record is None or record.owner_id != self._owner_id or record.content_type not in pdf_service.IMAGE_TYPES:
            return None
        try:
            return self._storage.get_object(record.object_key), record.content_type
        except StorageUnavailable:
            return None


def file_name(title: str) -> str:
    """Nombre de descarga: el título sin acentos ni signos, hasta 80 caracteres, más `.pdf`."""
    plain = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    plain = re.sub(r"[^A-Za-z0-9._-]+", "-", plain).strip("-.")[:80]
    return f"{plain or 'documento'}.pdf"
