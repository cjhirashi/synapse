// H-024 (C-7, C-8b): confirmación obligatoria de todo borrado desde el árbol.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDelete } from "./ConfirmDelete";

function setup(target: { kind: "note" } | { kind: "folder"; count: number }) {
  const handlers = { onConfirm: vi.fn(), onCancel: vi.fn() };
  const utils = render(<ConfirmDelete name="Plan" {...target} {...handlers} />);
  return { ...utils, ...handlers };
}

describe("ConfirmDelete", () => {
  // C-7
  it("nota: muestra su nombre y avisa de que irá a la papelera", () => {
    setup({ kind: "note" });
    expect(screen.getByRole("alertdialog", { name: "¿Borrar «Plan»?" })).toBeInTheDocument();
    expect(screen.getByText("Irá a la papelera.")).toBeInTheDocument();
  });

  // C-8
  it("carpeta: indica cuántas notas se llevará la papelera", () => {
    setup({ kind: "folder", count: 3 });
    expect(screen.getByText("Se llevarán a la papelera 3 notas.")).toBeInTheDocument();
  });

  // C-8
  it("carpeta con una sola nota usa el singular", () => {
    setup({ kind: "folder", count: 1 });
    expect(screen.getByText("Se llevará a la papelera 1 nota.")).toBeInTheDocument();
  });

  // C-8b
  it("el foco inicial va a Cancelar, la respuesta segura", () => {
    setup({ kind: "note" });
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
  });

  // C-8b
  it("Esc cancela y no borra", async () => {
    const { onCancel, onConfirm } = setup({ kind: "note" });
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // C-7
  it("Cancelar no borra", async () => {
    const { onCancel, onConfirm } = setup({ kind: "note" });
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // C-7
  it("Borrar sólo confirma; no cancela", async () => {
    const { onCancel, onConfirm } = setup({ kind: "folder", count: 2 });
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
