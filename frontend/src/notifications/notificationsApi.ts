/** Cliente de los avisos de la persona (H-053): `/notifications`. Solo con la sesión; las fechas llegan en UTC con `Z`. */
import { request } from "../api/auth";

export type NoticeKind = "task_assigned" | "task_status" | "task_due";

export interface Notice {
  id: string;
  kind: NoticeKind | string;
  title: string;
  body: string | null;
  vault_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
}

/** Aviso de que la bandeja cambió (se leyó o se marcó): el contador del riel se relee sin esperar su turno. */
export const NOTICES_CHANGED = "synapse:notices-changed";

export async function listNotices(): Promise<{ items: Notice[]; unread: number }> {
  return (await request("/notifications?limit=100")).json();
}

export async function unreadCount(): Promise<number> {
  return ((await (await request("/notifications/unread-count")).json()) as { count: number }).count;
}

export async function markRead(id: string): Promise<void> {
  await request(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
  window.dispatchEvent(new Event(NOTICES_CHANGED));
}

export async function markAllRead(): Promise<void> {
  await request("/notifications/read-all", { method: "POST" });
  window.dispatchEvent(new Event(NOTICES_CHANGED));
}

export interface QuietHours { enabled: boolean; start: string; end: string }
export interface Preferences { kinds: Record<NoticeKind, boolean>; quiet: QuietHours }

export async function getPreferences(): Promise<Preferences> {
  return (await request("/notifications/preferences")).json();
}

export async function setPreference(kind: NoticeKind, enabled: boolean): Promise<Preferences> {
  const res = await request("/notifications/preferences", { method: "PUT", body: JSON.stringify({ kinds: { [kind]: enabled } }) });
  return res.json();
}

export async function setQuietHours(quiet: QuietHours): Promise<Preferences> {
  const res = await request("/notifications/preferences", { method: "PUT", body: JSON.stringify({ quiet }) });
  return res.json();
}

export interface PushStatus { enabled: boolean; public_key: string | null; devices: number }

export async function pushStatus(): Promise<PushStatus> {
  return (await request("/notifications/push")).json();
}

export async function saveSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  await request("/notifications/push/subscription", { method: "PUT", body: JSON.stringify(subscription) });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await request(`/notifications/push/subscription?endpoint=${encodeURIComponent(endpoint)}`, { method: "DELETE" });
}

export async function sendTestPush(): Promise<{ sent: number; removed: number; failed: number }> {
  return (await request("/notifications/push/test", { method: "POST" })).json();
}
