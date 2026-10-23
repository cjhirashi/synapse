// Formulario de bóveda sobre la réplica local (SPEC-0003 RF-019; SPEC-0005 RF-009, RF-011).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import type { SyncContextValue } from "../sync/useSync";
import { StorageFullError } from "../sync/vaultStore";
import { seedStore, syncValue, WithSync } from "../test-utils/sync";
import VaultForm from "./VaultForm";

afterEach(() => vi.restoreAllMocks());

function tree(value: SyncContextValue, path: string) {
  return (
    <WithSync value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/vaults" element={<div>lista de bóvedas</div>} />
          <Route path="/vaults/new" element={<VaultForm />} />
          <Route path="/vaults/:id/edit" element={<VaultForm />} />
        </Routes>
      </MemoryRouter>
    </WithSync>
  );
}

function renderAt(value: SyncContextValue, path: string) {
  const { rerender } = render(tree(value, path));
  return { user: userEvent.setup(), rerender: (next: SyncContextValue) => rerender(tree(next, path)) };
}

/** Réplica con la bóveda «Notas» y el formulario de edición abierto sobre ella. */
async function editing(fields: { description?: string | null } = {}) {
  const { value, db } = syncValue();
  const seed = seedStore(db);
  const vault = await seed.create({ name: "Notas", description: "Apuntes", tags: ["work", "ideas"], ...fields });
  return { value, seed, vault, ...renderAt(value, `/vaults/${vault.id}/edit`) };
}

test("RF-019: crear guarda nombre, descripción y tags en la réplica y vuelve a la lista", async () => {
  const { value } = syncValue();
  const { user } = renderAt(value, "/vaults/new");
  expect(screen.getByRole("heading", { name: "Nueva bóveda" })).toBeInTheDocument();
  await user.type(screen.getByLabelText("Nombre"), "Notas");
  await user.type(screen.getByLabelText("Descripción"), "Apuntes");
  await user.type(screen.getByLabelText("Etiquetas"), "work, ideas ,, ");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  expect(await screen.findByText("lista de bóvedas")).toBeInTheDocument();
  expect(await value.vaults.list()).toEqual([
    expect.objectContaining({ name: "Notas", description: "Apuntes", tags: ["work", "ideas"], owner_id: "u1" }),
  ]);
});

test("RF-019: una descripción vacía se guarda como null", async () => {
  const { value } = syncValue();
  const create = vi.spyOn(value.vaults, "create");
  const { user } = renderAt(value, "/vaults/new");
  await user.type(screen.getByLabelText("Nombre"), "Notas");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  expect(create).toHaveBeenCalledWith({ name: "Notas", description: null, tags: [] });
});

test("RF-019: editar carga la bóveda y guarda sólo lo que cambió con su revisión", async () => {
  const { value, vault, user } = await editing();
  const update = vi.spyOn(value.vaults, "update");
  const name = await screen.findByDisplayValue("Notas");
  expect(screen.getByLabelText("Descripción")).toHaveValue("Apuntes");
  expect(screen.getByLabelText("Etiquetas")).toHaveValue("work, ideas");
  await user.clear(name);
  await user.type(name, "Otra");
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(update).toHaveBeenCalledWith(vault.id, { name: "Otra" }, vault.rev);
  expect(await screen.findByText("lista de bóvedas")).toBeInTheDocument();
  expect((await value.vaults.get(vault.id)).name).toBe("Otra");
});

test("RF-019: editar sin cambios no escribe nada y vuelve a la lista", async () => {
  const { value, user } = await editing();
  const update = vi.spyOn(value.vaults, "update");
  await screen.findByDisplayValue("Notas");
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(update).not.toHaveBeenCalled();
  expect(await screen.findByText("lista de bóvedas")).toBeInTheDocument();
});

test("RF-019: una descripción de sólo espacios que no se tocó no se guarda", async () => {
  const { value, vault, user } = await editing({ description: "   " });
  const update = vi.spyOn(value.vaults, "update");
  await user.clear(await screen.findByLabelText("Nombre"));
  await user.type(screen.getByLabelText("Nombre"), "Otro");
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(update).toHaveBeenCalledWith(vault.id, { name: "Otro" }, vault.rev);
});

