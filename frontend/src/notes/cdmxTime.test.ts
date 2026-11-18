import { describe, it, expect } from "vitest";
import { cdmxInputToIso, isoToCdmxInput, defaultExpiryInput, expiryError, formatCdmx, MIN_LEAD_MINUTES } from "./cdmxTime";

describe("cdmxTime", () => {
  describe("cdmxInputToIso", () => {
    it("convierte hora de CDMX a ISO UTC (2026-11-17, UTC-6)", () => {
      const result = cdmxInputToIso("2026-11-17T09:00");
      expect(result).toBe("2026-11-17T15:00:00.000Z");
    });

    it("convierte hora de CDMX a ISO UTC (2026-06-15: desde 2022 ya no hay horario de verano)", () => {
      const result = cdmxInputToIso("2026-06-15T09:00");
      expect(result).toBe("2026-06-15T15:00:00.000Z");
    });

    it("maneja horario de verano de 2022 (UTC-5)", () => {
      const result = cdmxInputToIso("2022-07-01T09:00");
      expect(result).toBe("2022-07-01T14:00:00.000Z");
    });

    it("devuelve null para formato inválido", () => {
      expect(cdmxInputToIso("")).toBeNull();
      expect(cdmxInputToIso("2026-11-17")).toBeNull();
      expect(cdmxInputToIso("09:00")).toBeNull();
      expect(cdmxInputToIso("2026-13-01T10:00")).toBeNull();
      expect(cdmxInputToIso("2026-11-32T10:00")).toBeNull();
      expect(cdmxInputToIso("2026-11-17T25:00")).toBeNull();
    });
  });

  describe("isoToCdmxInput", () => {
    it("convierte ISO UTC a hora de CDMX (2026-11-17, UTC-6)", () => {
      const result = isoToCdmxInput("2026-11-17T15:00:00.000Z");
      expect(result).toBe("2026-11-17T09:00");
    });

    it("convierte ISO UTC a hora de CDMX (2026-06-15: UTC-6)", () => {
      const result = isoToCdmxInput("2026-06-15T16:00:00.000Z");
      expect(result).toBe("2026-06-15T10:00");
    });

    it("maneja horario de verano de 2022 (UTC-5)", () => {
      const result = isoToCdmxInput("2022-07-01T15:00:00.000Z");
      expect(result).toBe("2022-07-01T10:00");
    });
  });

  describe("ida y vuelta", () => {
    it("cdmxInputToIso -> isoToCdmxInput preserva el valor original (2026-11-17)", () => {
      const original = "2026-11-17T09:00";
      const iso = cdmxInputToIso(original);
      const back = isoToCdmxInput(iso!);
      expect(back).toBe(original);
    });

    it("cdmxInputToIso -> isoToCdmxInput preserva el valor original (2026-06-15)", () => {
      const original = "2026-06-15T10:00";
      const iso = cdmxInputToIso(original);
      const back = isoToCdmxInput(iso!);
      expect(back).toBe(original);
    });

    it("cdmxInputToIso -> isoToCdmxInput preserva el valor original (2022-07-01)", () => {
      const original = "2022-07-01T10:00";
      const iso = cdmxInputToIso(original);
      const back = isoToCdmxInput(iso!);
      expect(back).toBe(original);
    });
  });

  describe("defaultExpiryInput", () => {
    it("con now = 2026-11-17T20:30:00Z devuelve 2026-11-18T15:00 (mañana a las 15 CDMX)", () => {
      const now = new Date("2026-11-17T20:30:00Z");
      const result = defaultExpiryInput(now);
      expect(result).toBe("2026-11-18T15:00");
    });

    it("devuelve una fecha dentro de 24 horas, a la hora en punto siguiente en zona CDMX", () => {
      const now = new Date("2026-11-17T10:00:00Z");
      const result = defaultExpiryInput(now);
      const iso = cdmxInputToIso(result);
      const expiryDate = new Date(iso!);
      const diff = expiryDate.getTime() - now.getTime();
      expect(diff).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(diff).toBeLessThan(25 * 60 * 60 * 1000);
      expect(result.endsWith(":00")).toBe(true);
    });
  });

  describe("expiryError", () => {
    const now = new Date("2026-11-17T10:00:00Z");

    it("devuelve null para una fecha exactamente 5 minutos en el futuro", () => {
      const input = "2026-11-17T04:05";
      const error = expiryError(input, now);
      expect(error).toBeNull();
    });

    it("devuelve error para una fecha a 4 minutos en el futuro", () => {
      const input = "2026-11-17T04:04";
      const error = expiryError(input, now);
      expect(error).toBe("Elige una fecha al menos 5 minutos adelante.");
    });

    it("devuelve error para un valor vacío", () => {
      const error = expiryError("", now);
      expect(error).toBe("Elige la fecha y la hora.");
    });

    it("devuelve error para un formato inválido", () => {
      const error = expiryError("invalid", now);
      expect(error).toBe("Elige la fecha y la hora.");
    });

    it("devuelve null para una fecha bien adelante", () => {
      const tomorrowCdmx = isoToCdmxInput(new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString());
      const error = expiryError(tomorrowCdmx, now);
      expect(error).toBeNull();
    });
  });

  describe("formatCdmx", () => {
    it("formatea una fecha ISO a hora de CDMX con sufijo CDMX", () => {
      const iso = "2026-11-17T15:00:00Z";
      const result = formatCdmx(iso);
      expect(result).toContain("CDMX");
      expect(result).toContain("9:00");
    });

    it("usa dateStyle medium y timeStyle short en es-MX", () => {
      const iso = "2026-06-15T15:00:00Z";
      const result = formatCdmx(iso);
      expect(result).toContain("CDMX");
    });
  });
});
