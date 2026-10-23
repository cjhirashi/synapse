/// <reference types="vitest" />
// Sincronización real (SPEC-0005 RNF-002, RNF-001): réplicas PouchDB reales contra el backend
// real (uvicorn) y CouchDB de test. Lo ejecuta `scripts/sync-integration.sh`, que levanta el
// backend y pasa su dirección por el entorno; fuera de `npm test`.
import { defineConfig } from "vitest/config";

const backendUrl = process.env.SYNC_BACKEND_URL;
const adminEmail = process.env.SYNC_ADMIN_EMAIL;
if (!backendUrl || !adminEmail || !process.env.SYNC_ADMIN_PASSWORD) {
  throw new Error("Falta SYNC_BACKEND_URL/SYNC_ADMIN_*: ejecuta `npm run test:sync` (scripts/sync-integration.sh).");
}

// RNF-001 (marca `perf`): sólo con `npm run test:sync:perf`, para no volver inestable la corrida normal.
const perf = process.env.SYNC_PERF === "1";

export default defineConfig({
  test: {
    environment: "node",
    include: perf ? ["src/sync/*.perf.integration.test.ts"] : ["src/{sync,notes}/*.integration.test.ts"],
    exclude: perf ? [] : ["src/sync/*.perf.integration.test.ts"],
    setupFiles: "./src/test-utils/integration-setup.ts",
    // Cambia la contraseña inicial del admin una vez y pasa la nueva (`adminPassword`).
    globalSetup: "./src/test-utils/integration-global.ts",
    // Un solo backend y un solo CouchDB: los archivos corren de uno en uno.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    provide: { backendUrl, adminEmail },
    // PouchDB anuncia en consola cada checkpoint remoto que aún no existe (un 404 esperado).
    onConsoleLog: (log) => !log.includes("The above 404 is totally normal"),
  },
});