test.each([
  ["Nombre", "x".repeat(101), "El nombre debe tener entre 1 y 100 caracteres, sin caracteres de control."],
  ["Descripción", "x".repeat(2001), "La descripción admite hasta 2000 caracteres."],
  ["Etiquetas", Array.from({ length: 21 }, (_, i) => `t${i}`).join(", "), "Hasta 20 etiquetas de 1 a 32 caracteres cada una."],
])("RF-019: un valor de «%s» fuera de las reglas se muestra junto a su campo", async (label, text, message) => {
  const { value } = syncValue();
  const { user } = renderAt(value, "/vaults/new");
  if (label !== "Nombre") await user.type(screen.getByLabelText("Nombre"), "Notas");
  await user.click(screen.getByLabelText(label));
  await user.paste(text);
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  const field = await screen.findByLabelText(label);
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(field).toHaveAccessibleDescription(message);
  expect(screen.getByRole("alert")).toHaveTextContent(message); // se anuncia al aparecer
  expect(await value.vaults.list()).toEqual([]);
});

test("RF-019: un nombre que ya usa otra activa se avisa junto al nombre", async () => {
  const { value, db } = syncValue();
  await seedStore(db).create({ name: "Notas", description: null, tags: [] });
  const { user } = renderAt(value, "/vaults/new");
  await user.type(screen.getByLabelText("Nombre"), "notas");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  const name = await screen.findByLabelText("Nombre");
  expect(name).toHaveAccessibleDescription("Ya tienes una bóveda con ese nombre.");
  expect(name).toHaveAttribute("aria-invalid", "true");
});

test("RF-019: corregir un campo quita su error", async () => {
  const { value, db } = syncValue();
  await seedStore(db).create({ name: "Notas", description: null, tags: [] });
  const { user } = renderAt(value, "/vaults/new");
  await user.type(screen.getByLabelText("Nombre"), "Notas");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  const name = await screen.findByLabelText("Nombre");
  await screen.findByText("Ya tienes una bóveda con ese nombre.");
  await user.type(name, "2");
  expect(name).not.toHaveAttribute("aria-invalid");
  expect(screen.queryByText("Ya tienes una bóveda con ese nombre.")).not.toBeInTheDocument();
});

test("RF-009: si la bóveda cambió mientras se editaba avisa y recarga sus datos y su revisión", async () => {
  const { value, seed, vault, user } = await editing();
  const description = await screen.findByDisplayValue("Apuntes");
  // Otra pestaña (o el pull) la renombra mientras el formulario está abierto.
  await seed.update(vault.id, { name: "Cambiada fuera" }, vault.rev);
  await user.clear(description);
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "La bóveda cambió mientras la editabas. Se cargaron sus datos actuales; repite tus cambios.",
  );
  expect(await screen.findByDisplayValue("Cambiada fuera")).toBeInTheDocument();
  // Lo escrito se descarta (guardarlo pisaría el cambio ajeno) y lo siguiente que se guarde
  // va con la revisión recargada.
  expect(screen.getByLabelText("Descripción")).toHaveValue("Apuntes");
  await user.clear(screen.getByLabelText("Descripción"));
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(await screen.findByText("lista de bóvedas")).toBeInTheDocument();
  expect(await value.vaults.get(vault.id)).toMatchObject({ name: "Cambiada fuera", description: null });
});

test("RF-009: un cambio en la réplica (`dataVersion`) no pisa lo que se está escribiendo", async () => {
  const { value, user, rerender } = await editing();
  const name = await screen.findByDisplayValue("Notas");
  await user.type(name, " nuevas");
  rerender({ ...value, dataVersion: 1 });
  expect(screen.getByLabelText("Nombre")).toHaveValue("Notas nuevas");
});

test.each([
  ["no existe", async () => ({ ...syncValue(), id: "00000000-0000-4000-8000-000000000000" })],
  [
    "está en la papelera",
    async () => {
      const { value, db } = syncValue();
      const seed = seedStore(db);
      const vault = await seed.create({ name: "Notas", description: null, tags: [] });
      await seed.softDelete(vault.id, vault.rev);
      return { value, db, id: vault.id };
    },
  ],
])("RF-019: editar una bóveda que %s lo dice sin mostrar el formulario", async (_case, prepare) => {
  const { value, id } = await prepare();
  renderAt(value, `/vaults/${id}/edit`);
  expect(await screen.findByRole("alert")).toHaveTextContent("Esta bóveda no existe o está en la papelera.");
  expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Volver a las bóvedas" })).toBeInTheDocument();
});

