// Operaciones de la UI sobre las notas de la réplica local (SPEC-0008 RF-003, RF-010…RF-013,
// RF-016, RF-017; PLAN-0008 §2.6).
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { vi } from "vitest";
import { StorageFullError } from "../sync/vaultStore";
import {
  NoteChangedError, NoteNotFoundError, NotePathTakenError, NoteValidationError, createNoteStore, type NoteStore,
} from "./noteStore";

PouchDB.plugin(memory);

const VAULT = "11111111-1111-4111-8111-111111111111";
const OTHER_VAULT = "22222222-2222-4222-8222-222222222222";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let counter = 0;
let db: PouchDB.Database;
let store: NoteStore;
let tick: number;

/** Reloj de prueba: cada lectura avanza un segundo (con el formato de `utc_now`). */
function nextTime(): string {
  tick += 1;
  return `2026-10-22T10:00:${String(tick).padStart(2, "0")}.000000Z`;
}

beforeEach(() => {
  counter += 1;
  tick = 0;
  db = new PouchDB(`notestore-test-${counter}`, { adapter: "memory" });
  store = createNoteStore(db, { now: nextTime });
});

/** Manda una nota a la papelera escribiendo el documento a mano (`softDelete` se prueba aparte). */
async function trash(id: string): Promise<void> {
  const doc = await db.get<{ deleted_at: string | null }>(id);
  await db.put({ ...doc, deleted_at: "2026-10-22T09:00:00.000000Z" });
}

describe("RF-003, RF-012: create", () => {
  it("con título añade .md y guarda un documento de nota completo", async () => {
    const note = await store.create(VAULT, "Ideas");
    expect(note.id).toMatch(new RegExp(`^note:${VAULT}:`));
    expect(note.id.slice(`note:${VAULT}:`.length)).toMatch(UUID);
    expect(note.path).toBe("Ideas.md");
    const doc = await db.get(note.id);
    expect(doc).toEqual({
      _id: note.id, _rev: note.rev, type: "note", vault_id: VAULT, path: "Ideas.md", frontmatter: {},
      content: "", created_at: "2026-10-22T10:00:01.000000Z", updated_at: "2026-10-22T10:00:01.000000Z",
      deleted_at: null,
    });
  });

  it("no duplica la extensión .md, sin distinguir mayúsculas, y admite carpetas", async () => {
    expect((await store.create(VAULT, "a/b.MD")).path).toBe("a/b.MD");
    expect((await store.create(VAULT, "  c / d  ")).path).toBe("c/d.md");
  });

  it("RF-012: sin título (o en blanco) usa «Sin título» y después «Sin título n»", async () => {
    expect((await store.create(VAULT)).path).toBe("Sin título.md");
    expect((await store.create(VAULT, "  ")).path).toBe("Sin título 2.md");
    expect((await store.create(VAULT)).path).toBe("Sin título 3.md");
  });

  it("RF-012: los «Sin título» de otra bóveda o de la papelera no cuentan", async () => {
    await store.create(OTHER_VAULT);
    const trashed = await store.create(VAULT);
    await trash(trashed.id);
    expect((await store.create(VAULT)).path).toBe("Sin título.md");
  });

  it("RF-013: una ruta equivalente a la de otra nota activa → NotePathTakenError, sin escribir", async () => {
    await store.create(VAULT, "Straße");
    const before = (await db.info()).doc_count;
    await expect(store.create(VAULT, "STRASSE")).rejects.toBeInstanceOf(NotePathTakenError);
    expect((await db.info()).doc_count).toBe(before);
  });

  it("RF-013: la misma ruta en otra bóveda es libre", async () => {
    await store.create(VAULT, "Ideas");
    await expect(store.create(OTHER_VAULT, "Ideas")).resolves.toMatchObject({ path: "Ideas.md" });
  });

  it("RF-005: una ruta inválida → NoteValidationError(path), sin escribir", async () => {
    const err = await store.create(VAULT, "a//b").catch((e) => e);
    expect(err).toBeInstanceOf(NoteValidationError);
    expect(err.fields).toEqual(["path"]);
    expect((await db.info()).doc_count).toBe(0);
  });
});

