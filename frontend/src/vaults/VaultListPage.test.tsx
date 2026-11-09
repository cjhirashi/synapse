// Bóvedas activas sobre la réplica local (SPEC-0003 RF-018, RF-020; SPEC-0005 RF-009, RF-011).
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import type { SyncContextValue } from "../sync/useSync";
import { StorageFullError } from "../sync/vaultStore";
import { seedStore, syncValue, WithSync } from "../test-utils/sync";
import VaultListPage from "./VaultListPage";

afterEach(() => vi.restoreAllMocks());

function tree(value: SyncContextValue) {
  return (
    <WithSync value={value}>
      <MemoryRouter initialEntries={["/vaults"]}>
        <Routes>
          <Route path="/vaults" element={<VaultListPage />} />
          <Route path="/vaults/new" element={<div>formulario nuevo</div>} />
          <Route path="/vaults/:id/edit" element={<div>formulario edición</div>} />
          <Route path="/vaults/:id" element={<div>bóveda abierta</div>} />
        </Routes>
      </MemoryRouter>
    </WithSync>
  );
}

/** Página sobre una réplica en memoria; `rerender` publica otro contexto (p. ej. otra `dataVersion`). */
function renderPage(value: SyncContextValue) {
  const { rerender } = render(tree(value));
  return { user: userEvent.setup(), rerender: (next: SyncContextValue) => rerender(tree(next)) };
}

/** Siembra `n` bóvedas sin etiquetas ni descripción («Bóveda 1» es la más antigua). */
async function seedMany(store: ReturnType<typeof seedStore>, n: number) {
  for (let i = 1; i <= n; i += 1) await store.create({ name: `Bóveda ${i}`, description: null, tags: [] });
}

/** Fila de la tabla de una bóveda, por su nombre (espera a que aparezca). */
async function rowOf(name: string) {
  const link = await screen.findByRole("link", { name });
  return link.closest("tr") as HTMLElement;
}

const bodyRows = () => screen.getAllByRole("row").slice(1);

async function deleteButton(name: string) {
  return screen.findByRole("button", { name: `Borrar ${name}` });
}

test("RF-018: muestra nombre, descripción y tags de cada bóveda", async () => {
  const { value, db } = syncValue();
  await seedStore(db).create({ name: "Notas", description: "Apuntes", tags: ["work", "común"] });
  await seedStore(db).create({ name: "Otra", description: null, tags: [] });
  renderPage(value);
  const first = await rowOf("Notas");
  expect(within(first).getByText("Apuntes")).toBeInTheDocument();
  expect(within(first).getByText("work")).toBeInTheDocument();
  expect(within(first).getByText("común")).toBeInTheDocument();
  expect(await rowOf("Otra")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
});

test("la lista de bóvedas es una tabla con encabezados y las etiquetas como chips", async () => {
  const { value, db } = syncValue();
  await seedStore(db).create({ name: "Notas", description: null, tags: ["work"] });
  renderPage(value);
  const item = await rowOf("Notas");
  const table = screen.getByRole("table", { name: "Bóvedas" });
  expect(within(table).getAllByRole("columnheader").map((h) => h.textContent?.trim())).toEqual(["Nombre", "Descripción", "Etiquetas", "Actualizada", "Acciones"]);
  expect(within(item).getByRole("list", { name: "Etiquetas" })).toHaveClass("chip-list");
});

test("pulsar el encabezado «Nombre» ordena la tabla de A a Z y luego de Z a A", async () => {
  const { value, db } = syncValue();
  await seedMany(seedStore(db), 3);
  const { user } = renderPage(value);
  await rowOf("Bóveda 1");
  const names = () => bodyRows().map((r) => within(r).getAllByRole("link")[0].textContent);
  await user.click(screen.getByRole("button", { name: /^Nombre/ }));
  expect(names()).toEqual(["Bóveda 1", "Bóveda 2", "Bóveda 3"]);
  await user.click(screen.getByRole("button", { name: /^Nombre/ }));
  expect(names()).toEqual(["Bóveda 3", "Bóveda 2", "Bóveda 1"]);
});

test("RF-018: ordena de la más nueva a la más antigua", async () => {
  const { value, db } = syncValue();
  await seedMany(seedStore(db), 3);
  renderPage(value);
  await rowOf("Bóveda 1");
  expect(bodyRows().map((r) => within(r).getAllByRole("link")[0].textContent)).toEqual([
    "Bóveda 3",
    "Bóveda 2",
    "Bóveda 1",
  ]);
});

test("RF-018: sin bóvedas lo dice y ofrece crear una", async () => {
  const { value } = syncValue();
  const { user } = renderPage(value);
  expect(await screen.findByText("Aún no tienes bóvedas.")).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "Nueva bóveda" }));
  expect(screen.getByText("formulario nuevo")).toBeInTheDocument();
});

