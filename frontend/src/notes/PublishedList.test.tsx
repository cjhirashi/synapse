import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublishedList from "./PublishedList";
import * as api from "./publicationApi";
import type { PublishedItem } from "./publicationApi";
import { formatCdmx as formatCdmxRaw } from "./cdmxTime";

// getByText normaliza los espacios (también el de no separación) del texto de la página, no el esperado.
const formatCdmx = (iso: string) => formatCdmxRaw(iso).replace(/\u00a0/g, " ");

const item1: PublishedItem = {
  note_id: "uuid1",
  note_path: "carpeta/nota1",
  title: "Documento Uno",
  token: "tok1",
  path: "/p/tok1",
  published_at: "2026-11-17T18:00:00Z",
  republished_at: null,
  unpublish_at: "2026-11-18T20:00:00Z",
  stale: false,
  deleted: false,
};

const item2: PublishedItem = {
  note_id: "uuid2",
  note_path: null,
  title: "Documento Dos",
  token: "tok2",
  path: "/p/tok2",
  published_at: "2026-11-16T10:00:00Z",
  republished_at: "2026-11-17T10:00:00Z",
  unpublish_at: null,
  stale: true,
  deleted: false,
};

const deletedItem: PublishedItem = {
  note_id: "uuid3",
  note_path: "carpeta/borrada",
  title: "Documento Borrado",
  token: "tok3",
  path: "/p/tok3",
  published_at: "2026-11-15T12:00:00Z",
  republished_at: null,
  unpublish_at: null,
  stale: false,
  deleted: true,
};

