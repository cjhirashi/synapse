// Trabajo sin conexión con dos réplicas reales (SPEC-0005 RF-009, RF-010, RF-011, RNF-002).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser, Device, eventually } from "../test-utils/device";

describe("sin conexión (integración)", () => {
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

  it("crear, editar, borrar y restaurar sin red queda pendiente y llega a la otra réplica al volver", async () => {
    // Una bóveda que ya existe en ambas, para poder editarla y borrarla sin red.
    const shared = await laptop.sync.vaults.create({ name: "Compartida", description: null, tags: [] });
    const restored = await laptop.sync.vaults.create({ name: "Papelera", description: null, tags: [] });
    await laptop.synced();
    await eventually(async () => expect((await phone.sync.vaults.list()).map((v) => v.name).sort()).toEqual(["Compartida", "Papelera"]));

    laptop.setNetwork("offline");
    await laptop.waitForStatus((status) => status.state === "offline");

    const created = await laptop.sync.vaults.create({ name: "Nueva", description: "sin red", tags: ["viaje"] });
    const edited = await laptop.sync.vaults.update(shared.id, { name: "Editada" }, shared.rev);
    const trashed = await laptop.sync.vaults.softDelete(restored.id, restored.rev);
    await laptop.sync.vaults.softDelete(edited.id, edited.rev).then((gone) => laptop.sync.vaults.restore(gone.id, gone.rev));

    // Sin confirmar: la réplica lo muestra como propio y el estado lo marca pendiente (RF-009).
    await laptop.waitForStatus((status) => status.state === "offline" && status.pending);
    expect((await laptop.sync.vaults.list()).map((v) => v.name).sort()).toEqual(["Editada", "Nueva"]);
    expect((await laptop.sync.vaults.list({ deleted: true })).map((v) => v.id)).toEqual([trashed.id]);
    // La otra réplica todavía no sabe nada.
    expect((await phone.sync.vaults.list()).map((v) => v.name).sort()).toEqual(["Compartida", "Papelera"]);

    laptop.setNetwork("online");
    await laptop.synced();

    await eventually(async () => {
      expect((await phone.sync.vaults.list()).map((v) => v.name).sort()).toEqual(["Editada", "Nueva"]);
      expect((await phone.sync.vaults.list({ deleted: true })).map((v) => v.id)).toEqual([trashed.id]);
    });
    const arrived = await phone.sync.vaults.get(created.id);
    expect(arrived).toMatchObject({ description: "sin red", tags: ["viaje"], deleted_at: null });
    await phone.synced();
  });

  it("los cambios hechos sin red en las dos réplicas se cruzan al volver la conexión", async () => {
    laptop.setNetwork("offline");
    phone.setNetwork("offline");
    await laptop.sync.vaults.create({ name: "Del portátil", description: null, tags: [] });
    await phone.sync.vaults.create({ name: "Del móvil", description: null, tags: [] });

    laptop.setNetwork("online");
    phone.setNetwork("online");

    for (const device of [laptop, phone]) {
      await eventually(async () =>
        expect((await device.sync.vaults.list()).map((v) => v.name).sort()).toEqual(["Del móvil", "Del portátil"]),
      );
    }
    await laptop.synced();
    await phone.synced();
  });
});
