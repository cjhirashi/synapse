// Reglas espejo (SPEC-0005 RF-005, RF-015; PLAN-0005 §5): la misma batería que
// `backend/tests/test_sync_rules_mirror.py` fija contra `core/schemas.py`.
import cases from "../../../backend/tests/fixtures/vault_rules_cases.json";
import { checkIcon, FIELD_RULES, ICON_MAX, type VaultField, nameKey, validateVault } from "./vaultRules";

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

// SPEC-0009 RF-012: `icon` es opcional y anulable; sus 22 casos de la batería común pasan por `FIELD_RULES.icon`
// (arriba, con el resto) y estas pruebas fijan la forma de la API y su lugar en `validateVault`.
describe("RF-012: icon", () => {
  it("checkIcon es la regla registrada y admite hasta 64 caracteres", () => {
    expect(ICON_MAX).toBe(64);
    expect(FIELD_RULES.icon).toBe(checkIcon);
    expect(checkIcon("a".repeat(64)).ok).toBe(true);
    expect(checkIcon("a".repeat(65)).ok).toBe(false);
  });

  it("no normaliza: un espacio o una mayúscula es inválido, no «sin normalizar»", () => {
    expect(checkIcon(" folder").ok).toBe(false);
    expect(checkIcon("Folder").ok).toBe(false);
    expect(checkIcon(null)).toEqual({ ok: true, value: null });
  });

  it("valida la gramática, no un catálogo: javascript:x es válido y javascript:alert(1) no", () => {
    expect(checkIcon("javascript:x").ok).toBe(true);
    expect(checkIcon("javascript:alert(1)").ok).toBe(false);
    expect(checkIcon(1).ok).toBe(false);
  });

  it("validateVault acepta icon válido o null y lo devuelve; sin la clave no lo añade", () => {
    const base = { name: "Notas", description: null, tags: [] };
    expect(validateVault({ ...base, icon: "star:success" })).toEqual({ ok: true, value: { ...base, icon: "star:success" } });
    expect(validateVault({ ...base, icon: null })).toEqual({ ok: true, value: { ...base, icon: null } });
    expect(validateVault(base)).toEqual({ ok: true, value: base });
  });

  it("validateVault rechaza icon inválido y lo enumera al final de los campos", () => {
    expect(validateVault({ name: "", description: null, tags: [], icon: "Folder" })).toEqual({ ok: false, fields: ["name", "icon"] });
    expect(validateVault({ name: "Notas", description: null, tags: [], icon: "a_b" })).toEqual({ ok: false, fields: ["icon"] });
  });
});
