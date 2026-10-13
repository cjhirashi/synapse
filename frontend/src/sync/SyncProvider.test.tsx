// Contexto de sincronización (SPEC-0005 RF-009, RF-016, RF-017, RF-018; PLAN-0005 §2.5).
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { useEffect, useState } from "react";
import { memoryDb, memoryEnv, uniqueName } from "../test-utils/sync";
import { createReplicator } from "./replicator";
import type { SyncEnv } from "./resources";
import SyncProvider from "./SyncProvider";
import { useSync } from "./useSync";

const VAULT_ID = "vault:11111111-1111-4111-8111-111111111111";

/** Muestra lo que expone el contexto y deja crear una bóveda. */
function Probe() {
  const sync = useSync();
  return (
    <div>
      <p>estado {sync.status.state}</p>
      <p>rechazos {sync.rejections.length}</p>
      <p>conflictos {sync.conflicts.length}</p>
      <p>versión {sync.dataVersion}</p>
      <button type="button" onClick={() => void sync.vaults.create({ name: "Notas", description: null, tags: [] })}>
        crear
      </button>
    </div>
  );
}

function renderProvider(env: SyncEnv, { sub = "u1", paused = false } = {}) {
  const view = render(
    <MemoryRouter>
      <SyncProvider sub={sub} paused={paused} env={env}>
        <Probe />
      </SyncProvider>
    </MemoryRouter>,
  );
  const rerender = (props: { sub?: string; paused?: boolean }) =>
    view.rerender(
      <MemoryRouter>
        <SyncProvider sub={props.sub ?? sub} paused={props.paused ?? paused} env={env}>
          <Probe />
        </SyncProvider>
      </MemoryRouter>,
    );
  return { ...view, rerender };
}

test("abre la réplica antes de mostrar las páginas y arranca el replicador", async () => {
  const { env, fake } = memoryEnv();
  renderProvider(env);
  expect(screen.getByText("Cargando…")).toBeInTheDocument();
  expect(await screen.findByText("estado syncing")).toBeInTheDocument();
  expect(fake.replicator.start).toHaveBeenCalledTimes(1);
});

test("RF-009: replica con el canal las bóvedas del usuario de la sesión (`owner_id = sub`)", async () => {
  const { env, remote } = memoryEnv({
    createReplicator: (options) => createReplicator({ ...options, locks: null, channelName: uniqueName("canal") }),
  });
  renderProvider(env, { sub: "user-42" });
  await userEvent.click(await screen.findByRole("button", { name: "crear" }));
  await waitFor(async () => {
    const { rows } = await remote.allDocs({ include_docs: true, startkey: "vault:", endkey: "vault:￰" });
    expect(rows.map((row) => row.doc)).toEqual([expect.objectContaining({ name: "Notas", owner_id: "user-42" })]);
  });
  expect(await screen.findByText("estado online")).toBeInTheDocument();
});

test("expone el estado del replicador y los rechazos", async () => {
  const { env, fake } = memoryEnv();
  renderProvider(env);
  await screen.findByText("estado syncing");
  fake.emit({ type: "paused", direction: "push", offline: true });
  expect(await screen.findByText("estado offline")).toBeInTheDocument();
  fake.emit({ type: "denied", id: VAULT_ID, rev: "1-a", reason: "vault-name-taken" });
  expect(await screen.findByText("rechazos 1")).toBeInTheDocument();
});

test("expone los conflictos manuales de la réplica", async () => {
  const { env, localName } = memoryEnv();
  renderProvider(env);
  await screen.findByText("conflictos 0");
  const db = memoryDb(localName);
  const base = { type: "vault", description: null, tags: [], owner_id: "u1", created_at: "t0", updated_at: "t0", deleted_at: null };
  await db.bulkDocs(
    [
      { _id: VAULT_ID, _rev: "1-aaaa", _revisions: { start: 1, ids: ["aaaa"] }, ...base, name: "Uno" },
      { _id: VAULT_ID, _rev: "2-ffff", _revisions: { start: 2, ids: ["ffff", "aaaa"] }, ...base, name: "W" },
      { _id: VAULT_ID, _rev: "2-1111", _revisions: { start: 2, ids: ["1111", "aaaa"] }, ...base, name: "L" },
    ],
    { new_edits: false },
  );
  expect(await screen.findByText("conflictos 1")).toBeInTheDocument();
});

test("`dataVersion` cambia con cada escritura en una bóveda de la réplica", async () => {
  const { env } = memoryEnv();
  renderProvider(env);
  await screen.findByText("versión 0");
  await userEvent.click(screen.getByRole("button", { name: "crear" }));
  expect(await screen.findByText("versión 1")).toBeInTheDocument();
});

test("RF-016: la sesión caducada en el canal detiene el replicador sin tocar la réplica", async () => {
  const { env, fake } = memoryEnv();
  let expire: () => void = () => undefined;
  const remote = env.createRemote!(() => undefined);
  env.createRemote = (onSessionExpired) => {
    expire = onSessionExpired;
    return remote;
  };
  renderProvider(env);
  await screen.findByText("estado syncing");
  expire();
  expect(fake.replicator.sessionExpired).toHaveBeenCalledTimes(1);
});

test("RF-018: con otro usuario la réplica anterior se borra antes de replicar", async () => {
  const { env } = memoryEnv();
  const first = renderProvider(env, { sub: "u1" });
  await userEvent.click(await screen.findByRole("button", { name: "crear" }));
  await screen.findByText("versión 1");
  first.unmount();

  function Count() {
    const { vaults } = useSync();
    const [count, setCount] = useState<number | null>(null);
    useEffect(() => {
      void vaults.list().then((items) => setCount(items.length));
    }, [vaults]);
    return <p>bóvedas {count ?? "…"}</p>;
  }
  render(
    <MemoryRouter>
      <SyncProvider sub="u2" paused={false} env={env}>
        <Count />
      </SyncProvider>
    </MemoryRouter>,
  );
  expect(await screen.findByText("bóvedas 0")).toBeInTheDocument();
});

test("con el cambio de contraseña pendiente no replica (el canal respondería 403) hasta que se cambie", async () => {
  const { env, fake } = memoryEnv();
  const view = renderProvider(env, { paused: true });
  await screen.findByText("estado syncing");
  expect(fake.replicator.start).not.toHaveBeenCalled();
  view.rerender({ paused: false });
  await waitFor(() => expect(fake.replicator.start).toHaveBeenCalledTimes(1));
});

test("al desmontar detiene el replicador", async () => {
  const { env, fake } = memoryEnv();
  const view = renderProvider(env);
  await screen.findByText("estado syncing");
  view.unmount();
  await waitFor(() => expect(fake.replicator.stop).toHaveBeenCalledTimes(1));
});

test("si la réplica no se puede abrir lo avisa", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const { env } = memoryEnv({ localDb: { name: uniqueName("local"), adapter: "no-existe" } });
  renderProvider(env);
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo abrir la copia local de tus bóvedas.");
  vi.restoreAllMocks();
});
