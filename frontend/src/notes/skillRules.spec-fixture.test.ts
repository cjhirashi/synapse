/**
 * H-041 E3: el espejo de la forma de una skill debe pasar TODOS los casos de la especificación compartida
 * `backend/tests/fixtures/skills_reglas.json` (el servidor la recorre en `test_h041_skills.py`).
 */
import { describe, expect, it } from "vitest";
import spec from "../../../backend/tests/fixtures/skills_reglas.json";
import { checkShape, isSkillPath, managersOf } from "./skillRules";

describe("skills_reglas.json (compartido con el servidor)", () => {
  it.each(spec.paths)("¿es una skill? $path", (c) => {
    expect(isSkillPath(c.path)).toBe(c.expected);
  });
  it.each(spec.shape.map((c) => ({ ...c, label: JSON.stringify(c.frontmatter).slice(0, 60) })))("forma: $label", (c) => {
    expect(checkShape(c.frontmatter as Record<string, unknown>)).toBe(c.expected);
  });
});

describe("managersOf", () => {
  const note = (path: string, estado?: string, deleted: string | null = null) => ({ path, deleted_at: deleted, frontmatter: estado ? { estado } : {} });
  it("lista los gestores activos por orden alfabético y descarta el resto", () => {
    expect(
      managersOf([
        note("AG - AGENTES/emma.md", "activo"), note("AG - AGENTES/aira.md", "activo"), note("AG - AGENTES/paused.md", "suspendido"),
        note("AG - AGENTES/borrada.md", "activo", "2026-11-05T00:00:00Z"), note("AG - AGENTES/INDICE.md", "activo"),
        note("AG - AGENTES/sub/x.md", "activo"), note("Otra/zeta.md", "activo"),
      ]),
    ).toEqual(["aira", "emma"]);
  });
});
