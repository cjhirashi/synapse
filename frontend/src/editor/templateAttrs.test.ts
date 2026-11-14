import { describe, expect, it } from "vitest";
import { HIDDEN_KEY, changeTemplate, detachTemplate, hasContent, isEmptyBody, seedValue, typeMatches } from "./templateAttrs";

const base = {
  name: "informe",
  atributos: [
    { nombre: "autor", tipo: "texto" },
    { nombre: "version", tipo: "numero" },
    { nombre: "revisores", tipo: "lista" },
    { nombre: "publico", tipo: "booleano" },
    { nombre: "entrega", tipo: "fecha" },
  ],
};
const otra = { name: "acta", atributos: [{ nombre: "autor", tipo: "texto" }, { nombre: "lugar", tipo: "texto" }] };

describe("tipos y contenido", () => {
  it("reconoce el tipo de cada valor", () => {
    expect(typeMatches("texto", "a")).toBe(true);
    expect(typeMatches("texto", 1)).toBe(false);
    expect(typeMatches("numero", 2.5)).toBe(true);
    expect(typeMatches("numero", "2")).toBe(false);
    expect(typeMatches("fecha", "2026-11-14")).toBe(true);
    expect(typeMatches("fecha", "14/11/2026")).toBe(false);
    expect(typeMatches("lista", ["a"])).toBe(true);
    expect(typeMatches("lista", [1])).toBe(false);
    expect(typeMatches("booleano", false)).toBe(true);
  });
  it("distingue vacío de contenido", () => {
    expect(hasContent("texto", "  ")).toBe(false);
    expect(hasContent("texto", "x")).toBe(true);
    expect(hasContent("lista", [])).toBe(false);
    expect(hasContent("booleano", false)).toBe(false);
    expect(hasContent("booleano", true)).toBe(true);
    expect(hasContent("numero", 0)).toBe(true);
  });
  it("siembra el valor inicial o uno vacío", () => {
    expect(seedValue({ tipo: "texto" })).toBe("");
    expect(seedValue({ tipo: "numero" })).toBeUndefined();
    expect(seedValue({ tipo: "texto", valor: "x" })).toBe("x");
  });
  it("un cuerpo en blanco cuenta como vacío", () => {
    expect(isEmptyBody("  \n")).toBe(true);
    expect(isEmptyBody("# t")).toBe(false);
  });
});

describe("asignar plantilla", () => {
  it("carga los atributos de la plantilla y guarda su nombre", () => {
    const out = changeTemplate({ titulo: "T" }, null, base);
    expect(out).toMatchObject({ titulo: "T", plantilla: "informe", autor: "", revisores: [], publico: false });
    expect("version" in out).toBe(false);
    expect(HIDDEN_KEY in out).toBe(false);
  });
  it("oculta los opcionales que no coinciden y conserva los que coinciden en nombre y tipo", () => {
    const out = changeTemplate({ autor: "Ana", version: "uno", nota: "x", extra: 3 }, null, base);
    expect(out.autor).toBe("Ana");
    expect(out.version).toBeUndefined();
    expect(out[HIDDEN_KEY]).toEqual({ version: "uno", nota: "x", extra: 3 });
    expect("nota" in out).toBe(false);
  });
  it("no toca los atributos generales ni las claves protegidas", () => {
    const out = changeTemplate({ estado: "borrador", tags: ["a"], proyecto: "p" }, null, base, { keep: new Set(["proyecto"]) });
    expect(out).toMatchObject({ estado: "borrador", tags: ["a"], proyecto: "p" });
  });
});

describe("quitar o cambiar la plantilla", () => {
  it("los ocultos reaparecen y los atributos de la plantilla con contenido quedan como opcionales", () => {
    const withTemplate = changeTemplate({ nota: "x" }, null, base);
    const edited = { ...withTemplate, autor: "Ana", revisores: ["Luis"] };
    const out = changeTemplate(edited, base, null);
    expect(out).toMatchObject({ nota: "x", autor: "Ana", revisores: ["Luis"] });
    expect("plantilla" in out).toBe(false);
    expect("publico" in out).toBe(false); // vacío: se descarta
    expect(HIDDEN_KEY in out).toBe(false);
  });
  it("al cambiar de plantilla el atributo común conserva su valor y los demás pasan a ocultos", () => {
    const a = { ...changeTemplate({}, null, base), autor: "Ana", revisores: ["Luis"] };
    const out = changeTemplate(a, base, otra);
    expect(out).toMatchObject({ plantilla: "acta", autor: "Ana", lugar: "" });
    expect(out[HIDDEN_KEY]).toEqual({ revisores: ["Luis"] });
    const back = changeTemplate(out, otra, base);
    expect(back.revisores).toEqual(["Luis"]);
  });
  it("sin la definición de la plantilla (borrada) no se descarta ningún atributo", () => {
    const out = detachTemplate({ plantilla: "x", autor: "", nota: "n" }, null);
    expect(out).toEqual({ autor: "", nota: "n" });
  });
  it("un oculto que choca con un atributo conservado sigue oculto", () => {
    const out = detachTemplate({ plantilla: "informe", autor: "Ana", [HIDDEN_KEY]: { autor: 7, otro: 1 } }, base);
    expect(out).toMatchObject({ autor: "Ana", otro: 1 });
    expect(out[HIDDEN_KEY]).toEqual({ autor: 7 });
  });
});
