// Conflictos entre dos réplicas reales (SPEC-0005 RF-012, RF-013, RF-014, RF-015, RNF-002).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser, Device, eventually } from "../test-utils/device";
import { pushOnce } from "./resources";
import type { VaultConflict } from "./conflicts";
import type { Vault, VaultStore } from "./vaultStore";

/** Conflictos de bóveda de un dispositivo (`list()` también trae los de nota). */
const vaultConflicts = (device: Device): VaultConflict[] =>
  vaultConflicts(device).filter((item): item is VaultConflict => item.kind === "vault");

describe("conflictos (integración)", () => {
  let laptop: Device;
  let phone: Device;
  /** Bóveda presente en ambas réplicas antes de cortar la red. */
  let base: Vault;

  beforeEach(async () => {
    const user = await createUser();
    laptop = new Device(user);
    phone = new Device(user);
    for (const device of [laptop, phone]) {
      await device.signIn();
      await device.open();
    }
    base = await laptop.sync.vaults.create({ name: "Notas", description: "inicial", tags: ["a"] });
    await laptop.synced();
    await eventually(() => expect(phone.sync.vaults.get(base.id)).resolves.toMatchObject({ rev: base.rev }));
  });

  afterEach(async () => {
    await laptop.destroy();
    await phone.destroy();
  });

  /**
   * Cada réplica edita la bóveda base sin red; luego vuelven en el orden dado, cada una
   * esperando a que el servidor confirme la suya.
   */
  async function editApart(
    edits: [(store: VaultStore) => Promise<unknown>, (store: VaultStore) => Promise<unknown>],
    order: [Device, Device] = [laptop, phone],
  ): Promise<void> {
    laptop.setNetwork("offline");
    phone.setNetwork("offline");
    await edits[0](laptop.sync.vaults);
    await edits[1](phone.sync.vaults);
    for (const device of order) {
      device.setNetwork("online");
      await device.synced();
    }
  }

  it("cambios en campos distintos se combinan solos y quedan iguales en ambas réplicas", async () => {
    await editApart([
      (vaults) => vaults.update(base.id, { description: "del portátil" }, base.rev),
      (vaults) => vaults.update(base.id, { tags: ["a", "b"] }, base.rev),
    ]);

    for (const device of [laptop, phone]) {
      await eventually(async () => {
        expect(await device.sync.vaults.get(base.id)).toMatchObject({ name: "Notas", description: "del portátil", tags: ["a", "b"] });
        expect(vaultConflicts(device)).toEqual([]);
      });
    }
    // El servidor acaba con una sola hoja: la combinación (RF-012).
    await eventually(async () => {
      const rest = (await (await laptop.api(`/vaults/${base.id}`)).json()) as Vault;
      expect(rest).toMatchObject({ description: "del portátil", tags: ["a", "b"] });
    });
  });

  it.each([
    ["el portátil", "el móvil"],
    ["el móvil", "el portátil"],
  ])("el mismo campo cambiado en ambas va a la vista manual con las dos versiones (vuelve primero %s)", async (first) => {
    const order: [Device, Device] = first === "el portátil" ? [laptop, phone] : [phone, laptop];
    await editApart(
      [
        (vaults) => vaults.update(base.id, { name: "Notas del portátil" }, base.rev),
        (vaults) => vaults.update(base.id, { name: "Notas del móvil" }, base.rev),
      ],
      order,
    );

    // RF-013: nada se pierde ni se elige solo; las dos réplicas muestran la misma pareja.
    for (const device of [laptop, phone]) {
      await eventually(() => {
        const [conflict, ...rest] = vaultConflicts(device);
        expect(rest).toEqual([]);
        expect(conflict).toMatchObject({ id: `vault:${base.id}`, reason: "clash", fields: ["name"] });
        expect([conflict.winner.doc.name, conflict.loser.doc.name].sort()).toEqual(["Notas del móvil", "Notas del portátil"]);
      });
    }
  });

  it("borrado frente a edición: gana la edición y la bóveda queda restaurada", async () => {
    await editApart([
      (vaults) => vaults.softDelete(base.id, base.rev),
      (vaults) => vaults.update(base.id, { description: "editada sin red" }, base.rev),
    ]);

    for (const device of [laptop, phone]) {
      await eventually(async () =>
        expect(await device.sync.vaults.get(base.id)).toMatchObject({ description: "editada sin red", deleted_at: null }),
      );
    }
  });

  it("resolver a mano con un nombre ocupado lo rechaza el servidor", async () => {
    await laptop.sync.vaults.create({ name: "Ocupado", description: null, tags: [] });
    await laptop.synced();
    await editApart([
      (vaults) => vaults.update(base.id, { name: "Uno" }, base.rev),
      (vaults) => vaults.update(base.id, { name: "Otro" }, base.rev),
    ]);
    const conflict = await eventually(() => {
      const [first] = vaultConflicts(phone);
      expect(first).toBeDefined();
      return first;
    });
    await eventually(async () => expect((await phone.sync.vaults.list()).map((v) => v.name)).toContain("Ocupado"));

    // RF-015: la resolución es una edición más y pasa por las mismas reglas del servidor.
    await phone.sync.conflicts.resolve(conflict.id, conflict.loser.rev, {
      name: "Ocupado",
      description: conflict.winner.doc.description,
      tags: conflict.winner.doc.tags,
      deleted_at: null,
    });
    await eventually(() =>
      expect(phone.sync.rejections.list()).toEqual([expect.objectContaining({ id: conflict.id, reason: "vault-name-taken" })]),
    );
  });

  it("los dos dispositivos resuelven a la vez el mismo conflicto: sin rechazos y «Sincronizar y salir» funciona (VC-2)", async () => {
    await editApart([
      (vaults) => vaults.update(base.id, { name: "Notas del portátil" }, base.rev),
      (vaults) => vaults.update(base.id, { name: "Notas del móvil" }, base.rev),
    ]);
    const pairs = await Promise.all(
      [laptop, phone].map((device) =>
        eventually(() => {
          const [conflict] = vaultConflicts(device);
          expect(conflict).toBeDefined();
          return conflict;
        }),
      ),
    );
    // Ambas réplicas ven la misma pareja: la ganadora es determinista.
    expect(pairs[0].loser.rev).toBe(pairs[1].loser.rev);

    // Sin red, cada uno elige lo mismo (a horas distintas) y luego vuelven los dos.
    laptop.setNetwork("offline");
    phone.setNetwork("offline");
    for (const [device, conflict] of [[laptop, pairs[0]], [phone, pairs[1]]] as const) {
      await device.sync.conflicts.resolve(conflict.id, conflict.loser.rev, {
        name: "Notas de ambos",
        description: conflict.winner.doc.description,
        tags: conflict.winner.doc.tags,
        deleted_at: null,
      });
    }
    laptop.setNetwork("online");
    phone.setNetwork("online");

    // RF-015: las lápidas iguales no se rechazan; las dos hijas de W se funden (paso 7) y
    // ambas réplicas convergen en la misma revisión, sin conflictos ni rechazos.
    await eventually(async () => {
      const [a, b] = await Promise.all([laptop.sync.vaults.get(base.id), phone.sync.vaults.get(base.id)]);
      expect(a).toMatchObject({ name: "Notas de ambos" });
      expect(b.rev).toBe(a.rev);
      for (const device of [laptop, phone]) {
        expect(vaultConflicts(device)).toEqual([]);
        expect(device.sync.rejections.list()).toEqual([]);
      }
    });
    for (const device of [laptop, phone]) {
      await device.synced();
      expect(await pushOnce(device.sync)).toBe(true);
    }
  });
});
