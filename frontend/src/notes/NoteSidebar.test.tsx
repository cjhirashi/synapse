// Sidebar con el árbol de notas de la bóveda (SPEC-0008 RF-003, RF-010…RF-013, RF-019).
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type Ref } from "react";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { memoryDb, syncValue, WithSync } from "../test-utils/sync";
import type { SyncContextValue } from "../sync/useSync";
import { PATH_INVALID, PATH_TAKEN } from "./messages";
import NoteSidebar, { type NoteSidebarHandle } from "./NoteSidebar";
import type { PaletteKey } from "../vaults/vaultIcon";
import { waitForCondition } from "../test-utils/waits";

const VAULT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

async function setup(paths: string[] = [], options: { confirmDelete?: () => Promise<boolean>; ref?: Ref<NoteSidebarHandle> } = {}) {
  const { value } = syncValue({}, memoryDb());
  for (const path of paths) await value.notes.create(VAULT, path);
  const onOpen = vi.fn();
  const onDeleted = vi.fn();
  const onShowTrash = vi.fn();
  const ui = (v: SyncContextValue, openId: string | null = null, vaultColor: PaletteKey = "accent") => (
    <WithSync value={v}>
      <MemoryRouter>
        <NoteSidebar
          ref={options.ref}
          vaultId={VAULT}
          openId={openId}
          onOpen={onOpen}
          onDeleted={onDeleted}
          onShowTrash={onShowTrash}
          vaultColor={vaultColor}
          confirmDelete={options.confirmDelete}
        />
      </MemoryRouter>
    </WithSync>
  );
  const utils = render(ui(value));
  // La primera lectura del árbol termina antes de que la prueba actúe (sin avisos de `act`).
  await waitFor(() => expect(screen.queryByText("Cargando…")).toBeNull());
  return { ...utils, ui, value, onOpen, onDeleted, onShowTrash, user: userEvent.setup() };
}

/** Diálogo de borrado abierto (C-7) y su botón de confirmar, «Borrar» (no el de la barra). */
const dialog = () => screen.getByRole("alertdialog");
const confirmButton = () => within(dialog()).getByRole("button", { name: "Borrar" });
const menuButton = (name: string) => screen.getByRole("button", { name: `Acciones de ${name}` });
/** Campo de renombrado en línea de la fila (C-4, C-5): sustituye al treeitem mientras se edita. */
const renameField = (kind: "nota" | "carpeta" = "nota") => screen.getByRole("textbox", { name: `Nuevo nombre de la ${kind}` });

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

test("RF-011: renombrar edita el nombre en línea con Enter; la nota conserva su carpeta y su id", async () => {
  const { user, value } = await setup(["Carpeta/Inicio.md"]);
  const [{ id }] = await value.notes.list(VAULT);
  await user.click(await screen.findByRole("treeitem", { name: "Carpeta" }));
  await user.click(menuButton("Inicio"));
  await user.click(screen.getByRole("menuitem", { name: "Renombrar" }));
  const input = renameField();
  expect(input).toHaveValue("Inicio");
  await user.clear(input);
  await user.type(input, "Hogar{Enter}");
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "Hogar" })).toHaveFocus());
  expect(screen.queryByRole("treeitem", { name: "Inicio" })).toBeNull();
  expect((await value.notes.get(id)).path).toBe("Carpeta/Hogar.md");
});

