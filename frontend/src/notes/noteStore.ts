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
import { checkContent, checkPath, normalizePath, pathKey } from "./noteRules";
import { nextUntitledPath } from "./untitled";

/** Prefijo de los ids de nota en CouchDB/PouchDB (PLAN-0008 §3). */
export const ID_PREFIX = "note:";
/** Campos de una nota que pueden fallar la validación (los de entrada de la UI). */
export type NoteField = "path" | "content";

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

// --- Errores (la UI los traduce con textos de `messages.ts`) ---

/** Campos que no pasan las reglas de `noteRules` (el rechazo `validation-error:<campo>`). */
export class NoteValidationError extends Error {
  constructor(readonly fields: NoteField[]) {
    super(`campos inválidos: ${fields.join(", ")}`);
    this.name = "NoteValidationError";
  }
}

/** Otra nota activa de la bóveda tiene una ruta equivalente (el `note-path-taken` del push). */
export class NotePathTakenError extends Error {
  constructor() {
    super("ya existe una nota activa con esa ruta");
    this.name = "NotePathTakenError";
  }
}

/** No existe, o no está en el estado que pide la operación (activa / en la papelera). */
export class NoteNotFoundError extends Error {
  constructor() {
    super("nota no encontrada");
    this.name = "NoteNotFoundError";
  }
}

/** La revisión que editaba la UI ya no es la actual (el 409 de PouchDB). */
export class NoteChangedError extends Error {
  constructor() {
    super("la nota cambió desde que se cargó");
    this.name = "NoteChangedError";
  }
}

// La cuota agotada del navegador es la misma `StorageFullError` de 0005.
export { StorageFullError };

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

/** Título → ruta: se añade `.md` si no termina ya en `.md` (sin distinguir mayúsculas). */
function titleToPath(title: string): string {
  const path = normalizePath(title);
  return /\.md$/i.test(path) ? path : `${path}.md`;
}

export function createNoteStore(db: PouchDB.Database, options: NoteStoreOptions = {}): NoteStore {
  const now = options.now ?? (() => utcNow());
  const newId = options.newId ?? (() => crypto.randomUUID());

  /** Ganadoras de las notas de una bóveda (las perdedoras en conflicto las resuelve `conflicts.ts`). */
  async function winners(vaultId: string): Promise<NoteDoc[]> {
    const prefix = `${ID_PREFIX}${vaultId}:`;
    const result = await db.allDocs<NoteDoc>({ startkey: prefix, endkey: `${prefix}￰`, include_docs: true });
    return result.rows.map((row) => row.doc as NoteDoc).filter((doc) => doc.type === "note");
  }

  /** Aviso local de ruta ocupada: otra nota activa (no `selfId`) de la bóveda con la misma clave. */
  async function assertPathFree(vaultId: string, path: string, selfId: string | null): Promise<void> {
    const key = pathKey(path);
    const taken = (await winners(vaultId)).some(
      (doc) => doc.deleted_at === null && doc._id !== selfId && pathKey(doc.path) === key,
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
   * para que el usuario elija en la vista de conflictos. Dos guardados idénticos dan la misma
   * revisión, así que reintentar no ramifica de más.
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
      return (await winners(vaultId))
        .filter((doc) => (doc.deleted_at !== null) === deleted)
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
        .map(toSummary);
    },

    async get(id) {
      return toNote(await load(id, false));
    },

    async create(vaultId, title) {
      const requested = title?.trim() ?? "";
      let path: string;
      if (requested === "") {
        // RF-012: sin título, el menor «Sin título n» libre entre las activas de la bóveda.
        const active = (await winners(vaultId)).filter((doc) => doc.deleted_at === null);
        path = nextUntitledPath(new Set(active.map((doc) => pathKey(doc.path))));
      } else {
        path = titleToPath(requested);
      }
      if (checkPath(path) !== null) throw new NoteValidationError(["path"]);
      await assertPathFree(vaultId, path, null);
      const timestamp = now();
      return write({
        _id: `${ID_PREFIX}${vaultId}:${newId()}`,
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
      const normalized = normalizePath(path);
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
