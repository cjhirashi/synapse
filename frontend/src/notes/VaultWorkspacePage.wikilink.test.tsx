// H-012: navegación y creación al hacer clic en un wikilink (C-1, C-3). El `Workspace` recibe el clic de
// la vista (vía `NoteEditor.onOpenWikilink`) y decide: resuelto → abre esa nota en Lectura; roto sin
// extensión → crea la nota en la raíz y la abre en edición; roto con extensión ajena → no hace nada.
// Se usa un `NoteEditor` FALSO que expone el callback: el cableado real vista→editor→Workspace y la
// lectura de la marca ya se prueban en MilkdownView.test.tsx y NoteEditor.test.tsx.
import { forwardRef, useEffect, useImperativeHandle } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { DataMemoryRouter } from "../test-utils/router";
import { afterEach, expect, test, vi } from "vitest";
import { memoryDb, seedStore, syncValue, WithSync } from "../test-utils/sync";
import type { SyncContextValue } from "../sync/useSync";
import VaultWorkspacePage from "./VaultWorkspacePage";

// En jsdom no hay Worker: `createParseWorkspace` se sustituye por `null` (el editor falso no lo usa).
vi.mock("./parseWorkspace", () => ({ createParseWorkspace: () => null }));

// El precargador en idle corre de inmediato en la prueba.
vi.mock("../editor/deferred/idle", () => ({
  whenIdle: (run: () => void) => {
    run();
    return () => {};
  },
  observeVisibility: (_el: Element, onChange: (visible: boolean) => void) => {
    onChange(true);
    return () => {};
  },
}));

/** Captura del último `onOpenWikilink` y props que el `Workspace` pasó al editor, para dirigir la prueba. */
const editorSpy = vi.hoisted(() => ({
  onOpenWikilink: null as null | ((link: { resolvedId: string | null; target: string }) => void),
  noteId: null as string | null,
  editOnOpen: false,
}));

// Editor falso: expone `onOpenWikilink` y pinta el id y el modo con que el `Workspace` lo abrió.
vi.mock("../editor/NoteEditor", () => ({
  default: forwardRef(function FakeEditor(
    props: { noteId: string; editOnOpen?: boolean; onOpened?: (id: string, path: string) => void; onOpenWikilink?: (link: { resolvedId: string | null; target: string }) => void },
    ref: React.Ref<{ confirmDiscard: () => Promise<boolean> }>,
  ) {
    editorSpy.onOpenWikilink = props.onOpenWikilink ?? null;
    editorSpy.noteId = props.noteId;
    editorSpy.editOnOpen = props.editOnOpen ?? false;
    useImperativeHandle(ref, () => ({ confirmDiscard: () => Promise.resolve(true) }));
    useEffect(() => {
      props.onOpened?.(props.noteId, props.noteId);
    }, [props.noteId]);
    return (
      <div>
        <p data-testid="open-id">{props.noteId}</p>
        <p data-testid="open-mode">{props.editOnOpen ? "edit" : "read"}</p>
      </div>
    );
  }),
}));

afterEach(() => {
  sessionStorage.clear();
  editorSpy.onOpenWikilink = null;
  editorSpy.noteId = null;
  editorSpy.editOnOpen = false;
});

function tree(value: SyncContextValue, path: string, state?: unknown) {
  return (
    <WithSync value={value}>
      <DataMemoryRouter initialEntries={[{ pathname: path, state }]}>
        <Routes>
          <Route path="/vaults/:id" element={<VaultWorkspacePage />} />
          <Route path="/vaults" element={<div>lista de bóvedas</div>} />
        </Routes>
      </DataMemoryRouter>
    </WithSync>
  );
}

/** Crea la bóveda, una nota destino y una nota de origen ya abierta en el workspace. */
async function setup() {
  const { value, db } = syncValue({}, memoryDb());
  const vault = await seedStore(db).create({ name: "Trabajo", description: null, tags: [] });
  const target = await value.notes.create(vault.id, "Nota A");
  const source = await value.notes.create(vault.id, "Origen");
  render(tree(value, `/vaults/${vault.id}`, { noteId: source.id }));
  await waitFor(() => expect(screen.getByTestId("open-id")).toHaveTextContent(source.id));
  return { value, vault, target, source };
}

test("C-1: clic en wikilink resuelto abre esa nota en Lectura", async () => {
  const { target } = await setup();
  act(() => editorSpy.onOpenWikilink!({ resolvedId: target.id, target: "Nota A" }));
  await waitFor(() => expect(screen.getByTestId("open-id")).toHaveTextContent(target.id));
  expect(screen.getByTestId("open-mode")).toHaveTextContent("read");
});

test("C-3: clic en wikilink roto sin extensión crea la nota en la raíz y la abre en edición", async () => {
  const { value, vault, source } = await setup();
  act(() => editorSpy.onOpenWikilink!({ resolvedId: null, target: "Nota Nueva" }));
  // Se abre una nota distinta de la de origen, en edición.
  await waitFor(() => expect(screen.getByTestId("open-id")).not.toHaveTextContent(source.id));
  expect(screen.getByTestId("open-mode")).toHaveTextContent("edit");
  // Y existe de verdad en la raíz con ese nombre.
  const created = (await value.notes.list(vault.id)).find((n) => n.path === "Nota Nueva.md");
  expect(created).toBeDefined();
  expect(screen.getByTestId("open-id")).toHaveTextContent(created!.id);
});

test("C-3: clic en wikilink roto con extensión ajena (.docx) no hace nada", async () => {
  const { value, vault, source } = await setup();
  const before = (await value.notes.list(vault.id)).length;
  act(() => editorSpy.onOpenWikilink!({ resolvedId: null, target: "informe.docx" }));
  // Espera justificada: se afirma una ausencia (ni navegación ni creación); 50 ms basta tras el microtask.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.getByTestId("open-id")).toHaveTextContent(source.id);
  expect((await value.notes.list(vault.id)).length).toBe(before);
});
