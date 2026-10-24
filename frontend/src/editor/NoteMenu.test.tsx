// SPEC-0010 RF-061, RF-062 (P-4, P-17): menú ⋮ de la nota abierta.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NoteMenu } from "./NoteMenu";

function setup(overrides: Partial<React.ComponentProps<typeof NoteMenu>> = {}) {
  const actions = { onRename: vi.fn(), onCopyPath: vi.fn(), onViewInCode: vi.fn(), onDelete: vi.fn() };
  const utils = render(
    <div>
      <NoteMenu inCode={false} {...actions} {...overrides} />
      <button type="button">Fuera</button>
    </div>,
  );
  const trigger = screen.getByRole("button", { name: "Opciones de la nota" });
  return { ...utils, ...actions, trigger };
}

describe("NoteMenu", () => {
  // RF-061
  it("el botón anuncia un menú (aria-haspopup) cerrado", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  // RF-061
  it("al pulsarlo abre un menú en un portal, nombrado por el botón, con los ítems en el orden de P-4", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    const menu = screen.getByRole("menu");
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveAttribute("aria-labelledby", trigger.id);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", menu.id);
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Renombrar o mover", "Copiar ruta", "Ver en Código", "Borrar"]);
    // La acción destructiva va separada del resto.
    const children = [...menu.children];
    expect(children[children.length - 2]).toHaveAttribute("role", "separator");
    expect(items[0]).toHaveFocus();
  });

  // RF-061
  it("los ítems son un foco itinerante: sólo el activo es tabulable", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);
    await userEvent.keyboard("{ArrowDown}");
    expect(items.map((item) => item.getAttribute("tabindex"))).toEqual(["-1", "0", "-1", "-1"]);
  });

  // RF-061
  it("↓ y ↑ recorren los ítems de forma cíclica; Inicio y Fin saltan a los extremos", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    const items = screen.getAllByRole("menuitem");
    await userEvent.keyboard("{ArrowUp}");
    expect(items[3]).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(items[3]).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(items[0]).toHaveFocus();
  });

  // RF-061
  it("con el botón enfocado, ↓ abre el menú en el primero y ↑ en el último", async () => {
    const { trigger } = setup();
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("menuitem")[0]).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    trigger.focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getAllByRole("menuitem")[3]).toHaveFocus();
  });

  // RF-061
  it("Enter y Espacio abren el menú desde el botón", async () => {
    const { trigger } = setup();
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    trigger.focus();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  // RF-061
  it("Esc cierra el menú y devuelve el foco al botón", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  // RF-061
  it("Tab cierra el menú sin retener el foco; un clic fuera también lo cierra", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    await userEvent.tab();
    expect(screen.queryByRole("menu")).toBeNull();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Fuera" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  // RF-061, RF-062
  it.each([
    ["Renombrar o mover", "onRename"],
    ["Copiar ruta", "onCopyPath"],
    ["Ver en Código", "onViewInCode"],
    ["Borrar", "onDelete"],
  ] as const)("activar «%s» llama a %s, cierra el menú y devuelve el foco al botón", async (label, action) => {
    const { trigger, ...rest } = setup();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: label }));
    expect(rest[action]).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  // RF-061
  it("Enter sobre un ítem lo activa", async () => {
    const { trigger, onCopyPath } = setup();
    await userEvent.click(trigger);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onCopyPath).toHaveBeenCalledTimes(1);
  });

  // RF-061
  it("«Ver en Código» está aria-disabled si ya se está en Código y no hace nada", async () => {
    const { trigger, onViewInCode } = setup({ inCode: true });
    await userEvent.click(trigger);
    const item = screen.getByRole("menuitem", { name: "Ver en Código" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(item);
    expect(onViewInCode).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  // RF-061
  it("al desmontar no deja el menú en el documento", async () => {
    const { trigger, unmount } = setup();
    await userEvent.click(trigger);
    unmount();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
