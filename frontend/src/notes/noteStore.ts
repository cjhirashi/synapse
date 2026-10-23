/**
 * Operaciones de la UI sobre las notas de la réplica local (SPEC-0008 RF-003, RF-010…RF-013,
 * RF-016, RF-017; PLAN-0008 §2.6).
 *
 * Mismo patrón que `sync/vaultStore.ts`: la réplica escribe sin pasar por la API, `softDelete`
 * es una revisión nueva con `deleted_at` (nunca una lápida de PouchDB, así viaja por el push
 * como cualquier edición) y la ruta es única entre las notas activas de la bóveda (comparada
 * con `pathKey`). La comprobación local es sólo un aviso inmediato: la última palabra es del
 * servidor, que rechaza en el push (`note-path-taken`) lo que dos dispositivos escriban a la
 * vez sin conexión.
 *
 * Los ids son `note:{vault_id}:{uuid v4}`: el prefijo lleva la bóveda, así que listar el
 * árbol de una bóveda es un rango de `_id` sobre el índice primario de PouchDB.
 */
import { child } from "../sync/conflicts";
import { StorageFullError, isQuotaError, utcNow } from "../sync/vaultStore";
import { NOTE_ID_PREFIX, checkContent, checkPath, normalizePath, pathKey } from "./noteRules";
import { NoteChangedError, NoteNotFoundError, NotePathTakenError, NoteValidationError } from "./errors";
import { nextUntitledPath } from "./untitled";

// Los errores viven en `errors.ts` (los comparte `sync/conflicts.ts`); se reexportan aquí.
export { NoteChangedError, NoteNotFoundError, NotePathTakenError, NoteValidationError, StorageFullError };

