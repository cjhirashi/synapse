/**
 * Programador de precálculo (SPEC-0010 RNF-001, PLAN-0010 §10.5).
 *
 * Vive en el `Workspace` (chunk de la entrada, ~2 KiB: sin Milkdown ni remark). Elige qué notas
 * grandes parsear por adelantado y lo hace SIN degradar el RNF-001 de 0009: el parseo corre en el
 * Worker, y el trabajo del hilo principal (leer el cuerpo, `postMessage`) va en `requestIdleCallback`,
 * una nota por franja y **una sola nota en el Worker a la vez**. Se pausa mientras se abre una nota o
 * el árbol se re-renderiza. Al vaciarse la cola emite `performance.mark("synapse:precompute-idle")`.
 *
 * Prioridad (§10.5): (1) la fila bajo el puntero o con el foco; (2) el historial de la bóveda, recientes
 * primero; (3) las notas de carpetas desplegadas; (4) el resto, en orden de árbol.
 */
import type { ParseCache } from "./parseCache";

export interface PrecomputeCandidate {
  id: string;
  rev: string;
  /** Longitud de `content` (del resumen de `noteStore`). */
  size: number;
}

export interface PrecomputeContext {
  /** Historial de la bóveda, recientes primero (RF-057). */
  history?: string[];
  /** Ids de notas en carpetas desplegadas. */
  expanded?: Set<string>;
}

export interface PrecomputeDeps {
  cache: Pick<ParseCache, "request">;
  /** Lee el cuerpo de la nota (hilo principal): `notes.get`. `null` si ya no existe. */
  getContent: (id: string) => Promise<{ content: string; rev: string } | null>;
  /** `requestIdleCallback` (inyectable; en pruebas se controla). */
  requestIdle?: (callback: () => void) => void;
  /** Tamaño mínimo de `content` para precalcular; por defecto 32 KiB (§10.4). */
  minSize?: number;
}

const DEFAULT_MIN_SIZE = 32 * 1024;

const defaultIdle = (cb: () => void): void => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(cb, { timeout: 2000 });
  else setTimeout(cb, 0);
};

const key = (c: PrecomputeCandidate): string => `${c.id}@${c.rev}`;

export class PrecomputeScheduler {
  readonly #deps: Required<Pick<PrecomputeDeps, "cache" | "getContent">> & { requestIdle: (cb: () => void) => void; minSize: number };
  #candidates: PrecomputeCandidate[] = [];
  /** `id@rev` ya pedidos (o en curso): no se repiten salvo que cambie la revisión. */
  readonly #done = new Set<string>();
  #prioritized: string | null = null;
  #inFlight = false;
  #paused = false;
  #scheduled = false;
  #disposed = false;
  #idleEmitted = false;

  constructor(deps: PrecomputeDeps) {
    this.#deps = {
      cache: deps.cache,
      getContent: deps.getContent,
      requestIdle: deps.requestIdle ?? defaultIdle,
      minSize: deps.minSize ?? DEFAULT_MIN_SIZE,
    };
  }

  /** Define/reconcilia las candidatas (tras montar el `Workspace` y tras cada `notesVersion`). */
  reconcile(candidates: PrecomputeCandidate[], context: PrecomputeContext = {}): void {
    if (this.#disposed) return;
    const big = candidates.filter((c) => c.size >= this.#deps.minSize);
    this.#candidates = this.#sort(big, context);
    this.#idleEmitted = false;
    this.#pump();
  }

  /** Puntero/foco sobre una fila: esa nota pasa al frente y se pide cuanto antes. */
  prioritize(id: string): void {
    if (this.#disposed) return;
    this.#prioritized = id;
    // Reordena dejando la priorizada primero, conservando el resto.
    this.#candidates = [...this.#candidates].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    this.#idleEmitted = false;
    this.#pump();
  }

  pause(): void {
    this.#paused = true;
  }

  resume(): void {
    if (this.#disposed) return;
    this.#paused = false;
    this.#pump();
  }

  dispose(): void {
    this.#disposed = true;
    this.#candidates = [];
    this.#done.clear();
  }

  /** Orden por prioridad: priorizada > historial (recientes primero) > carpeta desplegada > árbol. */
  #sort(candidates: PrecomputeCandidate[], { history = [], expanded = new Set<string>() }: PrecomputeContext): PrecomputeCandidate[] {
    const rank = (c: PrecomputeCandidate, treeIndex: number): number => {
      if (c.id === this.#prioritized) return -1;
      const h = history.indexOf(c.id);
      if (h >= 0) return h; // 0, 1, 2… recientes primero
      if (expanded.has(c.id)) return history.length + treeIndex;
      return history.length + candidates.length + treeIndex;
    };
    return candidates.map((c, i) => ({ c, r: rank(c, i), i })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.c);
  }

  /** La próxima candidata no hecha, o `undefined` si la cola está vacía. */
  #next(): PrecomputeCandidate | undefined {
    return this.#candidates.find((c) => !this.#done.has(key(c)));
  }

  /** Programa una franja idle si procede (no pausado, nada en vuelo, hay trabajo). */
  #pump(): void {
    if (this.#disposed || this.#paused || this.#inFlight || this.#scheduled) return;
    const next = this.#next();
    if (!next) {
      if (!this.#idleEmitted) {
        this.#idleEmitted = true;
        if (typeof performance !== "undefined" && typeof performance.mark === "function") performance.mark("synapse:precompute-idle");
      }
      return;
    }
    this.#scheduled = true;
    this.#deps.requestIdle(() => {
      this.#scheduled = false;
      void this.#step();
    });
  }

  /** Lee el cuerpo de la próxima candidata y pide su parseo (una sola nota a la vez). */
  async #step(): Promise<void> {
    if (this.#disposed || this.#paused || this.#inFlight) return;
    const next = this.#next();
    if (!next) {
      this.#pump();
      return;
    }
    this.#inFlight = true;
    this.#done.add(key(next));
    try {
      const body = await this.#deps.getContent(next.id);
      if (!this.#disposed && body && body.rev === next.rev && body.content.length >= this.#deps.minSize) {
        await this.#deps.cache.request(next.id, next.rev, body.content);
      }
    } catch {
      // Un fallo al leer o parsear una nota no detiene el precálculo de las demás.
    } finally {
      this.#inFlight = false;
      if (!this.#disposed) this.#pump();
    }
  }
}
