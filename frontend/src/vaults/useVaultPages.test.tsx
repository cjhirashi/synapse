import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import * as api from "../api/vaults";
import type { Vault, VaultPage } from "../api/vaults";
import { useVaultPages } from "./useVaultPages";

function vault(n: number): Vault {
  return {
    id: `id-${n}`,
    name: `Bóveda ${n}`,
    description: null,
    tags: [],
    owner_id: "u1",
    created_at: "2026-10-12T09:00:00.000000Z",
    updated_at: "2026-10-12T09:00:00.000000Z",
    deleted_at: null,
    etag: `"${n}-a"`,
  };
}

/** Promesa que el test resuelve cuando quiere, para ordenar respuestas a mano. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

afterEach(() => vi.restoreAllMocks());

test("RF-018: una recarga durante «Cargar más» descarta la página vieja que llega después", async () => {
  // PLAN-0003 §15 (VA-9): la página 2 de la lista anterior no se mezcla con la recargada.
  const more = deferred<VaultPage>();
  vi.spyOn(api, "listVaults")
    .mockResolvedValueOnce({ items: [vault(1)], next_cursor: "c1" })
    .mockReturnValueOnce(more.promise)
    .mockResolvedValueOnce({ items: [vault(9)], next_cursor: null });
  const { result } = renderHook(() => useVaultPages(false), { wrapper });
  await waitFor(() => expect(result.current.status).toBe("ready"));

  let loading!: Promise<void>;
  act(() => {
    loading = result.current.loadMore();
  });
  await act(() => result.current.reload());
  await act(async () => {
    more.resolve({ items: [vault(2)], next_cursor: "c2" });
    await loading;
  });

  expect(result.current.items.map((v) => v.id)).toEqual(["id-9"]);
  expect(result.current.nextCursor).toBeNull();
  expect(result.current.loadingMore).toBe(false);
});

test("RF-018: de dos recargas seguidas manda la última aunque la primera responda después", async () => {
  const first = deferred<VaultPage>();
  vi.spyOn(api, "listVaults")
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ items: [vault(2)], next_cursor: null });
  const { result } = renderHook(() => useVaultPages(false), { wrapper });
  await act(() => result.current.reload());
  await act(async () => first.resolve({ items: [vault(1)], next_cursor: "c1" }));

  expect(result.current.items.map((v) => v.id)).toEqual(["id-2"]);
  expect(result.current.status).toBe("ready");
});
