// Sidebar con el árbol de notas de la bóveda (SPEC-0008 RF-003, RF-010…RF-013, RF-019).
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { memoryDb, syncValue, WithSync } from "../test-utils/sync";
import type { SyncContextValue } from "../sync/useSync";
import { PATH_INVALID, PATH_TAKEN } from "./messages";
import NoteSidebar from "./NoteSidebar";
import { waitForCondition } from "../test-utils/waits";

const VAULT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

async function setup(paths: string[] = []) {
  const { value } = syncValue({}, memoryDb());
  for (const path of paths) await value.notes.create(VAULT, path);
  const onOpen = vi.fn();
  const onDeleted = vi.fn();
  const onShowTrash = vi.fn();
  const ui = (v: SyncContextValue, openId: string | null = null) => (
    <WithSync value={v}>
      <MemoryRouter>
        <NoteSidebar vaultId={VAULT} openId={openId} onOpen={onOpen} onDeleted={onDeleted} onShowTrash={onShowTrash} />
      </MemoryRouter>
    </WithSync>
  );
  const utils = render(ui(value));
  // La primera lectura del árbol termina antes de que la prueba actúe (sin avisos de `act`).
  await waitFor(() => expect(screen.queryByText("Cargando…")).toBeNull());
  return { ...utils, ui, value, onOpen, onDeleted, onShowTrash, user: userEvent.setup() };
}

test("RF-019: árbol role=tree con las carpetas plegadas; se despliegan al pulsarlas", async () => {
  const { user } = await setup(["Raíz.md", "Carpeta/Sub/Hoja.md", "Carpeta/Otra.md"]);
  const tree = await screen.findByRole("tree", { name: "Notas" });
  expect(within(tree).getByRole("treeitem", { name: "Raíz" })).toBeInTheDocument();
  const folder = within(tree).getByRole("treeitem", { name: "Carpeta" });
  expect(folder).toHaveAttribute("aria-expanded", "false");
  expect(within(tree).queryByRole("treeitem", { name: "Otra" })).toBeNull();
  await user.click(folder);
  expect(folder).toHaveAttribute("aria-expanded", "true");
  expect(within(tree).getByRole("treeitem", { name: "Otra" })).toBeInTheDocument();
  await user.click(within(tree).getByRole("treeitem", { name: "Sub" }));
  expect(within(tree).getByRole("treeitem", { name: "Hoja" })).toBeInTheDocument();
  await user.click(folder);
  expect(within(tree).queryByRole("treeitem", { name: "Otra" })).toBeNull();
});

test("RF-001: sólo las notas de la bóveda; sin notas muestra un texto", async () => {
  const { value } = await setup();
  await value.notes.create(OTHER, "Ajena");
  expect(await screen.findByText("Esta bóveda aún no tiene notas.")).toBeInTheDocument();
  expect(screen.queryByRole("treeitem", { name: "Ajena" })).toBeNull();
});

test("RF-019: un click en una nota la abre en lectura (onOpen con sólo el id) y la marca", async () => {
  const { user, onOpen, value, rerender, ui } = await setup(["Hola.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Hola" }));
  const [{ id }] = await value.notes.list(VAULT);
  expect(onOpen).toHaveBeenCalledWith(id);
  expect(onOpen.mock.calls[0]).toHaveLength(1);
  rerender(ui(value, id));
  expect(await screen.findByRole("treeitem", { name: "Hola" })).toHaveAttribute("aria-selected", "true");
});

