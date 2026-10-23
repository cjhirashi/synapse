/**
 * Conflictos de la réplica local (SPEC-0005 RF-012…RF-015; SPEC-0008 RF-009, RF-014; ADR-003;
 * PLAN-0005 §2.6; PLAN-0008 §2.6).
 *
 * Busca bóvedas y notas con varias hojas vivas al arrancar y en cada cambio de la réplica, y
 * para cada perdedora `L` frente a la ganadora `W` (la que elige PouchDB, igual en todas las
 * réplicas) decide según el tipo de documento:
 * - bóveda: lee el ancestro común del árbol de revisiones local (la revisión más reciente
 *   que está en la historia de ambas) y aplica `mergeVault`; si combina, escribe en un solo
 *   `bulkDocs` el resultado como hija de `W` y una lápida sobre `L` (sólo la lápida si `W`
 *   ya es el resultado);
 * - nota: `mergeNote` sólo cierra la perdedora cuando difiere de `W` en `updated_at`
 *   (convergencia); cualquier otra diferencia es manual, sin combinar texto;
 * - si no combina, la deja en la lista de conflictos manuales con ambas versiones; nada se
 *   escribe ni se pierde (RF-013). `resolve()` escribe la elección del usuario igual.
 *
 * Los conflictos de las notas de una bóveda que no está activa (en la papelera, o que aún no
 * llegó) no se listan ni se tocan (RF-014): se reevalúan cuando cambia esa bóveda.
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
import { NoteValidationError, type NoteField } from "../notes/errors";
import { mergeNote, type NoteBody } from "../notes/mergeNote";
import { NOTE_ID_PREFIX, checkContent, checkFrontmatter, checkPath } from "../notes/noteRules";
import { canonical } from "./canonical";
import { mergeVault, type MergeBody, type MergeResult } from "./merge";
import { vaultIsActive } from "./vaultActive";
import { validateVault, type VaultField, type VaultFields } from "./vaultRules";
import { ID_PREFIX, StorageFullError, VaultChangedError, VaultValidationError, isQuotaError, utcNow } from "./vaultStore";

// `canonical` vive en su propio módulo (lo comparte `notes/mergeNote.ts` sin ciclo de imports).
export { canonical };

/** Una pareja de bóveda ganadora/perdedora que el usuario debe resolver (RF-013). */
export interface VaultConflict {
  kind: "vault";
  /** Id del documento (`vault:{uuid}`). */
  id: string;
  reason: Extract<MergeResult, { kind: "manual" }>["reason"];
  /** Campos en choque o inválidos; vacío sin ancestro. */
  fields: VaultField[];
  winner: { rev: string; doc: MergeBody };
  loser: { rev: string; doc: MergeBody };
}

/** Una pareja de nota ganadora/perdedora que el usuario debe resolver (SPEC-0008 RF-009). */
export interface NoteConflict {
  kind: "note";
  /** Id del documento (`note:{vault_id}:{uuid}`). */
  id: string;
  winner: { rev: string; doc: NoteBody };
  loser: { rev: string; doc: NoteBody };
}

export type ManualConflict = VaultConflict | NoteConflict;

/** Lo que elige el usuario en la resolución manual de una bóveda. */
export interface ManualChoice extends VaultFields {
  deleted_at: string | null;
}

/** Lo que elige el usuario en la resolución manual de una nota: una de las dos versiones. */
export interface NoteChoice {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  deleted_at: string | null;
}

export interface ConflictsStore {
  list(): ManualConflict[];
  subscribe(listener: (items: ManualConflict[]) => void): () => void;
  /**
   * Resuelve a mano la pareja `W`/`loserRev`: la elección (validada con las reglas de su
   * tipo, que se deduce del prefijo del id) como hija de `W` y una lápida sobre la
   * perdedora. `VaultValidationError` / `NoteValidationError` si no cumple las reglas;
   * `VaultChangedError` si esa perdedora ya no está en conflicto.
   */
  resolve(id: string, loserRev: string, choice: ManualChoice | NoteChoice): Promise<void>;
  /** Deja de seguir la réplica y de avisar a los suscriptores. */
  close(): void;
}

