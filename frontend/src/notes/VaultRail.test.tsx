// Riel de bóvedas (SPEC-0008 RF-001; PLAN-0008 §2.6).
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
  expect(screen.getByRole("link", { name: "CI Con iniciales" })).toHaveTextContent("CI");
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

  // Las dos bóvedas se crean con el mismo `created_at` (cada `seedStore` reinicia su reloj): su orden
  // en el riel depende del id, así que se comprueba el conjunto y no la posición.
  await user.tab(); // el primer foco es el botón de expandir/colapsar (H-008 C-1), se salta
  const names: string[] = [];
  for (let n = 0; n < 2; n++) {
    await user.tab();
    names.push(document.querySelector(".rail-tooltip")!.textContent!);
  }
  expect(names.sort()).toEqual(["Alfa", "Beta"]);
  await user.tab(); // sale del riel
  expect(document.querySelector(".rail-tooltip")).toBeNull();
});

test("RF-002: el icono ya no lleva el atributo title nativo (evita el doble tooltip)", async () => {
  const { value, db } = syncValue();
  await seedWithIcon(db, "Notas", null);
  renderRail(value);
  expect(await screen.findByRole("link", { name: "NO Notas" })).not.toHaveAttribute("title");
});

// --- H-008: riel expandible (C-1…C-5) ---

test("C-1/C-5: el riel tiene al inicio un botón que alterna expandir/colapsar, con nombre accesible claro", async () => {
  const { value, db } = syncValue();
  await seedWithIcon(db, "Notas", "star:success");
  const user = renderRail(value);
  const rail = await screen.findByRole("navigation", { name: "Bóvedas abiertas" });
  const toggle = within(rail).getByRole("button", { name: "Expandir riel de bóvedas" });
  // Va al inicio del riel (es su primer elemento, antes de la lista de bóvedas).
  expect(rail.firstElementChild).toBe(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  // Operable por teclado (es un <button>): al activarlo cambia de estado y de nombre accesible.
  toggle.focus();
  expect(toggle).toHaveFocus();
  await user.keyboard("[Space]");
  const collapse = within(rail).getByRole("button", { name: "Colapsar riel de bóvedas" });
  expect(collapse).toHaveAttribute("aria-expanded", "true");
});

test("C-2: el riel carga colapsado (sin el nombre completo visible) y sigue colapsado en una carga nueva", async () => {
  const { value, db } = syncValue();
  await seedWithIcon(db, "Trabajo Personal", null);
  const first = renderRail(value);
  const link = await screen.findByRole("link", { name: "TP Trabajo Personal" });
  // Colapsado: sólo las iniciales como texto, nunca el nombre completo.
  expect(link).toHaveTextContent("TP");
  expect(link).not.toHaveTextContent("Trabajo Personal");
  // Lo expandimos…
  await first.click(screen.getByRole("button", { name: "Expandir riel de bóvedas" }));
  expect(screen.getByRole("link", { name: "Trabajo Personal" })).toHaveTextContent("Trabajo Personal");
  // …y una carga nueva (sin persistencia) vuelve a empezar colapsada.
  cleanup();
  renderRail(value);
  await screen.findByRole("navigation", { name: "Bóvedas abiertas" });
  expect(screen.getByRole("button", { name: "Expandir riel de bóvedas" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Colapsar riel de bóvedas" })).toBeNull();
});

test("C-3: expandido, cada bóveda es una píldora con su nombre completo visible, en el mismo orden", async () => {
  const { value, db } = syncValue();
  const store = seedStore(db);
  await store.create({ name: "Trabajo Personal", description: null, tags: [] });
  await store.create({ name: "Notas", description: null, tags: [] });
  const user = renderRail(value);
  await screen.findByRole("link", { name: / Notas$/ });
  const order = () => screen.getAllByRole("link").map((l) => l.textContent);
  const collapsed = order();
  await user.click(screen.getByRole("button", { name: "Expandir riel de bóvedas" }));
  // El nombre completo aparece como texto en cada enlace…
  expect(screen.getByRole("link", { name: "Trabajo Personal" })).toHaveTextContent("Trabajo Personal");
  expect(screen.getByRole("link", { name: "Notas" })).toHaveTextContent("Notas");
  // …y el orden de las bóvedas no cambia respecto a colapsado.
  expect(order().map((t, i) => t!.startsWith(collapsed[i]!.slice(0, 2)))).toEqual([true, true]);
});

test("C-4: expandido, el nombre accesible del enlace es el nombre (sin duplicar iniciales) y no sale tooltip", async () => {
  const { value, db } = syncValue();
  await seedWithIcon(db, "Trabajo Personal", null);
  const user = renderRail(value);
  await screen.findByRole("link", { name: "TP Trabajo Personal" });
  await user.click(screen.getByRole("button", { name: "Expandir riel de bóvedas" }));
  // Con el nombre ya visible, el enlace no repite las iniciales en su nombre accesible.
  const link = screen.getByRole("link", { name: "Trabajo Personal" });
  expect(screen.queryByRole("link", { name: "TP Trabajo Personal" })).toBeNull();
  // Y el tooltip (que en colapsado muestra el nombre) no hace falta: no aparece al pasar el cursor.
  await user.hover(link);
  expect(document.querySelector(".rail-tooltip")).toBeNull();
});

// RF-012: el cambio de ícono hecho en la réplica llega al riel sin recargar (se relee con `dataVersion`).
test("RF-012: un icon cambiado en la réplica se refleja en el chip del riel sin recargar", async () => {
  const { value, db } = syncValue();
  const vault = await seedStore(db).create({ name: "Notas", description: null, tags: [], icon: "star:success" });
  const view = (version: number) => (
    <WithSync value={{ ...value, dataVersion: version }}>
      <MemoryRouter>
        <VaultRail />
      </MemoryRouter>
    </WithSync>
  );
  const { rerender } = render(view(0));
  const link = await screen.findByRole("link", { name: "Notas" });
  expect(link.querySelector('svg[data-icon="star"]')).not.toBeNull();

  await value.vaults.update(vault.id, { icon: "rocket:danger" }, vault.rev);
  rerender(view(1));
  await waitFor(() => expect(screen.getByRole("link", { name: "Notas" }).querySelector('svg[data-icon="rocket"]')).not.toBeNull());
  expect(screen.getByRole("link", { name: "Notas" }).querySelector(".vault-chip")).toHaveStyle({ "--chip-color": "var(--danger)" });
});
