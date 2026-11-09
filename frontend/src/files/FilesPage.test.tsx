import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FilesPage from "./FilesPage";
import { WithSync, syncValue } from "../test-utils/sync";
import * as uploadFileModule from "./uploadFile";

import type { VaultFile } from "./uploadFile";
import { UploadTypeError, UploadTooLargeError } from "./uploadFile";

/** Almacén de notas real en forma (list/get), no un Map: así el test ejerce la misma API que la app. */
function emptyNotes() {
  return { list: vi.fn().mockResolvedValue([]), get: vi.fn() } as any;
}

function notesWith(items: Array<{ id: string; path: string; rev: string; content: string }>) {
  return {
    list: vi.fn().mockResolvedValue(items.map(({ id, path, rev }) => ({ id, path, rev, updated_at: "", deleted_at: null, size: 1 }))),
    get: vi.fn((id: string) => Promise.resolve(items.find((n) => n.id === id))),
  } as any;
}

const FILE1 = "11111111-1111-4111-8111-111111111111";
const SAMPLE_VAULT = { id: "vault-1", name: "Mi bóveda", icon: "", color: "", deleted_at: null, rev: "1" };

const SAMPLE_FILES: VaultFile[] = [
  {
    id: FILE1,
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
      notes: emptyNotes(),
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
      notes: emptyNotes(),
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
      notes: emptyNotes(),
    });
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );
    await screen.findByText(/Aún no hay archivos/i);
  });

  it("shows error state on failure (C-7)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockRejectedValue(new Error("Network error"));
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
      notes: emptyNotes(),
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
      notes: emptyNotes(),
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
      notes: emptyNotes(),
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
      notes: emptyNotes(),
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
      notes: emptyNotes(),
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
    expect(uploadFileModule.renameFile).toHaveBeenCalledWith(FILE1, "nuevo_nombre.pdf");
  });

  it("set visibility to public requires confirmation (C-8)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
    vi.spyOn(uploadFileModule, "setFileVisibility").mockResolvedValue({
      ...SAMPLE_FILES[0],
      visibility: "public",
    });
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
      notes: emptyNotes(),
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

    expect(uploadFileModule.setFileVisibility).toHaveBeenCalledWith(FILE1, "public");
  });

  it("delete file with references shows list of referencing documents (C-6, C-9)", async () => {
    const notes = notesWith([
      { id: "note-1", path: "Trabajo/Proyecto", rev: "1", content: `Vea el archivo: https://synapse.cjhirashi.com/files/${FILE1} aquí.` },
      { id: "note-2", path: "Personal/Recordatorios", rev: "1", content: `Anexo: https://synapse.cjhirashi.com/files/${FILE1} para referencia.` },
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

    expect(uploadFileModule.deleteFile).toHaveBeenCalledWith(FILE1);
  });

  it("shows error notice on API failure (C-7, C-11)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
    const mockError = new Error("Network error");
    vi.spyOn(uploadFileModule, "renameFile").mockRejectedValue(mockError);
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
      notes: emptyNotes(),
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
      notes: emptyNotes(),
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
      notes: emptyNotes(),
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
      notes: emptyNotes(),
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
      notes: emptyNotes(),
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

  // jsdom no ejerce el arrastre real del navegador: aquí sólo se comprueba el cableado drop → uploadFile.
  it("soltar archivos sobre la pantalla los sube a la bóveda seleccionada (C-7)", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue([]);
    const upload = vi.spyOn(uploadFileModule, "uploadFile").mockResolvedValue({ ...SAMPLE_FILES[1], id: "nuevo" } as any);
    const { value } = syncValue({ vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any, notes: emptyNotes() });
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>,
    );
    await screen.findByText(/Aún no hay archivos/i);
    const file = new File(["hola"], "nota.txt", { type: "text/plain" });
    fireEvent.drop(screen.getByRole("heading", { name: /Archivos/i }).closest("section")!, { dataTransfer: { files: [file], types: ["Files"] } });
    await waitFor(() => expect(upload).toHaveBeenCalledWith(file, "vault-1", undefined));
    expect(await screen.findByText("hoja.xlsx")).toBeInTheDocument();
  });

  // H-019 paso 5: botón «Incrustado» solo para archivos HTML
  it("H-019: fila text/html muestra botón «Incrustado» que copia el markup al portapapeles", async () => {
    const htmlFile: VaultFile = {
      id: "html-file-id",
      vault_id: "vault-1",
      name: "widget.html",
      content_type: "text/html",
      size: 512,
      visibility: "public",
      created_at: "2026-10-31T10:00:00Z",
      references_count: 1,
    };
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue([htmlFile]);
    const mockClipboard = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
      notes: emptyNotes(),
    });
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );

    await screen.findByText("widget.html");
    const embedButton = screen.getByRole("button", { name: "Copiar incrustado de widget.html" });
    await userEvent.click(embedButton);

    await waitFor(() =>
      expect(mockClipboard).toHaveBeenCalledWith(
        '<iframe src="https://synapse.cjhirashi.com/files/html-file-id"></iframe>'
      )
    );
    expect(await screen.findByText("Incrustado copiado.")).toBeInTheDocument();
  });

  it("H-019: fila application/pdf NO muestra botón «Incrustado»", async () => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue([SAMPLE_FILES[0]]); // PDF
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
      notes: emptyNotes(),
    });
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );

    const pdfRow = await screen.findByText("documento.pdf");
    const buttons = pdfRow.closest("tr")?.querySelectorAll("button");
    const embedButton = Array.from(buttons || []).find((btn) => btn.textContent?.includes("Incrustado"));
    expect(embedButton).toBeUndefined();
  });

  it("H-019: fila image/png NO muestra botón «Incrustado»", async () => {
    const imageFile: VaultFile = {
      id: "img-id",
      vault_id: "vault-1",
      name: "foto.png",
      content_type: "image/png",
      size: 256,
      visibility: "private",
      created_at: "2026-10-31T10:00:00Z",
      references_count: 0,
    };
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue([imageFile]);
    const { value } = syncValue({
      vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
      notes: emptyNotes(),
    });
    render(
      <WithSync value={value}>
        <FilesPage />
      </WithSync>
    );

    const imgRow = await screen.findByText("foto.png");
    const buttons = imgRow.closest("tr")?.querySelectorAll("button");
    const embedButton = Array.from(buttons || []).find((btn) => btn.textContent?.includes("Incrustado"));
    expect(embedButton).toBeUndefined();
  });
});


