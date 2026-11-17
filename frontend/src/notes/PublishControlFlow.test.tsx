// H-035: flujo completo del control de publicación (revisión de recursos, publicar, copiar, republicar, despublicar y errores) con el módulo de API real y solo `request` simulado.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/problems";
import PublishControl from "./PublishControl";
import * as api from "./publicationApi";
import type { PublicationCheck, PublicationStatus } from "./publicationApi";

const idle: PublicationStatus = { enabled: true, published: false, token: null, path: null, published_at: null, republished_at: null, stale: false };
const live: PublicationStatus = { ...idle, published: true, token: "tok123", path: "/p/tok123", published_at: "2026-11-17T18:00:00Z" };
const clean: PublicationCheck = { resources: [], external: [], has_private: false };
const withPrivate: PublicationCheck = {
  resources: [
    { id: "a", name: "foto.png", content_type: "image/png", visibility: "public" },
    { id: "b", name: "secreto.png", content_type: "image/png", visibility: "private" },
    { id: "c", name: null, content_type: null, visibility: "missing" },
  ],
  external: ["https://cdn.test/x.png", "https://cdn.test/y.png"],
  has_private: true,
};

const onStatus = vi.fn();
const getHtml = vi.fn<() => string | null>(() => "<h1>Hola</h1>");

function setup(status: PublicationStatus = idle) {
  render(<PublishControl vaultId="v1" noteId="n1" status={status} onStatus={onStatus} getHtml={getHtml} />);
  return userEvent.setup();
}

beforeEach(() => {
  onStatus.mockClear();
  getHtml.mockClear();
  getHtml.mockImplementation(() => "<h1>Hola</h1>");
  vi.spyOn(api, "checkPublication").mockResolvedValue(clean);
});
afterEach(() => vi.restoreAllMocks());

const open = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => user.click(screen.getByRole("button", { name }));

