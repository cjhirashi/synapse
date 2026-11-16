/** Regla del `style` de los div y span del cuerpo: recorre `backend/tests/fixtures/estilo_html.json` (el servidor lo recorre en `test_h036_html_style.py`). */
import { describe, expect, test } from "vitest";
import spec from "../../../backend/tests/fixtures/estilo_html.json";
import { cleanStyle } from "./htmlStyle";

describe("estilo_html.json (compartido con el servidor)", () => {
  test.each(spec.casos.map((c) => [c.nombre, c.in, c.out]))("%s", (_name, input, output) => {
    expect(cleanStyle(input)).toBe(output);
  });
});
