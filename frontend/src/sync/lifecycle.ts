/** Cola de apertura y cierre de recursos de sincronización (SyncProvider, SharedVaultPage). */

/** Cola compartida: cada tarea espera a la anterior para evitar dos replicadores o destrucciones cruzadas. */
let lifecycle: Promise<unknown> = Promise.resolve();

/** Ejecuta una tarea en serie en la cola de apertura y cierre. */
export function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = lifecycle.then(task);
  lifecycle = run.catch(() => undefined);
  return run;
}