describe("RF-001, RF-019: list y get", () => {
  it("lista las notas activas de la bóveda sin content ni notas de otra bóveda", async () => {
    const a = await store.create(VAULT, "A");
    await store.create(OTHER_VAULT, "B");
    const [item, ...rest] = await store.list(VAULT);
    expect(rest).toEqual([]);
    expect(item).toEqual({ id: a.id, path: "A.md", rev: a.rev, updated_at: a.updated_at, deleted_at: null, size: 0 });
    expect(item).not.toHaveProperty("content");
  });

  it("RF-010: separa activas y papelera según `deleted`", async () => {
    const a = await store.create(VAULT, "A");
    await store.create(VAULT, "B");
    await trash(a.id);
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["B.md"]);
    expect((await store.list(VAULT, { deleted: true })).map((n) => n.path)).toEqual(["A.md"]);
  });

  it("devuelve las notas por ruta", async () => {
    await store.create(VAULT, "b");
    await store.create(VAULT, "a");
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["a.md", "b.md"]);
  });

  it("get devuelve la nota completa con su contenido", async () => {
    const created = await store.create(VAULT, "A");
    expect(await store.get(created.id)).toEqual(created);
  });

  it("get de una nota inexistente o en la papelera → NoteNotFoundError", async () => {
    await expect(store.get(`note:${VAULT}:${"3".repeat(8)}`)).rejects.toBeInstanceOf(NoteNotFoundError);
    const a = await store.create(VAULT, "A");
    await trash(a.id);
    await expect(store.get(a.id)).rejects.toBeInstanceOf(NoteNotFoundError);
  });

  // RNF-001 (PLAN-0010 §10.5): el resumen lleva `size` (longitud de `content`) para que el programador
  // de precálculo elija candidatas sin leer los cuerpos; se actualiza con cada revisión.
  it("el resumen lleva `size` = longitud de content y se actualiza con cada revisión", async () => {
    const a = await store.create(VAULT, "A");
    const size = async () => (await store.list(VAULT)).find((n) => n.id === a.id)?.size;
    expect(await size()).toBe(0);
    const saved = await store.save(a.id, "hola mundo", a.rev); // 10 caracteres
    expect(await size()).toBe(10);
    await store.save(a.id, "x".repeat(50), saved.rev);
    expect(await size()).toBe(50);
  });
});

describe("RF-011, RF-013: rename", () => {
  // VU-6: renombrar aplica la misma regla título→ruta que crear (`.md` si falta, sin distinguir mayúsculas).
  it("al renombrar se añade `.md` si falta, igual que al crear", async () => {
    const a = await store.create(VAULT, "A");
    const created = await store.create(VAULT, "Otra/Movida");
    const renamed = await store.rename(a.id, "Otra/Movida2", a.rev);
    expect(created.path).toBe("Otra/Movida.md");
    expect(renamed.path).toBe("Otra/Movida2.md");
    await expect(store.rename(renamed.id, "Otra/Final.MD", renamed.rev)).resolves.toMatchObject({ path: "Otra/Final.MD" });
  });

  it("cambia la ruta en la misma nota (mismo _id) y renueva updated_at", async () => {
    const a = await store.create(VAULT, "A");
    const renamed = await store.rename(a.id, "carpeta / B.md", a.rev);
    expect(renamed).toMatchObject({ id: a.id, path: "carpeta/B.md", updated_at: "2026-10-22T10:00:02.000000Z" });
    expect(renamed.rev).not.toBe(a.rev);
    expect((await store.get(a.id)).path).toBe("carpeta/B.md");
  });

  it("RF-013: una ruta ocupada por otra nota activa → NotePathTakenError, sin escribir", async () => {
    const a = await store.create(VAULT, "A");
    await store.create(VAULT, "B");
    await expect(store.rename(a.id, "b.MD", a.rev)).rejects.toBeInstanceOf(NotePathTakenError);
    expect((await store.get(a.id)).rev).toBe(a.rev);
  });

  it("renombrar a su propia ruta (otra capitalización) no choca consigo misma", async () => {
    const a = await store.create(VAULT, "a");
    await expect(store.rename(a.id, "A.md", a.rev)).resolves.toMatchObject({ path: "A.md" });
  });

  it("RF-005: una ruta inválida → NoteValidationError(path)", async () => {
    const a = await store.create(VAULT, "A");
    const err = await store.rename(a.id, "x//y.md", a.rev).catch((e) => e);
    expect(err).toBeInstanceOf(NoteValidationError);
    expect(err.fields).toEqual(["path"]);
  });

  it("con una revisión desfasada → NoteChangedError", async () => {
    const a = await store.create(VAULT, "A");
    await store.rename(a.id, "B.md", a.rev);
    await expect(store.rename(a.id, "C.md", a.rev)).rejects.toBeInstanceOf(NoteChangedError);
  });
});

