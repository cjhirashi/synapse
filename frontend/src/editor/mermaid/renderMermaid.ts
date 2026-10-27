/**
 * Renderizador de Mermaid del editor (SPEC-0010 RF-046, RF-049…RF-051, RF-053, RNF-001, RNF-003;
 * PLAN-0010 §2.3-f, P-10).
 *
 * El diagrama sale de texto del usuario o de sus agentes, así que se trata como entrada hostil en tres
 * capas independientes: (1) la fuente se limpia antes de llegar a Mermaid (`sanitizeSource`: sin
 * directivas `%%{…}%%`, sin `click`/`link`, sin `config:` de frontmatter); (2) Mermaid se configura en modo
 * estricto, con `secure` ampliado para que ninguna directiva pueda relajarlo (`mermaidConfig`); (3) el SVG
 * que devuelve se verifica como DOM antes de insertarlo (`verifySvg`): es la única inserción de marcado
 * del editor y sólo entra un dibujo sin `script`, `foreignObject`, `on*` ni enlaces navegables.
 *
 * `mermaid` (~170 KiB gzip más un chunk por tipo de diagrama) se pide con `import()` la primera vez que un
 * bloque `mermaid` se dibuja (RNF-002). Los dibujos van **en serie** cediendo el hilo entre uno y otro, para
 * que una nota con varios diagramas no produzca una tarea larga (RNF-001). Los colores salen de los tokens
 * del tema (`themeVariables`) y, al cambiar `data-theme`, los bloques piden redibujarse (`onThemeChange`).
 */
import { MermaidLoadError, MermaidSyntaxError, type MermaidRenderer } from "../codeBlockView";
import { themeVariables, type TokenReader } from "./themeVariables";

/** Lo mínimo que se usa de la API de `mermaid` (la real y la simulada de las pruebas lo cumplen). */
export interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string, container?: Element): Promise<{ svg: string }>;
}

/** Renderizador con aviso de cambio de tema (los bloques se vuelven a dibujar con los colores nuevos). */
export interface ThemedMermaidRenderer extends MermaidRenderer {
  onThemeChange(listener: () => void): () => void;
}

/** Claves de configuración que una directiva `%%{init}%%` o el frontmatter NO pueden cambiar (RF-051). */
const SECURE_KEYS = [
  // Las que Mermaid ya protege por defecto.
  "secure", "securityLevel", "startOnLoad", "maxTextSize", "maxEdges", "suppressErrorRendering",
  // Tema y aspecto: salen de los tokens, no de la fuente (RF-050).
  "theme", "themeVariables", "themeCSS", "darkMode", "fontFamily", "fontSize", "look", "layout",
  // HTML en las etiquetas y su configuración por diagrama.
  "htmlLabels", "flowchart",
];

/** Configuración estricta de Mermaid con los colores del tema activo. */
export function mermaidConfig(read: TokenReader, dark: boolean): Record<string, unknown> {
  return {
    startOnLoad: false,
    securityLevel: "strict",
    // Sin `foreignObject`: las etiquetas son texto SVG, nunca HTML (se pide en el nivel raíz y en flowchart).
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    theme: "base",
    themeVariables: themeVariables(read, dark),
    // El error de sintaxis lo dibuja el bloque (RF-049), no un SVG «bomba» insertado por Mermaid.
    suppressErrorRendering: true,
    secure: SECURE_KEYS,
  };
}

/** Sustituye por líneas en blanco el texto de `match`, para que las líneas de la fuente no se muevan. */
const blank = (match: string) => match.replace(/[^\n]/g, "");

/**
 * La fuente sin lo que podría relajar la seguridad, cambiar el tema o ejecutar acciones (RF-051): directivas
 * `%%{…}%%`, sentencias `click`/`callback`/`link` (por sentencia, no por línea) y la clave `config:` del frontmatter. Se vacían las líneas
 * en vez de borrarlas, así los errores de Mermaid siguen apuntando a la línea del bloque.
 */
export function sanitizeSource(source: string): string {
  let text = source;
  // Frontmatter inicial (`---` … `---`): se quita la clave `config:` y su bloque indentado.
  const front = text.match(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?=\r?\n|$)/);
  if (front) {
    const cleaned = front[0].replace(/^config:[^\n]*(?:\n(?:[ \t][^\n]*|[ \t]*))*/m, blank);
    text = cleaned + text.slice(front[0].length);
  }
  return text
    .replace(/%%\{[\s\S]*?\}%%/g, blank)
    .split("\n")
    .map(dropActionStatements)
    .join("\n");
}

/**
 * Sentencias que atan una acción a un nodo: `click ID …`, `callback ID "…"` y `link(s) ID: …` (sequenceDiagram). Una
 * palabra suelta (un nodo llamado `click`, una etiqueta con «click») no cuenta: `click` exige un identificador que no
 * sea una flecha, `callback` un texto entre comillas y `link` los dos puntos.
 */
