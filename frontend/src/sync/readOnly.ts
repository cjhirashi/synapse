/** Envoltura de solo lectura de los almacenes de una réplica compartida (H-064 F7c). */

export class ReadOnlyReplicaError extends Error {
  constructor() {
    super("Esta bóveda es de solo lectura.");
    this.name = "ReadOnlyReplicaError";
  }
}

/**
 * Deniega por defecto: solo los métodos de `allowed` llegan al almacén. Cualquier otro método devuelve una función que
 * rechaza con `ReadOnlyReplicaError` al llamarla (acceder a la propiedad no falla: `const { save } = notes` es inocuo).
 */
export function readOnly<T extends object>(store: T, allowed: readonly string[]): T {
  const reads = new Set(allowed);
  return new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop !== "string" || typeof value !== "function" || reads.has(prop)) return value;
      return () => Promise.reject(new ReadOnlyReplicaError());
    },
  });
}
