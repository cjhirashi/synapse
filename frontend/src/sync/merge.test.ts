// Combinación automática de conflictos (SPEC-0005 RF-012…RF-015; ADR-003; PLAN-0005 §2.6).
import { mergeVault, type MergeBody } from "./merge";

const NOW = "2026-10-13T12:00:00.000000Z";

/** Ancestro común de los casos: una bóveda activa con dos etiquetas. */
const A: MergeBody = {
  name: "Notas", description: "base", tags: ["a", "b"], owner_id: "owner-1",
  created_at: "2026-10-01T00:00:00.000000Z", updated_at: "2026-10-01T00:00:00.000000Z", deleted_at: null,
};
const side = (changes: Partial<MergeBody>, at = "2026-10-02T00:00:00.000000Z"): MergeBody => ({ ...A, updated_at: at, ...changes });
const DELETED = "2026-10-03T00:00:00.000000Z";

function merged(w: MergeBody, l: MergeBody, a: MergeBody | null = A) {
  const result = mergeVault(w, l, a, NOW);
  if (result.kind !== "merged") throw new Error(`se esperaba combinación, llegó ${JSON.stringify(result)}`);
  return result;
}

describe("paso 1: sin ancestro", () => {
  it("conflicto manual", () => {
    expect(mergeVault(side({ name: "W" }), side({ name: "L" }), null, NOW)).toEqual({ kind: "manual", reason: "no-ancestor" });
  });
});

describe("paso 2: name y description", () => {
  it.each([
    ["iguales en ambos lados", { name: "X" }, { name: "X" }, "X"],
    ["sólo cambió W", { name: "W" }, {}, "W"],
    ["sólo cambió L", {}, { name: "L" }, "L"],
    ["ninguno cambió", {}, {}, "Notas"],
  ])("name: %s", (_label, w, l, expected) => {
    expect(merged(side(w), side(l)).doc.name).toBe(expected);
  });

  it("description: el lado que cambió gana, también a null", () => {
    expect(merged(side({}), side({ description: null })).doc.description).toBeNull();
    expect(merged(side({ description: "w" }), side({})).doc.description).toBe("w");
  });

  it("ambos cambiaron a valores distintos → choque manual con los campos", () => {
    expect(mergeVault(side({ name: "W", description: "dw" }), side({ name: "L", description: "dl" }), A, NOW))
      .toEqual({ kind: "manual", reason: "clash", fields: ["name", "description"] });
  });

  it("un campo en choque no impide reportar sólo ese campo", () => {
    expect(mergeVault(side({ name: "W", tags: ["z"] }), side({ name: "L" }), A, NOW))
      .toEqual({ kind: "manual", reason: "clash", fields: ["name"] });
  });
});

describe("paso 3: tags (RF-012, nunca hay choque)", () => {
  it("altas de ambos lados, en el orden de W y después las de L", () => {
    expect(merged(side({ tags: ["a", "b", "w1"] }), side({ tags: ["l1", "a", "b"] })).doc.tags).toEqual(["a", "b", "w1", "l1"]);
  });

  it("una etiqueta quitada en un lado no reaparece", () => {
    expect(merged(side({ tags: ["a"] }), side({ tags: ["a", "b", "c"] })).doc.tags).toEqual(["a", "c"]);
    expect(merged(side({ tags: ["a", "b", "c"] }), side({ tags: ["b"] })).doc.tags).toEqual(["b", "c"]);
  });

  it("los dos quitan cosas distintas", () => {
    expect(merged(side({ tags: ["a"] }), side({ tags: ["b"] })).doc.tags).toEqual([]);
  });
});

