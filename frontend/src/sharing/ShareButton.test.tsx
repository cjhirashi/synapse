import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { MeContext } from "../auth/RequireAuth";
import type { Me } from "../api/auth";
import ShareButton from "./ShareButton";
import * as api from "./sharingApi";

afterEach(() => vi.restoreAllMocks());

const me = (canShare: boolean | undefined): Me => ({
  user_id: "u1", email: "a@b.c", role: "guest", must_change_password: false, display_name: null, photo_url: null, can_share_vaults: canShare,
});
const notes = [{ path: "Docs/Sub/nota.md" }, { path: "BITACORA/2026-11-20.md" }, { path: "raiz.md" }];
const shown = (canShare: boolean | undefined) =>
  render(<MeContext.Provider value={me(canShare)}><ShareButton vaultId="v-1" vaultName="Plan" notes={notes} /></MeContext.Provider>);

test("el botón abre el diálogo con las carpetas de las notas y se cierra", async () => {
  vi.spyOn(api, "listMembers").mockResolvedValue({ items: [] });
  shown(true);
  expect(screen.queryByRole("dialog")).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Compartir esta bóveda" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("Plan");

  // Personalizado ofrece «Toda la bóveda» y las carpetas reales (sin la reservada BITACORA).
  await userEvent.click(screen.getByRole("radio", { name: "Personalizado" }));
  const options = Array.from(screen.getByLabelText("Carpeta").querySelectorAll("option")).map((o) => o.textContent);
  expect(options).toEqual(["Toda la bóveda", "Docs", "Docs/Sub"]);

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("sin permiso para compartir (apagado o desconocido) el botón no aparece", () => {
  for (const flag of [false, undefined]) {
    const { unmount } = shown(flag);
    expect(screen.queryByRole("button", { name: "Compartir esta bóveda" })).toBeNull();
    unmount();
  }
});
