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

// --- SPEC-0009: chip con ícono, tooltip y nombre accesible (RF-001, RF-002, RF-007) ---

/**
 * Siembra una bóveda con `icon` directamente en la réplica: el servidor y el almacén aún no
 * conocen el campo (PLAN-0009 §6.1, datos simulados), así que se escribe el documento a mano.
 */
async function seedWithIcon(db: PouchDB.Database, name: string, icon: string | null) {
  const vault = await seedStore(db).create({ name, description: null, tags: [] });
  const doc = await db.get(`vault:${vault.id}`);
  await db.put({ ...doc, icon });
  return vault;
}

test("RF-001: el riel dibuja el ícono del documento de la bóveda y sin ícono las iniciales", async () => {
  const { value, db } = syncValue();
  await seedWithIcon(db, "Notas", "star:success");
  await seedWithIcon(db, "Trabajo Personal", null);
  renderRail(value);
  const withIcon = await screen.findByRole("link", { name: "Notas" });
  expect(withIcon.querySelector('svg[data-icon="star"]')).not.toBeNull();
  expect(withIcon.querySelector(".vault-chip")).toHaveStyle({ "--chip-color": "var(--success)" });
  expect(screen.getByRole("link", { name: "TP Trabajo Personal" }).querySelector("svg")).toBeNull();
});

// RF-007 (cambio explícito del plan): con ícono no hay texto visible, así que el nombre accesible es el nombre.
test("RF-007: con ícono el nombre accesible es el nombre de la bóveda; con iniciales no cambia", async () => {
  const { value, db } = syncValue();
  await seedWithIcon(db, "Con ícono", "rocket");
  await seedWithIcon(db, "Con iniciales", "initials:warning");
  renderRail(value);
  expect(await screen.findByRole("link", { name: "Con ícono" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "CO Con iniciales" })).toHaveTextContent("CO");
});

test("RF-002: el tooltip muestra el nombre completo al pasar el cursor y desaparece al salir", async () => {
  const { value, db } = syncValue();
  await seedWithIcon(db, "Una bóveda con un nombre bastante largo", "book");
  const user = renderRail(value);
  const link = await screen.findByRole("link", { name: "Una bóveda con un nombre bastante largo" });

  expect(document.querySelector(".rail-tooltip")).toBeNull();
  await user.hover(link);
  const tip = document.querySelector<HTMLElement>(".rail-tooltip")!;
  expect(tip).toHaveTextContent("Una bóveda con un nombre bastante largo");
  // Fuera del riel (portal en <body>): el `overflow` del riel no lo recorta; decorativo para lectores.
  expect(tip.parentElement).toBe(document.body);
  expect(tip).toHaveAttribute("aria-hidden", "true");
  await user.unhover(link);
  expect(document.querySelector(".rail-tooltip")).toBeNull();
});

test("RF-002: el tooltip también aparece al enfocar con el teclado y se va al perder el foco", async () => {
  const { value, db } = syncValue();
  await seedWithIcon(db, "Alfa", "folder");
  await seedWithIcon(db, "Beta", "heart");
  const user = renderRail(value);
  await screen.findByRole("link", { name: "Alfa" });

  await user.tab();
  expect(document.querySelector(".rail-tooltip")).toHaveTextContent("Alfa");
  await user.tab();
  expect(document.querySelector(".rail-tooltip")).toHaveTextContent("Beta");
  await user.tab(); // sale del riel
  expect(document.querySelector(".rail-tooltip")).toBeNull();
});

test("RF-002: el icono ya no lleva el atributo title nativo (evita el doble tooltip)", async () => {
  const { value, db } = syncValue();
  await seedWithIcon(db, "Notas", null);
  renderRail(value);
  expect(await screen.findByRole("link", { name: "NO Notas" })).not.toHaveAttribute("title");
});
