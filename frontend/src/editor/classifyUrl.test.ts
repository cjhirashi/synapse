// H-025 PASO 2: clasificador de URLs (YouTube, imágenes, links genéricos)
import { describe, expect, it } from "vitest";
import {
  parseYoutubeUrl,
  parseYoutubeEmbedSrc,
  youtubeEmbedUrl,
  youtubeWatchUrl,
  classifyUrl,
} from "./classifyUrl";

describe("parseYoutubeUrl", () => {
  // watch?v=<id>
  it("reconoce youtube.com/watch?v=dQw4w9WgXcQ", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result).toEqual({ id: "dQw4w9WgXcQ", start: null });
  });

  it("reconoce youtube.com (sin www) /watch?v=", () => {
    const result = parseYoutubeUrl("https://youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result).toEqual({ id: "dQw4w9WgXcQ", start: null });
  });

  it("reconoce m.youtube.com/watch?v=", () => {
    const result = parseYoutubeUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result).toEqual({ id: "dQw4w9WgXcQ", start: null });
  });

  it("reconoce www.youtube.com/watch?v= con parámetro list= (se ignora)", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxxxx");
    expect(result).toEqual({ id: "dQw4w9WgXcQ", start: null });
  });

  // /shorts/
  it("reconoce youtube.com/shorts/dQw4w9WgXcQ", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ");
    expect(result).toEqual({ id: "dQw4w9WgXcQ", start: null });
  });

  // /embed/
  it("reconoce youtube.com/embed/dQw4w9WgXcQ", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(result).toEqual({ id: "dQw4w9WgXcQ", start: null });
  });

  // youtu.be/
  it("reconoce youtu.be/dQw4w9WgXcQ", () => {
    const result = parseYoutubeUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(result).toEqual({ id: "dQw4w9WgXcQ", start: null });
  });

  // parámetro t= (segundos)
  it("reconoce /watch?v=ID&t=90 como 90 segundos", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90");
    expect(result).toEqual({ id: "dQw4w9WgXcQ", start: 90 });
  });

  it("reconoce /watch?v=ID&t=90s como 90 segundos", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s");
    expect(result).toEqual({ id: "dQw4w9WgXcQ", start: 90 });
  });

  it("reconoce /watch?v=ID&t=1m30s como 90 segundos", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s");
    expect(result).toEqual({ id: "dQw4w9WgXcQ", start: 90 });
  });

  it("reconoce /watch?v=ID&t=1h2m3s como 3723 segundos", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s");
    expect(result).toEqual({ id: "dQw4w9WgXcQ", start: 3723 });
  });

  // parámetro start= (youtu.be)
  it("reconoce youtu.be/ID?start=45 como 45 segundos", () => {
    const result = parseYoutubeUrl("https://youtu.be/dQw4w9WgXcQ?start=45");
    expect(result).toEqual({ id: "dQw4w9WgXcQ", start: 45 });
  });

  // ID de 11 caracteres exactos
  it("rechaza ID de 10 caracteres", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXc");
    expect(result).toBeNull();
  });

  it("rechaza ID de 12 caracteres", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQX");
    expect(result).toBeNull();
  });

  it("rechaza ID con caracteres inválidos (fuera de [A-Za-z0-9_-])", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXc@");
    expect(result).toBeNull();
  });

  // /watch sin v=
  it("rechaza /watch sin parámetro v=", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/watch?t=90");
    expect(result).toBeNull();
  });

  // /playlist?list=
  it("rechaza /playlist?list=", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/playlist?list=PLxxxxx");
    expect(result).toBeNull();
  });

  // Protocolos no HTTPS
  it("rechaza http://", () => {
    const result = parseYoutubeUrl("http://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result).toBeNull();
  });

  // Hosts inválidos
  it("rechaza youtube.com.evil.com", () => {
    const result = parseYoutubeUrl("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ");
    expect(result).toBeNull();
  });

  it("rechaza notyoutube.com", () => {
    const result = parseYoutubeUrl("https://notyoutube.com/watch?v=dQw4w9WgXcQ");
    expect(result).toBeNull();
  });

  // javascript: y data:
  it("rechaza javascript:", () => {
    const result = parseYoutubeUrl("javascript:alert(1)");
    expect(result).toBeNull();
  });

  it("rechaza data:", () => {
    const result = parseYoutubeUrl("data:text/html,<script>alert(1)</script>");
    expect(result).toBeNull();
  });

  // Credenciales
  it("rechaza URL con usuario:contraseña", () => {
    const result = parseYoutubeUrl("https://user:password@www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result).toBeNull();
  });

  // Espacios
  it("rechaza URL con espacios internos", () => {
    const result = parseYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9 WgXcQ");
    expect(result).toBeNull();
  });
});