describe("RF-010, RF-017: softDelete y restore", () => {
  it("softDelete es una revisión con deleted_at, nunca una lápida", async () => {
    const a = await store.create(VAULT, "A");
    const deleted = await store.softDelete(a.id, a.rev);
    expect(deleted.deleted_at).toBe("2026-10-22T10:00:02.000000Z");
    const doc = await db.get<{ _deleted?: boolean; deleted_at: string; content: string }>(a.id);
    expect(doc._deleted).toBeUndefined();
    expect(doc.deleted_at).toBe(deleted.deleted_at);
  });

  it("una nota borrada sale del listado activo y entra en la papelera; borrar dos veces → no encontrada", async () => {
    const a = await store.create(VAULT, "A");
    const deleted = await store.softDelete(a.id, a.rev);
    expect(await store.list(VAULT)).toEqual([]);
    expect((await store.list(VAULT, { deleted: true })).map((n) => n.id)).toEqual([a.id]);
    await expect(store.softDelete(a.id, deleted.rev)).rejects.toBeInstanceOf(NoteNotFoundError);
  });

  it("restore devuelve la nota a las activas con deleted_at null", async () => {
    const a = await store.create(VAULT, "A");
    const deleted = await store.softDelete(a.id, a.rev);
    const restored = await store.restore(a.id, deleted.rev);
    expect(restored.deleted_at).toBeNull();
    expect((await store.list(VAULT)).map((n) => n.id)).toEqual([a.id]);
  });

  it("RF-017: restore con la ruta ocupada por otra nota activa → NotePathTakenError", async () => {
    const a = await store.create(VAULT, "A");
    const deleted = await store.softDelete(a.id, a.rev);
    await store.create(VAULT, "a");
    await expect(store.restore(a.id, deleted.rev)).rejects.toBeInstanceOf(NotePathTakenError);
    expect((await store.list(VAULT, { deleted: true })).map((n) => n.id)).toEqual([a.id]);
  });

  it("restore de una nota activa → no encontrada", async () => {
    const a = await store.create(VAULT, "A");
    await expect(store.restore(a.id, a.rev)).rejects.toBeInstanceOf(NoteNotFoundError);
  });
});

