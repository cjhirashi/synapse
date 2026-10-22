// Reglas espejo (SPEC-0008 RF-005, RF-013, RF-016; PLAN-0008 §5): la misma batería que
// `backend/tests/test_note_rules.py` fija contra `core/note_rules.py`.
import cases from "../../../backend/tests/fixtures/note_rules_cases.json";
import { checkContent, checkFrontmatter, checkPath, normalizePath, parseNoteId, pathKey } from "./noteRules";

interface Built {
  key?: string;
  repeat: string;
  times: number;
  suffix: string;
}
interface Case {
  input: unknown;
  prefix?: string;
  build?: Built;
  code?: string | null;
  normalized?: string;
  valid?: boolean;
}

/** Valor del caso: `prefix + repeat*times + suffix` si trae `build`, si no `input`. */
function built(c: Case): string {
  return (c.prefix ?? "") + (c.build as Built).repeat.repeat((c.build as Built).times) + (c.build as Built).suffix;
}
const value = (c: Case): unknown => (c.build ? built(c) : c.input);
/** En frontmatter el texto construido es el valor de una clave. */
const frontmatter = (c: Case): unknown => (c.build ? { [c.build.key as string]: built(c) } : c.input);
const label = (c: Case): string => JSON.stringify(value(c)).slice(0, 40);

describe("RF-005: checkPath da el mismo veredicto que el servidor", () => {
  it.each((cases.path as Case[]).map((c) => [label(c), c] as const))("%s", (_label, c) => {
    expect(checkPath(value(c))).toBe(c.code);
  });
});

describe("RF-005: normalizePath da la misma salida que el servidor", () => {
  const strings = (cases.path as Case[]).filter((c) => typeof value(c) === "string");
  it.each(strings.map((c) => [label(c), c] as const))("%s", (_label, c) => {
    expect(normalizePath(value(c) as string)).toBe(c.normalized);
  });

  it("una ruta normalizada es un punto fijo", () => {
    for (const c of strings) expect(normalizePath(c.normalized as string)).toBe(c.normalized);
  });
});

describe("RF-013: pathKey coincide con NFKC + casefold del servidor", () => {
  it.each(cases.path_key.map((c) => [c.path.slice(0, 20), c] as const))("%s", (_label, c) => {
    expect(pathKey(c.path)).toBe(c.key);
  });

  it("une rutas que una persona lee como iguales", () => {
    expect(pathKey("Straße.md")).toBe(pathKey("STRASSE.md"));
    expect(pathKey("Ａｂ/Ｃ.md")).toBe(pathKey("ab/c.md"));
  });
});

describe("RF-016: checkContent respeta el tope de 2 MiB en bytes UTF-8", () => {
  it.each((cases.content as Case[]).map((c) => [label(c), c] as const))("%s", (_label, c) => {
    expect(checkContent(value(c))).toBe(c.valid ? null : "validation-error:content");
  });
});

describe("RF-005: checkFrontmatter respeta el tope de 64 KiB serializado", () => {
  it.each((cases.frontmatter as Case[]).map((c) => [JSON.stringify(frontmatter(c)).slice(0, 40), c] as const))(
    "%s",
    (_label, c) => {
      expect(checkFrontmatter(frontmatter(c))).toBe(c.valid ? null : "validation-error:frontmatter");
    },
  );
});

// N-4: un solo lugar entiende `note:{vault_id}:{note_uuid}`.
describe("parseNoteId (RF-004)", () => {
  const V = "11111111-1111-4111-8111-111111111111";
  const N = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("separa la bóveda y la nota de un id canónico", () => {
    expect(parseNoteId(`note:${V}:${N}`)).toEqual({ vaultId: V, noteUuid: N });
  });

  it.each([
    ["un solo uuid", `note:${V}`],
    ["prefijo de bóveda", `vault:${V}`],
    ["mayúsculas", `note:${V.toUpperCase()}:${N}`],
    ["resto sobrante", `note:${V}:${N}:x`],
    ["vacío", ""],
  ])("rechaza %s", (_name, id) => {
    expect(parseNoteId(id)).toBeNull();
  });
});
