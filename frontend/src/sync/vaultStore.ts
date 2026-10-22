/**
 * Operaciones de la UI sobre las bóvedas de la réplica local (SPEC-0005 RF-009, RF-011;
 * PLAN-0005 §2.5).
 *
 * Reflejo local de la semántica REST de 0003 (`vault_service.py`): `get`, `update` y
 * `softDelete` sólo ven bóvedas activas, `restore` sólo las de la papelera; el nombre es
 * único entre las activas (comparado con `nameKey`); cada escritura renueva `updated_at`.
 * El borrado es una revisión nueva con `deleted_at` (*soft delete*), nunca una lápida de
 * PouchDB, así viaja por el push como cualquier edición (RF-011).
 *
 * La comprobación local del nombre es sólo un aviso inmediato: la última palabra es del
 * servidor, que rechaza en el push (`vault-name-taken`) lo que dos dispositivos escriban
 * a la vez sin conexión.
 */
import { nameKey, validateVault, FIELD_RULES, type VaultField, type VaultFields } from "./vaultRules";

/** Prefijo de los ids de bóveda en CouchDB/PouchDB (PLAN-0005 §2.3). */
export const ID_PREFIX = "vault:";
/** Orden de los campos en los errores de validación (el mismo que `validateVault`). */
const FIELD_ORDER: VaultField[] = ["name", "description", "tags"];