function setup(items: PublishedItem[] = [item1, item2]) {
  const onOpenNote = vi.fn();
  vi.spyOn(api, "listPublications").mockResolvedValue(items);
  render(<PublishedList vaultId="v1" onOpenNote={onOpenNote} />);
  return { onOpenNote };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-17T20:30:00Z") });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PublishedList", () => {
  it("carga y muestra lista con 2 elementos", async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText("Documentos publicados")).toBeInTheDocument();
      expect(screen.getByText("2 documentos")).toBeInTheDocument();
    });
    expect(screen.getByText("Documento Uno")).toBeInTheDocument();
    expect(screen.getByText("Documento Dos")).toBeInTheDocument();
  });

  it("muestra titulo, ruta, y textos exactos de fechas", async () => {
    setup([item1]);
    await waitFor(() => {
      expect(screen.getByText("Documento Uno")).toBeInTheDocument();
      expect(screen.getByText("carpeta/nota1")).toBeInTheDocument();
    });
    expect(screen.getByText(`Publicado el ${formatCdmx("2026-11-17T18:00:00Z")}`)).toBeInTheDocument();
    expect(screen.getByText(`Se despublicará el ${formatCdmx("2026-11-18T20:00:00Z")}`)).toBeInTheDocument();
    expect(formatCdmx("2026-11-17T18:00:00Z")).toMatch(/12:00.*CDMX$/); // 18:00 UTC = 12:00 CDMX
    expect(screen.queryByText("Sin fecha de despublicación")).toBeNull();
  });

  it("muestra etiqueta 'Documento borrado' para item deleted", async () => {
    setup([deletedItem]);
    await waitFor(() => {
      expect(screen.getByText("Documento Borrado")).toBeInTheDocument();
    });
    expect(screen.getByText("Documento borrado")).toBeInTheDocument();
  });

  it("muestra etiqueta 'Con cambios sin republicar' si stale y no deleted", async () => {
    setup([item2]);
    await waitFor(() => {
      expect(screen.getByText("Documento Dos")).toBeInTheDocument();
    });
    expect(screen.getByText("Con cambios sin republicar")).toBeInTheDocument();
  });

  it("no muestra boton 'Ver documento' si deleted", async () => {
    setup([deletedItem]);
    await waitFor(() => {
      expect(screen.getByText("Documento Borrado")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Ver documento" })).not.toBeInTheDocument();
  });

  it("muestra boton 'Ver documento' si no deleted", async () => {
    setup([item1]);
    await waitFor(() => {
      expect(screen.getByText("Documento Uno")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Ver documento/ })).toBeInTheDocument();
  });

  it("'Ver documento' llama onOpenNote con id exacto note:v1:<uuid>", async () => {
    const { onOpenNote } = setup([item1]);
    await waitFor(() => {
      expect(screen.getByText("Documento Uno")).toBeInTheDocument();
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Ver documento/ }));
    expect(onOpenNote).toHaveBeenCalledWith("note:v1:uuid1");
  });

  it("'Copiar enlace' escribe URL absoluta en portapapeles y cambia texto a 'Copiado' 2s", async () => {
    setup([item1]);
    await waitFor(() => {
      expect(screen.getByText("Documento Uno")).toBeInTheDocument();
    });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await user.click(screen.getAllByRole("button", { name: /Copiar enlace/ })[0]);
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/tok1`);
      expect(screen.getByText("Copiado")).toBeInTheDocument();
    });
  });

  it("vacío muestra 'Aún no has publicado ningún documento'", async () => {
    setup([]);
    await waitFor(() => {
      expect(screen.getByText("Aún no has publicado ningún documento. Se publican desde el globo junto a «PDF» al leer un documento.")).toBeInTheDocument();
    });
  });

  it("error muestra mensaje y boton 'Reintentar'", async () => {
    vi.spyOn(api, "listPublications").mockRejectedValue(new Error("Network error"));
    render(<PublishedList vaultId="v1" onOpenNote={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    });
  });

  it("'Despu blicar' pide confirmación en línea, llama DELETE, y quita tarjeta", async () => {
    const unpublish = vi.spyOn(api, "unpublishNote").mockResolvedValue(undefined);
    setup([item1]);
    await waitFor(() => {
      expect(screen.getByText("Documento Uno")).toBeInTheDocument();
    });
    const user = userEvent.setup();
    const buttons = screen.getAllByRole("button", { name: /Despublicar/ });
    await user.click(buttons[0]);
    // Debe mostrar el texto de confirmación
    await waitFor(() => {
      expect(screen.getByText("Se elimina la copia y el enlace deja de funcionar. Si vuelves a publicar, el enlace será otro.")).toBeInTheDocument();
    });
    // Click en el botón de confirmar
    const confirmBtn = within(screen.getByText("Se elimina la copia y el enlace deja de funcionar. Si vuelves a publicar, el enlace será otro.").closest("div")!).getByRole("button", { name: "Despublicar" });
    await user.click(confirmBtn);
    await waitFor(() => {
      expect(unpublish).toHaveBeenCalledWith("v1", "uuid1");
      expect(screen.queryByText("Documento Uno")).not.toBeInTheDocument();
    });
  });

  it("'Fecha de despublicación' abre editor en línea con ExpiryPicker, 'Guardar fecha' llama PUT con ISO exacto y actualiza", async () => {
    const setExpiry = vi.spyOn(api, "setPublicationExpiry").mockResolvedValue({
      enabled: true,
      published: true,
      token: "tok1",
      path: "/p/tok1",
      published_at: "2026-11-17T18:00:00Z",
      republished_at: null,
      stale: false,
      unpublish_at: "2026-11-18T10:00:00Z",
    });
    setup([item1]);
    await waitFor(() => {
      expect(screen.getByText("Documento Uno")).toBeInTheDocument();
    });
    const user = userEvent.setup();
    const buttons = screen.getAllByRole("button", { name: /Fecha de despublicación/ });
    await user.click(buttons[0]);
    await waitFor(() => {
      expect(screen.getByDisplayValue("2026-11-18T14:00")).toBeInTheDocument();
    });
    // Cambiar la fecha
    const input = screen.getByDisplayValue("2026-11-18T14:00");
    fireEvent.change(input, { target: { value: "2026-11-18T10:00" } });
    // Guardar
    const saveBtn = screen.getByRole("button", { name: "Guardar fecha" });
    await user.click(saveBtn);
    await waitFor(() => {
      expect(setExpiry).toHaveBeenCalledWith("v1", "uuid1", "2026-11-18T16:00:00.000Z");
    });
    expect(await screen.findByText(`Se despublicará el ${formatCdmx("2026-11-18T10:00:00Z")}`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar fecha" })).toBeNull();
  });

  it("si copiar falla muestra el enlace en un campo de solo lectura para copiarlo a mano", async () => {
    setup([item1]);
    await screen.findByText("Documento Uno");
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denegado"));
    await userEvent.setup().click(screen.getByRole("button", { name: /Copiar enlace/ }));
    expect(await screen.findByText("Selecciona el enlace y cópialo")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Enlace público" })).toHaveValue(`${window.location.origin}/p/tok1`);
    expect(screen.getByRole("textbox", { name: "Enlace público" })).toHaveAttribute("readonly");
  });

  it("'Quitar fecha' solo se muestra si ya tenía unpublish_at y llama con null", async () => {
    const setExpiry = vi.spyOn(api, "setPublicationExpiry").mockResolvedValue({
      enabled: true,
      published: true,
      token: "tok1",
      path: "/p/tok1",
      published_at: "2026-11-17T18:00:00Z",
      republished_at: null,
      stale: false,
      unpublish_at: null,
    });
    setup([item1]);
    await waitFor(() => {
      expect(screen.getByText("Documento Uno")).toBeInTheDocument();
    });
    const user = userEvent.setup();
    const buttons = screen.getAllByRole("button", { name: /Fecha de despublicación/ });
    await user.click(buttons[0]);
    await waitFor(() => {
      expect(screen.getByDisplayValue("2026-11-18T14:00")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Quitar fecha" })).toBeInTheDocument();
    });
    const removeBtn = screen.getByRole("button", { name: "Quitar fecha" });
    await user.click(removeBtn);
    await waitFor(() => {
      expect(setExpiry).toHaveBeenCalledWith("v1", "uuid1", null);
    });
  });

  it("error en acción se ve en role='alert' dentro de tarjeta", async () => {
    vi.spyOn(api, "unpublishNote").mockRejectedValue(new Error("Server error"));
    setup([item1]);
    await waitFor(() => {
      expect(screen.getByText("Documento Uno")).toBeInTheDocument();
    });
    const user = userEvent.setup();
    const buttons = screen.getAllByRole("button", { name: /Despublicar/ });
    await user.click(buttons[0]);
    await waitFor(() => {
      expect(screen.getByText("Se elimina la copia y el enlace deja de funcionar. Si vuelves a publicar, el enlace será otro.")).toBeInTheDocument();
    });
    const confirmBtn = within(screen.getByText("Se elimina la copia y el enlace deja de funcionar. Si vuelves a publicar, el enlace será otro.").closest("div")!).getByRole("button", { name: "Despublicar" });
    await user.click(confirmBtn);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
