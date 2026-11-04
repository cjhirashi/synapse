"""Reglas puras de reescritura de wikilinks (H-039 C-1..C-6).

Sin E/S: las usa WikilinkRewriteService (servicios de carpeta/nota) y las espeja
el cliente (frontend/src/editor/wikilink.ts). Ambos lados recorren el fixture
`tests/fixtures/wikilink_rewrite_cases.json`.

Reglas exactas (C-1..C-6):
- C-1: Ruta completa exacta (path_key) se reescribe conservando .md.
- C-2: Solo nombre único (sin cambio de carpeta) se reescribe si es único vivo.
- C-3: Solo nombre ambiguo NO se reescribe, se reporta.
- C-4: Cambio de carpeta sin cambio de archivo NO toca solo nombre.
- C-5: NO tocar código vallado (``` / ~~~), código en línea (`...`),
  ni enlaces/imágenes markdown [...](...)  / ![](...)
- C-6: NO tocar extensiones ajenas (.pdf, .png, etc.).
"""
from typing import NamedTuple
import re

from app.core.note_rules import path_key


class Rename(NamedTuple):
    """Un renombre en el plan."""
    old_path: str
    new_path: str


class RewritePlan(NamedTuple):
    """Plan de reescritura derivado del conjunto de renombres."""
    # Mapeo: path_key(old_path con .md forzado) -> new_path canónico
    path_renames: dict[str, str]
    # Mapeo: name_key de archivo viejo -> nuevo path (para solo nombre)
    # Solo incluye renombres donde el nombre de archivo CAMBIA y es único vivo.
    name_renames: dict[str, str]
    # Nombres ambiguos que no se reescriben.
    ambiguous_names: set[str]


class Rewrite(NamedTuple):
    """Resultado puro de reescribir UNA nota."""
    content: str      # cuerpo reescrito (== entrada si no hubo cambios)
    links: int        # nº de wikilinks reescritos en esta nota
    ambiguous: list[str]  # nombres ambiguos hallados y NO reescritos


def _last_segment(path: str) -> str:
    """Nombre de archivo de una ruta."""
    slash = path.rfind("/")
    return path[slash + 1:] if slash >= 0 else path


def _has_unmanaged_extension(target: str) -> bool:
    """¿El destino trae una extensión ajena (.pdf, .png, etc.)? (no .md)."""
    match = re.search(r"\.([^./\s]+)$", _last_segment(target.strip()))
    return match is not None and match.group(1).lower() != "md"


def plan_renames(renames: list[Rename], name_census: dict[str, int]) -> RewritePlan:
    """Deriva, de los renombres y el censo de nombres {name_key: nº vivos},
    los mapeos: rutas completas viejas->nuevas (path_key) y nombres-de-archivo
    que cambian con su destino, marcando ambiguos (más de 1 vivo con ese nombre).

    Args:
        renames: Lista de (old_path, new_path).
        name_census: {name_key: count} de notas vivas (sin INDICE, sin papelera).

    Returns:
        RewritePlan con path_renames, name_renames, y ambiguous_names.
    """
    path_renames = {}
    name_renames = {}
    ambiguous_names = set()

    for old_path, new_path in renames:
        # C-1: ruta completa con .md forzado
        old_key = path_key(old_path + (".md" if not old_path.endswith(".md") else ""))
        path_renames[old_key] = new_path

        # C-2/C-3: solo nombre
        old_name = _last_segment(old_path)
        new_name = _last_segment(new_path)
        old_name_key = path_key(old_name)
        new_name_key = path_key(new_name)

        # Solo si el nombre de archivo CAMBIA
        if old_name_key != new_name_key:
            # ¿Es único vivo el nombre viejo?
            count = name_census.get(old_name_key, 0)
            if count == 1:
                # Único: se reescribe
                name_renames[old_name_key] = new_path
            elif count > 1:
                # Ambiguo: se reporta
                ambiguous_names.add(old_name_key)

    return RewritePlan(
        path_renames=path_renames,
        name_renames=name_renames,
        ambiguous_names=ambiguous_names,
    )


_FENCE_LINE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
_INLINE_CODE = re.compile(r"(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)", re.S)


def _protected_spans(text: str) -> list[tuple[int, int]]:
    """Rangos `[ini, fin)` donde NO se reescribe: bloques de código vallados (``` o ~~~, abiertos al inicio de
    línea y cerrados por una valla del mismo carácter y al menos igual de larga; sin cierre, hasta el final) y
    código en línea (corridas de comillas invertidas iguales, sin línea en blanco dentro)."""
    spans: list[tuple[int, int]] = []
    pos = 0
    outside_start = 0  # inicio del tramo fuera de valla aún sin revisar
    fence: tuple[str, int, int] | None = None  # (carácter, longitud, inicio)
    for line in text.splitlines(keepends=True):
        match = _FENCE_LINE.match(line)
        if fence is None:
            if match:
                run = match.group(1)
                fence = (run[0], len(run), pos)
                spans_inline = _inline_spans(text, outside_start, pos)
                spans.extend(spans_inline)
        elif match and match.group(1)[0] == fence[0] and len(match.group(1)) >= fence[1] and not line.strip().strip(fence[0]):
            spans.append((fence[2], pos + len(line)))
            fence = None
            outside_start = pos + len(line)
        pos += len(line)
    if fence is not None:
        spans.append((fence[2], len(text)))
    else:
        spans.extend(_inline_spans(text, outside_start, len(text)))
    return spans


def _inline_spans(text: str, start: int, end: int) -> list[tuple[int, int]]:
    return [(start + m.start(), start + m.end()) for m in _INLINE_CODE.finditer(text[start:end]) if "\n\n" not in m.group(0)]


