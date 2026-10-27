// RNF-003 (SPEC-0010; PLAN-0010 §9): el cliente no inserta marcado con APIs de cadena. Todo el DOM se crea con
// `createElement`/`textContent` o por React, y el único marcado «externo» (el SVG de Mermaid) se analiza como DOM y se
// verifica antes de insertarlo (`mermaid/renderMermaid.ts`). Esta guarda falla si alguien añade una vía de inyección.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..");

/** APIs que convierten texto en marcado ejecutable. */
const FORBIDDEN = /\b(innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|createContextualFragment|srcdoc)\b|document\s*\.\s*write(ln)?\s*\(/;

/** El código sin comentarios (los comentarios pueden *nombrar* estas APIs para explicar por qué no se usan). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** Líneas con una API prohibida (1-based). */
export function findViolations(source: string): number[] {
  return stripComments(source)
    .split("\n")
    .flatMap((line, i) => (FORBIDDEN.test(line) ? [i + 1] : []));
}

/** Archivos de producción de `src/` (sin pruebas ni utilidades de prueba). */
function productionFiles(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "test-utils" ? [] : productionFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && name !== "test-setup.ts" ? [path] : [];
  });
}

describe("securityGuard · RNF-003", () => {
  it("ningún archivo de producción de src/ usa innerHTML, outerHTML, insertAdjacentHTML, dangerouslySetInnerHTML ni equivalentes", () => {
    const found = productionFiles().flatMap((file) => findViolations(readFileSync(file, "utf8")).map((line) => `${relative(SRC, file)}:${line}`));
    expect(found).toEqual([]);
  });

  it("revisa el código de verdad (hay decenas de archivos)", () => {
    expect(productionFiles().length).toBeGreaterThan(40);
  });

  it.each(["el.innerHTML = x;", "el.outerHTML = x;", "el.insertAdjacentHTML('beforeend', x);", "<div dangerouslySetInnerHTML={{ __html: x }} />", "range.createContextualFragment(x)", "frame.srcdoc = x;", "document.write(x)"])(
    "detecta %s",
    (code) => {
      expect(findViolations(code)).toEqual([1]);
    },
  );

  it("ignora comentarios que sólo nombran estas APIs", () => {
    expect(findViolations("// nunca innerHTML\n/* ni outerHTML */\nconst a = 1; // innerHTML\n")).toEqual([]);
  });

  // Mutante (en memoria; no se commitea nada): meter `innerHTML` en una *node view* real debe hacer fallar la guarda.
  it("un mutante con innerHTML en codeBlockView.ts es detectado", () => {
    const original = readFileSync(resolve(__dirname, "codeBlockView.ts"), "utf8");
    expect(findViolations(original)).toEqual([]);
    const mutant = original.replace('this.label.textContent = language || "texto";', 'this.label.innerHTML = language || "texto";');
    expect(mutant).not.toBe(original);
    expect(findViolations(mutant)).toHaveLength(1);
  });
});
