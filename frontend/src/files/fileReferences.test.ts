import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearReferenceCache, scanFileReferences } from "./fileReferences";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function store(items: Array<{ id: string; path: string; rev: string; content: string }>) {
  return {
    list: vi.fn().mockResolvedValue(items.map(({ id, path, rev }) => ({ id, path, rev, updated_at: "", deleted_at: null, size: 1 }))),
    get: vi.fn((id: string) => Promise.resolve(items.find((n) => n.id === id))),
  } as any;
}

describe("scanFileReferences (H-016 C-9)", () => {
  beforeEach(() => clearReferenceCache());

  it("agrupa por archivo los documentos que enlazan /files/<id> (imagen o enlace)", async () => {
    const notes = store([
      { id: "n1", path: "A.md", rev: "1", content: `![x](https://synapse.cjhirashi.com/files/${A})` },
      { id: "n2", path: "B.md", rev: "1", content: `[doc](https://synapse.cjhirashi.com/files/${A}) y [otro](https://synapse.cjhirashi.com/files/${B})` },
      { id: "n3", path: "C.md", rev: "1", content: "sin archivos" },
    ]);
    const refs = await scanFileReferences(notes, "v1");
    expect(refs.get(A)?.map((r) => r.path)).toEqual(["A.md", "B.md"]);
    expect(refs.get(B)?.map((r) => r.path)).toEqual(["B.md"]);
  });

  it("un archivo repetido en una misma nota cuenta una vez", async () => {
    const notes = store([{ id: "n1", path: "A.md", rev: "1", content: `/files/${A} y de nuevo /files/${A}` }]);
    expect((await scanFileReferences(notes, "v1")).get(A)).toHaveLength(1);
  });

  it("no vuelve a leer una nota cuya rev no cambió y sí la que cambió", async () => {
    const notes = store([{ id: "n1", path: "A.md", rev: "1", content: `/files/${A}` }]);
    await scanFileReferences(notes, "v1");
    await scanFileReferences(notes, "v1");
    expect(notes.get).toHaveBeenCalledTimes(1);
    const changed = store([{ id: "n1", path: "A.md", rev: "2", content: "ya sin enlace" }]);
    expect((await scanFileReferences(changed, "v1")).get(A)).toBeUndefined();
    expect(changed.get).toHaveBeenCalledTimes(1);
  });
});