test("RF-012, RF-003: «Nueva nota» sin título crea «Sin título», «Sin título 2»… y la abre en edición", async () => {
  const { user, onOpen, value } = await setup();
  await user.click(screen.getByRole("button", { name: "Nueva nota" }));
  expect(await screen.findByRole("treeitem", { name: "Sin título" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Nueva nota" }));
  expect(await screen.findByRole("treeitem", { name: "Sin título 2" })).toBeInTheDocument();
  const byPath = new Map((await value.notes.list(VAULT)).map((n) => [n.path, n.id]));
  expect(onOpen).toHaveBeenNthCalledWith(1, byPath.get("Sin título.md"), { edit: true });
  expect(onOpen).toHaveBeenNthCalledWith(2, byPath.get("Sin título 2.md"), { edit: true });
});

test("RF-003: «Nueva nota» con título lo usa como ruta (con .md) y vacía el campo", async () => {
  const { user, value } = await setup();
  const title = screen.getByRole("textbox", { name: "Título de la nota nueva (opcional)" });
  await user.type(title, "Ideas");
  await user.click(screen.getByRole("button", { name: "Nueva nota" }));
  expect(await screen.findByRole("treeitem", { name: "Ideas" })).toBeInTheDocument();
  expect((await value.notes.list(VAULT)).map((n) => n.path)).toEqual(["Ideas.md"]);
  expect(title).toHaveValue("");
});

test("RF-013: crear con una ruta ocupada muestra el mensaje y no crea nada", async () => {
  const { user, value } = await setup(["Ideas.md"]);
  await user.type(screen.getByRole("textbox", { name: "Título de la nota nueva (opcional)" }), "ideas");
  await user.click(screen.getByRole("button", { name: "Nueva nota" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(PATH_TAKEN);
  expect(await value.notes.list(VAULT)).toHaveLength(1);
});

test("RF-003: un título inválido muestra el mensaje de ruta", async () => {
  const { user } = await setup();
  await user.type(screen.getByRole("textbox", { name: "Título de la nota nueva (opcional)" }), "a//b");
  await user.click(screen.getByRole("button", { name: "Nueva nota" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(PATH_INVALID);
});

test("RF-011: renombrar/mover edita la ruta completa y el árbol lo refleja, con el mismo id", async () => {
  const { user, value } = await setup(["Raíz.md"]);
  const [{ id }] = await value.notes.list(VAULT);
  await user.click(await screen.findByRole("treeitem", { name: "Raíz" }));
  await user.click(screen.getByRole("button", { name: "Renombrar «Raíz»" }));
  const input = screen.getByRole("textbox", { name: "Ruta de la nota" });
  expect(input).toHaveValue("Raíz.md");
  await user.clear(input);
  await user.click(input);
  await user.paste("Carpeta/Movida.md"); // un solo evento en vez de 17 pulsaciones (menos trabajo bajo carga)
  await user.click(screen.getByRole("button", { name: "Guardar ruta" }));
  // La carpeta de destino se despliega sola para que la nota movida reciba el foco (C-5).
  expect(await screen.findByRole("treeitem", { name: "Carpeta" })).toHaveAttribute("aria-expanded", "true");
  expect(await screen.findByRole("treeitem", { name: "Movida" })).toBeInTheDocument();
  expect(screen.queryByRole("treeitem", { name: "Raíz" })).toBeNull();
  expect((await value.notes.get(id)).path).toBe("Carpeta/Movida.md");
});

test("RF-013: renombrar a una ruta ocupada muestra el mensaje y conserva el nombre", async () => {
  const { user, value } = await setup(["Uno.md", "Dos.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Dos" }));
  await user.click(screen.getByRole("button", { name: "Renombrar «Dos»" }));
  const input = screen.getByRole("textbox", { name: "Ruta de la nota" });
  await user.clear(input);
  await user.type(input, "uno.MD");
  await user.click(screen.getByRole("button", { name: "Guardar ruta" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(PATH_TAKEN);
  expect((await value.notes.list(VAULT)).map((n) => n.path)).toEqual(["Dos.md", "Uno.md"]);
});

test("RF-011: «Cancelar» cierra el renombrado sin escribir", async () => {
  const { user, value } = await setup(["Uno.md"]);
  const rename = vi.spyOn(value.notes, "rename");
  await user.click(await screen.findByRole("treeitem", { name: "Uno" }));
  await user.click(screen.getByRole("button", { name: "Renombrar «Uno»" }));
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("textbox", { name: "Ruta de la nota" })).toBeNull();
  expect(rename).not.toHaveBeenCalled();
});

test("RF-010: borrar quita la nota del árbol, avisa al padre y la deja en la papelera", async () => {
  const { user, value, onDeleted } = await setup(["Uno.md", "Dos.md"]);
  const uno = (await value.notes.list(VAULT)).find((n) => n.path === "Uno.md")!;
  await user.click(await screen.findByRole("treeitem", { name: "Uno" }));
  await user.click(screen.getByRole("button", { name: "Borrar «Uno»" }));
  await waitForCondition(() => expect(screen.queryByRole("treeitem", { name: "Uno" })).toBeNull());
  expect(screen.getByRole("treeitem", { name: "Dos" })).toBeInTheDocument();
  expect(onDeleted).toHaveBeenCalledWith(uno.id);
  expect((await value.notes.list(VAULT, { deleted: true })).map((n) => n.id)).toEqual([uno.id]);
});

test("RF-019: se relee cuando cambia notesVersion", async () => {
  const { value, rerender, ui } = await setup(["Uno.md"]);
  await screen.findByRole("treeitem", { name: "Uno" });
  await value.notes.create(VAULT, "Llegó");
  rerender(ui({ ...value, notesVersion: 1 }));
  expect(await screen.findByRole("treeitem", { name: "Llegó" })).toBeInTheDocument();
});

test("RF-010: el enlace a la papelera de la bóveda llama a onShowTrash", async () => {
  const { user, onShowTrash } = await setup();
  await user.click(screen.getByRole("button", { name: "Papelera de la bóveda" }));
  expect(onShowTrash).toHaveBeenCalledOnce();
});

test("RF-019: la carpeta de la nota abierta se despliega sola", async () => {
  const { value, rerender, ui } = await setup(["Carpeta/Sub/Hoja.md", "Otra/X.md"]);
  await screen.findByRole("treeitem", { name: "Carpeta" });
  const hoja = (await value.notes.list(VAULT)).find((n) => n.path.endsWith("Hoja.md"))!;
  rerender(ui(value, hoja.id));
  expect(await screen.findByRole("treeitem", { name: "Hoja" })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("treeitem", { name: "X" })).toBeNull();
});

// VF-9: el árbol anuncia role="tree", así que responde al teclado del patrón WAI-ARIA.
test("RF-019: roving tabindex, un solo treeitem tabulable y el foco lo sigue", async () => {
  const { user } = await setup(["Carpeta/Otra.md", "Raíz.md"]);
  const items = () => within(screen.getByRole("tree", { name: "Notas" })).getAllByRole("treeitem");
  expect(items().filter((item) => item.getAttribute("tabindex") === "0")).toHaveLength(1);
  expect(items()[0]).toHaveAttribute("tabindex", "0");
  act(() => items()[0].focus());
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("treeitem", { name: "Raíz" })).toHaveFocus();
  expect(items().filter((item) => item.getAttribute("tabindex") === "0")).toEqual([screen.getByRole("treeitem", { name: "Raíz" })]);
});

test("RF-019: ↑/↓ recorren los elementos visibles y Inicio/Fin saltan a los extremos", async () => {
  const { user } = await setup(["Carpeta/Otra.md", "Raíz.md", "Zeta.md"]);
  act(() => screen.getByRole("treeitem", { name: "Carpeta" }).focus());
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("treeitem", { name: "Raíz" })).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("treeitem", { name: "Zeta" })).toHaveFocus();
  await user.keyboard("{ArrowDown}"); // en el último no pasa nada
  expect(screen.getByRole("treeitem", { name: "Zeta" })).toHaveFocus();
  await user.keyboard("{ArrowUp}");
  expect(screen.getByRole("treeitem", { name: "Raíz" })).toHaveFocus();
  await user.keyboard("{Home}");
  expect(screen.getByRole("treeitem", { name: "Carpeta" })).toHaveFocus();
  await user.keyboard("{End}");
  expect(screen.getByRole("treeitem", { name: "Zeta" })).toHaveFocus();
});

test("RF-019: → abre la carpeta y baja al primer hijo; ← cierra o sube al padre", async () => {
  const { user } = await setup(["Carpeta/Sub/Hoja.md", "Carpeta/Otra.md"]);
  const folder = screen.getByRole("treeitem", { name: "Carpeta" });
  act(() => folder.focus());
  await user.keyboard("{ArrowRight}");
  expect(folder).toHaveAttribute("aria-expanded", "true");
  expect(folder).toHaveFocus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("treeitem", { name: "Sub" })).toHaveFocus(); // carpetas antes que notas
  await user.keyboard("{ArrowLeft}"); // Sub está cerrada: sube al padre
  expect(folder).toHaveFocus();
  await user.keyboard("{ArrowLeft}"); // Carpeta abierta: la cierra
  expect(folder).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("treeitem", { name: "Otra" })).toBeNull();
});

test("RF-019: en una nota, → no hace nada, ← sube a su carpeta y Enter la abre", async () => {
  const { user, value, onOpen } = await setup(["Carpeta/Otra.md"]);
  const folder = screen.getByRole("treeitem", { name: "Carpeta" });
  await user.click(folder);
  const note = screen.getByRole("treeitem", { name: "Otra" });
  act(() => note.focus());
  await user.keyboard("{ArrowRight}");
  expect(note).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(onOpen).toHaveBeenCalledWith((await value.notes.list(VAULT))[0].id);
  await user.keyboard("{ArrowLeft}");
  expect(folder).toHaveFocus();
  expect(folder).toHaveAttribute("aria-expanded", "true");
});

// C-1, C-2, C-4 (PLAN-0008 §14): las acciones salen del árbol; una barra siempre visible las ofrece
// para la nota seleccionada y F2/Supr las atajan desde el treeitem enfocado.
test("RF-019: el árbol sólo contiene treeitems (una parada de Tab); sin botones de acción dentro", async () => {
  await setup(["Uno.md", "Dos.md"]);
  const tree = await screen.findByRole("tree", { name: "Notas" });
  expect(tree.querySelectorAll('button:not([role="treeitem"]), input, form')).toHaveLength(0);
});

test("RF-011, RF-010: «Renombrar»/«Borrar» de la nota seleccionada están en una barra fuera del árbol", async () => {
  const { user } = await setup(["Uno.md", "Dos.md"]);
  expect(screen.queryByRole("toolbar", { name: "Acciones de la nota" })).toBeNull();
  await user.click(await screen.findByRole("treeitem", { name: "Uno" }));
  const bar = screen.getByRole("toolbar", { name: "Acciones de la nota" });
  expect(screen.getByRole("tree", { name: "Notas" })).not.toContainElement(bar);
  expect(within(bar).getByRole("button", { name: "Renombrar «Uno»" })).toBeInTheDocument();
  expect(within(bar).getByRole("button", { name: "Borrar «Uno»" })).toBeInTheDocument();
});

test("RF-011: F2 en un treeitem de nota abre el renombrado de esa nota", async () => {
  const { user } = await setup(["Uno.md", "Dos.md"]);
  (await screen.findByRole("treeitem", { name: "Dos" })).focus();
  await user.keyboard("{F2}");
  expect(screen.getByRole("textbox", { name: "Ruta de la nota" })).toHaveValue("Dos.md");
});

test("RF-010: Supr en un treeitem de nota la manda a la papelera y avisa al padre", async () => {
  const { user, value, onDeleted } = await setup(["Uno.md", "Dos.md"]);
  const uno = (await value.notes.list(VAULT)).find((n) => n.path === "Uno.md")!;
  (await screen.findByRole("treeitem", { name: "Uno" })).focus();
  await user.keyboard("{Delete}");
  await waitForCondition(() => expect(onDeleted).toHaveBeenCalledWith(uno.id));
  expect(screen.queryByRole("treeitem", { name: "Uno" })).toBeNull();
});

// C-5, C-6 (PLAN-0008 §15): el foco nunca cae a `body` y los atajos comparten la guarda `busy`.
test("RF-019, RF-010: tras borrar con Supr el foco va a la fila siguiente", async () => {
  const { user } = await setup(["A.md", "B.md", "C.md"]);
  (await screen.findByRole("treeitem", { name: "B" })).focus();
  await user.keyboard("{Delete}");
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "C" })).toHaveFocus());
});

test("RF-019, RF-010: si no hay siguiente, el foco va a la fila anterior", async () => {
  const { user } = await setup(["A.md", "B.md"]);
  (await screen.findByRole("treeitem", { name: "B" })).focus();
  await user.keyboard("{Delete}");
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "A" })).toHaveFocus());
});

