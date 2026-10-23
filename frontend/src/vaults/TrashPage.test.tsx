// Papelera sobre la réplica local (SPEC-0003 RF-028; SPEC-0005 RF-009, RF-011).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import type { SyncContextValue } from "../sync/useSync";
import { StorageFullError } from "../sync/vaultStore";
import { seedStore, syncValue, WithSync } from "../test-utils/sync";
import TrashPage from "./TrashPage";
import { waitForCondition } from "../test-utils/waits";

afterEach(() => vi.restoreAllMocks());

function renderPage(value: SyncContextValue) {
  render(
    <WithSync value={value}>
      <MemoryRouter initialEntries={["/vaults/trash"]}>
        <Routes>
          <Route path="/vaults/trash" element={<TrashPage />} />
        </Routes>
      </MemoryRouter>
    </WithSync>,
  );
  return userEvent.setup();
}

/** Crea una bóveda y la manda a la papelera; devuelve la versión borrada. */
async function trashed(seed: ReturnType<typeof seedStore>, name: string) {
  const vault = await seed.create({ name, description: null, tags: [] });
  return seed.softDelete(vault.id, vault.rev);
}

async function restoreButton(name: string) {
  return within(await screen.findByRole("listitem", { name })).getByRole("button", { name: "Restaurar" });
}

test("RF-028: lista las borradas con su `deleted_at`", async () => {
  const { value, db } = syncValue();
  const vault = await trashed(seedStore(db), "Notas");
  renderPage(value);
  const item = await screen.findByRole("listitem", { name: "Notas" });
  const time = within(item).getByText(/Borrada el/).querySelector("time");
  const deletedAt = vault.deleted_at as string;
  expect(time).toHaveAttribute("dateTime", deletedAt);
  // Fecha legible en español (p. ej. «12 oct 2026, 11:00»), no el texto ISO.
  const visible = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(deletedAt));
  expect(time).toHaveTextContent(visible);
  expect(time).toHaveTextContent(/2026/);
  expect(time).not.toHaveTextContent(deletedAt);
});

test("RF-028: con la papelera vacía lo dice (las activas no aparecen)", async () => {
  const { value, db } = syncValue();
  await seedStore(db).create({ name: "Activa", description: null, tags: [] });
  renderPage(value);
  expect(await screen.findByText("La papelera está vacía.")).toBeInTheDocument();
  expect(screen.queryByRole("listitem", { name: "Activa" })).not.toBeInTheDocument();
});

test("RF-009: «Cargar más» muestra las siguientes 50 borradas desde la réplica", async () => {
  const { value, db } = syncValue();
  const seed = seedStore(db);
  for (let i = 1; i <= 51; i += 1) await trashed(seed, `Bóveda ${i}`);
  const user = renderPage(value);
  await screen.findByRole("listitem", { name: "Bóveda 51" });
  expect(screen.getAllByRole("listitem")).toHaveLength(50);
  await user.click(screen.getByRole("button", { name: "Cargar más" }));
  expect(screen.getByRole("listitem", { name: "Bóveda 1" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
});

test("RF-011: «Restaurar» la vuelve activa en la réplica y la quita de la papelera", async () => {
  const { value, db } = syncValue();
  const seed = seedStore(db);
  const notas = await trashed(seed, "Notas");
  await trashed(seed, "Otra");
  const user = renderPage(value);
  await user.click(await restoreButton("Notas"));
  expect(await screen.findByRole("status")).toHaveTextContent("«Notas» se restauró.");
  expect(screen.queryByRole("listitem", { name: "Notas" })).not.toBeInTheDocument();
  expect(screen.getByRole("listitem", { name: "Otra" })).toBeInTheDocument();
  expect((await value.vaults.get(notas.id)).deleted_at).toBeNull();
});

test("RF-028: si su nombre ya lo usa otra activa avisa y la deja en la papelera", async () => {
  const { value, db } = syncValue();
  const seed = seedStore(db);
  await trashed(seed, "Notas");
  await seed.create({ name: "notas", description: null, tags: [] });
  const user = renderPage(value);
  await user.click(await restoreButton("Notas"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se puede restaurar «Notas»: ya tienes otra bóveda con ese nombre.",
  );
  expect(screen.getByRole("listitem", { name: "Notas" })).toBeInTheDocument();
});

test.each([
  // Otra pestaña la restauró: ya no está en la papelera (VaultNotFoundError).
  ["ya restaurada", async (seed: ReturnType<typeof seedStore>, id: string, rev: string) => seed.restore(id, rev)],
  // Otra pestaña la restauró y la volvió a borrar: sigue aquí con otra revisión (VaultChangedError).
  [
    "con otra revisión",
    async (seed: ReturnType<typeof seedStore>, id: string, rev: string) => {
      const restored = await seed.restore(id, rev);
      await seed.softDelete(id, restored.rev);
    },
  ],
])("RF-028: si la papelera está desfasada (%s) avisa y la recarga", async (_case, change) => {
  const { value, db } = syncValue();
  const seed = seedStore(db);
  const vault = await trashed(seed, "Notas");
  const list = vi.spyOn(value.vaults, "list");
  const user = renderPage(value);
  const button = await restoreButton("Notas");
  await change(seed, vault.id, vault.rev);
  await user.click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "«Notas» cambió desde que se cargó la papelera; se muestra la versión actual.",
  );
  await waitForCondition(() => expect(list).toHaveBeenCalledTimes(2));
});

test("R-11: sin espacio en el dispositivo lo avisa", async () => {
  const { value, db } = syncValue();
  await trashed(seedStore(db), "Notas");
  vi.spyOn(value.vaults, "restore").mockRejectedValue(new StorageFullError());
  const user = renderPage(value);
  await user.click(await restoreButton("Notas"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No queda espacio en este dispositivo para guardar cambios. Libera espacio e inténtalo de nuevo.",
  );
});

test("RF-028: otro error al restaurar da un aviso genérico", async () => {
  const { value, db } = syncValue();
  await trashed(seedStore(db), "Notas");
  vi.spyOn(value.vaults, "restore").mockRejectedValue(new Error("fallo de IndexedDB"));
  const user = renderPage(value);
  await user.click(await restoreButton("Notas"));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo restaurar «Notas». Inténtalo de nuevo.");
});

test("RF-028: si la réplica no se puede leer, avisa y permite reintentar", async () => {
  const { value, db } = syncValue();
  await trashed(seedStore(db), "Notas");
  vi.spyOn(value.vaults, "list").mockRejectedValueOnce(new Error("fallo de IndexedDB"));
  const user = renderPage(value);
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar la papelera.");
  await user.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByRole("listitem", { name: "Notas" })).toBeInTheDocument();
});