describe("RF-003, RF-016: save", () => {
  it("guarda el contenido como revisión nueva y renueva updated_at", async () => {
    const a = await store.create(VAULT, "A");
    const saved = await store.save(a.id, "# Hola", a.rev);
    expect(saved).toMatchObject({ id: a.id, content: "# Hola", path: "A.md", updated_at: "2026-10-22T10:00:02.000000Z" });
    expect((await store.get(a.id)).content).toBe("# Hola");
  });

  it("RF-016: más de 2 MiB → NoteValidationError(content) sin escribir", async () => {
    const a = await store.create(VAULT, "A");
    const err = await store.save(a.id, "a".repeat(2 * 1024 * 1024 + 1), a.rev).catch((e) => e);
    expect(err).toBeInstanceOf(NoteValidationError);
    expect(err.fields).toEqual(["content"]);
    expect((await store.get(a.id)).rev).toBe(a.rev);
  });

  it("RF-016: exactamente 2 MiB se guarda", async () => {
    const a = await store.create(VAULT, "A");
    await expect(store.save(a.id, "a".repeat(2 * 1024 * 1024), a.rev)).resolves.toBeDefined();
  });

  it("save sobre una nota inexistente → no encontrada", async () => {
    await expect(store.save(`note:${VAULT}:${"3".repeat(8)}`, "x", "1-abc")).rejects.toBeInstanceOf(NoteNotFoundError);
  });

  it("RF-012: save con frontmatter escribe content y frontmatter juntos", async () => {
    const a = await store.create(VAULT, "A");
    const saved = await store.save(a.id, "# Hola", a.rev, { título: "Nota", n: 3, t: ["a", "b"] });
    expect(saved.frontmatter).toEqual({ título: "Nota", n: 3, t: ["a", "b"] });
    expect(saved.content).toBe("# Hola");
    const reloaded = await store.get(a.id);
    expect(reloaded.frontmatter).toEqual({ título: "Nota", n: 3, t: ["a", "b"] });
  });

  it("RF-012: save sin frontmatter conserva el anterior", async () => {
    const a = await store.create(VAULT, "A");
    const withFm = await store.save(a.id, "cuerpo 1", a.rev, { k: 1 });
    const without = await store.save(a.id, "cuerpo 2", withFm.rev);
    expect(without.frontmatter).toEqual({ k: 1 });
    expect(without.content).toBe("cuerpo 2");
  });

  it("RF-022 (P-8): la rama de conflicto lleva el frontmatter nuevo que se pasó", async () => {
    const a = await store.create(VAULT, "A");
    await store.save(a.id, "otra pestaña", a.rev, { origen: "otra" }); // adelanta la revisión
    const branch = await store.save(a.id, "mi edición", a.rev, { origen: "mía" }); // sobre a.rev (desfasada)
    expect(branch.content).toBe("mi edición");
    expect(branch.frontmatter).toEqual({ origen: "mía" });
  });

  it("RF-019: frontmatter cuyo JSON supera 64 KiB → NoteValidationError(frontmatter) sin escribir", async () => {
    const a = await store.create(VAULT, "A");
    const huge = { big: "x".repeat(70 * 1024) };
    const err = await store.save(a.id, "cuerpo", a.rev, huge).catch((e) => e);
    expect(err).toBeInstanceOf(NoteValidationError);
    expect(err.fields).toEqual(["frontmatter"]);
    expect((await store.get(a.id)).rev).toBe(a.rev);
    expect((await store.get(a.id)).frontmatter).toEqual({});
  });
});

describe("RF-010: cuota", () => {
  it("la cuota de IndexedDB agotada → StorageFullError", async () => {
    const a = await store.create(VAULT, "A");
    // PouchDB envuelve el QuotaExceededError de IndexedDB en `indexed_db_went_bad`.
    vi.spyOn(db, "put").mockRejectedValueOnce({ name: "indexed_db_went_bad", reason: "QuotaExceededError" });
    await expect(store.save(a.id, "x", a.rev)).rejects.toBeInstanceOf(StorageFullError);
    vi.restoreAllMocks();
  });
});

describe("RF-009 (P-8): save sobre una revisión desfasada", () => {
  it("escribe lo guardado como rama hija de baseRev y la nota queda en conflicto", async () => {
    const a = await store.create(VAULT, "A");
    const other = await store.save(a.id, "otra pestaña", a.rev); // la revisión «actual»
    const branch = await store.save(a.id, "mi edición", a.rev); // sigue editando sobre a.rev (desfasada)
    expect(branch.content).toBe("mi edición");
    expect(branch.rev).not.toBe(other.rev);
    expect(branch.rev.startsWith("2-")).toBe(true); // hija de la 1.ª revisión, hermana de `other`

    const doc = await db.get<{ content: string; _conflicts?: string[] }>(a.id, { conflicts: true });
    const revs = [doc._rev as string, ...(doc._conflicts ?? [])].sort();
    expect(revs).toEqual([other.rev, branch.rev].sort());
    // Lo escrito no se pierde: ambas ramas conservan su texto.
    expect((await db.get<{ content: string }>(a.id, { rev: branch.rev })).content).toBe("mi edición");
    expect((await db.get<{ content: string }>(a.id, { rev: other.rev })).content).toBe("otra pestaña");
  });

  it("la revisión es determinista: dos guardados iguales dan la misma _rev", async () => {
    const a = await store.create(VAULT, "A");
    await store.save(a.id, "otra pestaña", a.rev);
    // Reloj fijo para que el cuerpo (con updated_at) sea idéntico en las dos llamadas.
    const fixed = createNoteStore(db, { now: () => "2026-10-22T11:00:00.000000Z" });
    const first = await fixed.save(a.id, "mi edición", a.rev);
    const second = await fixed.save(a.id, "mi edición", a.rev);
    expect(second.rev).toBe(first.rev);
    const doc = await db.get<{ _conflicts?: string[] }>(a.id, { conflicts: true });
    expect(doc._conflicts).toHaveLength(1);
  });

  it("el cuerpo de la rama parte del de baseRev (no del de la ganadora) con el contenido nuevo", async () => {
    const a = await store.create(VAULT, "A");
    await store.rename(a.id, "B.md", a.rev);
    const branch = await store.save(a.id, "x", a.rev);
    expect(branch.path).toBe("A.md");
  });

  it("una baseRev que ya no existe → NoteChangedError", async () => {
    const a = await store.create(VAULT, "A");
    await store.save(a.id, "otra", a.rev);
    await expect(store.save(a.id, "x", "1-" + "0".repeat(32))).rejects.toBeInstanceOf(NoteChangedError);
  });
});