export interface ConflictsOptions {
  /** Reloj del `updated_at` de las resoluciones; por defecto `utcNow()`. */
  now?: () => string;
  /** Error al procesar un documento (la cola sigue con los demás); por defecto `console.error`. */
  onError?: (err: unknown) => void;
}

/** Metadatos de PouchDB que comparten todas las revisiones leídas con `revs`/`conflicts`. */
interface Revision extends RevisionRef {
  _id: string;
  _conflicts?: string[];
  _deleted?: boolean;
}

interface VaultRevision extends Revision, MergeBody {}
interface NoteRevision extends Revision, NoteBody {}

/** Identidad de una revisión y su historia (`_revs` de PouchDB): lo único que necesita `child`. */
export interface RevisionRef {
  _rev: string;
  _revisions: { start: number; ids: string[] };
}

/** Historia de una revisión, de ella hacia la raíz (`["3-c", "2-b", "1-a"]`). */
function history(doc: RevisionRef): string[] {
  const { start, ids } = doc._revisions;
  return ids.map((hash, i) => `${start - i}-${hash}`);
}

/**
 * Revisión hija de `parent` con `content` (su cuerpo nuevo, `_deleted` incluido). El hash es
 * SHA-256 del JSON canónico de la revisión padre y el contenido, recortado a 32 hex como los
 * de PouchDB: la misma escritura da la misma revisión en todas las réplicas (VC-2).
 */
