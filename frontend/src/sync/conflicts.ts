/**
 * Conflictos de la réplica local (SPEC-0005 RF-012…RF-015; ADR-003; PLAN-0005 §2.6).
 *
 * Busca bóvedas con varias hojas vivas al arrancar y en cada cambio de la réplica, y para
 * cada perdedora `L` frente a la ganadora `W` (la que elige PouchDB, igual en todas las
 * réplicas):
 * - lee el ancestro común del árbol de revisiones local (la revisión más reciente que está
 *   en la historia de ambas);
 * - aplica `mergeVault` y, si combina, escribe en un solo `bulkDocs` el resultado como hija
 *   de `W` y una lápida sobre `L` (sólo la lápida si `W` ya es el resultado);
 * - si no combina, la deja en la lista de conflictos manuales con ambas versiones; nada se
 *   escribe ni se pierde (RF-013). `resolve()` escribe la elección del usuario igual.
 *
 * La escritura usa `new_edits: false` con revisiones generadas aquí, igual que las trae la
 * replicación: nunca falla por un 409. Si entre la lectura y la escritura llegó otra hoja
 * (otra pestaña que resolvía a la vez, el pull), el resultado queda como una rama más y la
 * siguiente pasada lo funde; nunca se cierra una rama cuyos cambios no se hayan combinado.
 *
 * Las revisiones son deterministas (enmienda 1, VC-2): el hash depende sólo de la revisión
 * padre y del contenido nuevo. Dos dispositivos que cierran la misma rama escriben la misma
 * lápida, y el servidor la recibe como una revisión que ya tiene (no la rechaza). Dos
 * resoluciones simultáneas parten de la misma `W`, así que sus resultados sólo pueden
 * diferir en `updated_at` y se funden cerrando una rama (paso 7, convergencia), otra vez con
 * lápidas iguales en todas las réplicas.
 *
 * Las resoluciones son ediciones normales para el push: el servidor las valida (RF-015) y,
 * si las rechaza, siguen el flujo de `rejections.ts` (RF-006).
 */
import { mergeVault, type MergeBody, type MergeResult } from "./merge";
import { validateVault, type VaultField, type VaultFields } from "./vaultRules";
import { ID_PREFIX, VaultChangedError, VaultValidationError, utcNow } from "./vaultStore";

/** Una pareja ganadora/perdedora que el usuario debe resolver (RF-013). */
export interface ManualConflict {
  /** Id del documento (`vault:{uuid}`). */
  id: string;
  reason: Extract<MergeResult, { kind: "manual" }>["reason"];
  /** Campos en choque o inválidos; vacío sin ancestro. */
  fields: VaultField[];
  winner: { rev: string; doc: MergeBody };
  loser: { rev: string; doc: MergeBody };
}

/** Lo que elige el usuario en la resolución manual. */
export interface ManualChoice extends VaultFields {
  deleted_at: string | null;
}

export interface ConflictsStore {
  list(): ManualConflict[];
  subscribe(listener: (items: ManualConflict[]) => void): () => void;
  /**
   * Resuelve a mano la pareja `W`/`loserRev`: la elección (normalizada con `vaultRules`)
   * como hija de `W` y una lápida sobre la perdedora. `VaultValidationError` si no cumple
   * las reglas; `VaultChangedError` si esa perdedora ya no está en conflicto.
   */
  resolve(id: string, loserRev: string, choice: ManualChoice): Promise<void>;
  /** Deja de seguir la réplica y de avisar a los suscriptores. */
  close(): void;
}

export interface ConflictsOptions {
  /** Reloj del `updated_at` de las resoluciones; por defecto `utcNow()`. */
  now?: () => string;
  /** Error al procesar un documento (la cola sigue con los demás); por defecto `console.error`. */
  onError?: (err: unknown) => void;
}

interface VaultRevision extends MergeBody {
  _id: string;
  _rev: string;
  _revisions: { start: number; ids: string[] };
  _conflicts?: string[];
  _deleted?: boolean;
}

/** Historia de una revisión, de ella hacia la raíz (`["3-c", "2-b", "1-a"]`). */
function history(doc: VaultRevision): string[] {
  const { start, ids } = doc._revisions;
  return ids.map((hash, i) => `${start - i}-${hash}`);
}

/**
 * JSON canónico: claves ordenadas en todos los niveles y sin las de valor `undefined`, para
 * que el mismo contenido dé el mismo texto en cualquier réplica. Dentro de una lista un
 * `undefined` pasa a `null`, como en `JSON.stringify` (VD-4): el resultado siempre es JSON.
 */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => (item === undefined ? "null" : canonical(item))).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Revisión hija de `parent` con `content` (su cuerpo nuevo, `_deleted` incluido). El hash es
 * SHA-256 del JSON canónico de la revisión padre y el contenido, recortado a 32 hex como los
 * de PouchDB: la misma escritura da la misma revisión en todas las réplicas (VC-2).
 */
