// H-024 (C-1, C-2, C-3): menú ⋮ de cada fila del árbol (nota o carpeta).
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TreeRowMenu } from "./TreeRowMenu";

function setup() {
  const handlers = { onRename: vi.fn(), onDelete: vi.fn() };
  const rowClick = vi.fn();
  const rowKeyDown = vi.fn();
  render(
    <div onClick={rowClick} onKeyDown={rowKeyDown}>
      <TreeRowMenu label="Plan" {...handlers} />
      <button type="button">Fuera</button>
    </div>,
  );
  const trigger = screen.getByRole("button", { name: "Acciones de Plan" });
  return { ...handlers, rowClick, rowKeyDown, trigger };
}

describe("TreeRowMenu", () => {
  // C-1
  it("el ⋮ anuncia un menú (aria-haspopup) y nombra la fila, cerrado", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  // C-2
  it("al pulsarlo abre un menú con Renombrar y Borrar, en ese orden", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Renombrar", "Borrar"]);
  });

  // C-8b: el árbol conserva una sola parada de Tab; F2 y Supr atajan la misma fila sin ⋮ tabulable.
  it("el ⋮ queda fuera del orden de Tab", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("tabindex", "-1");
  });

  // C-2
  it("Enter y Espacio abren el menú desde el teclado", async () => {
    const { trigger } = setup();
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard(" ");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  // C-2
  it("el clic y las teclas del menú no llegan a la fila (no la abren ni la seleccionan)", async () => {
    const { trigger, rowClick, rowKeyDown, onRename } = setup();
    await userEvent.click(trigger);
    expect(rowClick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("menuitem", { name: "Renombrar" }));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(rowClick).not.toHaveBeenCalled();
    await userEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(rowKeyDown).not.toHaveBeenCalled();
  });

  // C-3
  it("Esc cierra el menú y devuelve el foco al ⋮", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  // C-3
  it("un clic fuera cierra el menú", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Fuera" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  // C-3
  it("↓ y ↑ recorren los ítems en cíclico; Inicio y Fin saltan a los extremos", async () => {
    const { trigger } = setup();
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Renombrar" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Borrar" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Renombrar" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Borrar" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Renombrar" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Borrar" })).toHaveFocus();
  });

  // C-3
  it("elegir Renombrar llama a onRename, cierra el menú y devuelve el foco al ⋮", async () => {
    const { trigger, onRename, onDelete } = setup();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Renombrar" }));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  // C-2
  it("elegir Borrar llama a onDelete y cierra el menú", async () => {
    const { trigger, onRename, onDelete } = setup();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
