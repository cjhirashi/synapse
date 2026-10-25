// RNF-001 de SPEC-0010 en Chromium real (PLAN-0010 §10.8), medición honesta del parseo precalculado.
// Cada muestra es la PRIMERA apertura de esa nota en esa página (nunca una reapertura caliente de la
// misma pestaña), y la ruta que tomó el parser se demuestra con las marcas `synapse:parse:cache-hit` /
// `synapse:parse:cold` / `synapse:parse:inflight` leídas de `performance.getEntriesByType("mark")`.
// Tres pruebas:
//  (a) `0010 RNF-001 precalculada` — criterio de RNF-001: tras esperar `synapse:precompute-idle`, abrir
//      las 3 notas grandes debe dar `cache-hit` con p95 ≤ 150 ms (clic → primer y último párrafo en el
//      DOM) y sin tareas largas > 200 ms.
//  (b) `0010 RNF-001 en frío` — informe (umbral según B-1): abrir la nota en cuanto aparece, antes del
//      precálculo, exigiendo la marca `cold`.
//  (c) `0010 RNF-001 con puntero` — informe: 150 ms de hover previo; registra qué ruta se tomó.
import type { Page } from "@playwright/test";
import { expect, newSession, openWorkspace, SIZES, test, waitForSynced } from "./fixtures";

const P95_MS = Number(process.env.RNF001_P95_MS ?? 150);
const PARSE_MARKS = ["cache-hit", "cold", "inflight"] as const;

/** Percentil `p` (0–1) por el método del rango más cercano. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

/**
 * Abre una nota del árbol por su nombre y mide el tiempo del clic hasta que su cuerpo es legible (hay un
 * `<p>` y su encabezado final `lastHeading` en el DOM del editor). Devuelve también la ruta del parser
 * (marca `synapse:parse:*`) y la tarea larga más larga observada durante la apertura. Limpia las marcas
 * de parseo antes de medir, así la ruta leída es la de ESTA apertura.
 */
async function measureOpen(page: Page, rowName: string, lastHeading: string): Promise<{ ms: number; route: string | null; longest: number }> {
  return page.evaluate(
    ({ rowName, lastHeading, marks }) =>
      new Promise<{ ms: number; route: string | null; longest: number }>((resolve) => {
        for (const m of marks) performance.clearMarks(`synapse:parse:${m}`);
        const nameEl = [...document.querySelectorAll<HTMLElement>('[role="treeitem"] .note-tree-name')].find((el) => el.title === rowName);
        if (!nameEl) throw new Error(`fila del árbol no encontrada: ${rowName}`);
        let longest = 0;
        const longtasks = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longest = Math.max(longest, entry.duration);
        });
        longtasks.observe({ type: "longtask", buffered: false });
        const route = (): string | null => marks.find((m) => performance.getEntriesByName(`synapse:parse:${m}`).length > 0) ?? null;
        const t0 = performance.now();
        const done = (): void => {
          const root = document.querySelector(".milkdown-view .ProseMirror");
          const bodyReady = !!root && !!root.querySelector("p") && [...root.querySelectorAll("h1, h2")].some((h) => h.textContent === lastHeading);
          if (bodyReady) {
            const ms = performance.now() - t0;
            observer.disconnect();
            // Deja respirar a `longtask` (se entrega en microtareas posteriores) antes de cerrar.
            setTimeout(() => {
              longtasks.disconnect();
              resolve({ ms, route: route(), longest });
            }, 0);
          }
        };
        const observer = new MutationObserver(done);
        observer.observe(document.body, { childList: true, subtree: true });
        nameEl.closest<HTMLElement>("button")!.click();
      }),
    { rowName, lastHeading, marks: PARSE_MARKS },
  );
}

