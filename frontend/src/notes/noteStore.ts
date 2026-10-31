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
import { NOTE_ID_PREFIX, checkContent, checkFrontmatter, checkPath, normalizePath, pathKey } from "./noteRules";
import { NoteChangedError, NoteNotFoundError, NotePathTakenError, NoteValidationError } from "./errors";
import { nextUntitledPath } from "./untitled";
import { joinPath, parentFolder } from "./folders";

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
  /** Longitud de `content` (RNF-001, PLAN-0010 §10.5): el programador de precálculo elige candidatas
   *  sin leer los cuerpos. Se calcula al indexar (el índice ya lee el documento completo). */
  size: number;
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
  create(vaultId: string, title?: string, folder?: string): Promise<Note>;
  rename(id: string, path: string, rev: string): Promise<Note>;
  /**
   * Mueve la carpeta `from` bajo `to` (`""` = raíz): reubica todas sus notas activas al nuevo
   * prefijo conservando la subestructura (H-003 C-2). No hay endpoint de «mover carpeta»: itera
   * las notas y reusa la misma regla de ruta/unicidad que `rename`. Si alguna ruta de destino ya
   * está ocupada rechaza con `NotePathTakenError` sin mover ninguna (C-5).
   */
  moveFolder(vaultId: string, from: string, to: string): Promise<void>;
  /** Renombra la carpeta `from` dentro de su padre (H-024 C-5): mismo lote y unicidad que `moveFolder`. */
  renameFolder(vaultId: string, from: string, newName: string): Promise<void>;
  /**
   * Manda a la papelera todas las notas activas de la carpeta `path` (también las de subcarpetas) y
   * devuelve cuántas (H-024 C-8). Valida el lote entero antes de escribir: una ruta inválida no deja
   * la carpeta a medias.
   */
  softDeleteFolder(vaultId: string, path: string): Promise<number>;
  softDelete(id: string, rev: string): Promise<Note>;
  restore(id: string, rev: string): Promise<Note>;
  /**
   * Guarda el contenido editado sobre la revisión `baseRev` que se cargó. `frontmatter` ausente
   * conserva el del documento; presente se valida (RF-019) y se escribe junto al contenido.
   */
  save(id: string, content: string, baseRev: string, frontmatter?: Record<string, unknown>): Promise<Note>;
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
  return { id: doc._id, path: doc.path, rev: doc._rev as string, updated_at: doc.updated_at, deleted_at: doc.deleted_at, size: doc.content.length };
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
  // No añade `.md` si el último segmento quedó vacío (`Carpeta/`): así `checkPath` lo rechaza como
  // carpeta sin nombre de nota (SPEC-0010 RF-007), en vez de inventar `Carpeta/.md`.
  const last = path.split("/").at(-1) ?? "";
  return last === "" || /\.md$/i.test(path) ? path : `${path}.md`;
}

