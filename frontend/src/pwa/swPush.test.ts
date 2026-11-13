import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";

/** Carga `public/sw.js` con un `self` falso y devuelve lo que registró. */
function loadWorker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
  const posted = vi.fn();
  const self = {
    location: { origin: "https://synapse.test" },
    addEventListener: (type: string, fn: (event: unknown) => void) => { handlers[type] = fn; },
    registration: { showNotification: (title: string, options: Record<string, unknown>) => { shown.push({ title, options }); return Promise.resolve(); } },
    clients: { matchAll: () => Promise.resolve([{ postMessage: posted }]), claim: vi.fn() },
    skipWaiting: vi.fn(),
  };
  runInNewContext(readFileSync(resolve(__dirname, "../../public/sw.js"), "utf8"), { self, caches: {}, URL, Request, fetch: vi.fn() });
  return { handlers, shown, posted };
}

async function push(handlers: Record<string, (event: unknown) => void>, data: unknown) {
  const waits: Promise<unknown>[] = [];
  handlers.push({ data: { json: () => data }, waitUntil: (p: Promise<unknown>) => waits.push(p) });
  await Promise.all(waits);
}

test("un push con etiqueta se muestra con `renotify` (sustituye la anterior pero vuelve a avisar) y la app abierta se entera", async () => {
  const { handlers, shown, posted } = loadWorker();
  await push(handlers, { title: "«Entrega» vence en 1 h", body: "Vence hoy", tag: "n1", url: "/vaults/v?tab=tareas&task=t" });
  expect(shown).toHaveLength(1);
  expect(shown[0].title).toBe("«Entrega» vence en 1 h");
  expect(shown[0].options).toMatchObject({ tag: "n1", renotify: true, data: { url: "/vaults/v?tab=tareas&task=t" } });
  expect(posted).toHaveBeenCalledWith({ type: "NOTICES_CHANGED" });
});

test("sin etiqueta no activa `renotify` (el navegador lo rechazaría) y una URL ajena cae en /avisos", async () => {
  const { handlers, shown } = loadWorker();
  await push(handlers, { title: "Hola", url: "https://otro.sitio/x" });
  expect(shown[0].options.renotify).toBe(false);
  expect(shown[0].options.tag).toBeUndefined();
  expect(shown[0].options.data).toEqual({ url: "/avisos" });
});