test("RF-009: «Cargar más» muestra las siguientes 50 desde la réplica y se oculta al final", async () => {
  const { value, db } = syncValue();
  await seedMany(seedStore(db), 51);
  const list = vi.spyOn(value.vaults, "list");
  const { user } = renderPage(value);
  await rowOf("Bóveda 51");
  expect(bodyRows()).toHaveLength(50);
  expect(screen.queryByRole("link", { name: "Bóveda 1" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cargar más" }));
  expect(bodyRows()).toHaveLength(51);
  expect(screen.getByRole("link", { name: "Bóveda 1" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
  // Paginar es sólo mostrar más de lo ya leído: no vuelve a leer la réplica.
  expect(list).toHaveBeenCalledOnce();
});

test("RF-009: un cambio en la réplica (`dataVersion`) recarga la lista sin perder lo ya mostrado", async () => {
  const { value, db } = syncValue();
  const seed = seedStore(db);
  await seedMany(seed, 51);
  const list = vi.spyOn(value.vaults, "list");
  const { user, rerender } = renderPage(value);
  await user.click(await screen.findByRole("button", { name: "Cargar más" }));
  // Llega una bóveda nueva (de la UI, del pull o de otra pestaña).
  await seed.create({ name: "Recién llegada", description: null, tags: [] });
  rerender({ ...value, dataVersion: 1 });
  // La relectura es silenciosa: mientras dura, la lista sigue entera y sin «Cargando…» (VH-1).
  expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
  expect(bodyRows()).toHaveLength(51);
  // Se espera la relectura misma y no su efecto en el DOM: sondear con `findBy*` un DOM de
  // 51 bóvedas (nombre accesible, estilos y el mensaje de error de cada intento fallido)
  // ocupa el hilo que necesita esa lectura y, con la máquina cargada, la hacía llegar tarde
  // (backlog 8, VE-6). `act` aplica su resultado antes de consultar una sola vez.
  expect(list).toHaveBeenCalledTimes(2);
  await act(() => list.mock.results[1].value);
  expect(screen.getByRole("link", { name: "Recién llegada" })).toBeInTheDocument();
  expect(bodyRows()).toHaveLength(52);
  expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
});

test("RF-018: «Editar» lleva al formulario de esa bóveda", async () => {
  const { value, db } = syncValue();
  await seedStore(db).create({ name: "Notas", description: null, tags: [] });
  const { user } = renderPage(value);
  await user.click(within(await rowOf("Notas")).getByRole("link", { name: "Editar Notas" }));
  expect(screen.getByText("formulario edición")).toBeInTheDocument();
});

// SPEC-0008 RF-018: «Abrir» junto a «Editar» lleva a la bóveda abierta (notas), no a sus metadatos.
test("RF-018: «Abrir» lleva a /vaults/{id}, junto a «Editar»", async () => {
  const { value, db } = syncValue();
  const vault = await seedStore(db).create({ name: "Notas", description: null, tags: [] });
  const { user } = renderPage(value);
  const item = await rowOf("Notas");
  expect(within(item).getByRole("link", { name: "Abrir Notas" })).toHaveAttribute("href", `/vaults/${vault.id}`);
  expect(within(item).getByRole("link", { name: "Editar Notas" })).toBeInTheDocument();
  await user.click(within(item).getByRole("link", { name: "Abrir Notas" }));
  expect(screen.getByText("bóveda abierta")).toBeInTheDocument();
});

test("RF-020: borrar pide confirmación y cancelar no la mueve a la papelera", async () => {
  const { value, db } = syncValue();
  await seedStore(db).create({ name: "Notas", description: null, tags: [] });
  const { user } = renderPage(value);
  await user.click(await deleteButton("Notas"));
  const dialog = screen.getByRole("alertdialog", { name: "¿Mover «Notas» a la papelera?" });
  await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Notas" })).toBeInTheDocument();
  expect(await value.vaults.list({ deleted: true })).toEqual([]);
});

test("RF-020: la confirmación es un modal fijo; Escape la cierra sin borrar y el foco inicial es «Cancelar»", async () => {
  const { value, db } = syncValue();
  await seedStore(db).create({ name: "Notas", description: null, tags: [] });
  const { user } = renderPage(value);
  await user.click(await deleteButton("Notas"));
  const dialog = screen.getByRole("alertdialog", { name: "¿Mover «Notas» a la papelera?" });
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(dialog.parentElement).toHaveClass("modal-backdrop");
  expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Notas" })).toBeInTheDocument();
  expect(await value.vaults.list({ deleted: true })).toEqual([]);
});

test("RF-011: confirmar la mueve a la papelera de la réplica y la quita de la lista", async () => {
  const { value, db } = syncValue();
  const seed = seedStore(db);
  await seedMany(seed, 2);
  const { user } = renderPage(value);
  await user.click(await deleteButton("Bóveda 1"));
  await user.click(screen.getByRole("button", { name: "Mover a la papelera" }));
  expect(await screen.findByRole("status")).toHaveTextContent("«Bóveda 1» se movió a la papelera.");
  expect(screen.queryByRole("link", { name: "Bóveda 1" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Bóveda 2" })).toBeInTheDocument();
  expect((await value.vaults.list({ deleted: true })).map((vault) => vault.name)).toEqual(["Bóveda 1"]);
});

test("RF-020: si la bóveda cambió desde que se cargó avisa y recarga la lista", async () => {
  const { value, db } = syncValue();
  const seed = seedStore(db);
  const vault = await seed.create({ name: "Notas", description: null, tags: [] });
  const { user } = renderPage(value);
  await user.click(await deleteButton("Notas"));
  // Otra pestaña (o el pull) la renombra mientras el diálogo está abierto.
  await seed.update(vault.id, { name: "Renombrada" }, vault.rev);
  await user.click(screen.getByRole("button", { name: "Mover a la papelera" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "«Notas» cambió desde que se cargó la lista; se muestra la versión actual.",
  );
  expect(await rowOf("Renombrada")).toBeInTheDocument();
  expect(await value.vaults.list({ deleted: true })).toEqual([]);
});

test("R-11: sin espacio en el dispositivo lo avisa", async () => {
  const { value, db } = syncValue();
  await seedStore(db).create({ name: "Notas", description: null, tags: [] });
  vi.spyOn(value.vaults, "softDelete").mockRejectedValue(new StorageFullError());
  const { user } = renderPage(value);
  await user.click(await deleteButton("Notas"));
  await user.click(screen.getByRole("button", { name: "Mover a la papelera" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No queda espacio en este dispositivo para guardar cambios. Libera espacio e inténtalo de nuevo.",
  );
  expect(screen.getByRole("link", { name: "Notas" })).toBeInTheDocument();
});

test("RF-020: otro error al borrar da un aviso genérico", async () => {
  const { value, db } = syncValue();
  await seedStore(db).create({ name: "Notas", description: null, tags: [] });
  vi.spyOn(value.vaults, "softDelete").mockRejectedValue(new Error("fallo de IndexedDB"));
  const { user } = renderPage(value);
  await user.click(await deleteButton("Notas"));
  await user.click(screen.getByRole("button", { name: "Mover a la papelera" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo mover «Notas» a la papelera. Inténtalo de nuevo.");
});

test("RF-018: si la réplica no se puede leer, avisa y permite reintentar", async () => {
  const { value, db } = syncValue();
  await seedStore(db).create({ name: "Notas", description: null, tags: [] });
  vi.spyOn(value.vaults, "list").mockRejectedValueOnce(new Error("fallo de IndexedDB"));
  const { user } = renderPage(value);
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las bóvedas.");
  await user.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await rowOf("Notas")).toBeInTheDocument();
});

// SPEC-0009 RF-011: la lista muestra el mismo chip que el riel (ícono o iniciales), sólo decorativo.
test("RF-011, RF-001: cada fila muestra el chip de su bóveda, con ícono o con iniciales", async () => {
  const { value, db } = syncValue();
  const vault = await seedStore(db).create({ name: "Con ícono", description: null, tags: [] });
  // `icon` aún no lo escribe el almacén (PLAN-0009 §6.1): se siembra directamente en la réplica.
  await db.put({ ...(await db.get(`vault:${vault.id}`)), icon: "star:warning" });
  await seedStore(db).create({ name: "Sin ícono", description: null, tags: [] });
  renderPage(value);

  const withIcon = await rowOf("Con ícono");
  expect(withIcon.querySelector('.vault-chip svg[data-icon="star"]')).not.toBeNull();
  const without = await rowOf("Sin ícono");
  expect(without.querySelector(".vault-chip")).toHaveTextContent("SÍ");
  // El chip es decorativo y no cambia el nombre accesible del enlace.
  expect(withIcon.querySelector(".vault-chip")).toHaveAttribute("aria-hidden", "true");
});
