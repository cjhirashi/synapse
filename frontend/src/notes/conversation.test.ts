import { describe, expect, it } from "vitest";
import spec from "../../../backend/tests/fixtures/conversaciones_reglas.json";
import { parseConversation, parseMensajePath } from "./conversation";

describe("formato de las rutas de AG - MENSAJES (espejo del servidor)", () => {
  it.each(spec.paths)("$path", (c) => {
    const info = parseMensajePath(c.path);
    if (c.kind === null) {
      expect(info).toBeNull();
      return;
    }
    expect(info).not.toBeNull();
    expect({ kind: info?.kind, de: info?.de, para: info?.para, asunto: info?.asunto, inicio: info?.inicio, sender: info?.sender, number: info?.number }).toEqual({
      kind: c.kind, de: c.de ?? undefined, para: c.para ?? undefined, asunto: c.asunto ?? undefined, inicio: c.inicio ?? undefined, sender: c.sender ?? undefined, number: c.number ?? undefined,
    });
  });

  it("el nombre de una carpeta se interpreta aunque el asunto lleve separadores", () => {
    expect(parseConversation("aira → liza - a → b - 2026-01-01 - 2026-11-05")).toEqual({
      de: "aira", para: "liza", asunto: "a → b - 2026-01-01", inicio: "2026-11-05",
    });
    expect(parseConversation("aira → liza - x - 2026-13-01")).toBeNull();
  });
});
