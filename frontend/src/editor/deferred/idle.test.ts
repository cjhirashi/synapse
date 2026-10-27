// RNF-001, RF-046 (SPEC-0010; PLAN-0010 §11.2): utilidades para sacar trabajo decorativo del camino crítico.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeVisibility, whenIdle } from "./idle";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("whenIdle", () => {
  it("usa requestIdleCallback con su timeout y devuelve cómo cancelarlo", () => {
    const request = vi.fn(() => 7);
    const cancel = vi.fn();
    vi.stubGlobal("requestIdleCallback", request);
    vi.stubGlobal("cancelIdleCallback", cancel);
    const run = vi.fn();
    const off = whenIdle(run, 250);
    expect(request).toHaveBeenCalledWith(expect.any(Function), { timeout: 250 });
    (request.mock.calls[0] as unknown as [() => void])[0]();
    expect(run).toHaveBeenCalledTimes(1);
    off();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it("sin requestIdleCallback cae a setTimeout y cancelar lo impide", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const run = vi.fn();
    whenIdle(run);
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    const cancelled = vi.fn();
    whenIdle(cancelled)();
    vi.advanceTimersByTime(50);
    expect(cancelled).not.toHaveBeenCalled();
  });
});

describe("observeVisibility", () => {
  let instances: Array<{ cb: IntersectionObserverCallback; options?: IntersectionObserverInit; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>;
  beforeEach(() => {
    instances = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          instances.push({ cb, options, observe: this.observe, disconnect: this.disconnect });
        }
      },
    );
  });

  const entry = (isIntersecting: boolean) => [{ isIntersecting }] as IntersectionObserverEntry[];

  it("observa con un margen de 300 px y avisa de entrar y salir", () => {
    const el = document.createElement("div");
    const seen = vi.fn();
    observeVisibility(el, seen);
    expect(instances[0].options?.rootMargin).toBe("300px 0px");
    expect(instances[0].observe).toHaveBeenCalledWith(el);
    instances[0].cb(entry(true), {} as IntersectionObserver);
    instances[0].cb(entry(false), {} as IntersectionObserver);
    expect(seen.mock.calls).toEqual([[true], [false]]);
  });

  it("darse de baja desconecta el observador", () => {
    const off = observeVisibility(document.createElement("div"), () => {});
    off();
    expect(instances[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it("sin IntersectionObserver avisa «visible» de inmediato", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const seen = vi.fn();
    const off = observeVisibility(document.createElement("div"), seen);
    expect(seen).toHaveBeenCalledWith(true);
    expect(() => off()).not.toThrow();
  });
});