describe("vista de publicar", () => {
  it("revisa los recursos al abrir; la publicación exige la casilla y la revisión terminada", async () => {
    const user = setup();
    await open(user, /publicar en la web/i);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Se creará una copia fija con un enlace público. Cualquier persona que tenga el enlace podrá verla, sin iniciar sesión.")).toBeInTheDocument();
    const publish = within(dialog).getByRole("button", { name: "Publicar" });
    await waitFor(() => expect(api.checkPublication).toHaveBeenCalledWith("v1", "n1", "<h1>Hola</h1>"));
    expect(publish).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: /Entiendo que cualquier persona con el enlace/ }));
    await waitFor(() => expect(publish).toBeEnabled());
  });

  it("con recursos privados lista cada uno, avisa que no los cambia y el botón dice «Publicar de todos modos»", async () => {
    vi.spyOn(api, "checkPublication").mockResolvedValue(withPrivate);
    const user = setup();
    await open(user, /publicar en la web/i);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Hay recursos que no se verán")).toBeInTheDocument();
    expect(within(alert).getByText("«secreto.png» · privado")).toBeInTheDocument();
    expect(within(alert).getByText("Un archivo que no existe o no es tuyo")).toBeInTheDocument();
    expect(within(alert).queryByText(/foto\.png/)).toBeNull();
    expect(within(alert).getByText(/No los cambiamos por ti/)).toBeInTheDocument();
    expect(screen.getByText(/Este documento usa 2 imágenes de otros sitios/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar de todos modos" })).toHaveClass("btn-danger");
  });

  it("si todos los archivos son públicos lo dice, y una sola imagen externa va en singular", async () => {
    vi.spyOn(api, "checkPublication").mockResolvedValue({ resources: [{ id: "a", name: "f.png", content_type: "image/png", visibility: "public" }], external: ["https://x.test/a.png"], has_private: false });
    const user = setup();
    await open(user, /publicar en la web/i);
    expect(await screen.findByText("Los archivos del documento ya son públicos.")).toBeInTheDocument();
    expect(screen.getByText(/Este documento usa 1 imagen de otros sitios/)).toBeInTheDocument();
  });

  it("un fallo de la revisión bloquea la publicación y «Reintentar» la repite", async () => {
    vi.spyOn(api, "checkPublication").mockRejectedValueOnce(new ApiError(500, {})).mockResolvedValue(clean);
    const user = setup();
    await open(user, /publicar en la web/i);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("No se pudo completar la acción. Inténtalo de nuevo.")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Entiendo/ }));
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
    await user.click(within(alert).getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled());
  });

  it("publica con el HTML fresco, avisa a quien lo usa y pasa a la vista del enlace con su mensaje", async () => {
    const publish = vi.spyOn(api, "publishNote").mockResolvedValue(live);
    const user = setup();
    await open(user, /publicar en la web/i);
    await user.click(await screen.findByRole("checkbox", { name: /Entiendo/ }));
    const button = screen.getByRole("button", { name: "Publicar" });
    await waitFor(() => expect(button).toBeEnabled());
    getHtml.mockImplementation(() => "<h1>Fresco</h1>");
    await user.click(button);
    await waitFor(() => expect(publish).toHaveBeenCalledWith("v1", "n1", "<h1>Fresco</h1>"));
    expect(onStatus).toHaveBeenCalledWith(live);
    expect(await screen.findByText("Publicado. Copia el enlace para compartirlo.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Documento publicado" })).toBeInTheDocument();
  });

  it("un error al publicar se muestra y no cierra nada", async () => {
    vi.spyOn(api, "publishNote").mockRejectedValue(new ApiError(409, { type: "urn:synapse:problem:publish-not-enabled" }));
    const user = setup();
    await open(user, /publicar en la web/i);
    await user.click(await screen.findByRole("checkbox", { name: /Entiendo/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Publicar" }));
    expect(await screen.findByText("La plantilla de este documento ya no permite publicarlo.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("vista de publicado", () => {
  it("muestra la URL completa y copia con el portapapeles, con su aviso", async () => {
    const user = setup(live);
    const write = vi.fn().mockResolvedValue(undefined); // después de `setup`: user-event instala su propio portapapeles
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    await open(user, /publicado en la web/i);
    const field = await screen.findByLabelText("Enlace público");
    expect(field).toHaveValue(`${window.location.origin}/p/tok123`);
    await user.click(screen.getByRole("button", { name: "Copiar enlace público" }));
    expect(write).toHaveBeenCalledWith(`${window.location.origin}/p/tok123`);
    expect(await screen.findByText("Enlace copiado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar enlace público" })).toHaveTextContent("Copiado");
  });

  it("sin permiso para copiar deja el enlace seleccionado y lo dice", async () => {
    const user = setup(live);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denegado")) }, configurable: true });
    await open(user, /publicado en la web/i);
    await user.click(await screen.findByRole("button", { name: "Copiar enlace público" }));
    expect(await screen.findByText("Selecciona el enlace y cópialo")).toBeInTheDocument();
  });

  it("«Abrir la página» apunta al enlace en otra pestaña y las fechas van en hora de CDMX", async () => {
    const user = setup({ ...live, republished_at: "2026-11-17T20:30:00Z" });
    await open(user, /publicado en la web/i);
    const link = await screen.findByRole("link", { name: /Abrir la página/ });
    expect(link).toHaveAttribute("href", `${window.location.origin}/p/tok123`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    // es-MX da la hora en 12 h: 18:00 UTC = 12:00 p.m. y 20:30 UTC = 2:30 p.m. en CDMX (UTC-6)
    expect(screen.getByText(/Publicado el .*12:00.* CDMX/)).toBeInTheDocument();
    expect(screen.getByText(/Republicado el .*2:30.* CDMX/)).toBeInTheDocument();
  });

  it("con cambios pendientes avisa y destaca «Republicar», que usa HTML fresco y confirma", async () => {
    const republish = vi.spyOn(api, "republishNote").mockResolvedValue({ ...live, republished_at: "2026-11-17T21:00:00Z" });
    const user = setup({ ...live, stale: true });
    expect(screen.getByRole("button", { name: "Publicado, con cambios sin republicar" })).toHaveAttribute("data-state", "stale");
    await open(user, /con cambios sin republicar/i);
    expect(await screen.findByText("El documento cambió desde la última publicación. La página pública todavía muestra la versión anterior.")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Republicar" });
    expect(button).toHaveClass("btn-primary");
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => expect(republish).toHaveBeenCalledWith("v1", "n1", "<h1>Hola</h1>"));
    expect(onStatus).toHaveBeenCalled();
    expect(await screen.findByText("Republicado. La página pública ya tiene los cambios.")).toBeInTheDocument();
  });

  it("con recursos privados «Republicar» dice «de todos modos»", async () => {
    vi.spyOn(api, "checkPublication").mockResolvedValue(withPrivate);
    const user = setup(live);
    await open(user, /publicado en la web/i);
    expect(await screen.findByRole("button", { name: "Republicar de todos modos" })).toBeInTheDocument();
  });
});

describe("despublicar", () => {
  it("pide confirmar con el texto exacto, «Cancelar» vuelve y confirmar borra, avisa con el estado vacío y cierra", async () => {
    const unpublish = vi.spyOn(api, "unpublishNote").mockResolvedValue(undefined);
    const user = setup({ ...live, stale: true });
    await open(user, /con cambios sin republicar/i);
    await user.click(await screen.findByRole("button", { name: "Despublicar" }));
    expect(screen.getByRole("heading", { name: "¿Despublicar el documento?" })).toBeInTheDocument();
    expect(screen.getByText("Se elimina la copia y el enlace deja de funcionar. Si vuelves a publicar, el enlace será otro.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("heading", { name: "Documento publicado" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Despublicar" }));
    await user.click(screen.getByRole("button", { name: "Despublicar" }));
    await waitFor(() => expect(unpublish).toHaveBeenCalledWith("v1", "n1"));
    expect(onStatus).toHaveBeenCalledWith({ enabled: true, published: false, token: null, path: null, published_at: null, republished_at: null, stale: false });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("si despublicar falla se muestra el error y el diálogo sigue abierto", async () => {
    vi.spyOn(api, "unpublishNote").mockRejectedValue(new ApiError(404, { type: "urn:synapse:problem:not-published" }));
    const user = setup(live);
    await open(user, /publicado en la web/i);
    await user.click(await screen.findByRole("button", { name: "Despublicar" }));
    await user.click(screen.getByRole("button", { name: "Despublicar" }));
    expect(await screen.findByText("Este documento ya no está publicado.")).toBeInTheDocument();
    expect(onStatus).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
