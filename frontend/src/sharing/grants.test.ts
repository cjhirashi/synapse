import { expect, test } from "vitest";
import { grantsText, roleOf } from "./grants";
import type { Grant } from "./sharingApi";

test("grantsText con una concesión de lectura en toda la bóveda", () => {
  expect(grantsText([{ folder: "*", level: "lectura" }])).toBe("Lectura en toda la bóveda");
});

test("grantsText con una concesión de escritura en toda la bóveda", () => {
  expect(grantsText([{ folder: "*", level: "escritura" }])).toBe("Escritura en toda la bóveda");
});

test("grantsText con concesiones mixtas", () => {
  const grants: Grant[] = [
    { folder: "Docs/Sub", level: "escritura" },
    { folder: "Notas", level: "escritura" },
    { folder: "Pub", level: "lectura" },
  ];
  expect(grantsText(grants)).toBe("Escritura en Docs/Sub y Notas · Lectura en Pub");
});

test("grantsText con lista vacía", () => {
  expect(grantsText([])).toBe("Sin permisos");
});

test("grantsText con tres carpetas de escritura", () => {
  const grants: Grant[] = [
    { folder: "A", level: "escritura" },
    { folder: "B", level: "escritura" },
    { folder: "C", level: "escritura" },
  ];
  expect(grantsText(grants)).toBe("Escritura en A, B y C");
});

test("roleOf retorna 'lector' para una concesión * lectura", () => {
  expect(roleOf([{ folder: "*", level: "lectura" }])).toBe("lector");
});

test("roleOf retorna 'editor' para una concesión * escritura", () => {
  expect(roleOf([{ folder: "*", level: "escritura" }])).toBe("editor");
});

test("roleOf retorna 'personalizado' para más de una concesión", () => {
  const grants: Grant[] = [
    { folder: "*", level: "lectura" },
    { folder: "Docs", level: "escritura" },
  ];
  expect(roleOf(grants)).toBe("personalizado");
});

test("roleOf retorna 'personalizado' para una concesión en carpeta", () => {
  expect(roleOf([{ folder: "Docs", level: "lectura" }])).toBe("personalizado");
});