/** Cuerpos leídos por lote al construir el índice de resumen. */
const INDEX_BATCH = 200;

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
      // Por lotes (S-7): nunca hay más de INDEX_BATCH cuerpos en memoria a la vez; de cada uno sólo
      // se conserva el resumen. La cota inferior del siguiente lote es ESTRICTA: el último id leído
      // más `\u0000` (la cadena inmediatamente mayor). Con `skip: 1` se perdía una nota viva si ese
      // id desaparecía entre lotes (S-8).
      let last: string | null = null;
      for (;;) {
        const page: PouchDB.Core.AllDocsResponse<NoteDoc> = await db.allDocs<NoteDoc>({
          startkey: last === null ? NOTE_ID_PREFIX : `${last}\u0000`,
          endkey: `${NOTE_ID_PREFIX}￰`,
          include_docs: true,
          limit: INDEX_BATCH,
        });
        for (const row of page.rows) if (row.doc?.type === "note") indexPut(row.doc);
        if (page.rows.length < INDEX_BATCH) break;
        last = page.rows[page.rows.length - 1].id;
      }
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
  async function saveAsBranch(id: string, baseRev: string, content: string, frontmatter?: Record<string, unknown>): Promise<Note> {
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
      frontmatter: frontmatter ?? base.frontmatter,
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

  /** Renombra/mueve una nota (la comparte `rename` y `moveFolder`): misma regla de ruta y unicidad. */
  async function renameDoc(id: string, path: string, rev: string): Promise<Note> {
    const normalized = titleToPath(path);
    if (checkPath(normalized) !== null) throw new NoteValidationError(["path"]);
    const doc = await load(id, false);
    assertCurrent(doc, rev);
    await assertPathFree(doc.vault_id, normalized, doc._id);
    return write({ ...doc, path: normalized, updated_at: now() });
  }

  /** Manda una nota a la papelera (la comparten `softDelete` y el borrado de carpeta). */
  async function trashDoc(id: string, rev: string): Promise<Note> {
    const doc = await load(id, false);
    // Puerta RF-008 (P-12): una nota con ruta inválida (sembrada por una réplica vieja) debe
    // renombrarse antes de borrarla; no se opera sobre ella con la ruta rota.
    if (checkPath(doc.path) !== null) throw new NoteValidationError(["path"]);
    assertCurrent(doc, rev);
    const timestamp = now();
    return write({ ...doc, deleted_at: timestamp, updated_at: timestamp });
  }

  /**
   * Reubica la carpeta `from` bajo la ruta `dest` (C-5 de H-003 y H-024): todas sus notas activas
   * cambian de prefijo conservando la subestructura. Si alguna ruta de destino ya está ocupada por
   * una nota ajena al lote, rechaza antes de escribir ninguna.
   */
  async function relocateFolder(vaultId: string, from: string, dest: string): Promise<void> {
    const prefix = `${from}/`;
    const active = (await summaries(vaultId)).filter((note) => note.deleted_at === null);
    const moving = active.filter((note) => note.path.startsWith(prefix));
    const targets = moving.map((note) => ({ note, path: joinPath(dest, note.path.slice(prefix.length)) }));
    // «sin mover nada» (C-5): si una nota ajena al lote ya ocupa alguna ruta de destino, se rechaza
    // ANTES de escribir ninguna. El mapeo origen→destino es inyectivo, así que el lote no choca consigo mismo.
    const movingIds = new Set(moving.map((note) => note.id));
    for (const { path } of targets) {
      const key = pathKey(titleToPath(path));
      if (active.some((note) => !movingIds.has(note.id) && pathKey(note.path) === key)) throw new NotePathTakenError();
    }
    for (const { note, path } of targets) await renameDoc(note.id, path, note.rev);
  }

  /** Crea una nota (la comparten `create` y el placeholder de C-8): sin título usa «Sin título n» de la carpeta. */
  async function createNote(vaultId: string, title: string | undefined, folder = ""): Promise<Note> {
    const requested = title?.trim() ?? "";
    let path: string;
    if (requested === "") {
      // RF-012: sin título, el menor «Sin título n» libre entre las activas de ESA carpeta.
      const active = (await summaries(vaultId)).filter((note) => note.deleted_at === null);
      path = nextUntitledPath(new Set(active.map((note) => pathKey(note.path))), folder);
    } else {
      // El título es relativo a la carpeta destino (RF-001/RF-003); `/` anida.
      path = titleToPath(joinPath(folder, requested));
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
  }

  /**
   * C-8 (H-003): si mover una nota dejó su carpeta de origen `folder` sin ninguna nota activa, crea
   * ahí un `Sin título.md` para que la carpeta siga existiendo (una carpeta existe por tener una nota
   * dentro; mismo patrón que «Crear carpeta»). La raíz no es una carpeta derivada y siempre se ve, así
   * que se omite. Sólo lo llama `rename` (drag de nota y renombrado por teclado), nunca `moveFolder`.
   */
  async function keepSourceFolder(vaultId: string, folder: string): Promise<void> {
    if (folder === "") return;
    const prefix = `${folder}/`;
    const stillThere = (await summaries(vaultId)).some(
      (note) => note.deleted_at === null && note.path.startsWith(prefix),
    );
    if (!stillThere) await createNote(vaultId, "", folder);
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

    async create(vaultId, title, folder = "") {
      return createNote(vaultId, title, folder);
    },

    async rename(id, path, rev) {
      const source = parentFolder((await load(id, false)).path); // carpeta de origen, antes de mover
      const moved = await renameDoc(id, path, rev);
      // C-8: si el movimiento vació la carpeta de origen, la sostiene con un «Sin título.md».
      if (source !== parentFolder(moved.path)) await keepSourceFolder(moved.vault_id, source);
      return moved;
    },

    async moveFolder(vaultId, from, to) {
      const name = from.split("/").at(-1) ?? from;
      await relocateFolder(vaultId, from, joinPath(to, name)); // la carpeta movida conserva su nombre, ahora bajo `to`
    },

    async renameFolder(vaultId, from, newName) {
      await relocateFolder(vaultId, from, joinPath(parentFolder(from), newName));
    },

    async softDeleteFolder(vaultId, path) {
      const prefix = `${path}/`;
      const moving = (await summaries(vaultId)).filter((note) => note.deleted_at === null && note.path.startsWith(prefix));
      for (const note of moving) if (checkPath(note.path) !== null) throw new NoteValidationError(["path"]);
      for (const note of moving) await trashDoc(note.id, note.rev);
      return moving.length;
    },

    async softDelete(id, rev) {
      return trashDoc(id, rev);
    },

    async restore(id, rev) {
      const doc = await load(id, true);
      assertCurrent(doc, rev);
      // Al volver a estar activa, su ruta vuelve a competir con las demás activas (RF-017).
      await assertPathFree(doc.vault_id, doc.path, doc._id);
      return write({ ...doc, deleted_at: null, updated_at: now() });
    },

    async save(id, content, baseRev, frontmatter) {
      if (checkContent(content) !== null) throw new NoteValidationError(["content"]);
      if (frontmatter !== undefined && checkFrontmatter(frontmatter) !== null) throw new NoteValidationError(["frontmatter"]);
      const doc = await load(id, false);
      // Puerta RF-008 (P-12): no se guarda sobre una nota cuya ruta ya es inválida; pide renombrar antes.
      if (checkPath(doc.path) !== null) throw new NoteValidationError(["path"]);
      if (doc._rev === baseRev) {
        try {
          // `frontmatter` ausente conserva el del documento; presente lo reemplaza.
          return await write({ ...doc, content, frontmatter: frontmatter ?? doc.frontmatter, updated_at: now() });
        } catch (err) {
          // Otra escritura se coló entre la lectura y la nuestra: es el mismo caso de abajo.
          if (!(err instanceof NoteChangedError)) throw err;
        }
      }
      return saveAsBranch(id, baseRev, content, frontmatter);
    },
  };
}
