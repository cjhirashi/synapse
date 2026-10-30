/**
 * Presentación del ícono de una bóveda (SPEC-0009 RF-001, RF-011; PLAN-0009 §2.1, P-1, P-2).
 *
 * `Vault.icon` es un texto «glifo[:color]» (gramática en `contracts/vault-icon.schema.json`):
 * el servidor sólo valida la gramática; este módulo es quien conoce el catálogo y la paleta.
 * Nada de lo que llega en `icon` se interpreta como marcado, URL o estilo: el glifo se busca en
 * un mapa estático (desconocido → iniciales) y el color en una lista de claves de tokens
 * (desconocido → color derivado de la bóveda), así un valor hostil nunca llega al DOM ni al CSS.
 */
import {
  BookOpen,
  Book,
  Brain,
  Briefcase,
  Camera,
  Code,
  Dumbbell,
  FlaskConical,
  Folder,
  FolderHeart,
  Globe,
  GraduationCap,
  Heart,
  House,
  Leaf,
  Lightbulb,
  Music,
  Notebook,
  Palette,
  PenTool,
  Rocket,
  Star,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

/** Set curado de glifos (importaciones nombradas: el *bundler* sólo incluye estos 24). */
export const ICON_SET: Readonly<Record<string, LucideIcon>> = {
  folder: Folder,
  "folder-heart": FolderHeart,
  book: Book,
  "book-open": BookOpen,
  notebook: Notebook,
  brain: Brain,
  briefcase: Briefcase,
  code: Code,
  "flask-conical": FlaskConical,
  "graduation-cap": GraduationCap,
  heart: Heart,
  house: House,
  lightbulb: Lightbulb,
  music: Music,
  palette: Palette,
  "pen-tool": PenTool,
  rocket: Rocket,
  star: Star,
  target: Target,
  users: Users,
  camera: Camera,
  globe: Globe,
  leaf: Leaf,
  dumbbell: Dumbbell,
};

/** Nombre accesible en español de cada glifo (selector de RF-011). */
export const ICON_LABELS: Readonly<Record<string, string>> = {
  folder: "Carpeta",
  "folder-heart": "Carpeta con corazón",
  book: "Libro",
  "book-open": "Libro abierto",
  notebook: "Cuaderno",
  brain: "Cerebro",
  briefcase: "Maletín",
  code: "Código",
  "flask-conical": "Matraz",
  "graduation-cap": "Birrete",
  heart: "Corazón",
  house: "Casa",
  lightbulb: "Bombilla",
  music: "Música",
  palette: "Paleta",
  "pen-tool": "Pluma",
  rocket: "Cohete",
  star: "Estrella",
  target: "Diana",
  users: "Personas",
  camera: "Cámara",
  globe: "Mundo",
  leaf: "Hoja",
  dumbbell: "Pesa",
};

/**
 * Claves de color que pueden colorear una bóveda (H-008 C-10): las 5 semánticas de siempre
 * (`accent/info/success/warning/danger`, reusan sus tokens) más las 12 familias Tailwind dedicadas
 * a bóvedas (`--vault-*`, ver `COLOR_TOKEN`). Cada una existe como token en los dos temas.
 */
export const PALETTE = [
  "accent", "info", "success", "warning", "danger",
  "orange", "yellow", "lime", "emerald", "teal",
  "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
] as const;
export type PaletteKey = (typeof PALETTE)[number];

/** Token CSS de cada color: las 5 de siempre reusan el semántico; las 12 nuevas, su `--vault-*`. */
const COLOR_TOKEN: Readonly<Record<PaletteKey, string>> = {
  accent: "--accent",
  info: "--info",
  success: "--success",
  warning: "--warning",
  danger: "--danger",
  orange: "--vault-orange",
  yellow: "--vault-yellow",
  lime: "--vault-lime",
  emerald: "--vault-emerald",
  teal: "--vault-teal",
  blue: "--vault-blue",
  indigo: "--vault-indigo",
  violet: "--vault-violet",
  purple: "--vault-purple",
  fuchsia: "--vault-fuchsia",
  pink: "--vault-pink",
  rose: "--vault-rose",
};

/**
 * Color secundario de cada color de bóveda (H-014, cambio de Carlos 2026-10-30): un color ANÁLOGO, el
 * vecino de la MISMA paleta a ~20-40° en el círculo cromático, siempre avanzando en el mismo sentido
 * (de rojo hacia naranja, amarillo, verde, azul, violeta, rosa). Antes era el complementario (+180°), que
 * se veía demasiado marcado (cian → rojo). Lo usan la negrita, la cursiva y los enlaces del markdown
 * renderizado: el cambio entre el color de la bóveda (encabezados) y el secundario es sutil. No inventa
 * colores: cada valor es un `PaletteKey`, así existe como token en los dos temas. (`lime → success` queda
 * a ~59° por el hueco de la paleta entre ambos; el resto cae entre 21° y 43°.)
 */
export const SECONDARY: Readonly<Record<PaletteKey, PaletteKey>> = {
  danger: "orange",
  orange: "yellow",
  warning: "lime",
  yellow: "lime",
  lime: "success",
  success: "teal",
  emerald: "accent",
  teal: "info",
  accent: "blue",
  info: "indigo",
  blue: "indigo",
  indigo: "violet",
  violet: "fuchsia",
  purple: "fuchsia",
  fuchsia: "pink",
  pink: "rose",
  rose: "orange",
};

/** Nombre accesible en español de cada color (selector de RF-011; H-008 C-11). */
export const COLOR_LABELS: Readonly<Record<PaletteKey, string>> = {
  accent: "Cian",
  info: "Azul",
  success: "Verde",
  warning: "Ámbar",
  danger: "Rojo",
  orange: "Naranja",
  yellow: "Amarillo",
  lime: "Lima",
  emerald: "Esmeralda",
  teal: "Verde azulado",
  blue: "Azul real",
  indigo: "Índigo",
  violet: "Violeta",
  purple: "Púrpura",
  fuchsia: "Fucsia",
  pink: "Rosa",
  rose: "Rosado",
};

/** Marcador del glifo que significa «mostrar las iniciales» (con o sin color elegido). */
const INITIALS = "initials";

const has = (map: object, key: string) => Object.prototype.hasOwnProperty.call(map, key);

/** `var(--token)` de un color de la paleta: el único valor de color que el chip pone en `style`. */
export const colorVar = (key: PaletteKey): string => `var(${COLOR_TOKEN[key]})`;

export interface ParsedIcon {
  /** Id del glifo del catálogo, o `null` para mostrar las iniciales. */
  glyph: string | null;
  /** Color elegido, o `null` para el derivado de la bóveda. */
  color: PaletteKey | null;
}

/** Lee «glifo[:color]»; lo ausente, desconocido o mal formado degrada a iniciales/derivado sin lanzar. */
export function parseIcon(icon: string | null | undefined): ParsedIcon {
  const parts = (icon ?? "").split(":");
  if (parts.length > 2) return { glyph: null, color: null };
  const [glyph, color] = parts;
  return {
    glyph: has(ICON_SET, glyph) ? glyph : null,
    color: (PALETTE as readonly string[]).includes(color) ? (color as PaletteKey) : null,
  };
}

/** Inverso de `parseIcon`; sin glifo ni color no hay nada que guardar (`null`). */
export function formatIcon(glyph: string | null, color: PaletteKey | null): string | null {
  if (glyph === null && color === null) return null;
  return color === null ? glyph : `${glyph ?? INITIALS}:${color}`;
}

/** Colores que se derivan solos: `danger` se excluye porque lee como alerta y sólo se elige a mano. */
const DERIVABLE: readonly PaletteKey[] = ["accent", "info", "success", "warning"];

/** Color por omisión de una bóveda: estable (depende sólo de su id, no de su nombre). */
export function derivedColor(vaultId: string): PaletteKey {
  let sum = 0;
  for (const char of vaultId) sum += char.codePointAt(0)!;
  return DERIVABLE[sum % DERIVABLE.length];
}

/** Iniciales del nombre: la primera letra de las dos primeras palabras, o las dos primeras de una sola. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words.slice(0, 2).map((word) => [...word][0]) : [...(words[0] ?? "?")].slice(0, 2);
  return letters.join("").toLocaleUpperCase("es");
}