// --- H-046: carpetas con subniveles, mover y tabla ---

const treeBtn = async (name: string) =>
  within(await screen.findByRole("list", { name: "Carpetas de archivos" })).findByRole("button", { name });

function renderPage(listFolders: string[] = []) {
  vi.spyOn(uploadFileModule, "listFileFolders").mockResolvedValue(listFolders);
  const { value } = syncValue({
    vaults: { list: vi.fn().mockResolvedValue([SAMPLE_VAULT]) } as any,
    notes: emptyNotes(),
  });
  return render(
    <WithSync value={value}>
      <FilesPage />
    </WithSync>,
  );
}

describe("FilesPage con carpetas (H-046)", () => {
  beforeEach(() => {
    vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
  });

  it("muestra el árbol de carpetas con subniveles y la raíz", async () => {
    renderPage(["Portafolio", "Portafolio/Synapse", "Otros"]);
    const tree = await screen.findByRole("list", { name: "Carpetas de archivos" });
    expect(await treeBtn("Raíz")).toHaveAttribute("aria-current", "true");
    expect(tree).toHaveTextContent("Portafolio");
    expect(tree).toHaveTextContent("Otros");
    expect(tree).not.toHaveTextContent("Synapse"); // el subnivel está plegado hasta abrir su carpeta
    await userEvent.click(await treeBtn("Portafolio"));
    expect(await treeBtn("Synapse")).toBeInTheDocument();
  });

  it("al abrir una carpeta lista solo sus archivos y la ruta aparece arriba", async () => {
    const list = vi.spyOn(uploadFileModule, "listVaultFiles").mockResolvedValue(SAMPLE_FILES);
    renderPage(["Portafolio"]);
    await userEvent.click(await treeBtn("Portafolio"));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith("vault-1", "Portafolio"));
    const crumbs = screen.getByRole("navigation", { name: "Ruta de la carpeta" });
    expect(crumbs).toHaveTextContent("Raíz");
    expect(crumbs).toHaveTextContent("Portafolio");
  });

  it("subir con una carpeta abierta manda el archivo a esa carpeta", async () => {
    const upload = vi.spyOn(uploadFileModule, "uploadFile").mockResolvedValue({ ...SAMPLE_FILES[1], id: "nuevo" } as any);
    renderPage(["Portafolio"]);
    await userEvent.click(await treeBtn("Portafolio"));
    const file = new File(["x"], "a.txt", { type: "text/plain" });
    await userEvent.upload(document.querySelector<HTMLInputElement>("#file-upload-input")!, file);
    await waitFor(() => expect(upload).toHaveBeenCalledWith(file, "vault-1", "Portafolio"));
  });

  it("«Nueva carpeta» crea la carpeta dentro de la abierta y la abre", async () => {
    const create = vi.spyOn(uploadFileModule, "createFileFolder").mockResolvedValue(["Portafolio", "Portafolio/Capturas"]);
    renderPage(["Portafolio"]);
    await userEvent.click(await treeBtn("Portafolio"));
    await userEvent.click(screen.getByRole("button", { name: /Nueva carpeta/ }));
    await userEvent.type(screen.getByLabelText(/Nombre \(se crea en «Portafolio»\)/), "Capturas");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith("vault-1", "Portafolio/Capturas"));
    expect(await screen.findByRole("status")).toHaveTextContent("Carpeta «Portafolio/Capturas» creada.");
  });

  it("rechaza en el cliente un nombre de carpeta con barra", async () => {
    const create = vi.spyOn(uploadFileModule, "createFileFolder").mockResolvedValue([]);
    renderPage([]);
    await userEvent.click(await screen.findByRole("button", { name: /Nueva carpeta/ }));
    await userEvent.type(screen.getByLabelText(/Nombre/), "a/b");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No puede llevar");
    expect(create).not.toHaveBeenCalled();
  });

  it("«Mover» cambia el archivo de carpeta y lo quita de la lista actual", async () => {
    const move = vi.spyOn(uploadFileModule, "moveFile").mockResolvedValue({ ...SAMPLE_FILES[0], folder: "Archivo" } as any);
    renderPage(["Archivo"]);
    await userEvent.click(await screen.findByRole("button", { name: "Mover documento.pdf" }));
    await userEvent.selectOptions(screen.getByLabelText("Carpeta de destino"), "Archivo");
    await userEvent.click(screen.getByRole("button", { name: "Mover" }));
    await waitFor(() => expect(move).toHaveBeenCalledWith(FILE1, "Archivo"));
    await waitFor(() => expect(screen.queryByText("documento.pdf")).not.toBeInTheDocument());
    expect(screen.getByText("hoja.xlsx")).toBeInTheDocument();
  });

  it("soltar un archivo sobre una carpeta del árbol lo mueve", async () => {
    const move = vi.spyOn(uploadFileModule, "moveFile").mockResolvedValue({ ...SAMPLE_FILES[0], folder: "Archivo" } as any);
    renderPage(["Archivo"]);
    const folder = await treeBtn("Archivo");
    fireEvent.drop(folder, { dataTransfer: { types: ["application/x-synapse-file"], getData: (t: string) => (t === "application/x-synapse-file" ? FILE1 : "") } });
    await waitFor(() => expect(move).toHaveBeenCalledWith(FILE1, "Archivo"));
  });

  it("mover una carpeta dentro de sí misma se avisa y no llama al servidor", async () => {
    const moveFolder = vi.spyOn(uploadFileModule, "moveFileFolder").mockResolvedValue({ moved_files: 0 });
    renderPage(["A", "A/B"]);
    await userEvent.click(await treeBtn("A"));
    const inner = await treeBtn("B");
    fireEvent.drop(inner, { dataTransfer: { types: ["application/x-synapse-file-folder"], getData: (t: string) => (t === "application/x-synapse-file-folder" ? "A" : "") } });
    expect(await screen.findByRole("alert")).toHaveTextContent("dentro de sí misma");
    expect(moveFolder).not.toHaveBeenCalled();
  });

  it("borrar una carpeta con archivos muestra el motivo que da el servidor", async () => {
    vi.spyOn(uploadFileModule, "deleteFileFolder").mockRejectedValue(new Error("The folder still contains files"));
    renderPage(["Docs"]);
    await userEvent.click(await screen.findByRole("button", { name: "Acciones de Docs" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Borrar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Borrar carpeta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("still contains files");
  });

  it("la tabla ordena al pulsar un encabezado", async () => {
    renderPage([]);
    await screen.findByText("documento.pdf");
    const names = () => screen.getAllByRole("row").slice(1).map((r) => r.querySelector("td")?.textContent ?? "");
    expect(names()[0]).toContain("documento.pdf"); // por fecha descendente: el más reciente primero
    await userEvent.click(screen.getByRole("button", { name: /^Nombre/ }));
    expect(names()[0]).toContain("documento.pdf"); // A→Z
    await userEvent.click(screen.getByRole("button", { name: /^Nombre/ }));
    expect(names()[0]).toContain("hoja.xlsx"); // Z→A
  });
});
