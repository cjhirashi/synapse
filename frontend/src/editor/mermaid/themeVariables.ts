/**
 * `themeVariables` de Mermaid derivadas de los tokens del tema activo (SPEC-0010 RF-050; PLAN-0010 §2.3-f).
 *
 * Mermaid hornea los colores en el SVG y calcula tonos derivados con ellos, así que necesita valores
 * resueltos y opacos (no `var()` ni `rgba`): se leen de `tokens.css` ya resueltos y el `--accent-soft`
 * translúcido se compone sobre el fondo del área del diagrama. Con el tema `base` de Mermaid esto hace
 * que un diagrama siga la paleta MD3+Cyan (y no los temas `default`/`dark` de Mermaid). Núcleo puro: lee
 * a través de una función, sin tocar el DOM.
 */

/** Lee una propiedad CSS ya resuelta (`"--text-primary"` → `"#e8e8ef"`). */
export type TokenReader = (property: string) => string;

/** Lo que Mermaid espera en `themeVariables`. */
export type MermaidThemeVariables = Record<string, string | boolean>;

type Rgba = [number, number, number, number];

/** `#rrggbb` o `rgb(a)(…)` → canales y alfa. */
function parseColor(color: string): Rgba {
  const functional = color.match(/rgba?\(([^)]+)\)/);
  if (functional) {
    const [r, g, b, a = "1"] = functional[1].split(",").map((part) => part.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  const hex = color.trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(1) as Rgba;
}

const toHex = (channel: number) => Math.round(channel).toString(16).padStart(2, "0");

/** `top` (con su alfa) compuesto sobre `bottom` opaco, como hex de 6 dígitos. */
export function composite(top: string, bottom: string): string {
  const [r, g, b, alpha] = parseColor(top);
  const base = parseColor(bottom);
  return "#" + [r, g, b].map((channel, i) => toHex(channel * alpha + base[i] * (1 - alpha))).join("");
}

/** Mapa de variables de §2.3-f para el tema activo (`dark` según `data-theme`). */
export function themeVariables(read: TokenReader, dark: boolean): MermaidThemeVariables {
  const token = (name: string) => read(`--${name}`);
  const fill = composite(token("accent-soft"), token("bg-secondary"));
  const vars: MermaidThemeVariables = {
    darkMode: dark,
    background: token("bg-secondary"),
    fontFamily: token("font-ui"),
    fontSize: "13px",
    primaryColor: fill,
    mainBkg: fill,
    secondaryColor: token("bg-tertiary"),
    clusterBkg: token("bg-tertiary"),
    noteBkgColor: token("bg-tertiary"),
    labelBoxBkgColor: token("bg-tertiary"),
    tertiaryColor: token("bg-secondary"),
    edgeLabelBackground: token("bg-primary"),
    clusterBorder: token("text-secondary"),
    noteBorderColor: token("text-secondary"),
    errorTextColor: token("danger-text"),
  };
  for (const key of ["primaryTextColor", "textColor", "titleColor", "noteTextColor", "actorTextColor", "labelTextColor", "loopTextColor", "signalTextColor"]) {
    vars[key] = token("text-primary");
  }
  for (const key of ["primaryBorderColor", "nodeBorder", "actorBorder"]) vars[key] = token("accent");
  for (const key of ["lineColor", "signalColor", "actorLineColor", "defaultLinkColor"]) vars[key] = token("text-secondary");
  // Escala de color de los diagramas con series (pie, gantt, journey…): seis tokens en orden.
  ["accent-hover", "info-text", "success-text", "warning-text", "danger-text", "text-secondary"].forEach((name, i) => {
    vars[`cScale${i}`] = token(name);
    vars[`pie${i + 1}`] = token(name);
  });
  return vars;
}
