import { describe, it, expect } from "vitest";
import spec from "../../../backend/tests/fixtures/attribute_rules.json";
import {
  TITULO_MAX,
  DESCRIPCION_MAX,
  TAGS_MAX,
  TAG_MAX_LEN,
  ESTADO_MAX_LEN,
  ESTADOS_ESTANDAR,
  RESERVED_KEYS,
  ESTADO_SYNONYMS,
  normalizeKey,
  normalizeTag,
  normalizeEstado,
  legacyEstado,
  normalizeDate,
  validateGeneral,
  migrateFrontmatterDetailed,
  migrateFrontmatter,
} from "./attributeRules";

describe("attributeRules", () => {
  describe("constantes", () => {
    it("TITULO_MAX", () => {
      expect(TITULO_MAX).toBe(spec.limits.titulo_max);
    });
    it("DESCRIPCION_MAX", () => {
      expect(DESCRIPCION_MAX).toBe(spec.limits.descripcion_max);
    });
    it("TAGS_MAX", () => {
      expect(TAGS_MAX).toBe(spec.limits.tags_max);
    });
    it("TAG_MAX_LEN", () => {
      expect(TAG_MAX_LEN).toBe(spec.limits.tag_max_len);
    });
    it("ESTADO_MAX_LEN", () => {
      expect(ESTADO_MAX_LEN).toBe(spec.limits.estado_max_len);
    });
    it("ESTADOS_ESTANDAR", () => {
      expect([...ESTADOS_ESTANDAR]).toEqual(spec.estados_estandar);
    });
    it("RESERVED_KEYS", () => {
      expect([...RESERVED_KEYS]).toEqual(spec.reserved_keys);
    });
    it("ESTADO_SYNONYMS", () => {
      expect(ESTADO_SYNONYMS).toEqual(spec.legacy_estado.table);
    });
  });

  describe("normalize_key", () => {
    it.each(spec.normalize_key.cases as Array<[unknown, unknown]>)("normalizeKey(%s) === %s", (input, expected) => {
      expect(normalizeKey(input as string)).toBe(expected);
    });
  });

  describe("normalize_tag", () => {
    it.each(spec.normalize_tag.cases as Array<[unknown, unknown]>)("normalizeTag(%s) === %s", (input, expected) => {
      expect(normalizeTag(input as string)).toBe(expected);
    });
  });

  describe("normalize_estado", () => {
    it.each(spec.normalize_estado.cases as Array<[unknown, unknown]>)("normalizeEstado(%s) === %s", (input, expected) => {
      expect(normalizeEstado(input)).toBe(expected);
    });
  });

  describe("legacy_estado", () => {
    it.each(spec.legacy_estado.cases as Array<[unknown, unknown]>)("legacyEstado(%s) === %s", (input, expected) => {
      expect(legacyEstado(input)).toBe(expected);
    });
  });

  describe("normalize_date", () => {
    it.each(spec.normalize_date.cases as Array<[unknown, unknown]>)("normalizeDate(%s) === %s", (input, expected) => {
      expect(normalizeDate(input)).toBe(expected);
    });
  });

  describe("validate_general", () => {
    it.each(spec.validate_general.cases as Array<[unknown, unknown]>)("validateGeneral(%O) === %s", (input, expected) => {
      expect(validateGeneral(input as Record<string, unknown>)).toBe(expected);
    });
  });

  describe("migrate_frontmatter", () => {
    for (const testCase of spec.migrate_frontmatter.cases) {
      it(testCase.name, () => {
        const [out, dropped] = migrateFrontmatterDetailed(testCase.in);
        expect(out).toEqual(testCase.out);
        const droppedKeys = dropped.map((d) => d.key);
        const expectedDropped = testCase.dropped || [];
        expect(droppedKeys).toEqual(expectedDropped);
        if (testCase.out_order) {
          expect(Object.keys(out)).toEqual(testCase.out_order);
        }
      });
    }
  });

  describe("idempotencia", () => {
    it("migrar la salida no la cambia", () => {
      const testCases = spec.migrate_frontmatter.cases.filter((c: {out?: unknown}) => c.out);
      for (const testCase of testCases) {
        const [out1] = migrateFrontmatterDetailed(testCase.in);
        const [out2] = migrateFrontmatterDetailed(out1 as Record<string, unknown>);
        expect(out2).toEqual(out1);
      }
    });
  });
});
