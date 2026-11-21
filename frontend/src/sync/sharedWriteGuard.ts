/**
 * Guarda de escritura de la réplica de una bóveda compartida (H-064 F7d). Envuelve la base local que usa el almacén de notas del
 * invitado y revisa cada documento ANTES de escribirlo, con el mismo criterio que el servidor (`SharedPushService`): solo notas de
 * la bóveda, con escritura en la ruta nueva y en la actual, y sin cambiar de ruta (mover y renombrar son del propietario).
 *
 * Es una barrera interior: lo que llegara a la réplica sin pasar por aquí lo rechazaría igual el servidor, pero no se escribe
 * nada que se sabe rechazado, que aparecería como un cambio pendiente que nunca se confirma. Denegación por defecto: solo pasan
 * las lecturas de la lista blanca y la escritura vigilada; cualquier otro método rechaza.
 */
import { canWritePath } from "../sharing/access";
import type { Grant } from "../sharing/sharingApi";

export class SharedWriteDeniedError extends Error {
  constructor(readonly reason: "vault" | "path" | "move") {
    super(
      reason === "move" ? "Solo el propietario puede mover o renombrar." : reason === "vault" ? "Solo se escriben notas de esta bóveda." : "No tienes permiso de escritura en esta carpeta.",
    );
    this.name = "SharedWriteDeniedError";
  }
}

const READS = new Set(["get", "allDocs", "changes", "info", "query", "bulkGet", "revsDiff"]);
type Doc = { _id?: unknown; path?: unknown };

export function guardSharedDb(db: PouchDB.Database, vaultId: string, grants: readonly Grant[]): PouchDB.Database {
  /** Rechaza si `doc` no es una nota de la bóveda con ruta escribible, o si cambia la ruta de una nota que ya existe. */
  async function check(doc: Doc): Promise<void> {
    const id = doc._id;
    if (typeof id !== "string" || !id.startsWith(`note:${vaultId}:`)) throw new SharedWriteDeniedError("vault");
    if (typeof doc.path !== "string" || !canWritePath(grants, doc.path)) throw new SharedWriteDeniedError("path");
    let current: Doc | null = null;
    try {
      current = await db.get<Doc>(id);
    } catch (err) {
      if ((err as { status?: number }).status !== 404) throw err;
    }
    if (current === null) return;
    if (typeof current.path !== "string" || !canWritePath(grants, current.path)) throw new SharedWriteDeniedError("path");
    if (current.path !== doc.path) throw new SharedWriteDeniedError("move");
  }

  const guarded: Record<string, unknown> = {
    async put(doc: Doc, ...rest: unknown[]) {
      await check(doc);
      return (db.put as (...a: unknown[]) => Promise<unknown>)(doc, ...rest);
    },
    async bulkDocs(request: Doc[] | { docs: Doc[] }, ...rest: unknown[]) {
      const docs = Array.isArray(request) ? request : request.docs;
      for (const doc of docs) await check(doc);
      return (db.bulkDocs as (...a: unknown[]) => Promise<unknown>)(request, ...rest);
    },
  };

  return new Proxy(db, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && prop in guarded) return guarded[prop];
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop !== "string" || typeof value !== "function" || READS.has(prop)) return typeof value === "function" ? value.bind(target) : value;
      return () => Promise.reject(new SharedWriteDeniedError("vault"));
    },
  });
}
