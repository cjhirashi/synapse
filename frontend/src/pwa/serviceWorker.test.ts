import { afterEach, expect, test, vi } from "vitest";
import { SW_UPDATE_EVENT, UPDATE_CHECK_MS, registerServiceWorker } from "./serviceWorker";

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
  expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
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

async function boot(reg: Record<string, unknown>, controller: unknown) {
  const register = vi.fn().mockResolvedValue({ addEventListener: vi.fn(), waiting: null, installing: null, active: null, update: vi.fn().mockResolvedValue(undefined), ...reg });
  vi.stubGlobal("navigator", { serviceWorker: { register, controller } });
  const stop = registerServiceWorker({ PROD: true });
  const seen = vi.fn();
  window.addEventListener(SW_UPDATE_EVENT, seen);
  window.dispatchEvent(new Event("load"));
  await Promise.resolve();
  await Promise.resolve();
  return { stop, seen };
}

test("avisa de una versión en espera aunque la página cargara sin worker (Ctrl+F5), si el registro ya tenía uno activo", async () => {
  const { stop, seen } = await boot({ waiting: { state: "installed" }, active: {} }, null);
  expect(seen).toHaveBeenCalledTimes(1);
  stop();
});

test("la primera instalación (sin versión previa) no avisa de nada", async () => {
  const { stop, seen } = await boot({ waiting: { state: "installed" } }, null);
  expect(seen).not.toHaveBeenCalled();
  stop();
});

test("avisa cuando la versión nueva ya se estaba instalando al registrarse y termina después", async () => {
  let onState: () => void = () => undefined;
  const worker = { state: "installing", addEventListener: (_: string, fn: () => void) => { onState = fn; } };
  const { stop, seen } = await boot({ installing: worker }, {});
  expect(seen).not.toHaveBeenCalled();
  worker.state = "installed";
  onState();
  expect(seen).toHaveBeenCalledTimes(1);
  stop();
});
