// SPEC-0010 RF-054, RF-063 (P-17): migas de la nota abierta y truncado por segmento (módulo puro).
import { describe, expect, it } from "vitest";
import { crumbs, fit } from "./breadcrumb";

describe("crumbs", () => {
  // RF-054
  it("separa las carpetas (con su ruta completa) y el nombre sin `.md`", () => {
    expect(crumbs("Proyectos/Clientes/Plan de entregas.md")).toEqual({
      folders: [
        { name: "Proyectos", path: "Proyectos" },
        { name: "Clientes", path: "Proyectos/Clientes" },
      ],
      name: "Plan de entregas",
    });
  });

  // RF-054
  it("una nota en la raíz sólo tiene nombre", () => {
    expect(crumbs("Nota.MD")).toEqual({ folders: [], name: "Nota" });
  });

  // RF-054
  it("si sin la extensión no queda nada, el nombre es el segmento completo", () => {
    expect(crumbs("A/.md").name).toBe(".md");
  });
});

describe("fit", () => {
  const OPTIONS = { separator: 10, min: 24, nameMin: 48 };
  const total = (widths: number[]) => widths.reduce((sum, w) => sum + w, 0) + OPTIONS.separator * (widths.length - 1);

  // RF-063
  it("si todo cabe, cada segmento conserva su ancho natural", () => {
    expect(fit([60, 80, 100], 400, OPTIONS)).toEqual([60, 80, 100]);
  });

  // RF-063
  it("si no cabe, recorta las carpetas por igual y respeta el nombre", () => {
    const widths = fit([100, 100, 100, 200], 400, OPTIONS);
    expect(widths[3]).toBe(200);
    expect(widths[0]).toBeCloseTo(widths[1]);
    expect(widths[1]).toBeCloseTo(widths[2]);
    expect(total(widths)).toBeCloseTo(400);
    for (const [i, w] of widths.entries()) expect(w).toBeLessThanOrEqual([100, 100, 100, 200][i]);
  });

  // RF-063
  it("una carpeta corta no se recorta mientras las largas absorben el exceso", () => {
    const widths = fit([30, 300, 300, 100], 400, OPTIONS);
    expect(widths[0]).toBe(30);
    expect(widths[3]).toBe(100);
    expect(total(widths)).toBeCloseTo(400);
    expect(widths[1]).toBeCloseTo(widths[2]);
  });

  // RF-063
  it("la primera carpeta y el nombre nunca desaparecen, aunque no quepan", () => {
    const widths = fit([100, 100, 100, 100, 100], 60, OPTIONS);
    expect(widths[0]).toBeGreaterThanOrEqual(OPTIONS.min);
    expect(widths[4]).toBeGreaterThanOrEqual(OPTIONS.nameMin);
  });

  // RF-063
  it("si el nombre no alcanza su mínimo se ocultan primero las carpetas intermedias y al final la última", () => {
    // 4 carpetas + nombre en 150 px: con todas en su mínimo al nombre le quedan 150-40-96 = 14 < 48: se oculta la
    // segunda carpeta (intermedia) y ya le quedan 150-30-72 = 48.
    const widths = fit([100, 100, 100, 100, 100], 150, OPTIONS);
    expect(widths).toEqual([OPTIONS.min, 0, OPTIONS.min, OPTIONS.min, 150 - 3 * OPTIONS.separator - 3 * OPTIONS.min]);
    // Aún más estrecho: también se oculta la última carpeta.
    const narrower = fit([100, 100, 100, 100, 100], 90, OPTIONS);
    expect(narrower[0]).toBe(OPTIONS.min);
    expect(narrower.slice(1, 4)).toEqual([0, 0, 0]);
    expect(narrower[4]).toBeGreaterThanOrEqual(OPTIONS.nameMin);
  });

  // RF-063
  it("con poco espacio las carpetas bajan al mínimo y el nombre toma lo que queda", () => {
    const widths = fit([100, 100, 300], 200, OPTIONS);
    expect(widths[0]).toBe(OPTIONS.min);
    expect(widths[1]).toBe(OPTIONS.min);
    expect(widths[2]).toBe(200 - 2 * OPTIONS.separator - 2 * OPTIONS.min);
  });

  // RF-063
  it("una nota en la raíz recorta sólo el nombre", () => {
    expect(fit([500], 200, OPTIONS)).toEqual([200]);
    expect(fit([20], 200, OPTIONS)).toEqual([20]);
  });

  // RF-063
  it("sin ancho disponible (aún sin medir) devuelve los naturales", () => {
    expect(fit([60, 80], 0, OPTIONS)).toEqual([60, 80]);
  });
});
