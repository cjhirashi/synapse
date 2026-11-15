// H-055: el INDICE muestra el estado de cada documento como cápsula del color que le da su plantilla.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { expect, test, vi } from "vitest";
import IndexView from "./IndexView";
import { createNoteStore } from "./noteStore";

PouchDB.plugin(memory);

const VAULT = "11111111-1111-4111-8111-111111111111";
let counter = 0;

async function open() {
  counter += 1;
  const store = createNoteStore(new PouchDB(`indexview-${counter}`, { adapter: "memory" }));
  const created = await store.createTemplate(VAULT, "Acta");
  await store.save(created.id, created.content, created.rev, { ...created.frontmatter, estados: [{ nombre: "aprobado", color: "verde" }, { nombre: "en revisión", color: "azul" }] });
  for (const [title, fm] of [
    ["Aprobada", { plantilla: "acta", estado: "aprobado" }],
    ["Revisión", { plantilla: "acta", estado: "en revisión" }],
    ["Ajena", { plantilla: "acta", estado: "otro" }],
    ["Libre", { estado: "borrador" }],
    ["Sin estado", { plantilla: "acta" }],
  ] as const) {
    const note = await store.create(VAULT, title);
    await store.save(note.id, "", note.rev, { ...note.frontmatter, ...fm });
  }
  const items = await store.list(VAULT);
  const index = items.find((item) => item.path === "INDICE.md")!;
  const refs = items.filter((item) => item.deleted_at === null).map((item) => ({ id: item.id, path: item.path }));
  const onOpenWikilink = vi.fn();
  render(<IndexView noteId={index.id} vault={{ id: VAULT, name: "Bóveda" }} notes={store} notesVersion={0} userId="u" noteRefs={refs} onOpenWikilink={onOpenWikilink} />);
  await screen.findByRole("heading", { level: 1, name: "Bóveda" });
  return { onOpenWikilink, refs };
}

const item = (title: string) => screen.getByRole("button", { name: title }).closest("li")!;

test("la cápsula de estado lleva el color de la plantilla del documento", async () => {
  await open();
  await waitFor(() => expect(within(item("Aprobada")).getByText("aprobado")).toHaveClass("estado-pill--verde"));
  expect(within(item("Revisión")).getByText("en revisión")).toHaveClass("estado-pill--azul");
});

test("sin plantilla o con un estado que la plantilla no declara la cápsula queda gris", async () => {
  await open();
  const libre = await waitFor(() => within(item("Libre")).getByText("borrador"));
  expect(libre).toHaveClass("estado-pill");
  expect(libre.className).not.toMatch(/estado-pill--(azul|verde|rojo)/);
  expect(within(item("Ajena")).getByText("otro").className).not.toMatch(/estado-pill--(azul|verde|rojo)/);
  expect(within(item("Sin estado")).queryByTitle("Estado")).toBeNull();
});

test("un documento del índice se abre al pulsar su título", async () => {
  const { onOpenWikilink, refs } = await open();
  await userEvent.click(await screen.findByRole("button", { name: "Aprobada" }));
  expect(onOpenWikilink).toHaveBeenCalledWith({ resolvedId: refs.find((ref) => ref.path === "Aprobada.md")!.id, target: "Aprobada.md" });
});

test("conserva las secciones del índice", async () => {
  await open();
  expect(await screen.findByRole("heading", { name: "Subcarpetas" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Documentos" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "PLANTILLAS" })).toBeInTheDocument();
});

test("cada elemento va en líneas propias: título, estado con la fecha al lado, descripción y tags como cápsulas", async () => {
  counter += 1;
  const store = createNoteStore(new PouchDB(`indexview-lines-${counter}`, { adapter: "memory" }));
  const note = await store.create(VAULT, "Con todo");
  await store.save(note.id, "", note.rev, { ...note.frontmatter, estado: "borrador", descripcion: "Qué contiene", tags: ["uno", "dos"], fecha_actualizacion: "2026-11-14" });
  const items = await store.list(VAULT);
  render(<IndexView noteId={items.find((i) => i.path === "INDICE.md")!.id} vault={{ id: VAULT, name: "Aparte" }} notes={store} notesVersion={0} userId="u" noteRefs={[]} onOpenWikilink={vi.fn()} />);
  const li = await waitFor(() => item("Con todo"));
  const lines = Array.from(li.querySelectorAll(".index-item-title, .index-item-state, .index-item-description, .index-item-tags")).map((node) => node.className.split(" ")[0]);
  expect(lines).toEqual(["index-item-title", "index-item-state", "index-item-description", "index-item-tags"]);
  const state = li.querySelector(".index-item-state") as HTMLElement;
  expect(within(state).getByText("borrador")).toHaveClass("estado-pill");
  expect(state).toHaveTextContent(/Actualizado: \d{4}-\d{2}-\d{2}/);
  expect(within(li).getAllByRole("listitem").map((tag) => tag.textContent)).toEqual(["uno", "dos"]);
  expect(within(li).getByText("Qué contiene")).toHaveClass("index-item-description");
});
