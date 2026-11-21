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

test("la dueña de una bóveda propia puede todo", () => {
  expect(access()).toEqual({ isOwner: true, canEdit: true });
});

test("sin proveedor de sincronización se comporta como la dueña", () => {
  expect(renderHook(() => useVaultAccess()).result.current).toEqual({ isOwner: true, canEdit: true });
});

test("en una bóveda compartida de solo lectura no es dueña y no edita", () => {
  expect(access(shared())).toEqual({ isOwner: false, canEdit: false });
});

test("en una compartida editable no es dueña pero edita", () => {
  expect(access(shared({ readOnly: false }))).toEqual({ isOwner: false, canEdit: true });
});
