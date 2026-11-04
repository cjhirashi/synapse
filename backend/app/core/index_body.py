"""Cuerpo generado de un INDICE (H-031). Especificación compartida: `tests/fixtures/indice_cuerpo.json`,
que el frontend también cumple (`generate`)."""
import re
from collections.abc import Iterable, Sequence

from app.core.index_rules import INDEX_NAME, is_index_path
from app.core.note_rules import path_key

DESCRIPCION_CELDA_MAX = 80


def _cell(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().replace("|", "\\|")


def _text(frontmatter: dict, key: str) -> str:
    value = frontmatter.get(key)
    return value if isinstance(value, str) else ""


def _extra(value: object) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return value
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return ", ".join(value)
    return ""


def _meta(frontmatter: dict, extra: Sequence[str]) -> list[str]:
    description = re.sub(r"\s+", " ", _text(frontmatter, "descripcion")).strip()
    if len(description) > DESCRIPCION_CELDA_MAX:
        description = description[:DESCRIPCION_CELDA_MAX] + "…"
    tags = frontmatter.get("tags")
    tags_text = ", ".join(tags) if isinstance(tags, list) and all(isinstance(t, str) for t in tags) else ""
    cells = [description, _text(frontmatter, "estado"), tags_text, _text(frontmatter, "fecha_actualizacion")]
    return [_cell(c) for c in cells] + [_cell(_extra(frontmatter.get(key))) for key in extra]


def _link(path: str, text: str) -> str:
    if any(ch in path + text for ch in "[]"):
        return _cell(text)
    return f"[[{path}\\|{_cell(text)}]]"


def _row(cells: list[str]) -> str:
    return "|" + "|".join(f" {c} " for c in cells) + "|"


def _table(first: str, rows: list[list[str]], extra: Sequence[str]) -> list[str]:
    head = [first, "Descripción", "Estado", "Tags", "Actualizado", *extra]
    return [_row(head), "|" + "---|" * len(head), *(_row(r) for r in rows)]


def body_lines(vault_name: str, folder: str, notes: Iterable[dict], extra: Sequence[str] = ()) -> list[str]:
    """Líneas del cuerpo del INDICE de `folder` (`""` = raíz). `notes`: las notas vivas de la bóveda,
    cada una con `path` y `frontmatter`."""
    by_path = {n["path"]: n.get("frontmatter") or {} for n in notes}
    prefix = folder + "/" if folder else ""
    lines = [f"# {folder.split('/')[-1] if folder else vault_name}"]
    if folder:
        parent = "/".join(folder.split("/")[:-1])
        parent_name = parent.split("/")[-1] if parent else vault_name
        lines += ["", "## Navegación", "", f"- {_link((parent + '/' if parent else '') + INDEX_NAME, parent_name)}"]
    subfolders: set[str] = set()
    documents: list[tuple[str, str]] = []
    for path in by_path:
        if not path.startswith(prefix):
            continue
        parts = path[len(prefix):].split("/")
        if len(parts) > 1:
            subfolders.add(parts[0])
        elif not is_index_path(path):
            documents.append((path, parts[0][:-3]))
    lines += ["", "## Subcarpetas", ""]
    if subfolders:
        rows = []
        for name in sorted(subfolders, key=path_key):
            index = prefix + name + "/" + INDEX_NAME
            rows.append([_link(index, name), *_meta(by_path.get(index, {}), extra)])
        lines += _table("Carpeta", rows, extra)
    else:
        lines.append("_Sin subcarpetas._")
    lines += ["", "## Documentos", ""]
    if documents:
        rows = []
        for path, base in sorted(documents, key=lambda d: path_key(d[1])):
            frontmatter = by_path[path]
            title = frontmatter.get("titulo") if isinstance(frontmatter.get("titulo"), str) and frontmatter.get("titulo") else base
            rows.append([_link(path, title), *_meta(frontmatter, extra)])
        lines += _table("Documento", rows, extra)
    else:
        lines.append("_Sin documentos._")
    return lines


def render_body(vault_name: str, folder: str, notes: Iterable[dict], extra: Sequence[str] = ()) -> str:
    return "\n".join(body_lines(vault_name, folder, notes, extra)) + "\n"
