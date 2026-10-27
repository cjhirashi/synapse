// RNF-001, RF-027, RF-028 (SPEC-0010; PLAN-0010 §11.2): el resaltado de los bloques fuera del camino crítico, por
// tandas con presupuesto, ordenadas por distancia al viewport y con una sola promesa (un refresco) por tanda.
import { describe, expect, it, vi } from "vitest";
import { createHighlightScheduler } from "./highlightScheduler";

/** Reloj falso: cada trabajo hace avanzar `clock.now` lo que cueste. */
function setup(options: { budgetMs?: number; capacity?: number } = {}) {
  const clock = { now: 0 };
  const idleQueue: Array<() => void> = [];
  const scheduler = createHighlightScheduler<string>({
    now: () => clock.now,
    idle: (run) => {
      idleQueue.push(run);
      return () => {};
    },
    ...options,
  });
  const work = (value: string, cost: number) => () => {
    clock.now += cost;
    return value;
  };
  /** Ejecuta la siguiente tanda en idle. */
  const runTanda = async () => {
    idleQueue.shift()?.();
    await Promise.resolve();
  };
  return { scheduler, clock, work, runTanda, idleQueue };
}

describe("highlightScheduler", () => {
  it("no trabaja hasta idle y entonces procesa por distancia (el más cercano primero)", async () => {
    const { scheduler, work, runTanda, idleQueue } = setup({ budgetMs: 10 });
    const order: string[] = [];
    const job = (name: string, distance: number) => scheduler.request(name, () => distance, () => (order.push(name), name));
    job("lejos", 5000);
    job("cerca", 0);
    job("medio", 700);
    expect(order).toEqual([]);
    expect(idleQueue).toHaveLength(1);
    await runTanda();
    expect(order).toEqual(["cerca", "medio", "lejos"]);
    void work;
  });

  it("una tanda procesa hasta agotar el presupuesto de 10 ms y deja el resto para otra tanda en idle", async () => {
    const { scheduler, work, runTanda, idleQueue } = setup({ budgetMs: 10 });
    for (let i = 0; i < 7; i++) scheduler.request(`b${i}`, () => i, work(`v${i}`, 4));
    await runTanda();
    // 4 + 4 + 4 ≥ 10 → 3 bloques; quedan 4 y se agenda otra tanda.
    expect([0, 1, 2, 3, 4, 5, 6].filter((i) => scheduler.get(`b${i}`) !== undefined)).toEqual([0, 1, 2]);
    expect(idleQueue).toHaveLength(1);
    await runTanda();
    expect(scheduler.get("b5")).toBe("v5");
    await runTanda();
    expect(scheduler.get("b6")).toBe("v6");
    expect(idleQueue).toHaveLength(0);
  });

  it("siempre procesa al menos un bloque aunque cueste más que el presupuesto", async () => {
    const { scheduler, work, runTanda } = setup({ budgetMs: 10 });
    scheduler.request("a", () => 0, work("A", 50));
    scheduler.request("b", () => 1, work("B", 50));
    await runTanda();
    expect(scheduler.get("a")).toBe("A");
    expect(scheduler.get("b")).toBeUndefined();
  });

  it("todos los bloques pendientes comparten una promesa por tanda: resuelve al acabar la tanda y la siguiente es otra", async () => {
    const { scheduler, work, runTanda } = setup({ budgetMs: 10 });
    const first = scheduler.request("a", () => 0, work("A", 6));
    const same = scheduler.request("b", () => 1, work("B", 6));
    const third = scheduler.request("c", () => 2, work("C", 6));
    expect(same).toBe(first);
    expect(third).toBe(first);
    const settled = vi.fn();
    void first.then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    await runTanda();
    await first;
    expect(settled).toHaveBeenCalledTimes(1);
    // «c» no cupo en la primera tanda: pedirlo de nuevo da la promesa de la siguiente.
    const next = scheduler.request("c", () => 2, work("C", 6));
    expect(next).not.toBe(first);
  });

  it("pedir una clave ya encolada no la duplica", async () => {
    const { scheduler, runTanda } = setup();
    const run = vi.fn(() => "A");
    scheduler.request("a", () => 0, run);
    scheduler.request("a", () => 0, run);
    await runTanda();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("si un trabajo lanza, la tanda no se rompe: el bloque queda con resultado vacío y los demás siguen", async () => {
    const { scheduler, work, runTanda } = setup({ budgetMs: 100 });
    scheduler.request("mal", () => 0, () => {
      throw new Error("gramática rota");
    });
    scheduler.request("bien", () => 1, work("OK", 1));
    await runTanda();
    expect(scheduler.get("mal")).toBeNull();
    expect(scheduler.get("bien")).toBe("OK");
  });

  it("la caché está acotada: al pasar la capacidad se olvida lo más antiguo", async () => {
    const { scheduler, work, runTanda } = setup({ budgetMs: 1000, capacity: 3 });
    for (let i = 0; i < 5; i++) scheduler.request(`k${i}`, () => i, work(`v${i}`, 1));
    await runTanda();
    expect(scheduler.get("k0")).toBeUndefined();
    expect(scheduler.get("k1")).toBeUndefined();
    expect(scheduler.get("k4")).toBe("v4");
  });
});
