"""Bitácora automática de la bóveda (H-030b, H-062). Reglas puras, sin E/S.

El servidor registra cada cambio de cada documento (`change_log`) y de ahí genera, en `BITACORA/AAAA-MM/`, una
nota por día con las entradas en orden. Qué se registra, el nombre de los documentos del día y su texto salen
de este módulo; escribirlas es de `services/change_log_service.py`.

No se registran (P7): los INDICES automáticos (sí un cambio de su `descripcion`), las escrituras de la propia
BITACORA, los cambios que solo tocan `fecha_actualizacion` y las lecturas.

H-062: cada cambio registra diff (líneas agregadas/eliminadas y texto unificado truncado).
"""
import difflib
import json
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


class Diff(NamedTuple):
    """H-062: Diff calculado de un cambio."""
    added: int               # Líneas agregadas (siempre real, nunca None)
    removed: int             # Líneas eliminadas (siempre real, nunca None)
    text: str | None         # Texto del diff unificado (truncado a 200 líneas / 20 KiB; None si no hay)
    truncated: bool          # True si se truncó


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
    lines_added: int | None = None      # H-062
    lines_removed: int | None = None    # H-062
    diff_text: str | None = None        # H-062
    diff_truncated: bool | None = None  # H-062


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


def compute_diff(old: dict | None, new: dict) -> Diff:
    """H-062: Calcula el diff entre dos versiones de una nota.

    - create: todas las líneas del contenido como agregadas.
    - delete: todas las líneas como eliminadas.
    - restore: sin líneas (solo cambió deleted_at).
    - rename/move sin cambio de contenido: 0/0 y text None.
    - edit: diff unificado del contenido + cambios de frontmatter.
    - Normaliza CRLF → LF para evitar falsos cambios.
    - Trunca a 200 líneas o 20 KiB (lo que ocurra primero); conteos reales siempre.
    - Propaga excepciones; ChangeLogService.begin las captura y registra sin diff.
    """
    op = classify(old, new)

    # restore: solo cambió deleted_at
    if op == "restore":
        return Diff(0, 0, None, False)

    # rename/move sin cambio de contenido
    if op in ("rename", "move"):
        if (old or {}).get("content") == new.get("content") and \
           not changed_keys((old or {}).get("frontmatter"), new.get("frontmatter")):
            return Diff(0, 0, None, False)

    # delete: todas las líneas como eliminadas
    if op == "delete":
        content = (old or {}).get("content", "")
        lines = _normalize_lines(content)
        removed_count = len(lines)
        # Generar diff con cada línea prefijada con `-`
        diff_lines = [f"-{line}" for line in lines]
        text, truncated = _truncate_diff(diff_lines)
        return Diff(0, removed_count, text, truncated)

    # create: todas las líneas como agregadas
    if op == "create":
        content = new.get("content", "")
        lines = _normalize_lines(content)
        added_count = len(lines)
        # Generar diff con cada línea prefijada con `+`
        diff_lines = [f"+{line}" for line in lines]
        text, truncated = _truncate_diff(diff_lines)
        return Diff(added_count, 0, text, truncated)

    # edit: diff unificado de contenido + frontmatter
    old_content = _normalize_lines((old or {}).get("content", ""))
    new_content = _normalize_lines(new.get("content", ""))

    diff_lines = list(difflib.unified_diff(
        old_content, new_content, fromfile="", tofile="", lineterm="", n=2
    ))

    # Descartar cabeceras (primeras 2 líneas: --- y +++)
    if len(diff_lines) > 2:
        diff_lines = diff_lines[2:]

    # Frontera frontmatter: solo claves que cambiaron
    fm_diff_lines = _frontmatter_diff(_normalize_frontmatter((old or {}).get("frontmatter")),
                                      _normalize_frontmatter(new.get("frontmatter")))

    all_diff = diff_lines + fm_diff_lines
    if not all_diff:
        return Diff(0, 0, None, False)

    # Contar líneas reales (sin las de contexto @@)
    added = sum(1 for line in all_diff if line.startswith("+"))
    removed = sum(1 for line in all_diff if line.startswith("-"))

    # Truncar diff text
    text, truncated = _truncate_diff(all_diff)

    return Diff(added, removed, text, truncated)


def _normalize_lines(text: str) -> list[str]:
    """Normaliza saltos de línea CRLF → LF y divide en líneas."""
    text = text.replace("\r\n", "\n").rstrip("\n")
    return text.split("\n") if text else []


def _normalize_frontmatter(fm: dict | None) -> dict:
    """Elimina fecha_actualizacion como ya hace classify."""
    if not fm:
        return {}
    return {k: v for k, v in fm.items() if k != "fecha_actualizacion"}


