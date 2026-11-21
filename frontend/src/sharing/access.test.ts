import { describe, expect, it } from "vitest";
import parity from "./accessParity.json";
import { canWritePath, hasWriteGrant, levelOf, type Level } from "./access";
import type { Grant } from "./sharingApi";

type Case = { grants: Grant[]; path: string; level: Level | null };

describe("levelOf es el mismo motor que el del servidor", () => {
  const cases = (parity as { cases: Case[] }).cases;

  it("el archivo de paridad cubre todos los resultados y los nombres difíciles", () => {
    expect(new Set(cases.map((c) => c.level))).toEqual(new Set(["escritura", "lectura", null]));
    expect(cases.length).toBeGreaterThan(200);
  });

  it.each(cases.map((c, i) => [i, JSON.stringify(c.grants), c.path, c.level] as const))("caso %i: %s sobre «%s» → %s", (i) => {
    const { grants, path, level } = cases[i];
    expect(levelOf(grants, path)).toBe(level);
  });
});

describe("ayudas", () => {
  const mixed: Grant[] = [{ folder: "Pub", level: "lectura" }, { folder: "Docs", level: "escritura" }];

  it("escribe solo donde hay escritura; leer no basta", () => {
    expect(canWritePath(mixed, "Docs/a.md")).toBe(true);
    expect(canWritePath(mixed, "Pub/a.md")).toBe(false);
    expect(canWritePath(mixed, "Otra/a.md")).toBe(false);
  });

  it("ninguna concesión abre las zonas del sistema, ni siquiera `*` con escritura", () => {
    const all: Grant[] = [{ folder: "*", level: "escritura" }];
    for (const path of ["BITACORA/x.md", "AG - AGENTES/x.md", "AG - SKILLS/x.md", "AG - MENSAJES/x.md", "PLANTILLAS/x.md"]) expect(canWritePath(all, path)).toBe(false);
  });

  it("hasWriteGrant", () => {
    expect(hasWriteGrant(mixed)).toBe(true);
    expect(hasWriteGrant([{ folder: "*", level: "lectura" }])).toBe(false);
    expect(hasWriteGrant([])).toBe(false);
  });
});
