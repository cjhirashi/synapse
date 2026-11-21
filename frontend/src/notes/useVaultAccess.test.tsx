import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test } from "vitest";
import { syncValue, WithSync } from "../test-utils/sync";
import type { SharedInfo } from "../sync/useSync";
import { useVaultAccess } from "./useVaultAccess";

const shared = (over: Partial<SharedInfo> = {}): SharedInfo => ({ vaultId: "v", ownerName: "Ana", readOnly: true, grants: [], ...over });

function access(sharedInfo?: SharedInfo) {
  const { value } = syncValue(sharedInfo ? { shared: sharedInfo } : {});
  const wrapper = ({ children }: { children: ReactNode }) => <WithSync value={value}>{children}</WithSync>;
  return renderHook(() => useVaultAccess(), { wrapper }).result.current;
}

const flags = (v: ReturnType<typeof useVaultAccess>) => ({ isOwner: v.isOwner, canEdit: v.canEdit });
const GRANTS = [{ folder: "Pub", level: "lectura" as const }, { folder: "Docs", level: "escritura" as const }];

test("la dueña de una bóveda propia puede todo, en cualquier ruta", () => {
  const owner = access();
  expect(flags(owner)).toEqual({ isOwner: true, canEdit: true });
  expect(owner.canWrite("Cualquiera/x.md")).toBe(true);
});

test("sin proveedor de sincronización se comporta como la dueña", () => {
  const bare = renderHook(() => useVaultAccess()).result.current;
  expect(flags(bare)).toEqual({ isOwner: true, canEdit: true });
  expect(bare.canWrite("x.md")).toBe(true);
});

test("en una compartida de solo lectura no es dueña, no edita y no escribe en ninguna ruta, ni donde hay concesión", () => {
  const guest = access(shared({ grants: GRANTS }));
  expect(flags(guest)).toEqual({ isOwner: false, canEdit: false });
  expect(guest.canWrite("Docs/a.md")).toBe(false);
});

test("en una compartida editable escribe solo donde la concesión da escritura", () => {
  const guest = access(shared({ readOnly: false, grants: GRANTS }));
  expect(flags(guest)).toEqual({ isOwner: false, canEdit: true });
  expect(guest.canWrite("Docs/a.md")).toBe(true);
  expect(guest.canWrite("Docs/Sub/a.md")).toBe(true);
  expect(guest.canWrite("Pub/a.md")).toBe(false);
  expect(guest.canWrite("Otra/a.md")).toBe(false);
  expect(guest.canWrite("BITACORA/a.md")).toBe(false);
});