test("RF-013: renombrar a una ruta ocupada muestra el mensaje y conserva el nombre", async () => {
  const { user, value } = await setup(["Uno.md", "Dos.md"]);
  (await screen.findByRole("treeitem", { name: "Dos" })).focus();
  await user.keyboard("{F2}");
  const input = renameField();
  await user.clear(input);
  await user.type(input, "uno{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent(PATH_TAKEN);
  expect((await value.notes.list(VAULT)).map((n) => n.path)).toEqual(["Dos.md", "Uno.md"]);
});

test("C-4: salir del campo sin confirmar cancela el renombrado sin escribir", async () => {
  const { user, value } = await setup(["Uno.md"]);
  const rename = vi.spyOn(value.notes, "rename");
  (await screen.findByRole("treeitem", { name: "Uno" })).focus();
  await user.keyboard("{F2}");
  await user.type(renameField(), "x");
  await user.click(screen.getByRole("button", { name: "Papelera de la bóveda" }));
  expect(screen.queryByRole("textbox", { name: "Nuevo nombre de la nota" })).toBeNull();
  expect(rename).not.toHaveBeenCalled();
});


test("RF-010: borrar quita la nota del árbol, avisa al padre y la deja en la papelera", async () => {
  const { user, value, onDeleted } = await setup(["Uno.md", "Dos.md"]);
  const uno = (await value.notes.list(VAULT)).find((n) => n.path === "Uno.md")!;
  await user.click(await screen.findByRole("treeitem", { name: "Uno" }));
  await user.click(menuButton("Uno"));
  await user.click(screen.getByRole("menuitem", { name: "Borrar" }));
  await user.click(confirmButton());
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

// C-1, C-8b (H-024): el ⋮ vive dentro del árbol pero fuera del Tab; lo demás del árbol son treeitems.
test("RF-019: el árbol sólo tiene treeitems tabulables; los ⋮ quedan fuera del Tab", async () => {
  await setup(["Uno.md", "Dos.md"]);
  const tree = await screen.findByRole("tree", { name: "Notas" });
  expect(tree.querySelectorAll('button:not([role="treeitem"]):not([tabindex="-1"]), input, form')).toHaveLength(0);
  expect(within(tree).getAllByRole("button", { name: /^Acciones de / })).toHaveLength(2);
});

// C-9 (H-024): la barra inferior de acciones desaparece; «Renombrar» y «Borrar» viven en el ⋮ de cada fila.
test("C-9: no queda barra de acciones; «Renombrar» y «Borrar» están en el ⋮ de la nota", async () => {
  const { user, container } = await setup(["Uno.md", "Dos.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Uno" }));
  expect(container.querySelector(".note-actions")).toBeNull();
  expect(screen.queryByRole("toolbar", { name: "Acciones de la nota" })).toBeNull();
  await user.click(menuButton("Uno"));
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Renombrar", "Borrar"]);
});

test("RF-011: F2 en un treeitem de nota abre el renombrado de esa nota", async () => {
  const { user } = await setup(["Uno.md", "Dos.md"]);
  (await screen.findByRole("treeitem", { name: "Dos" })).focus();
  await user.keyboard("{F2}");
  expect(renameField()).toHaveValue("Dos");
});

test("RF-010: Supr en un treeitem de nota la manda a la papelera y avisa al padre", async () => {
  const { user, value, onDeleted } = await setup(["Uno.md", "Dos.md"]);
  const uno = (await value.notes.list(VAULT)).find((n) => n.path === "Uno.md")!;
  (await screen.findByRole("treeitem", { name: "Uno" })).focus();
  await user.keyboard("{Delete}");
  await user.click(confirmButton());
  await waitForCondition(() => expect(onDeleted).toHaveBeenCalledWith(uno.id));
  expect(screen.queryByRole("treeitem", { name: "Uno" })).toBeNull();
});

// C-5, C-6 (PLAN-0008 §15): el foco nunca cae a `body` y los atajos comparten la guarda `busy`.
test("RF-019, RF-010: tras borrar con Supr el foco va a la fila siguiente", async () => {
  const { user } = await setup(["A.md", "B.md", "C.md"]);
  (await screen.findByRole("treeitem", { name: "B" })).focus();
  await user.keyboard("{Delete}");
  await user.click(confirmButton());
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "C" })).toHaveFocus());
});

test("RF-019, RF-010: si no hay siguiente, el foco va a la fila anterior", async () => {
  const { user } = await setup(["A.md", "B.md"]);
  (await screen.findByRole("treeitem", { name: "B" })).focus();
  await user.keyboard("{Delete}");
  await user.click(confirmButton());
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "A" })).toHaveFocus());
});

test("RF-019, RF-010: si no queda ninguna fila, el foco va a «Nueva nota» (botón Borrar)", async () => {
  const { user } = await setup(["Sola.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Sola" }));
  await user.click(menuButton("Sola"));
  await user.click(screen.getByRole("menuitem", { name: "Borrar" }));
  await user.click(confirmButton());
  await waitForCondition(() => expect(screen.getByRole("button", { name: "Nueva nota" })).toHaveFocus());
});

test("RF-019, RF-011: tras guardar o cancelar el renombrado el foco vuelve al treeitem de la nota", async () => {
  const { user } = await setup(["Uno.md"]);
  (await screen.findByRole("treeitem", { name: "Uno" })).focus();
  await user.keyboard("{F2}");
  await user.keyboard("{Escape}");
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "Uno" })).toHaveFocus());
  await user.keyboard("{F2}");
  const input = renameField();
  await user.clear(input);
  await user.type(input, "Dos{Enter}");
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "Dos" })).toHaveFocus());
});

