// H-030b: formulario de una plantilla (dónde se usa, atributos, diseño del PDF, estructura).
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import TemplateView from "./TemplateView";
import { palette } from "./colorTheme";
import * as uploadFile from "../files/uploadFile";
import { createNoteStore } from "./noteStore";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

PouchDB.plugin(memory);

beforeEach(() => {
  vi.spyOn(uploadFile, "listVaultFiles").mockResolvedValue([
    { id: "img-1", name: "logo.png", content_type: "image/png" } as uploadFile.VaultFile,
    { id: "doc-1", name: "manual.pdf", content_type: "application/pdf" } as uploadFile.VaultFile,
  ]);
});
afterEach(() => vi.restoreAllMocks());

const VAULT = "11111111-1111-4111-8111-111111111111";
let counter = 0;

async function open() {
  counter += 1;
  const store = createNoteStore(new PouchDB(`tplview-${counter}`, { adapter: "memory" }), { indexes: false });
  await store.create(VAULT, "Proyectos/Notas");
  const template = await store.createTemplate(VAULT, "Acta");
  render(<TemplateView noteId={template.id} vault={{ id: VAULT, name: "Bóveda" }} notes={store} notesVersion={0} />);
  await screen.findByRole("heading", { name: "Plantilla acta" });
  return { store, template, user: userEvent.setup() };
}

