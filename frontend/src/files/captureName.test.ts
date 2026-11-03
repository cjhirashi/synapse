import { describe, it, expect } from "vitest";
import { captureFileName } from "./captureName";

describe("captureFileName", () => {
  it("convierte una fecha UTC a formato captura-AAAAMMDD-HHMMSS con zona CDMX", () => {
    const utc = new Date("2026-11-03T01:05:09Z");
    const name = captureFileName(utc, "image/png");
    expect(name).toBe("captura-20261102-190509.png");
  });

  it("maneja cambio de día (UTC más tarde que CDMX)", () => {
    const utc = new Date("2026-11-04T03:30:00Z");
    const name = captureFileName(utc, "image/jpeg");
    expect(name).toBe("captura-20261103-213000.jpg");
  });

  it("convierte jpeg a .jpg", () => {
    const utc = new Date("2026-11-03T01:05:09Z");
    const name = captureFileName(utc, "image/jpeg");
    expect(name).toBe("captura-20261102-190509.jpg");
  });

  it("soporta image/gif", () => {
    const utc = new Date("2026-11-03T01:05:09Z");
    const name = captureFileName(utc, "image/gif");
    expect(name).toBe("captura-20261102-190509.gif");
  });

  it("soporta image/webp", () => {
    const utc = new Date("2026-11-03T01:05:09Z");
    const name = captureFileName(utc, "image/webp");
    expect(name).toBe("captura-20261102-190509.webp");
  });

  it("devuelve null para image/svg+xml", () => {
    const utc = new Date("2026-11-03T01:05:09Z");
    const name = captureFileName(utc, "image/svg+xml");
    expect(name).toBeNull();
  });

  it("devuelve null para image/bmp", () => {
    const utc = new Date("2026-11-03T01:05:09Z");
    const name = captureFileName(utc, "image/bmp");
    expect(name).toBeNull();
  });

  it("devuelve null para tipos no imagen", () => {
    const utc = new Date("2026-11-03T01:05:09Z");
    const name = captureFileName(utc, "text/plain");
    expect(name).toBeNull();
  });
});