describe("parseYoutubeEmbedSrc", () => {
  it("reconoce https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", () => {
    const result = parseYoutubeEmbedSrc("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(result).toEqual({ id: "dQw4w9WgXcQ", start: null });
  });

  it("reconoce con parámetro start=90", () => {
    const result = parseYoutubeEmbedSrc("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90");
    expect(result).toEqual({ id: "dQw4w9WgXcQ", start: 90 });
  });

  it("rechaza parámetros extra (más allá de start=)", () => {
    const result = parseYoutubeEmbedSrc("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90&rel=0");
    expect(result).toBeNull();
  });

  it("rechaza con hash", () => {
    const result = parseYoutubeEmbedSrc("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ#autoplay");
    expect(result).toBeNull();
  });

  it("rechaza youtube.com/embed (no nocookie)", () => {
    const result = parseYoutubeEmbedSrc("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(result).toBeNull();
  });

  it("rechaza dominio parecido (youtube-nocookie.com.evil.com)", () => {
    const result = parseYoutubeEmbedSrc("https://youtube-nocookie.com.evil.com/embed/dQw4w9WgXcQ");
    expect(result).toBeNull();
  });

  it("rechaza ID de 10 caracteres", () => {
    const result = parseYoutubeEmbedSrc("https://www.youtube-nocookie.com/embed/dQw4w9WgXc");
    expect(result).toBeNull();
  });

  it("rechaza puerto", () => {
    const result = parseYoutubeEmbedSrc("https://www.youtube-nocookie.com:8080/embed/dQw4w9WgXcQ");
    expect(result).toBeNull();
  });
});

describe("youtubeEmbedUrl y youtubeWatchUrl", () => {
  it("youtubeEmbedUrl(id, null) → nocookie sin start=", () => {
    const url = youtubeEmbedUrl("dQw4w9WgXcQ", null);
    expect(url).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("youtubeEmbedUrl(id, 90) → nocookie con start=90", () => {
    const url = youtubeEmbedUrl("dQw4w9WgXcQ", 90);
    expect(url).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90");
  });

  it("youtubeEmbedUrl(id, 0) → sin start=", () => {
    const url = youtubeEmbedUrl("dQw4w9WgXcQ", 0);
    expect(url).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("youtubeWatchUrl(id, null) → watch sin t=", () => {
    const url = youtubeWatchUrl("dQw4w9WgXcQ", null);
    expect(url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("youtubeWatchUrl(id, 90) → watch con t=90", () => {
    const url = youtubeWatchUrl("dQw4w9WgXcQ", 90);
    expect(url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90");
  });

  it("youtubeWatchUrl(id, 0) → sin t=", () => {
    const url = youtubeWatchUrl("dQw4w9WgXcQ", 0);
    expect(url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("ida y vuelta: parse(watchUrl(id, start)) == {id, start}", () => {
    const id = "dQw4w9WgXcQ";
    const start = 90;
    const url = youtubeWatchUrl(id, start);
    const parsed = parseYoutubeUrl(url);
    expect(parsed).toEqual({ id, start });
  });

  it("ida y vuelta: parse(embedUrl(id, start)) == {id, start}", () => {
    const id = "dQw4w9WgXcQ";
    const start = 45;
    const url = youtubeEmbedUrl(id, start);
    const parsed = parseYoutubeEmbedSrc(url);
    expect(parsed).toEqual({ id, start });
  });
});

describe("classifyUrl", () => {
  it("clasifica YouTube watch URL como kind='youtube'", () => {
    const result = classifyUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result).toEqual({ kind: "youtube", id: "dQw4w9WgXcQ", start: null });
  });

  it("clasifica YouTube shorts URL como kind='youtube'", () => {
    const result = classifyUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ");
    expect(result).toEqual({ kind: "youtube", id: "dQw4w9WgXcQ", start: null });
  });

  it("clasifica imagen .png como kind='image'", () => {
    const result = classifyUrl("https://example.com/photo.png");
    expect(result).toEqual({ kind: "image", url: "https://example.com/photo.png" });
  });

  it("clasifica imagen .jpg como kind='image'", () => {
    const result = classifyUrl("https://example.com/photo.jpg");
    expect(result).toEqual({ kind: "image", url: "https://example.com/photo.jpg" });
  });

  it("clasifica imagen .jpeg como kind='image'", () => {
    const result = classifyUrl("https://example.com/photo.jpeg");
    expect(result).toEqual({ kind: "image", url: "https://example.com/photo.jpeg" });
  });

  it("clasifica imagen .gif como kind='image'", () => {
    const result = classifyUrl("https://example.com/photo.gif");
    expect(result).toEqual({ kind: "image", url: "https://example.com/photo.gif" });
  });

  it("clasifica imagen .webp como kind='image'", () => {
    const result = classifyUrl("https://example.com/photo.webp");
    expect(result).toEqual({ kind: "image", url: "https://example.com/photo.webp" });
  });

  it("clasifica imagen con extensión mayúscula .PNG como kind='image'", () => {
    const result = classifyUrl("https://example.com/photo.PNG");
    expect(result).toEqual({ kind: "image", url: "https://example.com/photo.PNG" });
  });

  it("clasifica imagen con query string como kind='image'", () => {
    const result = classifyUrl("https://example.com/photo.png?x=1");
    expect(result).toEqual({ kind: "image", url: "https://example.com/photo.png?x=1" });
  });

  it("clasifica URL genérica https:// como kind='link'", () => {
    const result = classifyUrl("https://example.com/page");
    expect(result).toEqual({ kind: "link", url: "https://example.com/page" });
  });

  it("recorta espacios al inicio/fin", () => {
    const result = classifyUrl("  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ");
    expect(result).toEqual({ kind: "youtube", id: "dQw4w9WgXcQ", start: null });
  });

  it("rechaza URL con espacios internos → kind='link' con texto tal cual", () => {
    const result = classifyUrl("https://example.com/my page");
    expect(result).toEqual({ kind: "link", url: "https://example.com/my page" });
  });

  it("rechaza texto sin https → kind='link' con texto tal cual", () => {
    const result = classifyUrl("hola mundo");
    expect(result).toEqual({ kind: "link", url: "hola mundo" });
  });

  it("rechaza javascript: → kind='link' con texto tal cual", () => {
    const result = classifyUrl("javascript:alert(1)");
    expect(result).toEqual({ kind: "link", url: "javascript:alert(1)" });
  });

  it("rechaza data: → kind='link' con texto tal cual", () => {
    const result = classifyUrl("data:text/html,<script>alert(1)</script>");
    expect(result).toEqual({ kind: "link", url: "data:text/html,<script>alert(1)</script>" });
  });
});