/** Documento de bóveda tal como se guarda (mismas claves que 0003, sin `_revisions`). */
interface VaultDoc {
  _id: string;
  _rev?: string;
  type: "vault";
  name: string;
  description: string | null;
  tags: string[];
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Bóveda vista por la UI: `id` sin el prefijo y `rev` en lugar del `etag` de la API REST. */
export interface Vault extends VaultFields {
  id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  rev: string;
}

export interface VaultStoreOptions {
  /** Reloj; por defecto `utcNow()`. Los tests lo fijan. */
  now?: () => string;
  /** Generador del uuid v4 de las bóvedas nuevas; por defecto `crypto.randomUUID()`. */
  newId?: () => string;
}

export interface VaultStore {
  list(options?: { deleted?: boolean }): Promise<Vault[]>;
  get(id: string): Promise<Vault>;
  create(input: VaultFields): Promise<Vault>;
  update(id: string, changes: Partial<VaultFields>, rev: string): Promise<Vault>;
  softDelete(id: string, rev: string): Promise<Vault>;
  restore(id: string, rev: string): Promise<Vault>;
}

// --- Errores (la UI los traduce con los mismos textos que usaba para la API REST) ---

/** Campos que no pasan las reglas de `vaultRules` (el 422 de 0003). */
export class VaultValidationError extends Error {
  constructor(readonly fields: VaultField[]) {
    super(`campos inválidos: ${fields.join(", ")}`);
    this.name = "VaultValidationError";
  }
}

/** Otra bóveda activa tiene un nombre equivalente (el 409 `vault-name-taken` de 0003). */
export class VaultNameTakenError extends Error {
  constructor() {
    super("ya existe una bóveda activa con ese nombre");
    this.name = "VaultNameTakenError";
  }
}

/** La revisión que editaba la UI ya no es la actual (el 412 de 0003; aquí, el 409 de PouchDB). */
export class VaultChangedError extends Error {
  constructor() {
    super("la bóveda cambió desde que se cargó");
    this.name = "VaultChangedError";
  }
}

/** No existe, o no está en el estado que pide la operación (activa / en la papelera). */
export class VaultNotFoundError extends Error {
  constructor() {
    super("bóveda no encontrada");
    this.name = "VaultNotFoundError";
  }
}

/** El navegador no deja guardar más datos (cuota de IndexedDB agotada). */
export class StorageFullError extends Error {
  constructor() {
    super("el almacenamiento del navegador está lleno");
    this.name = "StorageFullError";
  }
}

/**
 * Marca de tiempo con el formato de `utc_now()` del servidor (`%Y-%m-%dT%H:%M:%S.%fZ`):
 * `Date` sólo tiene milisegundos, así que se completan los microsegundos con ceros.
 */
export function utcNow(date: Date = new Date()): string {
  return date.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function toVault(doc: VaultDoc): Vault {
  return {
    id: doc._id.slice(ID_PREFIX.length),
    name: doc.name,
    description: doc.description,
    tags: doc.tags,
    owner_id: doc.owner_id,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    deleted_at: doc.deleted_at,
    rev: doc._rev as string,
  };
}

/** RF-024 de 0003: `created_at` descendente y, a igualdad, `_id` descendente. */
function newestFirst(a: VaultDoc, b: VaultDoc): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a._id < b._id ? 1 : a._id > b._id ? -1 : 0;
}

function isStatus(err: unknown, status: number): boolean {
  return (err as { status?: number } | null)?.status === status;
}

/**
 * Cuota agotada. PouchDB envuelve el `QuotaExceededError` de IndexedDB en un error propio
 * (`indexed_db_went_bad`) con la causa en `reason`; se acepta también el `DOMException`
 * sin envolver.
 */
export function isQuotaError(err: unknown): boolean {
  const e = err as { name?: string; reason?: string } | null;
  return e?.name === "QuotaExceededError" || (e?.name === "indexed_db_went_bad" && e.reason === "QuotaExceededError");
}

export function createVaultStore(db: PouchDB.Database, ownerId: string, options: VaultStoreOptions = {}): VaultStore {
  const now = options.now ?? (() => utcNow());
  const newId = options.newId ?? (() => crypto.randomUUID());

  /** Ganadoras de todas las bóvedas (las perdedoras en conflicto las resuelve `conflicts.ts`). */
  async function winners(): Promise<VaultDoc[]> {
    const result = await db.allDocs<VaultDoc>({ startkey: ID_PREFIX, endkey: `${ID_PREFIX}￰`, include_docs: true });
    return result.rows.map((row) => row.doc as VaultDoc).filter((doc) => doc.type === "vault");
  }

  /** Carga la ganadora si está en el estado pedido; si no, `VaultNotFoundError` (como `_load` de 0003). */
  async function load(id: string, deleted: boolean): Promise<VaultDoc> {
    let doc: VaultDoc;
    try {
      doc = await db.get<VaultDoc>(ID_PREFIX + id);
    } catch (err) {
      if (isStatus(err, 404)) throw new VaultNotFoundError();
      throw err;
    }
    if (doc.type !== "vault" || (doc.deleted_at !== null) !== deleted) throw new VaultNotFoundError();
    return doc;
  }

  /** Aviso local de nombre ocupado: otra bóveda activa (no `selfId`) con la misma clave. */
  async function assertNameFree(name: string, selfId: string | null): Promise<void> {
    const key = nameKey(name);
    const taken = (await winners()).some(
      (doc) => doc.deleted_at === null && doc._id !== selfId && nameKey(doc.name) === key,
    );
    if (taken) throw new VaultNameTakenError();
  }

  /** Escribe una revisión nueva; traduce el 409 de PouchDB y la cuota agotada. */
  async function write(doc: VaultDoc): Promise<Vault> {
    try {
      const result = await db.put<VaultDoc>(doc as PouchDB.Core.PutDocument<VaultDoc>);
      return toVault({ ...doc, _rev: result.rev });
    } catch (err) {
      if (isStatus(err, 409)) throw new VaultChangedError();
      if (isQuotaError(err)) throw new StorageFullError();
      throw err;
    }
  }

  /** La UI editaba `rev`; si ya no es la ganadora, otro cambio llegó antes (local o por sync). */
  function assertCurrent(doc: VaultDoc, rev: string): void {
    if (doc._rev !== rev) throw new VaultChangedError();
  }

  return {
    async list({ deleted = false } = {}) {
      return (await winners())
        .filter((doc) => (doc.deleted_at !== null) === deleted)
        .sort(newestFirst)
        .map(toVault);
    },

    async get(id) {
      return toVault(await load(id, false));
    },

    async create(input) {
      const checked = validateVault(input);
      if (!checked.ok) throw new VaultValidationError(checked.fields);
      await assertNameFree(checked.value.name, null);
      const timestamp = now();
      return write({
        _id: ID_PREFIX + newId(),
        type: "vault",
        ...checked.value,
        owner_id: ownerId,
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null,
      });
    },

    async update(id, changes, rev) {
      // Sólo se validan y aplican los campos enviados (el PATCH parcial de 0003).
      const normalized: Partial<VaultFields> = {};
      const invalid: VaultField[] = [];
      for (const field of FIELD_ORDER) {
        if (!(field in changes)) continue;
        const result = FIELD_RULES[field](changes[field]);
        if (result.ok) (normalized as Record<VaultField, unknown>)[field] = result.value;
        else invalid.push(field);
      }
      if (invalid.length > 0) throw new VaultValidationError(invalid);

      const doc = await load(id, false);
      assertCurrent(doc, rev);
      if (normalized.name !== undefined) await assertNameFree(normalized.name, doc._id);
      return write({ ...doc, ...normalized, updated_at: now() });
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
      // Al volver a estar activa, su nombre vuelve a competir con las demás activas.
      await assertNameFree(doc.name, doc._id);
      return write({ ...doc, deleted_at: null, updated_at: now() });
    },
  };
}