const ACTION_STATEMENT = /^\s*(?:click\s+(?!-)\S|callback\s+[\w.-]+\s+["']|links?\s+[^\s:]+\s*:)/i;

/** Quita de una línea las sentencias de acción: separadas por `;` (fuera de comillas dobles) o la línea entera. */
function dropActionStatements(line: string): string {
  if (/^\s*%%/.test(line)) return line;
  const statements: string[] = [];
  let current = "";
  let quoted = false;
  // Con un número impar de comillas la línea está mal formada: no se fía de ellas (una comilla sin cerrar no puede
  // esconder un `click` posterior tras un `;`).
  const trustQuotes = (line.match(/"/g) ?? []).length % 2 === 0;
  for (const char of line) {
    if (char === '"' && trustQuotes) quoted = !quoted;
    if (char === ";" && !quoted) {
      statements.push(current);
      current = "";
    } else current += char;
  }
  statements.push(current);
  return statements.map((statement) => (ACTION_STATEMENT.test(statement) ? "" : statement)).join(";");
}

const SVG_NS = "http://www.w3.org/2000/svg";
/**
 * LISTA BLANCA de elementos (todos en el espacio de nombres SVG) que Mermaid emite de verdad, contrastada con el SVG
 * real de cada tipo de diagrama (flowchart, sequence, class, state, er, gantt, pie, git, mindmap, timeline, quadrant,
 * xychart, sankey, requirement, block, kanban, C4, architecture, packet, radar, treemap). Cualquier otro elemento —un
 * hijo HTML/XHTML, `a`, `image`, `foreignObject`, `switch`, `script`, `video`, `form`, `meta`…— rechaza el dibujo: una
 * lista negra dejaba pasar `<desc><img src=…></desc>` y similares (Converge 3). `title` y `desc` sólo admiten texto.
 */
/** Nombres en minúsculas: según el analizador (navegador, jsdom) `feDropShadow` llega con o sin capitalización. */
const ALLOWED_ELEMENTS = new Set([
  "svg", "g", "defs", "marker", "path", "rect", "circle", "ellipse", "line", "polygon", "polyline", "text", "tspan",
  "title", "desc", "style", "symbol", "use", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern",
  "filter", "feDropShadow", "feGaussianBlur", "feOffset", "feBlend", "feComposite", "feFlood", "feMerge", "feMergeNode",
].map((name) => name.toLowerCase()));

/**
 * Estilos con carga externa o ejecución: `@import`, `javascript:`, `expression(`, `url()` que no sea un `#id` y
 * TODA función de CSS que pueda cargar un recurso (`image-set`, `src`, `image`, `cross-fade`, `element`, con o sin
 * prefijo `-webkit-`): el dibujo de Mermaid no usa ninguna. El nombre debe ir pegado a `(` y no seguir a una letra o
 * guion (`background-image:` y `src-x:` no son funciones).
 */
const FORBIDDEN_CSS = /@import|javascript:|expression\(|url\(\s*['"]?\s*(?!#)|(?<![\w-])(?:-[a-z]+-)?(?:image-set|src|image|cross-fade|element)\(/i;

/** Toda `url(...)` de un valor debe apuntar a `#id` local (marcadores, degradados, recortes de Mermaid); nada externo. */
const hasExternalUrl = (value: string): boolean =>
  [...decodeCssEscapes(value).matchAll(/url\(\s*(['"]?)\s*([^)'"]*)/gi)].some((match) => !match[2].startsWith("#"));

/** El CSS con sus escapes resueltos (`u\72l(` = `url(`): la comprobación se hace sobre lo que el navegador entendería. */
const decodeCssEscapes = (css: string): string =>
  css.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([\s\S])/g, (_m, hex: string | undefined, char: string | undefined) =>
    hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)) : (char as string),
  );
const forbiddenCss = (css: string) => FORBIDDEN_CSS.test(decodeCssEscapes(css));

const unsafe = (what: string) => new MermaidSyntaxError(`El diagrama contiene ${what}, que no está permitido`);

/**
 * Verifica el SVG que devuelve Mermaid y lo entrega como elemento del documento (RNF-003). Se analiza como
 * DOM (nunca se re-serializa ni se asigna con `innerHTML`) y se recorre entero: un solo elemento o atributo
 * fuera de la lista rechaza el dibujo completo, que el bloque muestra como error.
 */
export function verifySvg(markup: string): SVGSVGElement {
  // HTML (no XML) porque el SVG de Mermaid trae `<br>` y entidades que un analizador XML estricto rechaza.
  const doc = new DOMParser().parseFromString(markup, "text/html");
  const root = doc.body.firstElementChild;
  if (!root || doc.body.children.length !== 1 || doc.head.children.length > 0 || root.namespaceURI !== SVG_NS || root.localName !== "svg") {
    throw unsafe("algo que no es un dibujo SVG");
  }
  for (const element of [root, ...root.querySelectorAll("*")]) {
    // Sólo elementos SVG de la lista blanca: un hijo HTML (cualquier `namespaceURI` distinto) o un nombre desconocido
    // rechaza el dibujo. El nombre se compara en minúsculas.
    if (element.namespaceURI !== SVG_NS || !ALLOWED_ELEMENTS.has(element.localName.toLowerCase())) throw unsafe(`el elemento <${element.localName}>`);
    if (["title", "desc"].includes(element.localName) && element.children.length > 0) throw unsafe(`marcado dentro de <${element.localName}>`);
    if (element.localName === "style" && forbiddenCss(element.textContent ?? "")) throw unsafe("estilos con carga externa");
    for (const attribute of element.attributes) {
      const attr = attribute.name.toLowerCase();
      if (attr.startsWith("on")) throw unsafe(`el atributo ${attr}`);
      // Sólo referencias internas (`#id`, p. ej. un marcador de flecha): nada que navegue o cargue de fuera.
      if (attr.endsWith("href") && !attribute.value.trim().startsWith("#")) throw unsafe("un enlace");
      // `url()` puede ir en CUALQUIER atributo de presentación (`fill`, `stroke`, `clip-path`, `filter`…), no sólo en `style`.
      if (hasExternalUrl(attribute.value)) throw unsafe("una referencia externa (url)");
      if (attr === "style" && forbiddenCss(attribute.value)) throw unsafe("estilos con carga externa");
    }
  }
  return document.importNode(root, true) as unknown as SVGSVGElement;
}

/** Línea del error dentro del bloque, si Mermaid la menciona («Parse error on line 3»). */
const errorLine = (message: string): number | undefined => {
  const match = message.match(/line\s+(\d+)/i);
  return match ? Number(match[1]) : undefined;
};

interface RendererDeps {
  /** Carga el módulo de Mermaid (por defecto `import("mermaid")`). */
  load?: () => Promise<MermaidApi>;
  /** Lectura de tokens resueltos del documento. */
  read?: TokenReader;
  isDark?: () => boolean;
  /** Cede el hilo principal entre dos dibujos. */
  yieldToMain?: () => Promise<void>;
}

const loadMermaid = async (): Promise<MermaidApi> => (await import("mermaid")).default as unknown as MermaidApi;
const readToken: TokenReader = (property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim();
const isDarkTheme = () => document.documentElement.dataset.theme === "dark";
const yieldThread = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let counter = 0;

export function createMermaidRenderer({ load = loadMermaid, read = readToken, isDark = isDarkTheme, yieldToMain = yieldThread }: RendererDeps = {}): ThemedMermaidRenderer {
  /** El módulo, una vez cargado; un fallo no se recuerda para que «Reintentar» vuelva a pedirlo. */
  let api: Promise<MermaidApi> | null = null;
  const module = () => (api ??= load().catch((error: unknown) => {
    api = null;
    throw new MermaidLoadError(error instanceof Error ? error.message : String(error));
  }));

  async function draw(source: string): Promise<SVGSVGElement> {
    const mermaid = await module();
    const id = `synapse-mermaid-${++counter}`;
    // Mermaid mide con `getBBox()` en un nodo temporal: se le da un contenedor propio, oculto y sin transiciones (la
    // regla global de `prefers-reduced-motion` deja las posiciones a medio transitar y el viewBox sale desplazado).
    const host = document.createElement("div");
    host.className = "mermaid-measure";
    host.setAttribute("aria-hidden", "true");
    document.body.append(host);
    try {
      // Se reconfigura en cada dibujo: los tokens y el modo oscuro son los del momento (cambio de tema).
      mermaid.initialize(mermaidConfig(read, isDark()));
      const { svg } = await mermaid.render(id, sanitizeSource(source), host);
      return verifySvg(svg);
    } catch (error) {
      if (error instanceof MermaidSyntaxError) throw error;
      const message = (error instanceof Error ? error.message : String(error)).trim();
      throw new MermaidSyntaxError(message.slice(0, 600), errorLine(message));
    } finally {
      // Con el contenedor fuera, se van también los nodos temporales que Mermaid deja cuando el dibujo falla.
      host.remove();
      document.getElementById(`d${id}`)?.remove();
      document.getElementById(id)?.remove();
    }
  }

  // Cola de dibujos: uno a la vez; si había otro en curso, se cede el hilo antes de empezar.
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;

  const listeners = new Set<() => void>();
  let observer: MutationObserver | null = null;

  return {
    render(source) {
      const waited = pending > 0;
      pending += 1;
      const result = tail.then(async () => {
        if (waited) await yieldToMain();
        return draw(source);
      });
      tail = result.then(
        () => undefined,
        () => undefined,
      ).then(() => {
        pending -= 1;
      });
      return result;
    },

    onThemeChange(listener) {
      listeners.add(listener);
      if (!observer) {
        observer = new MutationObserver((records) => {
          if (records.some((record) => record.oldValue !== document.documentElement.dataset.theme)) for (const notify of [...listeners]) notify();
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"], attributeOldValue: true });
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          observer?.disconnect();
          observer = null;
        }
      };
    },
  };
}

/** El renderizador de la aplicación: uno por página, compartido por todos los bloques. */
export const mermaidRenderer = createMermaidRenderer();
