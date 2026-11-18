"""Página pública de una publicación (H-035): documento HTML completo para servir sin sesión.

Estructura: tarjeta del documento (título, descripción, creación, actualización y estado), índice (plegable en el celular y lateral en pantallas anchas),
contenido ya limpio de la instantánea y pie con el crédito. El texto y los encabezados del contenido llevan la tipografía, el tamaño y el color del PDF de la plantilla (`style`). Todo lo que viene de la instantánea (título, metadatos, índice) se escapa; solo `pub.html`
entra tal cual porque el servidor lo limpió al publicar. Los estilos están en `publication_css.py`.
"""

import html
import json
import re

from app.core.models.publication import Publication
from app.services.publication_css import PAGE_CSS, UNAVAILABLE_CSS, pdf_style_css

_MONTHS = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
_ISO_DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_STATE_COLORS = ("gris", "azul", "verde", "rojo")
_FOOT = 'Desarrollado por <a href="https://cjhirashi.com" rel="noopener">@cjhirashi</a>'


def _load_json(raw: str, kind: type) -> dict | list:
    """JSON guardado de la instantánea; si está corrupto o no es del tipo esperado, vacío (la página no se rompe)."""
    try:
        value = json.loads(raw) if raw else kind()
    except ValueError:
        return kind()
    return value if isinstance(value, kind) else kind()


def _date(value: object) -> str:
    """«2026-11-15» → «15 nov 2026»; lo que no tenga esa forma se muestra tal cual (escapado)."""
    text = str(value)
    found = _ISO_DATE.match(text)
    if found and 1 <= int(found.group(2)) <= 12:
        return f"{int(found.group(3))} {_MONTHS[int(found.group(2)) - 1]} {found.group(1)}"
    return html.escape(text)


# Íconos de barra lateral derecha (cerrada y abierta), como los de Lucide `panel-right` y `panel-right-close`.
_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{}</svg>'
_FAB_ICON = _SVG.format('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>')
_FAB_CLOSE_ICON = _SVG.format('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m8 9 3 3-3 3"/>')


def _toc(items: list) -> str:
    """Lista del índice con una clase por nivel (`lv1` a `lv4`)."""
    rows = []
    for item in items:
        level = item.get("level") if isinstance(item.get("level"), int) and 1 <= item["level"] <= 4 else 1
        rows.append(f'<li class="lv{level}"><a href="#{html.escape(str(item.get("id", "")), quote=True)}">{html.escape(str(item.get("text", "")))}</a></li>')
    return f'<ol>{"".join(rows)}</ol>'


def _head_card(title: str, meta: dict) -> str:
    desc = f'<p class="doc-desc">{html.escape(str(meta["descripcion"]))}</p>' if meta.get("descripcion") else ""
    facts = []
    if meta.get("creacion"):
        facts.append(f"<div><dt>Creado</dt><dd>{_date(meta['creacion'])}</dd></div>")
    if meta.get("actualizacion"):
        facts.append(f"<div><dt>Actualizado</dt><dd>{_date(meta['actualizacion'])}</dd></div>")
    if meta.get("estado"):
        color = meta.get("estado_color") if meta.get("estado_color") in _STATE_COLORS else "gris"
        facts.append(f'<div><dt>Estado</dt><dd><span class="estado estado--{color}">{html.escape(str(meta["estado"]))}</span></dd></div>')
    dl = f'<dl class="doc-meta">{"".join(facts)}</dl>' if facts else ""
    return f'<header class="doc-head"><h1 class="doc-title">{title}</h1>{desc}{dl}</header>'


def render_page(pub: Publication) -> str:
    """Documento HTML de la publicación."""
    title = html.escape(pub.title)
    meta = _load_json(pub.meta, dict)
    toc_items = [item for item in _load_json(pub.toc, list) if isinstance(item, dict)]
    toc = _toc(toc_items) if toc_items else ""
    pdf_css = pdf_style_css(_load_json(pub.style, dict))
    # Celular: botón arriba a la derecha que abre el índice como barra lateral desde la derecha. Sin scripts: la barra se muestra con `:target`
    # (`#indice`), así que cualquier enlace del índice (que cambia el `#`) la cierra solo, y «#cerrar» (que no existe) la cierra sin mover la página.
    fold = (
        '<div id="indice" class="toc-sheet"><a class="toc-backdrop" href="#cerrar" tabindex="-1" aria-hidden="true"></a>'
        f'<nav class="toc toc-panel" aria-label="Índice del documento"><p class="toc-title">Índice</p>{toc}</nav></div>'
        f'<a class="toc-fab toc-fab--open" href="#indice" aria-label="Abrir el índice" title="Índice">{_FAB_ICON}</a>'
        f'<a class="toc-fab toc-fab--close" href="#cerrar" aria-label="Cerrar el índice" title="Cerrar el índice">{_FAB_CLOSE_ICON}</a>'
    ) if toc else ""
    side = f'<aside class="toc-side toc"><nav aria-label="Índice"><p class="toc-title">Índice</p>{toc}</nav></aside>' if toc else ""
    description = html.escape(str(meta["descripcion"]), quote=True) if meta.get("descripcion") else ""
    share = (
        f'<meta name="description" content="{description}">\n<meta property="og:description" content="{description}">\n' if description else ""
    )
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>{title}</title>
{share}<meta property="og:title" content="{html.escape(pub.title, quote=True)}">
<meta property="og:type" content="article">
<meta property="og:locale" content="es_MX">
<style>{PAGE_CSS}{pdf_css}</style>
</head>
<body>
<a class="skip" href="#contenido">Saltar al contenido</a>
<div class="layout">
<main id="contenido" class="doc">
{_head_card(title, meta)}
{fold}
<article class="content">
{pub.html}
</article>
</main>
{side}
</div>
<footer class="site-foot">{_FOOT}</footer>
</body>
</html>
"""


def unavailable_page() -> str:
    """Página de no disponible: igual para un enlace inexistente, despublicado o de un documento borrado."""
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>No disponible</title>
<style>{UNAVAILABLE_CSS}</style>
</head>
<body>
<main>
<h1>Esta página no está disponible</h1>
<p>Es posible que se haya eliminado o que el enlace ya no sea válido.</p>
</main>
</body>
</html>
"""
