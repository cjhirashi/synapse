// Rendimiento de abrir una bóveda con 1 000 notas (SPEC-0008 RNF-001; PLAN-0008 §5): sólo con
// `NOTES_PERF=1` (`npm run test:perf`); `vite.config.ts` lo excluye de `npm test` para no volver
// inestable la suite normal. Limitación declarada: jsdom + réplica en memoria no es IndexedDB.
import { render, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";
import { DataMemoryRouter } from "../test-utils/router";
import { memoryDb, seedStore, syncValue, WithSync } from "../test-utils/sync";
import { buildTree } from "./noteTree";
import VaultWorkspacePage from "./VaultWorkspacePage";

/** Volumen y método de medida de RNF-001. */
const NOTES = 1_000;
const OTHER_VAULT_NOTES = 200;
const FOLDERS = 40;
const MOUNTS = 30;
const WARMUP = 3;
const P95_MS = 300;
/** ~4 KiB de contenido por nota: el árbol no debe cargarlo (`list` lo omite). */
const CONTENT = "lorem ipsum dolor sit amet ".repeat(150);

/** Percentil `p` (0–1) por el método del rango más cercano. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

/** Notas de una bóveda: 100 en la raíz y el resto repartidas en `FOLDERS` carpetas de hasta 3 niveles. */
function noteDocs(vaultId: string, count: number) {
  const stamp = "2026-10-12T09:00:00.000Z";
  return Array.from({ length: count }, (_, i) => {
    const folder = i % 10 === 0 ? "" : `carpeta-${i % FOLDERS}/${i % 3 === 0 ? `sub-${i % 7}/` : ""}${i % 5 === 0 ? "hondo/" : ""}`;
    return {
      _id: `note:${vaultId}:${crypto.randomUUID()}`,
      type: "note",
      vault_id: vaultId,
      path: `${folder}nota-${i}.md`,
      frontmatter: {},
      content: CONTENT,
      created_at: stamp,
      updated_at: stamp,
      deleted_at: null,
    };
  });
}

test("RNF-001: abrir una bóveda de 1 000 notas muestra el árbol de primer nivel en p95 < 300 ms", async () => {
  const { value, db } = syncValue({}, memoryDb());
  const store = seedStore(db);
  const vault = await store.create({ name: "Grande", description: null, tags: [] });
  const other = await store.create({ name: "Otra", description: null, tags: [] });
  const mine = noteDocs(vault.id, NOTES);
  await db.bulkDocs([...mine, ...noteDocs(other.id, OTHER_VAULT_NOTES)]);

  // Elementos que debe mostrar el primer nivel: carpetas (plegadas) y notas de la raíz.
  const firstLevel = buildTree(mine).length;
  expect(firstLevel).toBeGreaterThan(FOLDERS);

  const samples: number[] = [];
  for (let mount = 0; mount < MOUNTS; mount += 1) {
    const started = performance.now();
    const { container, unmount } = render(
      <WithSync value={value}>
        <DataMemoryRouter initialEntries={[`/vaults/${vault.id}`]}>
          <Routes>
            <Route path="/vaults/:id" element={<VaultWorkspacePage />} />
          </Routes>
        </DataMemoryRouter>
      </WithSync>,
    );
    // Hasta que el árbol tiene todos sus elementos de primer nivel. `waitFor` revisa en cada
    // mutación del DOM (el intervalo de 1 ms es sólo la red de seguridad), así que no añade
    // latencia apreciable a la medida y maneja el entorno `act` de React.
    await waitFor(
      () => expect(container.querySelectorAll('[role="tree"] > li > [role="treeitem"]')).toHaveLength(firstLevel),
      { timeout: 10_000, interval: 1 },
    );
    const elapsed = performance.now() - started;
    unmount();
    if (mount >= WARMUP) samples.push(elapsed);
  }

  const p95 = percentile(samples, 0.95);
  console.info(
    `RNF-001 (0008): p95 ${p95.toFixed(1)} ms, mediana ${percentile(samples, 0.5).toFixed(1)} ms, máx ${Math.max(...samples).toFixed(1)} ms ` +
      `(${samples.length} montajes, ${NOTES} notas, ${firstLevel} elementos de primer nivel)`,
  );
  expect(p95).toBeLessThan(P95_MS);
}, 120_000);
