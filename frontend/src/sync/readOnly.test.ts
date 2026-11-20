import { describe, expect, it } from "vitest";
import { readOnly, ReadOnlyReplicaError } from "./readOnly";

describe("readOnly", () => {
  const store = { name: "almacén", read() { return `leído en ${this.name}`; }, write() { return "escrito"; } };

  it("deja pasar lo permitido, con el almacén como `this`, y las propiedades que no son funciones", () => {
    const wrapped = readOnly(store, ["read"]);
    expect(wrapped.read()).toBe("leído en almacén");
    expect(wrapped.name).toBe("almacén");
  });

  it("lo demás rechaza con ReadOnlyReplicaError al LLAMARLO y no llega al almacén", async () => {
    let touched = false;
    const guarded = readOnly({ write: () => { touched = true; return Promise.resolve("escrito"); } }, []);
    await expect(guarded.write()).rejects.toBeInstanceOf(ReadOnlyReplicaError);
    await expect(guarded.write()).rejects.toThrow("Esta bóveda es de solo lectura.");
    expect(touched).toBe(false);
  });

  it("acceder o desestructurar un método denegado no lanza (solo lo hace llamarlo)", async () => {
    const { write } = readOnly(store, ["read"]);
    expect(typeof write).toBe("function");
    await expect(write()).rejects.toBeInstanceOf(ReadOnlyReplicaError);
  });

  it("un método que no existe sigue sin existir", () => {
    expect((readOnly(store, ["read"]) as Record<string, unknown>).inexistente).toBeUndefined();
  });
});
