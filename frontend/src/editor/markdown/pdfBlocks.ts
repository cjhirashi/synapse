/**
 * Marcas de formato del documento (portada, índice, salto de página, alineación y columnas), guardadas como HTML dentro del Markdown:
 *
 *   <!-- pdf:portada --> … <!-- /pdf:portada -->     portada (hoja propia en el PDF)
 *   <!-- pdf:indice -->                               índice automático
 *   <!-- pdf:salto -->                                lo que sigue empieza en página nueva
 *   <div align="center"> … </div>                     alineación: left, center, right, justify
 *   <div class="cols-2"> … </div>                     columnas: 2, 3 o 4 (el texto fluye de una a otra)
 *   <div class="cols-2"> <div class="col"> … </div> <div class="col"> … </div> </div>
 *                                                      columnas con celdas: cada `col` es una columna y lo que lleva dentro se queda en ella
 *   <div class="comentario" data-autor="aira" data-fecha="2026-11-15"> … </div>
 *                                                      comentario de revisión: una ventana gris con la foto y el nombre de quien lo dejó;
 *                                                      se ve en Lectura, edición y Código, nunca en el PDF ni en una publicación
 *
 * Milkdown las lee como líneas de HTML sueltas, sin envolver lo que hay entre la apertura y el cierre. Este transformador
 * (fase «run» de remark: corre igual en frío y con el mdast cacheado) agrupa cada pareja en un contenedor `pdfBlock`, y los
 * comentarios de una sola línea quedan como `pdfMark`. Al guardar se vuelven a escribir exactamente como estaban, con una línea
 * en blanco alrededor (así el Markdown de dentro sigue interpretándose en cualquier visor). Una apertura sin su cierre se deja como HTML.
 */
import { $nodeSchema, $remark } from "@milkdown/utils";

export const PDF_ALIGNMENTS = ["left", "center", "right", "justify"] as const;
export const PDF_COLUMNS = ["2", "3", "4"] as const;
export type PdfBlockKind = "cover" | "align" | "cols" | "col" | "comment";
export type PdfMarkKind = "indice" | "salto";

const BLOCK_MDAST = "pdfBlock";
const MARK_MDAST = "pdfMark";

const OPEN_ALIGN = /^<div align="(left|center|right|justify)">$/;
const OPEN_COLS = /^<div class="cols-([234])">$/;
const OPEN_COL = /^<div class="col">$/;
const OPEN_COVER = /^<!--\s*pdf:portada\s*-->$/;
/** `data-autor`: el id del agente o `usuario` (la persona); `data-fecha`: día en que se dejó (AAAA-MM-DD). Ambos opcionales, en ese orden. */
const OPEN_COMMENT = /^<div class="comentario"(?: data-autor="([a-z0-9][a-z0-9_-]{0,31})")?(?: data-fecha="(\d{4}-\d{2}-\d{2})")?>$/;
const CLOSE_COVER = /^<!--\s*\/pdf:portada\s*-->$/;
const CLOSE_DIV = /^<\/div>$/;
const MARK = /^<!--\s*pdf:(indice|salto)\s*-->$/;

interface Opening { kind: PdfBlockKind; value: string; date?: string }

/** Lo que abre una línea de HTML, o `null` si no es una de nuestras aperturas. */
export function parseOpening(html: string): Opening | null {
  const text = html.trim();
  const align = OPEN_ALIGN.exec(text);
  if (align) return { kind: "align", value: align[1] };
  const cols = OPEN_COLS.exec(text);
  if (cols) return { kind: "cols", value: cols[1] };
  if (OPEN_COL.test(text)) return { kind: "col", value: "" };
  const comment = OPEN_COMMENT.exec(text);
  if (comment) return { kind: "comment", value: comment[1] ?? "", date: comment[2] ?? "" };
  return OPEN_COVER.test(text) ? { kind: "cover", value: "" } : null;
}

/** HTML de apertura y de cierre de un contenedor (`date` solo lo usa el comentario). */
export function blockTags(kind: PdfBlockKind, value: string, date = ""): [string, string] {
  if (kind === "cover") return ["<!-- pdf:portada -->", "<!-- /pdf:portada -->"];
  if (kind === "comment") return [`<div class="comentario"${value ? ` data-autor="${value}"` : ""}${date ? ` data-fecha="${date}"` : ""}>`, "</div>"];
  if (kind === "col") return ['<div class="col">', "</div>"];
  return [kind === "align" ? `<div align="${value}">` : `<div class="cols-${value}">`, "</div>"];
}

