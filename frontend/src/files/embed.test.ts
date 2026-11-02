import { describe, expect, it } from "vitest";
import { htmlEmbedMarkup } from "./embed";

describe("embed", () => {
  it("htmlEmbedMarkup devuelve el formato exacto <iframe src=\"URL\"></iframe>", () => {
    const url = "https://synapse.cjhirashi.com/files/123e4567-e89b-42d3-a456-426614174000";
    const result = htmlEmbedMarkup(url);
    expect(result).toBe(`<iframe src="${url}"></iframe>`);
  });
});
