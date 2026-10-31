import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FilesPage from "./FilesPage";
import * as useSync from "../sync/useSync";
import * as uploadFileModule from "./uploadFile";

describe("FilesPage", () => {
  beforeEach(() => {
    vi.spyOn(useSync, "useSync").mockReturnValue({
      vaults: new Map([
        ["vault-1", { id: "vault-1", name: "Mi bóveda", icon: "", color: "", deleted_at: null, rev: "1" }],
      ]),
      notes: new Map(),
      user: { sub: "user-1", email: "test@example.com" },
      pendingNotes: new Set(),
      pendingVaults: new Set(),
      requestLogout: vi.fn(),
    } as any);

    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue([]);
  });

  it("renders heading and vault selector (C-7)", () => {
    render(<FilesPage />);
    expect(screen.getByRole("heading", { name: /Archivos/i })).toBeTruthy();
  });

  it("shows loading state initially (C-7)", () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );
    render(<FilesPage />);
    expect(screen.getByText(/Cargando/i)).toBeTruthy();
  });

  it("shows empty state when no files (C-7)", async () => {
    render(<FilesPage />);
    await screen.findByText(/La lista está vacía/i);
  });

  it("shows error state on failure (C-7)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockRejectedValue(new Error("Network error"));
    render(<FilesPage />);
    await screen.findByRole("alert");
  });
});
