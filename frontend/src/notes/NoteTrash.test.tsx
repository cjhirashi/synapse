// Papelera de notas de una bóveda (SPEC-0008 RF-010, RF-017).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { memoryDb, syncValue, WithSync } from "../test-utils/sync";
import type { SyncContextValue } from "../sync/useSync";
import { PATH_TAKEN } from "./messages";
import NoteTrash from "./NoteTrash";

const VAULT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

/** Siembra `paths` en la bóveda y manda a la papelera las de `trashed`. */
async function setup(paths: string[], trashed: string[], otherTrashed: string[] = []) {
  const { value } = syncValue({}, memoryDb());
  for (const path of paths) {
    const note = await value.notes.create(VAULT, path);
    if (trashed.includes(note.path)) await value.notes.softDelete(note.id, note.rev);
  }
  for (const path of otherTrashed) {
    const note = await value.notes.create(OTHER, path);
    await value.notes.softDelete(note.id, note.rev);
  }
  const onRestored = vi.fn();
  const onClose = vi.fn();
  const ui = (v: SyncContextValue) => (
    <WithSync value={v}>
      <NoteTrash vaultId={VAULT} onRestored={onRestored} onClose={onClose} />
    </WithSync>
  );
  const utils = render(ui(value));
  await waitFor(() => expect(screen.queryByText("Cargando…")).toBeNull());
  return { ...utils, ui, value, onRestored, onClose, user: userEvent.setup() };
}

test("RF-010: lista sólo las notas borradas de esta bóveda", async () => {
  await setup(["Viva.md", "Muerta.md"], ["Muerta.md"], ["Ajena.md"]);
  const list = await screen.findByRole("list", { name: "Notas borradas" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  expect(within(list).getByText("Muerta.md")).toBeInTheDocument();
  expect(screen.queryByText("Ajena.md")).toBeNull();
  expect(screen.queryByText("Viva.md")).toBeNull();
});

test("RF-010: sin notas borradas muestra un texto", async () => {
  await setup(["Viva.md"], []);
  expect(await screen.findByText("La papelera de esta bóveda está vacía.")).toBeInTheDocument();
});

test("RF-017: «Restaurar» devuelve la nota al árbol y sale de la papelera", async () => {
  const { user, value, onRestored } = await setup(["Muerta.md"], ["Muerta.md"]);
  await user.click(await screen.findByRole("button", { name: "Restaurar «Muerta.md»" }));
  await waitFor(() => expect(screen.queryByText("Muerta.md")).toBeNull());
  const [active] = await value.notes.list(VAULT);
  expect(active.path).toBe("Muerta.md");
  expect(onRestored).toHaveBeenCalledWith(active.id);
});

test("RF-017, RF-013: con la ruta ocupada muestra el mensaje y la nota sigue en la papelera", async () => {
  const { user, value } = await setup(["Misma.md"], ["Misma.md"]);
  await value.notes.create(VAULT, "misma");
  await user.click(await screen.findByRole("button", { name: "Restaurar «Misma.md»" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(PATH_TAKEN);
  expect(screen.getByText("Misma.md")).toBeInTheDocument();
  expect(await value.notes.list(VAULT, { deleted: true })).toHaveLength(1);
});

test("RF-010: se relee con notesVersion y «Volver» llama a onClose", async () => {
  const { user, value, rerender, ui, onClose } = await setup(["A.md"], []);
  const note = (await value.notes.list(VAULT))[0];
  await value.notes.softDelete(note.id, note.rev);
  rerender(ui({ ...value, notesVersion: 1 }));
  expect(await screen.findByText("A.md")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Volver a las notas" }));
  expect(onClose).toHaveBeenCalledOnce();
});

// U-8 (PLAN-0008 §31): al restaurar, el foco no cae a `body` y se anuncia la ruta restaurada.
test("RF-017: restaurar mueve el foco al siguiente «Restaurar» y anuncia la ruta", async () => {
  const { user } = await setup(["A.md", "B.md", "C.md"], ["A.md", "B.md", "C.md"]);
  await user.click(await screen.findByRole("button", { name: "Restaurar «B.md»" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Restaurar «C.md»" })).toHaveFocus());
  expect(screen.getByRole("status")).toHaveTextContent("Restaurada «B.md»");
});

test("RF-017: si no hay siguiente el foco va al «Restaurar» anterior", async () => {
  const { user } = await setup(["A.md", "B.md"], ["A.md", "B.md"]);
  await user.click(await screen.findByRole("button", { name: "Restaurar «B.md»" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Restaurar «A.md»" })).toHaveFocus());
});

test("RF-017: si no queda ninguna, el foco va a «Volver a las notas»", async () => {
  const { user } = await setup(["Sola.md"], ["Sola.md"]);
  await user.click(await screen.findByRole("button", { name: "Restaurar «Sola.md»" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Volver a las notas" })).toHaveFocus());
  expect(screen.getByRole("status")).toHaveTextContent("Restaurada «Sola.md»");
});

// U-9 (PLAN-0008 §32): si restaurar falla, el foco vuelve al «Restaurar» de la misma fila (que sigue existiendo).
test("RF-017, RF-013: con la ruta ocupada el foco vuelve al «Restaurar» de esa fila", async () => {
  const { user, value } = await setup(["Misma.md"], ["Misma.md"]);
  await value.notes.create(VAULT, "misma"); // otra nota activa ocupa la ruta
  await user.click(await screen.findByRole("button", { name: "Restaurar «Misma.md»" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(PATH_TAKEN);
  await waitFor(() => expect(screen.getByRole("button", { name: "Restaurar «Misma.md»" })).toHaveFocus());
});
