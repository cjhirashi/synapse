// H-064 F7c-2: NoteMenu oculta items de edición en bóvedas compartidas.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { syncValue, WithSync } from "../test-utils/sync";
import { NoteMenu } from "./NoteMenu";

const GRANTS = [{ folder: "Pub", level: "lectura" as const }, { folder: "Docs", level: "escritura" as const }];

function setup(shared: boolean | "editor" = false, path?: string) {
  const { value } = syncValue(shared ? { shared: { vaultId: "v", ownerName: "Ana", readOnly: shared !== "editor", grants: GRANTS } } : {});
  const wrapper = ({ children }: { children: ReactNode }) => <WithSync value={value}>{children}</WithSync>;
  return render(
    <NoteMenu inCode={false} path={path} onRename={() => {}} onCopyPath={() => {}} onViewInCode={() => {}} onDelete={() => {}} />,
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

  it("un invitado con escritura ve «Ver en Código» y «Borrar» solo en las notas donde escribe, y nunca «Renombrar o mover»", async () => {
    setup("editor", "Docs/a.md");
    await userEvent.click(screen.getByRole("button", { name: "Opciones de la nota" }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Copiar ruta", "Ver en Código", "Borrar"]);
  });

  it("en una nota que solo lee, aunque tenga escritura en otra carpeta, solo copia la ruta", async () => {
    setup("editor", "Pub/a.md");
    await userEvent.click(screen.getByRole("button", { name: "Opciones de la nota" }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Copiar ruta"]);
  });
});
