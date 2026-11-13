import { afterEach, expect, test, vi } from "vitest";
import { UPDATE_CHECK_MS, registerServiceWorker } from "./serviceWorker";

afterEach(() => vi.unstubAllGlobals());

test("fuera de producción no registra nada", () => {
  const register = vi.fn();
  vi.stubGlobal("navigator", { serviceWorker: { register } });
  const stop = registerServiceWorker({ PROD: false });
  window.dispatchEvent(new Event("load"));
  expect(register).not.toHaveBeenCalled();
  stop();
});

test("en producción registra /sw.js con alcance raíz al cargar", async () => {
  const register = vi.fn().mockResolvedValue({ addEventListener: vi.fn(), waiting: null, update: vi.fn().mockResolvedValue(undefined) });
  vi.stubGlobal("navigator", { serviceWorker: { register, controller: null } });
  const stop = registerServiceWorker({ PROD: true });
  window.dispatchEvent(new Event("load"));
  await Promise.resolve();
  expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  stop();
});

test("con la app abierta busca una versión nueva al volver a ella y cada diez minutos, sin esperar a que se reabra", async () => {
  vi.useFakeTimers();
  let stop = () => {};
  try {
    const update = vi.fn().mockResolvedValue(undefined);
    const register = vi.fn().mockResolvedValue({ addEventListener: vi.fn(), waiting: null, update });
    vi.stubGlobal("navigator", { serviceWorker: { register, controller: {} } });
    stop = registerServiceWorker({ PROD: true });
    window.dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(0);
    expect(update).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("focus"));
    expect(update).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MS);
    expect(update).toHaveBeenCalledTimes(3);
    stop();
    window.dispatchEvent(new Event("focus"));
    expect(update).toHaveBeenCalledTimes(3); // ya desmontado: no sigue buscando
  } finally {
    stop();
    vi.useRealTimers();
  }
});