test("0010 RNF-001 precalculada: abrir las notas grandes precalculadas en p95 ≤ 150 ms (cache-hit, Chromium real)", async ({ browser, contentPerf }) => {
  test.setTimeout(600_000);
  const CONTEXTS = 10;
  const samples: number[] = [];
  let worstLongtask = 0;
  for (let c = 0; c < CONTEXTS; c += 1) {
    const { context, page } = await openWorkspace(browser, contentPerf, { theme: "dark", size: SIZES[0] });
    // El precálculo vacía su cola (las 3 notas grandes cacheadas) y emite la marca; tope 5 s.
    await page.waitForFunction(() => performance.getEntriesByName("synapse:precompute-idle").length > 0, undefined, { timeout: 5_000 });
    for (const big of contentPerf.big) {
      const { ms, route, longest } = await measureOpen(page, big.name, big.lastHeading);
      expect(route, `ruta de «${big.name}» (debe venir de la caché precalculada)`).toBe("cache-hit");
      samples.push(ms);
      worstLongtask = Math.max(worstLongtask, longest);
    }
    await context.close();
  }

  const median = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const max = Math.max(...samples);
  console.log(
    `RNF-001 (0010 precalculada): mediana ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, máx ${max.toFixed(1)} ms ` +
      `(${samples.length} aperturas cache-hit en ${CONTEXTS} contextos nuevos; tarea larga máx ${worstLongtask.toFixed(1)} ms; umbral ${P95_MS} ms)`,
  );
  expect(p95, `RNF-001: p95 ${p95.toFixed(1)} ms > ${P95_MS} ms`).toBeLessThanOrEqual(P95_MS);
  expect(worstLongtask, `tarea larga ${worstLongtask.toFixed(1)} ms > 200 ms`).toBeLessThanOrEqual(200);
});

test("0010 RNF-001 en frío: abrir una nota grande antes del precálculo (cold, informe según B-1)", async ({ browser, contentPerf }) => {
  test.setTimeout(900_000);
  const CONTEXTS = 30;
  // La de referencia (~181 KiB) y la de 64 KiB (tope de no regresión en frío, §10.7/B-1).
  const targets = [contentPerf.big[0], contentPerf.big[2]];
  for (const target of targets) {
    const samples: number[] = [];
    for (let c = 0; c < CONTEXTS; c += 1) {
      const context = await newSession(browser, contentPerf, { theme: "dark", size: SIZES[0] });
      const page = await context.newPage();
      await page.goto(`/vaults/${contentPerf.vaults[0].id}`);
      // Clic en cuanto la fila aparece (el pull la trae), antes de que el precálculo la toque: ruta en frío.
      await expect(page.getByRole("treeitem", { name: target.name, exact: true })).toBeVisible({ timeout: 90_000 });
      const { ms, route } = await measureOpen(page, target.name, target.lastHeading);
      expect(route, `«${target.name}» debe abrirse en frío (precálculo aún no la tocó)`).toBe("cold");
      samples.push(ms);
      await context.close();
    }
    const median = percentile(samples, 0.5);
    const p95 = percentile(samples, 0.95);
    const max = Math.max(...samples);
    console.log(
      `RNF-001 (0010 en frío · ${target.name}): mediana ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, máx ${max.toFixed(1)} ms ` +
        `(${samples.length} aperturas en frío en contextos nuevos; informe, sin umbral de corte hasta B-1)`,
    );
  }
});

test("0010 RNF-001 con puntero: 150 ms de hover previo antes de abrir (informe de ruta y cifra)", async ({ browser, contentPerf }) => {
  test.setTimeout(300_000);
  const CONTEXTS = 10;
  const target = contentPerf.big[0];
  const samples: number[] = [];
  const routes: Record<string, number> = {};
  for (let c = 0; c < CONTEXTS; c += 1) {
    const context = await newSession(browser, contentPerf, { theme: "dark", size: SIZES[0] });
    const page = await context.newPage();
    await page.goto(`/vaults/${contentPerf.vaults[0].id}`);
    await waitForSynced(page);
    const row = page.getByRole("treeitem", { name: target.name, exact: true });
    await expect(row).toBeVisible({ timeout: 90_000 });
    // El hover dispara `onPrefetch` → el precálculo prioriza esta nota; 150 ms y se abre.
    await row.hover();
    await page.waitForTimeout(150);
    const { ms, route } = await measureOpen(page, target.name, target.lastHeading);
    samples.push(ms);
    routes[route ?? "ninguna"] = (routes[route ?? "ninguna"] ?? 0) + 1;
    await context.close();
  }
  const median = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const max = Math.max(...samples);
  console.log(
    `RNF-001 (0010 con puntero · ${target.name}): mediana ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, máx ${max.toFixed(1)} ms ` +
      `(${samples.length} aperturas tras 150 ms de hover; rutas ${JSON.stringify(routes)}; informe)`,
  );
});
