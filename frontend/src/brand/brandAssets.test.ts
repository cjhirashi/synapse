// Assets de marca publicados en `frontend/public/` (SPEC-0011; PLAN-0011 §5.2), sin navegador.
// Cada bloque lleva su RF en el título (Art. 9). Las medidas de render (silueta, máscara, maskable,
// pestaña) se hacen en Chromium real: `e2e/brand-*.spec.ts`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync, inflateSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { contrast, hexToRgb, hue, token } from "../test-utils/wcag";

const PUBLIC = resolve(__dirname, "../../public");
const read = (name: string) => readFileSync(resolve(PUBLIC, name), "utf8");

interface Palette {
  front: [string, string];
  back: [string, string];
}
const palettes = JSON.parse(readFileSync(resolve(__dirname, "../../scripts/brand/palettes.json"), "utf8")) as Record<string, Palette>;
const paletteStops = (name: string) => [...palettes[name].front, ...palettes[name].back].sort();

/** Colores hexadecimales de un texto SVG/CSS, en minúsculas y con las formas cortas expandidas. */
function hexColors(text: string): string[] {
  return [...text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map((m) => {
    const h = m[1].toLowerCase();
    return "#" + (h.length === 3 ? [...h].map((c) => c + c).join("") : h);
  });
}

/** Paradas (`stop-color`) fuera de cualquier `<style>`: la paleta por defecto del SVG. */
function stopColors(svg: string): string[] {
  const noStyle = svg.replace(/<style[\s\S]*?<\/style>/g, "");
  return [...noStyle.matchAll(/stop-color[=:]"?(#[0-9a-f]{3,6})/gi)].flatMap((m) => hexColors(m[1])).sort();
}

const SVGS = ["logo-synapse-dark.svg", "logo-synapse-light.svg", "favicon.svg"];

describe("SVG publicados", () => {
  test.each(SVGS)("RF-013: %s — todo color en la familia cian (180°–200°) y sin los azules del original", (file) => {
    const colors = hexColors(read(file));
    expect(colors.length).toBeGreaterThan(0);
    for (const c of colors) {
      const h = hue(hexToRgb(c));
      expect(h, `${file} ${c}`).toBeGreaterThanOrEqual(180);
      expect(h, `${file} ${c}`).toBeLessThanOrEqual(200);
      expect(["#001430", "#0f3ab5", "#2643d4"]).not.toContain(c);
    }
  });

  test.each(SVGS)("RF-013: %s — al menos un degradado de dos o más paradas distintas", (file) => {
    const gradients = [...read(file).matchAll(/<linearGradient[\s\S]*?<\/linearGradient>/g)].map((m) => new Set(hexColors(m[0])));
    expect(gradients.some((stops) => stops.size >= 2)).toBe(true);
  });

  test("RF-014: las variantes de cabecera usan las paletas dark y light del canon", () => {
    expect(stopColors(read("logo-synapse-dark.svg"))).toEqual(paletteStops("dark"));
    expect(stopColors(read("logo-synapse-light.svg"))).toEqual(paletteStops("light"));
  });

  test("RF-014: cada parada de cada variante ≥ 3:1 contra el --bg-secondary de su tema (tokens.css)", () => {
    for (const [file, theme] of [
      ["logo-synapse-dark.svg", "dark"],
      ["logo-synapse-light.svg", "light"],
    ] as const) {
      for (const c of stopColors(read(file))) {
        expect(contrast(c, token(theme, "--bg-secondary")), `${file} ${c}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test("RF-001, RF-007: favicon.svg — paradas por defecto = light (≥ 3:1 vs #ffffff)", () => {
    const stops = stopColors(read("favicon.svg"));
    expect(stops).toEqual(paletteStops("light"));
    for (const c of stops) expect(contrast(c, "#ffffff"), c).toBeGreaterThanOrEqual(3);
  });

  test("RF-007: favicon.svg — la regla @media (prefers-color-scheme: dark) sobrevive a svgo con las paradas de favicon-dark (≥ 3:1 vs #202124)", () => {
    const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(read("favicon.svg"))?.[1] ?? "";
    expect(style).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
    // svgo agrupa los selectores con el mismo valor (`.b0,.f1{…}`): se compara el conjunto de colores, no su multiplicidad.
    expect([...new Set(hexColors(style))].sort()).toEqual([...new Set(paletteStops("favicon-dark"))]);
    for (const c of hexColors(style)) expect(contrast(c, "#202124"), c).toBeGreaterThanOrEqual(3);
  });

  // Art. 5: se sirven como imagen (nunca inline), pero se exige que no puedan ejecutar ni cargar nada.
  test.each(SVGS)("Art. 5: %s — sin script, foreignObject, manejadores on* ni referencias externas", (file) => {
    const svg = read(file);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/<foreignObject/i);
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
    expect(svg).not.toMatch(/href\s*=\s*["']?(https?:|\/\/|data:)/i);
    expect(svg).not.toMatch(/url\(\s*["']?(https?:|\/\/|data:)/i);
  });

  test.each(SVGS)("RNF-001: %s ≤ 10 KB con gzip -9 y ≤ 30 KB en bruto", (file) => {
    const buf = readFileSync(resolve(PUBLIC, file));
    expect(gzipSync(buf, { level: 9 }).length).toBeLessThanOrEqual(10 * 1024);
    expect(buf.length).toBeLessThanOrEqual(30 * 1024);
  });
});

// --- Rasters (ICO y PNG) --------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface PngInfo {
  width: number;
  height: number;
  colorType: number;
  chunks: string[];
}

/** Cabecera `IHDR` y lista de bloques de un PNG (sin decodificar píxeles). */
function pngInfo(buf: Buffer): PngInfo {
  expect(buf.subarray(0, 8).equals(PNG_SIGNATURE), "firma PNG").toBe(true);
  const chunks: string[] = [];
  for (let at = 8; at < buf.length; ) {
    chunks.push(buf.toString("ascii", at + 4, at + 8));
    at += 12 + buf.readUInt32BE(at);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25], chunks };
}

/** Un PNG es opaco si no tiene canal alfa (tipos 4 y 6) ni bloque `tRNS` (transparencia de paleta). */
const isOpaque = (info: PngInfo) => ![4, 6].includes(info.colorType) && !info.chunks.includes("tRNS");

const png = (name: string) => readFileSync(resolve(PUBLIC, name));

/**
 * Decodifica un PNG de 8 bits sin entrelazado, de paleta (tipo 3) o RGB (tipo 2), a RGB plano.
 * Lo justo para medir el maskable en vitest sin navegador (la prueba e2e A-2 lo mide además en Chromium).
 */
function decodeRgb(buf: Buffer): { width: number; height: number; rgb: number[] } {
  const { width, height, colorType } = pngInfo(buf);
  expect(buf[24], "8 bits por canal").toBe(8);
  expect(buf[28], "sin entrelazado").toBe(0);
  const idat: Buffer[] = [];
  let plte = Buffer.alloc(0);
  for (let at = 8; at < buf.length; ) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    if (type === "IDAT") idat.push(buf.subarray(at + 8, at + 8 + len));
    if (type === "PLTE") plte = buf.subarray(at + 8, at + 8 + len);
    at += 12 + len;
  }
  const bpp = colorType === 3 ? 1 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const rows: number[][] = [];
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1) + 0));
    const prev = rows[y - 1] ?? new Array(stride).fill(0);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      line[i] = (line[i] + predictor) & 255;
    }
    rows.push(line);
  }
  const rgb = rows.flatMap((line) => (colorType === 3 ? line.flatMap((idx) => [plte[idx * 3], plte[idx * 3 + 1], plte[idx * 3 + 2]]) : line));
  return { width, height, rgb };
}

describe("iconos raster", () => {
  test("RF-006: en el icono maskable toda la silueta cabe en el círculo central del 80 % (radio ≤ 204,8 px sobre 512)", () => {
    const { width, height, rgb } = decodeRgb(png("icons/icon-maskable-512.png"));
    expect([width, height]).toEqual([512, 512]);
    const bg = [rgb[0], rgb[1], rgb[2]]; // esquina: el fondo opaco de D-10 (#12121a, tras la cuantización)
    expect(bg.map((v, k) => Math.abs(v - [0x12, 0x12, 0x1a][k])).every((d) => d <= 4), "fondo ≈ #12121a").toBe(true);
    let maxRadius = 0;
    let painted = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        const diff = Math.abs(rgb[i] - bg[0]) + Math.abs(rgb[i + 1] - bg[1]) + Math.abs(rgb[i + 2] - bg[2]);
        if (diff > 12) {
          painted++;
          maxRadius = Math.max(maxRadius, Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2));
        }
      }
    }
    expect(painted, "la silueta existe").toBeGreaterThan(5_000);
    expect(maxRadius, `radio máximo ${maxRadius.toFixed(1)} px`).toBeLessThanOrEqual(0.4 * width);
  });

  test("RF-003: apple-touch-icon.png es de 180×180, opaco y sin transparencia", () => {
    const info = pngInfo(png("apple-touch-icon.png"));
    expect([info.width, info.height]).toEqual([180, 180]);
    expect(isOpaque(info)).toBe(true);
  });

  test.each([
    ["icons/icon-192.png", 192],
    ["icons/icon-512.png", 512],
    ["icons/icon-maskable-512.png", 512],
  ])("RF-004: %s es PNG cuadrado de %i px", (file, side) => {
    const info = pngInfo(png(file));
    expect([info.width, info.height]).toEqual([side, side]);
  });

  test("RF-004, RF-006: el icono maskable es opaco (sin alfa ni tRNS)", () => {
    expect(isOpaque(pngInfo(png("icons/icon-maskable-512.png")))).toBe(true);
  });

  test("RF-002: favicon.ico trae las entradas de 16, 32 y 48 px, cada una con carga útil PNG de ese tamaño", () => {
    const ico = png("favicon.ico");
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)], "reservado y tipo (1 = icono)").toEqual([0, 1]);
    const count = ico.readUInt16LE(4);
    const sizes: number[] = [];
    for (let i = 0; i < count; i++) {
      const entry = 6 + i * 16;
      const side = ico[entry] || 256; // 0 codifica 256
      const payload = ico.subarray(ico.readUInt32LE(entry + 12), ico.readUInt32LE(entry + 12) + ico.readUInt32LE(entry + 8));
      const info = pngInfo(payload);
      expect([info.width, info.height], `entrada ${side}`).toEqual([side, side]);
      sizes.push(side);
    }
    expect(sizes.sort((a, b) => a - b)).toEqual([16, 32, 48]);
  });

  // RNF-001 (PLAN-0011 §5.5)
  test.each([
    ["favicon.ico", 15],
    ["apple-touch-icon.png", 15],
    ["icons/icon-192.png", 15],
    ["icons/icon-512.png", 50],
    ["icons/icon-maskable-512.png", 50],
  ])("RNF-001: %s ≤ %i KB", (file, kb) => {
    expect(png(file).length).toBeLessThanOrEqual(kb * 1024);
  });
});

// --- Manifest e index.html ------------------------------------------------------------------

/** Atributos de cada `<link>` de index.html como objetos. */
function links(html: string): Array<Record<string, string>> {
  return [...html.matchAll(/<link\s+([^>]*?)\/?>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])));
}

describe("manifest e index.html", () => {
  const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

  test("RF-004: manifest.webmanifest es el JSON de PLAN-0011 §3, sin start_url, scope ni display (D-11)", () => {
    expect(JSON.parse(read("manifest.webmanifest"))).toEqual({
      name: "Synapse",
      short_name: "Synapse",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      theme_color: "#12121a",
      background_color: "#12121a",
    });
  });

  test("RF-004: cada icono declarado existe en public/ con las dimensiones que dice el manifest", () => {
    const manifest = JSON.parse(read("manifest.webmanifest")) as { icons: Array<{ src: string; sizes: string }> };
    for (const icon of manifest.icons) {
      const info = pngInfo(png(icon.src.replace(/^\//, "")));
      expect(`${info.width}x${info.height}`, icon.src).toBe(icon.sizes);
    }
  });

  test("RF-001…RF-004: index.html declara el ICO (32x32), el favicon SVG, el apple-touch-icon y el manifest", () => {
    const all = links(html);
    expect(all).toContainEqual({ rel: "icon", href: "/favicon.ico", sizes: "32x32" });
    expect(all).toContainEqual({ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" });
    expect(all).toContainEqual({ rel: "apple-touch-icon", href: "/apple-touch-icon.png" });
    expect(all).toContainEqual({ rel: "manifest", href: "/manifest.webmanifest" });
  });

  test("RNF-001: el conjunto de iconos y manifest pesa ≤ 150 KB en bruto", () => {
    const files = ["favicon.svg", "favicon.ico", "apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "manifest.webmanifest"];
    expect(files.reduce((sum, f) => sum + png(f).length, 0)).toBeLessThanOrEqual(150 * 1024);
  });
});
