/**
 * Planificador del resaltado fuera del camino crítico (SPEC-0010 RNF-001, RF-027, RF-028; PLAN-0010 §11.2).
 *
 * `prosemirror-highlight` pide el resaltado de todos los bloques al montar y, por cada promesa que le damos, hace
 * un refresco del documento entero al resolverse. Aquí los bloques que aún no tienen resultado se encolan y se
 * procesan en idle **por tandas** con presupuesto de tiempo, los más cercanos al viewport primero. Todos los bloques
 * pendientes reciben **la misma promesa** —la de la tanda en curso—, así el plugin hace un único refresco por tanda.
 * Genérico en el resultado (`T`): el planificador no sabe de Lezer.
 */
import { whenIdle } from "../deferred/idle";

interface SchedulerOptions {
  /** Presupuesto de una tanda en ms (siempre se procesa al menos un bloque). */
  budgetMs?: number;
  /** Resultados guardados como máximo (se olvida lo más antiguo). */
  capacity?: number;
  now?: () => number;
  idle?: (run: () => void) => () => void;
}

interface Job<T> {
  distance: () => number;
  work: () => T;
}

export interface HighlightScheduler<T> {
  /** Encola `work` bajo `key` (una clave ya encolada no se duplica) y devuelve la promesa de la tanda en curso. */
  request(key: string, distance: () => number, work: () => T): Promise<void>;
  /** El resultado de `key`: `undefined` si no se ha procesado, `null` si su trabajo falló. */
  get(key: string): T | null | undefined;
}

export function createHighlightScheduler<T>({
  budgetMs = 10,
  capacity = 200,
  now = () => performance.now(),
  idle = (run) => whenIdle(run),
}: SchedulerOptions = {}): HighlightScheduler<T> {
  const results = new Map<string, T | null>();
  const queue = new Map<string, Job<T>>();
  let scheduled = false;

  // Promesa compartida de la tanda en curso.
  let settle: () => void = () => {};
  const makePromise = () => new Promise<void>((resolve) => (settle = resolve));
  let current = makePromise();

  const store = (key: string, value: T | null) => {
    results.set(key, value);
    // Se olvida lo más antiguo (el orden de inserción de `Map`).
    while (results.size > capacity) results.delete(results.keys().next().value as string);
  };

  function runTanda() {
    scheduled = false;
    // Los más cercanos al viewport primero (la distancia se lee ahora: el usuario pudo desplazarse).
    const ordered = [...queue.entries()].map(([key, job]) => ({ key, job, distance: job.distance() })).sort((a, b) => a.distance - b.distance);
    const started = now();
    for (const { key, job } of ordered) {
      queue.delete(key);
      try {
        store(key, job.work());
      } catch {
        // Un bloque que no se puede resaltar queda sin colores, sin romper la tanda ni escribir en consola.
        store(key, null);
      }
      if (now() - started >= budgetMs) break;
    }
    const done = settle;
    current = makePromise();
    done();
    if (queue.size > 0) schedule();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    idle(runTanda);
  }

  return {
    request(key, distance, work) {
      if (!queue.has(key)) queue.set(key, { distance, work });
      schedule();
      return current;
    },
    get: (key) => results.get(key),
  };
}
