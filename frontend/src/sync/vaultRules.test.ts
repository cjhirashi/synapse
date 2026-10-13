// Reglas espejo (SPEC-0005 RF-005, RF-015; PLAN-0005 §5): la misma batería que
// `backend/tests/test_sync_rules_mirror.py` fija contra `core/schemas.py`.
import cases from "../../../backend/tests/fixtures/vault_rules_cases.json";
import { FIELD_RULES, type VaultField, nameKey, validateVault } from "./vaultRules";

interface FieldCase {
  field: VaultField;
  input: unknown;
  valid: boolean;
  normalized?: unknown;
}

const fieldCases = cases.fields as FieldCase[];

describe("RF-005: cada caso de la batería da el mismo veredicto que el servidor", () => {
  it.each(fieldCases.map((c) => [`${c.field}: ${JSON.stringify(c.input).slice(0, 40)}`, c]))("%s", (_label, c) => {
    const result = FIELD_RULES[c.field](c.input);
    expect(result.ok).toBe(c.valid);
    if (result.ok) expect(result.value).toEqual(c.normalized);
  });
});

describe("RF-015: nameKey coincide con NFKC + casefold del servidor", () => {
  it.each(cases.name_keys.map((c) => [c.name.slice(0, 20), c]))("%s", (_label, c) => {
    expect(nameKey(c.name)).toBe(c.key);
  });

  it("une los nombres que una persona lee como iguales", () => {
    expect(nameKey("Straße")).toBe(nameKey("STRASSE"));
    expect(nameKey("ＮＯＴＡＳ")).toBe(nameKey("notas"));
    expect(nameKey("é")).toBe(nameKey("é"));
  });
});

describe("validateVault", () => {
  it("devuelve los campos normalizados cuando todo es válido", () => {
    expect(validateVault({ name: "  Notas ", description: null, tags: ["A", "a", " B "] })).toEqual({
      ok: true,
      value: { name: "Notas", description: null, tags: ["a", "b"] },
    });
  });

  it("enumera todos los campos inválidos, en orden", () => {
    expect(validateVault({ name: "", description: "x".repeat(2001), tags: Array(21).fill("a") })).toEqual({
      ok: false,
      fields: ["name", "description", "tags"],
    });
  });
});
