// `icon` de bóveda con réplicas y servidor reales (SPEC-0009 RF-012; PLAN-0009 §5.1): el campo viaja por el
// push y el pull, lo ve la API REST, y un valor inválido forzado en la réplica se rechaza con su motivo.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser, Device, eventually } from "../test-utils/device";

describe("icon de bóveda (integración)", () => {
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

  it("un icon escrito en una réplica lo acepta el push, lo publica la API y llega a la otra réplica", async () => {
    const vault = await laptop.sync.vaults.create({ name: "Con ícono", description: null, tags: [], icon: "star:success" });
    await laptop.synced();

    // El servidor lo aceptó: ningún rechazo y la API REST lo devuelve.
    expect(laptop.sync.rejections.list()).toEqual([]);
    const served = (await (await laptop.api(`/vaults/${vault.id}`)).json()) as { icon: string | null };
    expect(served.icon).toBe("star:success");

    await eventually(async () => expect((await phone.sync.vaults.get(vault.id)).icon).toBe("star:success"));

    // Cambiarlo y borrarlo (null) también viaja.
    const current = await laptop.sync.vaults.get(vault.id);
    const changed = await laptop.sync.vaults.update(vault.id, { icon: "rocket" }, current.rev);
    await laptop.sync.vaults.update(vault.id, { icon: null }, changed.rev);
    await laptop.synced();
    await eventually(async () => expect((await phone.sync.vaults.get(vault.id)).icon).toBeNull());
    expect(((await (await laptop.api(`/vaults/${vault.id}`)).json()) as { icon: string | null }).icon).toBeNull();
  });

  it("un icon inválido forzado en la réplica aparece como rechazo validation-error:icon", async () => {
    const vault = await laptop.sync.vaults.create({ name: "Forzada", description: null, tags: [] });
    await laptop.synced();

    // Salta las reglas del almacén escribiendo el documento a mano, como haría una réplica manipulada.
    const doc = await laptop.sync.db.get(`vault:${vault.id}`);
    const written = await laptop.sync.db.put({ ...doc, icon: "Folder" });

    await eventually(() =>
      expect(laptop.sync.rejections.list()).toEqual([
        { id: `vault:${vault.id}`, rev: written.rev, reason: "validation-error:icon" },
      ]),
    );
  });
});
