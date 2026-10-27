// Espacio de trabajo de una bóveda: sidebar + editor (SPEC-0008 RF-001, RF-002, RF-014, RF-015, RF-019).
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import { DataMemoryRouter } from "../test-utils/router";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { memoryDb, seedStore, syncValue, WithSync } from "../test-utils/sync";
import { createVaultStore } from "../sync/vaultStore";
import type { SyncContextValue } from "../sync/useSync";
import VaultWorkspacePage from "./VaultWorkspacePage";
import { parseMarkdownToJson } from "../editor/markdown/parseStage";
import { PARSE_MARK } from "../editor/markdown/cachedParser";

// RNF-001 (PLAN-0010 §10.4/§10.5): en jsdom no hay `Worker`, así que `createParseWorkspace` devolvería
// `null`. Se sustituye por una caché y un programador falsos para comprobar el CABLEADO: creación y
// `dispose` por bóveda, prioridad por puntero/foco, y que el mdast precalculado llega al editor.
const parseFakes = vi.hoisted(() => {
  const scheduler = { reconcile: vi.fn(), prioritize: vi.fn(), pause: vi.fn(), resume: vi.fn(), dispose: vi.fn() };
  const cache = { get: vi.fn((): string | null => null), pending: vi.fn((): Promise<string | null> | null => null) };
  const dispose = vi.fn();
  const createParseWorkspace = vi.fn(() => ({ cache, scheduler, dispose }));
  return { scheduler, cache, dispose, createParseWorkspace };
});
vi.mock("./parseWorkspace", () => ({ createParseWorkspace: parseFakes.createParseWorkspace }));

// El editor se carga con `React.lazy`: la primera importación (Milkdown + CodeMirror, transformados
// por Vite) puede tardar más que el tiempo de espera de `findBy*` si la máquina va cargada. Se
// paga aquí, una vez, para que las pruebas midan la pantalla y no la carga del módulo.
beforeAll(() => import("../editor/NoteEditor"), 30_000);

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  parseFakes.cache.get.mockReturnValue(null);
  parseFakes.cache.pending.mockReturnValue(null);
  parseFakes.scheduler.prioritize.mockClear();
  parseFakes.scheduler.reconcile.mockClear();
  parseFakes.dispose.mockClear();
  parseFakes.createParseWorkspace.mockClear();
});

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

// SPEC-0009 RF-003: la cabecera de la barra lateral lleva el ícono de carpeta abierta y el nombre (h1).
test("RF-003: la cabecera de la barra tiene el ícono de la bóveda y su nombre como h1", async () => {
  const { value, vault } = await setup();
  const { container } = render(tree(value, `/vaults/${vault.id}`));
  await screen.findByRole("heading", { level: 1, name: "Trabajo" });
  const header = container.querySelector(".vault-workspace-header")!;
  expect(header).not.toBeNull();
  expect(header.querySelector('svg[data-icon="folder-open"]')).not.toBeNull();
  expect(within(header as HTMLElement).getByRole("heading", { level: 1, name: "Trabajo" })).toBeInTheDocument();
  // El resto de la barra (formulario, árbol) va fuera de la cabecera.
  expect(header.querySelector("form, [role='tree']")).toBeNull();
});

