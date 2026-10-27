/**
 * Historial de notas abiertas, por bóveda y pestaña (SPEC-0010 RF-056…RF-058; PLAN-0010 §2.1).
 *
 * Módulo puro: la nota abierta no está en la URL (SPEC-0008), así que Atrás/Adelante son del propio editor.
 * Guarda **ids** de nota (no rutas), de modo que una nota renombrada o movida sigue siendo navegable; si una
 * entrada ya no existe (borrada), `step` la salta. Se persiste en `sessionStorage` (sobrevive a recargar la
 * pestaña, no se comparte entre pestañas) con la forma validada al leer.
 */
import { parseNoteId } from "./noteRules";

/** Entradas como máximo (se descarta la más antigua). */
export const HISTORY_MAX = 50;

export interface History {
  entries: readonly string[];
  /** Posición actual dentro de `entries` (`-1` si está vacío). */
  index: number;
}

export const EMPTY_HISTORY: History = { entries: [], index: -1 };

type Direction = -1 | 1;

/** Abrir una nota la añade tras la posición actual y descarta las entradas «adelante»; la actual no se duplica. */
export function push(history: History, id: string): History {
  if (history.entries[history.index] === id) return history;
  const entries = [...history.entries.slice(0, history.index + 1), id].slice(-HISTORY_MAX);
  return { entries, index: entries.length - 1 };
}

/**
 * Mueve la posición a la primera entrada válida en esa dirección (salta las borradas, RF-058). `null` si no hay
 * ninguna. No añade entradas.
 */
export function step(history: History, direction: Direction, isValid: (id: string) => boolean): { history: History; target: string } | null {
  for (let i = history.index + direction; i >= 0 && i < history.entries.length; i += direction) {
    if (isValid(history.entries[i])) return { history: { entries: history.entries, index: i }, target: history.entries[i] };
  }
  return null;
}

export const canStep = (history: History, direction: Direction, isValid: (id: string) => boolean): boolean => step(history, direction, isValid) !== null;

export const historyKey = (vaultId: string): string => `synapse:note-history:${vaultId}`;

/** El historial guardado de la bóveda; ausente, corrupto o ilegible → vacío. */
export function load(storage: Storage, vaultId: string): History {
  try {
    const raw = storage.getItem(historyKey(vaultId));
    if (raw === null) return EMPTY_HISTORY;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return EMPTY_HISTORY;
    const { entries, index } = data as { entries?: unknown; index?: unknown };
    if (!Array.isArray(entries) || entries.length > HISTORY_MAX) return EMPTY_HISTORY;
    if (!entries.every((entry) => typeof entry === "string" && parseNoteId(entry)?.vaultId === vaultId)) return EMPTY_HISTORY;
    if (!Number.isInteger(index) || (index as number) < (entries.length === 0 ? -1 : 0) || (index as number) >= entries.length) return EMPTY_HISTORY;
    return { entries: entries as string[], index: index as number };
  } catch {
    return EMPTY_HISTORY;
  }
}

/** Guarda el historial; si el almacenamiento no está disponible (modo privado, cuota) se pierde sin romper nada. */
export function save(storage: Storage, vaultId: string, history: History): void {
  try {
    storage.setItem(historyKey(vaultId), JSON.stringify(history));
  } catch {
    // Sin persistencia: el historial sigue en memoria mientras dure la pestaña abierta.
  }
}
