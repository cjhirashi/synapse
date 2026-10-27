// SPEC-0010 RNF-001, RNF-003 (PLAN-0010 §10.3): equivalencia de la etapa de parseo cacheada.
//
// Se cachea el mdast de `unified().use(remarkParse).use(remarkGfm)` (micromark + from-markdown + GFM)
// con `position`, como cadena JSON. En el hilo principal se re-hidrata: `remark.runSync(tree, text)`
// (los transformadores reales del editor) + mdast→ProseMirror con el esquema real. El documento así
// obtenido DEBE ser `eq` al que da `parserCtx(text)` del editor (parseo caliente de hoy). Además, las
// extensiones de **parseo** del procesador del editor y las de `parseStage` deben coincidir en número
// (si una futura versión de Milkdown añade una extensión de parseo, esta prueba lo detecta).
import { PRUEBA } from "./looseTables.fixture";
import { Editor, defaultValueCtx, parserCtx, remarkCtx, rootCtx, schemaCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import type { Ctx } from "@milkdown/ctx";
import type { Node as PMNode } from "@milkdown/prose/model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_NOTES, HEADING_CASES } from "../../../e2e/content-notes";
import { createParseProcessor, parseMarkdownToJson } from "./parseStage";
import { docFromMdastJson } from "./cachedParser";

let ctx: Ctx;
let editor: Editor;

beforeAll(async () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  editor = Editor.make()
    .config((c) => {
      c.set(rootCtx, root);
      c.set(defaultValueCtx, "");
    })
    .use(commonmark)
    .use(gfm);
  await editor.create();
  ctx = editor.ctx;
});

afterAll(async () => {
  await editor.destroy();
});

// Cuerpos markdown reales del corpus (PLAN-0010 §5.2) + los casos de encabezados con duplicados/vacíos.
const CORPUS: Array<{ key: string; md: string }> = [
  ...CONTENT_NOTES.map((n) => ({ key: n.key, md: n.content })),
  ...HEADING_CASES.map((c) => ({ key: `heading:${c.key}`, md: c.md })),
];

describe("parseStage · equivalencia con el parser del editor (RNF-001)", () => {
  it.each(CORPUS)("el documento desde la caché es eq al de parserCtx para $key", ({ md }) => {
    const cold: PMNode = ctx.get(parserCtx)(md);
    const json = parseMarkdownToJson(md);
    const cached = docFromMdastJson(ctx.get(remarkCtx), ctx.get(schemaCtx), json, md);
    expect(cached.eq(cold)).toBe(true);
  });

  it("el JSON cacheado conserva `position` (offsets que lee remarkMarker)", () => {
    const tree = JSON.parse(parseMarkdownToJson("# Título\n\ntexto")) as { children: Array<{ position?: unknown }> };
    expect(tree.children[0].position).toBeDefined();
  });

  it("las extensiones de parseo coinciden en número con las del procesador del editor (RNF-003)", () => {
    const stage = createParseProcessor();
    const editorMicromark = ctx.get(remarkCtx).data("micromarkExtensions") ?? [];
    const editorFromMarkdown = ctx.get(remarkCtx).data("fromMarkdownExtensions") ?? [];
    expect(stage.data("micromarkExtensions")?.length).toBe((editorMicromark as unknown[]).length);
    expect(stage.data("fromMarkdownExtensions")?.length).toBe((editorFromMarkdown as unknown[]).length);
  });
});

// RF-066 (enmienda 3): el Worker de la caché normaliza ANTES de parsear, igual que el hilo principal.
describe("parseMarkdownToJson · tablas con líneas en blanco (RF-066)", () => {
  type Node = { type: string; children?: Node[] };
  const tableOf = (md: string): Node | undefined => (JSON.parse(parseMarkdownToJson(md)) as Node).children?.find((node) => node.type === "table");

  it("«Prueba»: las filas separadas por líneas en blanco forman UNA tabla de 3 columnas con cabecera y 1 fila de datos", () => {
    const table = tableOf(PRUEBA);
    expect(table, "hay una tabla en el mdast").toBeDefined();
    expect(table!.children).toHaveLength(2);
    for (const row of table!.children!) expect(row.children).toHaveLength(3);
  });

  it("una tabla compacta da el mismo mdast de tabla que la suelta", () => {
    const compact = "|Campo 1|Campo 2|Campo 3|\n|---|---|---|\n|12|Hola|56|\n";
    const strip = (node: unknown): unknown => JSON.parse(JSON.stringify(node, (key, value) => (key === "position" ? undefined : value)));
    expect(strip(tableOf("|Campo 1|Campo 2|Campo 3|\n\n|---|---|---|\n\n|12|Hola|56|\n"))).toEqual(strip(tableOf(compact)));
  });
});
