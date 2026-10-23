// VU-1 (PLAN-0008 §13): los estilos de lista de global.css no se aplican a toda `ul`/`li` de la app
// (árbol de notas, listas del markdown renderizado); sólo a las listas que llevan su clase.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const css = readFileSync(resolve(__dirname, "global.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Selectores de las reglas de nivel superior (sin cuerpos ni bloques @media). */
function selectors(): string[] {
  return [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .flatMap((m) => m[1].split(","))
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("@"));
}

test("RF-019, RF-007: ningún selector de global.css empieza por un `ul`/`ol`/`li` sin clase", () => {
  const unscoped = selectors().filter((s) => /^(ul|ol|li)\b(?![.#[:])/.test(s) || /^(ul|ol|li)\s*$/.test(s) || /^(ul|ol|li)\s*[>\s]/.test(s));
  expect(unscoped).toEqual([]);
});