export const markTag = (kind: PdfMarkKind): string => `<!-- pdf:${kind} -->`;

type Mdast = { type: string; value?: string; children?: Mdast[]; [key: string]: unknown };

/** Valor HTML de un nodo de bloque: `html` suelto o un párrafo que solo lo contiene (Milkdown envuelve el HTML de bloque en un párrafo). */
function htmlOf(node: Mdast): string | null {
  if (node.type === "html" && typeof node.value === "string") return node.value;
  if (node.type === "paragraph" && node.children?.length === 1 && node.children[0].type === "html") return node.children[0].value ?? null;
  return null;
}

const closes = (opening: Opening, html: string): boolean => (opening.kind === "cover" ? CLOSE_COVER.test(html.trim()) : CLOSE_DIV.test(html.trim()));

/** Convierte un texto Markdown en bloques (el procesador de remark); sin él, el texto queda en un solo párrafo. */
export type MdastParser = (markdown: string) => Mdast[];

/**
 * Un bloque de HTML sin líneas en blanco llega de remark como UN solo nodo (`<div class="comentario" …>\nTexto\n</div>`): es lo que se guarda cuando el
 * contenedor está dentro de una viñeta de lista compacta. Si empieza con una de nuestras aperturas y termina con su cierre (con las aperturas y cierres de
 * en medio equilibrados), se parte en apertura, contenido y cierre para que `groupBlocks` lo agrupe igual que el que viene con líneas en blanco.
 */
function expandSingleBlock(node: Mdast, parse?: MdastParser): Mdast[] {
  const value = htmlOf(node);
  if (value === null || !value.includes("\n")) return [node];
  const lines = value.split("\n");
  const first = lines[0].trim();
  const last = lines[lines.length - 1].trim();
  const opening = parseOpening(first);
  if (!opening || !closes(opening, last)) return [node];
  const middle = lines.slice(1, -1);
  let balance = 0;
  for (const line of middle) {
    const trimmed = line.trim();
    if (parseOpening(trimmed) && opening.kind !== "cover") balance += 1;
    else if (CLOSE_DIV.test(trimmed)) balance -= 1;
    if (balance < 0) return [node];
  }
  if (balance !== 0) return [node];
  const text = middle.join("\n").trim();
  const inner: Mdast[] = !text ? [] : parse ? parse(text) : [{ type: "paragraph", children: [{ type: "text", value: text }] }];
  return [{ type: "html", value: first }, ...inner, { type: "html", value: last }];
}

/** Contenedores de bloques donde un comentario o una alineación también puede vivir (una viñeta, una cita). */
const BLOCK_CONTAINERS = new Set(["list", "listItem", "blockquote", "footnoteDefinition"]);

/** Agrupa las parejas apertura/cierre de `nodes` (recursivo: los contenedores se anidan y también se busca dentro de listas y citas). */
export function groupBlocks(source: Mdast[], parse?: MdastParser): Mdast[] {
  const nodes = source.flatMap((node) => expandSingleBlock(node, parse));
  const out: Mdast[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const html = htmlOf(nodes[i]);
    const mark = html === null ? null : MARK.exec(html.trim());
    if (mark) {
      out.push({ type: MARK_MDAST, kind: mark[1] });
      continue;
    }
    const opening = html === null ? null : parseOpening(html);
    if (!opening) {
      const node = nodes[i];
      out.push(BLOCK_CONTAINERS.has(node.type) && node.children ? { ...node, children: groupBlocks(node.children, parse) } : node);
      continue;
    }
    // Cierre que le corresponde: `</div>` cierra el contenedor `div` más reciente (contando los anidados); la portada, su comentario.
    let depth = 0;
    let end = -1;
    for (let j = i + 1; j < nodes.length && end < 0; j += 1) {
      const inner = htmlOf(nodes[j]);
      if (inner === null) continue;
      const nested = parseOpening(inner);
      if (nested && nested.kind !== "cover" && opening.kind !== "cover") depth += 1;
      else if (closes(opening, inner)) {
        if (depth === 0) end = j;
        else depth -= 1;
      }
    }
    if (end < 0) {
      out.push(nodes[i]);
      continue;
    }
    const inner = groupBlocks(nodes.slice(i + 1, end), parse);
    out.push({ type: BLOCK_MDAST, kind: opening.kind, value: opening.value, date: opening.date ?? "", children: inner.length ? inner : [{ type: "paragraph", children: [] }] });
    i = end;
  }
  return out;
}

