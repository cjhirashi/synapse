// Las réplicas de bóvedas compartidas se limpian con la sesión (H-064 F7c): al entrar otra cuenta y al cerrar sesión.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import * as api from "../api/auth";
import { memoryEnv, uniqueName } from "../test-utils/sync";
import { rememberSharedReplica } from "./sharedReplicas";
import SyncProvider from "./SyncProvider";
import { useSync } from "./useSync";

PouchDB.plugin(memory);
const MEMORY = { adapter: "memory" };

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

async function sharedReplica(sub: string) {
  const name = uniqueName("synapse-shared-sesion");
  await new PouchDB(name, MEMORY).put({ _id: "doc", dato: "de otra persona" });
  rememberSharedReplica(name, sub);
  return name;
}
const docCount = async (name: string) => (await new PouchDB(name, MEMORY).info()).doc_count;

function Exit() {
  const { requestLogout } = useSync();
  return <button type="button" onClick={() => void requestLogout()}>Cerrar sesión</button>;
}

function renderProvider(env: ReturnType<typeof memoryEnv>["env"]) {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/login" element={<p>pantalla login</p>} />
        <Route path="*" element={<SyncProvider sub="u1" paused={false} env={env}><Exit /></SyncProvider>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

test("al abrir la sesión de u1 destruye las réplicas compartidas de otra cuenta y conserva las de u1", async () => {
  const [mine, theirs] = [await sharedReplica("u1"), await sharedReplica("u2")];
  renderProvider(memoryEnv().env);
  await screen.findByRole("button", { name: "Cerrar sesión" });
  expect(await docCount(theirs)).toBe(0);
  expect(await docCount(mine)).toBe(1);
  expect(JSON.parse(localStorage.getItem("synapse-shared-replicas")!)).toEqual([{ name: mine, sub: "u1" }]);
});

test("al cerrar sesión destruye TODAS las réplicas compartidas, también las de la propia cuenta", async () => {
  vi.spyOn(api, "logout").mockResolvedValue();
  const [mine, theirs] = [await sharedReplica("u1"), await sharedReplica("u1")];
  const user = renderProvider(memoryEnv().env);
  await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByText("pantalla login")).toBeInTheDocument();
  await waitFor(async () => expect([await docCount(mine), await docCount(theirs)]).toEqual([0, 0]));
  expect(JSON.parse(localStorage.getItem("synapse-shared-replicas") ?? "[]")).toEqual([]);
});

test("si el servidor no cierra la sesión, las réplicas compartidas se conservan", async () => {
  vi.spyOn(api, "logout").mockRejectedValue(new Error("sin red"));
  const mine = await sharedReplica("u1");
  const user = renderProvider(memoryEnv().env);
  await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
  await waitFor(() => expect(api.logout).toHaveBeenCalled());
  expect(screen.queryByText("pantalla login")).toBeNull();
  expect(await docCount(mine)).toBe(1);
});