test("RF-019: si la mandan a la papelera mientras se edita, lo dice al guardar", async () => {
  const { seed, vault, user } = await editing();
  const name = await screen.findByDisplayValue("Notas");
  await seed.softDelete(vault.id, vault.rev);
  await user.type(name, "2");
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Esta bóveda no existe o está en la papelera.");
});

test("R-11: sin espacio en el dispositivo lo avisa y conserva lo escrito", async () => {
  const { value } = syncValue();
  vi.spyOn(value.vaults, "create").mockRejectedValue(new StorageFullError());
  const { user } = renderAt(value, "/vaults/new");
  await user.type(screen.getByLabelText("Nombre"), "Notas");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No queda espacio en este dispositivo para guardar cambios. Libera espacio e inténtalo de nuevo.",
  );
  expect(screen.getByLabelText("Nombre")).toHaveValue("Notas");
});

test("RF-019: otro error al guardar da un aviso genérico y conserva lo escrito", async () => {
  const { value } = syncValue();
  vi.spyOn(value.vaults, "create").mockRejectedValue(new Error("fallo de IndexedDB"));
  const { user } = renderAt(value, "/vaults/new");
  await user.type(screen.getByLabelText("Nombre"), "Notas");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar la bóveda. Inténtalo de nuevo.");
  expect(screen.getByLabelText("Nombre")).toHaveValue("Notas");
});

test("RF-019: «Cancelar» vuelve a la lista sin guardar", async () => {
  const { value } = syncValue();
  const create = vi.spyOn(value.vaults, "create");
  const { user } = renderAt(value, "/vaults/new");
  await user.click(screen.getByRole("link", { name: "Cancelar" }));
  expect(screen.getByText("lista de bóvedas")).toBeInTheDocument();
  expect(create).not.toHaveBeenCalled();
});

// --- SPEC-0009 RF-011, RF-012: el selector de ícono se guarda en la réplica (sólo si cambió) ---

test("RF-011, RF-012: crear con un ícono y color elegidos lo guarda en la bóveda", async () => {
  const { value } = syncValue();
  const { user } = renderAt(value, "/vaults/new");
  await user.type(screen.getByLabelText("Nombre"), "Notas");
  await user.click(screen.getByRole("radio", { name: "Cohete" }));
  await user.click(screen.getByRole("radio", { name: "Verde" }));
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  expect(await screen.findByText("lista de bóvedas")).toBeInTheDocument();
  expect((await value.vaults.list())[0].icon).toBe("rocket:success");
});

test("RF-012: crear sin tocar el selector no envía icon", async () => {
  const { value } = syncValue();
  const create = vi.spyOn(value.vaults, "create");
  const { user } = renderAt(value, "/vaults/new");
  await user.type(screen.getByLabelText("Nombre"), "Notas");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  expect(create.mock.calls[0][0]).not.toHaveProperty("icon");
});

test("RF-011, RF-012: editar cambia sólo el ícono y lo envía con la revisión", async () => {
  const { value, vault, user } = await editing();
  const update = vi.spyOn(value.vaults, "update");
  await screen.findByDisplayValue("Notas");
  await user.click(screen.getByRole("radio", { name: "Estrella" }));
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(update).toHaveBeenCalledWith(vault.id, { icon: "star" }, vault.rev);
  expect(await screen.findByText("lista de bóvedas")).toBeInTheDocument();
  expect((await value.vaults.get(vault.id)).icon).toBe("star");
});

test("RF-012: editar sin tocar el ícono no lo envía (y sin otros cambios no escribe)", async () => {
  const { value, user } = await editing();
  const update = vi.spyOn(value.vaults, "update");
  await screen.findByDisplayValue("Notas");
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(update).not.toHaveBeenCalled();
});

test("RF-011, RF-012: «Iniciales» + «Automático» quita el ícono que la bóveda ya tenía (icon: null)", async () => {
  const { value, db } = syncValue();
  const vault = await seedStore(db).create({ name: "Notas", description: null, tags: [], icon: "star:success" });
  const update = vi.spyOn(value.vaults, "update");
  const { user } = renderAt(value, `/vaults/${vault.id}/edit`);
  await screen.findByDisplayValue("Notas");
  expect(screen.getByRole("radio", { name: "Estrella" })).toBeChecked();
  await user.click(screen.getByRole("radio", { name: "Iniciales" }));
  await user.click(screen.getByRole("radio", { name: "Automático" }));
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(update).toHaveBeenCalledWith(vault.id, { icon: null }, vault.rev);
});