test("RF-019, RF-010: si no queda ninguna fila, el foco va a «Nueva nota» (botón Borrar)", async () => {
  const { user } = await setup(["Sola.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Sola" }));
  await user.click(screen.getByRole("button", { name: "Borrar «Sola»" }));
  await waitForCondition(() => expect(screen.getByRole("button", { name: "Nueva nota" })).toHaveFocus());
});

test("RF-019, RF-011: tras guardar o cancelar el renombrado el foco vuelve al treeitem de la nota", async () => {
  const { user } = await setup(["Uno.md"]);
  (await screen.findByRole("treeitem", { name: "Uno" })).focus();
  await user.keyboard("{F2}");
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "Uno" })).toHaveFocus());
  await user.keyboard("{F2}");
  const input = screen.getByRole("textbox", { name: "Ruta de la nota" });
  await user.clear(input);
  await user.type(input, "Dos.md");
  await user.click(screen.getByRole("button", { name: "Guardar ruta" }));
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "Dos" })).toHaveFocus());
});

test("RF-010: dos Supr seguidos sobre la misma nota sólo la borran una vez (guarda busy)", async () => {
  const { value } = await setup(["Uno.md", "Dos.md"]);
  const softDelete = vi.spyOn(value.notes, "softDelete");
  const row = await screen.findByRole("treeitem", { name: "Uno" });
  row.focus();
  fireEvent.keyDown(row, { key: "Delete" });
  fireEvent.keyDown(row, { key: "Delete" });
  await waitForCondition(() => expect(screen.queryByRole("treeitem", { name: "Uno" })).toBeNull());
  expect(softDelete).toHaveBeenCalledTimes(1);
});

