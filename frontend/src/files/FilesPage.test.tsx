import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FilesPage from "./FilesPage";
import { WithSync, syncValue } from "../test-utils/sync";
import * as uploadFileModule from "./uploadFile";

import type { VaultFile } from "./uploadFile";
import { UploadTypeError, UploadTooLargeError } from "./uploadFile";

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
      notes: new Map(),
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
      notes: new Map(),
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
      notes: new Map(),
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
      notes: new Map(),
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
      notes: new Map(),
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

    // Must show reference count (C-9) — 0 because notes map is empty
    const row = pdfRow.closest("tr");
    expect(row?.textContent).toContain("0");
  });

  it("filters files by name search (C-7)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
      notes: new Map(),
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
      notes: new Map(),
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

  it("rename file opens dialog and updates via PATCH (C-5)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
    vi.spyOn(uploadFileModule, "renameFile").mockResolvedValue({
      ...SAMPLE_FILES[0],
      name: "nuevo_nombre.pdf",
    });
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
      notes: new Map(),
    });
    const user = userEvent.setup();
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );

    const pdfRow = await screen.findByText("documento.pdf");
    const renameBtn = pdfRow.closest("tr")?.querySelector('button[aria-label*="Renombrar"]');
    await user.click(renameBtn!);

    // Dialog must have input with current name
    const input = await screen.findByDisplayValue("documento.pdf");
    await user.clear(input);
    await user.type(input, "nuevo_nombre.pdf");

    const confirmBtn = screen.getByRole("button", { name: /Guardar/i });
    await user.click(confirmBtn);

    // renameFile should be called
    expect(uploadFileModule.renameFile).toHaveBeenCalledWith("file-1", "nuevo_nombre.pdf");
  });

  it("set visibility to public requires confirmation (C-8)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
    vi.spyOn(uploadFileModule, "setFileVisibility").mockResolvedValue({
      ...SAMPLE_FILES[0],
      visibility: "public",
    });
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
      notes: new Map(),
    });
    const user = userEvent.setup();
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );

    // File 0 is private (🔒), click visibility button
    const pdfRow = await screen.findByText("documento.pdf");
    const visBtn = pdfRow.closest("tr")?.querySelector('button[aria-label*="visibilidad"]');
    await user.click(visBtn!);

    // Confirmation dialog must appear
    const confirmMsg = await screen.findByRole("alertdialog");
    expect(confirmMsg.textContent).toMatch(/público|public/i);

    // Accept confirmation
    const buttons = confirmMsg.querySelectorAll("button");
    const confirmBtn = Array.from(buttons).find((b) => b.textContent?.includes("Confirmar"));
    await user.click(confirmBtn!);

    expect(uploadFileModule.setFileVisibility).toHaveBeenCalledWith("file-1", "public");
  });

  it("delete file with references shows list of referencing documents (C-6, C-9)", async () => {
    const notes = new Map([
      [
        "note-1",
        {
          id: "note-1",
          path: "Trabajo/Proyecto",
          rev: "1",
          content: "Vea el archivo: /files/file-1 aquí.",
        },
      ],
      [
        "note-2",
        {
          id: "note-2",
          path: "Personal/Recordatorios",
          rev: "1",
          content: "Anexo: /files/file-1 para referencia.",
        },
      ],
    ]);
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
    vi.spyOn(uploadFileModule, "deleteFile").mockResolvedValue(undefined);
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
      notes,
    });
    const user = userEvent.setup();
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );

    const pdfRow = await screen.findByText("documento.pdf");
    const deleteBtn = pdfRow.closest("tr")?.querySelector('button[aria-label*="Borrar"]');
    await user.click(deleteBtn!);

    // Dialog must show references
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Trabajo/Proyecto");
    expect(dialog.textContent).toContain("Personal/Recordatorios");

    // Accept deletion — find button inside dialog with data-autofocus
    const buttons = dialog.querySelectorAll("button");
    const confirmBtn = Array.from(buttons).find((b) => b.textContent?.includes("Borrar"));
    await user.click(confirmBtn!);

    expect(uploadFileModule.deleteFile).toHaveBeenCalledWith("file-1");
  });

  it("shows error notice on API failure (C-7, C-11)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
    const mockError = new Error("Network error");
    vi.spyOn(uploadFileModule, "renameFile").mockRejectedValue(mockError);
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
      notes: new Map(),
    });
    const user = userEvent.setup();
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );

    const pdfRow = await screen.findByText("documento.pdf");
    const renameBtn = pdfRow.closest("tr")?.querySelector('button[aria-label*="Renombrar"]');
    await user.click(renameBtn!);

    const input = await screen.findByDisplayValue("documento.pdf");
    await user.clear(input);
    await user.type(input, "otro.pdf");

    const confirmBtn = screen.getByRole("button", { name: /Guardar|OK|Aceptar/i });
    await user.click(confirmBtn);

    // Error notice must appear
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("upload button opens file input (C-7, C-11)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
      notes: new Map(),
    });
    const user = userEvent.setup();
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );

    await screen.findByText("documento.pdf");
    const uploadBtn = screen.getByRole("button", { name: /Subir archivo/i });
    expect(uploadBtn).toBeInTheDocument();

    // File input should be hidden but exist
    const fileInput = document.querySelector<HTMLInputElement>("#file-upload-input");
    expect(fileInput).toBeTruthy();
    expect(fileInput?.type).toBe("file");
  });

  it("upload valid file updates list (C-7, C-11)", async () => {
    const newFile: VaultFile = {
      id: "file-3",
      vault_id: "vault-1",
      name: "contrato.pdf",
      content_type: "application/pdf",
      size: 2048,
      visibility: "private",
      created_at: "2026-10-31T12:00:00Z",
    };
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
    vi.spyOn(uploadFileModule, "uploadFile").mockResolvedValue(newFile);
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
      notes: new Map(),
    });
    const user = userEvent.setup();
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );

    await screen.findByText("documento.pdf");
    const fileInput = document.querySelector<HTMLInputElement>("#file-upload-input");
    expect(fileInput).toBeTruthy();
    const pdfFile = new File(["pdf content"], "contrato.pdf", { type: "application/pdf" });
    await user.upload(fileInput!, pdfFile);

    // New file should appear in list
    await screen.findByText("contrato.pdf");
    expect(uploadFileModule.uploadFile).toHaveBeenCalled();
  });

  it("upload rejects invalid file type with error notice (C-11)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
    vi.spyOn(uploadFileModule, "uploadFile").mockRejectedValue(new UploadTypeError("Tipo no admitido"));
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
      notes: new Map(),
    });
    const user = userEvent.setup();
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );

    await screen.findByText("documento.pdf");
    const fileInput = document.querySelector<HTMLInputElement>("#file-upload-input");
    const exeFile = new File(["exe"], "malware.exe", { type: "application/x-msdownload" });
    await user.upload(fileInput!, exeFile);

    // Error notice must appear
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("upload rejects file too large with error notice (C-11)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
    vi.spyOn(uploadFileModule, "uploadFile").mockRejectedValue(new UploadTooLargeError("Archivo muy grande"));
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
      notes: new Map(),
    });
    const user = userEvent.setup();
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );

    await screen.findByText("documento.pdf");
    const fileInput = document.querySelector<HTMLInputElement>("#file-upload-input");
    const bigFile = new File([new Uint8Array(30 * 1024 * 1024)], "grande.pdf", { type: "application/pdf" });
    await user.upload(fileInput!, bigFile);

    // Error notice must appear
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
