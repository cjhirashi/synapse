import { describe, it, expect } from "vitest";
import { localDateISO, stampDates } from "./metaDates";

describe("metaDates", () => {
  describe("localDateISO", () => {
    it("convierte una fecha a AAAA-MM-DD usando componentes locales", () => {
      const date = new Date(2026, 10, 15); // Noviembre (mes 10 en JS)
      expect(localDateISO(date)).toBe("2026-11-15");
    });

    it("maneja 31 de diciembre a las 23:59", () => {
      const date = new Date(2025, 11, 31, 23, 59, 59);
      expect(localDateISO(date)).toBe("2025-12-31");
    });

    it("maneja 1 de enero a las 00:01", () => {
      const date = new Date(2026, 0, 1, 0, 1, 0);
      expect(localDateISO(date)).toBe("2026-01-01");
    });

    it("rellena con ceros los meses y días menores de 10", () => {
      const date = new Date(2026, 0, 5); // Enero 5
      expect(localDateISO(date)).toBe("2026-01-05");
    });
  });

  describe("stampDates", () => {
    it("añade fecha_actualizacion a un frontmatter vacío", () => {
      const result = stampDates({}, { today: "2026-11-03" });
      expect(result.fecha_actualizacion).toBe("2026-11-03");
      expect(result.fecha_creacion).toBe("2026-11-03");
    });

    it("conserva fecha_creacion válida y actualiza fecha_actualizacion", () => {
      const result = stampDates(
        { titulo: "Test", fecha_creacion: "2026-01-01", fecha_actualizacion: "2026-01-02" },
        { today: "2026-11-03" }
      );
      expect(result.fecha_creacion).toBe("2026-01-01");
      expect(result.fecha_actualizacion).toBe("2026-11-03");
      expect(result.titulo).toBe("Test");
    });

    it("usa createdAtISO si fecha_creacion está inválida", () => {
      const result = stampDates(
        { fecha_creacion: "invalid", fecha_actualizacion: "2026-01-02" },
        { today: "2026-11-03", createdAtISO: "2026-06-15T10:30:00Z" }
      );
      expect(result.fecha_creacion).toBe("2026-06-15");
      expect(result.fecha_actualizacion).toBe("2026-11-03");
    });

    it("usa today si fecha_creacion falta y createdAtISO no es válido", () => {
      const result = stampDates({}, { today: "2026-11-03", createdAtISO: "invalid" });
      expect(result.fecha_creacion).toBe("2026-11-03");
      expect(result.fecha_actualizacion).toBe("2026-11-03");
    });

    it("no muta el frontmatter de entrada", () => {
      const original = { titulo: "Test", fecha_creacion: "2026-01-01" };
      const result = stampDates(original, { today: "2026-11-03" });
      expect(original).toEqual({ titulo: "Test", fecha_creacion: "2026-01-01" });
      expect(result).not.toBe(original);
    });

    it("preserva el orden de claves existentes y añade fechas al final si no existen", () => {
      const original = { titulo: "Test", tags: ["a", "b"] };
      const result = stampDates(original, { today: "2026-11-03" });
      const keys = Object.keys(result);
      expect(keys[0]).toBe("titulo");
      expect(keys[1]).toBe("tags");
      expect(keys[keys.length - 2]).toBe("fecha_creacion");
      expect(keys[keys.length - 1]).toBe("fecha_actualizacion");
    });

    it("reemplaza fecha_creacion si existe y es inválida", () => {
      const result = stampDates(
        { fecha_creacion: "no-es-fecha", fecha_actualizacion: "2026-01-02" },
        { today: "2026-11-03", createdAtISO: "2026-05-10T00:00:00Z" }
      );
      expect(result.fecha_creacion).toBe("2026-05-10");
    });

    it("no toca otras claves del frontmatter", () => {
      const original = {
        titulo: "Original",
        descripcion: "Desc",
        tags: ["tag1"],
        estado: "en proceso",
      };
      const result = stampDates(original, { today: "2026-11-03" });
      expect(result.titulo).toBe("Original");
      expect(result.descripcion).toBe("Desc");
      expect(result.tags).toEqual(["tag1"]);
      expect(result.estado).toBe("en proceso");
    });
  });
});
