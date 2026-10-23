// Notas entre dos réplicas reales (SPEC-0008 RF-003, RF-004, RF-009, RF-010, RF-011, RF-013,
// RF-014, RF-016, RF-017): backend y CouchDB reales, el mismo cableado que usa la app
// (`openSyncResources`). Sólo la red de cada dispositivo es simulada (cortes y reconexión).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser, Device, eventually } from "../test-utils/device";
import type { NoteConflict } from "../sync/conflicts";
import type { Vault } from "../sync/vaultStore";
import { CONTENT_MAX_BYTES } from "./noteRules";
import { NoteValidationError } from "./errors";
import type { Note } from "./noteStore";

/** Conflictos de nota de un dispositivo (`list()` también trae los de bóveda). */
const noteConflicts = (device: Device): NoteConflict[] =>
  device.sync.conflicts.list().filter((item): item is NoteConflict => item.kind === "note");

/** Motivos de rechazo de las notas de un dispositivo, por id. */
const rejectionReasons = (device: Device): Record<string, string> =>
  Object.fromEntries(device.sync.rejections.list().map((item) => [item.id, item.reason]));

describe("notas (integración)", () => {
  let laptop: Device;
  let phone: Device;
  /** Bóveda presente en ambas réplicas y en el servidor antes de cada prueba. */
  let vault: Vault;

  beforeEach(async () => {
    const user = await createUser();
    laptop = new Device(user);
    phone = new Device(user);
    for (const device of [laptop, phone]) {
      await device.signIn();
      await device.open();
    }
    vault = await laptop.sync.vaults.create({ name: "Trabajo", description: null, tags: [] });
    await laptop.synced();
    await eventually(() => expect(phone.sync.vaults.get(vault.id)).resolves.toMatchObject({ rev: vault.rev }));
  });

  afterEach(async () => {
    await laptop.destroy();
    await phone.destroy();
  });

  /** Espera a que `device` tenga la nota con esa revisión. */
  const arrives = (device: Device, note: Note) =>
    eventually(() => expect(device.sync.notes.get(note.id)).resolves.toMatchObject({ rev: note.rev }));

  describe("creación, conflictos y rutas", () => {
    it("RF-003, RF-016: una nota creada sin conexión llega al otro dispositivo al volver la red", async () => {
      laptop.setNetwork("offline");
      const created = await laptop.sync.notes.create(vault.id, "Ideas");
      const saved = await laptop.sync.notes.save(created.id, "# Ideas\n\nuna **idea**", created.rev);
      laptop.setNetwork("online");
      await laptop.synced();

      await arrives(phone, saved);
      expect(await phone.sync.notes.get(saved.id)).toMatchObject({ path: "Ideas.md", content: "# Ideas\n\nuna **idea**" });
    });

    it("RF-009: edición concurrente → conflicto manual en ambos; al resolver, convergen", async () => {
      const base = await laptop.sync.notes.create(vault.id, "Acta");
      await laptop.synced();
      await arrives(phone, base);

      laptop.setNetwork("offline");
      phone.setNetwork("offline");
      await laptop.sync.notes.save(base.id, "versión del portátil", base.rev);
      await phone.sync.notes.save(base.id, "versión del móvil", base.rev);
      for (const device of [laptop, phone]) {
        device.setNetwork("online");
        await device.synced();
      }

      // Las dos réplicas muestran la misma pareja, sin que ninguna versión se elija sola.
      for (const device of [laptop, phone]) {
        await eventually(() => {
          const [conflict, ...rest] = noteConflicts(device);
          expect(rest).toEqual([]);
          expect(conflict).toMatchObject({ id: base.id });
          expect([conflict.winner.doc.content, conflict.loser.doc.content].sort()).toEqual([
            "versión del móvil",
            "versión del portátil",
          ]);
        });
      }

      // El móvil resuelve quedándose con la versión del portátil.
      const [conflict] = noteConflicts(phone);
      const chosen = [conflict.winner, conflict.loser].find((side) => side.doc.content === "versión del portátil")!;
      await phone.sync.conflicts.resolve(conflict.id, conflict.loser.rev, {
        path: chosen.doc.path,
        content: chosen.doc.content,
        frontmatter: chosen.doc.frontmatter,
        deleted_at: null,
      });
      await phone.synced();

      for (const device of [laptop, phone]) {
        await eventually(async () => {
          expect(await device.sync.notes.get(base.id)).toMatchObject({ content: "versión del portátil" });
          expect(noteConflicts(device)).toEqual([]);
        });
      }
    });

    it("RF-013: la misma ruta en dos dispositivos sin conexión → `note-path-taken` en uno", async () => {
      laptop.setNetwork("offline");
      phone.setNetwork("offline");
      const fromLaptop = await laptop.sync.notes.create(vault.id, "Misma");
      const fromPhone = await phone.sync.notes.create(vault.id, "Misma");
      // Vuelve primero el portátil: su nota es la que el servidor acepta.
      laptop.setNetwork("online");
      await laptop.synced();
      phone.setNetwork("online");

      await eventually(() => expect(rejectionReasons(phone)).toEqual({ [fromPhone.id]: "note-path-taken" }));
      expect(rejectionReasons(laptop)).toEqual({});
      // La rechazada no desaparece de la réplica del móvil (nada se pierde), y la aceptada le llega.
      await arrives(phone, fromLaptop);
      expect(await phone.sync.notes.get(fromPhone.id)).toMatchObject({ path: "Misma.md" });
    });
  });

  describe("bóveda inexistente en el servidor", () => {
    it("RF-004, RF-014: bóveda borrada en A y nota editada en B → `vault-not-found`; al restaurarla, el reintento la sube", async () => {
      const note = await laptop.sync.notes.create(vault.id, "Pendiente");
      await laptop.synced();
      await arrives(phone, note);

      phone.setNetwork("offline");
      const trashed = await laptop.sync.vaults.softDelete(vault.id, vault.rev);
      await laptop.synced();
      const edited = await phone.sync.notes.save(note.id, "editada con la bóveda ya borrada", note.rev);
      phone.setNetwork("online");

      await eventually(() => expect(rejectionReasons(phone)).toEqual({ [note.id]: "vault-not-found" }));

      // Al restaurar la bóveda en A, llega al móvil por el pull y el reintento dirigido sube la nota.
      await laptop.sync.vaults.restore(vault.id, trashed.rev);
      await laptop.synced();
      await eventually(() => expect(rejectionReasons(phone)).toEqual({}));
      await phone.synced();
      await eventually(async () =>
        expect(await laptop.sync.notes.get(note.id)).toMatchObject({ content: "editada con la bóveda ya borrada", rev: edited.rev }),
      );
    });

    it("RF-004, RF-014: bóveda + notas + renombrado con el corte de lote entre ambas → todas acaban aceptadas", async () => {
      laptop.setNetwork("offline");
      const fresh = await laptop.sync.vaults.create({ name: "Nueva", description: null, tags: [] });
      // Más notas que un lote (50): el renombrado deja la bóveda como última escritura y el
      // corte del push cae entre sus notas y ella.
      const ids: string[] = [];
      for (let i = 0; i < 55; i += 1) ids.push((await laptop.sync.notes.create(fresh.id, `n${i}`)).id);
      await laptop.sync.vaults.update(fresh.id, { name: "Nueva renombrada" }, fresh.rev);

      const seen = new Set<string>();
      laptop.sync.rejections.subscribe((items) => items.forEach((item) => seen.add(item.reason)));
      laptop.setNetwork("online");

      await eventually(() => expect(rejectionReasons(laptop)).toEqual({}), 40_000);
      await laptop.synced(40_000);
      // El corte ocurrió de verdad: las primeras notas se rechazaron antes de llegar la bóveda.
      expect(seen).toContain("vault-not-found");
      await eventually(async () => expect((await phone.sync.notes.list(fresh.id)).length).toBe(ids.length), 40_000);
    });

    it("RF-014: las notas siguen intactas tras borrar y restaurar la bóveda", async () => {
      const first = await laptop.sync.notes.create(vault.id, "Uno");
      const kept = await laptop.sync.notes.save(first.id, "contenido que no debe perderse", first.rev);
      await laptop.synced();
      await arrives(phone, kept);

      const trashed = await laptop.sync.vaults.softDelete(vault.id, vault.rev);
      await laptop.synced();
      await laptop.sync.vaults.restore(vault.id, trashed.rev);
      await laptop.synced();

      for (const device of [laptop, phone]) {
        await eventually(async () => {
          expect(await device.sync.notes.get(kept.id)).toMatchObject({ content: "contenido que no debe perderse", deleted_at: null });
          expect(await device.sync.vaults.get(vault.id)).toMatchObject({ deleted_at: null });
        });
      }
      expect(rejectionReasons(laptop)).toEqual({});
    });
  });

  describe("tamaño, renombrado y papelera", () => {
    it("RF-010, RF-016: diez notas de 2 MiB suben (reparto de `_bulk_docs`) y bajan al otro dispositivo", async () => {
      const notes: Note[] = [];
      for (let i = 0; i < 10; i += 1) {
        const created = await laptop.sync.notes.create(vault.id, `grande-${i}`);
        // Cada contenido es distinto y ocupa exactamente el máximo.
        notes.push(await laptop.sync.notes.save(created.id, String(i).repeat(CONTENT_MAX_BYTES), created.rev));
      }
      await laptop.synced(60_000);
      expect(rejectionReasons(laptop)).toEqual({});

      for (const [i, note] of notes.entries()) {
        await eventually(async () => {
          const got = await phone.sync.notes.get(note.id);
          expect(got.rev).toBe(note.rev);
          expect(got.content.length).toBe(CONTENT_MAX_BYTES);
          expect(got.content.startsWith(String(i))).toBe(true);
        }, 60_000);
      }
    });

    it("RF-016: una nota de 2 MiB + 1 se rechaza en el cliente y no se pierde el contenido anterior", async () => {
      const created = await laptop.sync.notes.create(vault.id, "Limite");
      const exact = await laptop.sync.notes.save(created.id, "a".repeat(CONTENT_MAX_BYTES), created.rev);
      await expect(laptop.sync.notes.save(created.id, "a".repeat(CONTENT_MAX_BYTES + 1), exact.rev)).rejects.toBeInstanceOf(
        NoteValidationError,
      );

      await laptop.synced(30_000);
      expect(await laptop.sync.notes.get(created.id)).toMatchObject({ rev: exact.rev });
      await eventually(async () => expect((await phone.sync.notes.get(created.id)).content.length).toBe(CONTENT_MAX_BYTES), 30_000);
      expect(laptop.sync.rejections.list()).toEqual([]);
    });

    it("RF-011, RF-017: renombrar, borrar y restaurar se replican", async () => {
      const note = await laptop.sync.notes.create(vault.id, "Viejo");
      await laptop.synced();
      await arrives(phone, note);

      const renamed = await laptop.sync.notes.rename(note.id, "carpeta/Nuevo.md", note.rev);
      await laptop.synced();
      await eventually(async () => expect(await phone.sync.notes.list(vault.id)).toMatchObject([{ path: "carpeta/Nuevo.md" }]));

      const trashed = await laptop.sync.notes.softDelete(note.id, renamed.rev);
      await laptop.synced();
      await eventually(async () => {
        expect(await phone.sync.notes.list(vault.id)).toEqual([]);
        expect(await phone.sync.notes.list(vault.id, { deleted: true })).toMatchObject([{ id: note.id }]);
      });

      await laptop.sync.notes.restore(note.id, trashed.rev);
      await laptop.synced();
      await eventually(async () => expect(await phone.sync.notes.list(vault.id)).toMatchObject([{ path: "carpeta/Nuevo.md", deleted_at: null }]));
    });
  });
});