export const pdfBlocksRemark = $remark("synapsePdfBlocks", () => function (this: { parse: (markdown: string) => unknown }) {
  const parse: MdastParser = (markdown) => (this.parse(markdown) as Mdast).children ?? [];
  return (tree: unknown) => {
    const root = tree as Mdast;
    if (Array.isArray(root.children)) root.children = groupBlocks(root.children, parse);
  };
});

const kindOf = (value: unknown): PdfBlockKind => (value === "align" || value === "cols" || value === "col" || value === "comment" ? value : "cover");

/** Contenedor: portada, alineación, columnas (de flujo o con celdas `col`) o comentario. Su contenido es Markdown normal. */
export const pdfBlockSchema = $nodeSchema("pdf_block", () => ({
  group: "block",
  content: "block+",
  defining: true,
  attrs: { kind: { default: "cover" }, value: { default: "" }, date: { default: "" } },
  toDOM: (node) => {
    const kind = kindOf(node.attrs.kind);
    const value = String(node.attrs.value ?? "");
    // El comentario lo dibuja su vista (`commentView.ts`); esta es la forma sin vista (copiar y pegar, pruebas).
    if (kind === "comment") return ["div", { class: "comentario", "data-autor": value, "data-fecha": String(node.attrs.date ?? "") }, 0];
    if (kind === "cover") return ["section", { class: "pdf-portada", "data-pdf-label": "Portada" }, 0];
    if (kind === "align") return ["div", { align: value, "data-pdf-label": `Alineación: ${value}` }, 0];
    if (kind === "col") return ["div", { class: "col", "data-pdf-label": "Columna" }, 0];
    // Con celdas (`col`) cada hija es una columna y se reparten en rejilla (`cols-cells`); sin ellas el texto fluye de columna en columna.
    const cells = node.firstChild?.attrs.kind === "col";
    return ["div", { class: `cols-${value}${cells ? " cols-cells" : ""}`, "data-pdf-label": `${value} columnas` }, 0];
  },
  parseMarkdown: {
    match: (node) => node.type === BLOCK_MDAST,
    runner: (state, node, type) => {
      const block = node as unknown as Mdast;
      state.openNode(type, { kind: kindOf(block.kind), value: String(block.value ?? ""), date: String(block.date ?? "") }).next(block.children).closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "pdf_block",
    runner: (state, node) => {
      const [open, close] = blockTags(kindOf(node.attrs.kind), String(node.attrs.value ?? ""), String(node.attrs.date ?? ""));
      state.addNode("html", undefined, open);
      state.next(node.content);
      state.addNode("html", undefined, close);
    },
  },
}));

/** Marca de una sola línea: índice o salto de página. */
export const pdfMarkSchema = $nodeSchema("pdf_mark", () => ({
  group: "block",
  atom: true,
  selectable: true,
  attrs: { kind: { default: "salto" } },
  toDOM: (node) => {
    const kind = node.attrs.kind === "indice" ? "indice" : "salto";
    const label = kind === "indice" ? "Índice del PDF" : "Salto de página";
    const hint = kind === "indice" ? "aquí se arma el índice con los encabezados" : "lo que sigue empieza en hoja nueva";
    return ["div", { class: "pdf-mark", "data-pdf-mark": kind, "data-pdf-label": label, "data-pdf-hint": hint, role: "separator", "aria-label": `${label}: ${hint}` }];
  },
  parseMarkdown: {
    match: (node) => node.type === MARK_MDAST,
    runner: (state, node, type) => {
      state.addNode(type, { kind: (node as unknown as Mdast).kind === "indice" ? "indice" : "salto" });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "pdf_mark",
    runner: (state, node) => {
      state.addNode("html", undefined, markTag(node.attrs.kind === "indice" ? "indice" : "salto"));
    },
  },
}));
