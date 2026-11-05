/**
 * H-041 E2: el espejo de los nombres canónicos debe pasar TODOS los casos de la especificación compartida
 * `backend/tests/fixtures/nombres_reglas.json` (el servidor la recorre en `test_h041_names.py`).
 */
import { describe, expect, it } from "vitest";
import spec from "../../../backend/tests/fixtures/nombres_reglas.json";
import { SKILL_BASE_MAX, SKILL_PREFIX, canonicalBase, canonicalPath, isCanonical } from "./docNames";
import { PLANTILLA_NAME_MAX, TEMPLATE_PREFIX } from "./metaRules";

const strip = (raw: string) => (raw.toLowerCase().endsWith(".md") ? raw.slice(0, -3) : raw);

describe("nombres_reglas.json (compartido con el servidor)", () => {
  it("los límites son los de la especificación", () => {
    expect(spec.limits).toEqual({ skill_base_max: SKILL_BASE_MAX, plantilla_rest_max: PLANTILLA_NAME_MAX });
  });
  it.each(spec.names)("nombre: $raw", (c) => {
    expect(canonicalBase(strip(c.raw), SKILL_PREFIX, SKILL_BASE_MAX - SKILL_PREFIX.length)).toBe(c.skill);
    expect(canonicalBase(strip(c.raw), TEMPLATE_PREFIX, PLANTILLA_NAME_MAX)).toBe(c.plantilla);
  });
  it.each(spec.paths)("ruta: $path", (c) => {
    expect(canonicalPath(c.path)).toEqual([c.expected, c.error]);
  });
  it.each(spec.canonical)("canónica: $path", (c) => {
    expect(isCanonical(c.path)).toBe(c.expected);
  });
});
