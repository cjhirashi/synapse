// Espacio de trabajo de una bóveda: sidebar + editor (SPEC-0008 RF-001, RF-002, RF-014, RF-015, RF-019).
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import { DataMemoryRouter } from "../test-utils/router";
import { afterEach, beforeAll, expect, test } from "vitest";
import { memoryDb, seedStore, syncValue, WithSync } from "../test-utils/sync";
import { createVaultStore } from "../sync/vaultStore";
import type { SyncContextValue } from "../sync/useSync";
import VaultWorkspacePage from "./VaultWorkspacePage";

// El editor se carga con `React.lazy`: la primera importación (Milkdown + CodeMirror, transformados
// por Vite) puede tardar más que el tiempo de espera de `findBy*` si la máquina va cargada. Se
// paga aquí, una vez, para que las pruebas midan la pantalla y no la carga del módulo.
beforeAll(() => import("../editor/NoteEditor"), 30_000);

afterEach(() => localStorage.clear());

/** Estado de navegación actual, para comprobar que el espacio de trabajo lo consume. */
function NavState() {
  return <p data-testid="nav-state">{JSON.stringify(useLocation().state)}</p>;
}

function tree(value: SyncContextValue, path: string, state?: unknown) {
  return (
    <WithSync value={value}>
      <DataMemoryRouter initialEntries={[{ pathname: path, state }]}>
        <NavState />
        <Routes>
          <Route path="/vaults/:id" element={<VaultWorkspacePage />} />
          <Route path="/vaults" element={<div>lista de bóvedas</div>} />
        </Routes>
      </DataMemoryRouter>
    </WithSync>
  );
}

async function setup() {
  const { value, db } = syncValue({}, memoryDb());
  const vault = await seedStore(db).create({ name: "Trabajo", description: null, tags: [] });
  return { value, db, vault };
}

