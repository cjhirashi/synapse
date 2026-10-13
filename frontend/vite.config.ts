/// <reference types="vitest" />
import { defineConfig } from "vite";
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
    },
  },
  test: { environment: "jsdom", globals: true, setupFiles: "./src/test-setup.ts" },
});
