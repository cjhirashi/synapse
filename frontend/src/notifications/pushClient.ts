/** Suscripción de este dispositivo a Web Push (H-053). El permiso se pide solo tras un clic de la persona. */
import { removeSubscription, saveSubscription } from "./notificationsApi";

export type PushSupport = "unsupported" | "no-worker" | "denied" | "ready";

export function pushSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration("/");
}

export async function supportState(): Promise<PushSupport> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return (await registration()) ? "ready" : "no-worker";
}

export async function currentEndpoint(): Promise<string | null> {
  const reg = pushSupported() ? await registration() : undefined;
  return (await reg?.pushManager.getSubscription())?.endpoint ?? null;
}

function keyBytes(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** Pide permiso, suscribe este dispositivo y lo registra en el servidor. Devuelve `false` si la persona no concede el permiso. */
export async function enablePush(publicKey: string): Promise<boolean> {
  const reg = await registration();
  if (!reg) throw new Error("sin service worker");
  if ((await Notification.requestPermission()) !== "granted") return false;
  const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await saveSubscription(subscription.toJSON());
  return true;
}

export async function disablePush(): Promise<void> {
  const reg = await registration();
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await removeSubscription(endpoint);
}