async function child(parent: VaultRevision, content: object): Promise<Pick<VaultRevision, "_rev" | "_revisions">> {
  const input = new TextEncoder().encode(canonical({ parent: parent._rev, content }));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  const hash = Array.from(digest.subarray(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const start = parent._revisions.start + 1;
  return { _rev: `${start}-${hash}`, _revisions: { start, ids: [hash, ...parent._revisions.ids] } };
}

function body(doc: VaultRevision): MergeBody {
  return {
    name: doc.name,
    description: doc.description,
    tags: doc.tags,
    owner_id: doc.owner_id,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    deleted_at: doc.deleted_at,
  };
}

function isStatus(err: unknown, status: number): boolean {
  return (err as { status?: number } | null)?.status === status;
}

export async function openConflicts(db: PouchDB.Database, options: ConflictsOptions = {}): Promise<ConflictsStore> {
  const now = options.now ?? (() => utcNow());
  const onError = options.onError ?? ((err: unknown) => console.error(err));
  /** Conflictos manuales por documento (se recalculan en cada pasada; no se persisten). */
  const manual = new Map<string, ManualConflict[]>();
  const listeners = new Set<(items: ManualConflict[]) => void>();
  let queue: Promise<void> = Promise.resolve();

  function list(): ManualConflict[] {
    return [...manual.values()].flat();
  }

  /** Misma lista: las revisiones fijan el contenido, así que basta con comparar la pareja y el motivo. */
  function sameManual(a: ManualConflict[], b: ManualConflict[]): boolean {
    return a.length === b.length && a.every((item, i) => item.winner.rev === b[i].winner.rev
      && item.loser.rev === b[i].loser.rev && item.reason === b[i].reason && item.fields.join() === b[i].fields.join());
  }

  function setManual(id: string, items: ManualConflict[]): void {
    if (sameManual(manual.get(id) ?? [], items)) return;
    if (items.length === 0) manual.delete(id);
    else manual.set(id, items);
    const all = list();
    listeners.forEach((listener) => listener(all));
  }

  /** Revisión concreta, o `null` si no existe o su cuerpo ya no está (compactada, recibida sin él). */
  async function readRevision(id: string, rev: string): Promise<VaultRevision | null> {
    try {
      const doc = await db.get<VaultRevision>(id, { rev, revs: true });
      return doc._deleted ? null : doc;
    } catch (err) {
      if (isStatus(err, 404)) return null;
      throw err;
    }
  }

  /** Ancestro común: la revisión más reciente de la historia de `w` que también está en la de `l`. */
  async function readAncestor(w: VaultRevision, l: VaultRevision): Promise<VaultRevision | null> {
    const inLoser = new Set(history(l));
    const common = history(w).find((rev) => inLoser.has(rev));
    return common ? readRevision(w._id, common) : null;
  }

  /** Hija de `w` con `result` (si lo hay) + lápida sobre `l`, en un solo lote. */
  async function writeResolution(w: VaultRevision, l: VaultRevision, result: MergeBody | null): Promise<void> {
    const docs: object[] = [];
    if (result) {
      const content = { type: "vault", ...result };
      docs.push({ _id: w._id, ...(await child(w, content)), ...content });
    }
    const tombstone = { _deleted: true };
    docs.push({ _id: l._id, ...(await child(l, tombstone)), ...tombstone });
    await db.bulkDocs(docs as PouchDB.Core.PutDocument<{}>[], { new_edits: false });
  }

  /** Ganadora actual con sus perdedoras vivas, o `null` si el documento no existe. */
  async function readWinner(id: string): Promise<VaultRevision | null> {
    try {
      return await db.get<VaultRevision>(id, { conflicts: true, revs: true });
    } catch (err) {
      if (isStatus(err, 404)) return null;
      throw err;
    }
  }

  /**
   * Combina las perdedoras de `id` de una en una (cada escritura cambia la ganadora, así que
   * se vuelve a leer) hasta que no queda ninguna o todas las restantes son manuales.
   */
  async function process(id: string): Promise<void> {
    for (;;) {
      const w = await readWinner(id);
      const losers = w?._conflicts ?? [];
      if (!w || losers.length === 0) return setManual(id, []);

      const pending: ManualConflict[] = [];
      let wrote = false;
      for (const rev of losers) {
        const l = await readRevision(id, rev);
        if (!l) continue;
        const a = await readAncestor(w, l);
        const result = mergeVault(body(w), body(l), a && body(a), now());
        if (result.kind === "merged") {
          await writeResolution(w, l, result.tombstoneOnly ? null : result.doc);
          wrote = true;
          break;
        }
        pending.push({
          id,
          reason: result.reason,
          fields: "fields" in result ? result.fields : [],
          winner: { rev: w._rev, doc: body(w) },
          loser: { rev: l._rev, doc: body(l) },
        });
      }
      if (!wrote) return setManual(id, pending);
    }
  }

  /** Encola trabajo; un fallo se notifica y no detiene la cola. */
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.then(() => undefined, onError);
    return run;
  }

  // Barrido inicial: las bóvedas que ya tenían conflictos al abrir la réplica.
  const existing = await db.allDocs({ startkey: ID_PREFIX, endkey: `${ID_PREFIX}￰`, include_docs: true, conflicts: true });
  const conflicted = existing.rows.filter((row) => (row.doc as { _conflicts?: string[] } | undefined)?._conflicts);
  await Promise.all(conflicted.map((row) => enqueue(() => process(row.id)).catch(() => undefined)));

  // Después, cada cambio de una bóveda (de la UI, del pull o de otra pestaña) puede crear o cerrar un conflicto.
  const feed = db.changes({ live: true, since: "now" }).on("change", (change) => {
    if (change.id.startsWith(ID_PREFIX)) void enqueue(() => process(change.id)).catch(() => undefined);
  });

  return {
    list,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    resolve(id, loserRev, choice) {
      const checked = validateVault(choice);
      if (!checked.ok) return Promise.reject(new VaultValidationError(checked.fields));
      // En la cola, para no cruzarse con una combinación automática del mismo documento.
      return enqueue(async () => {
        const w = await readWinner(id);
        const l = w?._conflicts?.includes(loserRev) ? await readRevision(id, loserRev) : null;
        if (!w || !l) throw new VaultChangedError();
        await writeResolution(w, l, {
          ...checked.value,
          owner_id: w.owner_id,
          created_at: w.created_at,
          updated_at: now(),
          deleted_at: choice.deleted_at,
        });
      });
    },

    close() {
      feed.cancel();
      listeners.clear();
    },
  };
}