// S-1 (PLAN-0008 §17): índice de resumen incremental; las operaciones no leen el `content` de todas las notas.
describe("RF-001, RNF-001: índice de resumen (S-1)", () => {
  const bodies = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter(([options]) => (options as { include_docs?: boolean } | undefined)?.include_docs);

  it("list/create/rename no vuelven a leer los cuerpos de todas las notas", async () => {
    for (const title of ["A", "B", "C"]) await store.create(VAULT, title);
    await store.list(VAULT); // construye el índice (una vez)
    const allDocs = vi.spyOn(db, "allDocs");
    const created = await store.create(VAULT, "D");
    await store.create(VAULT, ""); // «Sin título» consulta las rutas ocupadas
    await store.rename(created.id, "D2", created.rev);
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["A.md", "B.md", "C.md", "D2.md", "Sin título.md"]);
    expect(bodies(allDocs)).toEqual([]);
  });

  it("el índice recoge lo que escriben otros (pull, otra pestaña): alta, cambio de ruta y borrado", async () => {
    const a = await store.create(VAULT, "A");
    await store.list(VAULT);
    // Escrituras que no pasan por este almacén: el replicador las hace con `new_edits: false`.
    const doc = await db.get<Record<string, unknown>>(a.id);
    await db.put({ ...doc, path: "Movida.md" });
    await db.put({
      _id: `note:${VAULT}:ext`, type: "note", vault_id: VAULT, path: "Externa.md", frontmatter: {}, content: "x",
      created_at: "2026-10-22T09:00:00.000000Z", updated_at: "2026-10-22T09:00:00.000000Z", deleted_at: null,
    });
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["Externa.md", "Movida.md"]);
    // La unicidad local también usa el índice ya al día.
    await expect(store.create(VAULT, "externa")).rejects.toBeInstanceOf(NotePathTakenError);
    const ext = await db.get<Record<string, unknown>>(`note:${VAULT}:ext`);
    await db.remove(ext._id as string, ext._rev as string); // tumba de PouchDB
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["Movida.md"]);
  });

  // S-7 (PLAN-0008 §18): la construcción inicial lee los cuerpos por lotes, no todos de una vez.
  it("la construcción inicial del índice pide los cuerpos en lotes de 200 como máximo", async () => {
    const stamp = "2026-10-22T09:00:00.000000Z";
    await db.bulkDocs(
      Array.from({ length: 450 }, (_, i) => ({
        _id: `note:${VAULT}:${String(i).padStart(4, "0")}`, type: "note", vault_id: VAULT, path: `n${i}.md`,
        frontmatter: {}, content: "x".repeat(100), created_at: stamp, updated_at: stamp, deleted_at: null,
      })),
    );
    const allDocs = vi.spyOn(db, "allDocs");
    expect(await store.list(VAULT)).toHaveLength(450);
    const withBodies = bodies(allDocs).map(([options]) => (options as { limit?: number }).limit);
    expect(withBodies.length).toBeGreaterThanOrEqual(3); // 450 / 200
    expect(withBodies.every((limit) => limit !== undefined && limit <= 200)).toBe(true);
  });

  // S-8 (PLAN-0008 §19): la cota del siguiente lote es estricta; si la última clave del lote
  // desaparece antes de pedirlo, no se pierde ninguna nota viva.
  it("si la última clave de un lote se borra antes del siguiente, no se pierde ninguna nota viva", async () => {
    const stamp = "2026-10-22T09:00:00.000000Z";
    await db.bulkDocs(
      Array.from({ length: 450 }, (_, i) => ({
        _id: `note:${VAULT}:${String(i).padStart(4, "0")}`, type: "note", vault_id: VAULT, path: `n${i}.md`,
        frontmatter: {}, content: "x", created_at: stamp, updated_at: stamp, deleted_at: null,
      })),
    );
    const real = db.allDocs.bind(db) as (o: unknown) => Promise<{ rows: { id: string; doc?: { _rev: string } }[] }>;
    let first = true;
    vi.spyOn(db, "allDocs").mockImplementation((async (options: { include_docs?: boolean }) => {
      const page = await real(options);
      if (options?.include_docs && first) {
        first = false;
        const lastRow = page.rows[page.rows.length - 1];
        await db.remove(lastRow.id, lastRow.doc!._rev); // desaparece entre lotes
      }
      return page;
    }) as never);
    const paths = (await store.list(VAULT)).map((n) => n.path);
    // 449 vivas: n199 se borró; la 200 (n200) no debe perderse.
    expect(paths).toHaveLength(449);
    expect(paths).toContain("n200.md");
  });
});

