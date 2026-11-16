import { describe, expect, it } from "vitest";
import { parseImageSize } from "./imageSize";

describe("parseImageSize", () => {
  it("sin marcas deja la descripción tal cual", () => {
    expect(parseImageSize("una foto")).toEqual({ alt: "una foto", widthPct: null, heightPx: null });
    expect(parseImageSize("")).toEqual({ alt: "", widthPct: null, heightPx: null });
  });

  it("lee el ancho en porcentaje y el alto en píxeles, juntos y en cualquier orden", () => {
    expect(parseImageSize("foto|50%")).toEqual({ alt: "foto", widthPct: 50, heightPx: null });
    expect(parseImageSize("foto|alto:300")).toEqual({ alt: "foto", widthPct: null, heightPx: 300 });
    expect(parseImageSize("foto|50%|alto:300")).toEqual({ alt: "foto", widthPct: 50, heightPx: 300 });
    expect(parseImageSize("foto|alto:300|50%")).toEqual({ alt: "foto", widthPct: 50, heightPx: 300 });
  });

  it("una marca fuera de rango o repetida no vale y se queda en la descripción", () => {
    expect(parseImageSize("foto|0%")).toEqual({ alt: "foto|0%", widthPct: null, heightPx: null });
    expect(parseImageSize("foto|101%")).toEqual({ alt: "foto|101%", widthPct: null, heightPx: null });
    expect(parseImageSize("foto|alto:10")).toEqual({ alt: "foto|alto:10", widthPct: null, heightPx: null });
    expect(parseImageSize("foto|alto:9999")).toEqual({ alt: "foto|alto:9999", widthPct: null, heightPx: null });
    expect(parseImageSize("foto|50%|60%")).toEqual({ alt: "foto|50%", widthPct: 60, heightPx: null });
    expect(parseImageSize("foto|ancho:50")).toEqual({ alt: "foto|ancho:50", widthPct: null, heightPx: null });
  });

  it("una barra dentro de la descripción se conserva y la descripción nunca queda en las marcas", () => {
    expect(parseImageSize("a|b|50%")).toEqual({ alt: "a|b", widthPct: 50, heightPx: null });
    expect(parseImageSize("50%")).toEqual({ alt: "50%", widthPct: null, heightPx: null });
  });
});
