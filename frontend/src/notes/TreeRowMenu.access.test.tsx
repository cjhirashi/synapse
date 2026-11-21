import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TreeRowMenu } from "./TreeRowMenu";

async function items(props: { onRename?: () => void }) {
  render(<TreeRowMenu label="a" onDelete={vi.fn()} {...props} />);
  await userEvent.click(screen.getByRole("button", { name: /Acciones de a/ }));
  return screen.getAllByRole("menuitem").map((i) => i.textContent);
}

describe("el menú de una fila", () => {
  it("con `onRename` ofrece Renombrar y Borrar", async () => {
    expect(await items({ onRename: vi.fn() })).toEqual(["Renombrar", "Borrar"]);
  });

  it("sin `onRename` (quien no es la dueña) ofrece solo Borrar", async () => {
    expect(await items({})).toEqual(["Borrar"]);
  });
});