// H-003 (C-2): mover una carpeta reubica todas sus notas al nuevo prefijo, conservando la
// subestructura relativa; reusa la misma regla de ruta/unicidad que `rename` (no hay endpoint nuevo).
describe("H-003: moveFolder (mover una carpeta en lote)", () => {
  it("C-2: mueve todas las notas de la carpeta al nuevo padre conservando la subestructura", async () => {
    await store.create(VAULT, "Proyectos/Plan.md");
    await store.create(VAULT, "Proyectos/Sub/Hoja.md");
    await store.create(VAULT, "Archivo/Viejo.md");
    await store.moveFolder(VAULT, "Proyectos", "Archivo");
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual([
      "Archivo/Proyectos/Plan.md",
      "Archivo/Proyectos/Sub/Hoja.md",
      "Archivo/Viejo.md",
    ]);
  });

  it("C-2: mover a la raíz (destino vacío) deja la carpeta como prefijo de primer nivel", async () => {
    await store.create(VAULT, "A/B/Nota.md");
    await store.create(VAULT, "A/B/Sub/Otra.md");
    await store.moveFolder(VAULT, "A/B", "");
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["B/Nota.md", "B/Sub/Otra.md"]);
  });

  it("C-5: una ruta de destino ya ocupada → NotePathTakenError, sin mover ninguna nota", async () => {
    await store.create(VAULT, "Origen/Nota.md");
    await store.create(VAULT, "Destino/Origen/Nota.md");
    await expect(store.moveFolder(VAULT, "Origen", "Destino")).rejects.toBeInstanceOf(NotePathTakenError);
    // "sin mover nada": las rutas siguen exactamente como estaban.
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["Destino/Origen/Nota.md", "Origen/Nota.md"]);
  });

  it("sólo mueve las notas de ESA carpeta, no las de otra con un nombre que empieza igual", async () => {
    await store.create(VAULT, "Nota/A.md");
    await store.create(VAULT, "Notas/B.md"); // «Notas» no es «Nota/…»
    await store.moveFolder(VAULT, "Nota", "Archivo");
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["Archivo/Nota/A.md", "Notas/B.md"]);
  });
});

