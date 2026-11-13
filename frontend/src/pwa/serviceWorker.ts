/// <reference types="vite/client" />
/** Registro del service worker (H-053). Solo en producción; una versión nueva queda en espera hasta que la persona la acepta. */
export const SW_UPDATE_EVENT = "synapse:sw-update";

let waiting: ServiceWorker | null = null;

function announce(worker: ServiceWorker): void {
  waiting = worker;
  window.dispatchEvent(new Event(SW_UPDATE_EVENT));
}

export function pendingUpdate(): boolean {
  return waiting !== null;
}

/** Activa la versión en espera y recarga cuando toma el control. */
export function applyUpdate(): void {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
  waiting.postMessage({ type: "SKIP_WAITING" });
}

export function registerServiceWorker(env: { PROD: boolean } = import.meta.env): void {
  if (!env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) announce(worker);
          });
        });
      })
      .catch(() => undefined);
  });
}
