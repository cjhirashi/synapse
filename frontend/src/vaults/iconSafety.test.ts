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

/** Fuente sin comentarios (los de bloque y los de línea): los textos explicativos no cuentan como uso. */
const code = (file: string) => read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test.each(CONSUMERS)("%s no inyecta marcado ni usa icon como URL o atributo", (file) => {
  const source = code(file);
  expect(source).not.toMatch(/dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|outerHTML/);
  // Ni `icon` ni lo derivado de él (glyph, color) entran en un atributo de enlace o recurso (`to` de
  // `<Link>`/`<NavLink>` acaba en `href`) ni en un `style`; el valor se busca hasta el fin de línea para
  // cubrir objetos anidados (`style={{ backgroundImage: vault.icon }}`).
  expect(source).not.toMatch(/\b(href|src|srcSet|action|formAction|xlinkHref|to|style)=\{[^\n]*\b(icon|glyph|color)\b/);
  expect(source).not.toMatch(/url\(/);
});

// El rastreo anterior no ve una indirección (`const t = vault.icon; to={t}`): por eso, en los dos
// consumidores que sólo lo muestran, `icon` sólo puede pasar a `VaultChip` o a `parseIcon`.
test.each(["../notes/VaultRail.tsx", "../vaults/VaultListPage.tsx"])("%s sólo pasa icon a VaultChip o parseIcon", (file) => {
  const rest = code(file)
    .replace(/<VaultChip [^>]*\bicon=\{vault\.icon\}/g, "<VaultChip")
    .replace(/parseIcon\(vault\.icon\)/g, "parseIcon()")
    .replace(/^import .*$/gm, "")
    .replace(/"[^"\n]*"/g, '""'); // las clases (`vault-rail-icon`) no son usos del valor
  expect(rest, "otro uso de icon").not.toMatch(/\bicon\b/);
});

test("el `style` de los consumidores: VaultChip (--chip-color), muestras del selector (--swatch) y la posición del tooltip del riel; ningún otro", () => {
  for (const file of CONSUMERS) {
    const styles = [...code(file).matchAll(/\bstyle=\{/g)].length;
    // VaultRail: la posición numérica del tooltip (`top`/`left`), sin relación con `icon`.
    const allowed = ["VaultChip.tsx", "IconPicker.tsx", "VaultRail.tsx"].some((name) => file.endsWith(name)) ? 1 : 0;
    expect(styles, file).toBe(allowed);
  }
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
