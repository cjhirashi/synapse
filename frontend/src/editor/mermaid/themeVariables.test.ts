// RF-050 (SPEC-0010; PLAN-0010 §2.3-f): las `themeVariables` de Mermaid salen de los tokens del tema activo.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { composite, themeVariables } from "./themeVariables";

const tokens = readFileSync(resolve(__dirname, "../../styles/tokens.css"), "utf8");

/** Variables de `tokens.css` de un tema más las de `:root`: lo que `getComputedStyle` resolvería. */
function theme(name: "dark" | "light"): (property: string) => string {
  const block = (selector: string) => {
    const start = tokens.indexOf(selector);
    const body = tokens.slice(tokens.indexOf("{", start) + 1, tokens.indexOf("}", start));
    return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [`--${m[1]}`, m[2].trim()]));
  };
  const vars = { ...block(":root {"), ...block(`:root[data-theme="${name}"]`) };
  return (property) => vars[property] ?? "";
}

describe("composite", () => {
  it("compone un rgba sobre un hex opaco y devuelve un hex de 6 dígitos", () => {
    expect(composite("rgba(8, 145, 178, 0.18)", "#1a1a24")).toBe("#172f3e");
    expect(composite("rgba(8, 145, 178, 0.1)", "#f8fafc")).toBe("#e0f0f5");
  });

  it("alfa 1 devuelve el propio color y alfa 0 el fondo; acepta hex de entrada", () => {
    expect(composite("rgba(10, 20, 30, 1)", "#ffffff")).toBe("#0a141e");
    expect(composite("rgba(10, 20, 30, 0)", "#ffffff")).toBe("#ffffff");
    expect(composite("#0891b2", "#ffffff")).toBe("#0891b2");
  });
});

describe("themeVariables · RF-050", () => {
  it.each(["dark", "light"] as const)("%s: el mapa completo sale de los tokens del tema", (mode) => {
    const read = theme(mode);
    const vars = themeVariables(read, mode === "dark");
    const fill = mode === "dark" ? "#172f3e" : "#e0f0f5";

    expect(vars.darkMode).toBe(mode === "dark");
    expect(vars.background).toBe(read("--bg-secondary"));
    // Relleno de nodo: el `--accent-soft` translúcido compuesto sobre el fondo del área, como hex opaco.
    expect(vars.primaryColor).toBe(fill);
    expect(vars.mainBkg).toBe(fill);
    for (const key of ["primaryTextColor", "textColor", "titleColor", "noteTextColor", "actorTextColor", "labelTextColor", "loopTextColor", "signalTextColor"]) {
      expect(vars[key], key).toBe(read("--text-primary"));
    }
    for (const key of ["primaryBorderColor", "nodeBorder", "actorBorder"]) expect(vars[key], key).toBe(read("--accent"));
    for (const key of ["lineColor", "signalColor", "actorLineColor", "defaultLinkColor"]) expect(vars[key], key).toBe(read("--text-secondary"));
    for (const key of ["secondaryColor", "clusterBkg", "noteBkgColor", "labelBoxBkgColor"]) expect(vars[key], key).toBe(read("--bg-tertiary"));
    expect(vars.tertiaryColor).toBe(read("--bg-secondary"));
    expect(vars.edgeLabelBackground).toBe(read("--bg-primary"));
    for (const key of ["clusterBorder", "noteBorderColor"]) expect(vars[key], key).toBe(read("--text-secondary"));
    expect(vars.errorTextColor).toBe(read("--danger-text"));
    expect(vars.fontFamily).toBe(read("--font-ui"));
    expect(vars.fontSize).toBe("13px");

    // Escala de color de los diagramas con series (pie, gantt…): seis tokens en orden.
    const scale = ["--accent-hover", "--info-text", "--success-text", "--warning-text", "--danger-text", "--text-secondary"].map(read);
    scale.forEach((color, i) => {
      expect(vars[`cScale${i}`], `cScale${i}`).toBe(color);
      expect(vars[`pie${i + 1}`], `pie${i + 1}`).toBe(color);
    });
  });

  it("los dos temas dan mapas distintos (el cambio de tema se nota en el SVG)", () => {
    expect(themeVariables(theme("dark"), true).primaryColor).not.toBe(themeVariables(theme("light"), false).primaryColor);
    expect(themeVariables(theme("dark"), true).textColor).not.toBe(themeVariables(theme("light"), false).textColor);
  });

  it("todos los valores son texto o booleano, sin literales de color propios", () => {
    for (const [key, value] of Object.entries(themeVariables(theme("dark"), true))) {
      expect(["string", "boolean"], key).toContain(typeof value);
      if (typeof value === "string" && key !== "fontFamily" && key !== "fontSize") expect(value, key).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