test("RF-001, RF-015: bóveda activa → su nombre, el árbol y el editor vacío", async () => {
  const { value, vault } = await setup();
  await value.notes.create(vault.id, "Hola");
  render(tree(value, `/vaults/${vault.id}`));
  expect(await screen.findByRole("heading", { level: 1, name: "Trabajo" })).toBeInTheDocument();
  expect(await screen.findByRole("tree", { name: "Notas" })).toBeInTheDocument();
  expect(screen.getByText("Abre o crea una nota para empezar.")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Editor de nota" })).toBeNull();
});

test.each([
  ["no canónico", "no-es-un-uuid"],
  ["mayúsculas", "11111111-1111-4111-8111-11111111111A"],
  ["inexistente", "11111111-1111-4111-8111-111111111111"],
])("RF-002: id %s → 404", async (_name, id) => {
  const { value } = await setup();
  render(tree(value, `/vaults/${id}`));
  expect(await screen.findByRole("alert")).toHaveTextContent("Esta bóveda no existe o está en la papelera.");
  expect(screen.queryByRole("tree")).toBeNull();
  expect(screen.getByRole("link", { name: "Volver a las bóvedas" })).toHaveAttribute("href", "/vaults");
});

test("RF-002, RF-014: una bóveda en la papelera → 404", async () => {
  const { value, vault } = await setup();
  await value.vaults.softDelete(vault.id, vault.rev);
  render(tree(value, `/vaults/${vault.id}`));
  expect(await screen.findByRole("alert")).toHaveTextContent("no existe");
});

test("RF-002: una bóveda que llega después por el pull sustituye al 404", async () => {
  const { value, db } = await setup();
  const id = "33333333-3333-4333-8333-333333333333";
  const { rerender } = render(tree(value, `/vaults/${id}`));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  await createVaultStore(db, "u1", { newId: () => id }).create({ name: "Llegada", description: null, tags: [] });
  rerender(tree({ ...value, dataVersion: 1 }, `/vaults/${id}`));
  expect(await screen.findByRole("heading", { level: 1, name: "Llegada" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("RF-014: una bóveda que se borra mientras está abierta pasa a 404", async () => {
  const { value, vault } = await setup();
  const { rerender } = render(tree(value, `/vaults/${vault.id}`));
  await screen.findByRole("heading", { level: 1, name: "Trabajo" });
  const current = await value.vaults.get(vault.id);
  await value.vaults.softDelete(vault.id, current.rev);
  rerender(tree({ ...value, dataVersion: 1 }, `/vaults/${vault.id}`));
  expect(await screen.findByRole("alert")).toHaveTextContent("no existe");
});

test("RF-019, RF-007: un click en una nota la abre en modo lectura", async () => {
  const { value, vault } = await setup();
  await value.notes.create(vault.id, "Hola");
  render(tree(value, `/vaults/${vault.id}`));
  await userEvent.click(await screen.findByRole("treeitem", { name: "Hola" }));
  expect(await screen.findByRole("heading", { level: 2, name: "Hola" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Editar" })).toBeInTheDocument();
  expect(screen.getByRole("treeitem", { name: "Hola" })).toHaveAttribute("aria-selected", "true");
});

test("RF-003: crear una nota la abre en edición", async () => {
  const { value, vault } = await setup();
  render(tree(value, `/vaults/${vault.id}`));
  await userEvent.click(await screen.findByRole("button", { name: "Nueva nota" }));
  expect(await screen.findByRole("button", { name: "Leer" }, { timeout: 4000 })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "Sin título" })).toBeInTheDocument();
});

test("RF-015: al volver a montar no hay ninguna nota abierta y nada se guarda en localStorage", async () => {
  const { value, vault } = await setup();
  await value.notes.create(vault.id, "Hola");
  const first = render(tree(value, `/vaults/${vault.id}`));
  await userEvent.click(await screen.findByRole("treeitem", { name: "Hola" }));
  await screen.findByRole("heading", { level: 2, name: "Hola" });
  first.unmount();
  render(tree(value, `/vaults/${vault.id}`));
  await screen.findByRole("tree", { name: "Notas" });
  expect(screen.getByText("Abre o crea una nota para empezar.")).toBeInTheDocument();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

test("RF-010: borrar la nota abierta cierra el editor; la papelera de la bóveda se abre y se cierra", async () => {
  const { value, vault } = await setup();
  await value.notes.create(vault.id, "Hola");
  render(tree(value, `/vaults/${vault.id}`));
  await userEvent.click(await screen.findByRole("treeitem", { name: "Hola" }));
  await screen.findByRole("heading", { level: 2, name: "Hola" });
  await userEvent.click(screen.getByRole("button", { name: "Borrar «Hola»" }));
  await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "Hola" })).toBeNull());
  expect(screen.getByText("Abre o crea una nota para empezar.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Papelera de la bóveda" }));
  expect(await screen.findByRole("heading", { level: 2, name: "Papelera de la bóveda" })).toBeInTheDocument();
  expect(screen.getByText("Hola.md")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Volver a las notas" }));
  expect(screen.queryByRole("heading", { level: 2, name: "Papelera de la bóveda" })).toBeNull();
});

// «Corregir» de una nota rechazada (RejectionsPage) abre la bóveda con la nota en el estado de navegación.
test("RF-004, RF-013: abre la nota indicada en el estado de navegación, en lectura, y consume el estado", async () => {
  const { value, vault } = await setup();
  const note = await value.notes.create(vault.id, "Rechazada");
  render(tree(value, `/vaults/${vault.id}`, { noteId: note.id }));
  expect(await screen.findByRole("heading", { level: 2, name: "Rechazada" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Editar" })).toBeInTheDocument();
  // El estado vive en el historial del navegador y sobreviviría a recargar: se limpia al usarlo (RF-015).
  await waitFor(() => expect(screen.getByTestId("nav-state")).toHaveTextContent("null"));
});

test("RF-015: un id de nota de otra bóveda en el estado de navegación se ignora", async () => {
  const { value, vault } = await setup();
  const foreign = "note:33333333-3333-4333-8333-333333333333:44444444-4444-4444-8444-444444444444";
  render(tree(value, `/vaults/${vault.id}`, { noteId: foreign }));
  expect(await screen.findByText("Abre o crea una nota para empezar.")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Editor de nota" })).toBeNull();
});

/** Abre "Hola" en edición con el editor de código y le añade texto: el borrador queda sucio. */
async function openDirtyNote() {
  const { value, vault } = await setup();
  const note = await value.notes.create(vault.id, "Hola");
  render(tree(value, `/vaults/${vault.id}`));
  await userEvent.click(await screen.findByRole("treeitem", { name: "Hola" }));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  await userEvent.click(screen.getByRole("button", { name: "Código" }));
  const view = EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement)!;
  act(() => view.dispatch({ changes: { from: 0, insert: "borrador" } }));
  await screen.findByText("Cambios sin guardar");
  return { value, note };
}

// VF-2: el borrado de la nota abierta con borrador sucio pide confirmación antes de descartarlo.
test("RF-010: borrar la nota abierta con cambios sin guardar pide confirmación y 'Seguir editando' no borra", async () => {
  const { value } = await openDirtyNote();
  await userEvent.click(screen.getByRole("button", { name: "Borrar «Hola»" }));
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Seguir editando" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(await value.notes.list((await value.vaults.list())[0].id, { deleted: true })).toEqual([]);
  expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
});

test("RF-010: 'Borrar y descartar cambios' manda la nota a la papelera y cierra el editor", async () => {
  const { value, note } = await openDirtyNote();
  await userEvent.click(screen.getByRole("button", { name: "Borrar «Hola»" }));
  await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Borrar y descartar cambios" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Editor de nota" })).toBeNull());
  expect((await value.notes.list(note.vault_id, { deleted: true })).map((n) => n.id)).toEqual([note.id]);
});
