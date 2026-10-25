// Recorre TODO el contrato interno `contracts/frontmatter-yaml.cases.json` (SPEC-0010 §3, RF-014…RF-018,
// RF-044, RF-045; PLAN-0010 §2.1, §4) contra `editor/frontmatter.ts`: separación del bloque YAML,
// composición del texto de la vista Código, parseo (valor o error+línea), ida y vuelta (stringify→parse)
// y clasificación de notas heredadas. El objeto JSON es la única verdad (D1); el YAML es derivado.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyLegacy, composeCode, parseFrontmatterYaml, splitFrontmatter, stringifyFrontmatter } from "./frontmatter";

interface Cases {
  split: Array<{ text: string; yaml: string | null; body: string }>;
  compose: Array<{ frontmatter: Record<string, unknown>; body: string; text: string }>;
  parse: Array<{ yaml: string; value?: unknown; error?: string; line?: number }>;
  roundtrip: Array<Record<string, unknown>>;
  legacy: Array<{ frontmatter: Record<string, unknown>; content: string; kind: string }>;
}

// La prueba corre con cwd = `frontend/`; el contrato vive un nivel arriba, en `.harness/`.
const cases = JSON.parse(readFileSync("../.harness/specs/0010-contenido-markdown-completo/contracts/frontmatter-yaml.cases.json", "utf8")) as Cases;

describe("frontmatter · split (RF-015)", () => {
  for (const [i, c] of cases.split.entries()) {
    it(`caso ${i}: ${JSON.stringify(c.text).slice(0, 40)}`, () => {
      expect(splitFrontmatter(c.text)).toEqual({ yaml: c.yaml, body: c.body });
    });
  }
});

describe("frontmatter · compose (RF-014)", () => {
  for (const [i, c] of cases.compose.entries()) {
    it(`caso ${i}`, () => {
      expect(composeCode(c.frontmatter, c.body)).toBe(c.text);
    });
  }
});

describe("frontmatter · parse (RF-016…RF-018)", () => {
  for (const [i, c] of cases.parse.entries()) {
    it(`caso ${i}: ${JSON.stringify(c.yaml).slice(0, 40)}`, () => {
      const result = parseFrontmatterYaml(c.yaml);
      if (c.error !== undefined) {
        expect(result).toHaveProperty("error", c.error);
        if (c.line !== undefined) expect(result).toHaveProperty("line", c.line);
      } else {
        expect(result).toEqual({ value: c.value });
      }
    });
  }
});

describe("frontmatter · roundtrip (RF-016)", () => {
  for (const [i, obj] of cases.roundtrip.entries()) {
    it(`caso ${i}: ${JSON.stringify(obj).slice(0, 40)}`, () => {
      expect(parseFrontmatterYaml(stringifyFrontmatter(obj))).toEqual({ value: obj });
    });
  }
});

describe("frontmatter · legacy (RF-044, RF-045)", () => {
  for (const [i, c] of cases.legacy.entries()) {
    it(`caso ${i}: ${c.kind}`, () => {
      expect(classifyLegacy(c.frontmatter, c.content)).toBe(c.kind);
    });
  }
});