def _in_spans(spans: list[tuple[int, int]], pos: int) -> bool:
    return any(a <= pos < b for a, b in spans)


def rewrite_note(content: str, plan: RewritePlan) -> Rewrite:
    """Reescribe los wikilinks del cuerpo según `plan`.
    No toca código vallado (``` / ~~~), código en línea (`...`),
    ni enlaces/imágenes markdown [...](...)  / ![](...)

    Args:
        content: Cuerpo original.
        plan: RewritePlan derivado de los renombres.

    Returns:
        Rewrite(content reescrito, nº links, nombres ambiguos encontrados).
    """
    if not plan.path_renames and not plan.name_renames:
        # Nada que reescribir
        return Rewrite(content, 0, [])

    # Patrón de wikilink: [[...]]
    wikilink_pattern = r"\[\[([^\[\]]+?)\]\]"

    result = []
    last_pos = 0
    links_rewritten = 0
    ambiguous_found = []

    protected = _protected_spans(content)
    for match in re.finditer(wikilink_pattern, content):
        wikilink_start = match.start()
        wikilink_end = match.end()

        # C-5: dentro de código (vallado o en línea) no se toca
        if _in_spans(protected, wikilink_start):
            result.append(content[last_pos:wikilink_end])
            last_pos = wikilink_end
            continue

        # Extraer cuerpo del wikilink (sin los [[ ]])
        body = match.group(1)

        # Separar destino y alias
        # Buscar \| primero (tablas), sino el primer |
        escaped_pipe_pos = body.find("\\|")
        normal_pipe_pos = body.find("|")

        # Decidir qué separador usar
        if escaped_pipe_pos >= 0 and (normal_pipe_pos < 0 or escaped_pipe_pos < normal_pipe_pos):
            # \| es el separador (y aparece antes de un | normal si existe)
            pipe_pos = escaped_pipe_pos
            dest_part = body[:pipe_pos]
            alias_part = body[pipe_pos:]  # Incluye el \|
        elif normal_pipe_pos >= 0:
            # | es el separador
            pipe_pos = normal_pipe_pos
            dest_part = body[:pipe_pos]
            alias_part = body[pipe_pos:]  # Incluye el |
        else:
            # Sin separador
            dest_part = body
            alias_part = ""

        # Extraer destino (trimmed para comparación)
        dest_trimmed = dest_part.strip()

        # C-6: Si tiene extensión ajena, no tocar
        if _has_unmanaged_extension(dest_trimmed):
            result.append(content[last_pos:wikilink_end])
            last_pos = wikilink_end
            continue

        # Intentar reescribir por ruta completa (C-1, C-4)
        # Normalizar: si ya tiene .md (case-insensitive), no agregar
        last_part = dest_trimmed.lower()
        has_md_ext = last_part.endswith(".md")
        dest_with_md = dest_trimmed if has_md_ext else dest_trimmed + ".md"
        dest_key = path_key(dest_with_md)

        new_path = None
        if dest_key in plan.path_renames:
            # Ruta completa exacta encontrada
            new_full_path = plan.path_renames[dest_key]

            # Conservar si traía .md o no
            has_md_original = dest_trimmed.lower().endswith(".md")
            has_md_new = new_full_path.lower().endswith(".md")

            if not has_md_original and has_md_new:
                # Original sin .md, nuevo con .md -> quitar .md
                new_path = new_full_path[:-3]
            elif has_md_original and not has_md_new:
                # Original con .md, nuevo sin .md -> agregar .md
                new_path = new_full_path + ".md"
            else:
                # Ambos con o sin -> dejar como está
                new_path = new_full_path
        else:
            # Intentar por solo nombre (C-2, C-3, C-4)
            if "/" not in dest_trimmed:
                # Es solo nombre. Calcular su clave normalizada (con .md forzado)
                name_with_md = dest_trimmed if dest_trimmed.lower().endswith(".md") else dest_trimmed + ".md"
                name_key = path_key(name_with_md)
                if name_key in plan.name_renames:
                    # Solo nombre único que cambia
                    full_new = plan.name_renames[name_key]
                    new_name = _last_segment(full_new)
                    # Conservar si traía .md o no
                    has_md_original = dest_trimmed.lower().endswith(".md")
                    has_md_new = new_name.lower().endswith(".md")
                    if not has_md_original and has_md_new:
                        new_name = new_name[:-3]
                    elif has_md_original and not has_md_new:
                        new_name = new_name + ".md"
                    new_path = new_name
                elif name_key in plan.ambiguous_names:
                    # Ambiguo: reportar si no está ya en la lista
                    if name_key not in ambiguous_found:
                        ambiguous_found.append(name_key)

        if new_path is not None:
            # Reescribir conservando espacios y alias
            # Reconstruir: [[ <espacios_antes>dest_nuevo<espacios_despues>|alias ]]
            # O: [[ <espacios_antes>dest_nuevo<espacios_despues>\|alias ]]

            # Detectar espacios alrededor del destino original
            before_spaces = dest_part[:len(dest_part) - len(dest_part.lstrip())]
            after_spaces = dest_part[len(dest_part.rstrip()):]

            new_body = before_spaces + new_path + after_spaces + alias_part
            new_wikilink = "[[" + new_body + "]]"
            result.append(content[last_pos:wikilink_start])
            result.append(new_wikilink)
            last_pos = wikilink_end
            links_rewritten += 1
        else:
            # No reescribir
            result.append(content[last_pos:wikilink_end])
            last_pos = wikilink_end

    # Agregar el resto del contenido
    result.append(content[last_pos:])

    new_content = "".join(result)
    return Rewrite(new_content, links_rewritten, ambiguous_found)
