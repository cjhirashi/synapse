import { expect, test } from "vitest";
import { placeMenu } from "./menuPlacement";

const viewport = { width: 1000, height: 600 };
const menu = { width: 160, height: 80 };

test("con espacio debajo, el menú se abre bajo el botón y alineado a su derecha", () => {
  expect(placeMenu({ top: 100, bottom: 120, right: 900 }, menu, viewport)).toEqual({ top: 124, right: 100 });
});

test("al final de la ventana, el menú se abre encima del botón (no se sale por abajo)", () => {
  expect(placeMenu({ top: 560, bottom: 580, right: 900 }, menu, viewport)).toEqual({ top: 476, right: 100 });
});

test("si no cabe ni arriba ni abajo, se pega al borde de la ventana", () => {
  expect(placeMenu({ top: 20, bottom: 40, right: 900 }, menu, { width: 1000, height: 100 })).toEqual({ top: 12, right: 100 });
});

test("un botón en el borde izquierdo no empuja el menú fuera de la ventana", () => {
  expect(placeMenu({ top: 100, bottom: 120, right: 30 }, menu, viewport).right).toBe(1000 - 160 - 8);
});
