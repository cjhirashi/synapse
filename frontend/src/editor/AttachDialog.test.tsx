import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import AttachDialog from "./AttachDialog";

describe("AttachDialog (H-025 paso 7)", () => {
  const onUpload = vi.fn();
  const onUrl = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    onUpload.mockClear();
    onUrl.mockClear();
    onClose.mockClear();
  });

  it("muestra título y dos botones iniciales: Subir archivo y Pegar URL", () => {
    render(<AttachDialog onUpload={onUpload} onUrl={onUrl} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: /Adjuntar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subir archivo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pegar URL" })).toBeInTheDocument();
  });

  it("tiene foco inicial en el botón Subir archivo", () => {
    const { container } = render(<AttachDialog onUpload={onUpload} onUrl={onUrl} onClose={onClose} />);
    const uploadBtn = screen.getByRole("button", { name: "Subir archivo" });
    expect(uploadBtn).toHaveFocus();
  });

  it("Subir archivo cierra el diálogo y llama a onUpload", async () => {
    const user = userEvent.setup();
    render(<AttachDialog onUpload={onUpload} onUrl={onUrl} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Subir archivo" }));
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Pegar URL muestra el formulario con campo URL, select de tipo e Insertar/Cancelar", async () => {
    const user = userEvent.setup();
    render(<AttachDialog onUpload={onUpload} onUrl={onUrl} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Pegar URL" }));

    expect(screen.getByLabelText("URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Insertar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();

    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
  });

  it("el select tiene 3 opciones: Automático, Imagen, Video de YouTube", async () => {
    const user = userEvent.setup();
    render(<AttachDialog onUpload={onUpload} onUrl={onUrl} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Pegar URL" }));

    const select = screen.getByRole("combobox");
    const options = select.querySelectorAll("option");
    expect(options.length).toBe(3);
    expect(options[0].textContent).toBe("Automático");
    expect(options[1].textContent).toBe("Imagen");
    expect(options[2].textContent).toBe("Video de YouTube");
  });

  it("foco inicial en el campo URL al mostrar el formulario", async () => {
    const user = userEvent.setup();
    render(<AttachDialog onUpload={onUpload} onUrl={onUrl} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Pegar URL" }));
    expect(screen.getByLabelText("URL")).toHaveFocus();
  });

  it("Enter en el campo URL llama a Insertar", async () => {
    const user = userEvent.setup();
    onUrl.mockReturnValue(null);
    render(<AttachDialog onUpload={onUpload} onUrl={onUrl} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Pegar URL" }));
    const input = screen.getByLabelText("URL");
    await user.type(input, "https://example.com");
    await user.keyboard("{Enter}");

    expect(onUrl).toHaveBeenCalledWith("https://example.com", "auto");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Insertar con Automático valida y llama a onUrl", async () => {
    const user = userEvent.setup();
    onUrl.mockReturnValue(null);
    render(<AttachDialog onUpload={onUpload} onUrl={onUrl} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Pegar URL" }));
    await user.type(screen.getByLabelText("URL"), "https://example.com");
    await user.click(screen.getByRole("button", { name: "Insertar" }));

    expect(onUrl).toHaveBeenCalledWith("https://example.com", "auto");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Insertar con URL inválida muestra error en alert", async () => {
    const user = userEvent.setup();
    onUrl.mockReturnValue("URL no válida");
    render(<AttachDialog onUpload={onUpload} onUrl={onUrl} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Pegar URL" }));
    await user.type(screen.getByLabelText("URL"), "no-es-url");
    await user.click(screen.getByRole("button", { name: "Insertar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("URL no válida");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Cancelar cierra el diálogo sin insertar", async () => {
    const user = userEvent.setup();
    render(<AttachDialog onUpload={onUpload} onUrl={onUrl} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Pegar URL" }));
    await user.type(screen.getByLabelText("URL"), "https://example.com");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUrl).not.toHaveBeenCalled();
  });

  it("al desmontarse devuelve el foco al elemento que lo abrió", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<AttachDialog onUpload={onUpload} onUrl={onUrl} onClose={onClose} />);
    expect(opener).not.toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("Shift+Tab desde el primer elemento salta al último", async () => {
    const user = userEvent.setup();
    render(<AttachDialog onUpload={onUpload} onUrl={onUrl} onClose={onClose} />);
    expect(screen.getByRole("button", { name: "Subir archivo" })).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: "Pegar URL" })).toHaveFocus();
  });

  it("Escape cierra el diálogo", async () => {
    const user = userEvent.setup();
    render(<AttachDialog onUpload={onUpload} onUrl={onUrl} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Tab no sale del diálogo (foco atrapado)", async () => {
    const user = userEvent.setup();
    render(<AttachDialog onUpload={onUpload} onUrl={onUrl} onClose={onClose} />);
    const uploadBtn = screen.getByRole("button", { name: "Subir archivo" });
    const pasteUrlBtn = screen.getByRole("button", { name: "Pegar URL" });

    uploadBtn.focus();
    expect(uploadBtn).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(pasteUrlBtn).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(uploadBtn).toHaveFocus();
  });

  it("con el formulario visible, Tab atrapado en form", async () => {
    const user = userEvent.setup();
    onUrl.mockReturnValue(null);
    render(<AttachDialog onUpload={onUpload} onUrl={onUrl} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Pegar URL" }));

    const urlInput = screen.getByLabelText("URL");
    const typeSelect = screen.getByLabelText("Tipo");
    const insertBtn = screen.getByRole("button", { name: "Insertar" });
    const cancelBtn = screen.getByRole("button", { name: "Cancelar" });

    urlInput.focus();
    await user.keyboard("{Tab}");
    expect(typeSelect).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(insertBtn).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(cancelBtn).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(urlInput).toHaveFocus();
  });
});
