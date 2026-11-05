"""Bitácora automática de la bóveda (H-030b). Reglas puras, sin E/S.

El servidor registra cada cambio de cada documento (`change_log`) y de ahí genera, en `BITACORA/AAAA-MM/`, una
nota por día con las entradas en orden. Qué se registra, el nombre de los documentos del día y su texto salen
de este módulo; escribirlas es de `services/change_log_service.py`.

No se registran (P7): los INDICES automáticos (sí un cambio de su `descripcion`), las escrituras de la propia
BITACORA, los cambios que solo tocan `fecha_actualizacion` y las lecturas.
"""
import re
from datetime import UTC, datetime
from typing import NamedTuple
from zoneinfo import ZoneInfo

from app.core.ag_rules import BITACORA, meta_folder_of
from app.core.index_rules import changed_keys, folder_of, is_index_path

OPS = ("create", "edit", "rename", "move", "delete", "restore")
OP_LABEL = {
    "create": "creación", "edit": "edición", "rename": "renombre", "move": "movimiento",
    "delete": "borrado", "restore": "restauración",
}
STATUS_APPLIED, STATUS_PENDING, STATUS_FAILED = "applied", "pending", "failed"
AUTHOR_KIND_LABEL = {"human": "usuario", "agent": "agente", "general": "clave general", "system": "sistema"}
_DAY_RE = re.compile(r"^(\d{4})-(\d{2})/(\d{4})-(\d{2})-(\d{2})\.md$")


class Entry(NamedTuple):
    """Una línea de la bitácora tal como la guarda `change_log`."""

    at: datetime               # UTC con zona
    op: str
    path: str
    prev_path: str | None
    title: str | None
    author_kind: str           # human | agent | general | system
    author: str
    status: str


def classify(old: dict | None, new: dict) -> str | None:
    """Operación a registrar al pasar una nota de `old` (`None` si es nueva) a `new`, o `None` si no se registra.

    Ambos son documentos de nota de CouchDB (`path`, `content`, `frontmatter`, `deleted_at`).
    """
    new_path = new["path"]
    old_path = old["path"] if old else None
    if meta_folder_of(new_path) == BITACORA and not is_index_path(new_path):
        return None
    if old is None:
        op = "delete" if new.get("deleted_at") else "create"
    elif not old.get("deleted_at") and new.get("deleted_at"):
        op = "delete"
    elif old.get("deleted_at") and not new.get("deleted_at"):
        op = "restore"
    elif old_path != new_path:
        op = "rename" if folder_of(old_path) == folder_of(new_path) else "move"
    elif old.get("content") != new.get("content") or changed_keys(old.get("frontmatter"), new.get("frontmatter")):
        op = "edit"
    else:
        return None  # solo cambió la fecha de actualización (u otro ruido del cliente)
    if is_index_path(new_path):
        # Un INDICE es automático: solo importa que alguien edite su descripción.
        return "edit" if op == "edit" and "descripcion" in changed_keys(
            (old or {}).get("frontmatter"), new.get("frontmatter")) else None
    return op


def title_of(doc: dict) -> str:
    """Nombre legible del documento: su `titulo` si lo tiene, si no el nombre del archivo sin `.md`."""
    title = (doc.get("frontmatter") or {}).get("titulo")
    if isinstance(title, str) and title.strip():
        return title.strip()
    base = doc["path"].rsplit("/", 1)[-1]
    return base[:-3] if base.lower().endswith(".md") else base


def zone(name: str) -> ZoneInfo:
    return ZoneInfo(name)


def local_date(at: datetime, tz: str) -> str:
    return at.astimezone(zone(tz)).date().isoformat()


def day_path(date_iso: str) -> str:
    """`BITACORA/AAAA-MM/AAAA-MM-DD.md` del día `date_iso` (`AAAA-MM-DD`)."""
    return f"{BITACORA}/{date_iso[:7]}/{date_iso}.md"


def parse_day_path(path: str) -> str | None:
    """El día (`AAAA-MM-DD`) de una ruta `BITACORA/AAAA-MM/AAAA-MM-DD.md`, o `None`."""
    parts = path.split("/", 1)
    if len(parts) != 2 or parts[0] != BITACORA:
        return None
    match = _DAY_RE.fullmatch(parts[1])
    if not match or match[1] != match[3] or match[2] != match[4]:
        return None
    try:
        datetime(int(match[3]), int(match[4]), int(match[5]))
    except ValueError:
        return None
    return f"{match[3]}-{match[4]}-{match[5]}"


def utc_bounds(date_iso: str, tz: str) -> tuple[datetime, datetime]:
    """Inicio (incluido) y fin (excluido) del día local `date_iso` en UTC."""
    y, m, d = (int(x) for x in date_iso.split("-"))
    start = datetime(y, m, d, tzinfo=zone(tz))
    nxt = datetime.fromordinal(start.toordinal() + 1).replace(tzinfo=zone(tz))
    return start.astimezone(UTC), nxt.astimezone(UTC)


def _code(text: str) -> str:
    """Texto en código en línea; si trae acentos graves, con una valla más larga que la racha mayor."""
    longest = max((len(run) for run in re.findall(r"`+", text)), default=0)
    fence = "`" * (longest + 1)
    pad = " " if text.startswith("`") or text.endswith("`") else ""
    return f"{fence}{pad}{text}{pad}{fence}"


def _line(entry: Entry, tz: str) -> str:
    when = entry.at.astimezone(zone(tz)).strftime("%H:%M:%S")
    who = f"{entry.author} ({AUTHOR_KIND_LABEL.get(entry.author_kind, entry.author_kind)})"
    if entry.op in ("rename", "move") and entry.prev_path:
        where = f"antes {_code(entry.prev_path)}, ahora {_code(entry.path)}"
    else:
        where = _code(entry.path)
    title = f" «{entry.title}»" if entry.title else ""
    mark = {STATUS_PENDING: " [sin confirmar]", STATUS_FAILED: " [no se aplicó]"}.get(entry.status, "")
    return f"- **{when}** · {who} · {OP_LABEL[entry.op]}{title} · {where}{mark}"


def render_day(date_iso: str, tz: str, entries: list[Entry]) -> str:
    """Cuerpo Markdown del documento de un día: las entradas en orden cronológico."""
    head = [
        f"# Bitácora del {date_iso}",
        "",
        f"Registro automático de los cambios de esta bóveda. Las horas son de {tz}. "
        "Lo escribe el servidor y es de solo lectura.",
        "",
    ]
    ordered = sorted(entries, key=lambda e: e.at)
    if not ordered:
        return "\n".join(head + ["Sin cambios registrados.", ""])
    return "\n".join(head + [f"{len(ordered)} {'cambio' if len(ordered) == 1 else 'cambios'}.", ""] + [_line(e, tz) for e in ordered] + [""])


def day_frontmatter(date_iso: str, tz: str) -> dict:
    return {
        "titulo": f"Bitácora {date_iso}",
        "descripcion": f"Cambios registrados en la bóveda el {date_iso} ({tz}). Generado por el servidor; solo lectura.",
        "tags": ["bitacora"],
        "estado": "aprobado",
    }
