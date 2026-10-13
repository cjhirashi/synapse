// Lista de bóvedas sobre la réplica local: recargas y páginas en memoria (SPEC-0005 RF-009; PLAN-0003 §15, VA-9).
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { SyncContextValue } from "../sync/useSync";
import type { Vault } from "../sync/vaultStore";
import { syncValue, WithSync } from "../test-utils/sync";
import { PAGE_SIZE, useVaultPages } from "./useVaultPages";

afterEach(() => vi.restoreAllMocks());

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
    rev: `1-${n}`,
  };
}

/** Promesa que el test resuelve cuando quiere, para ordenar respuestas a mano. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

/**
 * El hook dentro de un contexto que la prueba cambia con `rerender({ value })`
 * (el `wrapper` de `renderHook` no recibe props, así que lo monta un componente propio).
 */
function renderPages(value: SyncContextValue) {
  const result = { current: null as unknown as ReturnType<typeof useVaultPages> };
  function Probe() {
    result.current = useVaultPages(false);
    return null;
  }
  const tree = (current: SyncContextValue) => (
    <WithSync value={current}>
      <Probe />
    </WithSync>
  );
  const view = render(tree(value));
  return { result, rerender: ({ value: next }: { value: SyncContextValue }) => view.rerender(tree(next)) };
}

test("RF-018: de dos recargas seguidas manda la última aunque la primera responda después", async () => {
  const { value } = syncValue();
  const first = deferred<Vault[]>();
  vi.spyOn(value.vaults, "list").mockReturnValueOnce(first.promise).mockResolvedValueOnce([vault(2)]);
  const { result } = renderPages(value);
  await act(() => result.current.reload());
  await act(async () => first.resolve([vault(1)]));

  expect(result.current.items.map((v) => v.id)).toEqual(["id-2"]);
  expect(result.current.status).toBe("ready");
});

test("RF-009: muestra páginas de PAGE_SIZE y «Cargar más» añade otra sin leer de nuevo", async () => {
  const { value } = syncValue();
  const all = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => vault(i + 1));
  const list = vi.spyOn(value.vaults, "list").mockResolvedValue(all);
  const { result } = renderPages(value);
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(PAGE_SIZE).toBe(50);
  expect(result.current.items).toHaveLength(PAGE_SIZE);
  expect(result.current.hasMore).toBe(true);

  act(() => result.current.loadMore());
  expect(result.current.items).toHaveLength(PAGE_SIZE + 1);
  expect(result.current.hasMore).toBe(false);
  expect(list).toHaveBeenCalledOnce();
});

test("RF-009: con otra `dataVersion` recarga sin volver a «loading» y conserva cuántas se ven", async () => {
  const { value } = syncValue();
  const list = vi
    .spyOn(value.vaults, "list")
    .mockResolvedValueOnce(Array.from({ length: PAGE_SIZE + 1 }, (_, i) => vault(i + 1)))
    .mockResolvedValueOnce(Array.from({ length: PAGE_SIZE + 2 }, (_, i) => vault(i + 1)));
  const { result, rerender } = renderPages(value);
  await waitFor(() => expect(result.current.status).toBe("ready"));
  act(() => result.current.loadMore());

  const statuses: string[] = [];
  rerender({ value: { ...value, dataVersion: 1 } });
  statuses.push(result.current.status);
  await waitFor(() => expect(result.current.items).toHaveLength(PAGE_SIZE + 2));
  statuses.push(result.current.status);

  expect(statuses).toEqual(["ready", "ready"]);
  expect(list).toHaveBeenCalledTimes(2);
});
