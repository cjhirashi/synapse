import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FilesPage from "./FilesPage";
import { WithSync, syncValue } from "../test-utils/sync";
import * as uploadFileModule from "./uploadFile";

import type { VaultFile } from "./uploadFile";

const SAMPLE_VAULT = { id: "vault-1", name: "Mi bóveda", icon: "", color: "", deleted_at: null, rev: "1" };

const SAMPLE_FILES: VaultFile[] = [
  {
    id: "file-1",
    vault_id: "vault-1",
    name: "documento.pdf",
    content_type: "application/pdf",
    size: 1024 * 512,
    visibility: "private",
    created_at: "2026-10-31T10:00:00Z",
    references_count: 2,
  },
  {
    id: "file-2",
    vault_id: "vault-1",
    name: "hoja.xlsx",
    content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 1024 * 100,
    visibility: "public",
    created_at: "2026-10-30T15:30:00Z",
    references_count: 0,
  },
];

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

  it("displays file list with metadata (C-7, C-9)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
    });
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );

    // Must show both files in table
    const pdfRow = await screen.findByText("documento.pdf");
    expect(pdfRow).toBeInTheDocument();
    expect(screen.getByText("hoja.xlsx")).toBeInTheDocument();

    // Must show file types
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("Excel")).toBeInTheDocument();

    // Must show reference count (C-9)
    const row = pdfRow.closest("tr");
    expect(row?.textContent).toContain("2");
  });

  it("filters files by name search (C-7)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
    });
    const user = userEvent.setup();
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );

    // Both files shown initially
    await screen.findByText("documento.pdf");
    expect(screen.getByText("hoja.xlsx")).toBeInTheDocument();

    // Filter by "pdf" — only documento.pdf shown
    const searchInput = await screen.findByRole("searchbox", { name: /Buscar/i });
    await user.type(searchInput, "pdf");
    expect(screen.getByText("documento.pdf")).toBeInTheDocument();
    expect(screen.queryByText("hoja.xlsx")).not.toBeInTheDocument();

    // Clear search — both shown again
    await user.clear(searchInput);
    expect(screen.getByText("documento.pdf")).toBeInTheDocument();
    expect(screen.getByText("hoja.xlsx")).toBeInTheDocument();
  });

  it("shows action buttons for each file (C-7)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
    });
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );

    // Must show action buttons for each file (descargar, copiar link, renombrar, visibilidad, borrar)
    const pdfRow = await screen.findByText("documento.pdf");
    expect(pdfRow.closest("tr")?.querySelector("button")).toBeTruthy();
  });
});
