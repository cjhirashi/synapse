import { catalogEstados, withEstado } from "./catalogEstados";

describe("catalogEstados / withEstado", () => {
  it("sin catálogo no hay estados propios", () => {
    expect(catalogEstados(null)).toEqual([]);
    expect(catalogEstados({})).toEqual([]);
    expect(catalogEstados({ estado: { type: "select" } })).toEqual([]);
  });

  it("devuelve las opciones del catálogo", () => {
    expect(catalogEstados({ estado: { type: "select", options: ["en pruebas"] } })).toEqual(["en pruebas"]);
  });

  it("un estado nuevo crea el atributo `estado` como select y conserva los demás atributos", () => {
    const out = withEstado({ prioridad: { type: "select", options: ["alta"] } }, "en pruebas");
    expect(out).toEqual({ prioridad: { type: "select", options: ["alta"] }, estado: { type: "select", options: ["en pruebas"] } });
  });

  it("añade al final sin repetir", () => {
    const base = { estado: { type: "select" as const, options: ["a"] } };
    expect(withEstado(base, "b")).toEqual({ estado: { type: "select", options: ["a", "b"] } });
    expect(withEstado(base, "a")).toBeNull();
  });

  it("un estándar no se guarda en el catálogo", () => {
    expect(withEstado(null, "borrador")).toBeNull();
    expect(withEstado({}, "en implementación")).toBeNull();
  });

  it("no muta el catálogo de entrada", () => {
    const base = { estado: { type: "select" as const, options: ["a"] } };
    withEstado(base, "b");
    expect(base.estado.options).toEqual(["a"]);
  });
});
