// H-064 F7c-2: IndexView desactiva edición en bóvedas compartidas.
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { syncValue, WithSync } from "../test-utils/sync";
import { useVaultAccess } from "./useVaultAccess";

function setup(shared = false) {
  const { value } = syncValue(shared ? { shared: { vaultId: "v", ownerName: "Ana", readOnly: true, grants: [] } } : {});
  const wrapper = ({ children }: { children: ReactNode }) => <WithSync value={value}>{children}</WithSync>;
  return renderHook(() => useVaultAccess(), { wrapper }).result.current;
}

describe("IndexView acceso", () => {
  it("como propietaria puede editar (canEdit=true)", () => {
    const access = setup(false);
    expect(access.canEdit).toBe(true);
  });

  it("en bóveda compartida de solo lectura no puede editar (canEdit=false)", () => {
    const access = setup(true);
    expect(access.canEdit).toBe(false);
  });
});
