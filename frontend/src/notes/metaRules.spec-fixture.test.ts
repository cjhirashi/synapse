/**
 * H-030b: el espejo de las reglas META del servidor debe pasar TODOS los casos de la especificación compartida
 * `backend/tests/fixtures/plantilla_reglas.json` (el servidor la recorre en `test_h030b_rules.py`).
 */
import { describe, expect, it } from "vitest";
import spec from "../../../backend/tests/fixtures/plantilla_reglas.json";
import { validateGeneral } from "../editor/attributeRules";
import {
  appliesTo, checkDefinition, checkFolderMove, checkNoteWrite, checkReservedCase, templateName,
} from "./metaRules";

describe("plantilla_reglas.json (compartido con el servidor)", () => {
  it.each(spec.definition)("definición: $name", (c) => {
    expect(checkDefinition(c.frontmatter)).toBe(c.expected);
  });
  it.each(spec.template_name)("nombre de plantilla: $path", (c) => {
    expect(templateName(c.path)).toBe(c.expected);
  });
  it.each(spec.plantilla_ref)("atributo plantilla: $value", (c) => {
    expect(validateGeneral({ plantilla: c.value })).toBe(c.expected);
  });
  it.each(spec.reserved_case)("mayúsculas de la carpeta reservada: $path", (c) => {
    expect(checkReservedCase(c.path)).toBe(c.expected);
  });
  it.each(spec.folder_move)("mover carpeta: $from -> $to", (c) => {
    expect(checkFolderMove(c.from, c.to)).toBe(c.expected);
  });
  it.each(spec.note_write)("escritura META: $path ($actor)", (c) => {
    expect(
      checkNoteWrite({ path: c.path, prevPath: c.prev_path, deleted: c.deleted, frontmatter: c.frontmatter, actorKind: c.actor as "human" | "agent" | "general" }),
    ).toBe(c.expected);
  });
  it.each(spec.applies_to)("alcance: $alcance en $folder", (c) => {
    expect(appliesTo(c.alcance, c.folder)).toBe(c.expected);
  });
});
