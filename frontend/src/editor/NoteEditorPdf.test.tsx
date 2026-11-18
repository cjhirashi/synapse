// H-036: botón «PDF» del documento — solo si su plantilla lo activa; manda el HTML de Lectura y descarga el archivo.
// H-035: botón de publicación — solo si su plantilla lo activa; manda el HTML de Lectura para publicar.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataMemoryRouter } from "../test-utils/router";
import { memoryDb, syncValue, WithSync } from "../test-utils/sync";
import * as pdfApi from "../notes/pdfApi";
import * as publicationApi from "../notes/publicationApi";
import NoteEditor, { type NoteEditorViews, type ViewProps } from "./NoteEditor";

vi.mock("../notes/publicationApi");

afterEach(() => vi.restoreAllMocks());

const VAULT = "11111111-1111-4111-8111-111111111111";

/** Vista de Lectura falsa con la misma estructura que la real (`.milkdown-view > .ProseMirror`). */
function Visual({ value, readOnly }: ViewProps) {
  return (
    <div className="milkdown-view" data-mode={readOnly ? "read" : "edit"}>
      <div className="ProseMirror"><h1>{value.trim()}</h1><iframe title="Diagrama" src="/files/diag-1" /></div>
    </div>
  );
}
const views: NoteEditorViews = { Visual, Code: Visual };

async function setup(pdf: Record<string, unknown>, withTemplate = true) {
  const { value } = syncValue({}, memoryDb());
  const template = await value.notes.createTemplate(VAULT, "Acta");
  await value.notes.save(template.id, template.content, template.rev, { ...template.frontmatter, estilo: { publicar: {}, pdf } });
  const note = await value.notes.create(VAULT, "Acta de hoy", "", withTemplate ? { name: "acta", content: "# Hola\n", atributos: [] } : undefined);
  if (!withTemplate) await value.notes.save(note.id, "# Hola\n", note.rev);

  // Mock getPublication para todos los tests
  vi.spyOn(publicationApi, "getPublication").mockResolvedValue({
    enabled: false,
    published: false,
    token: null,
    path: null,
    published_at: null,
    republished_at: null,
    stale: false,
    unpublish_at: null,
  });

  render(
    <DataMemoryRouter>
      <WithSync value={value}><NoteEditor noteId={note.id} views={views} /></WithSync>
    </DataMemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Acta de hoy" });
  return { note };
}

describe("botón PDF", () => {
  it("no aparece si la plantilla no activa el PDF ni si el documento no tiene plantilla", async () => {
    await setup({});
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button", { name: "Descargar como PDF" })).toBeNull();
  });

  it("sin plantilla no hay botón", async () => {
    await setup({ activo: true }, false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button", { name: "Descargar como PDF" })).toBeNull();
  });

  it("aparece junto a «Editar», manda el HTML de Lectura con el iframe como recuadro y descarga el archivo", async () => {
    const { note } = await setup({ activo: true });
    const fetchPdf = vi.spyOn(pdfApi, "fetchNotePdf").mockResolvedValue({ blob: new Blob(["%PDF"]), filename: "Acta.pdf" });
    const save = vi.spyOn(pdfApi, "saveBlob").mockImplementation(() => undefined);
    await userEvent.click(await screen.findByRole("button", { name: "Descargar como PDF" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ blob: expect.any(Blob), filename: "Acta.pdf" }));
    const [vaultId, noteId, html] = fetchPdf.mock.calls[0];
    expect(vaultId).toBe(VAULT);
    expect(noteId).toBe(note.id);
    expect(html).toContain("<h1># Hola</h1>");
    expect(html).toContain("pdf-embed");
    expect(html).not.toContain("<iframe");
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  it("si el servidor falla muestra el motivo y el botón vuelve a estar disponible", async () => {
    await setup({ activo: true });
    vi.spyOn(pdfApi, "fetchNotePdf").mockRejectedValue(new TypeError("Failed to fetch"));
    await userEvent.click(await screen.findByRole("button", { name: "Descargar como PDF" }));
    expect(await screen.findByText(/necesitas conexión/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descargar como PDF" })).toBeEnabled();
  });
});

describe("botón de publicación (H-035)", () => {
  it("no aparece si la plantilla no activa publicación", async () => {
    vi.spyOn(publicationApi, "getPublication").mockResolvedValue({
      enabled: false,
      published: false,
      token: null,
      path: null,
      published_at: null,
      republished_at: null,
      stale: false,
      unpublish_at: null,
    });
    await setup({});
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button", { name: /publicar en la web/ })).toBeNull();
  });

  it("no aparece si el documento no tiene plantilla", async () => {
    vi.spyOn(publicationApi, "getPublication").mockResolvedValue({
      enabled: false,
      published: false,
      token: null,
      path: null,
      published_at: null,
      republished_at: null,
      stale: false,
      unpublish_at: null,
    });
    await setup({ activo: true }, false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button", { name: /publicar en la web/ })).toBeNull();
  });

  it("aparece si la plantilla activa publicación y el documento tiene plantilla", async () => {
    const { value } = syncValue({}, memoryDb());
    const template = await value.notes.createTemplate(VAULT, "Acta");
    await value.notes.save(template.id, template.content, template.rev, {
      ...template.frontmatter,
      estilo: { publicar: { activo: true }, pdf: {} },
    });
    const note = await value.notes.create(VAULT, "Acta de hoy", "", { name: "acta", content: "# Hola\n", atributos: [] });

    vi.spyOn(publicationApi, "getPublication").mockResolvedValue({
      enabled: true,
      published: false,
      token: null,
      path: null,
      published_at: null,
      republished_at: null,
      stale: false,
      unpublish_at: null,
    });

    render(
      <DataMemoryRouter>
        <WithSync value={value}><NoteEditor noteId={note.id} views={views} /></WithSync>
      </DataMemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Acta de hoy" });
    // El botón debería estar presente cuando status.enabled sea verdadero
    // Esperamos a que se complete el ciclo de rendering
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelector(".publish-trigger")).toBeInTheDocument();
  });

  it("aparece si el documento está publicado, aunque la plantilla ya no lo active", async () => {
    const { value } = syncValue({}, memoryDb());
    const template = await value.notes.createTemplate(VAULT, "Acta");
    await value.notes.save(template.id, template.content, template.rev, {
      ...template.frontmatter,
      estilo: { publicar: {}, pdf: {} },
    });
    const note = await value.notes.create(VAULT, "Acta de hoy", "", { name: "acta", content: "# Hola\n", atributos: [] });

    vi.spyOn(publicationApi, "getPublication").mockResolvedValue({
      enabled: false,
      published: true,
      token: "token123",
      path: "/pub/note1",
      published_at: "2026-11-17T10:00:00Z",
      republished_at: null,
      stale: false,
      unpublish_at: null,
    });

    render(
      <DataMemoryRouter>
        <WithSync value={value}><NoteEditor noteId={note.id} views={views} /></WithSync>
      </DataMemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Acta de hoy" });
    // El botón debería estar presente cuando status.published sea verdadero
    // Esperamos a que se complete el ciclo de rendering
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelector(".publish-trigger")).toBeInTheDocument();
  });
});