test("muestra las cinco secciones y deja el diseño del PDF apagado", async () => {
  await open();
  for (const title of ["Dónde se usa", "Atributos opcionales", "Diseño del PDF", "Publicación en la web", "Estructura base"]) {
    expect(screen.getByRole("heading", { level: 3, name: title })).toBeInTheDocument();
  }
  expect(screen.getByRole("radio", { name: "En toda la bóveda" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: /Permitir descargar/ })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: /Permitir publicar los documentos de esta plantilla/ })).not.toBeChecked();
  expect(screen.getByRole("combobox", { name: "Tamaño" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Guardar plantilla" })).toBeDisabled();
});

test("guarda alcance por carpetas, un atributo con valor inicial y la estructura base", async () => {
  const { store, template, user } = await open();
  await user.click(screen.getByRole("radio", { name: "Solo en estas carpetas" }));
  await user.click(await screen.findByRole("checkbox", { name: "Proyectos" }));
  await user.click(screen.getByRole("button", { name: "Añadir atributo" }));
  await user.type(screen.getByLabelText("Nombre del atributo 1"), "cliente");
  await user.type(screen.getByLabelText("Valor inicial del atributo 1"), "Acme");
  await user.clear(screen.getByLabelText(/Markdown con el que nace/));
  await user.type(screen.getByLabelText(/Markdown con el que nace/), "# Acuerdos");
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(async () => expect((await store.get(template.id)).content).toBe("# Acuerdos"));
  const saved = await store.get(template.id);
  expect(saved.frontmatter).toMatchObject({
    alcance: ["Proyectos"], atributos: [{ nombre: "cliente", tipo: "texto", valor: "Acme" }], estilo: { publicar: {}, pdf: {} },
  });
});

test("guarda atributos sin valor inicial de cualquier tipo", async () => {
  const { store, template, user } = await open();
  const tipos = ["texto", "numero", "fecha", "lista", "booleano"];
  for (const [i, tipo] of tipos.entries()) {
    await user.click(screen.getByRole("button", { name: "Añadir atributo" }));
    await user.type(screen.getByLabelText(`Nombre del atributo ${i + 1}`), `campo_${i}`);
    await user.selectOptions(screen.getByLabelText(`Tipo del atributo ${i + 1}`), tipo);
  }
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(async () => expect((await store.get(template.id)).frontmatter.atributos).toHaveLength(5));
  expect((await store.get(template.id)).frontmatter.atributos).toMatchObject([{ nombre: "campo_0", tipo: "texto" }, { nombre: "campo_1", tipo: "numero" }, {}, {}, {}]);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("la plantilla carga el estado de publicar y se puede editar", async () => {
  counter += 1;
  const store = createNoteStore(new PouchDB(`tplview-${counter}`, { adapter: "memory" }), { indexes: false });
  const template = await store.createTemplate(VAULT, "Acta");
  const base = await store.get(template.id);
  await store.save(template.id, base.content, base.rev, { ...base.frontmatter, estilo: { publicar: { activo: true }, pdf: {} } });
  render(<TemplateView noteId={template.id} vault={{ id: VAULT, name: "Bóveda" }} notes={store} notesVersion={0} />);
  await screen.findByRole("heading", { name: "Plantilla acta" });
  const user = userEvent.setup();
  const checkbox = screen.getByRole("checkbox", { name: /Permitir publicar los documentos de esta plantilla/ });
  await waitFor(() => expect(checkbox).toBeChecked());
  await user.click(checkbox);
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(async () => expect((await store.get(template.id)).frontmatter.estilo).toMatchObject({ publicar: {} }));
});

test("activar el interruptor de publicación guarda estilo.publicar con activo: true, apagarlo guarda estilo.publicar vacío", async () => {
  const { store, template, user } = await open();
  const checkbox = screen.getByRole("checkbox", { name: /Permitir publicar los documentos de esta plantilla/ });
  await user.click(checkbox);
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(async () => expect((await store.get(template.id)).frontmatter.estilo).toMatchObject({ publicar: { activo: true } }));

  await user.click(checkbox);
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(async () => expect((await store.get(template.id)).frontmatter.estilo).toMatchObject({ publicar: {} }));
});

test("una definición inválida (nombre de atributo con mayúsculas) no se guarda y explica el motivo", async () => {
  const { store, template, user } = await open();
  await user.click(screen.getByRole("button", { name: "Añadir atributo" }));
  await user.type(screen.getByLabelText("Nombre del atributo 1"), "Cliente");
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/«Cliente» debe ir en minúsculas.*«cliente»/);
  expect((await store.get(template.id)).frontmatter.atributos).toEqual([]);
});

test("activar el PDF y diseñarlo guarda estilo.pdf completo, con campos especiales y la imagen elegida", async () => {
  const { store, template, user } = await open();
  await user.click(screen.getByRole("button", { name: "Añadir atributo" }));
  await user.type(screen.getByLabelText("Nombre del atributo 1"), "cliente");
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  await user.selectOptions(screen.getByRole("combobox", { name: "Tamaño" }), "a4");
  const header = screen.getByRole("group", { name: "Encabezado de página" });
  await user.selectOptions(await within(header).findByRole("combobox", { name: /Imagen de fondo/ }), "img-1");
  await waitFor(() => expect(within(header).getByRole("option", { name: "logo.png" })).toBeInTheDocument());
  await user.click(screen.getByLabelText("Encabezado de página, izquierda"));
  await user.click(within(header).getByRole("button", { name: "Título" }));
  const picker = within(header).getByRole("combobox", { name: "Insertar un atributo" });
  expect(within(picker).getAllByRole("option").map((option) => option.textContent)).toEqual(["Atributo…", "estado", "cliente"]); // el estado va siempre, sin declararlo
  await user.selectOptions(picker, "cliente");
  await user.selectOptions(picker, "estado");
  await user.click(screen.getByRole("checkbox", { name: /Imprimir los atributos/ }));
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(async () => expect(((await store.get(template.id)).frontmatter.estilo as { pdf: object }).pdf).not.toEqual({}));
  const pdf = ((await store.get(template.id)).frontmatter.estilo as { pdf: Record<string, unknown> }).pdf;
  expect(pdf).toMatchObject({
    activo: true, incluir_atributos: true, pagina: { tamano: "a4", margenes_mm: { superior: 25 } },
    encabezado: { imagen: "img-1", izquierda: "{{titulo}}{{atributo:cliente}}{{atributo:estado}}" },
    pie: { derecha: "Página {{pagina}} de {{paginas}}" },
  });
});

test("un campo especial desconocido en el encabezado no se guarda y explica el motivo", async () => {
  const { store, template, user } = await open();
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  await user.type(screen.getByLabelText("Pie de página, centro"), "{{{{usuario}}");
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect((await store.get(template.id)).frontmatter.estilo).toEqual({ publicar: {}, pdf: {} });
});

test("una plantilla con PDF guardado lo muestra encendido con sus valores", async () => {
  counter += 1;
  const store = createNoteStore(new PouchDB(`tplview-${counter}`, { adapter: "memory" }), { indexes: false });
  const template = await store.createTemplate(VAULT, "Acta");
  await store.save(template.id, template.content, template.rev, { ...template.frontmatter, estilo: { publicar: {}, pdf: { activo: true, pagina: { tamano: "a4" }, texto: { familia: "Liberation Mono", tamano_pt: 9 } } } });
  render(<TemplateView noteId={template.id} vault={{ id: VAULT, name: "Bóveda" }} notes={store} notesVersion={0} />);
  await screen.findByRole("heading", { name: "Plantilla acta" });
  await waitFor(() => expect(screen.getByRole("checkbox", { name: /Permitir descargar/ })).toBeChecked());
  expect(screen.getByRole("combobox", { name: "Tamaño" })).toHaveValue("a4");
  expect(screen.getByRole("group", { name: "Texto" })).toHaveTextContent("Liberation Mono");
});

test("la imagen del encabezado indica las medidas de la hoja elegida y el pie no tiene imagen", async () => {
  const { user } = await open();
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  const header = screen.getByRole("group", { name: "Encabezado de página" });
  expect(within(header).getByRole("combobox", { name: /816 × 1056 px/ })).toBeInTheDocument(); // Carta por omisión
  expect(header).toHaveTextContent("816 px en Carta");
  await user.selectOptions(screen.getByRole("combobox", { name: "Tamaño" }), "a4");
  expect(within(header).getByRole("combobox", { name: /794 × 1123 px/ })).toBeInTheDocument();
  expect(header).toHaveTextContent("794 px en A4");
  const footer = screen.getByRole("group", { name: "Pie de página" });
  expect(within(footer).queryByRole("combobox", { name: /Imagen/ })).toBeNull();
});

test("guardar no escribe imagen en el pie", async () => {
  const { store, template, user } = await open();
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(async () => expect(((await store.get(template.id)).frontmatter.estilo as { pdf: object }).pdf).not.toEqual({}));
  const pdf = ((await store.get(template.id)).frontmatter.estilo as { pdf: { pie: Record<string, unknown> } }).pdf;
  expect("imagen" in pdf.pie).toBe(false); // el pie no lleva imagen
  expect(Object.keys(pdf.pie).sort()).toEqual(["centro", "derecha", "distancia_mm", "fuente", "izquierda", "linea", "sangria_mm"]);
});

test("la vista previa refleja el tamaño de hoja, los textos con valores de ejemplo y el fondo elegido", async () => {
  const { user } = await open();
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  const preview = screen.getByRole("figure", { name: "Vista previa de la hoja" });
  expect(preview).toHaveTextContent("Carta · 816 × 1056 px");
  expect(screen.queryByTestId("pdf-preview-bg")).toBeNull();
  await user.selectOptions(screen.getByRole("combobox", { name: "Tamaño" }), "a4");
  expect(preview).toHaveTextContent("A4 · 794 × 1123 px");
  const header = screen.getByRole("group", { name: "Encabezado de página" });
  await user.type(screen.getByLabelText("Encabezado de página, izquierda"), "{{{{titulo}} · {{{{atributo:cliente}}");
  expect(preview).toHaveTextContent("Título del documento · ‹cliente›");
  expect(preview).toHaveTextContent("Página 1 de 3"); // el pie de la plantilla nueva
  await user.selectOptions(await within(header).findByRole("combobox", { name: /Imagen de fondo/ }), "img-1");
  expect(screen.getByTestId("pdf-preview-bg")).toHaveStyle({ backgroundImage: 'url("/files/img-1")' });
});

test("el atributo se puede quitar con su botón y la tabla vuelve a su estado vacío", async () => {
  const { user } = await open();
  expect(screen.getByText("Esta plantilla no añade atributos propios.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Añadir atributo" }));
  await user.type(screen.getByLabelText("Nombre del atributo 1"), "cliente");
  await user.click(screen.getByRole("button", { name: "Quitar el atributo 1" }));
  expect(screen.getByText("Esta plantilla no añade atributos propios.")).toBeInTheDocument();
  expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
});

test("los cuatro encabezados, el texto, el encabezado y el pie tienen cada uno su tipografía, tamaño y color", async () => {
  const { user } = await open();
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  for (const name of ["Encabezado 1 (H1)", "Encabezado 2 (H2)", "Encabezado 3 (H3)", "Encabezado 4 (H4)", "Texto", "Encabezado de página: tipografía", "Pie de página: tipografía"]) {
    const group = screen.getByRole("group", { name });
    expect(within(group).getByRole("combobox", { name: "Tipografía" })).toBeInTheDocument();
    expect(within(group).getByLabelText("Tamaño (pt)")).toBeInTheDocument();
    expect(within(group).getByLabelText("Color")).toBeInTheDocument();
  }
  expect(screen.getByText("Los encabezados H5 y H6 usan el estilo del H4.")).toBeInTheDocument();
});

test("guarda un estilo distinto por nivel de encabezado y por banda, con su posición y su línea", async () => {
  const { store, template, user } = await open();
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  await user.selectOptions(within(screen.getByRole("group", { name: "Encabezado 2 (H2)" })).getByRole("combobox", { name: "Tipografía" }), "Liberation Mono");
  const size = within(screen.getByRole("group", { name: "Encabezado 3 (H3)" })).getByLabelText("Tamaño (pt)");
  await user.clear(size);
  await user.type(size, "13");
  const head = screen.getByRole("group", { name: "Encabezado de página: posición" });
  await user.clear(within(head).getByLabelText("Distancia al borde de la hoja (mm)"));
  await user.type(within(head).getByLabelText("Distancia al borde de la hoja (mm)"), "6");
  await user.clear(within(head).getByLabelText("Sangría lateral (mm)"));
  await user.type(within(head).getByLabelText("Sangría lateral (mm)"), "12");
  const headLine = screen.getByRole("group", { name: "Encabezado de página: línea" });
  await user.click(within(headLine).getByRole("checkbox", { name: /Mostrar línea bajo el encabezado/ }));
  await user.clear(within(headLine).getByLabelText("Grosor (pt)"));
  await user.type(within(headLine).getByLabelText("Grosor (pt)"), "2");
  await user.click(within(screen.getByRole("group", { name: "Pie de página: línea" })).getByRole("checkbox", { name: /Mostrar línea sobre el pie/ })); // el pie la trae encendida
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(async () => expect(((await store.get(template.id)).frontmatter.estilo as { pdf: object }).pdf).not.toEqual({}));
  const pdf = ((await store.get(template.id)).frontmatter.estilo as { pdf: Record<string, any> }).pdf;
  expect(pdf.encabezados.h2.familia).toBe("Liberation Mono");
  expect(pdf.encabezados.h3.tamano_pt).toBe(13);
  expect(pdf.encabezado).toMatchObject({ distancia_mm: 6, sangria_mm: 12, linea: { activa: true, grosor_pt: 2 } });
  expect(pdf.pie.linea.activa).toBe(false);
});

test("una plantilla guardada con los encabezados en forma plana se abre con H1 y los demás niveles derivados", async () => {
  counter += 1;
  const store = createNoteStore(new PouchDB(`tplview-${counter}`, { adapter: "memory" }), { indexes: false });
  const template = await store.createTemplate(VAULT, "Acta");
  await store.save(template.id, template.content, template.rev, { ...template.frontmatter, estilo: { publicar: {}, pdf: { activo: true, encabezados: { familia: "Liberation Serif", tamano_pt: 20, color: "#0c3897" }, texto: { familia: "Liberation Serif", tamano_pt: 10.5 } } } });
  render(<TemplateView noteId={template.id} vault={{ id: VAULT, name: "Bóveda" }} notes={store} notesVersion={0} />);
  await waitFor(() => expect(screen.getByRole("checkbox", { name: /Permitir descargar/ })).toBeChecked());
  expect(within(screen.getByRole("group", { name: "Encabezado 1 (H1)" })).getByLabelText("Tamaño (pt)")).toHaveValue(20);
  expect(within(screen.getByRole("group", { name: "Encabezado 2 (H2)" })).getByLabelText("Tamaño (pt)")).toHaveValue(16.4);
  expect(within(screen.getByRole("group", { name: "Encabezado 4 (H4)" })).getByLabelText("Tamaño (pt)")).toHaveValue(11.6);
});

test("la vista previa dibuja la línea y la posición del encabezado y del pie", async () => {
  const { user } = await open();
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  const head = screen.getByTestId("pdf-preview-head");
  const foot = screen.getByTestId("pdf-preview-foot");
  expect(head.style.borderBottom).not.toContain("solid"); // el encabezado no trae línea por omisión
  expect(foot.style.borderTop).toContain("solid"); // el pie sí
  await user.click(within(screen.getByRole("group", { name: "Encabezado de página: línea" })).getByRole("checkbox", { name: /Mostrar línea/ }));
  expect(head.style.borderBottom).toContain("solid");
  const thickness = within(screen.getByRole("group", { name: "Pie de página: línea" })).getByLabelText("Grosor (pt)");
  await user.clear(thickness);
  await user.type(thickness, "3");
  expect(foot.style.borderTop).toContain("4px"); // 3 pt = 4 px; la posición (cqw) la mide el servidor en el PDF real
});

test("el color primario calcula el secundario y el terciario y deja los encabezados en automático", async () => {
  const { store, template, user } = await open();
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  expect(screen.queryByRole("list", { name: "Colores calculados del tema" })).toBeNull();
  await user.click(screen.getByRole("checkbox", { name: /Usar un color primario para todo el documento/ }));
  const swatches = screen.getByRole("list", { name: "Colores calculados del tema" });
  expect(within(swatches).getAllByRole("listitem").map((li) => li.textContent?.replace(/#\w+/, "").trim())).toEqual(["Primario", "Secundario", "Terciario"]);
  const colors = palette("#0891b2", "#1f2937");
  expect(swatches).toHaveTextContent(colors.secundario);
  expect(swatches).toHaveTextContent(colors.terciario);
  for (const name of ["Encabezado 1 (H1)", "Encabezado 2 (H2)", "Encabezado 3 (H3)", "Encabezado 4 (H4)"]) {
    expect(within(screen.getByRole("group", { name })).getByText("Color automático del tema")).toBeInTheDocument();
  }
  const sample = screen.getByTestId("pdf-preview-sample");
  expect(within(sample).getByText("negrita")).toHaveStyle({ color: colors.negrita });
  expect(within(sample).getByText("enlace")).toHaveStyle({ color: colors.enlace });
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(async () => expect(((await store.get(template.id)).frontmatter.estilo as { pdf: object }).pdf).toHaveProperty("tema"));
  const pdf = ((await store.get(template.id)).frontmatter.estilo as { pdf: Record<string, any> }).pdf;
  expect(pdf.tema).toEqual({ primario: "#0891b2" });
  expect(pdf.encabezados.h1).not.toHaveProperty("color");
});

test("con el tema activo los selectores de color de los encabezados quedan bloqueados (H-054)", async () => {
  const { user } = await open();
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  const h2 = () => screen.getByRole("group", { name: "Encabezado 2 (H2)" });
  expect(within(h2()).getByLabelText("Color")).toBeEnabled();
  await user.click(screen.getByRole("checkbox", { name: /Usar un color primario para todo el documento/ }));
  for (const name of ["Encabezado 1 (H1)", "Encabezado 2 (H2)", "Encabezado 3 (H3)", "Encabezado 4 (H4)"]) {
    const group = screen.getByRole("group", { name });
    expect(within(group).getByLabelText("Color")).toBeDisabled();
    expect(within(group).getByText("Color automático del tema")).toBeInTheDocument();
    expect(within(group).queryByRole("button", { name: /volver al color automático/ })).toBeNull();
  }
  await user.click(screen.getByRole("checkbox", { name: /Usar un color primario para todo el documento/ }));
  expect(within(h2()).getByLabelText("Color")).toBeEnabled();
});

test("apagar el tema deja los encabezados con el color que se veía", async () => {
  const { user } = await open();
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  const toggle = screen.getByRole("checkbox", { name: /Usar un color primario para todo el documento/ });
  await user.click(toggle);
  const seen = palette("#0891b2", "#1f2937").h2;
  await user.click(toggle);
  expect(within(screen.getByRole("group", { name: "Encabezado 2 (H2)" })).getByLabelText("Color")).toHaveValue(seen);
  expect(screen.queryByRole("list", { name: "Colores calculados del tema" })).toBeNull();
});

test("los estados se añaden con nombre y color, y se guardan en la plantilla (H-054)", async () => {
  const { store, template, user } = await open();
  const group = screen.getByRole("group", { name: "Estados del documento" });
  expect(within(group).getByText("Esta plantilla aún no tiene estados.")).toBeInTheDocument();
  await user.click(within(group).getByRole("button", { name: "Añadir estado" }));
  await user.type(within(group).getByLabelText("Nombre del estado 1"), "En Revisión");
  await user.selectOptions(within(group).getByLabelText("Color del estado 1"), "azul");
  await user.click(within(group).getByRole("button", { name: "Añadir estado" }));
  await user.type(within(group).getByLabelText("Nombre del estado 2"), "cerrado");
  await user.selectOptions(within(group).getByLabelText("Color del estado 2"), "rojo");
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(async () =>
    expect((await store.get(template.id)).frontmatter.estados).toEqual([{ nombre: "en revisión", color: "azul" }, { nombre: "cerrado", color: "rojo" }]));
});

test("los estados guardados se muestran con su color y se pueden quitar (H-054)", async () => {
  counter += 1;
  const store = createNoteStore(new PouchDB(`tplview-${counter}`, { adapter: "memory" }), { indexes: false });
  const created = await store.createTemplate(VAULT, "Acta");
  const template = await store.save(created.id, created.content, created.rev, { ...created.frontmatter, estados: [{ nombre: "aprobado", color: "verde" }, { nombre: "borrador", color: "gris" }] });
  render(<TemplateView noteId={template.id} vault={{ id: VAULT, name: "Bóveda" }} notes={store} notesVersion={0} />);
  await screen.findByRole("heading", { name: "Plantilla acta" });
  const group = screen.getByRole("group", { name: "Estados del documento" });
  expect(within(group).getByLabelText("Nombre del estado 1")).toHaveValue("aprobado");
  expect(within(group).getByLabelText("Color del estado 1")).toHaveValue("verde");
  await userEvent.click(within(group).getByRole("button", { name: "Quitar el estado 1" }));
  await userEvent.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(async () => expect((await store.get(template.id)).frontmatter.estados).toEqual([{ nombre: "borrador", color: "gris" }]));
});

test("las instrucciones van aparte de la estructura y no se mezclan con el cuerpo (H-054)", async () => {
  const { store, template, user } = await open();
  const instrucciones = screen.getByLabelText(/Instrucciones de uso de la plantilla/);
  expect(instrucciones.compareDocumentPosition(screen.getByLabelText(/Markdown con el que nace/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await user.type(instrucciones, "Úsala para actas.");
  await user.clear(screen.getByLabelText(/Markdown con el que nace/));
  await user.type(screen.getByLabelText(/Markdown con el que nace/), "# Asistentes");
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(async () => expect((await store.get(template.id)).content).toBe("# Asistentes"));
  expect((await store.get(template.id)).frontmatter.instrucciones).toBe("Úsala para actas.");
});
