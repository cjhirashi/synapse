"""Renderización de la página pública de publicaciones (H-035).

Convierte una instantánea de publicación en HTML seguro para servir sin sesión.
"""

import html
import json

from app.core.models.publication import Publication

PAGE_CSS = """
* {
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
  color: #333;
  margin: 0;
  padding: 1rem;
  max-width: 46rem;
  margin-left: auto;
  margin-right: auto;
}

a.skip {
  position: absolute;
  left: -9999px;
}

a.skip:focus {
  left: auto;
  position: static;
}

nav {
  margin: 1.5rem 0;
}

nav ol {
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}

nav ol li {
  margin: 0.25rem 0;
}

nav a {
  color: #0066cc;
  text-decoration: none;
}

nav a:hover {
  text-decoration: underline;
}

aside {
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 0.25rem;
  padding: 1rem;
  margin: 1rem 0 1.5rem 0;
  font-size: 0.9rem;
}

aside h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
}

aside p {
  margin: 0.25rem 0;
}

main {
  margin-top: 1rem;
}

main h1,
main h2,
main h3,
main h4,
main h5,
main h6 {
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}

main h1 {
  font-size: 2rem;
}

main h2 {
  font-size: 1.5rem;
}

main h3 {
  font-size: 1.25rem;
}

main h4 {
  font-size: 1.1rem;
}

main p {
  margin: 0.5rem 0;
}

main img {
  max-width: 100%;
  height: auto;
}

main blockquote {
  border-left: 0.25rem solid #ccc;
  margin: 1rem 0;
  padding-left: 1rem;
  color: #666;
}

main code {
  background-color: #f0f0f0;
  padding: 0.125rem 0.25rem;
  border-radius: 0.125rem;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
}

main pre {
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 0.25rem;
  padding: 1rem;
  overflow-x: auto;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 0.9rem;
}

main pre code {
  background-color: transparent;
  padding: 0;
  border-radius: 0;
}

main table {
  border-collapse: collapse;
  width: 100%;
  margin: 1rem 0;
}

main table th,
main table td {
  border: 1px solid #ddd;
  padding: 0.5rem;
  text-align: left;
}

main table th {
  background-color: #f9f9f9;
  font-weight: bold;
}

main ul,
main ol {
  margin: 0.5rem 0;
  padding-left: 2rem;
}

main li {
  margin: 0.25rem 0;
}
"""


def _load_json(raw: str, kind: type) -> dict | list:
    """JSON guardado de la instantánea; si está corrupto o no es del tipo esperado, vacío (la página no se rompe)."""
    try:
        value = json.loads(raw) if raw else kind()
    except ValueError:
        return kind()
    return value if isinstance(value, kind) else kind()


def unavailable_page() -> str:
    """HTML mínimo de página no disponible."""
    return """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>No disponible</title>
<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  max-width: 46rem;
  margin: 2rem auto;
  padding: 1rem;
  color: #333;
}
h1 {
  font-size: 1.5rem;
}
</style>
</head>
<body>
<h1>Esta página no está disponible</h1>
<p>Es posible que haya sido eliminada o no tengas acceso.</p>
</body>
</html>
"""


def render_page(pub: Publication) -> str:
    """Renderiza la página HTML pública de una publicación."""
    # Escapar el título
    title_escaped = html.escape(pub.title)

    # Parsear meta y toc con manejo seguro
    meta_dict = _load_json(pub.meta, dict)
    toc_list = [item for item in _load_json(pub.toc, list) if isinstance(item, dict)]

    # Construir el índice
    toc_html = ""
    if toc_list:
        toc_items = []
        for item in toc_list:
            item_id = html.escape(str(item.get("id", "")))
            item_text = html.escape(str(item.get("text", "")))
            toc_items.append(f'<li><a href="#{item_id}">{item_text}</a></li>')
        toc_html = f"<nav aria-label=\"Índice\"><ol>{''.join(toc_items)}</ol></nav>"

    # Construir la tarjeta de metadatos
    aside_html = ""
    if meta_dict:
        aside_items = []

        if "descripcion" in meta_dict:
            desc = html.escape(str(meta_dict["descripcion"]))
            aside_items.append(f"<p>{desc}</p>")

        if "creacion" in meta_dict:
            creacion = html.escape(str(meta_dict["creacion"]))
            aside_items.append(f"<p><strong>Creado:</strong> {creacion}</p>")

        if "actualizacion" in meta_dict:
            actualizacion = html.escape(str(meta_dict["actualizacion"]))
            aside_items.append(f"<p><strong>Actualizado:</strong> {actualizacion}</p>")

        if "estado" in meta_dict:
            estado = html.escape(str(meta_dict["estado"]))
            aside_items.append(f"<p><strong>Estado:</strong> {estado}</p>")

        if aside_items:
            aside_html = f"<aside>{''.join(aside_items)}</aside>"

    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>{title_escaped}</title>
<style>
{PAGE_CSS}
</style>
</head>
<body>
<a class="skip" href="#contenido">Saltar al contenido</a>
{toc_html}
{aside_html}
<main id="contenido">
{pub.html}
</main>
</body>
</html>
"""
