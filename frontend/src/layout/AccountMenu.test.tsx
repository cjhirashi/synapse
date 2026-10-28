import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { MeContext } from "../auth/RequireAuth";
import { syncValue, WithSync } from "../test-utils/sync";
import AccountMenu from "./AccountMenu";

const ME = { user_id: "1", email: "admin@synapse.test", role: "admin" as const, must_change_password: false };

function setup() {
  render(
    <MeContext.Provider value={ME}>
      <WithSync value={syncValue().value}>
        <MemoryRouter>
          <AccountMenu />
        </MemoryRouter>
      </WithSync>
    </MeContext.Provider>,
  );
  return userEvent.setup();
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: `Menú de cuenta (${ME.email})` }));
}

afterEach(() => vi.restoreAllMocks());

test("C-5: el menú incluye un enlace a «API keys» junto a «Cambiar contraseña»", async () => {
  const user = setup();
  await openMenu(user);

  const changePwd = screen.getByRole("link", { name: "Cambiar contraseña" });
  const apiKeys = screen.getByRole("link", { name: "API keys" });
  expect(apiKeys).toHaveAttribute("href", "/settings/api-keys");
  // Uno junto al otro, en el mismo menú: «API keys» viene tras «Cambiar contraseña».
  expect(changePwd.compareDocumentPosition(apiKeys) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("C-5: al elegir «API keys» el menú se cierra", async () => {
  const user = setup();
  await openMenu(user);
  await user.click(screen.getByRole("link", { name: "API keys" }));
  expect(screen.queryByRole("link", { name: "API keys" })).not.toBeInTheDocument();
});