// SPEC-0009 RF-008: el estado vacío es un bloque propio con ícono, con el mismo texto de siempre.
test("RF-008: el estado vacío del editor es un bloque con ícono y el mismo texto", async () => {
  const { value, vault } = await setup();
  const { container } = render(tree(value, `/vaults/${vault.id}`));
  await screen.findByRole("heading", { level: 1, name: "Trabajo" });
  const empty = container.querySelector<HTMLElement>(".vault-workspace-empty")!;
  expect(empty).not.toBeNull();
  expect(empty.querySelector('svg[data-icon="file-text"]')).not.toBeNull();
  expect(within(empty).getByText("Abre o crea una nota para empezar.")).toBeInTheDocument();
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
  expect(await screen.findByRole("button", { name: "Leer" })).toBeInTheDocument();
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
  // SPEC-0010 RF-057 (enmienda del RF-015 de 0008): lo único que persiste es el historial de ids de la pestaña, nunca
  // el contenido ni «la nota abierta».
  expect(Object.keys(sessionStorage)).toEqual([`synapse:note-history:${vault.id}`]);
  expect(sessionStorage.getItem(`synapse:note-history:${vault.id}`)).not.toContain("Hola\"");
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
  const { rerender } = render(tree(value, `/vaults/${vault.id}`));
  await userEvent.click(await screen.findByRole("treeitem", { name: "Hola" }));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  await userEvent.click(screen.getByRole("button", { name: "Código" }));
  const view = EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement)!;
  act(() => view.dispatch({ changes: { from: 0, insert: "borrador" } }));
  await screen.findByText("Cambios sin guardar");
  return { value, note, vault, rerender };
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

// C-1 (PLAN-0008 §14): el atajo Supr respeta la confirmación de VF-2.
test("RF-010: Supr en el treeitem de la nota abierta con cambios sin guardar pide confirmación", async () => {
  const { value } = await openDirtyNote();
  screen.getByRole("treeitem", { name: "Hola" }).focus();
  await userEvent.keyboard("{Delete}");
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Seguir editando" }));
  expect(await value.notes.list((await value.vaults.list())[0].id, { deleted: true })).toEqual([]);
});

// E-2 (PLAN-0008 §17): la bóveda llega a la papelera por sync con borrador sucio → el 404 conserva el borrador.
test("RF-014, RF-002: bóveda a la papelera con borrador sucio → 404 que muestra el borrador (sólo lectura) y «Copiar texto»", async () => {
  const { value, vault, rerender } = await openDirtyNote();
  const current = await value.vaults.get(vault.id);
  await value.vaults.softDelete(vault.id, current.rev);
  rerender(tree({ ...value, dataVersion: 1 }, `/vaults/${vault.id}`));
  expect(await screen.findByRole("alert")).toHaveTextContent("no existe");
  const draft = screen.getByRole("textbox", { name: "Borrador sin guardar" });
  expect(draft).toHaveValue("borrador");
  expect(draft).toHaveAttribute("readonly");
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  await userEvent.click(screen.getByRole("button", { name: "Copiar texto" }));
  expect(writeText).toHaveBeenCalledWith("borrador");
});

// E-3 (PLAN-0008 §18): sólo la pérdida involuntaria conserva el borrador; descartarlo a propósito lo suelta.
test("RF-014: un borrador descartado a propósito («Borrar y descartar cambios») no reaparece en el 404", async () => {
  const { value, vault, rerender } = await openDirtyNote();
  await userEvent.click(screen.getByRole("button", { name: "Borrar «Hola»" }));
  await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Borrar y descartar cambios" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Editor de nota" })).toBeNull());
  const current = await value.vaults.get(vault.id);
  await value.vaults.softDelete(vault.id, current.rev);
  rerender(tree({ ...value, dataVersion: 1 }, `/vaults/${vault.id}`));
  expect(await screen.findByRole("alert")).toHaveTextContent("no existe");
  expect(screen.queryByRole("textbox", { name: "Borrador sin guardar" })).toBeNull();
});

// E-4: sin API de portapapeles no hay rechazo sin manejar: se avisa y se selecciona el texto.
test("RF-014: «Copiar texto» sin navigator.clipboard avisa y selecciona el texto", async () => {
  const { value, vault, rerender } = await openDirtyNote();
  const current = await value.vaults.get(vault.id);
  await value.vaults.softDelete(vault.id, current.rev);
  rerender(tree({ ...value, dataVersion: 1 }, `/vaults/${vault.id}`));
  const draft = (await screen.findByRole("textbox", { name: "Borrador sin guardar" })) as HTMLTextAreaElement;
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  await userEvent.click(screen.getByRole("button", { name: "Copiar texto" }));
  expect(await screen.findByText("No se pudo copiar; selecciona el texto.")).toBeInTheDocument();
  expect([draft.selectionStart, draft.selectionEnd]).toEqual([0, draft.value.length]);
  expect(draft).toHaveFocus();
});

// E-5: el diálogo de descarte abre sobre la respuesta segura, no sobre la acción destructiva.
test("RF-010: el diálogo «Borrar y descartar cambios» enfoca primero «Seguir editando»", async () => {
  await openDirtyNote();
  await userEvent.click(screen.getByRole("button", { name: "Borrar «Hola»" }));
  const dialog = await screen.findByRole("alertdialog");
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Seguir editando" })).toHaveFocus());
});

// --- RNF-001: precálculo (PLAN-0010 §10) -------------------------------------------------------
test("precalc: el workspace crea la caché/programador al montar y los destruye al desmontar", async () => {
  const { value, vault } = await setup();
  await value.notes.create(vault.id, "Hola");
  const { unmount } = render(tree(value, `/vaults/${vault.id}`));
  await screen.findByRole("tree", { name: "Notas" });
  expect(parseFakes.createParseWorkspace).toHaveBeenCalled();
  unmount();
  expect(parseFakes.dispose).toHaveBeenCalled();
});