def _frontmatter_diff(old_fm: dict, new_fm: dict) -> list[str]:
    """Genera líneas de diff para cambios de frontmatter (solo claves que cambiaron)."""
    changes = changed_keys(old_fm, new_fm)
    if not changes:
        return []

    lines = []
    for key in sorted(changes):
        old_val = old_fm.get(key)
        new_val = new_fm.get(key)

        # Formato: `-clave: <JSON compacto del valor>` / `+clave: ...` (sin espacio tras el signo)
        old_line = f"{key}: {json.dumps(old_val, separators=(',', ':'), ensure_ascii=False)}" if old_val is not None else None
        new_line = f"{key}: {json.dumps(new_val, separators=(',', ':'), ensure_ascii=False)}" if new_val is not None else None

        if old_line:
            lines.append(f"-{old_line}")
        if new_line:
            lines.append(f"+{new_line}")

    return lines


def _truncate_diff(diff_lines: list[str]) -> tuple[str | None, bool]:
    """Trunca diff a 200 líneas o 20 KiB; retorna (texto, fue_truncado)."""
    MAX_LINES = 200
    MAX_BYTES = 20000

    truncated = False
    result_lines = []
    byte_count = 0

    for i, line in enumerate(diff_lines):
        if i >= MAX_LINES:
            truncated = True
            break
        byte_count += len(line.encode("utf-8")) + 1  # +1 para newline
        if byte_count > MAX_BYTES:
            truncated = True
            break
        result_lines.append(line)

    if not result_lines:
        return None, False

    text = "\n".join(result_lines)
    return text, truncated


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


def _format_number(n: int) -> str:
    """Formatea número con coma de miles (formato México)."""
    return f"{n:,}"


def _line(entry: Entry, tz: str) -> str:
    """H-062: Incluye conteo de líneas si está disponible."""
    when = entry.at.astimezone(zone(tz)).strftime("%H:%M:%S")
    who = f"{entry.author} ({AUTHOR_KIND_LABEL.get(entry.author_kind, entry.author_kind)})"
    if entry.op in ("rename", "move") and entry.prev_path:
        where = f"antes {_code(entry.prev_path)}, ahora {_code(entry.path)}"
    else:
        where = _code(entry.path)
    title = f" «{entry.title}»" if entry.title else ""
    mark = {STATUS_PENDING: " [sin confirmar]", STATUS_FAILED: " [no se aplicó]"}.get(entry.status, "")

    # H-062: Mostrar conteo de líneas si está disponible
    if entry.lines_added is not None and entry.lines_removed is not None:
        lines_text = f" · +{_format_number(entry.lines_added)} −{_format_number(entry.lines_removed)}"
    elif entry.lines_added is None and entry.lines_removed is None:
        # Cambio anterior a H-062: sin detalle
        lines_text = " · sin detalle"
    else:
        lines_text = ""

    return f"- **{when}** · {who} · {OP_LABEL[entry.op]}{title} · {where}{lines_text}{mark}"


def render_day(date_iso: str, tz: str, entries: list[Entry]) -> str:
    """H-063: Cuerpo Markdown del documento de un día con diff numerado.

    Cada línea de cambio muestra +N −M (si hay conteo). Debajo, bloque de código con el diff,
    con números de línea antigua/nueva, marcando truncado si fuera necesario.
    """
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

    lines = head + [f"{len(ordered)} {'cambio' if len(ordered) == 1 else 'cambios'}.", ""]
    for entry in ordered:
        lines.append(_line(entry, tz))
        # H-063: Bloque de diff numerado si está disponible
        if entry.diff_text:
            numbered_diff = number_diff(entry.op, entry.diff_text)
            fence = _safe_fence(numbered_diff)
            lines.append(f"    {fence}diff")
            for diff_line in numbered_diff.split("\n"):
                lines.append(f"    {diff_line}")
            lines.append(f"    {fence}")
            if entry.diff_truncated:
                # Mostrar nota de truncado en línea aparte con misma indentación
                shown = len(numbered_diff.split("\n"))
                lines.append(f"    _Diff truncado: se muestran {_format_number(shown)} líneas; el conteo es el real._")

    lines.append("")
    return "\n".join(lines)


def number_diff(op: str, text: str) -> str:
    """H-063: Numera las líneas de un diff para mostrar antes/después en dos columnas.

    Retorna el texto listo para el bloque de código. Cada línea sale como:
    `{marca}{viejo:>W} {nuevo:>W}  {texto}` donde marca es +/- o espacio, W es el ancho
    mínimo para los números del bloque.

    - Las cabeceras `@@ ... @@` pasan tal cual (empiezan con @).
    - create: nuevas líneas numeradas 1..N; viejo en blanco.
    - delete: líneas eliminadas numeradas 1..N; nuevo en blanco.
    - edit: numera con dos contadores; frontmatter etiquetado como `prop`.
    - Tolerante: nunca lanza excepción; ante anomalías, retorna sin número.
    """
    if not text:
        return ""

    lines = text.split("\n")
    if not lines:
        return ""

    # Tolerancia: si falla algo, retorna sin número.
    try:
        if op == "create":
            return _number_diff_create(lines)
        elif op == "delete":
            return _number_diff_delete(lines)
        elif op == "edit":
            return _number_diff_edit(lines)
        else:
            # Operación desconocida: retorna sin número, con la marca en el primer carácter.
            return _fallback_lines(lines)
    except Exception:
        # Ante cualquier error, retorna sin número.
        return _fallback_lines(lines)


