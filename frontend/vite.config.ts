/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/auth": "http://localhost:8000", "/admin": "http://localhost:8000" } },
  test: { environment: "jsdom", globals: true, setupFiles: "./src/test-setup.ts" },
});