test("precalc: pointerenter en una fila del árbol pide su precálculo con prioridad", async () => {
  const { value, vault } = await setup();
  const note = await value.notes.create(vault.id, "Hola");
  render(tree(value, `/vaults/${vault.id}`));
  await userEvent.hover(await screen.findByRole("treeitem", { name: "Hola" }));
  expect(parseFakes.scheduler.prioritize).toHaveBeenCalledWith(note.id);
});

test("precalc: abrir una nota precalculada entrega su mdast al editor (marca cache-hit)", async () => {
  const { value, vault } = await setup();
  const note = await value.notes.create(vault.id, "Hola");
  await value.notes.save(note.id, "# Hola\n\ncuerpo de la nota", note.rev);
  parseFakes.cache.get.mockReturnValue(parseMarkdownToJson("# Hola\n\ncuerpo de la nota"));
  const mark = vi.spyOn(performance, "mark");
  render(tree(value, `/vaults/${vault.id}`));
  await userEvent.click(await screen.findByRole("treeitem", { name: "Hola" }));
  await screen.findByRole("heading", { level: 2, name: "Hola" });
  await waitFor(() => expect(mark).toHaveBeenCalledWith(PARSE_MARK.cacheHit));
  expect(mark).not.toHaveBeenCalledWith(PARSE_MARK.cold);
  mark.mockRestore();
});

test("precalc: con el parseo en vuelo, el editor espera esa promesa en vez de reparsear", async () => {
  const { value, vault } = await setup();
  const note = await value.notes.create(vault.id, "Hola");
  await value.notes.save(note.id, "# Hola\n\notro cuerpo", note.rev);
  parseFakes.cache.get.mockReturnValue(null); // nada cacheado aún…
  parseFakes.cache.pending.mockReturnValue(Promise.resolve(parseMarkdownToJson("# Hola\n\notro cuerpo"))); // …pero sí en vuelo
  const mark = vi.spyOn(performance, "mark");
  render(tree(value, `/vaults/${vault.id}`));
  await userEvent.click(await screen.findByRole("treeitem", { name: "Hola" }));
  await screen.findByRole("heading", { level: 2, name: "Hola" });
  await waitFor(() => expect(mark).toHaveBeenCalledWith(PARSE_MARK.cacheHit));
  mark.mockRestore();
});

// --- SPEC-0010 RF-056…RF-060: historial de notas abiertas (Atrás/Adelante) -----------------------------------

/** Un espacio de trabajo con tres notas (Alfa, Beta, Gamma) y la bóveda montada. */
async function historySetup(names = ["Alfa", "Beta", "Gamma"]) {
  const { value, vault } = await setup();
  const notes = [];
  for (const name of names) notes.push(await value.notes.create(vault.id, name));
  const utils = render(tree(value, `/vaults/${vault.id}`));
  return { value, vault, notes, ...utils };
}

/** Abre una nota del árbol (en lectura) y espera a que su encabezado sea el actual. */
async function openFromTree(name: string) {
  await userEvent.click(await screen.findByRole("treeitem", { name }));
  expect(await screen.findByRole("heading", { level: 2, name })).toBeInTheDocument();
}

const back = () => screen.getByRole("button", { name: "Atrás" });
const forward = () => screen.getByRole("button", { name: "Adelante" });