/** Documento de nota tal como se guarda (mismas claves que `note.schema.json`). */
interface NoteDoc {
  _id: string;
  _rev?: string;
  type: "note";
  vault_id: string;
  path: string;
  frontmatter: Record<string, unknown>;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Nota vista por la UI: `id` es el `_id` completo y `rev` la revisión que se editaba. */
export interface Note {
  id: string;
  vault_id: string;
  path: string;
  frontmatter: Record<string, unknown>;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  rev: string;
}

/** Lo que muestra el árbol: sin `content` (puede pesar hasta 2 MiB por nota). */
export interface NoteSummary {
  id: string;
  path: string;
  rev: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface NoteStoreOptions {
  /** Reloj; por defecto `utcNow()`. Los tests lo fijan. */
  now?: () => string;
  /** Generador del uuid v4 de las notas nuevas; por defecto `crypto.randomUUID()`. */
  newId?: () => string;
}

export interface NoteStore {
  list(vaultId: string, options?: { deleted?: boolean }): Promise<NoteSummary[]>;
  get(id: string): Promise<Note>;
  create(vaultId: string, title?: string): Promise<Note>;
  rename(id: string, path: string, rev: string): Promise<Note>;
  softDelete(id: string, rev: string): Promise<Note>;
  restore(id: string, rev: string): Promise<Note>;
  /** Guarda el contenido editado sobre la revisión `baseRev` que se cargó. */
  save(id: string, content: string, baseRev: string): Promise<Note>;
}

function toNote(doc: NoteDoc): Note {
  return {
    id: doc._id,
    vault_id: doc.vault_id,
    path: doc.path,
    frontmatter: doc.frontmatter,
    content: doc.content,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    deleted_at: doc.deleted_at,
    rev: doc._rev as string,
  };
}

function toSummary(doc: NoteDoc): NoteSummary {
  return { id: doc._id, path: doc.path, rev: doc._rev as string, updated_at: doc.updated_at, deleted_at: doc.deleted_at };
}

function isStatus(err: unknown, status: number): boolean {
  return (err as { status?: number } | null)?.status === status;
}

/**
 * Título → ruta: se añade `.md` si no termina ya en `.md` (sin distinguir mayúsculas).
 * Única regla para `create` y `rename` (VU-6): el nombre visible no depende de cómo se nombró la nota.
 * Un texto vacío se deja vacío para que `checkPath` lo rechace (no se vuelve «.md»).
 */
function titleToPath(title: string): string {
  const path = normalizePath(title);
  return path === "" || /\.md$/i.test(path) ? path : `${path}.md`;
}

export function createNoteStore(db: PouchDB.Database, options: NoteStoreOptions = {}): NoteStore {
  const now = options.now ?? (() => utcNow());
  const newId = options.newId ?? (() => crypto.randomUUID());

  /**
   * Índice de resumen (S-1): `{id, path, rev, deleted_at, updated_at}` de cada nota por bóveda,
   * SIN `content` (hasta 2 MiB por nota). Se construye una vez (la primera lectura) y después se
   * pone al día de forma incremental con el feed de cambios de la réplica: sólo se leen los
   * documentos que cambiaron desde la última puesta al día (las escrituras propias, el pull y
   * otras pestañas pasan todas por ahí). `list`, la unicidad de rutas y «Sin título n» consultan
   * el índice en vez de releer el cuerpo de todas las notas en cada guardado y cada lote del pull.
   */
  const index = new Map<string, Map<string, NoteSummary>>(); // vault_id → id → resumen
  let indexSeq: string | number | null = null; // última secuencia aplicada (null: sin construir)
  let indexing: Promise<void> | null = null; // puesta al día en curso (se serializan)

  function indexPut(doc: NoteDoc): void {
    let notes = index.get(doc.vault_id);
    if (!notes) index.set(doc.vault_id, (notes = new Map()));
    notes.set(doc._id, toSummary(doc));
  }

  function indexRemove(id: string): void {
    for (const notes of index.values()) notes.delete(id);
  }

  async function refreshIndex(): Promise<void> {
    if (indexSeq === null) {
      // La secuencia se toma ANTES de leer: lo que cambie mientras se construye se reaplica luego (idempotente).
      const seq = (await db.info()).update_seq;
      const rows = await db.allDocs<NoteDoc>({ startkey: NOTE_ID_PREFIX, endkey: `${NOTE_ID_PREFIX}￰`, include_docs: true });
      for (const row of rows.rows) if (row.doc?.type === "note") indexPut(row.doc);
      indexSeq = seq;
    }
    // Sólo lo cambiado desde la última vez; el cuerpo de cada documento se lee una vez y se descarta.
    const changes = await db.changes<NoteDoc>({ since: indexSeq, include_docs: true });
    for (const change of changes.results) {
      if (!change.id.startsWith(NOTE_ID_PREFIX)) continue;
      if (change.deleted || !change.doc || change.doc.type !== "note") indexRemove(change.id);
      else {
        indexRemove(change.id); // la nota pudo cambiar de bóveda lógica (no ocurre) o de estado: se reemplaza entera
        indexPut(change.doc);
      }
    }
    indexSeq = changes.last_seq;
  }

  /** Índice al día. Las llamadas concurrentes se encadenan para no aplicar la misma secuencia dos veces. */
  async function syncIndex(): Promise<void> {
    const run = (indexing ?? Promise.resolve()).then(refreshIndex);
    indexing = run.catch(() => undefined);
    return run;
  }

  /** Resúmenes de las notas de una bóveda (activas y de la papelera). */
  async function summaries(vaultId: string): Promise<NoteSummary[]> {
    await syncIndex();
    return [...(index.get(vaultId)?.values() ?? [])];
  }

  /** Aviso local de ruta ocupada: otra nota activa (no `selfId`) de la bóveda con la misma clave. */
  async function assertPathFree(vaultId: string, path: string, selfId: string | null): Promise<void> {
    const key = pathKey(path);
    const taken = (await summaries(vaultId)).some(
      (note) => note.deleted_at === null && note.id !== selfId && pathKey(note.path) === key,
    );
    if (taken) throw new NotePathTakenError();
  }

  /** Carga la ganadora si está en el estado pedido; si no, `NoteNotFoundError`. */
  async function load(id: string, deleted: boolean): Promise<NoteDoc> {
    let doc: NoteDoc;
    try {
      doc = await db.get<NoteDoc>(id);
    } catch (err) {
      if (isStatus(err, 404)) throw new NoteNotFoundError();
      throw err;
    }
    if (doc.type !== "note" || (doc.deleted_at !== null) !== deleted) throw new NoteNotFoundError();
    return doc;
  }

  /** Escribe una revisión nueva; traduce el 409 de PouchDB y la cuota agotada. */
  async function write(doc: NoteDoc): Promise<Note> {
    try {
      const result = await db.put<NoteDoc>(doc as PouchDB.Core.PutDocument<NoteDoc>);
      return toNote({ ...doc, _rev: result.rev });
    } catch (err) {
      if (isStatus(err, 409)) throw new NoteChangedError();
      if (isQuotaError(err)) throw new StorageFullError();
      throw err;
    }
  }

  /**
   * Guardado sobre una revisión desfasada (P-8): lo escrito no se pierde ni pisa lo que llegó
   * entre tanto. Se escribe como rama hija de `baseRev` (con `new_edits: false` y una revisión
   * determinista, igual que las resoluciones de `conflicts.ts`) y la nota queda en conflicto
   * para que el usuario elija en la vista de conflictos. La revisión depende del contenido y de
   * `updated_at`, así que dos guardados no dan la misma revisión: que dos ramas con el mismo
   * contenido no se queden en conflicto lo garantiza `mergeNote` (converge ignorando `updated_at`).
   */
  async function saveAsBranch(id: string, baseRev: string, content: string): Promise<Note> {
    let base: NoteDoc & { _revisions: { start: number; ids: string[] }; _deleted?: boolean };
    try {
      base = await db.get(id, { rev: baseRev, revs: true });
    } catch (err) {
      // `baseRev` desconocida o sin cuerpo: no hay de qué colgar la rama.
      if (isStatus(err, 404)) throw new NoteChangedError();
      throw err;
    }
    if (base._deleted) throw new NoteChangedError();
    const body = {
      type: "note" as const,
      vault_id: base.vault_id,
      path: base.path,
      frontmatter: base.frontmatter,
      content,
      created_at: base.created_at,
      updated_at: now(),
      deleted_at: base.deleted_at,
    };
    const revision = await child({ _rev: baseRev, _revisions: base._revisions }, body);
    try {
      await db.bulkDocs([{ _id: id, ...revision, ...body }] as PouchDB.Core.PutDocument<{}>[], { new_edits: false });
    } catch (err) {
      if (isQuotaError(err)) throw new StorageFullError();
      throw err;
    }
    return toNote({ _id: id, _rev: revision._rev, ...body });
  }

  /** La UI editaba `rev`; si ya no es la ganadora, otro cambio llegó antes (local o por sync). */
  function assertCurrent(doc: NoteDoc, rev: string): void {
    if (doc._rev !== rev) throw new NoteChangedError();
  }

  return {
    async list(vaultId, { deleted = false } = {}) {
      return (await summaries(vaultId))
        .filter((note) => (note.deleted_at !== null) === deleted)
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    },

    async get(id) {
      return toNote(await load(id, false));
    },

    async create(vaultId, title) {
      const requested = title?.trim() ?? "";
      let path: string;
      if (requested === "") {
        // RF-012: sin título, el menor «Sin título n» libre entre las activas de la bóveda.
        const active = (await summaries(vaultId)).filter((note) => note.deleted_at === null);
        path = nextUntitledPath(new Set(active.map((note) => pathKey(note.path))));
      } else {
        path = titleToPath(requested);
      }
      if (checkPath(path) !== null) throw new NoteValidationError(["path"]);
      await assertPathFree(vaultId, path, null);
      const timestamp = now();
      return write({
        _id: `${NOTE_ID_PREFIX}${vaultId}:${newId()}`,
        type: "note",
        vault_id: vaultId,
        path,
        frontmatter: {},
        content: "",
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null,
      });
    },

    async rename(id, path, rev) {
      const normalized = titleToPath(path);
      if (checkPath(normalized) !== null) throw new NoteValidationError(["path"]);
      const doc = await load(id, false);
      assertCurrent(doc, rev);
      await assertPathFree(doc.vault_id, normalized, doc._id);
      return write({ ...doc, path: normalized, updated_at: now() });
    },

    async softDelete(id, rev) {
      const doc = await load(id, false);
      assertCurrent(doc, rev);
      const timestamp = now();
      return write({ ...doc, deleted_at: timestamp, updated_at: timestamp });
    },

    async restore(id, rev) {
      const doc = await load(id, true);
      assertCurrent(doc, rev);
      // Al volver a estar activa, su ruta vuelve a competir con las demás activas (RF-017).
      await assertPathFree(doc.vault_id, doc.path, doc._id);
      return write({ ...doc, deleted_at: null, updated_at: now() });
    },

    async save(id, content, baseRev) {
      if (checkContent(content) !== null) throw new NoteValidationError(["content"]);
      const doc = await load(id, false);
      if (doc._rev === baseRev) {
        try {
          return await write({ ...doc, content, updated_at: now() });
        } catch (err) {
          // Otra escritura se coló entre la lectura y la nuestra: es el mismo caso de abajo.
          if (!(err instanceof NoteChangedError)) throw err;
        }
      }
      return saveAsBranch(id, baseRev, content);
    },
  };
}
