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
  const { user } = await setup(["Inicio.md", "Carpeta/Sub/Hoja.md", "Carpeta/Otra.md"]);
  const tree = await screen.findByRole("tree", { name: "Notas" });
  expect(within(tree).getByRole("treeitem", { name: "Inicio" })).toBeInTheDocument();
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
  const { user, value } = await setup(["Inicio.md"]);
  const [{ id }] = await value.notes.list(VAULT);
  await user.click(await screen.findByRole("treeitem", { name: "Inicio" }));
  await user.click(screen.getByRole("button", { name: "Renombrar «Inicio»" }));
  const input = screen.getByRole("textbox", { name: "Ruta de la nota" });
  expect(input).toHaveValue("Inicio.md");
  await user.clear(input);
  await user.click(input);
  await user.paste("Carpeta/Movida.md"); // un solo evento en vez de 17 pulsaciones (menos trabajo bajo carga)
  await user.click(screen.getByRole("button", { name: "Guardar ruta" }));
  // La carpeta de destino se despliega sola para que la nota movida reciba el foco (C-5).
  expect(await screen.findByRole("treeitem", { name: "Carpeta" })).toHaveAttribute("aria-expanded", "true");
  expect(await screen.findByRole("treeitem", { name: "Movida" })).toBeInTheDocument();
  expect(screen.queryByRole("treeitem", { name: "Inicio" })).toBeNull();
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
  const { user } = await setup(["Carpeta/Otra.md", "Inicio.md"]);
  const items = () => within(screen.getByRole("tree", { name: "Notas" })).getAllByRole("treeitem");
  expect(items().filter((item) => item.getAttribute("tabindex") === "0")).toHaveLength(1);
  expect(items()[0]).toHaveAttribute("tabindex", "0");
  // SPEC-0010 RF-041: la fila «Raíz» es ahora el primer treeitem; ↓ baja a la primera carpeta.
  expect(items()[0]).toHaveAccessibleName("Raíz");
  act(() => items()[0].focus());
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("treeitem", { name: "Carpeta" })).toHaveFocus();
  expect(items().filter((item) => item.getAttribute("tabindex") === "0")).toEqual([screen.getByRole("treeitem", { name: "Carpeta" })]);
});

test("RF-019: ↑/↓ recorren los elementos visibles y Inicio/Fin saltan a los extremos", async () => {
  const { user } = await setup(["Carpeta/Otra.md", "Inicio.md", "Zeta.md"]);
  act(() => screen.getByRole("treeitem", { name: "Carpeta" }).focus());
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("treeitem", { name: "Inicio" })).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("treeitem", { name: "Zeta" })).toHaveFocus();
  await user.keyboard("{ArrowDown}"); // en el último no pasa nada
  expect(screen.getByRole("treeitem", { name: "Zeta" })).toHaveFocus();
  await user.keyboard("{ArrowUp}");
  expect(screen.getByRole("treeitem", { name: "Inicio" })).toHaveFocus();
  await user.keyboard("{Home}");
  // SPEC-0010 RF-041: Inicio salta a la fila «Raíz», que ahora abre el árbol.
  expect(screen.getByRole("treeitem", { name: "Raíz" })).toHaveFocus();
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
  // «Carpeta» sigue siendo la carpeta activa (SPEC-0010 RF-043): basta el título relativo «Nueva».
  await user.type(screen.getByRole("textbox", { name: "Título de la nota nueva (opcional)" }), "Nueva");
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

// --- SPEC-0009: estructura de la barra lateral rediseñada (RF-003, RF-004, RF-010) ---

test("RF-003: el formulario «Nueva nota» es un bloque propio, fuera del panel del árbol", async () => {
  const { container } = await setup(["Hola.md"]);
  const form = container.querySelector(".note-sidebar-new")!;
  const panel = container.querySelector<HTMLElement>(".note-tree-panel")!;
  expect(form.tagName).toBe("FORM");
  expect(panel).not.toBeNull();
  expect(panel).not.toContainElement(form as HTMLElement);
  // El árbol (role=tree) vive dentro del panel; los roles y nombres no cambian.
  expect(within(panel).getByRole("tree", { name: "Notas" })).toBeInTheDocument();
  expect(screen.getByLabelText("Título de la nota nueva (opcional)")).toBeInTheDocument();
});

