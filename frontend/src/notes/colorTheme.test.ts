// H-036: el tema de color del cliente da los mismos colores que el servidor (casos compartidos con `backend/tests/fixtures/tema_colores.json`).
import { describe, expect, it } from "vitest";
import spec from "../../../backend/tests/fixtures/tema_colores.json";
import { hexToOklch, mix, oklchToHex, palette, rotate, tone400, tone600, type ThemeColors } from "./colorTheme";

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const close = (a: string, b: string) => channels(a).every((v, i) => Math.abs(v - channels(b)[i]) <= 1);

describe("colorTheme (compartido con el servidor)", () => {
  for (const item of spec.casos) {
    it(`${item.primario} con texto ${item.texto}`, () => {
      const got = palette(item.primario, item.texto) as unknown as Record<string, string>;
      const expected = item.esperado as Record<string, string>;
      for (const key of Object.keys(expected)) expect(close(got[key], expected[key]), `${key}: ${got[key]} vs ${expected[key]}`).toBe(true);
      expect(Object.keys(got).sort()).toEqual(Object.keys(expected).sort());
    });
  }
});

describe("piezas", () => {
  it("OKLCH ida y vuelta conserva el color", () => {
    for (const hex of ["#0c3897", "#f99a4b", "#facc15", "#6b7280"]) expect(close(oklchToHex(...hexToOklch(hex)), hex)).toBe(true);
  });
  it("el secundario es el primario girado 30° y el terciario otros 30°", () => {
    const [, , hue] = hexToOklch("#0891b2");
    const wrap = (value: number) => ((value % 360) + 360) % 360;
    expect(Math.abs(hexToOklch(rotate("#0891b2"))[2] - wrap(hue + 30))).toBeLessThan(1.5);
    expect(Math.abs(hexToOklch(rotate(rotate("#0891b2")))[2] - wrap(hue + 60))).toBeLessThan(1.5);
  });
  it("un primario ya oscuro queda como está en 600; el 400 lo aclara a 0,72 como mínimo", () => {
    expect(close(tone600("#0c3897"), "#0c3897")).toBe(true);
    expect(hexToOklch(tone400("#0c3897"))[0]).toBeGreaterThanOrEqual(0.71);
    expect(hexToOklch(tone600("#facc15"))[0]).toBeLessThanOrEqual(0.63);
  });
  it("mezcla en sRGB como color-mix", () => {
    expect(mix("#ff0000", "#0000ff", 60)).toBe("#990066");
    expect(mix("#000000", "#ffffff", 10)).toBe("#e6e6e6");
  });
  it("la paleta trae los colores de cada elemento", () => {
    const colors: ThemeColors = palette("#0891b2", "#1f2937");
    expect(Object.keys(colors)).toContain("tabla_cabecera_fondo");
  });
});