// H-003 (C-8): mover una nota (vía `rename`, el camino compartido del drag y del renombrado por
// teclado) que deja su carpeta de origen sin notas activas crea ahí un `Sin título.md` para que la
// carpeta siga existiendo. NO aplica a `moveFolder` (la carpeta se reubica entera, no se vacía).
describe("H-003 C-8: placeholder al vaciar la carpeta de origen al mover una nota", () => {
  it("mover la última nota de una carpeta deja un «Sin título.md» en el origen", async () => {
    const a = await store.create(VAULT, "Carpeta/Sola.md");
    await store.rename(a.id, "Sola.md", a.rev); // la saca a la raíz
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["Carpeta/Sin título.md", "Sola.md"]);
  });

  it("si quedan otras notas en la carpeta de origen no crea placeholder", async () => {
    const uno = await store.create(VAULT, "Carpeta/Uno.md");
    await store.create(VAULT, "Carpeta/Dos.md");
    await store.rename(uno.id, "Uno.md", uno.rev);
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["Carpeta/Dos.md", "Uno.md"]);
  });

  it("mover a una subcarpeta del propio origen no lo vacía (la carpeta sigue existiendo por el descendiente)", async () => {
    const x = await store.create(VAULT, "Carpeta/x.md");
    await store.rename(x.id, "Carpeta/Sub/x.md", x.rev);
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["Carpeta/Sub/x.md"]);
  });

  it("mover una nota desde la raíz no crea placeholder (la raíz no es una carpeta derivada)", async () => {
    const solo = await store.create(VAULT, "Solo.md");
    await store.rename(solo.id, "Carpeta/Solo.md", solo.rev);
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["Carpeta/Solo.md"]);
  });

  it("moveFolder NO deja placeholder en el origen (la carpeta se reubica entera)", async () => {
    await store.create(VAULT, "Origen/x.md");
    await store.create(VAULT, "Origen/Sub/y.md");
    await store.moveFolder(VAULT, "Origen", "Destino");
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["Destino/Origen/Sub/y.md", "Destino/Origen/x.md"]);
  });
});

// H-024 (C-5, C-6): renombrar una carpeta cambia el prefijo de todas sus notas activas conservando la
// subestructura; reusa la misma regla de unicidad que `moveFolder`.
describe("H-024 C-5/C-6: renameFolder (renombrar una carpeta en lote)", () => {
  it("C-5: cambia el nombre de la carpeta conservando la subestructura", async () => {
    await store.create(VAULT, "Proyectos/Plan.md");
    await store.create(VAULT, "Proyectos/Sub/Hoja.md");
    await store.create(VAULT, "Otra/Viejo.md");
    await store.renameFolder(VAULT, "Proyectos", "Trabajo");
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual([
      "Otra/Viejo.md",
      "Trabajo/Plan.md",
      "Trabajo/Sub/Hoja.md",
    ]);
  });

  it("C-6: un nombre ya ocupado en la carpeta padre → NotePathTakenError, sin mover ninguna nota", async () => {
    await store.create(VAULT, "Proyectos/Plan.md");
    await store.create(VAULT, "Trabajo/Plan.md");
    await expect(store.renameFolder(VAULT, "Proyectos", "Trabajo")).rejects.toBeInstanceOf(NotePathTakenError);
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["Proyectos/Plan.md", "Trabajo/Plan.md"]);
  });

  it("ignora las notas de la papelera: no las mueve", async () => {
    await store.create(VAULT, "Proyectos/Viva.md");
    const borrada = await store.create(VAULT, "Proyectos/Borrada.md");
    await trash(borrada.id);
    await store.renameFolder(VAULT, "Proyectos", "Trabajo");
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["Trabajo/Viva.md"]);
    expect((await store.list(VAULT, { deleted: true })).map((n) => n.path)).toEqual(["Proyectos/Borrada.md"]);
  });
});

