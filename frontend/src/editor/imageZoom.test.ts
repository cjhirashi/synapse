import { describe, expect, it } from "vitest";
import { IDENTITY, MAX_SCALE, clampScale, clampView, percent, pinch, zoomAt } from "./imageZoom";

const bounds = { w: 400, h: 300, vw: 400, vh: 800 };

describe("imageZoom", () => {
  it("la escala se limita entre 1 y 8", () => {
    expect(clampScale(0.2)).toBe(1);
    expect(clampScale(3)).toBe(3);
    expect(clampScale(50)).toBe(MAX_SCALE);
  });

  it("a escala 1 no hay desplazamiento posible; ampliada, solo lo que la imagen cubre de más", () => {
    expect(clampView({ scale: 1, x: 90, y: -40 }, bounds)).toEqual({ scale: 1, x: 0, y: 0 });
    // Ancho: 400 × 2 = 800 contra 400 visibles → ±200. Alto: 300 × 2 = 600 contra 800 → nada que desplazar.
    expect(clampView({ scale: 2, x: 500, y: 90 }, bounds)).toEqual({ scale: 2, x: 200, y: 0 });
    expect(clampView({ scale: 2, x: -500, y: 0 }, bounds)).toEqual({ scale: 2, x: -200, y: 0 });
  });

  it("zoomAt deja fijo el punto de la imagen bajo el cursor", () => {
    // Punto a 100 px a la derecha del centro; al pasar de 1 a 2 la imagen se corre 100 px a la izquierda para que ese punto no se mueva.
    expect(zoomAt(IDENTITY, 2, 100, 0, bounds)).toEqual({ scale: 2, x: -100, y: 0 });
    // Con el centro como punto fijo, el desplazamiento sigue en 0.
    expect(zoomAt(IDENTITY, 2, 0, 0, bounds)).toEqual({ scale: 2, x: 0, y: 0 });
  });

  it("zoomAt no pasa del máximo ni del mínimo", () => {
    expect(zoomAt(IDENTITY, 100, 0, 0, bounds).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: 2, x: 0, y: 0 }, 0.1, 0, 0, bounds)).toEqual(IDENTITY);
  });

  it("pellizco: la escala sigue a la distancia y el punto medio se lleva la imagen", () => {
    const mid = { x: 50, y: 0 };
    // Dedos al doble de distancia, mismo punto medio: escala 2 y el punto bajo los dedos no se mueve.
    expect(pinch(IDENTITY, mid, 100, mid, 200, bounds)).toEqual({ scale: 2, x: -50, y: 0 });
    // Los dedos se mueven 20 px a la derecha manteniendo la distancia: la imagen los acompaña.
    expect(pinch({ scale: 2, x: 0, y: 0 }, mid, 100, { x: 70, y: 0 }, 100, bounds)).toEqual({ scale: 2, x: 20, y: 0 });
    // Pellizco hacia adentro por debajo de 1 queda en 1.
    expect(pinch(IDENTITY, mid, 200, mid, 50, bounds)).toEqual(IDENTITY);
  });

  it("el porcentaje se redondea y lleva espacio antes del signo", () => {
    expect(percent(1)).toBe("100 %");
    expect(percent(1.5)).toBe("150 %");
    expect(percent(2.5)).toBe("250 %");
    expect(percent(1.5 * 1.5)).toBe("225 %");
  });
});