def _number_diff_create(lines: list[str]) -> str:
    """Numera un diff de creación (todas las líneas son +)."""
    max_num = len(lines)
    width = max(3, len(str(max_num)))
    result = []
    for i, line in enumerate(lines, 1):
        mark = line[0] if line and line[0] in ("+", "-", " ") else "+"
        text = line[1:] if line and line[0] in ("+", "-", " ") else line
        numbered = f"{mark}{'':<{width}} {i:>{width}}  {text}".rstrip()
        result.append(numbered)
    return "\n".join(result)


def _number_diff_delete(lines: list[str]) -> str:
    """Numera un diff de eliminación (todas las líneas son -)."""
    max_num = len(lines)
    width = max(3, len(str(max_num)))
    result = []
    for i, line in enumerate(lines, 1):
        mark = line[0] if line and line[0] in ("+", "-", " ") else "-"
        text = line[1:] if line and line[0] in ("+", "-", " ") else line
        numbered = f"{mark}{i:>{width}} {'':<{width}}  {text}".rstrip()
        result.append(numbered)
    return "\n".join(result)


def _number_diff_edit(lines: list[str]) -> str:
    """Numera un diff de edición (con dos contadores y frontmatter)."""
    result = []
    old_line_num = 0
    new_line_num = 0
    old_remaining = 0
    new_remaining = 0
    hunk_started = False
    max_line_num = 0

    # Primer paso: calcular el máximo número de línea para el ancho.
    for line in lines:
        if line.startswith("@@"):
            # Parsear cabecera: @@ -a,b +c,d @@
            match = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", line)
            if match:
                old_start = int(match.group(1))
                old_count = int(match.group(2) or 1)
                new_start = int(match.group(3))
                new_count = int(match.group(4) or 1)
                max_line_num = max(max_line_num, old_start + old_count, new_start + new_count)

    width = max(3, len(str(max_line_num))) if max_line_num > 0 else 3

    # Segundo paso: numerar.
    for line in lines:
        if line.startswith("@@"):
            # Cabecera: extraer números.
            match = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", line)
            if match:
                old_line_num = int(match.group(1))
                old_remaining = int(match.group(2) or 1)
                new_line_num = int(match.group(3))
                new_remaining = int(match.group(4) or 1)
                hunk_started = True
                result.append(line)
            else:
                # Cabecera malformada: pasar tal cual.
                result.append(line)
        elif hunk_started and old_remaining == 0 and new_remaining == 0:
            # Estamos en frontmatter (terminó el hunk).
            mark = line[0] if line and line[0] in ("+", "-", " ") else " "
            text = line[1:] if line and line[0] in ("+", "-", " ") else line
            numbered = f"{mark}{'prop':<{width}} {'prop':<{width}}  {text}".rstrip()
            result.append(numbered)
        elif hunk_started and (old_remaining > 0 or new_remaining > 0):
            # Dentro del hunk: numerar según el tipo de línea.
            mark = line[0] if line and line[0] in ("+", "-", " ") else " "
            text = line[1:] if line and line[0] in ("+", "-", " ") else line

            if mark == "-":
                numbered = f"{mark}{old_line_num:>{width}} {'':<{width}}  {text}".rstrip()
                old_line_num += 1
                old_remaining -= 1
            elif mark == "+":
                numbered = f"{mark}{'':<{width}} {new_line_num:>{width}}  {text}".rstrip()
                new_line_num += 1
                new_remaining -= 1
            else:  # contexto
                numbered = f"{mark}{old_line_num:>{width}} {new_line_num:>{width}}  {text}".rstrip()
                old_line_num += 1
                new_line_num += 1
                old_remaining -= 1
                new_remaining -= 1
            result.append(numbered)
        else:
            # Línea antes de cualquier hunk (frontmatter sin hunk): etiquetar como `prop`.
            mark = line[0] if line and line[0] in ("+", "-", " ") else " "
            text = line[1:] if line and line[0] in ("+", "-", " ") else line
            numbered = f"{mark}{'prop':<{width}} {'prop':<{width}}  {text}".rstrip()
            result.append(numbered)

    return "\n".join(result)


def _fallback_lines(lines: list[str]) -> str:
    """Fallback: retorna las líneas con la marca en el primer carácter, sin número."""
    result = []
    for line in lines:
        # Garantizar que la marca es el primer carácter.
        if line and line[0] in ("+", "-", " ", "@"):
            result.append(line.rstrip())
        else:
            # Fuerza un prefijo para que el resaltador detect el tipo.
            result.append((" " + line).rstrip())
    return "\n".join(result)


def _safe_fence(text: str) -> str:
    """Genera una valla de backticks más larga que la mayor racha en el texto."""
    longest = max((len(run) for run in re.findall(r"`+", text)), default=0)
    return "`" * (longest + 3)  # +3 para asegurar


def day_frontmatter(date_iso: str, tz: str) -> dict:
    return {
        "titulo": f"Bitácora {date_iso}",
        "descripcion": f"Cambios registrados en la bóveda el {date_iso} ({tz}). Generado por el servidor; solo lectura.",
        "tags": ["bitacora"],
        "estado": "aprobado",
    }
