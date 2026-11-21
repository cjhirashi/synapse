// «Compartidas conmigo» limpia las copias locales de bóvedas de las que ya no se es miembro (H-064 F7e).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MeContext } from "../auth/RequireAuth";
import type { Me } from "../api/auth";
import { uniqueName } from "../test-utils/sync";
import { rememberSharedReplica } from "../sync/sharedReplicas";
import SharedWithMePage from "./SharedWithMePage";
import * as api from "./sharingApi";

PouchDB.plugin(memory);
const ME: Me = { user_id: "u1", email: "u1@example.com", role: "guest", must_change_password: false, display_name: null, photo_url: null };
const KEPT = "11111111-1111-4111-8111-111111111111";
const LOST = "22222222-2222-4222-8222-222222222222";
const PENDING = "33333333-3333-4333-8333-333333333333";

const invitation = (vault_id: string, status: "activo" | "pendiente"): api.Invitation => ({
  id: `m-${vault_id}`, vault_id, status, created_at: "2026-11-20T10:00:00Z", responded_at: null,
  owner: { id: "o1", email: "ana@example.com", display_name: "Ana" }, vault_name: `Bóveda ${vault_id.slice(0, 2)}`, grants: [{ folder: "*", level: "lectura" }],
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

async function replica(vault: string, sub = "u1") {
  const name = `${uniqueName("synapse")}-shared-${vault}`;
  await new PouchDB(name, { adapter: "memory" }).put({ _id: "x", dato: "de otra persona" });
  rememberSharedReplica(name, sub);
  return name;
}
const docs = async (name: string) => (await new PouchDB(name, { adapter: "memory" }).info()).doc_count;
const registry = () => (JSON.parse(localStorage.getItem("synapse-shared-replicas") ?? "[]") as Array<{ name: string }>).map((e) => e.name);

function renderPage(sub: Me | null = ME) {
  return render(
    <MeContext.Provider value={sub}>
      <MemoryRouter><SharedWithMePage /></MemoryRouter>
    </MeContext.Provider>,
  );
}

test("destruye la copia de una bóveda que ya no está entre las activas y conserva la de las activas", async () => {
  const [kept, lost, pending] = [await replica(KEPT), await replica(LOST), await replica(PENDING)];
  vi.spyOn(api, "listInvitations").mockResolvedValue({ items: [invitation(KEPT, "activo"), invitation(PENDING, "pendiente")] });
  renderPage();
  await screen.findByText("Bóveda 11");
  await expect.poll(registry, { timeout: 6000 }).toEqual([kept]);
  expect(await docs(lost)).toBe(0);
  expect(await docs(kept)).toBe(1);
  expect(await docs(pending)).toBe(0); // una invitación pendiente no da acceso: su copia sobra
  expect(registry()).toEqual([kept]);
});

test("al salir de una bóveda, al recargar la lista se destruye su copia", async () => {
  const name = await replica(KEPT);
  vi.spyOn(api, "listInvitations").mockResolvedValueOnce({ items: [invitation(KEPT, "activo")] }).mockResolvedValue({ items: [] });
  vi.spyOn(api, "leaveInvitation").mockResolvedValue();
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: /Salir de/ }));
  await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Salir" }));
  await expect.poll(registry, { timeout: 6000 }).toEqual([]);
  expect(await docs(name)).toBe(0);
  expect(registry()).toEqual([]);
});

test("nunca toca las copias de otra cuenta", async () => {
  const theirs = await replica(LOST, "u2");
  vi.spyOn(api, "listInvitations").mockResolvedValue({ items: [] });
  renderPage();
  await screen.findByText("Nadie ha compartido bóvedas contigo todavía.");
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(await docs(theirs)).toBe(1);
});

test("si la lista falla no destruye nada", async () => {
  const name = await replica(KEPT);
  vi.spyOn(api, "listInvitations").mockRejectedValue(new Error("sin red"));
  renderPage();
  await screen.findByRole("alert");
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(await docs(name)).toBe(1);
});

test("sin sesión conocida no limpia (no sabría de quién son las copias)", async () => {
  const name = await replica(LOST);
  vi.spyOn(api, "listInvitations").mockResolvedValue({ items: [] });
  renderPage(null);
  await screen.findByText("Nadie ha compartido bóvedas contigo todavía.");
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(await docs(name)).toBe(1);
});
