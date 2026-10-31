import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FilesPage from "./FilesPage";
import { WithSync, syncValue } from "../test-utils/sync";
import * as uploadFileModule from "./uploadFile";

const SAMPLE_VAULT = { id: "vault-1", name: "Mi bóveda", icon: "", color: "", deleted_at: null, rev: "1" };

describe("FilesPage", () => {
  beforeEach(() => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue([]);
  });

  it("renders heading and vault selector (C-7)", async () => {
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
    });
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );
    expect(screen.getByRole("heading", { name: /Archivos/i })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("combobox", { name: /Bóveda/i })).toBeInTheDocument());
  });

  it("shows loading state initially (C-7)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
    });
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );
    await waitFor(() => expect(screen.getByText(/Cargando/i)).toBeTruthy());
  });

  it("shows empty state when no files (C-7)", async () => {
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
    });
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );
    await screen.findByText(/La lista está vacía/i);
  });

  it("shows error state on failure (C-7)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockRejectedValue(new Error("Network error"));
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
    });
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );
    await screen.findByRole("alert");
  });
});
