// Aislamiento entre usuarios con réplicas reales (SPEC-0005 RF-001, RNF-003).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser, Device, eventually } from "../test-utils/device";
import { ID_PREFIX, utcNow } from "./vaultStore";

describe("aislamiento (integración)", () => {
  let ana: Device;
  let beto: Device;

  beforeEach(async () => {
    ana = new Device(await createUser());
    beto = new Device(await createUser());
    for (const device of [ana, beto]) {
      await device.signIn();
      await device.open();
      await device.synced();
    }
  });

  afterEach(async () => {
    await ana.destroy();
    await beto.destroy();
  });

  it("cada usuario recibe sólo sus bóvedas, aunque los nombres coincidan", async () => {
    const anas = await ana.sync.vaults.create({ name: "Común", description: "de Ana", tags: [] });
    await beto.sync.vaults.create({ name: "Común", description: "de Beto", tags: [] });
    await ana.synced();
    await beto.synced();

    // Un segundo dispositivo de Beto, vacío, recibe todo lo suyo y nada de Ana.
    const betoPhone = new Device(beto.user);
    await betoPhone.signIn();
    await betoPhone.open();
    try {
      await betoPhone.synced();
      await eventually(async () =>
        expect((await betoPhone.sync.vaults.list()).map((v) => v.description)).toEqual(["de Beto"]),
      );
      const ids = (await betoPhone.sync.db.allDocs()).rows.map((row) => row.id);
      expect(ids).not.toContain(`${ID_PREFIX}${anas.id}`);
      // Pedir el documento de Ana por el canal de Beto no lo encuentra: la base sale del token.
      await expect(beto.sync.remote.get(`${ID_PREFIX}${anas.id}`)).rejects.toMatchObject({ status: 404 });
    } finally {
      await betoPhone.destroy();
    }
  });

  it("nadie puede subir datos a nombre de otro ni llegar a su base", async () => {
    const anas = await ana.sync.vaults.create({ name: "Privada", description: null, tags: [] });
    await ana.synced();

    // Beto escribe en su réplica una bóveda que dice ser de Ana: el servidor la rechaza.
    const now = utcNow();
    const forged = `${ID_PREFIX}${crypto.randomUUID()}`;
    await beto.sync.db.put({
      _id: forged,
      type: "vault",
      name: "Suplantada",
      description: null,
      tags: [],
      owner_id: ana.user.id,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    await eventually(() =>
      expect(beto.sync.rejections.list()).toEqual([expect.objectContaining({ id: forged, reason: "owner-mismatch" })]),
    );

    // Ni la base de Ana por su nombre real a través del canal.
    const direct = await beto.request(`/sync/synapse_user_${ana.user.id}/${ID_PREFIX}${anas.id}`);
    expect(direct.ok).toBe(false);

    // La API de Ana sigue igual.
    const page = (await (await ana.api("/vaults")).json()) as { items: { name: string }[] };
    expect(page.items.map((item) => item.name)).toEqual(["Privada"]);
  });
});