test("RF-010: dos Supr seguidos sobre la misma nota abren una sola confirmación y sólo la borran una vez", async () => {
  const { user, value } = await setup(["Uno.md", "Dos.md"]);
  const softDelete = vi.spyOn(value.notes, "softDelete");
  const row = await screen.findByRole("treeitem", { name: "Uno" });
  row.focus();
  fireEvent.keyDown(row, { key: "Delete" });
  fireEvent.keyDown(row, { key: "Delete" });
  expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  await user.click(confirmButton());
  await waitForCondition(() => expect(screen.queryByRole("treeitem", { name: "Uno" })).toBeNull());
  expect(softDelete).toHaveBeenCalledTimes(1);
});

// H1 (PLAN-0008 §16): el vecino se calcula sobre el árbol resultante, sin las carpetas que queden vacías.
test("RF-019, RF-010: al borrar la única nota de una carpeta el foco va a la fila que sigue, no a la carpeta que desaparece", async () => {
  const { user } = await setup(["Carpeta/Sola.md", "Otra.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Carpeta" }));
  (await screen.findByRole("treeitem", { name: "Sola" })).focus();
  await user.keyboard("{Delete}");
  await user.click(confirmButton());
  await waitForCondition(() => expect(screen.queryByRole("treeitem", { name: "Carpeta" })).toBeNull());
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "Otra" })).toHaveFocus());
});

test("RF-019, RF-010: si la nota borrada era la última fila y su carpeta se vacía, el foco va a la fila anterior que sobrevive", async () => {
  const { user } = await setup(["Zeta/Sola.md", "Alfa/Otra.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Zeta" }));
  (await screen.findByRole("treeitem", { name: "Sola" })).focus();
  await user.keyboard("{Delete}");
  await user.click(confirmButton());
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "Alfa" })).toHaveFocus());
});

test("RF-019, RF-010: la carpeta que reaparece al crear otra nota no le roba el foco al usuario", async () => {
  const { user } = await setup(["Carpeta/Sola.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Carpeta" }));
  (await screen.findByRole("treeitem", { name: "Sola" })).focus();
  await user.keyboard("{Delete}");
  await user.click(confirmButton());
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
  expect(renameField()).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("textbox", { name: "Nuevo nombre de la nota" })).toBeNull();
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
test("RF-003, RF-007: seleccionar una nota no añade bloques entre el panel del árbol y el pie", async () => {
  const { container, user } = await setup(["Uno.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Uno" }));
  expect(container.querySelector(".note-tree-panel")!.nextElementSibling).toHaveClass("note-sidebar-footer");
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
  await user.click(menuButton("Uno"));
  await user.click(screen.getByRole("menuitem", { name: "Renombrar" }));
  expect(renameField().getAttribute("aria-describedby")).toContain(hint.id);
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
  const input = renameField();
  expect(input).toHaveValue("Uno");
  await user.clear(input);
  await user.type(input, "Dos{Enter}");
  await waitForCondition(async () => expect((await value.notes.list(VAULT)).map((n) => n.path)).toEqual(["Dos.md"]));
});

test("C-8: arrastrar la última nota fuera de su carpeta deja un «Sin título» y la carpeta sigue en el árbol", async () => {
  const { user, value } = await setup(["Carpeta/Sola.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Carpeta" })); // despliega para ver «Sola»
  fireEvent.dragStart(await screen.findByRole("treeitem", { name: "Sola" }));
  const root = within(tree()).getByRole("treeitem", { name: "Raíz" });
  fireEvent.dragOver(root);
  fireEvent.drop(root);
  await waitForCondition(async () =>
    expect((await value.notes.list(VAULT)).map((n) => n.path)).toEqual(["Carpeta/Sin título.md", "Sola.md"]),
  );
  expect(screen.getByRole("treeitem", { name: "Carpeta" })).toBeInTheDocument();
  expect(within(tree()).getByRole("treeitem", { name: "Sin título" })).toBeInTheDocument();
});