describe("paso 4: deleted_at (RF-014)", () => {
  it("borrada en un lado y editada en el otro → gana la edición (restaurada)", () => {
    const result = merged(side({ deleted_at: DELETED }), side({ tags: ["a", "b", "c"] }));
    expect(result.doc).toMatchObject({ deleted_at: null, tags: ["a", "b", "c"] });
    expect(merged(side({ description: "editada" }), side({ deleted_at: DELETED })).doc.deleted_at).toBeNull();
  });

  it("borrada en un lado y el otro sin cambios → borrada", () => {
    expect(merged(side({ deleted_at: DELETED }), side({})).doc.deleted_at).toBe(DELETED);
    expect(merged(side({}), side({ deleted_at: DELETED })).doc.deleted_at).toBe(DELETED);
  });

  it("borrada en ambos lados → la de W", () => {
    expect(merged(side({ deleted_at: DELETED }), side({ deleted_at: "2026-10-04T00:00:00.000000Z" })).doc.deleted_at).toBe(DELETED);
  });

  it("restaurada en un lado (ancestro en la papelera) → activa", () => {
    const trashed = { ...A, deleted_at: DELETED };
    const w = { ...trashed, updated_at: "2026-10-05T00:00:00.000000Z", deleted_at: null };
    const l = { ...trashed, updated_at: "2026-10-05T00:00:00.000000Z", description: "en la papelera" };
    expect(merged(w, l, trashed).doc).toMatchObject({ deleted_at: null, description: "en la papelera" });
  });

  it("reordenar etiquetas no cuenta como edición frente al borrado", () => {
    expect(merged(side({ deleted_at: DELETED }), side({ tags: ["b", "a"] })).doc.deleted_at).toBe(DELETED);
  });
});

describe("paso 5: campos fijos y updated_at", () => {
  it("created_at y owner_id de W; updated_at = ahora", () => {
    expect(merged(side({ name: "W" }), side({ tags: ["a", "b", "c"] })).doc).toEqual({
      name: "W", description: "base", tags: ["a", "b", "c"], owner_id: "owner-1",
      created_at: A.created_at, updated_at: NOW, deleted_at: null,
    });
  });
});

describe("paso 6: el resultado pasa por vaultRules (RF-015)", () => {
  it("más de 20 etiquetas tras combinar → conflicto manual con el motivo", () => {
    const many = (prefix: string) => Array.from({ length: 11 }, (_, i) => `${prefix}${i}`);
    expect(mergeVault(side({ tags: ["a", "b", ...many("w")] }), side({ tags: ["a", "b", ...many("l")] }), A, NOW))
      .toEqual({ kind: "manual", reason: "invalid", fields: ["tags"] });
  });
});

describe("paso 7: escritura y convergencia", () => {
  it("una combinación normal reescribe el resultado como hija de W (tombstoneOnly: false)", () => {
    expect(merged(side({ name: "W" }), side({ tags: ["a", "b", "c"] })).tombstoneOnly).toBe(false);
  });

  it("W y L sólo difieren en updated_at → sólo la lápida, también sin ancestro", () => {
    const w = side({ name: "X" }, "2026-10-02T00:00:00.000000Z");
    const l = side({ name: "X" }, "2026-10-02T00:00:01.000000Z");
    expect(mergeVault(w, l, A, NOW)).toEqual({ kind: "merged", doc: w, tombstoneOnly: true });
    expect(mergeVault(w, l, null, NOW)).toEqual({ kind: "merged", doc: w, tombstoneOnly: true });
  });

  it("dos dispositivos que resuelven el mismo conflicto convergen en la pasada siguiente", () => {
    const w = side({ name: "W" });
    const l = side({ tags: ["a", "b", "c"] });
    // Ambos eligen la misma ganadora W (determinista) y calculan a horas distintas.
    const first = mergeVault(w, l, A, "2026-10-13T12:00:00.000000Z");
    const second = mergeVault(w, l, A, "2026-10-13T12:00:05.000000Z");
    if (first.kind !== "merged" || second.kind !== "merged") throw new Error("se esperaba combinación");
    // Sus resultados son hijas de W en conflicto entre sí; su ancestro común es W.
    const next = mergeVault(first.doc, second.doc, w, NOW);
    expect(next).toEqual({ kind: "merged", doc: first.doc, tombstoneOnly: true });
  });

  it("es puro: no modifica sus entradas", () => {
    const w = side({ tags: ["a", "w"] });
    const l = side({ tags: ["b"] });
    const snapshot = JSON.stringify([w, l, A]);
    mergeVault(w, l, A, NOW);
    expect(JSON.stringify([w, l, A])).toBe(snapshot);
  });
});
