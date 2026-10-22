// Salir de la bóveda con un borrador sucio por navegación interna (SPEC-0008 RF-008;
// PLAN-0008 §10 VF-1). `useBlocker` sólo existe en data routers, así que se monta con
// `createMemoryRouter`, igual que `main.tsx` en producción.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, RouterProvider, createMemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { memoryDb, syncValue, WithSync } from "../test-utils/sync";
import { seedStore } from "../test-utils/sync";
import VaultRail from "../notes/VaultRail";
import { createNoteStore } from "../notes/noteStore";
import NoteEditor, { type NoteEditorViews, type ViewProps } from "./NoteEditor";

const VAULT = "11111111-1111-4111-8111-111111111111";

/** Editor falso: un textarea que lee y escribe el mismo texto. */
function Fake({ value, onChange, label, readOnly }: ViewProps) {
  return <textarea aria-label={label} readOnly={readOnly} value={value} onChange={(e) => onChange(e.target.value)} />;
}
const views: NoteEditorViews = { Visual: Fake, Code: Fake };

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

async function setup() {
  const db = memoryDb();
  const { value } = syncValue({}, db);
  const vault = await seedStore(db).create({ name: "Notas", description: null, tags: [] });
  const note = await createNoteStore(db).create(vault.id, "Primera");
  await value.notes.save(note.id, "uno", note.rev);
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <WithSync value={value}>
            <VaultRail />
            <Link to="/vaults">Bóvedas</Link>
            <Where />
            <NoteEditor noteId={note.id} views={views} />
          </WithSync>
        ),
      },
    ],
    { initialEntries: [`/vaults/${vault.id}`] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Primera" });
  const user = userEvent.setup();
  return { user, value, note, vault };
}

/** Deja la nota con un borrador sucio ("uno!"). */
async function makeDirty(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Editar" }));
  await user.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
}

const links = [
  ["el enlace 'Bóvedas'", () => screen.getByRole("link", { name: "Bóvedas" }), "/vaults"],
  ["el riel", () => screen.getByRole("link", { name: "Notas" }), null],
] as const;

describe.each(links)("navegar por %s con el borrador sucio", (_name, target, expected) => {
  // RF-008
  it("muestra el diálogo y no navega hasta decidir", async () => {
    const { user, vault } = await setup();
    await screen.findByRole("link", { name: "Notas" }); // el riel ya cargó
    await makeDirty(user);
    await user.click(target());
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: "Guardar y salir" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(`/vaults/${vault.id}`);
  });

  // RF-008
  it("'Seguir editando' se queda con el borrador", async () => {
    const { user, vault } = await setup();
    await screen.findByRole("link", { name: "Notas" });
    await makeDirty(user);
    await user.click(target());
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByTestId("where")).toHaveTextContent(`/vaults/${vault.id}`);
    expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveValue("uno!");
  });

  // RF-008
  it("'Descartar y salir' navega sin guardar", async () => {
    const { user, value, note, vault } = await setup();
    await screen.findByRole("link", { name: "Notas" });
    await makeDirty(user);
    await user.click(target());
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Descartar y salir" }));
    expect(screen.getByTestId("where")).toHaveTextContent(expected ?? `/vaults/${vault.id}`);
    expect((await value.notes.get(note.id)).content).toBe("uno");
  });

  // RF-008
  it("'Guardar y salir' guarda y navega", async () => {
    const { user, value, note } = await setup();
    await screen.findByRole("link", { name: "Notas" });
    await makeDirty(user);
    await user.click(target());
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Guardar y salir" }));
    await screen.findByTestId("where");
    expect((await value.notes.get(note.id)).content).toBe("uno!");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("sin cambios sin guardar", () => {
  // RF-008
  it("navega sin preguntar", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("link", { name: "Bóvedas" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByTestId("where")).toHaveTextContent("/vaults");
    expect(screen.getByTestId("where").textContent).toBe("/vaults");
  });
});