test("RF-004: cada carpeta lleva su ícono (cerrada/abierta) y cada nota el suyo", async () => {
  const { user } = await setup(["Carpeta/Hoja.md", "Inicio.md"]);
  const folder = await screen.findByRole("treeitem", { name: "Carpeta" });
  expect(folder.querySelector('svg[data-icon="folder"]')).not.toBeNull();
  expect(folder.querySelector('svg[data-icon="folder-open"]')).toBeNull();
  expect(screen.getByRole("treeitem", { name: "Inicio" }).querySelector('svg[data-icon="file-text"]')).not.toBeNull();

  await user.click(folder);
  expect(folder.querySelector('svg[data-icon="folder-open"]')).not.toBeNull();
  expect(folder.querySelector('svg[data-icon="folder"]')).toBeNull();
  expect(screen.getByRole("treeitem", { name: "Hoja" }).querySelector('svg[data-icon="file-text"]')).not.toBeNull();
});

test("RF-003: «Papelera de la bóveda» es el pie de la barra, después del árbol", async () => {
  const { container, user, onShowTrash } = await setup(["Hola.md"]);
  const footer = container.querySelector<HTMLElement>(".note-sidebar-footer")!;
  const panel = container.querySelector(".note-tree-panel")!;
  const trash = within(footer).getByRole("button", { name: "Papelera de la bóveda" });
  expect(panel.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await user.click(trash);
  expect(onShowTrash).toHaveBeenCalledOnce();
});

// Inicio del defecto real de 0008 que sólo se ve en un navegador: al enfocar una nota aparecía la barra de
// acciones sobre el árbol, la fila se desplazaba y el clic nunca llegaba a abrirla. La barra va tras el
// panel del árbol, así que seleccionar no mueve ninguna fila.
test("RF-003, RF-007: la barra de acciones de la nota seleccionada va después del panel del árbol", async () => {
  const { container, user } = await setup(["Uno.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Uno" }));
  const bar = screen.getByRole("toolbar", { name: "Acciones de la nota" });
  const panel = container.querySelector(".note-tree-panel")!;
  expect(panel.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(panel).not.toContainElement(bar);
});

test("RF-010: una fila de 120 caracteres conserva el nombre completo en title y el recorte es de CSS", async () => {
  const long = `${"nombre-larguisimo-".repeat(7)}fin`.slice(0, 120);
  expect(long).toHaveLength(120);
  await setup([`${long}.md`]);
  const row = await screen.findByRole("treeitem", { name: long });
  expect(row.querySelector(".note-tree-name")).toHaveAttribute("title", long);
  // El texto no se corta por JS: el elemento lleva el nombre entero y la elipsis la pone `.note-tree-name`.
  expect(row.querySelector(".note-tree-name")).toHaveTextContent(long);
});

// --- SPEC-0010 RF-002, RF-006, RF-043: «Raíz», carpeta activa, «Crear en», «Nueva carpeta» y pista ---------------

const tree = () => screen.getByRole("tree", { name: "Notas" });
const rootRow = () => within(tree()).getByRole("treeitem", { name: "Raíz" });

test("RF-043: «Raíz» es el primer treeitem, sin chevron, y arranca como carpeta activa", async () => {
  await setup(["Carpeta/Hoja.md", "Nota.md"]);
  const items = within(tree()).getAllByRole("treeitem");
  expect(items[0]).toBe(rootRow());
  expect(rootRow()).not.toHaveAttribute("aria-expanded");
  expect(rootRow()).toHaveAttribute("aria-current", "true");
  expect(rootRow().querySelector('svg[data-icon="house"]')).not.toBeNull();
});

test("RF-043: «Raíz» está aunque la bóveda no tenga notas", async () => {
  await setup();
  expect(screen.getByRole("tree", { name: "Notas" })).toBeInTheDocument();
  expect(rootRow()).toHaveAttribute("aria-current", "true");
});

test("RF-002, RF-043: «Crear en» es una región viva que dice la carpeta activa", async () => {
  const { user } = await setup(["Carpeta/Sub/Hoja.md"]);
  const live = () => document.getElementById("note-create-in")!;
  expect(live()).toHaveAttribute("aria-live", "polite");
  expect(live()).toHaveAttribute("aria-atomic", "true");
  expect(live()).toHaveTextContent("Crear en: Raíz");
  await user.click(within(tree()).getByRole("treeitem", { name: "Carpeta" }));
  expect(live()).toHaveTextContent("Crear en: Carpeta");
  await user.click(within(tree()).getByRole("treeitem", { name: "Sub" }));
  expect(live()).toHaveTextContent("Crear en: Carpeta/Sub");
  expect(live().querySelector("strong")).toHaveAttribute("title", "Carpeta/Sub");
});

test("RF-043: pulsar una carpeta la despliega y la marca como activa (aria-current); «Raíz» deja de serlo", async () => {
  const { user } = await setup(["Carpeta/Hoja.md", "Otra/Hoja.md"]);
  const carpeta = within(tree()).getByRole("treeitem", { name: "Carpeta" });
  await user.click(carpeta);
  expect(carpeta).toHaveAttribute("aria-expanded", "true");
  expect(carpeta).toHaveAttribute("aria-current", "true");
  expect(rootRow()).not.toHaveAttribute("aria-current");
  await user.click(within(tree()).getByRole("treeitem", { name: "Otra" }));
  expect(carpeta).not.toHaveAttribute("aria-current");
  await user.click(rootRow());
  expect(rootRow()).toHaveAttribute("aria-current", "true");
  expect(document.getElementById("note-create-in")).toHaveTextContent("Crear en: Raíz");
});

test("RF-043: ←/→ sólo pliegan y despliegan; no cambian la carpeta activa", async () => {
  const { user } = await setup(["Carpeta/Hoja.md"]);
  const carpeta = within(tree()).getByRole("treeitem", { name: "Carpeta" });
  act(() => carpeta.focus());
  await user.keyboard("{ArrowRight}");
  expect(carpeta).toHaveAttribute("aria-expanded", "true");
  expect(carpeta).not.toHaveAttribute("aria-current");
  expect(rootRow()).toHaveAttribute("aria-current", "true");
  await user.keyboard("{Enter}");
  expect(carpeta).toHaveAttribute("aria-current", "true");
});

test("RF-042: al abrir una nota la carpeta activa pasa a ser la suya (se distingue de la nota seleccionada)", async () => {
  const { value, rerender, ui } = await setup(["Carpeta/Sub/Hoja.md", "Raiz.md"]);
  const hoja = (await value.notes.list(VAULT)).find((n) => n.path.endsWith("Hoja.md"))!;
  rerender(ui(value, hoja.id));
  const sub = await screen.findByRole("treeitem", { name: "Sub" });
  expect(sub).toHaveAttribute("aria-current", "true");
  expect(await screen.findByRole("treeitem", { name: "Hoja" })).toHaveAttribute("aria-selected", "true");
  expect(document.getElementById("note-create-in")).toHaveTextContent("Crear en: Carpeta/Sub");
  const raiz = (await value.notes.list(VAULT)).find((n) => n.path === "Raiz.md")!;
  rerender(ui(value, raiz.id));
  expect(rootRow()).toHaveAttribute("aria-current", "true");
});

test("RF-006: la pista de «/» está visible y la describen el título, el renombrado y «Nueva carpeta»", async () => {
  const { user } = await setup(["Uno.md"]);
  const hint = screen.getByText(/Usa \/ para crear subcarpetas/);
  expect(hint).toHaveTextContent("Usa / para crear subcarpetas (por ejemplo, Proyectos/Ideas)");
  const title = screen.getByRole("textbox", { name: "Título de la nota nueva (opcional)" });
  expect(title.getAttribute("aria-describedby")).toContain(hint.id);
  expect(title.getAttribute("aria-describedby")).toContain("note-create-in");
  await user.click(await screen.findByRole("treeitem", { name: "Uno" }));
  await user.click(screen.getByRole("button", { name: "Renombrar «Uno»" }));
  expect(screen.getByRole("textbox", { name: "Ruta de la nota" }).getAttribute("aria-describedby")).toContain(hint.id);
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Nueva carpeta" }));
  expect(screen.getByRole("textbox", { name: "Nombre de la carpeta" }).getAttribute("aria-describedby")).toContain(hint.id);
});

test("RF-004: «Nueva carpeta» abre un formulario con el foco en el campo; Esc lo cierra y devuelve el foco al botón", async () => {
  const { user } = await setup(["Uno.md"]);
  const open = screen.getByRole("button", { name: "Nueva carpeta" });
  await user.click(open);
  const input = screen.getByRole("textbox", { name: "Nombre de la carpeta" });
  expect(input).toHaveFocus();
  expect(screen.getByRole("button", { name: "Crear carpeta" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("textbox", { name: "Nombre de la carpeta" })).toBeNull();
  expect(open).toHaveFocus();
});

test("RF-004: «Cancelar» cierra el formulario de carpeta", async () => {
  const { user } = await setup();
  await user.click(screen.getByRole("button", { name: "Nueva carpeta" }));
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("textbox", { name: "Nombre de la carpeta" })).toBeNull();
});

test("RF-004: enviar el nombre vacío muestra el error asociado al campo (role=alert)", async () => {
  const { user } = await setup();
  await user.click(screen.getByRole("button", { name: "Nueva carpeta" }));
  await user.click(screen.getByRole("button", { name: "Crear carpeta" }));
  const input = screen.getByRole("textbox", { name: "Nombre de la carpeta" });
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("Escribe un nombre. No puede estar vacío.");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input.getAttribute("aria-describedby")).toContain(alert.id);
});

// --- SPEC-0010 RF-001/RF-003/RF-004/RF-042: carpeta activa y «Nueva carpeta» ---

test("RF-042: «Nueva carpeta» crea una nota dentro y la abre en edición", async () => {
  const { user, value, onOpen } = await setup();
  await user.click(screen.getByRole("button", { name: "Nueva carpeta" }));
  await user.type(screen.getByRole("textbox", { name: "Nombre de la carpeta" }), "Proyectos");
  await user.click(screen.getByRole("button", { name: "Crear carpeta" }));
  await waitForCondition(async () => expect((await value.notes.list(VAULT)).map((n) => n.path)).toContain("Proyectos/Sin título.md"));
  expect(onOpen).toHaveBeenCalledWith(expect.any(String), { edit: true });
});

test("RF-004: «Nueva carpeta» duplicada muestra el error y no crea nada", async () => {
  const { user, value } = await setup(["Proyectos/Hoja.md"]);
  await user.click(screen.getByRole("button", { name: "Nueva carpeta" }));
  await user.type(screen.getByRole("textbox", { name: "Nombre de la carpeta" }), "Proyectos");
  await user.click(screen.getByRole("button", { name: "Crear carpeta" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Ya existe una carpeta con ese nombre («Proyectos»).");
  expect((await value.notes.list(VAULT)).length).toBe(1); // sólo la nota sembrada
});

test("RF-003: «Nueva nota» se crea en la carpeta activa", async () => {
  const { user, value } = await setup(["Proyectos/Hoja.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Proyectos" })); // carpeta activa = Proyectos
  await user.type(screen.getByRole("textbox", { name: "Título de la nota nueva (opcional)" }), "Idea");
  await user.click(screen.getByRole("button", { name: "Nueva nota" }));
  await waitForCondition(async () => expect((await value.notes.list(VAULT)).map((n) => n.path)).toContain("Proyectos/Idea.md"));
});

// --- H-003: drag & drop para mover notas/carpetas en el árbol ---------------------------------
// El PATCH de rutas ya existe (es el renombrado): esto es la interacción de arrastre sobre él.

test("C-1: arrastrar una nota y soltarla sobre una carpeta la mueve ahí (misma ruta que el renombrado)", async () => {
  const { value } = await setup(["Inicio.md", "Carpeta/Ancla.md"]);
  const inicio = (await value.notes.list(VAULT)).find((n) => n.path === "Inicio.md")!;
  const noteRow = await screen.findByRole("treeitem", { name: "Inicio" });
  const folderRow = screen.getByRole("treeitem", { name: "Carpeta" });
  fireEvent.dragStart(noteRow);
  fireEvent.dragOver(folderRow);
  fireEvent.drop(folderRow);
  await waitForCondition(async () => expect((await value.notes.get(inicio.id)).path).toBe("Carpeta/Inicio.md"));
});

test("C-1: arrastrar una nota y soltarla sobre «Raíz» la saca de su carpeta", async () => {
  const { value } = await setup(["Carpeta/Hoja.md"]);
  const hoja = (await value.notes.list(VAULT)).find((n) => n.path === "Carpeta/Hoja.md")!;
  await userEvent.setup().click(await screen.findByRole("treeitem", { name: "Carpeta" }));
  fireEvent.dragStart(await screen.findByRole("treeitem", { name: "Hoja" }));
  const root = within(screen.getByRole("tree", { name: "Notas" })).getByRole("treeitem", { name: "Raíz" });
  fireEvent.dragOver(root);
  fireEvent.drop(root);
  await waitForCondition(async () => expect((await value.notes.get(hoja.id)).path).toBe("Hoja.md"));
});

test("C-4: soltar una nota sobre otra nota (no una carpeta) no mueve nada", async () => {
  const { value } = await setup(["Uno.md", "Dos.md"]);
  const rename = vi.spyOn(value.notes, "rename");
  fireEvent.dragStart(await screen.findByRole("treeitem", { name: "Uno" }));
  const dos = screen.getByRole("treeitem", { name: "Dos" });
  fireEvent.dragOver(dos);
  fireEvent.drop(dos);
  expect(rename).not.toHaveBeenCalled();
  expect((await value.notes.list(VAULT)).map((n) => n.path)).toEqual(["Dos.md", "Uno.md"]);
});

test("C-7: soltar una nota en la carpeta donde ya está no hace ninguna llamada de red", async () => {
  const { value } = await setup(["Carpeta/Hoja.md", "Carpeta/Otra.md"]);
  const rename = vi.spyOn(value.notes, "rename");
  await userEvent.setup().click(await screen.findByRole("treeitem", { name: "Carpeta" }));
  fireEvent.dragStart(await screen.findByRole("treeitem", { name: "Hoja" }));
  const folderRow = screen.getByRole("treeitem", { name: "Carpeta" });
  fireEvent.dragOver(folderRow);
  fireEvent.drop(folderRow);
  expect(rename).not.toHaveBeenCalled();
});

test("C-2: arrastrar una carpeta sobre otra mueve todas sus notas hijas conservando la subestructura", async () => {
  const { value } = await setup(["Proyectos/Plan.md", "Proyectos/Sub/Hoja.md", "Archivo/Viejo.md"]);
  fireEvent.dragStart(await screen.findByRole("treeitem", { name: "Proyectos" }));
  const archivo = screen.getByRole("treeitem", { name: "Archivo" });
  fireEvent.dragOver(archivo);
  fireEvent.drop(archivo);
  await waitForCondition(async () =>
    expect((await value.notes.list(VAULT)).map((n) => n.path)).toEqual([
      "Archivo/Proyectos/Plan.md",
      "Archivo/Proyectos/Sub/Hoja.md",
      "Archivo/Viejo.md",
    ]),
  );
});

test("C-2: arrastrar una carpeta sobre «Raíz» la saca al primer nivel con todo su contenido", async () => {
  const { value } = await setup(["A/B/Nota.md", "A/B/Sub/Otra.md"]);
  await userEvent.setup().click(await screen.findByRole("treeitem", { name: "A" }));
  fireEvent.dragStart(await screen.findByRole("treeitem", { name: "B" }));
  const root = within(screen.getByRole("tree", { name: "Notas" })).getByRole("treeitem", { name: "Raíz" });
  fireEvent.dragOver(root);
  fireEvent.drop(root);
  await waitForCondition(async () =>
    expect((await value.notes.list(VAULT)).map((n) => n.path)).toEqual(["B/Nota.md", "B/Sub/Otra.md"]),
  );
});

test("C-7: arrastrar una carpeta sobre un descendiente suyo no hace ninguna llamada de red", async () => {
  const { value } = await setup(["A/B/Nota.md"]);
  const moveFolder = vi.spyOn(value.notes, "moveFolder");
  await userEvent.setup().click(await screen.findByRole("treeitem", { name: "A" }));
  fireEvent.dragStart(await screen.findByRole("treeitem", { name: "A" }));
  const sub = screen.getByRole("treeitem", { name: "B" });
  fireEvent.dragOver(sub);
  fireEvent.drop(sub);
  expect(moveFolder).not.toHaveBeenCalled();
});

test("C-3: mientras se arrastra, la carpeta destino bajo el cursor se resalta y deja de hacerlo al salir", async () => {
  await setup(["Inicio.md", "Carpeta/Ancla.md"]);
  const folderRow = await screen.findByRole("treeitem", { name: "Carpeta" });
  expect(folderRow).not.toHaveAttribute("data-drop-target");
  fireEvent.dragStart(await screen.findByRole("treeitem", { name: "Inicio" }));
  fireEvent.dragOver(folderRow);
  expect(folderRow).toHaveAttribute("data-drop-target", "true");
  fireEvent.dragLeave(folderRow);
  expect(folderRow).not.toHaveAttribute("data-drop-target");
});

test("C-3: un destino no válido (la carpeta donde la nota ya está) no se resalta", async () => {
  const { user } = await setup(["Carpeta/Hoja.md"]);
  const folderRow = await screen.findByRole("treeitem", { name: "Carpeta" });
  await user.click(folderRow);
  fireEvent.dragStart(screen.getByRole("treeitem", { name: "Hoja" }));
  fireEvent.dragOver(folderRow);
  expect(folderRow).not.toHaveAttribute("data-drop-target");
});

test("C-5: soltar una nota donde ya hay otra con ese nombre muestra el mismo error que el renombrado, sin mover", async () => {
  const { value } = await setup(["Inicio.md", "Carpeta/Inicio.md"]);
  const raiz = (await value.notes.list(VAULT)).find((n) => n.path === "Inicio.md")!;
  fireEvent.dragStart(await screen.findByRole("treeitem", { name: "Inicio" }));
  const carpeta = screen.getByRole("treeitem", { name: "Carpeta" });
  fireEvent.dragOver(carpeta);
  fireEvent.drop(carpeta);
  expect(await screen.findByRole("alert")).toHaveTextContent(PATH_TAKEN);
  expect((await value.notes.get(raiz.id)).path).toBe("Inicio.md"); // no se movió
});

test("C-5: soltar una carpeta donde ya existe otra con ese nombre muestra el error de carpeta duplicada, sin mover", async () => {
  const { value } = await setup(["Origen/Nota.md", "Destino/Origen/Vieja.md"]);
  fireEvent.dragStart(await screen.findByRole("treeitem", { name: "Origen" }));
  const destino = screen.getByRole("treeitem", { name: "Destino" });
  fireEvent.dragOver(destino);
  fireEvent.drop(destino);
  expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe una carpeta con ese nombre («Origen»).");
  expect((await value.notes.list(VAULT)).map((n) => n.path)).toEqual(["Destino/Origen/Vieja.md", "Origen/Nota.md"]);
});

test("C-6: el drag & drop es aditivo; la fila es arrastrable y F2 sigue abriendo el renombrado por teclado", async () => {
  const { user, value } = await setup(["Uno.md"]);
  const row = await screen.findByRole("treeitem", { name: "Uno" });
  // La vía de arrastre con mouse no sustituye al renombrado accesible sin mouse.
  expect(row).toHaveAttribute("draggable", "true");
  row.focus();
  await user.keyboard("{F2}");
  const input = screen.getByRole("textbox", { name: "Ruta de la nota" });
  expect(input).toHaveValue("Uno.md");
  await user.clear(input);
  await user.type(input, "Carpeta/Dos.md");
  await user.click(screen.getByRole("button", { name: "Guardar ruta" }));
  await waitForCondition(async () => expect((await value.notes.list(VAULT)).map((n) => n.path)).toEqual(["Carpeta/Dos.md"]));
});

test("RF-055: revealFolder (por ref) despliega la carpeta y la deja activa", async () => {
  const { createRef } = await import("react");
  const { value } = syncValue({}, memoryDb());
  await value.notes.create(VAULT, "Proyectos/Sub/Hoja.md");
  const ref = createRef<import("./NoteSidebar").NoteSidebarHandle>();
  render(
    <WithSync value={value}>
      <MemoryRouter>
        <NoteSidebar ref={ref} vaultId={VAULT} openId={null} onOpen={vi.fn()} onDeleted={vi.fn()} onShowTrash={vi.fn()} />
      </MemoryRouter>
    </WithSync>,
  );
  await waitFor(() => expect(screen.queryByText("Cargando…")).toBeNull());
  // La subcarpeta está plegada (no visible) hasta revelarla.
  expect(screen.queryByRole("treeitem", { name: "Sub" })).toBeNull();
  act(() => ref.current!.revealFolder("Proyectos/Sub"));
  expect(await screen.findByRole("treeitem", { name: "Sub" })).toBeInTheDocument();
  expect(screen.getByRole("treeitem", { name: "Sub" })).toHaveAttribute("aria-current", "true");
});
