// RF-046, RF-049, RF-050, RF-051, RF-053, RNF-003 (SPEC-0010; PLAN-0010 §2.3-f, P-10): el renderizador de
// Mermaid con el módulo `mermaid` simulado. Lo que hace la biblioteca real (SVG, directivas) se verifica en
// Chromium (V-7, V-8); aquí se fija lo que la aplicación le pide y lo que acepta de vuelta.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MermaidLoadError, MermaidSyntaxError } from "../codeBlockView";
import { createMermaidRenderer, mermaidConfig, sanitizeSource, verifySvg } from "./renderMermaid";

// `vi.mock` se iza sobre los imports: el contador y la API simulada se crean con `vi.hoisted`.
const mocked = vi.hoisted(() => ({
  loads: 0,
  api: { initialize: vi.fn(), render: vi.fn() },
}));
vi.mock("mermaid", () => {
  mocked.loads += 1;
  return { default: mocked.api };
});

const SAFE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100" width="100%"><g class="node"><rect width="10" height="10"/></g></svg>';
const tokens: Record<string, string> = {
  "--bg-primary": "#12121a", "--bg-secondary": "#1a1a24", "--bg-tertiary": "#22222e", "--text-primary": "#e8e8ef", "--text-secondary": "#9a9aab",
  "--accent": "#0891b2", "--accent-hover": "#06b6d4", "--accent-soft": "rgba(8, 145, 178, 0.18)", "--success-text": "#4ade80",
  "--warning-text": "#fbbf24", "--info-text": "#38bdf8", "--danger-text": "#f87171", "--font-ui": "system-ui",
};
const read = (property: string) => tokens[property] ?? "";
const renderer = (extra: Parameters<typeof createMermaidRenderer>[0] = {}) => createMermaidRenderer({ read, isDark: () => true, yieldToMain: async () => {}, ...extra });
/** El texto que recibió `mermaid.render` en la llamada n. */
const sourceOf = (n = 0) => mocked.api.render.mock.calls[n][1] as string;

beforeEach(() => {
  mocked.api.initialize.mockReset();
  mocked.api.render.mockReset().mockResolvedValue({ svg: SAFE_SVG });
  document.body.replaceChildren();
  delete document.documentElement.dataset.theme;
});
afterEach(() => vi.restoreAllMocks());

describe("renderMermaid · carga diferida (RNF-002)", () => {
  it("no importa `mermaid` hasta el primer dibujo y lo importa una sola vez", async () => {
    const before = mocked.loads;
    const r = renderer();
    expect(mocked.loads).toBe(before);
    await r.render("flowchart TD\n A --> B");
    await r.render("flowchart TD\n A --> C");
    expect(mocked.loads).toBe(before + 1);
  });
});

describe("renderMermaid · configuración (RF-051, P-10)", () => {
  it("pide strict, sin HTML en las etiquetas, tema base con las variables de los tokens y sin dibujar el error", async () => {
    await renderer().render("flowchart TD\n A --> B");
    const config = mocked.api.initialize.mock.calls[0][0];
    expect(config).toMatchObject({ startOnLoad: false, securityLevel: "strict", htmlLabels: false, theme: "base", suppressErrorRendering: true });
    expect(config.flowchart).toMatchObject({ htmlLabels: false });
    expect(config.themeVariables).toMatchObject({ darkMode: true, background: "#1a1a24", primaryColor: "#172f3e", textColor: "#e8e8ef" });
  });

  it("`secure` ampliado: la fuente no puede cambiar seguridad, tema, estilos, fuentes ni aspecto", () => {
    const { secure } = mermaidConfig(read, true);
    for (const key of ["secure", "securityLevel", "startOnLoad", "maxTextSize", "suppressErrorRendering", "theme", "themeVariables", "themeCSS", "darkMode", "fontFamily", "htmlLabels", "flowchart", "look"]) {
      expect(secure, key).toContain(key);
    }
  });
});

