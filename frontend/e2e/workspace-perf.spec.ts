// RNF-001 de SPEC-0009 en Chromium real (PLAN-0009 §5.5, P-8): abrir una bóveda de 1 000 notas por navegación
// SPA muestra el árbol de primer nivel con p95 ≤ 150 ms (el literal de la spec; 0008 medía < 300 ms en jsdom).
// Mismo método que T-126 de 0008: MutationObserver + performance.now() desde el clic hasta que el árbol está en el
// DOM, 30 muestras tras el calentamiento, a 1440 × 900. El umbral se puede bajar con RNF001_P95_MS (el mutante
// que comprueba que la prueba sabe fallar).
import { createUser, createVault, expect, newSession, seedNotesBulk, test, waitForSynced } from "./fixtures";

const NOTES = 1_000;
const SAMPLES = 30;
const WARMUP = 3;
const P95_MS = Number(process.env.RNF001_P95_MS ?? 150);

/** Percentil `p` (0–1) por el método del rango más cercano. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

test("RNF-001: abrir una bóveda de 1 000 notas muestra el árbol en p95 ≤ 150 ms (Chromium real)", async ({ browser }) => {
  test.setTimeout(240_000);
  const user = await createUser();
  const vaultId = await createVault(user.cookie, "Grande");
  const firstLevel = await seedNotesBulk(user.cookie, vaultId, NOTES);

  const context = await newSession(browser, user, { theme: "dark" });
  const page = await context.newPage();
  await page.goto("/vaults");
  // La réplica trae las 1 000 notas por el pull antes de medir (no se mide la descarga, sino abrir la bóveda).
  await page.goto(`/vaults/${vaultId}`);
  // SPEC-0010 RF-041: el árbol tiene ahora la fila «Raíz» como primer treeitem (+1).
  await expect(page.getByRole("treeitem")).toHaveCount(firstLevel + 1, { timeout: 120_000 });
  await waitForSynced(page);

  const samples: number[] = [];
  for (let n = 0; n < WARMUP + SAMPLES; n += 1) {
    // Vuelta a la lista (navegación SPA) y espera a que el árbol anterior se haya ido.
    await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Bóvedas", exact: true }).click();
    await expect(page.getByRole("tree")).toHaveCount(0);
    const ms = await page.evaluate(
      ({ id, expected }) =>
        new Promise<number>((resolve) => {
          const link = document.querySelector<HTMLAnchorElement>(`a[href="/vaults/${id}"]`)!;
          const t0 = performance.now();
          const done = () => {
            if (document.querySelectorAll('[role="tree"] > li').length >= expected) {
              observer.disconnect();
              resolve(performance.now() - t0);
            }
          };
          const observer = new MutationObserver(done);
          observer.observe(document.body, { childList: true, subtree: true });
          link.click();
        }),
      { id: vaultId, expected: firstLevel },
    );
    if (n >= WARMUP) samples.push(ms);
  }

  const median = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const max = Math.max(...samples);
  console.log(
    `RNF-001 (0009): mediana ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, máx ${max.toFixed(1)} ms ` +
      `(${samples.length} navegaciones, ${NOTES} notas, ${firstLevel} elementos de primer nivel; umbral ${P95_MS} ms)`,
  );
  expect(p95, `RNF-001: p95 ${p95.toFixed(1)} ms > ${P95_MS} ms`).toBeLessThanOrEqual(P95_MS);
  await context.close();
});

// SPEC-0010 T-139 (PLAN-0010 §10.5, §10.8): el precálculo de notas grandes NO debe degradar el RNF-001
// de 0009. Misma bóveda de 1 000 notas pero con 40 de ≥ 32 KiB (las únicas que el programador precalcula);
// se comprueba (1) que abrir la bóveda sigue en p95 ≤ 150 ms y (2) que mientras el programador trabaja (del
// «Sincronizado» hasta `synapse:precompute-idle`) el hilo principal no tiene tareas largas > 50 ms —el
// parseo corre en el Worker y el programador sólo lee el cuerpo y hace `postMessage` por franja idle.
test("RNF-001: el precálculo activo (40 notas grandes entre 1 000) no degrada la apertura (Chromium real)", async ({ browser }) => {
  test.setTimeout(300_000);
  const user = await createUser();
  const vaultId = await createVault(user.cookie, "Grande con notas grandes");
  const firstLevel = await seedNotesBulk(user.cookie, vaultId, NOTES, { bigEvery: 25 }); // 40 notas ≥ 32 KiB

  const context = await newSession(browser, user, { theme: "dark" });
  const page = await context.newPage();
  // Observa las tareas largas desde el primer byte (`buffered` recupera las anteriores a instalarlo).
  await page.addInitScript(() => {
    (window as unknown as { __longtasks: Array<{ start: number; dur: number }> }).__longtasks = [];
    new PerformanceObserver((list) => {
      const bag = (window as unknown as { __longtasks: Array<{ start: number; dur: number }> }).__longtasks;
      for (const entry of list.getEntries()) bag.push({ start: entry.startTime, dur: entry.duration });
    }).observe({ type: "longtask", buffered: true });
  });
  await page.goto("/vaults");
  await page.goto(`/vaults/${vaultId}`);
  await expect(page.getByRole("treeitem")).toHaveCount(firstLevel + 1, { timeout: 120_000 });
  await waitForSynced(page);

  // Ventana del programador: desde que la bóveda está sincronizada (árbol ya pintado) hasta que vacía su
  // cola. Las tareas largas de esa ventana son atribuibles al precálculo, no al render inicial del árbol.
  const windowStart = await page.evaluate(() => performance.now());
  await page.waitForFunction(() => performance.getEntriesByName("synapse:precompute-idle").length > 0, undefined, { timeout: 60_000 });
  const windowEnd = await page.evaluate(() => performance.now());
  const scheduledLongtasks = await page.evaluate(
    ({ from, to }) =>
      (window as unknown as { __longtasks: Array<{ start: number; dur: number }> }).__longtasks
        .filter((t) => t.start >= from && t.start <= to + 50)
        .map((t) => t.dur),
    { from: windowStart, to: windowEnd },
  );
  const worstScheduled = scheduledLongtasks.length ? Math.max(...scheduledLongtasks) : 0;
  console.log(
    `T-139 precálculo activo: ventana ${(windowEnd - windowStart).toFixed(0)} ms, ${scheduledLongtasks.length} tareas largas, ` +
      `máx ${worstScheduled.toFixed(1)} ms (tope 50 ms atribuible al programador)`,
  );
  expect(worstScheduled, `tarea larga del programador ${worstScheduled.toFixed(1)} ms > 50 ms`).toBeLessThanOrEqual(50);

  // (2) La apertura de la bóveda sigue dentro del umbral con el programador activo.
  const samples: number[] = [];
  for (let n = 0; n < WARMUP + SAMPLES; n += 1) {
    await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Bóvedas", exact: true }).click();
    await expect(page.getByRole("tree")).toHaveCount(0);
    const ms = await page.evaluate(
      ({ id, expected }) =>
        new Promise<number>((resolve) => {
          const link = document.querySelector<HTMLAnchorElement>(`a[href="/vaults/${id}"]`)!;
          const t0 = performance.now();
          const done = () => {
            if (document.querySelectorAll('[role="tree"] > li').length >= expected) {
              observer.disconnect();
              resolve(performance.now() - t0);
            }
          };
          const observer = new MutationObserver(done);
          observer.observe(document.body, { childList: true, subtree: true });
          link.click();
        }),
      { id: vaultId, expected: firstLevel },
    );
    if (n >= WARMUP) samples.push(ms);
  }
  const median = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  console.log(
    `RNF-001 (0010 T-139, 40 grandes): mediana ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms ` +
      `(${samples.length} navegaciones, ${NOTES} notas; umbral ${P95_MS} ms)`,
  );
  expect(p95, `RNF-001 con precálculo: p95 ${p95.toFixed(1)} ms > ${P95_MS} ms`).toBeLessThanOrEqual(P95_MS);
  await context.close();
});
