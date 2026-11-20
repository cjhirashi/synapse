import { expect, test } from "vitest";
import { folderOptions } from "./folderOptions";

test("ancestros únicos incluidos", () => {
  const result = folderOptions(["Docs/Sub/nota.md", "Docs/Sub/otra.md"]);
  expect(result).toEqual(["Docs", "Docs/Sub"]);
});

test("orden alfabético", () => {
  const result = folderOptions(["Z/nota.md", "A/nota.md", "B/nota.md"]);
  expect(result).toEqual(["A", "B", "Z"]);
});

test("carpetas reservadas excluidas", () => {
  const result = folderOptions(["AG - SKILLS/skill.md", "PLANTILLAS/plantilla.md", "Docs/nota.md"]);
  expect(result).toEqual(["Docs"]);
});

test("subcarpetas de reservadas excluidas", () => {
  const result = folderOptions(["AG - SKILLS/Sub/skill.md", "Docs/nota.md"]);
  expect(result).toEqual(["Docs"]);
});

test("nota en la raíz no aporta nada", () => {
  const result = folderOptions(["nota.md"]);
  expect(result).toEqual([]);
});

test("lista vacía", () => {
  const result = folderOptions([]);
  expect(result).toEqual([]);
});

test("mix de reservadas y normales", () => {
  const result = folderOptions([
    "BITACORA/entrada.md",
    "Docs/Sub/nota.md",
    "AG - MENSAJES/conversacion/mensaje.md",
    "Proyectos/nota.md",
  ]);
  expect(result).toEqual(["Docs", "Docs/Sub", "Proyectos"]);
});
