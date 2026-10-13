// Rechazos del servidor con réplicas reales (SPEC-0005 RF-005, RF-006, RF-008, RNF-002).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser, Device, eventually } from "../test-utils/device";
import type { Vault } from "./vaultStore";

/** Nombres de las bóvedas activas según la API REST (la verdad del servidor). */
async function serverNames(device: Device): Promise<string[]> {
  const page = (await (await device.api("/vaults")).json()) as { items: { name: string }[] };
  return page.items.map((item) => item.name).sort();
}

describe("rechazos (integración)", () => {
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

  it("dos bóvedas con el mismo nombre creadas sin red: la segunda se rechaza, se conserva y se sincroniza al renombrarla", async () => {
    laptop.setNetwork("offline");
    phone.setNetwork("offline");
    await laptop.sync.vaults.create({ name: "Recetas", description: "del portátil", tags: [] });
    const second = await phone.sync.vaults.create({ name: "Recetas", description: "del móvil", tags: [] });

    laptop.setNetwork("online");
    await laptop.synced();
    phone.setNetwork("online");

    // RF-006: el móvil recibe el motivo y su bóveda sigue en la réplica con su contenido.
    await eventually(() =>
      expect(phone.sync.rejections.list()).toEqual([
        { id: `vault:${second.id}`, rev: second.rev, reason: "vault-name-taken" },
      ]),
    );
    await expect(phone.sync.vaults.get(second.id)).resolves.toMatchObject({ name: "Recetas", description: "del móvil" });
    expect(await serverNames(laptop)).toEqual(["Recetas"]);

    // Al renombrarla se acepta y el rechazo desaparece.
    const current: Vault = await phone.sync.vaults.get(second.id);
    await phone.sync.vaults.update(second.id, { name: "Recetas del móvil" }, current.rev);
    await eventually(() => expect(phone.sync.rejections.list()).toEqual([]));
    await phone.synced();
    expect(await serverNames(phone)).toEqual(["Recetas", "Recetas del móvil"]);
    await eventually(async () =>
      expect((await laptop.sync.vaults.list()).map((v) => v.name).sort()).toEqual(["Recetas", "Recetas del móvil"]),
    );
  });

  it("REST y sincronización con el mismo nombre nunca dejan dos bóvedas activas", async () => {
    // Sincronización primero, luego REST: la API responde 409 (RF-008).
    await laptop.sync.vaults.create({ name: "Proyectos", description: null, tags: [] });
    await laptop.synced();
    expect((await laptop.request("/vaults", "POST", { name: "Proyectos" })).status).toBe(409);

    // REST primero mientras la réplica está sin red: el push posterior se rechaza (RF-005).
    phone.setNetwork("offline");
    const offline = await phone.sync.vaults.create({ name: "Lecturas", description: null, tags: [] });
    await phone.api("/vaults", "POST", { name: "Lecturas" });
    phone.setNetwork("online");

    await eventually(() =>
      expect(phone.sync.rejections.list()).toEqual([
        { id: `vault:${offline.id}`, rev: offline.rev, reason: "vault-name-taken" },
      ]),
    );
    expect(await serverNames(phone)).toEqual(["Lecturas", "Proyectos"]);
  });
});
