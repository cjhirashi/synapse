import { afterEach, expect, test, vi } from "vitest";
import { registerServiceWorker } from "./serviceWorker";

afterEach(() => vi.unstubAllGlobals());

test("fuera de producción no registra nada", () => {
  const register = vi.fn();
  vi.stubGlobal("navigator", { serviceWorker: { register } });
  registerServiceWorker({ PROD: false });
  window.dispatchEvent(new Event("load"));
  expect(register).not.toHaveBeenCalled();
});

test("en producción registra /sw.js con alcance raíz al cargar", async () => {
  const register = vi.fn().mockResolvedValue({ addEventListener: vi.fn(), waiting: null });
  vi.stubGlobal("navigator", { serviceWorker: { register, controller: null } });
  registerServiceWorker({ PROD: true });
  window.dispatchEvent(new Event("load"));
  await Promise.resolve();
  expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
});
