// SPEC-0010 RNF-001 (PLAN-0010 §10.5): programador de precálculo. Reloj e *idle* simulados.
// Fija: candidatas ≥ 32 KiB, prioridad puntero/foco > historial > carpetas desplegadas > resto, una
// nota a la vez en el Worker, pausa durante una apertura, reconciliación tras `notesVersion`, marca
// `synapse:precompute-idle` al vaciarse la cola, y `dispose`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrecomputeScheduler, type PrecomputeCandidate } from "./precompute";

/** `requestIdleCallback` simulado: acumula las franjas; el test las vacía cuando quiere. */
function makeIdle() {
  const queue: Array<() => void> = [];
  const requestIdle = (cb: () => void) => void queue.push(cb);
  const drain = async () => {
    // Tick inicial: deja correr el `pump()` que encola la siguiente franja en una microtarea
    // (p. ej. tras resolverse la petición anterior) antes de comprobar la cola.
    await new Promise((r) => setTimeout(r, 0));
    for (let i = 0; i < 1000 && queue.length > 0; i++) {
      queue.shift()!();
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  return { requestIdle, drain, pending: () => queue.length };
}

const cand = (id: string, size = 40 * 1024, rev = "r1"): PrecomputeCandidate => ({ id, rev, size });

let requested: Array<{ id: string; rev: string }>;
/** Caché falsa: registra el orden de las peticiones. */
const fakeCache = () => ({
  requested,
  request: vi.fn(async (id: string, rev: string) => {
    requested.push({ id, rev });
    return "{}";
  }),
});
/** Cuerpo por id: longitud = `size` de la candidata para pasar el umbral. */
const getContent = (sizes: Record<string, number>, rev = "r1") =>
  vi.fn(async (id: string) => ({ content: "x".repeat(sizes[id] ?? 40 * 1024), rev }));

beforeEach(() => {
  requested = [];
});
afterEach(() => vi.restoreAllMocks());

describe("PrecomputeScheduler (RNF-001)", () => {
  it("sólo precalcula candidatas ≥ el tamaño mínimo", async () => {
    const idle = makeIdle();
    const s = new PrecomputeScheduler({ cache: fakeCache(), getContent: getContent({ a: 40_000, b: 1_000 }), requestIdle: idle.requestIdle, minSize: 32 * 1024 });
    s.reconcile([cand("a", 40_000), cand("b", 1_000)]);
    await idle.drain();
    expect(requested.map((r) => r.id)).toEqual(["a"]);
    s.dispose();
  });

  it("orden de prioridad: puntero/foco > historial > carpetas desplegadas > resto", async () => {
    const idle = makeIdle();
    const s = new PrecomputeScheduler({ cache: fakeCache(), getContent: getContent({ a: 40_000, b: 40_000, c: 40_000, d: 40_000 }), requestIdle: idle.requestIdle, minSize: 1 });
    // Orden de árbol a, b, c, d; historial = [c]; carpeta desplegada contiene b; puntero sobre d.
    s.reconcile([cand("a"), cand("b"), cand("c"), cand("d")], { history: ["c"], expanded: new Set(["b"]) });
    s.prioritize("d");
    await idle.drain();
    expect(requested.map((r) => r.id)).toEqual(["d", "c", "b", "a"]);
    s.dispose();
  });

  it("una sola nota a la vez: no empieza la siguiente hasta que la anterior termina en el Worker", async () => {
    const idle = makeIdle();
    let resolveFirst: (v: string) => void = () => {};
    const cache = {
      request: vi.fn((id: string, rev: string) => {
        requested.push({ id, rev });
        return id === "a" ? new Promise<string>((res) => (resolveFirst = res)) : Promise.resolve("{}");
      }),
    };
    const s = new PrecomputeScheduler({ cache, getContent: getContent({ a: 40_000, b: 40_000 }), requestIdle: idle.requestIdle, minSize: 1 });
    s.reconcile([cand("a"), cand("b")]);
    await idle.drain();
    expect(requested.map((r) => r.id)).toEqual(["a"]); // 'b' espera a que 'a' termine
    resolveFirst("{}");
    await idle.drain();
    expect(requested.map((r) => r.id)).toEqual(["a", "b"]);
    s.dispose();
  });

  it("pausa durante una apertura y reanuda después", async () => {
    const idle = makeIdle();
    const s = new PrecomputeScheduler({ cache: fakeCache(), getContent: getContent({ a: 40_000 }), requestIdle: idle.requestIdle, minSize: 1 });
    s.pause();
    s.reconcile([cand("a")]);
    await idle.drain();
    expect(requested).toHaveLength(0);
    s.resume();
    await idle.drain();
    expect(requested.map((r) => r.id)).toEqual(["a"]);
    s.dispose();
  });

  it("reconcilia tras notesVersion: una revisión nueva se vuelve a precalcular", async () => {
    const idle = makeIdle();
    let rev = "r1";
    const s = new PrecomputeScheduler({ cache: fakeCache(), getContent: vi.fn(async (id: string) => ({ content: "x".repeat(40_000), rev })), requestIdle: idle.requestIdle, minSize: 1 });
    s.reconcile([cand("a", 40 * 1024, "r1")]);
    await idle.drain();
    rev = "r2";
    s.reconcile([cand("a", 40 * 1024, "r2")]);
    await idle.drain();
    expect(requested.map((r) => r.rev)).toEqual(["r1", "r2"]);
    s.dispose();
  });

  it("emite la marca synapse:precompute-idle al vaciarse la cola", async () => {
    const idle = makeIdle();
    const mark = vi.spyOn(performance, "mark");
    const s = new PrecomputeScheduler({ cache: fakeCache(), getContent: getContent({ a: 40_000 }), requestIdle: idle.requestIdle, minSize: 1 });
    s.reconcile([cand("a")]);
    await idle.drain();
    expect(mark).toHaveBeenCalledWith("synapse:precompute-idle");
    s.dispose();
  });

  it("dispose detiene el programador (no más peticiones)", async () => {
    const idle = makeIdle();
    const s = new PrecomputeScheduler({ cache: fakeCache(), getContent: getContent({ a: 40_000, b: 40_000 }), requestIdle: idle.requestIdle, minSize: 1 });
    s.reconcile([cand("a"), cand("b")]);
    s.dispose();
    await idle.drain();
    expect(requested).toHaveLength(0);
  });
});
