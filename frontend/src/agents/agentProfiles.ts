/** Caché compartida de los perfiles de agente (H-053): una sola lectura para todas las filas y vistas que muestran agentes. */
import { useEffect, useSyncExternalStore } from "react";
import { AGENT_PROFILES_CHANGED, listAgentProfiles, type AgentProfile } from "./agentProfilesApi";

type ProfileMap = Readonly<Record<string, AgentProfile>>;
const EMPTY: ProfileMap = Object.freeze({});
let cache: ProfileMap | null = null;
let inflight = false;
const listeners = new Set<() => void>();

function publish(next: ProfileMap): void {
  cache = next;
  listeners.forEach((fn) => fn());
}

function load(): void {
  if (inflight) return;
  inflight = true;
  listAgentProfiles()
    .then((items) => publish(Object.fromEntries(items.map((p) => [p.agent_id, p]))))
    .catch(() => publish(cache ?? EMPTY)) // sin red o sin sesión: se muestran los ids, sin perfil
    .finally(() => { inflight = false; });
}

if (typeof window !== "undefined") window.addEventListener(AGENT_PROFILES_CHANGED, load);

/** Solo para las pruebas: vacía la caché compartida. */
export function resetAgentProfiles(): void {
  cache = null;
  inflight = false;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Todos los perfiles de agente de la persona (se leen una vez y se refrescan al cambiar alguno). */
export function useAgentProfiles(): ProfileMap {
  const current = useSyncExternalStore(subscribe, () => cache, () => null);
  useEffect(() => {
    if (cache === null) load();
  }, []);
  return current ?? EMPTY;
}

/** Nombre que se muestra de un agente: su nombre visible o, sin él, su id. */
export function agentName(agentId: string, profiles: ProfileMap): string {
  return profiles[agentId]?.display_name || agentId;
}
