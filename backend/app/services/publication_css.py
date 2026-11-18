"""Hoja de estilos de la página pública de una publicación (H-035, fase 4).

Celular primero (una columna, índice en un panel que abre un botón flotante) y, desde 960 px, el contenido con el índice fijo a un lado. Claro u oscuro según el sistema
(`prefers-color-scheme`); los colores son los tokens del diseño de Synapse (`frontend/src/styles/tokens.css`), no valores nuevos. Sin scripts: el panel del índice
se abre con `:target`. Todo cabe en una sola hoja en línea porque la CSP no permite recursos externos.
"""

PAGE_CSS = """
:root {
  color-scheme: light dark;
  --bg: #ffffff; --bg-2: #f8fafc; --bg-3: #f1f5f9; --border: #e2e8f0;
  --text: #0f172a; --text-2: #475569; --muted: #64748b;
  --accent: #0891b2; --accent-text: #0e7490;
  --info: #0284c7; --info-text: #0369a1; --success: #16a34a; --success-text: #15803d;
  --warning-text: #b45309; --danger: #dc2626; --danger-text: #b91c1c;
  --font: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: "JetBrains Mono", "Fira Code", ui-monospace, "SFMono-Regular", Menlo, monospace;
  --syntax-keyword: var(--accent-text); --syntax-string: var(--success-text); --syntax-number: var(--warning-text);
  --syntax-type: var(--info-text); --syntax-function: var(--text); --syntax-plain: var(--text-2); --syntax-comment: var(--muted);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #12121a; --bg-2: #1a1a24; --bg-3: #22222e; --border: #2e2e3d;
    --text: #e8e8ef; --text-2: #b4b4c4; --muted: #9a9aab;
    --accent: #0891b2; --accent-text: #22d3ee;
    --info: #38bdf8; --info-text: #38bdf8; --success: #4ade80; --success-text: #4ade80;
    --warning-text: #fbbf24; --danger: #f87171; --danger-text: #f87171;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font); font-size: 1.0625rem; line-height: 1.7; overflow-wrap: break-word; }
a { color: var(--accent-text); text-underline-offset: 0.18em; }
a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 3px; }
.skip { position: absolute; left: -9999px; top: 0; padding: 0.6rem 1rem; background: var(--accent); color: #fff; z-index: 10; border-radius: 0 0 6px 0; }
.skip:focus { left: 0; }

/* Marco: una columna en el celular; con ancho, contenido e índice lateral */
.layout { display: block; max-width: 48rem; margin: 0 auto; padding: 1rem 1rem 0; }
.doc { min-width: 0; }
.toc-side { display: none; }

/* Tarjeta del documento: título, descripción y datos */
.doc-head { background: var(--bg-2); border: 1px solid var(--border); border-radius: 0.875rem; padding: 1.1rem 1.25rem; margin: 0 0 1rem; }
.doc-title { margin: 0; font-size: 1.6rem; line-height: 1.2; font-weight: 700; letter-spacing: -0.01em; }
.doc-desc { margin: 0.5rem 0 0; color: var(--text-2); font-size: 1rem; line-height: 1.55; }
.doc-meta { display: flex; flex-wrap: wrap; gap: 0.6rem 1.75rem; margin: 0.9rem 0 0; padding: 0.9rem 0 0; border-top: 1px solid var(--border); }
.doc-meta div { min-width: 0; }
.doc-meta dt { margin: 0; color: var(--muted); font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; line-height: 1.4; }
.doc-meta dd { margin: 0.1rem 0 0; font-size: 0.9375rem; line-height: 1.5; }
.estado { display: inline-flex; align-items: center; padding: 1px 10px; border-radius: 999px; font-size: 0.8125rem; font-weight: 600; background: var(--bg-3); color: var(--text-2); }
.estado--azul { color: var(--info-text); background: color-mix(in srgb, var(--info) 16%, transparent); }
.estado--verde { color: var(--success-text); background: color-mix(in srgb, var(--success) 16%, transparent); }
.estado--rojo { color: var(--danger-text); background: color-mix(in srgb, var(--danger) 14%, transparent); }

/* Índice: en el celular, un botón flotante abre un panel inferior (`:target`, sin scripts; el mismo botón pasa a «Cerrar»); con ancho, fijo a un lado */
.toc-sheet { display: none; position: fixed; inset: 0; z-index: 20; }
.toc-sheet:target { display: block; }
.toc-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.45); }
.toc-panel { position: absolute; left: 0; right: 0; bottom: 0; max-height: 72vh; overflow-y: auto; padding: 1rem 0.75rem calc(5rem + env(safe-area-inset-bottom, 0px)); background: var(--bg-2); border-top: 1px solid var(--border); border-radius: 1rem 1rem 0 0; box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.25); overscroll-behavior: contain; }
.toc-fab { position: fixed; right: 1rem; bottom: calc(1rem + env(safe-area-inset-bottom, 0px)); z-index: 30; display: inline-flex; align-items: center; gap: 0.5rem; min-height: 48px; padding: 0 1.1rem; border-radius: 999px; background: var(--accent); color: #fff; font-weight: 600; font-size: 0.9375rem; text-decoration: none; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3); -webkit-tap-highlight-color: transparent; }
.toc-fab:active { filter: brightness(0.92); }
.toc-fab--close { display: none; background: var(--bg-3); color: var(--text); box-shadow: 0 0 0 1px var(--border), 0 4px 14px rgba(0, 0, 0, 0.3); }
.toc-sheet:target ~ .toc-fab--open { display: none; }
.toc-sheet:target ~ .toc-fab--close { display: inline-flex; }
.toc-panel a { min-height: 44px; display: flex; align-items: center; }
body:has(.toc-fab) { padding-bottom: 4.5rem; }
.toc ol { list-style: none; margin: 0; padding: 0; }
.toc a { display: block; padding: 0.4rem 0.5rem; border-radius: 6px; color: var(--text-2); text-decoration: none; font-size: 0.9375rem; line-height: 1.4; }
.toc a:hover { color: var(--accent-text); background: var(--bg-3); }
.toc .lv2 a { padding-left: 1.25rem; } .toc .lv3 a { padding-left: 2rem; } .toc .lv4 a { padding-left: 2.75rem; }
.toc-title { margin: 0 0 0.5rem; padding: 0 0.5rem; color: var(--muted); font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }

/* Contenido */
.content > :first-child { margin-top: 0; }
.content h1, .content h2, .content h3, .content h4, .content h5, .content h6 { line-height: 1.25; margin: 1.9em 0 0.55em; font-weight: 700; scroll-margin-top: 1rem; }
.content h1 { font-size: 1.75rem; color: var(--accent-text); }
.content h2 { font-size: 1.4rem; }
.content h3 { font-size: 1.2rem; }
.content h4, .content h5, .content h6 { font-size: 1.05rem; }
.content p { margin: 0 0 1em; }
.content img { max-width: 100%; height: auto; border-radius: 6px; }
.md-img { display: inline-block; max-width: 100%; line-height: 0; }
.content hr { border: 0; border-top: 1px solid var(--border); margin: 2rem 0; }
.content ul, .content ol { margin: 0 0 1em; padding-left: 1.5rem; }
.content li { margin: 0.25em 0; }
.content li.note-task { list-style: none; margin-left: -1.5rem; }
.content blockquote { margin: 0 0 1em; padding: 0.6rem 1rem; border-left: 3px solid var(--accent); background: var(--bg-2); border-radius: 0 8px 8px 0; color: var(--text-2); }
.content blockquote > :last-child { margin-bottom: 0; }
.content code { font-family: var(--mono); font-size: 0.875em; background: var(--bg-3); padding: 0.12em 0.4em; border-radius: 5px; }
.content pre { margin: 0 0 1.1em; padding: 0.9rem 1rem; background: var(--bg-3); border: 1px solid var(--border); border-radius: 10px; overflow-x: auto; font-size: 0.875rem; line-height: 1.55; }
.content pre code { background: none; padding: 0; font-size: inherit; }
.code-block { margin: 0 0 1.1em; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--bg-3); }
.code-block pre { margin: 0; border: 0; border-radius: 0; }
.code-block-header { padding: 0.35rem 1rem; background: var(--bg-2); border-bottom: 1px solid var(--border); color: var(--muted); font-family: var(--mono); font-size: 0.75rem; }
.sx-keyword { color: var(--syntax-keyword); font-weight: 600; } .sx-string { color: var(--syntax-string); }
.sx-number, .sx-atom { color: var(--syntax-number); } .sx-type { color: var(--syntax-type); }
.sx-function { color: var(--syntax-function); font-weight: 600; } .sx-plain { color: var(--syntax-plain); }
.sx-comment { color: var(--syntax-comment); font-style: italic; }
.content table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; margin: 0 0 1.1em; font-size: 0.9375rem; line-height: 1.5; }
.content th, .content td { border: 1px solid var(--border); padding: 0.5rem 0.75rem; text-align: left; vertical-align: top; }
.content th { background: var(--bg-3); font-weight: 600; }
.content a.wikilink { color: inherit; text-decoration: none; }

/* Marcas de formato: alineación, columnas y cajas */
.content div[align="center"] { text-align: center; } .content div[align="right"] { text-align: right; } .content div[align="justify"] { text-align: justify; }
.content div.cols-2 { column-count: 2; column-gap: 2rem; } .content div.cols-3 { column-count: 3; column-gap: 2rem; } .content div.cols-4 { column-count: 4; column-gap: 2rem; }
.content div.cols-cells { column-count: auto; display: grid; gap: 1.5rem; align-items: start; }
.content div.cols-2.cols-cells { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.content div.cols-3.cols-cells { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.content div.cols-4.cols-cells { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.content div.cols-cells > div.col { min-width: 0; }
.content div.cols-cells > div.col > :first-child { margin-top: 0; } .content div.cols-cells > div.col > :last-child { margin-bottom: 0; }
@media (max-width: 640px) {
  .content div.cols-2, .content div.cols-3, .content div.cols-4 { column-count: 1; }
  .content div.cols-cells, .content div.cols-2.cols-cells, .content div.cols-3.cols-cells, .content div.cols-4.cols-cells { grid-template-columns: minmax(0, 1fr); }
}

/* Documentos incrustados (Plotly, Archify, videos): marco con el mismo borde que el resto */
.pub-embed-frame { margin: 1.25rem 0; }
.pub-embed-frame iframe { display: block; width: 100%; height: min(70vh, 30rem); border: 1px solid var(--border); border-radius: 10px; background: #fff; }
.pub-embed-frame--video iframe { height: auto; aspect-ratio: 16 / 9; }
.pub-embed-open { display: inline-block; margin-top: 0.4rem; font-size: 0.875rem; }

.site-foot { max-width: 48rem; margin: 3rem auto 0; padding: 1.25rem 1rem 2rem; border-top: 1px solid var(--border); text-align: center; color: var(--muted); font-size: 0.875rem; }

@media (min-width: 960px) {
  body { font-size: 1.125rem; }
  .layout { display: grid; grid-template-columns: minmax(0, 46rem) 15rem; gap: 3rem; max-width: 66rem; padding: 2.5rem 1.5rem 0; align-items: start; }
  .toc-sheet, .toc-fab { display: none !important; }
  body:has(.toc-fab) { padding-bottom: 0; }
  .toc-side { display: block; position: sticky; top: 1.5rem; max-height: calc(100vh - 3rem); overflow-y: auto; padding-top: 0.25rem; }
  .doc-title { font-size: 2rem; }
  .doc-head { padding: 1.4rem 1.6rem; }
  .site-foot { max-width: 66rem; }
}
@media print {
  .toc-sheet, .toc-fab, .toc-side, .skip { display: none !important; }
  .layout { display: block; max-width: none; padding: 0; }
  body { background: #fff; color: #000; font-size: 11pt; }
  a { color: #000; }
}
"""

UNAVAILABLE_CSS = """
:root { color-scheme: light dark; --bg: #ffffff; --text: #0f172a; --text-2: #475569; --border: #e2e8f0; --bg-2: #f8fafc; }
@media (prefers-color-scheme: dark) { :root { --bg: #12121a; --text: #e8e8ef; --text-2: #b4b4c4; --border: #2e2e3d; --bg-2: #1a1a24; } }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1.5rem; background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.6; }
main { max-width: 26rem; padding: 1.5rem; background: var(--bg-2); border: 1px solid var(--border); border-radius: 0.875rem; text-align: center; }
h1 { margin: 0 0 0.5rem; font-size: 1.25rem; }
p { margin: 0; color: var(--text-2); }
"""
