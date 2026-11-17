"""Funciones puras para armar una instantánea de publicación (H-035)."""

import html
import re

import nh3

from app.services import pdf_service


def clean_html(source: str) -> str:
    """Limpia el HTML usando el saneo estándar del PDF (nh3)."""
    return pdf_service.sanitize(source)


def number_headings(clean: str) -> tuple[str, list[dict]]:
    """Numera los encabezados (h1-h4) con id único; devuelve (HTML con ids, lista de toc).

    Los encabezados vacíos llevan id pero no entran al toc.
    """
    toc = []
    counter = 1

    def replacer(match: re.Match) -> str:
        nonlocal counter
        tag = match.group(1)
        attrs = match.group(2)
        inner = match.group(3)
        level = int(tag[1])

        # Añadir id="h-N" preservando atributos existentes
        new_attrs = f'{attrs} id="h-{counter}"'
        result = f"<{tag}{new_attrs}>{inner}</{tag}>"

        # Extraer texto plano usando nh3 y agregar al toc si no está vacío
        text_plain = html.unescape(nh3.clean(inner, tags=set())).strip()
        if text_plain:
            toc.append({"level": level, "id": f"h-{counter}", "text": text_plain})

        counter += 1
        return result

    numbered = pdf_service.HEADING_RE.sub(replacer, clean)
    return numbered, toc


def title_of(frontmatter: dict, path: str) -> str:
    """Extrae el título de la nota: `titulo` del frontmatter o el último tramo de la ruta."""
    titulo = frontmatter.get("titulo")
    if isinstance(titulo, str) and titulo.strip():
        result = titulo.strip()
    else:
        # Último tramo de la ruta sin .md
        result = path.rstrip("/").split("/")[-1]
        if result.endswith(".md"):
            result = result[:-3]

    # Máximo 255 caracteres
    return result[:255]


def meta_of(frontmatter: dict, template: dict | None) -> dict:
    """Extrae metadatos: descripcion, creacion, actualizacion, estado, estado_color."""
    meta = {}

    # Descripción
    descripcion = frontmatter.get("descripcion")
    if isinstance(descripcion, str) and descripcion.strip():
        meta["descripcion"] = descripcion.strip()

    # Fechas
    creacion = frontmatter.get("fecha_creacion")
    if isinstance(creacion, str) and creacion.strip():
        meta["creacion"] = creacion.strip()

    actualizacion = frontmatter.get("fecha_actualizacion")
    if isinstance(actualizacion, str) and actualizacion.strip():
        meta["actualizacion"] = actualizacion.strip()

    # Estado
    estado = frontmatter.get("estado")
    if isinstance(estado, str) and estado.strip():
        estado_str = estado.strip()
        meta["estado"] = estado_str

        # Buscar color en la plantilla
        if template and isinstance(template.get("estados"), list):
            for item in template["estados"]:
                if isinstance(item, dict) and item.get("nombre") == estado_str:
                    color = item.get("color")
                    if color:
                        meta["estado_color"] = color
                    break

    return meta
