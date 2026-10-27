// RF-057, RF-058 (SPEC-0010; PLAN-0010 §2.1): historial de notas abiertas, por bóveda y pestaña.
import { describe, expect, it } from "vitest";
import { canStep, EMPTY_HISTORY, historyKey, load, push, save, step, type History } from "./noteHistory";

const VAULT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const id = (n: number, vault = VAULT) => `note:${vault}:${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const all = () => true;

/** Historial con las notas 1…n abiertas en orden. */
const opened = (n: number): History => Array.from({ length: n }, (_, i) => i + 1).reduce((h, k) => push(h, id(k)), EMPTY_HISTORY);

/** `sessionStorage` mínimo en memoria. */
function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (n) => [...data.keys()][n] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

describe("push · RF-057", () => {
  it("abrir una nota la añade al final y deja la posición en ella", () => {
    const h = opened(3);
    expect(h.entries).toEqual([id(1), id(2), id(3)]);
    expect(h.index).toBe(2);
  });

  it("no duplica la nota actual", () => {
    const h = push(opened(2), id(2));
    expect(h.entries).toHaveLength(2);
    expect(h.index).toBe(1);
  });

  it("abrir una nota tras volver atrás descarta las entradas «adelante»", () => {
    const back = step(opened(3), -1, all)!.history;
    const h = push(back, id(9));
    expect(h.entries).toEqual([id(1), id(2), id(9)]);
    expect(h.index).toBe(2);
  });

  it("tiene un tope de 50 entradas y se quita la más antigua", () => {
    const h = opened(55);
    expect(h.entries).toHaveLength(50);
    expect(h.entries[0]).toBe(id(6));
    expect(h.entries[49]).toBe(id(55));
    expect(h.index).toBe(49);
  });

  it("no muta el historial recibido", () => {
    const h = opened(2);
    push(h, id(3));
    expect(h.entries).toHaveLength(2);
  });
});

describe("step · RF-057, RF-058", () => {
  it("atrás y adelante mueven la posición sin añadir entradas", () => {
    const back = step(opened(3), -1, all)!;
    expect(back.target).toBe(id(2));
    expect(back.history).toEqual({ entries: [id(1), id(2), id(3)], index: 1 });
    const forward = step(back.history, 1, all)!;
    expect(forward.target).toBe(id(3));
    expect(forward.history.index).toBe(2);
  });

  it("en los extremos no hay destino", () => {
    expect(step(opened(3), 1, all)).toBeNull();
    expect(step(step(opened(2), -1, all)!.history, -1, all)).toBeNull();
    expect(step(EMPTY_HISTORY, -1, all)).toBeNull();
  });

  it("salta las notas borradas o inexistentes y sigue a la siguiente válida en esa dirección (RF-058)", () => {
    const valid = (n: string) => n !== id(2) && n !== id(3);
    const result = step(opened(4), -1, valid)!;
    expect(result.target).toBe(id(1));
    expect(result.history.index).toBe(0);
    // Si todas las de esa dirección son inválidas no hay destino y no se mueve nada.
    expect(step(opened(3), -1, (n) => n === id(3))).toBeNull();
  });

  it("una nota renombrada sigue siendo navegable: se identifica por id, no por ruta", () => {
    // El historial sólo guarda ids; la validez la decide quien lo usa con el id (la nota sigue existiendo).
    const h = opened(2);
    expect(step(h, -1, (n) => n === id(1))!.target).toBe(id(1));
  });
});

describe("canStep", () => {
  it("coincide con step", () => {
    const h = step(opened(3), -1, all)!.history;
    expect(canStep(h, -1, all)).toBe(true);
    expect(canStep(h, 1, all)).toBe(true);
    expect(canStep(opened(1), -1, all)).toBe(false);
    expect(canStep(opened(3), 1, all)).toBe(false);
    expect(canStep(opened(3), -1, () => false)).toBe(false);
  });
});

describe("load / save · RF-057", () => {
  it("la clave es por bóveda", () => {
    expect(historyKey(VAULT)).toBe(`synapse:note-history:${VAULT}`);
    expect(historyKey(VAULT)).not.toBe(historyKey(OTHER));
  });

  it("guarda y recupera el historial de la bóveda (recarga de la pestaña)", () => {
    const storage = memory();
    const h = step(opened(3), -1, all)!.history;
    save(storage, VAULT, h);
    expect(load(storage, VAULT)).toEqual(h);
    // Otra bóveda, otro historial.
    expect(load(storage, OTHER)).toEqual(EMPTY_HISTORY);
  });

  it.each([
    ["no es JSON", "{no"],
    ["no es un objeto", "[1,2]"],
    ["sin entries", '{"index":0}'],
    ["entries con algo que no es texto", `{"entries":[1],"index":0}`],
    ["un id que no es de nota", `{"entries":["otra-cosa"],"index":0}`],
    ["un id de otra bóveda", JSON.stringify({ entries: [id(1, OTHER)], index: 0 })],
    ["posición fuera de rango", JSON.stringify({ entries: [id(1)], index: 3 })],
    ["posición no entera", JSON.stringify({ entries: [id(1)], index: 0.5 })],
    ["más de 50 entradas", JSON.stringify({ entries: Array.from({ length: 51 }, (_, i) => id(i + 1)), index: 0 })],
  ])("una forma corrupta (%s) da un historial vacío", (_name, raw) => {
    const storage = memory();
    storage.setItem(historyKey(VAULT), raw);
    expect(load(storage, VAULT)).toEqual(EMPTY_HISTORY);
  });

  it("sin almacenamiento disponible no lanza (modo privado, cuota)", () => {
    const broken = {
      getItem: () => {
        throw new Error("denegado");
      },
      setItem: () => {
        throw new Error("cuota");
      },
    } as unknown as Storage;
    expect(load(broken, VAULT)).toEqual(EMPTY_HISTORY);
    expect(() => save(broken, VAULT, opened(1))).not.toThrow();
  });
});
