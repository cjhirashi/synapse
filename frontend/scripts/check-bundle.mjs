#!/usr/bin/env node
// Presupuesto de bundle de SPEC-0010 (RNF-002; PLAN-0010 §5.6, P-9). Se corre tras `vite build`
// (`npm run test:bundle`) y lee `dist/.vite/manifest.json` (`build.manifest: true`):
//   - entrada ≤ base + 15 KiB gzip y chunk del editor ≤ base + 40 KiB gzip;
//   - chunks propios para Mermaid, svg-pan-zoom, frontmatter (yaml) y cada gramática extra;
//   - ninguno de ellos es importación estática de la entrada ni del editor (sólo `import()`).
// Bases medidas con `npm run build` en 29470e0: entrada 141 660 B, editor 316 428 B (gzip -9).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = resolve(import.meta.dirname, "../dist");
const ENTRY_LIMIT = 141_660 + 15 * 1024; // 157 020
const EDITOR_LIMIT = 316_428 + 40 * 1024; // 357 388

/** Chunks que deben existir aparte (patrón sobre el nombre del archivo emitido o su fuente). */
const SEPARATE = {
  mermaid: /mermaid/i,
  "svg-pan-zoom": /svg-pan-zoom/i,
  frontmatter: /frontmatter/i,
  "gramática python": /python/i,
  "gramática sql": /(^|[/-])sql/i,
  "gramática yaml": /lang-yaml|(^|[/-])yaml-/i,
  "gramática json": /lang-json|(^|[/-])json-/i,
  "gramática shell": /shell/i,
};

const manifest = JSON.parse(readFileSync(resolve(DIST, ".vite/manifest.json"), "utf8"));
const chunks = Object.entries(manifest).map(([src, chunk]) => ({ src, ...chunk }));
const gzipSize = (file) => gzipSync(readFileSync(resolve(DIST, file)), { level: 9 }).length;
const failures = [];

const entry = chunks.find((chunk) => chunk.isEntry);
const editor = chunks.find((chunk) => chunk.src.endsWith("editor/NoteEditor.tsx"));
if (!entry || !editor) {
  console.error("manifest sin la entrada o sin el chunk del editor");
  process.exit(1);
}

for (const [label, chunk, limit] of [
  ["entrada", entry, ENTRY_LIMIT],
  ["editor", editor, EDITOR_LIMIT],
]) {
  const size = gzipSize(chunk.file);
  console.log(`${label}: ${size} B gzip (límite ${limit})`);
  if (size > limit) failures.push(`${label} ${size} B > ${limit} B gzip`);
}

/** Chunks alcanzables por importaciones **estáticas** desde `root` (sin `dynamicImports`). */
function staticClosure(root) {
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key) || !manifest[key]) return;
    seen.add(key);
    for (const next of manifest[key].imports ?? []) visit(next);
  };
  visit(root.src);
  return [...seen].map((key) => manifest[key]);
}

for (const [label, pattern] of Object.entries(SEPARATE)) {
  const matching = chunks.filter((chunk) => pattern.test(chunk.file) || pattern.test(chunk.src) || (chunk.name && pattern.test(chunk.name)));
  if (matching.length === 0) {
    failures.push(`chunk ${label} ausente`);
    continue;
  }
  for (const [rootLabel, root] of [["entrada", entry], ["editor", editor]]) {
    const leaked = staticClosure(root).filter((chunk) => matching.includes(chunk));
    if (leaked.length > 0) failures.push(`${label} es importación estática de la ${rootLabel}: ${leaked.map((c) => c.file).join(", ")}`);
  }
}

if (failures.length > 0) {
  console.error(`test:bundle FALLA:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log("test:bundle OK");
