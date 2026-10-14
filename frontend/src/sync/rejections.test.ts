// Rechazos del push (SPEC-0005 RF-006; PLAN-0005 §2.5).
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { REJECTIONS_DOC_ID, openRejections, type RejectionsStore } from "./rejections";

PouchDB.plugin(memory);

const A = "vault:11111111-1111-4111-8111-111111111111";
const B = "vault:22222222-2222-4222-8222-222222222222";

let counter = 0;
let db: PouchDB.Database;
const opened: RejectionsStore[] = [];

beforeEach(() => {
  counter += 1;
  db = new PouchDB(`rejections-test-${counter}`, { adapter: "memory" });
});

afterEach(() => {
  opened.splice(0).forEach((store) => store.close());
});

async function open(): Promise<RejectionsStore> {
  const store = await openRejections(db);
  opened.push(store);
  return store;
}

describe("rechazos", () => {
  it("empieza vacía", async () => {
    expect((await open()).list()).toEqual([]);
  });

  it("'denied' añade una entrada con id, rev y motivo, y la persiste", async () => {
    const store = await open();
    await store.handle({ type: "denied", id: A, rev: "2-a", reason: "vault-name-taken" });
    expect(store.list()).toEqual([{ id: A, rev: "2-a", reason: "vault-name-taken" }]);
    const doc = await db.get<{ items: unknown[] }>(REJECTIONS_DOC_ID);
    expect(doc.items).toEqual([{ id: A, rev: "2-a", reason: "vault-name-taken" }]);
  });

  it("un rechazo nuevo del mismo id sustituye al anterior (una entrada por bóveda)", async () => {
    const store = await open();
    await store.handle({ type: "denied", id: A, rev: "2-a", reason: "vault-name-taken" });
    await store.handle({ type: "denied", id: B, rev: "1-b", reason: "validation-error:tags" });
    await store.handle({ type: "denied", id: A, rev: "3-a", reason: "validation-error:name" });
    expect(store.list()).toEqual([
      { id: B, rev: "1-b", reason: "validation-error:tags" },
      { id: A, rev: "3-a", reason: "validation-error:name" },
    ]);
  });

  it("se limpia cuando el push escribe una revisión de ese id en el servidor", async () => {
    const store = await open();
    await store.handle({ type: "denied", id: A, rev: "2-a", reason: "vault-name-taken" });
    await store.handle({ type: "denied", id: B, rev: "1-b", reason: "validation-error:tags" });
    await store.handle({ type: "written", docs: [{ id: A, rev: "3-a" }] });
    expect(store.list()).toEqual([{ id: B, rev: "1-b", reason: "validation-error:tags" }]);
    expect((await db.get<{ items: unknown[] }>(REJECTIONS_DOC_ID)).items).toEqual(store.list());
  });

  it("las escrituras de otros ids y los demás eventos no la tocan", async () => {
    const store = await open();
    await store.handle({ type: "denied", id: A, rev: "2-a", reason: "vault-name-taken" });
    await store.handle({ type: "written", docs: [{ id: B, rev: "1-b" }] });
    await store.handle({ type: "paused", direction: "push", offline: false });
    await store.handle({ type: "checkpoint", seq: 9 });
    expect(store.list()).toEqual([{ id: A, rev: "2-a", reason: "vault-name-taken" }]);
  });

  it("sobrevive a recargar", async () => {
    const first = await open();
    await first.handle({ type: "denied", id: A, rev: "2-a", reason: "vault-name-taken" });
    first.close();
    const reloaded = await open();
    expect(reloaded.list()).toEqual([{ id: A, rev: "2-a", reason: "vault-name-taken" }]);
  });

  it("avisa a los suscriptores en cada cambio y deja de hacerlo al darse de baja", async () => {
    const store = await open();
    const seen: number[] = [];
    const unsubscribe = store.subscribe((items) => seen.push(items.length));
    await store.handle({ type: "denied", id: A, rev: "2-a", reason: "vault-name-taken" });
    await store.handle({ type: "written", docs: [{ id: A, rev: "3-a" }] });
    unsubscribe();
    await store.handle({ type: "denied", id: B, rev: "1-b", reason: "validation-error:tags" });
    expect(seen).toEqual([1, 0]);
  });

  it("dos pestañas que procesan los mismos eventos a la vez convergen sin 409", async () => {
    const [one, two] = [await open(), await open()];
    const events = [
      { type: "denied", id: A, rev: "2-a", reason: "vault-name-taken" },
      { type: "denied", id: B, rev: "1-b", reason: "validation-error:tags" },
    ] as const;
    await Promise.all([...events.map((e) => one.handle(e)), ...events.map((e) => two.handle(e))]);
    const doc = await db.get<{ items: { id: string }[] }>(REJECTIONS_DOC_ID);
    expect(doc.items.map((item) => item.id).sort()).toEqual([A, B]);
  });
});

describe("settled (VC-4, enmienda 1)", () => {
  it("espera las escrituras en curso aunque nadie esperara a `handle`", async () => {
    const store = await open();
    void store.handle({ type: "denied", id: A, rev: "2-a", reason: "vault-name-taken" });
    void store.handle({ type: "denied", id: B, rev: "1-b", reason: "invalid-name" });
    await store.settled();
    expect(store.list()).toEqual([
      { id: A, rev: "2-a", reason: "vault-name-taken" },
      { id: B, rev: "1-b", reason: "invalid-name" },
    ]);
  });

  it("sin escrituras pendientes termina enseguida", async () => {
    const store = await open();
    await expect(store.settled()).resolves.toBeUndefined();
  });

  it("una escritura fallida no bloquea las siguientes ni deja `settled` rechazada", async () => {
    const store = await open();
    const put = vi.spyOn(db, "put").mockRejectedValueOnce(new Error("disco lleno"));
    await expect(store.handle({ type: "denied", id: A, rev: "2-a", reason: "x" })).rejects.toThrow("disco lleno");
    put.mockRestore();
    await expect(store.settled()).resolves.toBeUndefined();
    await store.handle({ type: "denied", id: B, rev: "1-b", reason: "invalid-name" });
    expect(store.list()).toEqual([{ id: B, rev: "1-b", reason: "invalid-name" }]);
  });
});