export async function child(parent: RevisionRef, content: object): Promise<RevisionRef> {
  const input = new TextEncoder().encode(canonical({ parent: parent._rev, content }));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  const hash = Array.from(digest.subarray(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const start = parent._revisions.start + 1;
  return { _rev: `${start}-${hash}`, _revisions: { start, ids: [hash, ...parent._revisions.ids] } };
}

function vaultBody(doc: VaultRevision): MergeBody {
  return {
    name: doc.name,
    description: doc.description,
    tags: doc.tags,
    // Sólo si el documento la trae: así un documento anterior no «gana» una clave `icon: null`.
    ...(doc.icon !== undefined ? { icon: doc.icon } : {}),
    owner_id: doc.owner_id,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    deleted_at: doc.deleted_at,
  };
}

function noteBody(doc: NoteRevision): NoteBody {
  return {
    vault_id: doc.vault_id,
    path: doc.path,
    content: doc.content,
    frontmatter: doc.frontmatter,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    deleted_at: doc.deleted_at,
  };
}

/** Campos de una elección de nota que no pasan las reglas de `noteRules`, en el orden de la UI. */
function invalidNoteFields(choice: NoteChoice): NoteField[] {
  const checks: [NoteField, string | null][] = [
    ["path", checkPath(choice.path)],
    ["content", checkContent(choice.content)],
    ["frontmatter", checkFrontmatter(choice.frontmatter)],
  ];
  return checks.filter(([, code]) => code !== null).map(([field]) => field);
}

function isStatus(err: unknown, status: number): boolean {
  return (err as { status?: number } | null)?.status === status;
}

/** Lo que hace falta con una pareja `W`/`L`: escribir una resolución o dejarla al usuario. */
type Decision =
  /** `content` es el cuerpo nuevo (con `type`), hijo de `W`; `null` si basta con cerrar `L`. */
  | { kind: "merged"; content: object | null }
  | { kind: "manual"; conflict: ManualConflict };

/** Tipo de documento replicado con conflictos, según el prefijo de su id. */
function kindOf(id: string): "vault" | "note" | null {
  if (id.startsWith(ID_PREFIX)) return "vault";
  if (id.startsWith(NOTE_ID_PREFIX)) return "note";
  return null;
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
    return a.length === b.length && a.every((item, i) => {
      const other = b[i];
      if (item.winner.rev !== other.winner.rev || item.loser.rev !== other.loser.rev) return false;
      // Las notas no tienen motivo ni campos: sólo las bóvedas comparan más.
      return item.kind !== "vault" || (other.kind === "vault" && item.reason === other.reason
        && item.fields.join() === other.fields.join());
    });
  }

  function setManual(id: string, items: ManualConflict[]): void {
    if (sameManual(manual.get(id) ?? [], items)) return;
    if (items.length === 0) manual.delete(id);
    else manual.set(id, items);
    const all = list();
    listeners.forEach((listener) => listener(all));
  }

  /** Revisión concreta, o `null` si no existe o su cuerpo ya no está (compactada, recibida sin él). */
  async function readRevision<T extends Revision>(id: string, rev: string): Promise<T | null> {
    try {
      const doc = await db.get<T>(id, { rev, revs: true });
      return doc._deleted ? null : doc;
    } catch (err) {
      if (isStatus(err, 404)) return null;
      throw err;
    }
  }

  /** Ancestro común: la revisión más reciente de la historia de `w` que también está en la de `l`. */
  async function readAncestor<T extends Revision>(w: T, l: T): Promise<T | null> {
    const inLoser = new Set(history(l));
    const common = history(w).find((rev) => inLoser.has(rev));
    return common ? readRevision<T>(w._id, common) : null;
  }

  /** Hija de `w` con `content` (si lo hay) + lápida sobre `l`, en un solo lote. */
  async function writeResolution(w: Revision, l: Revision, content: object | null): Promise<void> {
    const docs: object[] = [];
    if (content) docs.push({ _id: w._id, ...(await child(w, content)), ...content });
    const tombstone = { _deleted: true };
    docs.push({ _id: l._id, ...(await child(l, tombstone)), ...tombstone });
    try {
      await db.bulkDocs(docs as PouchDB.Core.PutDocument<{}>[], { new_edits: false });
    } catch (err) {
      // Misma traducción que el resto de las escrituras de la réplica (S-3).
      if (isQuotaError(err)) throw new StorageFullError();
      throw err;
    }
  }

  /** Ganadora actual con sus perdedoras vivas, o `null` si el documento no existe. */
  async function readWinner<T extends Revision>(id: string): Promise<T | null> {
    try {
      return await db.get<T>(id, { conflicts: true, revs: true });
    } catch (err) {
      if (isStatus(err, 404)) return null;
      throw err;
    }
  }

  async function decideVault(id: string, w: VaultRevision, l: VaultRevision): Promise<Decision> {
    const a = await readAncestor(w, l);
    const result = mergeVault(vaultBody(w), vaultBody(l), a && vaultBody(a), now());
    if (result.kind === "merged") {
      return { kind: "merged", content: result.tombstoneOnly ? null : { type: "vault", ...result.doc } };
    }
    return {
      kind: "manual",
      conflict: {
        kind: "vault",
        id,
        reason: result.reason,
        fields: "fields" in result ? result.fields : [],
        winner: { rev: w._rev, doc: vaultBody(w) },
        loser: { rev: l._rev, doc: vaultBody(l) },
      },
    };
  }

  function decideNote(id: string, w: NoteRevision, l: NoteRevision): Decision {
    if (mergeNote(noteBody(w), noteBody(l)).kind === "merged") return { kind: "merged", content: null };
    return {
      kind: "manual",
      conflict: {
        kind: "note",
        id,
        winner: { rev: w._rev, doc: noteBody(w) },
        loser: { rev: l._rev, doc: noteBody(l) },
      },
    };
  }

  /**
   * Combina las perdedoras de `id` de una en una (cada escritura cambia la ganadora, así que
   * se vuelve a leer) hasta que no queda ninguna o todas las restantes son manuales.
   */
  async function process(id: string): Promise<void> {
    const kind = kindOf(id);
    for (;;) {
      const w = await readWinner<Revision & Partial<NoteBody>>(id);
      const losers = w?._conflicts ?? [];
      if (!w || losers.length === 0) return setManual(id, []);
      // RF-014: sin bóveda activa no se lista ni se escribe nada; se reevalúa cuando ella cambie.
      if (kind === "note" && !(await vaultIsActive(db, w.vault_id as string))) return setManual(id, []);

      const pending: ManualConflict[] = [];
      let wrote = false;
      for (const rev of losers) {
        const l = await readRevision<Revision>(id, rev);
        if (!l) continue;
        const decision = kind === "note"
          ? decideNote(id, w as NoteRevision, l as NoteRevision)
          : await decideVault(id, w as VaultRevision, l as VaultRevision);
        if (decision.kind === "merged") {
          await writeResolution(w, l, decision.content);
          wrote = true;
          break;
        }
        pending.push(decision.conflict);
      }
      if (!wrote) return setManual(id, pending);
    }
  }

  /**
   * Reevalúa las notas de la bóveda `vaultId` cuando ella cambia (se activa, va a la papelera
   * o llega por el pull): las que están en conflicto y las que ya estaban listadas.
   */
  async function processNotesOf(vaultId: string): Promise<void> {
    const prefix = `${NOTE_ID_PREFIX}${vaultId}:`;
    const ids = new Set(await conflictedIds(prefix));
    for (const id of manual.keys()) if (id.startsWith(prefix)) ids.add(id);
    for (const id of ids) await process(id);
  }

  /**
   * Ids con ramas en conflicto bajo `prefix`, SIN leer ningún cuerpo (S-1): `style: "all_docs"`
   * lista todas las hojas de cada documento y un documento en conflicto tiene más de una. Leer
   * `include_docs` de todas las notas costaba hasta 2 MiB por nota en cada lote del pull.
   */
  async function conflictedIds(prefix: string): Promise<string[]> {
    const feed = await db.changes({ since: 0, style: "all_docs" });
    return feed.results
      .filter((change) => !change.deleted && change.id.startsWith(prefix) && change.changes.length > 1)
      .map((change) => change.id);
  }

  /** Encola trabajo; un fallo se notifica y no detiene la cola. */
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.then(() => undefined, onError);
    return run;
  }

  // Barrido inicial: las bóvedas y notas que ya tenían conflictos al abrir la réplica.
  for (const prefix of [ID_PREFIX, NOTE_ID_PREFIX]) {
    const conflicted = await conflictedIds(prefix);
    await Promise.all(conflicted.map((id) => enqueue(() => process(id)).catch(() => undefined)));
  }

  // Después, cada cambio de una bóveda o nota (de la UI, del pull o de otra pestaña) puede crear o cerrar un
  // conflicto; el de una bóveda además cambia qué conflictos de sus notas cuentan (RF-014).
  const feed = db.changes({ live: true, since: "now" }).on("change", (change) => {
    const kind = kindOf(change.id);
    if (kind === null) return;
    void enqueue(async () => {
      await process(change.id);
      if (kind === "vault") await processNotesOf(change.id.slice(ID_PREFIX.length));
    }).catch(() => undefined);
  });

  return {
    list,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    resolve(id, loserRev, choice) {
      const isNote = kindOf(id) === "note";
      // `kindOf` decide el tipo; la elección ya validada fija el cuerpo que se escribe.
      let build: (w: Revision) => object;
      if (isNote) {
        const noteChoice = choice as NoteChoice;
        const invalid = invalidNoteFields(noteChoice);
        if (invalid.length > 0) return Promise.reject(new NoteValidationError(invalid));
        build = (w) => ({
          type: "note",
          vault_id: (w as NoteRevision).vault_id,
          path: noteChoice.path,
          content: noteChoice.content,
          frontmatter: noteChoice.frontmatter,
          created_at: (w as NoteRevision).created_at,
          updated_at: now(),
          deleted_at: noteChoice.deleted_at,
        });
      } else {
        const vaultChoice = choice as ManualChoice;
        const checked = validateVault(vaultChoice);
        if (!checked.ok) return Promise.reject(new VaultValidationError(checked.fields));
        build = (w) => ({
          type: "vault",
          ...checked.value,
          // La resolución manual no ofrece selector de ícono (P-6): conserva el de la ganadora.
          ...((w as VaultRevision).icon !== undefined ? { icon: (w as VaultRevision).icon } : {}),
          owner_id: (w as VaultRevision).owner_id,
          created_at: (w as VaultRevision).created_at,
          updated_at: now(),
          deleted_at: vaultChoice.deleted_at,
        });
      }
      // En la cola, para no cruzarse con una combinación automática del mismo documento.
      return enqueue(async () => {
        const w = await readWinner<Revision>(id);
        const l = w?._conflicts?.includes(loserRev) ? await readRevision<Revision>(id, loserRev) : null;
        if (!w || !l) throw new VaultChangedError();
        await writeResolution(w, l, build(w));
      });
    },

    close() {
      feed.cancel();
      listeners.clear();
    },
  };
}
