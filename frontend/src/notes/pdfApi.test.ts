import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/problems";
import * as auth from "../api/auth";
import { fetchNotePdf, pdfErrorMessage, saveBlob } from "./pdfApi";

afterEach(() => vi.restoreAllMocks());

describe("pdfApi", () => {
  it("manda el HTML a la ruta de la nota y devuelve el archivo con el nombre del servidor", async () => {
    const res = new Response(new Blob(["%PDF-1"], { type: "application/pdf" }), { headers: { "Content-Disposition": 'attachment; filename="Acta-final.pdf"' } });
    const request = vi.spyOn(auth, "request").mockResolvedValue(res);
    const file = await fetchNotePdf("v 1", "n/2", "<p>x</p>");
    expect(request).toHaveBeenCalledWith("/vaults/v%201/notes/n%2F2/pdf", { method: "POST", body: JSON.stringify({ html: "<p>x</p>" }) });
    expect(file.filename).toBe("Acta-final.pdf");
    expect(file.blob.size).toBeGreaterThan(0);
  });

  it("sin Content-Disposition usa un nombre por omisión", async () => {
    vi.spyOn(auth, "request").mockResolvedValue(new Response(new Blob(["x"])));
    expect((await fetchNotePdf("v", "n", "")).filename).toBe("documento.pdf");
  });

  it("saveBlob descarga con un enlace temporal y lo libera", () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:x");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    saveBlob({ blob: new Blob(["x"]), filename: "a.pdf" });
    expect(click).toHaveBeenCalled();
    expect(document.querySelector("a[download]")).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(revoke).toHaveBeenCalledWith("blob:x");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("explica cada fallo en español", () => {
    const problem = (slug: string, status: number) => new ApiError(status, { type: `urn:synapse:problem:${slug}` });
    expect(pdfErrorMessage(problem("pdf-not-enabled", 409))).toMatch(/plantilla/);
    expect(pdfErrorMessage(problem("pdf-busy", 503))).toMatch(/otros PDF/);
    expect(pdfErrorMessage(problem("pdf-timeout", 504))).toMatch(/tardó demasiado/);
    expect(pdfErrorMessage(problem("validation-error", 422))).toMatch(/demasiado grande/);
    expect(pdfErrorMessage(problem("note-not-found", 404))).toMatch(/No se encontró/);
    expect(pdfErrorMessage(problem("pdf-render-failed", 500))).toMatch(/No se pudo generar/);
    expect(pdfErrorMessage(new TypeError("Failed to fetch"))).toMatch(/conexión/);
  });
});
