// RF-009: combinación automática de una nota en conflicto (sólo la convergencia; nunca por fecha).
import { mergeNote, type NoteBody } from "./mergeNote";

const base: NoteBody = {
  vault_id: "v1",
  path: "a.md",
  content: "hola",
  frontmatter: { tags: ["x"] },
  created_at: "2026-01-01T00:00:00.000000Z",
  updated_at: "2026-01-02T00:00:00.000000Z",
  deleted_at: null,
};

describe("RF-009: mergeNote", () => {
  it("si sólo difieren en updated_at cierra la perdedora (convergencia)", () => {
    const loser = { ...base, updated_at: "2026-01-09T00:00:00.000000Z" };
    expect(mergeNote(base, loser)).toEqual({ kind: "merged", doc: base, tombstoneOnly: true });
    // Sin importar cuál de las dos sea la más reciente: nunca decide por fecha.
    expect(mergeNote(loser, base)).toEqual({ kind: "merged", doc: loser, tombstoneOnly: true });
  });

  it.each<[string, Partial<NoteBody>]>([
    ["ruta", { path: "b.md" }],
    ["contenido", { content: "otro" }],
    ["frontmatter", { frontmatter: { tags: ["y"] } }],
    ["borrado", { deleted_at: "2026-01-03T00:00:00.000000Z" }],
  ])("una diferencia de %s exige resolución manual", (_label, change) => {
    expect(mergeNote(base, { ...base, ...change })).toEqual({ kind: "manual" });
  });

  // S-2 (PLAN-0008 §17): mismo estado = mismo contenido y ambas activas o ambas en la papelera.
  it("dos borrados en dispositivos distintos (fechas distintas) convergen sin decidir por fecha", () => {
    const w = { ...base, deleted_at: "2026-01-03T00:00:00.000000Z" };
    const l = { ...base, deleted_at: "2026-01-05T00:00:00.000000Z", updated_at: "2026-01-05T00:00:00.000000Z" };
    expect(mergeNote(w, l)).toEqual({ kind: "merged", doc: w, tombstoneOnly: true });
    expect(mergeNote(l, w)).toEqual({ kind: "merged", doc: l, tombstoneOnly: true });
  });

  it("borrada en una rama y activa en la otra sigue siendo manual aunque coincida todo lo demás", () => {
    expect(mergeNote(base, { ...base, deleted_at: "2026-01-03T00:00:00.000000Z" })).toEqual({ kind: "manual" });
  });

  it("aunque la perdedora sea más reciente, un cambio de contenido sigue siendo manual", () => {
    const loser = { ...base, content: "otro", updated_at: "2027-01-01T00:00:00.000000Z" };
    expect(mergeNote(base, loser)).toEqual({ kind: "manual" });
  });

  it("el orden de las claves del frontmatter no cuenta como diferencia", () => {
    const w = { ...base, frontmatter: { a: 1, b: 2 } };
    const l = { ...base, frontmatter: { b: 2, a: 1 }, updated_at: "2026-02-01T00:00:00.000000Z" };
    expect(mergeNote(w, l).kind).toBe("merged");
  });
});
