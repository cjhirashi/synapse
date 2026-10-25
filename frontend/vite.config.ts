/// <reference types="vitest" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

// En el contenedor de desarrollo (docker-compose.dev.yml) el backend no está en localhost:
// lo nombra BACKEND_URL. Fuera de Docker vale el valor por defecto.
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

// RNF-001/RNF-003 (SPEC-0010 §10.5): el Worker de parseo corre `micromark`, que decodifica entidades
// con nombre vía `decode-named-character-reference`. Su build "browser" (`index.dom.js`) usa
// `document.createElement` en el nivel de módulo y REVIENTA al cargar en un Worker (sin DOM). Vite
// resuelve el Worker con condiciones de navegador, así que forzamos SÓLO en el bundle del Worker el
// build node (`index.js`, basado en el mapa `character-entities`): mismo resultado de decodificación,
// sin tocar el DOM. El hilo principal (editor) conserva el build "browser", pequeño, para no engordar
// su chunk. Sin esto, `cache.request` nunca resuelve y `synapse:precompute-idle` jamás se emite.
const DNCR_NODE_BUILD = fileURLToPath(new URL("./node_modules/decode-named-character-reference/index.js", import.meta.url));

export default defineConfig({
  plugins: [react()],
  // `dist/.vite/manifest.json` lo lee `scripts/check-bundle.mjs` (presupuesto de bundle, SPEC-0010 RNF-002).
  build: { manifest: true },
  worker: {
    format: "es",
    // Sólo el bundle del Worker usa el build node de `decode-named-character-reference` (sin DOM).
    plugins: () => [
      {
        name: "synapse:dncr-node-in-worker",
        enforce: "pre",
        resolveId(id: string) {
          return id === "decode-named-character-reference" ? DNCR_NODE_BUILD : null;
        },
      },
    ],
  },
  server: {
    proxy: {
      "/auth": BACKEND,
      "/admin": BACKEND,
      // `/vaults` es a la vez ruta de la API y de la SPA (SPEC-0003): una navegación del
      // navegador (pide HTML) recibe la app; las llamadas `fetch` van al backend.
      "/vaults": {
        target: BACKEND,
        bypass: (req) => (req.headers.accept?.includes("text/html") ? "/index.html" : undefined),
      },
      // Canal de sincronización (SPEC-0005): sólo API, sin pantallas propias, así que no
      // necesita `bypass`. En producción lo lleva el Caddy externo (ver backend/README.md).
      "/sync": BACKEND,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test-setup.ts",
    // Presupuesto por prueba y por gancho con margen para la carga (F-4): el de 5 s por omisión se
    // agota con varias suites a la vez aunque cada paso esté dentro de su plazo de espera (4 s,
    // `test-utils/waits.ts`). Una prueba que de verdad se cuelga sigue fallando, sólo que más tarde.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // La sincronización real necesita backend y CouchDB: va aparte (`npm run test:sync`).
    // RNF-001 de 0008 (`*.perf.test.tsx`, mide tiempos) tampoco corre en `npm test`: sólo con
    // `NOTES_PERF=1` (`npm run test:perf`), para no volver inestable la suite normal.
    // `e2e/` son pruebas de Playwright en navegador real (`npm run test:visual`), no de Vitest.
    exclude: [
      ...configDefaults.exclude,
      "e2e/**",
      "src/**/*.integration.test.ts",
      ...(process.env.NOTES_PERF === "1" ? [] : ["src/**/*.perf.test.tsx"]),
    ],
    // `npm run test:cov`: mismo umbral que el backend (`backend/.coveragerc`, 80 %).
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test-setup.ts", "src/test-utils/**"],
      reporter: ["text", "html"],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});
