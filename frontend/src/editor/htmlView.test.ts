// H-019 paso 4: vista del nodo html — iframe saneado en Visual y Lectura.
import { describe, expect, it } from "vitest";
import type { Node as PMNode } from "@milkdown/prose/model";
import { Schema, Node } from "@milkdown/prose/model";
import { htmlViewFactory } from "./htmlView";

describe("htmlView", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "block*" },
      text: { group: "inline" },
      paragraph: { content: "inline*", group: "block", toDOM: () => ["p", 0] },
      html: {
        atom: true,
        inline: true,
        attrs: { value: {} },
        parseDOM: [{ tag: "html", getAttrs: (dom) => ({ value: (dom as HTMLElement).getAttribute("data-value") || "" }) }],
        toDOM: (node) => ["html", { "data-value": node.attrs.value }, 0],
      },
    },
    marks: {},
  });

  function createHtmlNode(value: string): PMNode {
    return schema.nodes.html.create({ value });
  }

  // 4a: iframe permitido → existe en el DOM con sandbox exacto.
  it("4a: iframe permitido de synapse.cjhirashi.com se renderiza en div.md-embed", () => {
    const markdown = '<iframe src="https://synapse.cjhirashi.com/files/123e4567-e89b-42d3-a456-426614174000"></iframe>';
    const node = createHtmlNode(markdown);
    const factory = htmlViewFactory();
    const view = factory(node, { editable: true } as never, (() => 0) as never, [], {} as never);

    if (!view.dom) throw new Error("No dom");
    expect(view.dom.className).toContain("md-embed");
    expect(view.dom.getAttribute("data-type")).toBe("html");
    expect(view.dom.getAttribute("data-value")).toBe(markdown);
    expect(view.dom.getAttribute("contenteditable")).toBe("false");

    const iframe = view.dom.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe!.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(iframe!.getAttribute("loading")).toBe("lazy");
  });

  // 4b: iframe bloqueado (src externo) → NO hay iframe en DOM, texto visible.
  it("4b: iframe con src externo no se renderiza, nodo queda como texto", () => {
    const markdown = '<iframe src="https://evil.example/x"></iframe>';
    const node = createHtmlNode(markdown);
    const factory = htmlViewFactory();
    const view = factory(node, { editable: true } as never, (() => 0) as never, [], {} as never);

    if (!view.dom) throw new Error("No dom");
    // Sin iframe permitido, la vista debe renderizar como plainItem (texto).
    expect(view.dom.querySelector("iframe")).toBeNull();
  });

  // 4b: http (no https) → sin iframe.
  it("4b: iframe con http (no https) no se renderiza", () => {
    const markdown = '<iframe src="http://synapse.cjhirashi.com/files/123e4567-e89b-42d3-a456-426614174000"></iframe>';
    const node = createHtmlNode(markdown);
    const factory = htmlViewFactory();
    const view = factory(node, { editable: true } as never, (() => 0) as never, [], {} as never);

    if (!view.dom) throw new Error("No dom");
    expect(view.dom.querySelector("iframe")).toBeNull();
  });

  // 4b: javascript: → sin iframe.
  it("4b: iframe con javascript: no se renderiza", () => {
    const markdown = '<iframe src="javascript:alert(1)"></iframe>';
    const node = createHtmlNode(markdown);
    const factory = htmlViewFactory();
    const view = factory(node, { editable: true } as never, (() => 0) as never, [], {} as never);

    if (!view.dom) throw new Error("No dom");
    expect(view.dom.querySelector("iframe")).toBeNull();
  });

  // 4e: HTML con <script> no crea script en DOM.
  it("4e: HTML con <script> tag no ejecuta script, nodo sin script en DOM", () => {
    const markdown = '<iframe src="https://synapse.cjhirashi.com/files/123e4567-e89b-42d3-a456-426614174000"></iframe><script>alert(1)</script>';
    const node = createHtmlNode(markdown);
    const factory = htmlViewFactory();
    const view = factory(node, { editable: true } as never, (() => 0) as never, [], {} as never);

    if (!view.dom) throw new Error("No dom");
    expect(view.dom.querySelector("script")).toBeNull();
    // El iframe sigue ahí.
    expect(view.dom.querySelector("iframe")).not.toBeNull();
  });

  // update() devuelve true sólo si type y value son iguales.
  it("update() devuelve true si type y value son iguales, false si cambian", () => {
    const markdown = '<iframe src="https://synapse.cjhirashi.com/files/123e4567-e89b-42d3-a456-426614174000"></iframe>';
    const node = createHtmlNode(markdown);
    const factory = htmlViewFactory();
    const view = factory(node, { editable: true } as never, (() => 0) as never, [], {} as never);

    const nextNode = createHtmlNode(markdown);
    expect(view.update?.(nextNode, [], {} as never)).toBe(true);

    const diffNode = createHtmlNode("otro html");
    expect(view.update?.(diffNode, [], {} as never)).toBe(false);
  });

  // ignoreMutation() devuelve true para ignorar cambios en el DOM (el iframe es estático).
  it("ignoreMutation() devuelve true (ignora mutaciones del iframe)", () => {
    const markdown = '<iframe src="https://synapse.cjhirashi.com/files/123e4567-e89b-42d3-a456-426614174000"></iframe>';
    const node = createHtmlNode(markdown);
    const factory = htmlViewFactory();
    const view = factory(node, { editable: true } as never, (() => 0) as never, [], {} as never);

    if (!view.dom) throw new Error("No dom");
    const iframe = view.dom.querySelector("iframe");
    if (!iframe) throw new Error("No iframe");
    expect(view.ignoreMutation?.({ target: iframe, type: "childList" } as any)).toBe(true);
  });

  // stopEvent() devuelve true si el evento viene del contenedor (detiene propagación).
  it("stopEvent() devuelve true si el evento está dentro del contenedor", () => {
    const markdown = '<iframe src="https://synapse.cjhirashi.com/files/123e4567-e89b-42d3-a456-426614174000"></iframe>';
    const node = createHtmlNode(markdown);
    const factory = htmlViewFactory();
    const view = factory(node, { editable: true } as never, (() => 0) as never, [], {} as never);

    if (!view.dom) throw new Error("No dom");
    const iframe = view.dom.querySelector("iframe");
    if (!iframe) throw new Error("No iframe");
    expect(view.stopEvent?.({ target: iframe } as any)).toBe(true);
  });

  // H-025 PASO 3: YouTube embeds
  it("H-025: iframe de YouTube se renderiza en div.md-embed-video con md-embed-frame", () => {
    const markdown = '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>';
    const node = createHtmlNode(markdown);
    const factory = htmlViewFactory();
    const view = factory(node, { editable: true } as never, (() => 0) as never, [], {} as never);

    if (!view.dom) throw new Error("No dom");
    expect(view.dom.className).toContain("md-embed-video");
    expect(view.dom.getAttribute("data-type")).toBe("html");

    const frame = view.dom.querySelector(".md-embed-frame");
    expect(frame).not.toBeNull();

    const iframe = frame?.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(iframe!.getAttribute("sandbox")).toContain("allow-scripts");
    expect(iframe!.getAttribute("sandbox")).toContain("allow-same-origin");
    expect(iframe!.getAttribute("sandbox")).toContain("allow-presentation");
  });

  it("H-025: iframe de YouTube incluye enlace 'Abrir en YouTube' con href correcto", () => {
    const markdown = '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>';
    const node = createHtmlNode(markdown);
    const factory = htmlViewFactory();
    const view = factory(node, { editable: true } as never, (() => 0) as never, [], {} as never);

    if (!view.dom) throw new Error("No dom");
    const link = view.dom.querySelector(".md-embed-link");
    expect(link).not.toBeNull();
    expect(link!.textContent).toBe("Abrir en YouTube");
    expect(link!.getAttribute("href")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(link!.getAttribute("target")).toBe("_blank");
    expect(link!.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("H-025: iframe de YouTube con start= tiene enlace con &t=", () => {
    const markdown = '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90"></iframe>';
    const node = createHtmlNode(markdown);
    const factory = htmlViewFactory();
    const view = factory(node, { editable: true } as never, (() => 0) as never, [], {} as never);

    if (!view.dom) throw new Error("No dom");
    const link = view.dom.querySelector(".md-embed-link");
    expect(link!.getAttribute("href")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90");
  });

  it("H-025: iframe de Synapse no tiene enlace (no es YouTube)", () => {
    const markdown = '<iframe src="https://synapse.cjhirashi.com/files/123e4567-e89b-42d3-a456-426614174000"></iframe>';
    const node = createHtmlNode(markdown);
    const factory = htmlViewFactory();
    const view = factory(node, { editable: true } as never, (() => 0) as never, [], {} as never);

    if (!view.dom) throw new Error("No dom");
    const link = view.dom.querySelector(".md-embed-link");
    expect(link).toBeNull();
  });

  it("H-025: markdown emitido del editor sin editar es idéntico al original (YouTube)", () => {
    const markdown = '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90"></iframe>';
    const node = createHtmlNode(markdown);
    const factory = htmlViewFactory();
    const view = factory(node, { editable: true } as never, (() => 0) as never, [], {} as never);

    if (!view.dom) throw new Error("No dom");
    // El atributo data-value debe coincidir con el markdown original
    expect(view.dom.getAttribute("data-value")).toBe(markdown);
  });
});
