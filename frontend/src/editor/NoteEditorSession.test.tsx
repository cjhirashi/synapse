// Borrador sucio frente al cierre de sesión y las redirecciones (SPEC-0008 RF-008; PLAN-0008
// §11 N-1, N-2). Con el `SyncProvider` real y un data router, como en producción.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { Link, RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/auth";
import { memoryEnv } from "../test-utils/sync";
import LogoutDialog from "../sync/LogoutDialog";
import SyncProvider from "../sync/SyncProvider";
import { useSync } from "../sync/useSync";
import NoteEditor, { type NoteEditorViews, type ViewProps } from "./NoteEditor";

const VAULT = "11111111-1111-4111-8111-111111111111";

function Fake({ value, onChange, label, readOnly }: ViewProps) {
  return <textarea aria-label={label} readOnly={readOnly} value={value} onChange={(e) => onChange(e.target.value)} />;
}
const views: NoteEditorViews = { Visual: Fake, Code: Fake };

/** Crea una nota en la réplica y la abre en el editor, junto a los controles de sesión. */
function Page() {
  const { notes, requestLogout } = useSync();
  const [noteId, setNoteId] = useState<string | null>(null);
  useEffect(() => {
    void notes.create(VAULT, "Primera").then((note) => setNoteId(note.id));
  }, [notes]);
  return (
    <>
      <button type="button" onClick={() => void requestLogout()}>
        Cerrar sesión
      </button>
      <Link to="/login">ir a login</Link>
      <Link to="/work?q=1">misma ruta</Link>
      <LogoutDialog />
      {noteId && <NoteEditor noteId={noteId} views={views} />}
    </>
  );
}

async function setup() {
  const { env } = memoryEnv();
  const logout = vi.spyOn(api, "logout").mockResolvedValue(undefined as never);
  const router = createMemoryRouter(
    [
      { path: "/login", element: <p>pantalla login</p> },
      {
        path: "*",
        element: (
          <SyncProvider sub="u1" paused={false} env={env}>
            <Page />
          </SyncProvider>
        ),
      },
    ],
    { initialEntries: ["/work"] },
  );
  render(<RouterProvider router={router} />);
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: "Primera" });
  await user.click(screen.getByRole("button", { name: "Editar" }));
  await user.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
  return { user, logout, router };
}

afterEach(() => vi.restoreAllMocks());

describe("cerrar sesión con el borrador sucio (N-1)", () => {
  // RF-008
  it("avisa en el diálogo de salida ANTES de cerrar la sesión; cancelar no cierra nada", async () => {
    const { user, logout, router } = await setup();
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Hay cambios sin guardar en una nota")).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(logout).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/work");
    expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveValue("!");
  });

  // RF-008
  it("'Salir y descartar' cierra la sesión y va a /login sin el diálogo del editor", async () => {
    const { user, logout } = await setup();
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Salir y descartar" }));
    await screen.findByText("pantalla login");
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("navegaciones que el editor no debe bloquear (N-1, N-2)", () => {
  // RF-008
  it("una redirección a /login (401) no se bloquea", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("link", { name: "ir a login" }));
    await screen.findByText("pantalla login");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  // RF-008
  it("una navegación a la misma ruta (otro search) no se bloquea", async () => {
    const { user, router } = await setup();
    await user.click(screen.getByRole("link", { name: "misma ruta" }));
    expect(router.state.location.search).toBe("?q=1");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveValue("!");
  });
});
