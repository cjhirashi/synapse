/**
 * Caché de parseo + programador de precálculo del `Workspace` (SPEC-0010 RNF-001, PLAN-0010 §10.4/§10.5).
 *
 * Reúne el Worker, la `ParseCache` y el `PrecomputeScheduler` en una sola pieza con un `dispose`: el
 * `Workspace` la crea al montarse (por bóveda) y la destruye al desmontarse (cambio de bóveda, logout).
 * Aquí vive el `new Worker(new URL("../editor/markdown/parseWorker.ts", …))`, así Vite emite el Worker
 * en un chunk propio (fuera de la entrada y del editor, RNF-002). Si el entorno no tiene `Worker`
 * (jsdom de las pruebas unitarias), devuelve `null` y el workspace funciona sin precálculo.
 */
import { ParseCache } from "../editor/markdown/parseCache";
import { PrecomputeScheduler } from "../editor/markdown/precompute";
import type { NoteStore } from "./noteStore";

export interface ParseWorkspace {
  cache: ParseCache;
  scheduler: PrecomputeScheduler;
  dispose(): void;
}

export function createParseWorkspace(notes: NoteStore): ParseWorkspace | null {
  if (typeof Worker === "undefined") return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL("../editor/markdown/parseWorker.ts", import.meta.url), { type: "module" });
  } catch {
    return null; // sin Worker (p. ej. jsdom): el workspace sigue sin precálculo
  }
  const cache = new ParseCache(worker);
  const scheduler = new PrecomputeScheduler({
    cache,
    getContent: (id) => notes.get(id).then((note) => ({ content: note.content, rev: note.rev })).catch(() => null),
  });
  return {
    cache,
    scheduler,
    dispose() {
      scheduler.dispose();
      cache.dispose();
    },
  };
}
