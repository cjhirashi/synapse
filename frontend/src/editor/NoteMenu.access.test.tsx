// H-064 F7c-2: NoteMenu oculta items de edición en bóvedas compartidas.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { syncValue, WithSync } from "../test-utils/sync";
import { NoteMenu } from "./NoteMenu";

function setup(shared = false) {
  const { value } = syncValue(shared ? { shared: { vaultId: "v", ownerName: "Ana", readOnly: true, grants: [] } } : {});
  const wrapper = ({ children }: { children: ReactNode }) => <WithSync value={value}>{children}</WithSync>;
  return render(
    <NoteMenu inCode={false} onRename={() => {}} onCopyPath={() => {}} onViewInCode={() => {}} onDelete={() => {}} />,
    { wrapper },
  );
}

describe("NoteMenu acceso", () => {
  it("como propietaria el menú muestra Renombrar, Copiar ruta, Ver en Código y Borrar", async () => {
    setup(false);
    const trigger = screen.getByRole("button", { name: "Opciones de la nota" });
    await userEvent.click(trigger);
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.textContent)).toEqual(["Renombrar o mover", "Copiar ruta", "Ver en Código", "Borrar"]);
  });

  it("en bóveda compartida de solo lectura muestra solo Copiar ruta", async () => {
    setup(true);
    const trigger = screen.getByRole("button", { name: "Opciones de la nota" });
    await userEvent.click(trigger);
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toEqual("Copiar ruta");
  });
});