test("historial: abrir notas habilita Atrás; Atrás y Adelante navegan y se deshabilitan en los extremos (RF-056, RF-057)", async () => {
  await historySetup();
  await openFromTree("Alfa");
  expect(back()).toBeDisabled();
  expect(forward()).toBeDisabled();
  await openFromTree("Beta");
  expect(back()).toBeEnabled();
  expect(forward()).toBeDisabled();
  await userEvent.click(back());
  expect(await screen.findByRole("heading", { level: 2, name: "Alfa" })).toBeInTheDocument();
  expect(back()).toBeDisabled();
  expect(forward()).toBeEnabled();
  await userEvent.click(forward());
  expect(await screen.findByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
  expect(forward()).toBeDisabled();
});

test("historial: moverse atrás/adelante no añade entradas y abrir otra nota descarta las de «adelante» (RF-057)", async () => {
  await historySetup();
  await openFromTree("Alfa");
  await openFromTree("Beta");
  await userEvent.click(back());
  await screen.findByRole("heading", { level: 2, name: "Alfa" });
  await openFromTree("Gamma");
  expect(forward()).toBeDisabled();
  await userEvent.click(back());
  // La entrada «Beta» se descartó: tras Gamma, atrás va a Alfa.
  expect(await screen.findByRole("heading", { level: 2, name: "Alfa" })).toBeInTheDocument();
  expect(back()).toBeDisabled();
});

test("historial: una nota borrada se salta (RF-058)", async () => {
  const { value, notes } = await historySetup();
  await openFromTree("Alfa");
  await openFromTree("Beta");
  await openFromTree("Gamma");
  const beta = await value.notes.get(notes[1].id);
  await value.notes.softDelete(beta.id, beta.rev);
  await userEvent.click(back());
  expect(await screen.findByRole("heading", { level: 2, name: "Alfa" })).toBeInTheDocument();
});

test("historial: una nota renombrada sigue siendo navegable por su id (RF-058)", async () => {
  const { value, notes } = await historySetup();
  await openFromTree("Alfa");
  await openFromTree("Beta");
  const alfa = await value.notes.get(notes[0].id);
  await value.notes.rename(alfa.id, "Alfa renombrada.md", alfa.rev);
  await userEvent.click(back());
  expect(await screen.findByRole("heading", { level: 2, name: "Alfa renombrada" })).toBeInTheDocument();
});

test("historial: con borrador sucio Atrás muestra el aviso y «Seguir editando» conserva nota, borrador y posición (RF-060)", async () => {
  await historySetup();
  await openFromTree("Alfa");
  await openFromTree("Beta");
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  await userEvent.click(screen.getByRole("button", { name: "Código" }));
  const view = EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement)!;
  act(() => view.dispatch({ changes: { from: 0, insert: "borrador" } }));
  await screen.findByText("Cambios sin guardar");

  await userEvent.click(back());
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Seguir editando" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
  expect(view.state.doc.toString()).toContain("borrador");
  expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
  // La posición no se movió: Atrás sigue disponible, Adelante no, y el foco vuelve al botón.
  expect(back()).toBeEnabled();
  expect(forward()).toBeDisabled();
  await waitFor(() => expect(back()).toHaveFocus());
  // «Descartar y abrir» sí navega.
  await userEvent.click(back());
  await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Descartar y abrir" }));
  expect(await screen.findByRole("heading", { level: 2, name: "Alfa" })).toBeInTheDocument();
  expect(forward()).toBeEnabled();
});

test("historial: Alt+← y Alt+→ fuera de un editor navegan y evitan la navegación del navegador (RF-059)", async () => {
  await historySetup();
  await openFromTree("Alfa");
  await openFromTree("Beta");
  const tree = screen.getByRole("tree", { name: "Notas" });
  expect(fireEvent.keyDown(tree, { key: "ArrowLeft", altKey: true })).toBe(false);
  expect(await screen.findByRole("heading", { level: 2, name: "Alfa" })).toBeInTheDocument();
  expect(fireEvent.keyDown(tree, { key: "ArrowRight", altKey: true })).toBe(false);
  expect(await screen.findByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
  // Sin Alt, o con otro modificador, no hace nada.
  expect(fireEvent.keyDown(tree, { key: "ArrowLeft" })).toBe(true);
  expect(fireEvent.keyDown(tree, { key: "ArrowLeft", altKey: true, ctrlKey: true })).toBe(true);
});

test("historial: Alt+← dentro de un editor en edición no navega (RF-059)", async () => {
  await historySetup();
  await openFromTree("Alfa");
  await openFromTree("Beta");
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  await userEvent.click(screen.getByRole("button", { name: "Código" }));
  const content = document.querySelector(".cm-content") as HTMLElement;
  // CodeMirror usa Alt+← para moverse por palabras: el atajo del historial no interviene.
  fireEvent.keyDown(content, { key: "ArrowLeft", altKey: true });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
  expect(back()).toBeEnabled();
});

test("historial: se conserva al volver a montar con el mismo sessionStorage y es por bóveda (RF-057)", async () => {
  const { value, vault, unmount } = await historySetup(["Alfa", "Beta"]);
  await openFromTree("Alfa");
  await openFromTree("Beta");
  unmount();
  // Misma pestaña (sessionStorage): al reabrir Beta el historial recuerda a Alfa.
  render(tree(value, `/vaults/${vault.id}`));
  await openFromTree("Beta");
  expect(back()).toBeEnabled();
  await userEvent.click(back());
  expect(await screen.findByRole("heading", { level: 2, name: "Alfa" })).toBeInTheDocument();
  // Otra bóveda, otro historial.
  expect(sessionStorage.getItem(`synapse:note-history:${vault.id}`)).not.toBeNull();
  expect(Object.keys(sessionStorage).filter((key) => key.startsWith("synapse:note-history:"))).toEqual([`synapse:note-history:${vault.id}`]);
});
