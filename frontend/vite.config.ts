/// <reference types="vitest" />
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

// En el contenedor de desarrollo (docker-compose.dev.yml) el backend no está en localhost:
// lo nombra BACKEND_URL. Fuera de Docker vale el valor por defecto.
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
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
    // La sincronización real necesita backend y CouchDB: va aparte (`npm run test:sync`).
    exclude: [...configDefaults.exclude, "src/**/*.integration.test.ts"],
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
