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

/** Cada cuánto busca una versión nueva mientras la app sigue abierta (el navegador solo lo hace al abrirla de cero). */
export const UPDATE_CHECK_MS = 10 * 60 * 1000;

/** Registra el service worker y vigila versiones nuevas. Devuelve la función que deshace lo que dejó puesto. */
export function registerServiceWorker(env: { PROD: boolean } = import.meta.env): () => void {
  if (!env.PROD || !("serviceWorker" in navigator)) return () => undefined;
  const cleanups: Array<() => void> = [];
  const onLoad = () => {
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
        // Una app instalada puede pasar días abierta: se busca al volver a ella y cada 10 minutos, sin esperar a que se reabra.
        const check = () => void reg.update().catch(() => undefined);
        const onVisible = () => { if (!document.hidden) check(); };
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", check);
        const timer = window.setInterval(onVisible, UPDATE_CHECK_MS);
        cleanups.push(() => {
          document.removeEventListener("visibilitychange", onVisible);
          window.removeEventListener("focus", check);
          window.clearInterval(timer);
        });
      })
      .catch(() => undefined);
  };
  window.addEventListener("load", onLoad);
  return () => {
    window.removeEventListener("load", onLoad);
    cleanups.forEach((fn) => fn());
  };
}