describe("renderMermaid · contenedor de medida (RF-046)", () => {
  // Causa raíz hallada en Chromium (V-7): Mermaid mide el diagrama con `getBBox()` en un nodo temporal de <body>, y
  // la regla global de `prefers-reduced-motion` (`* { transition-duration: .01ms !important }`) deja las posiciones a
  // medio transitar al medir → viewBox desplazado y diagrama recortado. Se mide en un contenedor propio sin transiciones.
  it("dibuja en un contenedor propio y oculto dentro del documento, que se retira al terminar", async () => {
    let host: HTMLElement | null = null;
    mocked.api.render.mockImplementation(async (_id: string, _text: string, container?: HTMLElement) => {
      host = container ?? null;
      expect(container?.isConnected).toBe(true);
      expect(container?.classList.contains("mermaid-measure")).toBe(true);
      return { svg: SAFE_SVG };
    });
    await renderer().render("flowchart TD\n A --> B");
    expect(host).not.toBeNull();
    expect((host as unknown as HTMLElement).isConnected).toBe(false);
  });

  it("la hoja de estilos del editor anula transiciones y animaciones dentro de ese contenedor", async () => {
    const css = readFileSync(resolve(__dirname, "../editor.css"), "utf8");
    expect(css).toMatch(/\.mermaid-measure \*[^{]*\{[^}]*transition:\s*none\s*!important/);
  });
});

describe("renderMermaid · fuentes hostiles (RF-051, RNF-003)", () => {
  const hostile = [
    '%%{init: {"securityLevel":"loose","theme":"dark"}}%%',
    "flowchart TD",
    "  A --> B",
    "  click A call alert(1)",
    '  click B href "javascript:alert(1)"',
    "  %% un comentario normal",
  ].join("\n");

  it("quita las directivas %%{…}%% y las líneas `click`, conserva el resto y no mueve las líneas", () => {
    const clean = sanitizeSource(hostile);
    expect(clean).not.toMatch(/%%\{/);
    expect(clean).not.toMatch(/click/);
    expect(clean).toContain("flowchart TD");
    expect(clean).toContain("A --> B");
    expect(clean).toContain("%% un comentario normal");
    // Mismas líneas que la fuente: los errores de Mermaid siguen apuntando a la línea del bloque.
    expect(clean.split("\n")).toHaveLength(hostile.split("\n").length);
  });

  it("quita directivas de varias líneas y la clave `config:` del frontmatter (tema) sin tocar el título", () => {
    const source = '---\ntitle: Plan\nconfig:\n  theme: dark\n  themeVariables:\n    primaryColor: "#f00"\n---\n%%{\n  init: {"theme": "forest"}\n}%%\nflowchart TD\n A --> B';
    const clean = sanitizeSource(source);
    expect(clean).toContain("title: Plan");
    expect(clean).not.toMatch(/config|theme|forest|primaryColor|%%\{/);
    expect(clean).toContain("flowchart TD");
    expect(clean.split("\n")).toHaveLength(source.split("\n").length);
  });

  // M-4 (Converge 1, RF-051): se ignoran por SENTENCIA, no por línea, y en cualquier tipo de diagrama.
  it.each([
    ["en la misma línea tras `;`", 'flowchart TD\n  A --> B; click A href "javascript:alert(1)"\n  B --> C', ["A --> B", "B --> C"]],
    ["entre otras sentencias de la misma línea", "flowchart TD\n  A --> B;click A call f();B --> C", ["A --> B", "B --> C"]],
    ["en classDiagram", 'classDiagram\n  class A\n  click A href "javascript:alert(1)"\n  class B', ["class A", "class B"]],
    ["`callback` con tooltip", 'flowchart TD\n  A --> B\n  callback A "tip"', ["A --> B"]],
    ["`link` de sequenceDiagram", "sequenceDiagram\n  A->>B: hola\n  link A: Panel @ https://example.com", ["A->>B: hola"]],
    ["`click` con sangría y mayúsculas", "flowchart TD\n  A --> B\n    CLICK A call f()", ["A --> B"]],
  ])("quita click/link/callback %s y conserva el resto", (_name, source, kept) => {
    const clean = sanitizeSource(source);
    expect(clean).not.toMatch(/click|callback|\blink\b|javascript|example\.com/i);
    for (const statement of kept) expect(clean).toContain(statement);
    expect(clean.split("\n")).toHaveLength(source.split("\n").length);
  });

  it("una comilla desbalanceada no esconde un `click` posterior de la misma línea (Converge 2, L-D)", () => {
    const source = 'flowchart TD\n  A["sin cerrar --> B; click A call f(); C --> D\n  E --> F';
    const clean = sanitizeSource(source);
    expect(clean).not.toMatch(/click|call f/);
    expect(clean).toContain("C --> D");
    expect(clean).toContain("E --> F");
  });

  it("no toca sentencias que sólo contienen la palabra (un nodo llamado click, texto de etiqueta)", () => {
    const source = 'flowchart TD\n  click --> B\n  A["haz click aquí"] --> B';
    expect(sanitizeSource(source)).toBe(source);
  });

  it("al dibujar entrega a Mermaid la fuente ya limpia", async () => {
    await renderer().render(hostile);
    expect(sourceOf()).not.toMatch(/%%\{|click/);
    expect(sourceOf()).toContain("A --> B");
  });
});

describe("renderMermaid · verificación del SVG (RNF-003, Art. 5)", () => {
  const wrap = (inner: string, attrs = "") => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"${attrs}>${inner}</svg>`;

  // Converge 3, mutantes: sin el lookbehind `(?<![\w-])` una PROPIEDAD cuyo nombre acaba en `image`/`src`/`element`
  // seguida de `(` no es una función de carga y no debe rechazarse; con él sí se distingue de `image(`.
  it("no confunde una propiedad con una función: `background-image(`, `x-src(` y `my-element(` no son `image(`/`src(`/`element(`", () => {
    for (const css of ["background-image(x)", "x-src(y)", "my-element(z)", "mask-image(a)"]) {
      expect(() => verifySvg(wrap(`<g style="${css}"/>`)), css).not.toThrow();
    }
    for (const css of ["image(x)", "src(y)", "element(z)", " image(x)", ";src(y)", "(image(x))"]) {
      expect(() => verifySvg(wrap(`<g style="${css}"/>`)), css).toThrow(MermaidSyntaxError);
    }
  });

  it("acepta todos los elementos que Mermaid emite y url(#id) locales en cualquier atributo", () => {
    const svg = verifySvg(
      wrap(
        '<defs><marker id="m"><path d="M0 0"/></marker><linearGradient id="g"><stop offset="0"/></linearGradient><clipPath id="c"><rect/></clipPath><filter id="f"><feDropShadow/></filter></defs>' +
          '<style>.a{fill:red}</style><g clip-path="url(#c)" filter="url(#f)"><path marker-end="url(#m)" stroke="url(#g)"/><circle/><ellipse/><line/><polygon/><polyline/><symbol id="s"><rect/></symbol><use href="#s"/><text><tspan>x</tspan></text><title>t</title><desc>d</desc></g>',
      ),
    );
    expect(svg.querySelectorAll("*").length).toBeGreaterThan(15);
  });

  it("acepta url(#id) internos y propiedades cuyo nombre contiene «image» o «src»", () => {
    expect(() => verifySvg(wrap('<style>.a{fill:url(#grad);background-image:none}.b{src-x:1}</style><g style="filter:url(#f)"/>'))).not.toThrow();
  });

  it("acepta un SVG de dibujo y devuelve un elemento svg del documento", () => {
    const svg = verifySvg(wrap('<defs><marker id="m"><path d="M0 0"/></marker></defs><style>.node{fill:red}</style><g><use href="#m"/><text>hola</text></g>'));
    expect(svg).toBeInstanceOf(SVGSVGElement);
    expect(svg.ownerDocument).toBe(document);
    expect(svg.getAttribute("viewBox")).toBe("0 0 10 10");
  });

  it.each([
    ["script", wrap("<script>alert(1)</script>")],
    ["foreignObject", wrap("<foreignObject><div>x</div></foreignObject>")],
    ["atributo on*", wrap('<g onclick="alert(1)"/>')],
    ["atributo on* en la raíz", wrap("<g/>", ' onload="alert(1)"')],
    ["enlace a", wrap('<a href="https://example.com"><text>x</text></a>')],
    ["href externo", wrap('<image href="https://example.com/x.png"/>')],
    ["xlink:href javascript:", wrap('<use xlink:href="javascript:alert(1)"/>')],
    ["iframe", wrap("<iframe/>")],
    ["@import en un style con escape CSS", wrap("<style>@im\\70ort url(https://example.com/x.css);</style>")],
    ["url() externo con escape CSS (u\\72l)", wrap('<g style="fill: u\\72l(https://example.com/x)"/>')],
    // Converge 3 (lista blanca): cada una de estas lograba una petición externa real con la lista negra.
    ["HTML dentro de <desc>", wrap('<desc><img src="http://evil.test/x.png"></desc>')],
    ["HTML dentro de <title>", wrap('<title><img src="http://evil.test/x.png"></title>')],
    ["hijo HTML (div) en el SVG", wrap('<g><div>x</div></g>')],
    ["url() externo en un atributo de presentación", wrap('<rect fill="url(http://evil.test/f.svg#p)"/>')],
    ["url() externo con comillas en un atributo", wrap('<rect stroke="url(\'http://evil.test/f.svg#p\')"/>')],
    ["url() externo en clip-path", wrap('<g clip-path="url(//evil.test/c.svg#c)"/>')],
    ["<meta> (refresco)", wrap('<meta http-equiv="refresh" content="0;url=http://evil.test">')],
    ["<video>", wrap('<video src="http://evil.test/v.mp4"></video>')],
    ["<form>", wrap('<form action="http://evil.test"><input></form>')],
    ["<image> SVG", wrap('<image href="#a"/>')],
    ["<switch> con foreignObject anidado", wrap('<switch><foreignObject><div>x</div></foreignObject></switch>')],
    ["-moz-image-set()", wrap('<g style="background: -moz-image-set(\'https://example.com/x.png\' 1x)"/>')],
    ["image-set() que carga un recurso", wrap('<g style="fill: image-set(\'https://example.com/x.png\' 1x)"/>')],
    ["-webkit-image-set()", wrap('<g style="background: -webkit-image-set(\'https://example.com/x.png\' 1x)"/>')],
    ["src() de CSS", wrap('<g style="background: src(\'https://example.com/x.png\')"/>')],
    ["cross-fade()", wrap('<style>.a{background: cross-fade(url(#a), url(#b), 50%)}</style>')],
    ["element()", wrap('<g style="background: element(#a)"/>')],
    ["image() de CSS", wrap('<g style="background: image(\'https://example.com/x.png\')"/>')],
    ["image-set con escape CSS", wrap('<g style="fill: ima\\67 e-set(\'https://example.com/x.png\' 1x)"/>')],
    ["@import en un style", wrap("<style>@import url(https://example.com/x.css);</style>")],
    ["raíz que no es svg", '<div xmlns="http://www.w3.org/1999/xhtml">x</div>'],
    ["dos raíces", '<svg xmlns="http://www.w3.org/2000/svg"/><svg xmlns="http://www.w3.org/2000/svg"/>'],
    ["texto que no es SVG", "hola"],
  ])("rechaza %s", (_name, markup) => {
    expect(() => verifySvg(markup)).toThrow(MermaidSyntaxError);
  });

  it("al dibujar rechaza el SVG inseguro de Mermaid con un error del bloque", async () => {
    mocked.api.render.mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' });
    await expect(renderer().render("flowchart TD\n A --> B")).rejects.toBeInstanceOf(MermaidSyntaxError);
  });
});

describe("renderMermaid · errores por bloque (RF-049, RF-053)", () => {
  it("un error de sintaxis llega como MermaidSyntaxError con el mensaje y la línea, y no deja nodos temporales", async () => {
    mocked.api.render.mockImplementation(async (id: string) => {
      // Mermaid deja un nodo temporal en <body> mientras dibuja; si falla, no lo limpia.
      for (const prefix of ["d", ""]) {
        const node = document.createElement("div");
        node.id = prefix + id;
        document.body.append(node);
      }
      throw new Error("Parse error on line 3:\n...A[Inicio --> B(\n-----^\nExpecting 'SQE'");
    });
    const error = await renderer().render("flowchart TD\n  A[Inicio --> B(\n  ???").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MermaidSyntaxError);
    expect((error as MermaidSyntaxError).line).toBe(3);
    expect((error as MermaidSyntaxError).message).toContain("Parse error");
    expect(document.body.children).toHaveLength(0);
  });

  it("un error sin línea se entrega igual, sin línea", async () => {
    mocked.api.render.mockRejectedValue(new Error("No diagram type detected"));
    const error = (await renderer().render("???").catch((e: unknown) => e)) as MermaidSyntaxError;
    expect(error).toBeInstanceOf(MermaidSyntaxError);
    expect(error.line).toBeUndefined();
  });

  it("un valor que no es Error también se convierte en MermaidSyntaxError", async () => {
    mocked.api.render.mockRejectedValue("boom");
    await expect(renderer().render("???")).rejects.toBeInstanceOf(MermaidSyntaxError);
  });

  it("si el módulo no carga, MermaidLoadError; y el siguiente dibujo vuelve a intentarlo (Reintentar)", async () => {
    const load = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module")).mockResolvedValue(mocked.api);
    const r = renderer({ load });
    await expect(r.render("flowchart TD\n A --> B")).rejects.toBeInstanceOf(MermaidLoadError);
    await expect(r.render("flowchart TD\n A --> B")).resolves.toBeInstanceOf(SVGSVGElement);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("un bloque con error no impide dibujar el siguiente", async () => {
    mocked.api.render.mockRejectedValueOnce(new Error("Parse error on line 1")).mockResolvedValue({ svg: SAFE_SVG });
    const r = renderer();
    const results = await Promise.allSettled([r.render("mal"), r.render("flowchart TD\n A --> B")]);
    expect(results.map((x) => x.status)).toEqual(["rejected", "fulfilled"]);
  });
});

describe("renderMermaid · en serie cediendo el hilo (RNF-001)", () => {
  it("el segundo dibujo no empieza hasta que acaba el primero, y entre ambos se cede el hilo", async () => {
    const order: string[] = [];
    let finishFirst: (value: { svg: string }) => void = () => {};
    mocked.api.render
      .mockImplementationOnce(() => {
        order.push("start 1");
        return new Promise((resolve) => (finishFirst = resolve));
      })
      .mockImplementationOnce(async () => {
        order.push("start 2");
        return { svg: SAFE_SVG };
      });
    const yieldToMain = vi.fn(async () => void order.push("yield"));
    const r = renderer({ yieldToMain });
    const first = r.render("uno");
    const second = r.render("dos");
    await vi.waitFor(() => expect(order).toEqual(["start 1"]));
    finishFirst({ svg: SAFE_SVG });
    await Promise.all([first, second]);
    expect(order).toEqual(["start 1", "yield", "start 2"]);
  });
});

describe("renderMermaid · tema (RF-050)", () => {
  it("avisa a los suscriptores cuando cambia `data-theme` y deja de avisar al darse de baja", async () => {
    const r = renderer();
    const listener = vi.fn();
    const off = r.onThemeChange(listener);
    document.documentElement.dataset.theme = "light";
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    off();
    document.documentElement.dataset.theme = "dark";
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("cada dibujo se configura con los tokens y el modo oscuro de ese momento", async () => {
    let dark = true;
    const live: Record<string, string> = { ...tokens };
    const r = createMermaidRenderer({ read: (p) => live[p] ?? "", isDark: () => dark, yieldToMain: async () => {} });
    await r.render("flowchart TD\n A --> B");
    dark = false;
    live["--accent-soft"] = "rgba(8, 145, 178, 0.1)";
    live["--bg-secondary"] = "#f8fafc";
    live["--text-primary"] = "#0f172a";
    await r.render("flowchart TD\n A --> B");
    const [first, second] = mocked.api.initialize.mock.calls.map((call) => call[0].themeVariables);
    expect(first).toMatchObject({ darkMode: true, primaryColor: "#172f3e", textColor: "#e8e8ef" });
    expect(second).toMatchObject({ darkMode: false, primaryColor: "#e0f0f5", textColor: "#0f172a" });
  });
});
