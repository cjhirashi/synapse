/**
 * Tema de color del documento a partir de un color primario (H-036): copia de `backend/app/core/color_theme.py` (leer allí la regla completa).
 * El formulario de la plantilla y su vista previa lo usan para mostrar los mismos colores que el servidor imprime en el PDF.
 * Ambas pasan los casos de `backend/tests/fixtures/tema_colores.json`.
 */

const HUE_STEP = 30;
const L600_DROP = 0.16;
const L600_RANGE = [0.5, 0.62] as const;
const L400_RANGE = [0.72, 0.86] as const;
const C600_GAMUT_SHARE = 0.93;
const C600_BOOST_MAX = 1.5;
const WHITE = "#ffffff";

type Oklch = [number, number, number];

const toLinear = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (input: number): number => {
  const value = Math.min(1, Math.max(0, input));
  return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
};
/** Python redondea .5 hacia el par; JavaScript hacia arriba: se iguala para que ambos den el mismo canal. */
const roundHalfEven = (value: number): number => {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (Math.abs(diff - 0.5) < 1e-9) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(value);
};
const hex2 = (value: number): string => roundHalfEven(value).toString(16).padStart(2, "0");

export function hexToOklch(color: string): Oklch {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(color.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [lightness, Math.hypot(a, bb), (((Math.atan2(bb, a) * 180) / Math.PI) % 360 + 360) % 360];
}

function oklchToLinear(lightness: number, chroma: number, hue: number): [number, number, number] {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

const inGamut = (lightness: number, chroma: number, hue: number): boolean => oklchToLinear(lightness, chroma, hue).every((v) => v >= -0.0005 && v <= 1.0005);

export function oklchToHex(lightnessIn: number, chromaIn: number, hue: number): string {
  const lightness = Math.min(1, Math.max(0, lightnessIn));
  let chroma = chromaIn;
  if (!inGamut(lightness, chroma, hue)) {
    let low = 0;
    let high = chroma;
    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2;
      if (inGamut(lightness, mid, hue)) low = mid;
      else high = mid;
    }
    chroma = low;
  }
  return `#${oklchToLinear(lightness, chroma, hue).map((v) => hex2(fromLinear(v) * 255)).join("")}`;
}

export function rotate(color: string, degrees = HUE_STEP): string {
  const [lightness, chroma, hue] = hexToOklch(color);
  return oklchToHex(lightness, chroma, hue + degrees);
}

function maxChroma(lightness: number, hue: number): number {
  let low = 0;
  let high = 0.5;
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    if (inGamut(lightness, mid, hue)) low = mid;
    else high = mid;
  }
  return low;
}

export function tone600(color: string): string {
  const [lightness, chroma, hue] = hexToOklch(color);
  const target = Math.min(lightness, Math.min(L600_RANGE[1], Math.max(L600_RANGE[0], lightness - L600_DROP)));
  if (target >= lightness) return oklchToHex(lightness, chroma, hue);
  return oklchToHex(target, Math.min(C600_GAMUT_SHARE * maxChroma(target, hue), chroma * C600_BOOST_MAX), hue);
}

export function tone400(color: string): string {
  const [lightness, chroma, hue] = hexToOklch(color);
  return oklchToHex(Math.min(L400_RANGE[1], Math.max(L400_RANGE[0], lightness)), chroma, hue);
}

/** `color-mix(in srgb, first percent%, second)`. */
export function mix(first: string, second: string, percentFirst: number): string {
  const weight = percentFirst / 100;
  return `#${[1, 3, 5].map((i) => hex2(parseInt(first.slice(i, i + 2), 16) * weight + parseInt(second.slice(i, i + 2), 16) * (1 - weight))).join("")}`;
}

export interface ThemeColors {
  primario: string; secundario: string; terciario: string;
  primario_600: string; primario_400: string; secundario_600: string; secundario_400: string;
  h1: string; h2: string; h3: string; h4: string;
  negrita: string; cursiva: string; negrita_cursiva: string; enlace: string; codigo: string; codigo_fondo: string;
  marcador: string; cita: string; cita_fondo: string;
  tabla_cabecera_fondo: string; tabla_cabecera_texto: string; tabla_fila_par: string;
}

export function palette(primaryIn: string, textIn: string, background = WHITE): ThemeColors {
  const primary = primaryIn.toLowerCase();
  const text = textIn.toLowerCase();
  const secondary = rotate(primary);
  const tertiary = rotate(secondary);
  const primary600 = tone600(primary);
  const primary400 = tone400(primary);
  const secondary600 = rotate(primary600);
  const secondary400 = rotate(primary400);
  return {
    primario: primary, secundario: secondary, terciario: tertiary,
    primario_600: primary600, primario_400: primary400, secundario_600: secondary600, secundario_400: secondary400,
    h1: primary600, h2: secondary600, h3: mix(primary400, text, 60), h4: mix(secondary400, text, 60),
    negrita: mix(secondary, text, 85), cursiva: mix(secondary, text, 40), negrita_cursiva: mix(secondary, text, 60),
    enlace: mix(tertiary, text, 65), codigo: mix(tertiary, text, 45), codigo_fondo: mix(text, background, 10),
    marcador: primary600,
    cita: secondary600, cita_fondo: mix(secondary600, background, 8),
    tabla_cabecera_fondo: mix(primary, background, 15), tabla_cabecera_texto: primary600, tabla_fila_par: mix(primary, background, 7),
  };
}
