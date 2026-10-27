// UX-H4, P-6 (SPEC-0010; Converge 2, L-C): detección barata del bloque de YAML heredado al inicio de una nota.
import { describe, expect, it } from "vitest";
import { splitLegacyBlock } from "./legacyBlock";

describe("splitLegacyBlock", () => {
  it("separa el bloque `---…---` inicial con claves y el resto", () => {
    expect(splitLegacyBlock("---\ntítulo: X\netiquetas: [a]\n---\n# B\n")).toEqual({ block: "---\ntítulo: X\netiquetas: [a]\n---", rest: "# B\n" });
  });

  it("acepta CRLF y un bloque que cierra al final del texto", () => {
    expect(splitLegacyBlock("---\r\na: 1\r\n---\r\nB")).toEqual({ block: "---\r\na: 1\r\n---", rest: "B" });
    expect(splitLegacyBlock("---\na: 1\n---")).toEqual({ block: "---\na: 1\n---", rest: "" });
  });

  // El bloque es indistinguible, por forma, de dos reglas horizontales con una línea `clave: valor` entre medias: la
  // guarda es conservadora en lo que EXIGE (una línea `clave: valor`), no adivina la intención.
  it("entre reglas, una línea `clave: valor` cuenta como YAML", () => {
    expect(splitLegacyBlock("---\ntexto: x\n---\nmás")).toEqual({ block: "---\ntexto: x\n---", rest: "más" });
  });

  it.each([
    ["sin ninguna línea clave: valor", "---\nsolo texto\notra línea\n---\nB"],
    ["bloque vacío (dos reglas seguidas)", "---\n---\nB"],
    ["sólo comentarios y líneas en blanco", "---\n# nota\n\n---\nB"],
    ["una regla horizontal suelta", "---\n\ntexto\n"],
    ["el cerco no está en la línea 1", "# T\n---\na: 1\n---\nB"],
    ["sin cierre", "---\na: 1\nB"],
    ["cerco con más guiones", "----\na: 1\n----\nB"],
    ["los dos puntos pegados a la palabra siguiente (URL, hora)", "---\nhttp://x.y\n12:30h\n---\nB"],
  ])("lo rechaza: %s", (_name, content) => {
    expect(splitLegacyBlock(content)).toBeNull();
  });
});
