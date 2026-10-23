/// <reference types="node" />
// Verificación visual en navegador real (SPEC-0009 RF-006, RNF-001; PLAN-0009 §5.2).
// Lo ejecuta `scripts/visual.sh` dentro del contenedor oficial de Playwright 1.56.0 contra el
// backend del worktree, que sirve la SPA compilada (SPEC-0007). Fuera de `npm test`: necesita
// backend, CouchDB y contenedor.
import { defineConfig, devices } from "@playwright/test";

import { OUT_DIR } from "./e2e/out-dir";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // Los restos propios de Playwright (trazas) van a una subcarpeta para no mezclarse con las capturas.
  outputDir: `${OUT_DIR}/.results`,
  // Un solo backend y una sola base CouchDB: las pruebas corren de una en una.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:8010",
    // Capturas comparables con las del mockup (misma densidad) y sin transiciones a medias.
    ...devices["Desktop Chrome"],
    deviceScaleFactor: 1,
    // Un selector que no existe falla pronto en lugar de agotar el tiempo de la prueba (90 s).
    actionTimeout: 10_000,
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
