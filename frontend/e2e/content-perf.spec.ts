// RNF-001 de SPEC-0010 en Chromium real (PLAN-0010 §5.6): abrir en lectura la nota de ~200 KiB (50 bloques de código
// y 5 Mermaid) debe mostrar su primer y su último párrafo con p95 ≤ 150 ms. Mismo método que 0009: MutationObserver +
// performance.now() desde el clic en el árbol, 30 muestras tras el calentamiento, a 1440 × 900. Esta sonda temprana
// (T-050) mide Milkdown solo, sin resaltado real ni Mermaid todavía: si ya supera 150 ms es un hallazgo (riesgo de §7).
import { CONTENT_NOTES } from "./content-notes";
import { expect, openContentNote, openWorkspace, SIZES, test } from "./fixtures";

const SAMPLES = 30;
const WARMUP = 3;
const P95_MS = Number(process.env.RNF001_P95_MS ?? 150);

/** Percentil `p` (0–1) por el método del rango más cercano. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

test("0010 RNF-001 sonda: abrir en lectura la nota de ~200 KiB en p95 ≤ 150 ms (Chromium real)", async ({ browser, content }) => {
  test.setTimeout(240_000);
  const big = CONTENT_NOTES.find((n) => n.key === "big")!;
  const other = CONTENT_NOTES.find((n) => n.key === "root")!;
  const { context, page } = await openWorkspace(browser, content, { theme: "dark", size: SIZES[0] });
  // Despliega la carpeta de la nota grande una vez (abrirla también la deja seleccionada).
  await openContentNote(page, big);
  await expect(page.getByRole("heading", { level: 2, name: "Sección 50" })).toBeAttached({ timeout: 30_000 });
  const bytes = new TextEncoder().encode(big.content).length;

  const samples: number[] = [];
  for (let n = 0; n < WARMUP + SAMPLES; n += 1) {
    // Otra nota (pequeña) entre muestras: la grande se vuelve a abrir desde cero.
    await openContentNote(page, other);
    await expect(page.getByRole("heading", { level: 1, name: "Nota en la raíz" })).toBeVisible();
    const ms = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const row = [...document.querySelectorAll<HTMLElement>('[role="treeitem"] .note-tree-name')].find((el) => el.title === "Nota grande")!;
          const t0 = performance.now();
          const done = () => {
            const root = document.querySelector(".milkdown-view .ProseMirror");
            const last = [...(root?.querySelectorAll("h2") ?? [])].some((h) => h.textContent === "Sección 50");
            if (root && root.querySelector("p") && last) {
              observer.disconnect();
              resolve(performance.now() - t0);
            }
          };
          const observer = new MutationObserver(done);
          observer.observe(document.body, { childList: true, subtree: true });
          row.closest<HTMLElement>("button")!.click();
        }),
    );
    if (n >= WARMUP) samples.push(ms);
  }

  const median = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const max = Math.max(...samples);
  console.log(
    `RNF-001 (0010 sonda): mediana ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, máx ${max.toFixed(1)} ms ` +
      `(${samples.length} aperturas, nota de ${(bytes / 1024).toFixed(0)} KiB; umbral ${P95_MS} ms)`,
  );
  expect(p95, `RNF-001: p95 ${p95.toFixed(1)} ms > ${P95_MS} ms`).toBeLessThanOrEqual(P95_MS);
  await context.close();
});