// H-024 (C-8): borrar una carpeta manda a la papelera todas sus notas activas (también las de
// subcarpetas), una a una y recuperables, y devuelve cuántas fueron.
describe("H-024 C-8: softDeleteFolder (borrar una carpeta en lote)", () => {
  it("manda a la papelera todas sus notas activas, incluidas las de subcarpetas, y devuelve cuántas", async () => {
    await store.create(VAULT, "Proyectos/Plan.md");
    await store.create(VAULT, "Proyectos/Sub/Hoja.md");
    await store.create(VAULT, "Otra/Viejo.md");
    expect(await store.softDeleteFolder(VAULT, "Proyectos")).toBe(2);
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["Otra/Viejo.md"]);
    expect((await store.list(VAULT, { deleted: true })).map((n) => n.path)).toEqual([
      "Proyectos/Plan.md",
      "Proyectos/Sub/Hoja.md",
    ]);
  });

  it("no toca una carpeta hermana cuyo nombre empieza igual (A frente a AB)", async () => {
    await store.create(VAULT, "A/x.md");
    await store.create(VAULT, "AB/y.md");
    expect(await store.softDeleteFolder(VAULT, "A")).toBe(1);
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["AB/y.md"]);
  });

  it("no cuenta ni vuelve a borrar las notas que ya estaban en la papelera", async () => {
    const ya = await store.create(VAULT, "A/ya.md");
    await store.create(VAULT, "A/nueva.md");
    await trash(ya.id);
    expect(await store.softDeleteFolder(VAULT, "A")).toBe(1);
  });

  it("una nota con ruta inválida dentro impide el borrado y no manda ninguna a la papelera", async () => {
    await store.create(VAULT, "A/ok.md");
    await db.put({
      _id: `note:${VAULT}:invalida`, type: "note", vault_id: VAULT, path: "A/zz/.md", frontmatter: {},
      content: "", created_at: nextTime(), updated_at: nextTime(), deleted_at: null,
    });
    await expect(store.softDeleteFolder(VAULT, "A")).rejects.toBeInstanceOf(NoteValidationError);
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["A/ok.md", "A/zz/.md"]);
  });
});

describe("SPEC-0010 RF-001/RF-003/RF-008: carpetas y puerta de ruta", () => {
  it("RF-003: create con carpeta pone la nota dentro (título relativo)", async () => {
    const note = await store.create(VAULT, "Nota", "Proyectos");
    expect(note.path).toBe("Proyectos/Nota.md");
  });

  it("RF-001: el título con `/` anida bajo la carpeta", async () => {
    const note = await store.create(VAULT, "sub/Nota", "Proyectos");
    expect(note.path).toBe("Proyectos/sub/Nota.md");
  });

  it("RF-012: sin título en una carpeta usa «Carpeta/Sin título n» de esa carpeta", async () => {
    const first = await store.create(VAULT, "", "Proyectos");
    expect(first.path).toBe("Proyectos/Sin título.md");
    await store.create(VAULT, "", ""); // «Sin título.md» en la raíz no cuenta para la carpeta
    const second = await store.create(VAULT, "", "Proyectos");
    expect(second.path).toBe("Proyectos/Sin título 2.md");
  });

  it("RF-007: `Carpeta/` (sin nombre de nota) se rechaza sin escribir", async () => {
    const err = await store.create(VAULT, "Carpeta/").catch((e) => e);
    expect(err).toBeInstanceOf(NoteValidationError);
    expect(err.fields).toEqual(["path"]);
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual([]);
  });

  /** Siembra directa de una nota con ruta inválida (como la dejaría una réplica vieja). */
  async function seedInvalid(path: string): Promise<string> {
    const id = `note:${VAULT}:${"a".repeat(8)}-${"b".repeat(4)}-4${"c".repeat(3)}-8${"d".repeat(3)}-${"e".repeat(12)}`;
    await db.put({ _id: id, type: "note", vault_id: VAULT, path, frontmatter: {}, content: "", created_at: nextTime(), updated_at: nextTime(), deleted_at: null });
    return id;
  }

  it("RF-008 (P-12): guardar una nota con ruta inválida se rechaza con NoteValidationError(path)", async () => {
    const id = await seedInvalid("X/.md");
    const doc = await store.get(id);
    const err = await store.save(id, "nuevo contenido", doc.rev).catch((e) => e);
    expect(err).toBeInstanceOf(NoteValidationError);
    expect(err.fields).toEqual(["path"]);
    expect((await store.get(id)).content).toBe(""); // no escribió
  });

  it("RF-008 (P-12): borrar una nota con ruta inválida también se rechaza", async () => {
    const id = await seedInvalid("X/.md");
    const doc = await store.get(id);
    const err = await store.softDelete(id, doc.rev).catch((e) => e);
    expect(err).toBeInstanceOf(NoteValidationError);
    expect(err.fields).toEqual(["path"]);
  });
});