test("C-8: renombrar la última nota de una carpeta no la vacía: la carpeta sigue con la nota nueva", async () => {
  const { user, value } = await setup(["Carpeta/Sola.md"]);
  await user.click(await screen.findByRole("treeitem", { name: "Carpeta" }));
  (await screen.findByRole("treeitem", { name: "Sola" })).focus();
  await user.keyboard("{F2}");
  const input = renameField();
  await user.clear(input);
  await user.type(input, "Sola2{Enter}");
  await waitForCondition(async () => expect((await value.notes.list(VAULT)).map((n) => n.path)).toEqual(["Carpeta/Sola2.md"]));
  expect(screen.getByRole("treeitem", { name: "Carpeta" })).toBeInTheDocument();
});

test("RF-055: revealFolder (por ref) despliega la carpeta y la deja activa", async () => {
  const { value } = syncValue({}, memoryDb());
  await value.notes.create(VAULT, "Proyectos/Sub/Hoja.md");
  const ref = createRef<import("./NoteSidebar").NoteSidebarHandle>();
  render(
    <WithSync value={value}>
      <MemoryRouter>
        <NoteSidebar ref={ref} vaultId={VAULT} openId={null} onOpen={vi.fn()} onDeleted={vi.fn()} onShowTrash={vi.fn()} vaultColor="accent" />
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

// --- H-024: menú ⋮ por fila y borrado sólo tras confirmar (C-1, C-2, C-7, C-8, C-8b) ---

test("C-1: cada nota y carpeta tiene su ⋮ con el nombre de la fila; «Raíz» no", async () => {
  await setup(["Carpeta/Hoja.md", "Nota.md"]);
  expect(menuButton("Carpeta")).toHaveAttribute("aria-haspopup", "menu");
  expect(menuButton("Nota")).toHaveAttribute("aria-haspopup", "menu");
  expect(screen.queryByRole("button", { name: "Acciones de Raíz" })).toBeNull();
});

test("C-2: pulsar el ⋮ de una nota no la abre ni la selecciona", async () => {
  const { user, onOpen } = await setup(["Uno.md"]);
  await user.click(menuButton("Uno"));
  expect(screen.getByRole("menu")).toBeInTheDocument();
  expect(onOpen).not.toHaveBeenCalled();
  expect(screen.queryByRole("toolbar", { name: "Acciones de la nota" })).toBeNull();
});

test("C-2: pulsar el ⋮ de una carpeta no la despliega ni la vuelve activa", async () => {
  const { user } = await setup(["Carpeta/Hoja.md"]);
  await user.click(menuButton("Carpeta"));
  expect(screen.getByRole("treeitem", { name: "Carpeta" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("treeitem", { name: "Raíz" })).toHaveAttribute("aria-current", "true");
});

test("C-2: «Renombrar» del ⋮ de una nota abre el renombrado de esa nota", async () => {
  const { user } = await setup(["Uno.md"]);
  await user.click(menuButton("Uno"));
  await user.click(screen.getByRole("menuitem", { name: "Renombrar" }));
  expect(renameField()).toHaveValue("Uno");
});

test("C-4: «/» en el nombre de una nota muestra el aviso y no renombra", async () => {
  const { user, value } = await setup(["Uno.md"]);
  const rename = vi.spyOn(value.notes, "rename");
  (await screen.findByRole("treeitem", { name: "Uno" })).focus();
  await user.keyboard("{F2}");
  const input = renameField();
  await user.clear(input);
  await user.type(input, "a/b{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("El nombre no puede contener «/».");
  expect(rename).not.toHaveBeenCalled();
});

test("C-4: Enter sin cambios cierra el campo, devuelve el foco y no escribe", async () => {
  const { user, value } = await setup(["Uno.md"]);
  const rename = vi.spyOn(value.notes, "rename");
  (await screen.findByRole("treeitem", { name: "Uno" })).focus();
  await user.keyboard("{F2}");
  await user.keyboard("{Enter}");
  expect(screen.queryByRole("textbox", { name: "Nuevo nombre de la nota" })).toBeNull();
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "Uno" })).toHaveFocus());
  expect(rename).not.toHaveBeenCalled();
});

test("C-5: renombrar una carpeta con F2 conserva sus notas y su subestructura, y la deja desplegada y activa", async () => {
  const { user, value } = await setup(["Carpeta/Sub/Hoja.md", "Carpeta/Otra.md"]);
  (await screen.findByRole("treeitem", { name: "Carpeta" })).focus();
  await user.keyboard("{F2}");
  const input = renameField("carpeta");
  expect(input).toHaveValue("Carpeta");
  await user.clear(input);
  await user.type(input, "Proyectos{Enter}");
  const folder = await screen.findByRole("treeitem", { name: "Proyectos" });
  await waitForCondition(() => expect(folder).toHaveFocus());
  expect(folder).toHaveAttribute("aria-expanded", "true");
  expect(folder).toHaveAttribute("aria-current", "true");
  expect(screen.queryByRole("treeitem", { name: "Carpeta" })).toBeNull();
  expect((await value.notes.list(VAULT)).map((n) => n.path).sort()).toEqual(["Proyectos/Otra.md", "Proyectos/Sub/Hoja.md"]);
});

test("C-5: «Renombrar» del ⋮ de una carpeta abre el campo con su nombre", async () => {
  const { user } = await setup(["Carpeta/Hoja.md"]);
  await user.click(menuButton("Carpeta"));
  await user.click(screen.getByRole("menuitem", { name: "Renombrar" }));
  expect(renameField("carpeta")).toHaveValue("Carpeta");
});

test("C-6: un nombre de carpeta que ya existe en su carpeta padre muestra el aviso y no mueve nada", async () => {
  const { user, value } = await setup(["Uno/Nota.md", "Dos/Nota.md"]);
  (await screen.findByRole("treeitem", { name: "Uno" })).focus();
  await user.keyboard("{F2}");
  const input = renameField("carpeta");
  await user.clear(input);
  await user.type(input, "Dos{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe una carpeta con ese nombre («Dos»).");
  expect((await value.notes.list(VAULT)).map((n) => n.path).sort()).toEqual(["Dos/Nota.md", "Uno/Nota.md"]);
});

test("C-9: Supr en una carpeta pide confirmación con el número de notas y la borra al confirmar", async () => {
  const { user, value } = await setup(["Carpeta/Hoja.md", "Carpeta/Sub/Otra.md"]);
  (await screen.findByRole("treeitem", { name: "Carpeta" })).focus();
  await user.keyboard("{Delete}");
  expect(dialog()).toHaveAccessibleName("¿Borrar «Carpeta»?");
  expect(within(dialog()).getByText("Se llevarán a la papelera 2 notas.")).toBeInTheDocument();
  await user.click(confirmButton());
  await waitForCondition(async () => expect(await value.notes.list(VAULT)).toEqual([]));
});

test("C-7: «Borrar» del ⋮ de una nota pide confirmación; hasta confirmar no la toca", async () => {
  const { user, value } = await setup(["Uno.md"]);
  const softDelete = vi.spyOn(value.notes, "softDelete");
  await user.click(menuButton("Uno"));
  await user.click(screen.getByRole("menuitem", { name: "Borrar" }));
  expect(dialog()).toHaveAccessibleName("¿Borrar «Uno»?");
  expect(within(dialog()).getByText("Irá a la papelera.")).toBeInTheDocument();
  expect(softDelete).not.toHaveBeenCalled();
  expect(screen.getByRole("treeitem", { name: "Uno" })).toBeInTheDocument();
  await user.click(confirmButton());
  await waitForCondition(() => expect(screen.queryByRole("treeitem", { name: "Uno" })).toBeNull());
  expect(softDelete).toHaveBeenCalledTimes(1);
});

test("C-7, C-8b: Cancelar y Esc no borran nada y el foco vuelve al ⋮", async () => {
  const { user, value } = await setup(["Uno.md"]);
  const softDelete = vi.spyOn(value.notes, "softDelete");
  await user.click(menuButton("Uno"));
  await user.click(screen.getByRole("menuitem", { name: "Borrar" }));
  expect(within(dialog()).getByRole("button", { name: "Cancelar" })).toHaveFocus();
  await user.click(within(dialog()).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(menuButton("Uno")).toHaveFocus();
  await user.click(menuButton("Uno"));
  await user.click(screen.getByRole("menuitem", { name: "Borrar" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(softDelete).not.toHaveBeenCalled();
  expect(screen.getByRole("treeitem", { name: "Uno" })).toBeInTheDocument();
});

test("C-7: Supr sobre una nota sólo abre la confirmación", async () => {
  const { user, value } = await setup(["Uno.md"]);
  const softDelete = vi.spyOn(value.notes, "softDelete");
  (await screen.findByRole("treeitem", { name: "Uno" })).focus();
  await user.keyboard("{Delete}");
  expect(dialog()).toHaveAccessibleName("¿Borrar «Uno»?");
  expect(softDelete).not.toHaveBeenCalled();
});

test("C-7, C-8b: el ⋮ del editor (handle.remove) pasa por la misma confirmación", async () => {
  const ref = createRef<NoteSidebarHandle>();
  const { user, value } = await setup(["Uno.md"], { ref });
  const softDelete = vi.spyOn(value.notes, "softDelete");
  const [{ id }] = await value.notes.list(VAULT);
  act(() => ref.current!.remove(id));
  expect(dialog()).toHaveAccessibleName("¿Borrar «Uno»?");
  expect(softDelete).not.toHaveBeenCalled();
  await user.click(confirmButton());
  await waitForCondition(() => expect(softDelete).toHaveBeenCalledWith(id, expect.any(String)));
});

test("C-8: «Borrar» del ⋮ de una carpeta cuenta sus notas, también las de subcarpetas, y las lleva todas al confirmar", async () => {
  const { user, value, onDeleted } = await setup(["Carpeta/Uno.md", "Carpeta/Sub/Dos.md", "Otra.md"]);
  await user.click(menuButton("Carpeta"));
  await user.click(screen.getByRole("menuitem", { name: "Borrar" }));
  expect(dialog()).toHaveAccessibleName("¿Borrar «Carpeta»?");
  expect(within(dialog()).getByText("Se llevarán a la papelera 2 notas.")).toBeInTheDocument();
  await user.click(confirmButton());
  await waitForCondition(() => expect(screen.queryByRole("treeitem", { name: "Carpeta" })).toBeNull());
  expect((await value.notes.list(VAULT, { deleted: true })).map((n) => n.path).sort()).toEqual(["Carpeta/Sub/Dos.md", "Carpeta/Uno.md"]);
  expect(screen.getByRole("treeitem", { name: "Otra" })).toBeInTheDocument();
  expect(onDeleted).toHaveBeenCalledTimes(2);
});

test("C-8: borrar una carpeta con la nota abierta dentro pregunta por el borrador y avisa para cerrar el editor", async () => {
  const confirmDelete = vi.fn(async () => true);
  const { user, value, rerender, ui, onDeleted } = await setup(["Carpeta/Abierta.md"], { confirmDelete });
  const [{ id }] = await value.notes.list(VAULT);
  rerender(ui(value, id));
  await user.click(menuButton("Carpeta"));
  await user.click(screen.getByRole("menuitem", { name: "Borrar" }));
  await user.click(confirmButton());
  await waitForCondition(() => expect(onDeleted).toHaveBeenCalledWith(id));
  expect(confirmDelete).toHaveBeenCalledTimes(1);
});

test("C-8: si el editor no descarta el borrador de la nota abierta, la carpeta no se borra", async () => {
  const confirmDelete = vi.fn(async () => false);
  const { user, value, rerender, ui, onDeleted } = await setup(["Carpeta/Abierta.md"], { confirmDelete });
  const [{ id }] = await value.notes.list(VAULT);
  rerender(ui(value, id));
  await user.click(menuButton("Carpeta"));
  await user.click(screen.getByRole("menuitem", { name: "Borrar" }));
  await user.click(confirmButton());
  await waitForCondition(() => expect(confirmDelete).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("treeitem", { name: "Abierta" })).toBeInTheDocument();
  expect(await value.notes.list(VAULT, { deleted: true })).toHaveLength(0);
  expect(onDeleted).not.toHaveBeenCalled();
});

test("C-8: tras borrar una carpeta el foco va a la fila que sigue", async () => {
  const { user } = await setup(["Carpeta/Hoja.md", "Otra.md"]);
  await user.click(menuButton("Carpeta"));
  await user.click(screen.getByRole("menuitem", { name: "Borrar" }));
  await user.click(confirmButton());
  await waitForCondition(() => expect(screen.getByRole("treeitem", { name: "Otra" })).toHaveFocus());
});

test("C-8: borrar la carpeta activa devuelve «Crear en» a la raíz", async () => {
  const { user } = await setup(["Carpeta/Hoja.md", "Otra.md"]);
  await user.click(screen.getByRole("treeitem", { name: "Carpeta" }));
  expect(document.getElementById("note-create-in")).toHaveTextContent("Crear en: Carpeta");
  await user.click(menuButton("Carpeta"));
  await user.click(screen.getByRole("menuitem", { name: "Borrar" }));
  await user.click(confirmButton());
  await waitForCondition(() => expect(document.getElementById("note-create-in")).toHaveTextContent("Crear en: Raíz"));
});

// --- H-006: iconos de contenido con el color de la bóveda, solo contorno (C-2 corregido 2026-10-29) ---

/** El `<aside>` de la sidebar: lleva la variable de color de la bóveda que heredan sus iconos. */
const sidebar = (c: HTMLElement) => c.querySelector<HTMLElement>(".note-sidebar")!;

test("H-006 C-1, C-2: nota, carpeta y «Raíz» toman el color de la bóveda (prop), solo contorno (sin fill)", async () => {
  const { container, user } = await setup(["Carpeta/Hoja.md"]);
  // La sidebar fija la variable de color al color pasado por el padre (misma regla que VaultChip).
  expect(sidebar(container).style.getPropertyValue("--vault-icon-color")).toBe("var(--accent)");

  // Cada icono de contenido lleva la clase que el CSS tiñe con --vault-icon-color (trazo), y NO
  // sobrescribe el `fill`: queda el "none" por defecto de Lucide → solo contorno, sin relleno.
  const root = screen.getByRole("treeitem", { name: "Raíz" }).querySelector('svg[data-icon="house"]')!;
  expect(root).toHaveClass("note-tree-icon-root");
  expect(root.getAttribute("fill")).toBe("none");

  const folder = screen.getByRole("treeitem", { name: "Carpeta" });
  const folderIcon = folder.querySelector('svg[data-icon="folder"]')!;
  expect(folderIcon).toHaveClass("note-tree-icon-folder");
  expect(folderIcon.getAttribute("fill")).toBe("none");

  await user.click(folder);
  const folderOpenIcon = folder.querySelector('svg[data-icon="folder-open"]')!;
  expect(folderOpenIcon).toHaveClass("note-tree-icon-folder");
  expect(folderOpenIcon.getAttribute("fill")).toBe("none");

  const note = screen.getByRole("treeitem", { name: "Hoja" }).querySelector('svg[data-icon="file-text"]')!;
  expect(note).toHaveClass("note-tree-icon-note");
  expect(note.getAttribute("fill")).toBe("none");
});

test("H-006 C-3: los iconos de acción y de disclosure NO cambian (contorno neutro, sin la clase de color)", async () => {
  const { container } = await setup(["Carpeta/Hoja.md"]);
  // Ningún icono rellena con el color de la bóveda: la decisión es solo contorno (C-2 corregido).
  expect(container.querySelectorAll('svg[fill="var(--vault-icon-color)"]')).toHaveLength(0);
  const colorClasses = ["note-tree-icon-folder", "note-tree-icon-note", "note-tree-icon-root"];
  const colored = (el: Element) => colorClasses.some((c) => el.classList.contains(c));
  // Chevron de la carpeta: contorno neutro de Lucide, sin la clase de color de contenido.
  const folder = screen.getByRole("treeitem", { name: "Carpeta" });
  const chevron = folder.querySelector("svg")!; // el primero de la fila es el chevron
  expect(chevron.getAttribute("data-icon")).toBeNull();
  expect(chevron.getAttribute("fill")).toBe("none");
  expect(colored(chevron)).toBe(false);
  // Botones de acción: «Nueva nota» (Plus) y «Papelera» (Trash2) siguen neutros, sin la clase de color.
  for (const name of ["Nueva nota", "Papelera de la bóveda"]) {
    const icon = screen.getByRole("button", { name }).querySelector("svg")!;
    expect(icon.getAttribute("fill")).toBe("none");
    expect(colored(icon)).toBe(false);
  }
});

test("H-006 C-5: cambiar de bóveda (otra prop de color) actualiza el color de los iconos", async () => {
  const { container, rerender, ui, value } = await setup(["Hoja.md"]);
  expect(sidebar(container).style.getPropertyValue("--vault-icon-color")).toBe("var(--accent)");
  rerender(ui(value, null, "danger"));
  expect(sidebar(container).style.getPropertyValue("--vault-icon-color")).toBe("var(--danger)");
  // El icono de la nota lee la variable por su clase (el CSS la usa como color de trazo), así cambia
  // con ella sin remontar; sigue siendo solo contorno (sin fill).
  const note = screen.getByRole("treeitem", { name: "Hoja" }).querySelector('svg[data-icon="file-text"]')!;
  expect(note).toHaveClass("note-tree-icon-note");
  expect(note.getAttribute("fill")).toBe("none");
});
