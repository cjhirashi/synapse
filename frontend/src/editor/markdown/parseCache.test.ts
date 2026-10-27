// SPEC-0010 RNF-001, RNF-003 (PLAN-0010 §10.4): caché en memoria del mdast por `(id, rev)`.
// Worker simulado: el Worker real sólo parsea; aquí se controlan sus respuestas para fijar el
// comportamiento de la caché (tamaño mínimo, LRU por bytes, dedup en vuelo, invalidación por rev,
// verificación de longitud, fallo sin excepción, `dispose`) y que NO toca almacenamiento persistente.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParseCache, type ParseWorkerResponse } from "./parseCache";

/** Worker falso: registra lo enviado y permite al test disparar la respuesta por clave. */
class FakeWorker {
  posted: Array<{ key: string; text: string }> = [];
  terminated = false;
  private listeners: Array<(e: { data: ParseWorkerResponse }) => void> = [];
  postMessage(message: { key: string; text: string }): void {
    this.posted.push(message);
  }
  addEventListener(_type: "message", listener: (e: { data: ParseWorkerResponse }) => void): void {
    this.listeners.push(listener);
  }
  terminate(): void {
    this.terminated = true;
  }
  respond(res: ParseWorkerResponse): void {
    this.listeners.forEach((l) => l({ data: res }));
  }
}

const big = (n = 40 * 1024) => "x".repeat(n); // ≥ 32 KiB → candidata a caché
const json = (tag: string) => `{"type":"root","tag":"${tag}"}`;

let worker: FakeWorker;
let cache: ParseCache;

beforeEach(() => {
  worker = new FakeWorker();
  cache = new ParseCache(worker);
});
afterEach(() => cache.dispose());

describe("ParseCache (RNF-001)", () => {
  it("la clave enviada al Worker es `{id}@{rev}`", () => {
    void cache.request("n1", "r1", big());
    expect(worker.posted).toEqual([{ key: "n1@r1", text: big() }]);
  });

  it("sólo pide notas de content ≥ 32 KiB; por debajo resuelve null sin usar el Worker", async () => {
    await expect(cache.request("n1", "r1", "pequeña")).resolves.toBeNull();
    expect(worker.posted).toHaveLength(0);
  });

  it("guarda la respuesta y la sirve sin volver a pedirla (get síncrono con longitud)", async () => {
    const text = big();
    const p = cache.request("n1", "r1", text);
    worker.respond({ key: "n1@r1", json: json("a") });
    await expect(p).resolves.toBe(json("a"));
    expect(cache.get("n1", "r1", text.length)).toBe(json("a"));
    void cache.request("n1", "r1", text);
    expect(worker.posted).toHaveLength(1); // no se vuelve a pedir
  });

  it("deduplica peticiones en vuelo: una sola al Worker y la misma promesa", () => {
    const text = big();
    const a = cache.request("n1", "r1", text);
    const b = cache.request("n1", "r1", text);
    expect(a).toBe(b);
    expect(worker.posted).toHaveLength(1);
  });

  it("una revisión nueva invalida la anterior del mismo id", async () => {
    const text = big();
    const p1 = cache.request("n1", "r1", text);
    worker.respond({ key: "n1@r1", json: json("v1") });
    await p1;
    const p2 = cache.request("n1", "r2", text);
    worker.respond({ key: "n1@r2", json: json("v2") });
    await p2;
    expect(cache.get("n1", "r1", text.length)).toBeNull();
    expect(cache.get("n1", "r2", text.length)).toBe(json("v2"));
  });

  it("verifica la longitud: un texto de distinta longitud no usa la entrada", async () => {
    const text = big();
    const p = cache.request("n1", "r1", text);
    worker.respond({ key: "n1@r1", json: json("a") });
    await p;
    expect(cache.get("n1", "r1", text.length + 1)).toBeNull();
  });

  it("un fallo del Worker resuelve null, sin entrada y sin excepción", async () => {
    const text = big();
    const p = cache.request("n1", "r1", text);
    worker.respond({ key: "n1@r1", error: "boom" });
    await expect(p).resolves.toBeNull();
    expect(cache.get("n1", "r1", text.length)).toBeNull();
  });

  it("LRU por bytes: al pasar el tope se desaloja la entrada menos usada", async () => {
    const small = new ParseCache(worker, { maxBytes: 100, minSize: 1 });
    const store = async (id: string, payload: string) => {
      const p = small.request(id, "r", "texto");
      worker.respond({ key: `${id}@r`, json: payload });
      await p;
    };
    await store("a", "x".repeat(60)); // 60 B
    await store("b", "y".repeat(60)); // 120 B > 100 → desaloja 'a' (la más vieja)
    expect(small.get("a", "r", 5)).toBeNull();
    expect(small.get("b", "r", 5)).toBe("y".repeat(60));
    small.dispose();
  });

  it("dispose termina el Worker y vacía la caché", async () => {
    const text = big();
    const p = cache.request("n1", "r1", text);
    worker.respond({ key: "n1@r1", json: json("a") });
    await p;
    cache.dispose();
    expect(worker.terminated).toBe(true);
    expect(cache.get("n1", "r1", text.length)).toBeNull();
  });

  it("no escribe en indexedDB, localStorage ni sessionStorage", async () => {
    const ls = vi.spyOn(Storage.prototype, "setItem");
    const idb = globalThis.indexedDB ? vi.spyOn(globalThis.indexedDB, "open") : null;
    const text = big();
    const p = cache.request("n1", "r1", text);
    worker.respond({ key: "n1@r1", json: json("a") });
    await p;
    cache.get("n1", "r1", text.length);
    expect(ls).not.toHaveBeenCalled();
    expect(idb === null || !idb.mock.calls.length).toBe(true);
    ls.mockRestore();
    idb?.mockRestore();
  });
});
