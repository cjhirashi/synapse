"""Cuerpo generado de un INDICE (H-031). Especificación compartida: `tests/fixtures/indice_cuerpo.json`,
que el frontend también cumple (`generate`)."""
import re
from collections.abc import Iterable, Sequence

from app.core.index_rules import INDEX_NAME, is_index_path
from app.core.note_rules import path_key

DESCRIPCION_MAX = 80


def _flat(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


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
    """Partes del elemento con valor, en orden: descripción, Estado, Tags, Actualizado y las columnas `extra`."""
    description = _flat(_text(frontmatter, "descripcion"))
    if len(description) > DESCRIPCION_MAX:
        description = description[:DESCRIPCION_MAX] + "…"
    tags = frontmatter.get("tags")
    tags_text = ", ".join(tags) if isinstance(tags, list) and all(isinstance(t, str) for t in tags) else ""
    labeled = [("Estado", _text(frontmatter, "estado")), ("Tags", tags_text), ("Actualizado", _text(frontmatter, "fecha_actualizacion"))]
    labeled += [(key, _extra(frontmatter.get(key))) for key in extra]
    return ([description] if description else []) + [f"{label}: {_flat(value)}" for label, value in labeled if _flat(value)]


_ENTITY = re.compile(r"&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{0,31});")


def _escape(text: str) -> str:
    """Escapa con `\\` lo que el parser de Markdown interpretaría dentro de un enlace (código, énfasis, HTML,
    entidades), para que el texto de la ruta y del nombre llegue intacto al reconocer el wikilink."""
    entities = {m.start() for m in _ENTITY.finditer(text)}
    out = []
    for i, ch in enumerate(text):
        if ch in "\\`*~<":
            out.append("\\" + ch)
        elif ch == "_" and not (0 < i < len(text) - 1 and text[i - 1].isalnum() and text[i + 1].isalnum()):
            out.append("\\_")
        elif ch == "&" and i in entities:
            out.append("\\&")
        else:
            out.append(ch)
    return "".join(out)


_AUTOLINK = re.compile(r"@|://|www\.", re.IGNORECASE)


def _link(path: str, text: str) -> str:
    """Wikilink `[[ruta\\|texto]]`. Si la ruta o el texto traen `[`, `]` (o `|` en la ruta), o algo que GFM
    convierte en autoenlace (`@`, `://`, `www.`), el wikilink no se reconocería: se emite el texto plano, sin enlace."""
    if any(ch in path + text for ch in "[]") or "|" in path or _AUTOLINK.search(path + text):
        return _flat(text)
    return f"[[{_escape(path)}\\|{_escape(_flat(text)).replace('|', chr(92) + '|')}]]"


def _item(link: str, parts: list[str]) -> str:
    return f"- {link} — {' · '.join(parts)}" if parts else f"- {link}"


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
        for name in sorted(subfolders, key=path_key):
            index = prefix + name + "/" + INDEX_NAME
            lines.append(_item(_link(index, name), _meta(by_path.get(index, {}), extra)))
    else:
        lines.append("_Sin subcarpetas._")
    lines += ["", "## Documentos", ""]
    if documents:
        for path, base in sorted(documents, key=lambda d: path_key(d[1])):
            frontmatter = by_path[path]
            title = frontmatter.get("titulo") if isinstance(frontmatter.get("titulo"), str) and frontmatter.get("titulo") else base
            lines.append(_item(_link(path, title), _meta(frontmatter, extra)))
    else:
        lines.append("_Sin documentos._")
    return lines


def render_body(vault_name: str, folder: str, notes: Iterable[dict], extra: Sequence[str] = ()) -> str:
    return "\n".join(body_lines(vault_name, folder, notes, extra)) + "\n"