// H1 (PLAN-0008 §16): el vecino se calcula sobre el árbol resultante, sin las carpetas que queden vacías.
test("RF-019, RF-010: al borrar la única nota de una carpeta el foco va a la fila que sigue, no a la carpeta que desaparece", async () => {
  const { user } = await setup(["Carpeta/Sola.md", "Otra.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Carpeta" }));
  (await screen.findByRole("treeitem", { name: "Sola" })).focus();
  await user.keyboard("{Delete}");
  await waitForCondition(() => expect(screen.queryByRole("treeitem", { name: "Carpeta" })).toBeNull());
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "Otra" })).toHaveFocus());
});

test("RF-019, RF-010: si la nota borrada era la última fila y su carpeta se vacía, el foco va a la fila anterior que sobrevive", async () => {
  const { user } = await setup(["Zeta/Sola.md", "Alfa/Otra.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Zeta" }));
  (await screen.findByRole("treeitem", { name: "Sola" })).focus();
  await user.keyboard("{Delete}");
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "Alfa" })).toHaveFocus());
});

test("RF-019, RF-010: la carpeta que reaparece al crear otra nota no le roba el foco al usuario", async () => {
  const { user } = await setup(["Carpeta/Sola.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Carpeta" }));
  (await screen.findByRole("treeitem", { name: "Sola" })).focus();
  await user.keyboard("{Delete}");
  await waitForCondition(() => expect(screen.getByRole("button", { name: "Nueva nota" })).toHaveFocus());
  await user.type(screen.getByRole("textbox", { name: "Título de la nota nueva (opcional)" }), "Carpeta/Nueva");
  await user.click(screen.getByRole("button", { name: "Nueva nota" }));
  await screen.findByRole("treeitem", { name: "Carpeta" });
  expect(screen.getByRole("button", { name: "Nueva nota" })).toHaveFocus();
});

// U-3 (PLAN-0008 §17)
test("RF-011, RF-019: Escape cancela el renombrado sin escribir y devuelve el foco al treeitem", async () => {
  const { user, value } = await setup(["Uno.md"]);
  const rename = vi.spyOn(value.notes, "rename");
  (await screen.findByRole("treeitem", { name: "Uno" })).focus();
  await user.keyboard("{F2}");
  expect(screen.getByRole("textbox", { name: "Ruta de la nota" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("textbox", { name: "Ruta de la nota" })).toBeNull();
  expect(rename).not.toHaveBeenCalled();
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "Uno" })).toHaveFocus());
});
