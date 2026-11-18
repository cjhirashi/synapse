// H-035: flujo completo del control de publicación (revisión de recursos, publicar, copiar, republicar, despublicar y errores) con el módulo de API real y solo `request` simulado.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/problems";
import PublishControl from "./PublishControl";
import * as api from "./publicationApi";
import * as files from "../files/uploadFile";
import type { PublicationCheck, PublicationStatus } from "./publicationApi";

const idle: PublicationStatus = { enabled: true, published: false, token: null, path: null, published_at: null, republished_at: null, stale: false, unpublish_at: null };
const live: PublicationStatus = { ...idle, published: true, token: "tok123", path: "/p/tok123", published_at: "2026-11-17T18:00:00Z", unpublish_at: null };
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
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-17T20:30:00Z") }); // 14:30 CDMX: el valor por omisión de la fecha es 2026-11-18T15:00
  onStatus.mockClear();
  getHtml.mockClear();
  getHtml.mockImplementation(() => "<h1>Hola</h1>");
  vi.spyOn(api, "checkPublication").mockResolvedValue(clean);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

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

  it("con recursos privados lista cada uno con su botón, avisa que no cambia nada sin pedirlo y el botón dice «Publicar de todos modos»", async () => {
    vi.spyOn(api, "checkPublication").mockResolvedValue(withPrivate);
    const user = setup();
    await open(user, /publicar en la web/i);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Hay recursos que no se verán")).toBeInTheDocument();
    expect(within(alert).getByText("«secreto.png» · privado")).toBeInTheDocument();
    expect(within(alert).getByText("Un archivo que no existe o no es tuyo")).toBeInTheDocument();
    expect(within(alert).queryByText(/foto\.png/)).toBeNull();
    expect(within(alert).getByText(/No cambiamos nada sin que lo pidas/)).toBeInTheDocument();
    expect(within(alert).getAllByRole("button")).toHaveLength(1); // solo «secreto.png» tiene botón: el inexistente no se puede cambiar y con un solo privado no hay «todos»
    expect(within(alert).getByRole("button", { name: "Hacer público «secreto.png»" })).toBeEnabled();
    expect(screen.getByText(/Este documento usa 2 imágenes de otros sitios/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar de todos modos" })).toHaveClass("btn-danger");
  });

  const twoPrivate: PublicationCheck = {
    resources: [
      { id: "a", name: "uno.png", content_type: "image/png", visibility: "private" },
      { id: "b", name: "dos.png", content_type: "image/png", visibility: "private" },
      { id: "c", name: "tres.png", content_type: "image/png", visibility: "public" },
    ],
    external: [],
    has_private: true,
  };

  it("«Hacer público» cambia solo ese archivo, lo quita de la lista y deja el resto privado", async () => {
    vi.spyOn(api, "checkPublication").mockResolvedValue(twoPrivate);
    const setVis = vi.spyOn(files, "setFileVisibility").mockResolvedValue({} as never);
    const user = setup();
    await open(user, /publicar en la web/i);
    const alert = await screen.findByRole("alert");
    await user.click(within(alert).getByRole("button", { name: "Hacer público «uno.png»" }));
    await waitFor(() => expect(setVis).toHaveBeenCalledTimes(1));
    expect(setVis).toHaveBeenCalledWith("a", "public");
    await waitFor(() => expect(screen.queryByText("«uno.png» · privado")).toBeNull());
    expect(screen.getByText("«dos.png» · privado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hacer públicos todos/ })).toBeNull(); // queda uno solo
    expect(screen.getByRole("button", { name: "Publicar de todos modos" })).toBeInTheDocument();
  });

  it("«Hacer públicos todos» cambia cada privado, no toca los públicos ni los inexistentes, y al terminar el botón pasa a «Publicar»", async () => {
    vi.spyOn(api, "checkPublication").mockResolvedValue(twoPrivate);
    const setVis = vi.spyOn(files, "setFileVisibility").mockResolvedValue({} as never);
    const user = setup();
    await open(user, /publicar en la web/i);
    await user.click(await screen.findByRole("button", { name: "Hacer públicos todos (2)" }));
    await waitFor(() => expect(setVis).toHaveBeenCalledTimes(2));
    expect(setVis.mock.calls).toEqual([["a", "public"], ["b", "public"]]);
    expect(await screen.findByText("Los archivos del documento ya son públicos.")).toBeInTheDocument();
    expect(screen.queryByText("Hay recursos que no se verán")).toBeNull();
    expect(screen.getByRole("button", { name: "Publicar" })).toHaveClass("btn-primary");
  });

  it("si un cambio falla, ese archivo sigue privado y se avisa; el que sí cambió sale de la lista", async () => {
    vi.spyOn(api, "checkPublication").mockResolvedValue(twoPrivate);
    const setVis = vi.spyOn(files, "setFileVisibility").mockImplementation(async (id) => {
      if (id === "b") throw new ApiError(500, {});
      return {} as never;
    });
    const user = setup();
    await open(user, /publicar en la web/i);
    await user.click(await screen.findByRole("button", { name: "Hacer públicos todos (2)" }));
    await waitFor(() => expect(setVis).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No se pudo hacer público un archivo. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(screen.queryByText("«uno.png» · privado")).toBeNull();
    expect(screen.getByText("«dos.png» · privado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hacer público «dos.png»" })).toBeEnabled();
  });

  it("mientras cambia la visibilidad los botones quedan deshabilitados", async () => {
    vi.spyOn(api, "checkPublication").mockResolvedValue(twoPrivate);
    let finish!: () => void;
    vi.spyOn(files, "setFileVisibility").mockImplementation(() => new Promise((resolve) => { finish = () => resolve({} as never); }));
    const user = setup();
    await open(user, /publicar en la web/i);
    await user.click(await screen.findByRole("button", { name: "Hacer público «uno.png»" }));
    expect(screen.getByRole("button", { name: "Hacer público «uno.png»" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hacer público «dos.png»" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Haciendo públicos…" })).toBeDisabled(); // el botón de «todos» cambia su texto mientras trabaja
    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: "Hacer público «dos.png»" })).toBeEnabled());
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

  it("publica con fecha de despublicación marcada en la casilla", async () => {
    const publishWithExpiry: PublicationStatus = { ...live, unpublish_at: "2026-11-18T15:00:00Z" };
    const publish = vi.spyOn(api, "publishNote").mockResolvedValue(publishWithExpiry);
    const user = setup();
    await open(user, /publicar en la web/i);
    await user.click(await screen.findByRole("checkbox", { name: /Entiendo/ }));
    const expiryCheckbox = await screen.findByRole("checkbox", { name: /Despublicar automáticamente/ });
    await user.click(expiryCheckbox);
    const expiryInput = screen.getByDisplayValue("2026-11-18T15:00");
    fireEvent.change(expiryInput, { target: { value: "2026-11-18T10:00" } });
    const button = screen.getByRole("button", { name: "Publicar" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => {
      expect(publish).toHaveBeenCalledWith("v1", "n1", "<h1>Hola</h1>", "2026-11-18T16:00:00.000Z");
    });
    expect(onStatus).toHaveBeenCalledWith(publishWithExpiry);
  });

  it("publica sin la casilla de fecha marcada sin enviar unpublish_at", async () => {
    const publish = vi.spyOn(api, "publishNote").mockResolvedValue(live);
    const user = setup();
    await open(user, /publicar en la web/i);
    await user.click(await screen.findByRole("checkbox", { name: /Entiendo/ }));
    const button = screen.getByRole("button", { name: "Publicar" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => {
      expect(publish).toHaveBeenCalledWith("v1", "n1", "<h1>Hola</h1>");
    });
  });

  it("con la casilla marcada y fecha a menos de 5 minutos «Publicar» queda deshabilitado", async () => {
    const user = setup();
    await open(user, /publicar en la web/i);
    await user.click(await screen.findByRole("checkbox", { name: /Entiendo/ }));
    const expiryCheckbox = await screen.findByRole("checkbox", { name: /Despublicar automáticamente/ });
    await user.click(expiryCheckbox);
    const expiryInput = screen.getByDisplayValue("2026-11-18T15:00");
    fireEvent.change(expiryInput, { target: { value: "2026-11-17T14:34" } });
    const button = screen.getByRole("button", { name: "Publicar" });
    expect(button).toBeDisabled();
    expect(screen.getByText(/al menos 5 minutos adelante/)).toBeInTheDocument();
  });

  it("con la casilla marcada y fecha válida «Publicar» se habilita", async () => {
    const user = setup();
    await open(user, /publicar en la web/i);
    await user.click(await screen.findByRole("checkbox", { name: /Entiendo/ }));
    const expiryCheckbox = await screen.findByRole("checkbox", { name: /Despublicar automáticamente/ });
    await user.click(expiryCheckbox);
    const expiryInput = screen.getByDisplayValue("2026-11-18T15:00");
    fireEvent.change(expiryInput, { target: { value: "2026-11-17T14:35" } });
    expect(screen.queryByText(/al menos 5 minutos adelante/)).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled());
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

describe("despublicación automática", () => {
  it("estado publicado con fecha muestra «Se despublicará el …» formateada en CDMX", async () => {
    const withExpiry: PublicationStatus = { ...live, unpublish_at: "2026-11-18T15:00:00Z" };
    const user = setup(withExpiry);
    await open(user, /publicado en la web/i);
    expect(await screen.findByText(/Se despublicará el .*CDMX/)).toBeInTheDocument();
  });

  it("«Programar» muestra el selector de fecha en línea; «Guardar fecha» llama setPublicationExpiry y muestra el aviso", async () => {
    const withExpiry: PublicationStatus = { ...live, unpublish_at: "2026-11-18T15:00:00Z" };
    const setExpiry = vi.spyOn(api, "setPublicationExpiry").mockResolvedValue(withExpiry);
    const userSetup = setup(live);
    const user = await userSetup;
    await open(user, /publicado en la web/i);
    const programButton = await screen.findByRole("button", { name: "Programar" });
    await user.click(programButton);
    const dateInput = screen.getByDisplayValue("2026-11-18T15:00");
    fireEvent.change(dateInput, { target: { value: "2026-11-19T10:00" } });
    const saveButton = screen.getByRole("button", { name: "Guardar fecha" });
    await user.click(saveButton);
    await waitFor(() => {
      expect(setExpiry).toHaveBeenCalledWith("v1", "n1", "2026-11-19T16:00:00.000Z");
    });
    expect(onStatus).toHaveBeenCalledWith(withExpiry);
    expect(await screen.findByText(/Se despublicará el .*CDMX/)).toBeInTheDocument();
  });

  it("«Quitar» llama setPublicationExpiry con null", async () => {
    const withExpiry: PublicationStatus = { ...live, unpublish_at: "2026-11-18T15:00:00Z" };
    const withoutExpiry: PublicationStatus = { ...live, unpublish_at: null };
    const setExpiry = vi.spyOn(api, "setPublicationExpiry").mockResolvedValue(withoutExpiry);
    const user = setup(withExpiry);
    await open(user, /publicado en la web/i);
    const quitarButton = await screen.findByRole("button", { name: "Quitar" });
    await user.click(quitarButton);
    await waitFor(() => {
      expect(setExpiry).toHaveBeenCalledWith("v1", "n1", null);
    });
    expect(onStatus).toHaveBeenCalledWith(withoutExpiry);
    expect(await screen.findByText("Se quitó la fecha de despublicación.")).toBeInTheDocument();
  });

  it("un 422 con pointer /unpublish_at muestra el mensaje de 5 minutos", async () => {
    const withExpiry: PublicationStatus = { ...live, unpublish_at: "2026-11-18T15:00:00Z" };
    vi.spyOn(api, "setPublicationExpiry").mockRejectedValueOnce(
      new ApiError(422, { type: "urn:synapse:problem:validation-error", errors: [{ detail: "must be in the future", pointer: "/unpublish_at" }] })
    );
    const user = setup(withExpiry);
    await open(user, /publicado en la web/i);
    const cambiarButton = await screen.findByRole("button", { name: "Cambiar" });
    await user.click(cambiarButton);
    const dateInput = screen.getByDisplayValue("2026-11-18T09:00");
    fireEvent.change(dateInput, { target: { value: "2026-11-18T10:01" } });
    const saveButton = screen.getByRole("button", { name: "Guardar fecha" });
    await user.click(saveButton);
    expect(await screen.findByText("La fecha de despublicación debe ser al menos 5 minutos posterior a ahora.")).toBeInTheDocument();
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
    expect(onStatus).toHaveBeenCalledWith({ enabled: true, published: false, token: null, path: null, published_at: null, republished_at: null, stale: false, unpublish_at: null });
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
