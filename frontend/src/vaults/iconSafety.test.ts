// `Vault.icon` es texto de otro dispositivo (o de un documento forzado en la réplica): ningún consumidor
// puede usarlo como URL, atributo ejecutable, marcado ni estilo (SPEC-0009 RF-001, RF-012; PLAN-0009 §1, Art. 5).
// Vigilancia estática de las fuentes que lo leen; el comportamiento con valores hostiles lo prueba VaultChip.test.tsx.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
const CONSUMERS = [
  "../vaults/VaultChip.tsx",
  "../vaults/IconPicker.tsx",
  "../notes/VaultRail.tsx",
  "../vaults/VaultListPage.tsx",
  "../vaults/VaultForm.tsx",
];

test.each(CONSUMERS)("%s no inyecta marcado ni usa icon como URL o atributo", (file) => {
  const source = read(file);
  expect(source).not.toMatch(/dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|outerHTML/);
  // Ni `icon` ni lo derivado de él (glyph, color) entran en href, src, action ni url().
  expect(source).not.toMatch(/\b(href|src|srcSet|action|formAction|xlinkHref)=\{[^}]*\b(icon|glyph|color)\b/);
  expect(source).not.toMatch(/url\(/);
});

test("VaultChip: el único estilo en línea es la variable --chip-color, tomada de la paleta", () => {
  const source = read("../vaults/VaultChip.tsx");
  const styles = [...source.matchAll(/style=\{([^}]*)\}/g)].map((m) => m[1].trim());
  expect(styles).toEqual(["style"]);
  expect(source).toMatch(/"--chip-color": colorVar\(color \?\? derivedColor\(id\)\)/);
  // `colorVar` sólo se llama con una clave de la paleta (PaletteKey), nunca con texto libre.
  expect(read("../vaults/vaultIcon.ts")).toMatch(/export const colorVar = \(key: PaletteKey\)/);
});

test("el glifo sale de ICON_SET (mapa estático) y se busca por clave propia, nunca por evaluación", () => {
  const source = read("../vaults/vaultIcon.ts");
  expect(source).toMatch(/Object\.prototype\.hasOwnProperty\.call\(map, key\)/);
  expect(source).not.toMatch(/\beval\(|new Function\(|import\(/);
});
