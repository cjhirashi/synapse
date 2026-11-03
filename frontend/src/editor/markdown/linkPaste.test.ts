// H-025 PASO 4: pruebas de linkPastePlugin

import { describe, it, expect, vi } from "vitest";
import { classifyUrl, youtubeEmbedUrl } from "../classifyUrl";

describe("linkPaste helpers", () => {
  it("classifyUrl identifica YouTube correctamente", () => {
    const result = classifyUrl("https://youtu.be/dQw4w9WgXcQ?t=90");
    expect(result.kind).toBe("youtube");
    if (result.kind === "youtube") {
      expect(result.id).toBe("dQw4w9WgXcQ");
      expect(result.start).toBe(90);
    }
  });

  it("classifyUrl identifica PNG correctamente", () => {
    const result = classifyUrl("https://example.com/foto.png");
    expect(result.kind).toBe("image");
    if (result.kind === "image") {
      expect(result.url).toBe("https://example.com/foto.png");
    }
  });

  it("youtubeEmbedUrl genera URL correcta con start", () => {
    const url = youtubeEmbedUrl("dQw4w9WgXcQ", 90);
    expect(url).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90");
  });

  it("youtubeEmbedUrl genera URL sin start cuando es null", () => {
    const url = youtubeEmbedUrl("dQw4w9WgXcQ", null);
    expect(url).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });
});
