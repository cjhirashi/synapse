// Riel de bóvedas (SPEC-0008 RF-001; PLAN-0008 §2.6).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { expect, test } from "vitest";
import { seedStore, syncValue, WithSync } from "../test-utils/sync";
import type { SyncContextValue } from "../sync/useSync";
import VaultRail from "./VaultRail";

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderRail(value: SyncContextValue, path = "/vaults") {
  render(
    <WithSync value={value}>
      <MemoryRouter initialEntries={[path]}>
        <VaultRail />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </WithSync>,
  );
  return userEvent.setup();
}

test("RF-001: un icono con iniciales por bóveda activa, sin las de la papelera", async () => {
  const { value, db } = syncValue();
  const store = seedStore(db);
  await store.create({ name: "Trabajo Personal", description: null, tags: [] });
  await store.create({ name: "Notas", description: null, tags: [] });
  const gone = await store.create({ name: "Vieja", description: null, tags: [] });
  await store.softDelete(gone.id, gone.rev);
  renderRail(value);
  const rail = await screen.findByRole("navigation", { name: "Bóvedas abiertas" });
  await within(rail).findByRole("link", { name: / Notas$/ });
  expect(within(rail).getAllByRole("link").map((link) => link.textContent)).toEqual(["NO", "TP"]);
  expect(within(rail).queryByRole("link", { name: / Vieja$/ })).toBeNull();
});

test("RF-001: el click navega a /vaults/{id}", async () => {
  const { value, db } = syncValue();
  const vault = await seedStore(db).create({ name: "Notas", description: null, tags: [] });
  const user = renderRail(value);
  await user.click(await screen.findByRole("link", { name: / Notas$/ }));
  expect(screen.getByTestId("where")).toHaveTextContent(`/vaults/${vault.id}`);
});

test("RF-001: la bóveda abierta se marca con aria-current", async () => {
  const { value, db } = syncValue();
  const store = seedStore(db);
  const a = await store.create({ name: "Alfa", description: null, tags: [] });
  await store.create({ name: "Beta", description: null, tags: [] });
  renderRail(value, `/vaults/${a.id}`);
  expect(await screen.findByRole("link", { name: / Alfa$/ })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: / Beta$/ })).not.toHaveAttribute("aria-current");
});

test("RF-001: sin bóvedas el riel no muestra enlaces", async () => {
  const { value } = syncValue();
  renderRail(value);
  expect(await screen.findByRole("navigation", { name: "Bóvedas abiertas" })).toBeInTheDocument();
  expect(screen.queryAllByRole("link")).toHaveLength(0);
});

test("RF-001: se relee cuando cambian las bóvedas (dataVersion)", async () => {
  const { value, db } = syncValue();
  const store = seedStore(db);
  const view = (version: number) => (
    <WithSync value={{ ...value, dataVersion: version }}>
      <MemoryRouter>
        <VaultRail />
      </MemoryRouter>
    </WithSync>
  );
  const { rerender } = render(view(0));
  await screen.findByRole("navigation", { name: "Bóvedas abiertas" });
  await store.create({ name: "Llegó", description: null, tags: [] });
  rerender(view(1));
  expect(await screen.findByRole("link", { name: / Llegó$/ })).toBeInTheDocument();
});

// U-4 (PLAN-0008 §17, WCAG 2.5.3): el nombre accesible empieza por las iniciales visibles.
test("RF-001: el nombre accesible del icono incluye las iniciales visibles", async () => {
  const { value, db } = syncValue();
  await seedStore(db).create({ name: "Trabajo Personal", description: null, tags: [] });
  renderRail(value);
  expect(await screen.findByRole("link", { name: "TP Trabajo Personal" })).toHaveTextContent("TP");
});
