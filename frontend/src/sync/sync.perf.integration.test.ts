// Latencia de propagación entre réplicas (SPEC-0005 RNF-001; marca `perf`): sólo con
// `npm run test:sync:perf`, para no volver inestable la corrida normal.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser, Device, eventually } from "../test-utils/device";

/** Ediciones medidas y umbral del p95 (RNF-001). */
const EDITS = 20;
const P95_MS = 5_000;

/** Percentil `p` (0–1) por el método del rango más cercano. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

describe("rendimiento (integración)", () => {
  let laptop: Device;
  let phone: Device;

  beforeEach(async () => {
    const user = await createUser();
    laptop = new Device(user);
    phone = new Device(user);
    for (const device of [laptop, phone]) {
      await device.signIn();
      await device.open();
      await device.synced();
    }
  });

  afterEach(async () => {
    await laptop.destroy();
    await phone.destroy();
  });

  it(`el p95 de ${EDITS} ediciones hasta la otra réplica es ≤ ${P95_MS / 1000} s`, async () => {
    let vault = await laptop.sync.vaults.create({ name: "Medida", description: "0", tags: [] });
    await eventually(() => expect(phone.sync.vaults.get(vault.id)).resolves.toMatchObject({ description: "0" }));

    const latencies: number[] = [];
    for (let i = 1; i <= EDITS; i += 1) {
      const started = performance.now();
      vault = await laptop.sync.vaults.update(vault.id, { description: String(i) }, vault.rev);
      await eventually(() => expect(phone.sync.vaults.get(vault.id)).resolves.toMatchObject({ description: String(i) }), 30_000);
      latencies.push(performance.now() - started);
    }

    const p95 = percentile(latencies, 0.95);
    console.info(`RNF-001: p95 ${Math.round(p95)} ms (máx ${Math.round(Math.max(...latencies))} ms)`);
    expect(p95).toBeLessThanOrEqual(P95_MS);
  });
});
