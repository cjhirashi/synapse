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

/** Claves de tokens de `styles/tokens.css` que pueden colorear una bóveda (sin valores nuevos). */
export const PALETTE = ["accent", "info", "success", "warning", "danger"] as const;
export type PaletteKey = (typeof PALETTE)[number];

/** Nombre accesible en español de cada color (selector de RF-011). */
export const COLOR_LABELS: Readonly<Record<PaletteKey, string>> = {
  accent: "Cian",
  info: "Azul",
  success: "Verde",
  warning: "Ámbar",
  danger: "Rojo",
};

/** Marcador del glifo que significa «mostrar las iniciales» (con o sin color elegido). */
const INITIALS = "initials";

const has = (map: object, key: string) => Object.prototype.hasOwnProperty.call(map, key);

/** `var(--clave)` de un color de la paleta: el único valor de color que el chip pone en `style`. */
export const colorVar = (key: PaletteKey): string => `var(--${key})`;

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
