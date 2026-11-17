import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/problems";
import * as auth from "../api/auth";
import {
  getPublication,
  checkPublication,
  publishNote,
  republishNote,
  unpublishNote,
  publicUrl,
  publicationErrorMessage,
} from "./publicationApi";
import { restNoteId } from "./pdfApi";

afterEach(() => vi.restoreAllMocks());

describe("publicationApi", () => {
  it("getPublication llama a GET /vaults/{v}/notes/{n}/publication y devuelve el estado", async () => {
    const status = {
      enabled: true,
      published: true,
      token: "abc123",
      path: "/p/abc123",
      published_at: "2026-11-17T10:00:00Z",
      republished_at: null,
      stale: false,
    };
    const request = vi.spyOn(auth, "request").mockResolvedValue(
      new Response(JSON.stringify(status), { headers: { "Content-Type": "application/json" } })
    );
    const result = await getPublication("v 1", "note:v 1:uuid-123");
    expect(request).toHaveBeenCalledWith("/vaults/v%201/notes/uuid-123/publication");
    expect(result).toEqual(status);
  });

  it("checkPublication llama a POST /vaults/{v}/notes/{n}/publication/check con html", async () => {
    const check = { resources: [], external: [], has_private: false };
    const request = vi.spyOn(auth, "request").mockResolvedValue(
      new Response(JSON.stringify(check), { headers: { "Content-Type": "application/json" } })
    );
    const html = "<p>contenido</p>";
    const result = await checkPublication("vault1", "note:vault1:id-456", html);
    expect(request).toHaveBeenCalledWith(
      "/vaults/vault1/notes/id-456/publication/check",
      { method: "POST", body: JSON.stringify({ html }) }
    );
    expect(result).toEqual(check);
  });

  it("publishNote llama a POST /vaults/{v}/notes/{n}/publication con html (201)", async () => {
    const status = { enabled: true, published: true, token: "tok", path: "/p/tok", published_at: "2026-11-17T10:00:00Z", republished_at: null, stale: false };
    const request = vi.spyOn(auth, "request").mockResolvedValue(
      new Response(JSON.stringify(status), { status: 201, headers: { "Content-Type": "application/json" } })
    );
    const html = "<p>pub</p>";
    const result = await publishNote("v2", "note:v2:n789", html);
    expect(request).toHaveBeenCalledWith(
      "/vaults/v2/notes/n789/publication",
      { method: "POST", body: JSON.stringify({ html }) }
    );
    expect(result).toEqual(status);
  });

  it("republishNote llama a PUT /vaults/{v}/notes/{n}/publication con html (200)", async () => {
    const status = { enabled: true, published: true, token: "tok", path: "/p/tok", published_at: "2026-11-17T10:00:00Z", republished_at: "2026-11-17T11:00:00Z", stale: false };
    const request = vi.spyOn(auth, "request").mockResolvedValue(
      new Response(JSON.stringify(status), { headers: { "Content-Type": "application/json" } })
    );
    const html = "<p>repub</p>";
    const result = await republishNote("v3", "note:v3:nABC", html);
    expect(request).toHaveBeenCalledWith(
      "/vaults/v3/notes/nABC/publication",
      { method: "PUT", body: JSON.stringify({ html }) }
    );
    expect(result).toEqual(status);
  });

  it("unpublishNote llama a DELETE /vaults/{v}/notes/{n}/publication (204)", async () => {
    const request = vi.spyOn(auth, "request").mockResolvedValue(new Response(null, { status: 204 }));
    await unpublishNote("v4", "note:v4:nDEF");
    expect(request).toHaveBeenCalledWith(
      "/vaults/v4/notes/nDEF/publication",
      { method: "DELETE" }
    );
  });

  it("usa el uuid de la nota, no el id con prefijo de la réplica local", async () => {
    const request = vi.spyOn(auth, "request").mockResolvedValue(
      new Response(JSON.stringify({ enabled: false, published: false, token: null, path: null, published_at: null, republished_at: null, stale: false }), { headers: { "Content-Type": "application/json" } })
    );
    const V = "d5a5d5cf-5fbf-4f7c-9373-14aea36c79a7";
    const N = "e155b697-f05d-481d-bd10-04bd40da67e2";
    await getPublication(V, `note:${V}:${N}`);
    expect(request).toHaveBeenCalledWith(`/vaults/${V}/notes/${N}/publication`);
    expect(restNoteId(`note:${V}:${N}`)).toBe(N);
  });

  it("publicUrl arma la URL pública con origin", () => {
    vi.stubGlobal("window", { location: { origin: "https://app.test" } });
    expect(publicUrl("/p/abc")).toBe("https://app.test/p/abc");
    expect(publicUrl("/p/xyz123")).toBe("https://app.test/p/xyz123");
    vi.unstubAllGlobals();
  });

  it("explica cada fallo en español con los textos exactos", () => {
    const problem = (slug: string, status: number) => new ApiError(status, { type: `urn:synapse:problem:${slug}` });
    expect(publicationErrorMessage(problem("publish-not-enabled", 409))).toBe("La plantilla de este documento ya no permite publicarlo.");
    expect(publicationErrorMessage(problem("already-published", 409))).toBe("Este documento ya está publicado. Recarga para ver su enlace.");
    expect(publicationErrorMessage(problem("not-published", 409))).toBe("Este documento ya no está publicado.");
    expect(publicationErrorMessage(problem("note-not-found", 404))).toBe("No se encontró el documento en el servidor. ¿Se sincronizó?");
    expect(publicationErrorMessage(problem("validation-error", 422))).toBe("El documento es demasiado grande para publicarlo.");
    expect(publicationErrorMessage(problem("validation-error", 413))).toBe("El documento es demasiado grande para publicarlo.");
    expect(publicationErrorMessage(problem("other-error", 401))).toBe("Tu sesión terminó. Vuelve a entrar.");
    expect(publicationErrorMessage(problem("other-error", 500))).toBe("No se pudo completar la acción. Inténtalo de nuevo.");
    expect(publicationErrorMessage(new TypeError("Failed to fetch"))).toBe("Para publicar necesitas conexión con el servidor.");
  });
});
