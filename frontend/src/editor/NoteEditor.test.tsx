// Editor de la nota abierta (SPEC-0008 RF-007, RF-008, RF-016; PLAN-0008 §2.6, P-5).
// Con editores falsos (textareas) para probar el estado del envoltorio; la prueba con los
// editores reales (RF-008, byte a byte) está al final.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRef, useEffect, type ComponentProps } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import type { EditorView as PMView } from "@milkdown/prose/view";
import userEvent from "@testing-library/user-event";
import { DataMemoryRouter } from "../test-utils/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb, syncValue, WithSync } from "../test-utils/sync";
import type { NoteConflict } from "../sync/conflicts";
import type { SyncContextValue } from "../sync/useSync";
import { createNoteStore } from "../notes/noteStore";
import { CONTENT_MAX_BYTES } from "../notes/noteRules";
import { CodeView } from "./CodeView";
import { MilkdownView } from "./MilkdownView";
import NoteEditor, { type NoteEditorHandle, type NoteEditorViews, type ViewProps } from "./NoteEditor";
import * as uploadModule from "../files/uploadFile";

// H-015: la subida real se mockea; `fileUrl` y las clases de error se conservan reales.
vi.mock("../files/uploadFile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../files/uploadFile")>();
  return { ...actual, uploadFile: vi.fn() };
});

const VAULT = "11111111-1111-4111-8111-111111111111";

/** Editores falsos: un textarea que lee y escribe el mismo texto, como el contrato real. */
function fake(kind: string) {
  return function Fake({ value, onChange, label, readOnly }: ViewProps) {
    return (
      <>
        <textarea
          aria-label={label}
          data-kind={kind}
          readOnly={readOnly}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {/* Atajo para producir un texto enorme sin teclearlo. */}
        <button type="button" onClick={() => onChange("a".repeat(CONTENT_MAX_BYTES + 1))}>
          pegar enorme {kind}
        </button>
      </>
    );
  };
}
const views: NoteEditorViews = { Visual: fake("visual"), Code: fake("code") };

async function setup(content = "# Hola\n", extra: Partial<SyncContextValue> = {}, editorProps: Partial<ComponentProps<typeof NoteEditor>> = {}) {
  const db = memoryDb();
  const { value } = syncValue(extra, db);
  const first = await value.notes.create(VAULT, "Primera");
  await value.notes.save(first.id, content, first.rev);
  const second = await value.notes.create(VAULT, "Segunda");
  const onCancelOpen = vi.fn();
  function ui(noteId: string, editOnOpen = false) {
    return (
      <DataMemoryRouter>
        <WithSync value={value}>
          <NoteEditor noteId={noteId} editOnOpen={editOnOpen} onCancelOpen={onCancelOpen} views={views} {...editorProps} />
        </WithSync>
      </DataMemoryRouter>
    );
  }
  const utils = render(ui(first.id));
  await screen.findByRole("heading", { name: "Primera" });
  return { ...utils, ui, value, first, second, onCancelOpen };
}

describe("modo lectura y edición (RF-007)", () => {
  // RF-007
  it("abre en lectura: contenido en el visor de sólo lectura y sin controles de edición", async () => {
    await setup("# Hola\n");
    expect(screen.getByRole("textbox", { name: "Contenido de la nota" })).toHaveValue("# Hola\n");
    expect(screen.getByRole("textbox", { name: "Contenido de la nota" })).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Código" })).toBeNull();
  });

  // RF-007
  it("'Editar' activa la edición y 'Leer' vuelve a la lectura", async () => {
    await setup();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("button", { name: "Leer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Editor visual" })).not.toHaveAttribute("readonly");
    await userEvent.click(screen.getByRole("button", { name: "Leer" }));
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  // RF-007
  it("editOnOpen abre directamente en edición", async () => {
    const { ui, second, rerender } = await setup();
    rerender(ui(second.id, true));
    await screen.findByRole("heading", { name: "Segunda" });
    expect(screen.getByRole("button", { name: "Leer" })).toBeInTheDocument();
  });
});

// SPEC-0009 RF-005: barra superior y columna centrada del contenido; los roles y nombres no cambian (RF-007).
describe("estructura visual del editor (SPEC-0009 RF-005)", () => {
  it("RF-005: la cabecera .note-editor-header lleva el h2 y los controles; el contenido va en la columna", async () => {
    const { container } = await setup();
    const header = container.querySelector<HTMLElement>(".note-editor-header")!;
    const column = container.querySelector<HTMLElement>(".note-editor-body > .note-editor-column")!;
    expect(header).not.toBeNull();
    expect(column).not.toBeNull();
    expect(within(header).getByRole("heading", { level: 2, name: "Primera" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(within(column).getByRole("textbox", { name: "Contenido de la nota" })).toBeInTheDocument();
    // La cabecera es la barra superior: no está dentro del área que hace scroll.
    expect(container.querySelector(".note-editor-body")).not.toContainElement(header);
  });

  it("RF-005: avisos y errores también van dentro de la columna", async () => {
    const { container } = await setup();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.click(screen.getByRole("button", { name: "pegar enorme visual" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const column = container.querySelector<HTMLElement>(".note-editor-column")!;
    expect(within(column).getByRole("alert")).toHaveTextContent("2 MiB");
  });

  // RF-007: nombres, roles y aria-pressed de los controles no cambian con el nuevo vestido.
  it("RF-007: Visual/Código con aria-pressed, Guardar y Leer/Editar conservan roles y nombres", async () => {
    await setup();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const group = screen.getByRole("group", { name: "Vista del editor" });
    expect(within(group).getByRole("button", { name: "Visual" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Código" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(within(group).getByRole("button", { name: "Código" }));
    expect(within(group).getByRole("button", { name: "Código" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leer" })).toBeInTheDocument();
  });
});

// SPEC-0010 RF-054, RF-056, RF-061, RF-064 (P-17): encabezado con migas, flechas, lápiz y menú ⋮.
describe("encabezado de la nota (SPEC-0010, P-17)", () => {
  const header = (container: HTMLElement) => container.querySelector<HTMLElement>(".note-editor-header")!;
  /** Los elementos están en este orden en el DOM (= orden visual = de tabulación). */
  function expectOrder(elements: HTMLElement[]) {
    for (let i = 1; i < elements.length; i++) {
      expect(elements[i - 1].compareDocumentPosition(elements[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `elemento ${i}`).toBeTruthy();
    }
  }

  // RF-054
  it("en lectura: Atrás, Adelante, migas, lápiz «Editar» y menú ⋮, en ese orden", async () => {
    const { container } = await setup();
    const bar = within(header(container));
    expectOrder([
      bar.getByRole("button", { name: "Atrás" }),
      bar.getByRole("button", { name: "Adelante" }),
      bar.getByRole("navigation", { name: "Ruta" }),
      bar.getByRole("button", { name: "Editar" }),
      bar.getByRole("button", { name: "Opciones de la nota" }),
    ]);
    expect(bar.getByRole("heading", { level: 2, name: "Primera" })).toHaveAttribute("aria-current", "page");
  });

  // H-010 C-1/C-2/C-3: en edición la cabecera se parte en 3 filas. La Fila 1 conserva migas, lápiz y ⋮
  // (hijos directos del header, en ese orden); la Fila 2 lleva Visual|Código, Guardar y el estado; la
  // Fila 3, los controles de formato (la tabla incluida).
  it("en edición Visual: 3 filas — migas/lápiz/⋮ · Visual|Código/Guardar/estado · formato", async () => {
    const { container } = await setup();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const h = header(container);
    const row2 = h.querySelector<HTMLElement>(".note-editor-row-2")!;
    const row3 = h.querySelector<HTMLElement>(".note-editor-row-3")!;
    // Fila 1: migas, lápiz «Leer» y ⋮ son hijos directos del header, en ese orden.
    const crumbs = within(h).getByRole("navigation", { name: "Ruta" });
    const read = within(h).getByRole("button", { name: "Leer" });
    const menu = within(h).getByRole("button", { name: "Opciones de la nota" });
    expect(read.parentElement).toBe(h);
    expect(menu.parentElement).toBe(h);
    expectOrder([crumbs, read, menu]);
    // Fila 2: Visual|Código, Guardar y el estado.
    expect(within(row2).getByRole("group", { name: "Vista del editor" })).toBeInTheDocument();
    expect(within(row2).getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(within(row2).getByRole("status")).toBeInTheDocument();
    // Fila 3: Insertar tabla (y aquí viven los demás botones de formato).
    expect(within(row3).getByRole("button", { name: "Insertar tabla" })).toBeInTheDocument();
  });

  // RF-041, RF-054
  it("el lápiz conserva el nombre accesible «Editar»/«Leer» y no tiene texto visible", async () => {
    await setup();
    const pencil = screen.getByRole("button", { name: "Editar" });
    expect(pencil).toHaveAccessibleName("Editar");
    expect(pencil.textContent).toBe("");
    expect(pencil.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    await userEvent.click(pencil);
    const read = screen.getByRole("button", { name: "Leer" });
    expect(read.textContent).toBe("");
    expect(read.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  // RF-056
  it("las flechas arrancan deshabilitadas, con atajo anunciado, y se habilitan con canBack/canForward", async () => {
    const onBack = vi.fn();
    const onForward = vi.fn();
    const { container } = await setup("# Hola\n", {}, { canBack: false, canForward: false, onBack, onForward });
    const back = within(header(container)).getByRole("button", { name: "Atrás" });
    const forward = within(header(container)).getByRole("button", { name: "Adelante" });
    expect(back).toBeDisabled();
    expect(forward).toBeDisabled();
    expect(back).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowLeft");
    expect(forward).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowRight");
    expect(back).toHaveAttribute("title", "Atrás · Alt+←");
  });

  // RF-056
  it("con historial las flechas están activas y llaman a sus manejadores", async () => {
    const onBack = vi.fn();
    const onForward = vi.fn();
    const { container } = await setup("# Hola\n", {}, { canBack: true, canForward: true, onBack, onForward });
    await userEvent.click(within(header(container)).getByRole("button", { name: "Atrás" }));
    await userEvent.click(within(header(container)).getByRole("button", { name: "Adelante" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onForward).toHaveBeenCalledTimes(1);
  });

  // RF-054
  it("«Insertar tabla» sólo existe en edición Visual (no en lectura ni en Código)", async () => {
    await setup();
    expect(screen.queryByRole("button", { name: "Insertar tabla" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("button", { name: "Insertar tabla" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    expect(screen.queryByRole("button", { name: "Insertar tabla" })).toBeNull();
  });

  // RF-064
  it("Visual, Código, Guardar y Leer llevan icono y su texto en una etiqueta que el CSS oculta ≤ 560 px (mismo nombre accesible)", async () => {
    await setup();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    for (const name of ["Visual", "Código", "Guardar"]) {
      const button = screen.getByRole("button", { name });
      expect(button.querySelector("svg[aria-hidden='true']"), name).not.toBeNull();
      expect(button.querySelector(".note-btn-label"), name).toHaveTextContent(name);
    }
  });

  // RF-061
  it("el menú ⋮ ofrece «Ver en Código», que pasa a edición en Código", async () => {
    await setup();
    await userEvent.click(screen.getByRole("button", { name: "Opciones de la nota" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Ver en Código" }));
    expect(screen.getByRole("textbox", { name: "Editor de código" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Código" })).toHaveAttribute("aria-pressed", "true");
  });

  // RF-055
  it("pulsar una carpeta de las migas llama a onRevealFolder con su ruta", async () => {
    const onRevealFolder = vi.fn();
    const db = memoryDb();
    const { value } = syncValue({}, db);
    const note = await value.notes.create(VAULT, "Proyectos/Clientes/Plan");
    render(
      <DataMemoryRouter>
        <WithSync value={value}>
          <NoteEditor noteId={note.id} views={views} onRevealFolder={onRevealFolder} />
        </WithSync>
      </DataMemoryRouter>,
    );
    await screen.findByRole("heading", { level: 2, name: "Plan" });
    await userEvent.click(screen.getByRole("button", { name: "Clientes" }));
    expect(onRevealFolder).toHaveBeenCalledWith("Proyectos/Clientes");
  });

  // RF-041
  it("el h2 muestra sólo el nombre de la nota (no la ruta); la ruta completa va en su title", async () => {
    const db = memoryDb();
    const { value } = syncValue({}, db);
    const note = await value.notes.create(VAULT, "Carpeta/Nota");
    render(
      <DataMemoryRouter>
        <WithSync value={value}>
          <NoteEditor noteId={note.id} views={views} />
        </WithSync>
      </DataMemoryRouter>,
    );
    const heading = await screen.findByRole("heading", { level: 2, name: "Nota" });
    expect(heading).toHaveAttribute("title", "Carpeta/Nota");
  });
});

// H-010: la cabecera del editor se reorganiza en 3 filas dentro de `.note-editor-header`.
describe("cabecera del editor en 3 filas (H-010)", () => {
  const header = (c: HTMLElement) => c.querySelector<HTMLElement>(".note-editor-header")!;

  // C-1: en lectura sólo está la Fila 1; no se pintan las filas de edición ni de formato.
  it("C-1: en lectura no existen Fila 2 ni Fila 3", async () => {
    const { container } = await setup();
    expect(header(container).querySelector(".note-editor-row-2")).toBeNull();
    expect(header(container).querySelector(".note-editor-row-3")).toBeNull();
  });

  // C-1: ningún control de edición/formato queda en la Fila 1 — el lápiz y el ⋮ son hijos directos del
  // header, mientras que Visual/Código/Guardar viven en la Fila 2 y la tabla en la Fila 3.
  it("C-1: lápiz y ⋮ en Fila 1; Visual/Código/Guardar en Fila 2; tabla en Fila 3", async () => {
    const { container } = await setup();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const h = header(container);
    expect(within(h).getByRole("button", { name: "Leer" }).parentElement).toBe(h);
    expect(within(h).getByRole("button", { name: "Opciones de la nota" }).parentElement).toBe(h);
    const row2 = h.querySelector<HTMLElement>(".note-editor-row-2")!;
    const row3 = h.querySelector<HTMLElement>(".note-editor-row-3")!;
    expect(within(row2).getByRole("button", { name: "Visual" })).toBeInTheDocument();
    expect(within(row2).getByRole("button", { name: "Código" })).toBeInTheDocument();
    expect(within(row2).getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(within(row3).getByRole("button", { name: "Insertar tabla" })).toBeInTheDocument();
    // Y esos controles NO son hijos directos del header (están anidados en sus filas).
    expect(within(h).getByRole("button", { name: "Guardar" }).parentElement).toBe(row2);
    expect(within(h).getByRole("button", { name: "Insertar tabla" }).parentElement).toBe(row3);
  });

  // C-2: la Fila 2 aparece en edición y persiste en Código (no sólo en Visual).
  it("C-2: la Fila 2 (Visual/Código/Guardar/estado) aparece en edición y sigue en Código", async () => {
    const { container } = await setup();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    let row2 = header(container).querySelector<HTMLElement>(".note-editor-row-2")!;
    expect(within(row2).getByRole("status")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    row2 = header(container).querySelector<HTMLElement>(".note-editor-row-2")!;
    expect(row2).not.toBeNull();
    expect(within(row2).getByRole("button", { name: "Visual" })).toBeInTheDocument();
    expect(within(row2).getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  // C-3/C-4: la Fila 3 (formato) sólo en edición + Visual; nunca en lectura ni en Código.
  it("C-4: la Fila 3 sólo existe en edición Visual (no en lectura ni en Código)", async () => {
    const { container } = await setup();
    expect(header(container).querySelector(".note-editor-row-3")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(header(container).querySelector(".note-editor-row-3")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    expect(header(container).querySelector(".note-editor-row-3")).toBeNull();
  });

  // C-7 (decisión de AIRA): con la tabla + los 9 controles, la Fila 3 hace scroll horizontal en pantallas
  // angostas en vez de envolver a otra línea (para no empujar el documento hacia abajo); sus controles no
  // se encogen. Es un criterio de estilo: se verifica leyendo editor.css, como otras reglas del editor.
  it("C-7: la Fila 3 hace scroll horizontal y sus controles no se encogen", () => {
    const css = readFileSync(resolve(__dirname, "./editor.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const row3 = css.match(/\.note-editor-row-3\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(row3).toMatch(/overflow-x: auto/);
    expect(row3).toMatch(/flex-wrap: nowrap/);
    const children = css.match(/\.note-editor-row-3 > \*\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(children).toMatch(/flex-shrink: 0/);
  });
});

// H-010 C-3/C-5/C-6: los 9 botones nuevos de formato viven en la Fila 3 y disparan su comando.
describe("botones de formato de la Fila 3 (H-010)", () => {
  type Spies = Record<string, ReturnType<typeof vi.fn>>;
  /** Monta el editor con una vista Visual falsa que registra espías de EditorCommands. */
  async function setupWithCommands() {
    const spies: Spies = {};
    for (const name of [
      "insertTable",
      "addRowAfter",
      "addColAfter",
      "toggleBold",
      "toggleItalic",
      "toggleStrikethrough",
      "toggleInlineCode",
      "setHeading",
      "toggleBlockquote",
      "insertHr",
      "wrapBulletList",
      "wrapOrderedList",
    ]) {
      spies[name] = vi.fn();
    }
    function VisualWithCommands({ value, onChange, label, readOnly, registerCommands }: ViewProps) {
      useEffect(() => {
        registerCommands?.(spies as never);
        return () => registerCommands?.(null);
      }, [registerCommands]);
      return <textarea aria-label={label} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} />;
    }
    const customViews: NoteEditorViews = { Visual: VisualWithCommands, Code: fake("code") };
    const utils = await setup("hola", {}, { views: customViews });
    return { ...utils, spies };
  }

  const FORMAT_BUTTONS = [
    "Insertar tabla",
    "Negritas",
    "Cursiva",
    "Tachado",
    "Código en línea",
    "Encabezado 1",
    "Encabezado 2",
    "Encabezado 3",
    "Encabezado 4",
    "Cita",
    "Línea horizontal",
    "Lista con viñetas",
    "Lista numerada",
  ];

  // C-3/C-6: la tabla y los 9 botones nuevos están en la Fila 3, con aria-label y el patrón note-nav-button.
  it("C-3/C-6: la Fila 3 lleva la tabla y los 9 botones de formato (aria-label + note-nav-button)", async () => {
    const { container } = await setupWithCommands();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const row3 = container.querySelector<HTMLElement>(".note-editor-row-3")!;
    for (const name of FORMAT_BUTTONS) {
      const button = within(row3).getByRole("button", { name });
      expect(button, name).toHaveClass("note-nav-button");
      expect(button.querySelector("svg[aria-hidden='true']"), name).not.toBeNull();
    }
  });

  // C-5: cada botón ejecuta el comando Milkdown correspondiente sobre la selección actual.
  it("C-5: cada botón de formato ejecuta su comando de EditorCommands", async () => {
    const { spies } = await setupWithCommands();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const click = (name: string) => userEvent.click(screen.getByRole("button", { name }));
    await click("Negritas");
    expect(spies.toggleBold).toHaveBeenCalledTimes(1);
    await click("Cursiva");
    expect(spies.toggleItalic).toHaveBeenCalledTimes(1);
    await click("Tachado");
    expect(spies.toggleStrikethrough).toHaveBeenCalledTimes(1);
    await click("Código en línea");
    expect(spies.toggleInlineCode).toHaveBeenCalledTimes(1);
    await click("Cita");
    expect(spies.toggleBlockquote).toHaveBeenCalledTimes(1);
    await click("Línea horizontal");
    expect(spies.insertHr).toHaveBeenCalledTimes(1);
    await click("Lista con viñetas");
    expect(spies.wrapBulletList).toHaveBeenCalledTimes(1);
    await click("Lista numerada");
    expect(spies.wrapOrderedList).toHaveBeenCalledTimes(1);
    for (const level of [1, 2, 3, 4]) {
      await click(`Encabezado ${level}`);
      expect(spies.setHeading).toHaveBeenCalledWith(level);
    }
  });

  // C-6: operable por teclado — un <button> nativo se activa con Enter/Espacio al tener el foco.
  it("C-6: los botones de formato son operables por teclado (Enter)", async () => {
    const { spies } = await setupWithCommands();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const bold = screen.getByRole("button", { name: "Negritas" });
    bold.focus();
    await userEvent.keyboard("{Enter}");
    expect(spies.toggleBold).toHaveBeenCalledTimes(1);
  });
});

// H-015: subir imagen (botón + arrastrar/soltar) e insertar `![nombre](url)` en el cursor.
// jsdom no ejerce el gesto real de arrastrar/soltar ni `posAtCoords`; estos tests son lo más
// realistas posible dentro de jsdom, pero la verificación REAL en navegador la hace AIRA (H-012).
describe("subir imagen en la Fila 3 (H-015)", () => {
  const mockUpload = vi.mocked(uploadModule.uploadFile);

  /** Vista Visual falsa que registra un espía de `insertImage` (y no-ops del resto de comandos). */
  async function setupUpload() {
    const insertImage = vi.fn();
    function VisualWithImage({ value, onChange, label, readOnly, registerCommands }: ViewProps) {
      useEffect(() => {
        registerCommands?.({ insertImage } as never);
        return () => registerCommands?.(null);
      }, [registerCommands]);
      return <textarea aria-label={label} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} />;
    }
    const customViews: NoteEditorViews = { Visual: VisualWithImage, Code: fake("code") };
    const utils = await setup("hola", {}, { views: customViews });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    return { ...utils, insertImage };
  }

  function fileInput(container: HTMLElement): HTMLInputElement {
    return container.querySelector<HTMLInputElement>('input[type="file"]')!;
  }

  const png = () => new File([new Uint8Array(16)], "foto.png", { type: "image/png" });

  beforeEach(() => mockUpload.mockReset());

  it("C-1: el botón «Insertar imagen» vive en la Fila 3 (aria-label + note-nav-button)", async () => {
    const { container } = await setupUpload();
    const button = within(container.querySelector<HTMLElement>(".note-editor-row-3")!).getByRole("button", { name: "Insertar imagen" });
    expect(button).toHaveClass("note-nav-button");
  });

  it("C-1: elegir un archivo lo sube e inserta `![nombre](https://…/files/<id>)` en el cursor", async () => {
    mockUpload.mockResolvedValueOnce({ id: "abc", vault_id: VAULT, name: "foto.png", content_type: "image/png", size: 16, visibility: "private", created_at: "2026-10-30T00:00:00Z" });
    const { container, insertImage } = await setupUpload();
    const input = fileInput(container);
    const file = png();
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith(file, VAULT));
    await waitFor(() => expect(insertImage).toHaveBeenCalledWith("https://synapse.cjhirashi.com/files/abc", "foto"));
  });

  it("C-1: soltar una imagen sobre el área de edición la sube e inserta igual", async () => {
    mockUpload.mockResolvedValueOnce({ id: "xyz", vault_id: VAULT, name: "dibujo.png", content_type: "image/png", size: 16, visibility: "private", created_at: "2026-10-30T00:00:00Z" });
    const { container, insertImage } = await setupUpload();
    const body = container.querySelector<HTMLElement>(".note-editor-body")!;
    const file = new File([new Uint8Array(16)], "dibujo.png", { type: "image/png" });
    fireEvent.drop(body, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith(file, VAULT));
    await waitFor(() => expect(insertImage).toHaveBeenCalledWith("https://synapse.cjhirashi.com/files/xyz", "dibujo"));
  });

  it("C-2: un tipo no admitido muestra un aviso de error y no inserta nada", async () => {
    mockUpload.mockRejectedValueOnce(new uploadModule.UploadTypeError("no"));
    const { container, insertImage } = await setupUpload();
    const input = fileInput(container);
    const bad = new File([new Uint8Array(8)], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [bad], configurable: true });
    fireEvent.change(input);

    expect(await screen.findByText(/no se admite/i)).toBeInTheDocument();
    expect(insertImage).not.toHaveBeenCalled();
  });

  it("C-2: un archivo demasiado grande muestra el aviso de los 5 MB", async () => {
    mockUpload.mockRejectedValueOnce(new uploadModule.UploadTooLargeError("big"));
    const { container } = await setupUpload();
    const input = fileInput(container);
    const big = png();
    Object.defineProperty(input, "files", { value: [big], configurable: true });
    fireEvent.change(input);

    expect(await screen.findByText(/5 MB/i)).toBeInTheDocument();
  });
});

describe("alternar Visual/Código (RF-008)", () => {
  // RF-008
  it("conserva el borrador y no llama al almacén", async () => {
    const { value } = await setup("uno");
    const get = vi.spyOn(value.notes, "get");
    const save = vi.spyOn(value.notes, "save");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), " dos");
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    expect(screen.getByRole("textbox", { name: "Editor de código" })).toHaveValue("uno dos");
    await userEvent.type(screen.getByRole("textbox", { name: "Editor de código" }), " tres");
    await userEvent.click(screen.getByRole("button", { name: "Visual" }));
    expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveValue("uno dos tres");
    expect(get).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  // Regresión: lo escrito en Código y guardado debe verse en Lectura (antes `draft` quedaba con el texto viejo).
  it("Código → Guardar → Leer muestra lo escrito en Código, no el contenido anterior", async () => {
    await setup("uno");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor de código" }), " dos");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await userEvent.click(screen.getByRole("button", { name: "Leer" }));
    expect(await screen.findByRole("textbox", { name: "Contenido de la nota" })).toHaveValue("uno dos");
  });

  // RF-008
  it("marca la vista activa con aria-pressed", async () => {
    await setup();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("button", { name: "Visual" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    expect(screen.getByRole("button", { name: "Código" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("guardado explícito (P-5)", () => {
  // RF-008
  it("'Guardar' escribe el borrador sobre la revisión cargada", async () => {
    const { value, first } = await setup("uno");
    const save = vi.spyOn(value.notes, "save");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Guardado");
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBe(first.id);
    expect(save.mock.calls[0][1]).toBe("uno!");
    expect((await value.notes.get(first.id)).content).toBe("uno!");
    expect(screen.queryByText("Cambios sin guardar")).toBeNull();
  });

  // RF-008
  it.each([
    ["Ctrl+S", "{Control>}s{/Control}"],
    ["Cmd+S", "{Meta>}s{/Meta}"],
  ])("%s guarda", async (_name, keys) => {
    const { value, first } = await setup("uno");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    await userEvent.keyboard(keys);
    await screen.findByText("Guardado");
    expect(screen.queryByText("Cambios sin guardar")).toBeNull();
    expect((await value.notes.get(first.id)).content).toBe("uno!");
  });

  // E-1 (PLAN-0008 §17): un guardado en vuelo absorbe el doble Ctrl+S / auto-repeat.
  it("RF-008: un doble Ctrl+S guarda una sola vez (sin rama de conflicto con contenido idéntico)", async () => {
    const { value, first } = await setup("uno");
    const real = value.notes.save.bind(value.notes);
    // Compuerta: el guardado sigue «en vuelo» hasta que la prueba la abre (sin plazos fijos).
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const save = vi.spyOn(value.notes, "save").mockImplementation(async (...args) => {
      await gate;
      return real(...args);
    });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    const region = screen.getByRole("region", { name: "Editor de nota" });
    fireEvent.keyDown(region, { key: "s", ctrlKey: true });
    fireEvent.keyDown(region, { key: "s", ctrlKey: true });
    release();
    await screen.findByText("Guardado");
    expect(save).toHaveBeenCalledTimes(1);
    expect((await value.notes.get(first.id)).content).toBe("uno!");
  });

  // E-1: si el borrador cambió durante el vuelo, se guarda después sobre la revisión nueva.
  it("RF-008: si el borrador cambia durante el guardado, se guarda después sobre la rev nueva", async () => {
    const { value, first } = await setup("uno");
    const real = value.notes.save.bind(value.notes);
    // El primer guardado queda en vuelo (compuerta) mientras el usuario sigue escribiendo.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const save = vi.spyOn(value.notes, "save").mockImplementation(async (...args) => {
      await gate;
      return real(...args);
    });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const box = screen.getByRole("textbox", { name: "Editor visual" });
    await userEvent.type(box, "!");
    const region = screen.getByRole("region", { name: "Editor de nota" });
    fireEvent.keyDown(region, { key: "s", ctrlKey: true });
    await userEvent.type(box, "?");
    fireEvent.keyDown(region, { key: "s", ctrlKey: true });
    release();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await screen.findByText("Guardado");
    expect(save.mock.calls[1][2]).not.toBe(first.rev); // sobre la revisión que dejó el primer guardado
    expect((await value.notes.get(first.id)).content).toBe("uno!?");
    expect(screen.queryByText("Cambios sin guardar")).toBeNull();
  });

  // RF-007
  it("'Leer' con cambios guarda antes de volver a la lectura", async () => {
    const { value } = await setup("uno");
    const save = vi.spyOn(value.notes, "save");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    await userEvent.click(screen.getByRole("button", { name: "Leer" }));
    await screen.findByRole("button", { name: "Editar" });
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Contenido de la nota" })).toHaveValue("uno!");
  });

  // RF-007
  it("'Leer' sin cambios no escribe", async () => {
    const { value } = await setup("uno");
    const save = vi.spyOn(value.notes, "save");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.click(screen.getByRole("button", { name: "Leer" }));
    expect(save).not.toHaveBeenCalled();
  });

  // RF-016
  it("más de 2 MiB muestra el mensaje, no guarda y se queda en edición con el borrador", async () => {
    const { value } = await setup("uno");
    const save = vi.spyOn(value.notes, "save");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.click(screen.getByRole("button", { name: /pegar enorme/ }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("2 MiB");
    expect(save).not.toHaveBeenCalled();
    // Leer tampoco puede guardar: se queda en edición.
    await userEvent.click(screen.getByRole("button", { name: "Leer" }));
    expect(screen.getByRole("button", { name: "Leer" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("2 MiB");
  });

  // RF-016
  it("un fallo del almacén se muestra y conserva el borrador", async () => {
    const { value } = await setup("uno");
    vi.spyOn(value.notes, "save").mockRejectedValueOnce(new Error("boom"));
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo");
    expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveValue("uno!");
  });

  // RF-008
  it("con cambios sin guardar avisa al cerrar la pestaña (beforeunload)", async () => {
    await setup("uno");
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});

describe("cambiar de nota con cambios sin guardar", () => {
  async function dirtyThenRequestSecond() {
    const ctx = await setup("uno");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    ctx.rerender(ctx.ui(ctx.second.id));
    return ctx;
  }

  // RF-008
  it("sin cambios abre la otra nota sin preguntar", async () => {
    const { ui, second, rerender } = await setup("uno");
    rerender(ui(second.id));
    await screen.findByRole("heading", { name: "Segunda" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  // RF-008
  it("con cambios pregunta y 'Seguir editando' no cambia y avisa al padre", async () => {
    const { onCancelOpen, first } = await dirtyThenRequestSecond();
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onCancelOpen).toHaveBeenCalledWith(first.id);
    expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveValue("uno!");
  });

  // U-1 (PLAN-0008 §17): el diálogo gestiona el foco.
  it("RF-008: el diálogo mueve el foco a su primer botón, atrapa el Tab y Escape = «Seguir editando»", async () => {
    const { onCancelOpen, first } = await dirtyThenRequestSecond();
    const dialog = await screen.findByRole("alertdialog");
    const buttons = within(dialog).getAllByRole("button");
    await waitFor(() => expect(buttons[0]).toHaveFocus());
    await userEvent.tab({ shift: true }); // desde el primero, hacia atrás: da la vuelta al último
    expect(buttons[buttons.length - 1]).toHaveFocus();
    await userEvent.tab(); // desde el último, hacia delante: vuelve al primero
    expect(buttons[0]).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onCancelOpen).toHaveBeenCalledWith(first.id);
  });

  it("RF-008: al cerrar el diálogo el foco vuelve a donde estaba", async () => {
    await dirtyThenRequestSecond();
    await screen.findByRole("alertdialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveFocus());
  });

  // RF-008
  it("'Descartar y abrir' abre la otra sin guardar", async () => {
    const { value, first } = await dirtyThenRequestSecond();
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Descartar y abrir" }));
    await screen.findByRole("heading", { name: "Segunda" });
    expect((await value.notes.get(first.id)).content).toBe("uno");
  });

  // RF-008
  it("'Guardar y abrir' guarda y abre la otra", async () => {
    const { value, first } = await dirtyThenRequestSecond();
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Guardar y abrir" }));
    await screen.findByRole("heading", { name: "Segunda" });
    expect((await value.notes.get(first.id)).content).toBe("uno!");
  });
});

describe("renombrar la nota abierta con borrador sucio (VF-3)", () => {
  // RF-011
  it("el borrador se conserva, la ruta se actualiza y guardar no crea un conflicto", async () => {
    const db = memoryDb();
    const { value } = syncValue({}, db);
    const note = await value.notes.create(VAULT, "Primera");
    await value.notes.save(note.id, "uno", (await value.notes.get(note.id)).rev);
    const tree = (version: number) => (
      <DataMemoryRouter>
        <WithSync value={{ ...value, notesVersion: version }}>
          <NoteEditor noteId={note.id} views={views} />
        </WithSync>
      </DataMemoryRouter>
    );
    const { rerender } = render(tree(0));
    await screen.findByRole("heading", { name: "Primera" });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    // Renombrado desde el árbol: sólo cambia la ruta, el contenido es el de la base.
    await value.notes.rename(note.id, "Nueva.md", (await value.notes.get(note.id)).rev);
    rerender(tree(1));
    await screen.findByRole("heading", { name: "Nueva" });
    expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveValue("uno!");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Guardado");
    const stored = await db.get<{ content: string; path: string; _conflicts?: string[] }>(note.id, { conflicts: true });
    expect(stored.content).toBe("uno!");
    expect(stored.path).toBe("Nueva.md");
    expect(stored._conflicts).toBeUndefined();
  });

  // RF-011
  it("si el contenido también cambió sigue el camino de P-8 (rama en conflicto, nada se pierde)", async () => {
    const db = memoryDb();
    const { value } = syncValue({}, db);
    const note = await value.notes.create(VAULT, "Primera");
    await value.notes.save(note.id, "uno", (await value.notes.get(note.id)).rev);
    const tree = (version: number) => (
      <DataMemoryRouter>
        <WithSync value={{ ...value, notesVersion: version }}>
          <NoteEditor noteId={note.id} views={views} />
        </WithSync>
      </DataMemoryRouter>
    );
    const { rerender } = render(tree(0));
    await screen.findByRole("heading", { name: "Primera" });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    await value.notes.save(note.id, "desde otro", (await value.notes.get(note.id)).rev);
    rerender(tree(1));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Guardado");
    const stored = await db.get<{ _conflicts?: string[] }>(note.id, { conflicts: true });
    expect(stored._conflicts).toHaveLength(1);
  });
});

describe("nota abierta enviada a la papelera por sync (VF-4, VF-5)", () => {
  /** Nota "Primera" abierta; devuelve cómo cambiar `notesVersion` y la tienda para manipularla por fuera. */
  async function openTrashable(content = "uno") {
    const db = memoryDb();
    const { value } = syncValue({}, db);
    const note = await value.notes.create(VAULT, "Primera");
    await value.notes.save(note.id, content, (await value.notes.get(note.id)).rev);
    const tree = (version: number) => (
      <DataMemoryRouter>
        <WithSync value={{ ...value, notesVersion: version }}>
          <NoteEditor noteId={note.id} views={views} />
        </WithSync>
      </DataMemoryRouter>
    );
    const utils = render(tree(0));
    await screen.findByRole("heading", { name: "Primera" });
    const trash = async () => value.notes.softDelete(note.id, (await value.notes.get(note.id)).rev);
    return { ...utils, tree, value, note, trash };
  }

  // RF-017
  it("'Restaurar y guardar' devuelve la nota con el borrador", async () => {
    const { tree, rerender, value, note, trash } = await openTrashable();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    await trash();
    rerender(tree(1));
    await userEvent.click(await screen.findByRole("button", { name: "Restaurar y guardar" }));
    await screen.findByText("Guardado");
    const stored = await value.notes.get(note.id);
    expect(stored.content).toBe("uno!");
    expect(stored.deleted_at).toBeNull();
    expect(screen.queryByRole("button", { name: "Restaurar y guardar" })).toBeNull();
  });

  // RF-013
  it("con la ruta ocupada muestra el mensaje y el borrador queda intacto", async () => {
    const { tree, rerender, value, note, trash } = await openTrashable();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    await trash();
    await value.notes.create(VAULT, "Primera"); // otra nota ocupa la ruta
    rerender(tree(1));
    await userEvent.click(await screen.findByRole("button", { name: "Restaurar y guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya hay una nota con esa ruta");
    expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveValue("uno!");
    expect((await value.notes.list(VAULT, { deleted: true })).map((n) => n.id)).toEqual([note.id]);
  });

  // RF-013
  it("al reaparecer la nota desaparece el aviso 'no existe'", async () => {
    const { tree, rerender, value, note, trash } = await openTrashable();
    const trashed = await trash();
    rerender(tree(1));
    expect(await screen.findByText("La nota ya no existe.")).toBeInTheDocument();
    await value.notes.restore(note.id, trashed.rev);
    rerender(tree(2));
    await screen.findByRole("heading", { name: "Primera" });
    expect(screen.queryByText("La nota ya no existe.")).toBeNull();
  });
});

describe("conflicto y cambios de otros (RF-009 aviso)", () => {
  // RF-009
  it("avisa con enlace a /conflicts si la nota abierta está en conflicto", async () => {
    const db = memoryDb();
    const { value } = syncValue({}, db);
    const note = await value.notes.create(VAULT, "Primera");
    const conflict: NoteConflict = {
      kind: "note",
      id: note.id,
      winner: { rev: "2-a", doc: {} as NoteConflict["winner"]["doc"] },
      loser: { rev: "2-b", doc: {} as NoteConflict["loser"]["doc"] },
    };
    render(
      <DataMemoryRouter>
        <WithSync value={{ ...value, conflicts: [conflict] }}>
          <NoteEditor noteId={note.id} views={views} />
        </WithSync>
      </DataMemoryRouter>,
    );
    const link = await screen.findByRole("link", { name: /conflictos/i });
    expect(link).toHaveAttribute("href", "/conflicts");
  });

  // RF-007
  it("sin cambios locales, un cambio remoto de la nota se refleja al cambiar notesVersion", async () => {
    const db = memoryDb();
    const { value } = syncValue({}, db);
    const note = await value.notes.create(VAULT, "Primera");
    const tree = (version: number) => (
      <DataMemoryRouter>
        <WithSync value={{ ...value, notesVersion: version }}>
          <NoteEditor noteId={note.id} views={views} />
        </WithSync>
      </DataMemoryRouter>
    );
    const { rerender } = render(tree(0));
    await screen.findByRole("heading", { name: "Primera" });
    const stored = await value.notes.get(note.id);
    await createNoteStore(db).save(note.id, "desde otro dispositivo", stored.rev);
    rerender(tree(1));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Contenido de la nota" })).toHaveValue("desde otro dispositivo"),
    );
  });
});

describe("con los editores reales (Milkdown y CodeMirror)", () => {
  /** Markdown que `remark-stringify` reformatearía (viñetas `*`, énfasis `_`, línea final): si algo reserializa, se nota. */
  const ORIGINAL = "# Título\n\n* uno\n* dos\n\nUn *énfasis* y _otro_.\n\n\n\nFin";

  async function openReal(content: string) {
    const db = memoryDb();
    const { value } = syncValue({}, db);
    const note = await value.notes.create(VAULT, "Real");
    await value.notes.save(note.id, content, note.rev);
    render(
      <DataMemoryRouter>
        <WithSync value={value}>
          <NoteEditor noteId={note.id} editOnOpen />
        </WithSync>
      </DataMemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Real" });
    return { value, note };
  }

  /** El texto que tiene CodeMirror ahora mismo. */
  function codeText(): string {
    const dom = document.querySelector(".cm-editor") as HTMLElement;
    return EditorView.findFromDOM(dom)!.state.doc.toString();
  }

  // RF-025 (P-7)
  it("tabla: «Insertar tabla» inserta cabecera + 1 fila × 2 columnas y, con el cursor en ella, aparecen añadir fila y columna", async () => {
    await openReal("hola");
    await waitFor(() => expect(document.querySelector(".ProseMirror")).toHaveTextContent("hola"));
    expect(screen.queryByRole("button", { name: "Añadir fila debajo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Añadir columna a la derecha" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Insertar tabla" }));
    await waitFor(() => expect(document.querySelectorAll(".ProseMirror table tr")).toHaveLength(2));
    expect(document.querySelectorAll(".ProseMirror th")).toHaveLength(2);
    expect(document.querySelectorAll(".ProseMirror td")).toHaveLength(2);
    await userEvent.click(await screen.findByRole("button", { name: "Añadir fila debajo" }));
    await waitFor(() => expect(document.querySelectorAll(".ProseMirror table tr")).toHaveLength(3));
    await userEvent.click(screen.getByRole("button", { name: "Añadir columna a la derecha" }));
    await waitFor(() => expect(document.querySelectorAll(".ProseMirror th")).toHaveLength(3));
    expect(document.querySelectorAll(".ProseMirror td")).toHaveLength(6);
    // La tabla marca la nota con cambios.
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
  });

  // RF-025
  it("tabla: en Código no hay botón de tabla ni de filas/columnas", async () => {
    await openReal("hola");
    await userEvent.click(screen.getByRole("button", { name: "Insertar tabla" }));
    await screen.findByRole("button", { name: "Añadir fila debajo" });
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    expect(screen.queryByRole("button", { name: "Insertar tabla" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Añadir fila debajo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Añadir columna a la derecha" })).toBeNull();
  });

  // RF-008
  it("Visual → Código → Visual sin editar deja el markdown idéntico byte a byte", async () => {
    const { value, note } = await openReal(ORIGINAL);
    await waitFor(() => expect(document.querySelector(".ProseMirror h1")).toHaveTextContent("Título"));
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    expect(codeText()).toBe(ORIGINAL);
    await userEvent.click(screen.getByRole("button", { name: "Visual" }));
    await waitFor(() => expect(document.querySelector(".ProseMirror h1")).toHaveTextContent("Título"));
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    expect(codeText()).toBe(ORIGINAL);
    // Nada que guardar: el borrador nunca cambió y el almacén sigue con el original.
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect((await value.notes.get(note.id)).content).toBe(ORIGINAL);
  });

  // RF-008
  it("una edición en Código aparece en Visual", async () => {
    await openReal("hola");
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    const view = EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement)!;
    act(() => view.dispatch({ changes: { from: 4, insert: " mundo" } }));
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Visual" }));
    await waitFor(() => expect(document.querySelector(".ProseMirror")).toHaveTextContent("hola mundo"));
  });

  // E-6 (PLAN-0008 §25): el listener de Milkdown emite con un debounce de 200 ms y su `destroy`
  // descarta lo pendiente. Una edición en Visual seguida (en menos de 200 ms) de un cambio de vista,
  // de «Leer» o de Ctrl+S no puede perderse ni guardar el texto anterior.
  describe("E-6: edición reciente en Visual (menos de 200 ms)", () => {
    /** Abre "hola" en edición con Milkdown real y escribe «!!» directamente en ProseMirror (sin esperar el debounce). */
    async function typeQuickly() {
      let view: PMView | null = null;
      const real: NoteEditorViews = {
        Visual: (props) => <MilkdownView {...props} onView={(v) => (view = v)} />,
        Code: CodeView,
      };
      const db = memoryDb();
      const { value } = syncValue({}, db);
      const note = await value.notes.create(VAULT, "Rapida");
      await value.notes.save(note.id, "hola", note.rev);
      render(
        <DataMemoryRouter>
          <WithSync value={value}>
            <NoteEditor noteId={note.id} editOnOpen views={real} />
          </WithSync>
        </DataMemoryRouter>,
      );
      await screen.findByRole("heading", { name: "Rapida" });
      await waitFor(() => expect(view).not.toBeNull());
      const pm = view as unknown as PMView;
      act(() => {
        pm.dispatch(pm.state.tr.insertText("!!", pm.state.doc.content.size - 1));
      });
      return { value, note };
    }

    it("RF-008: alternar a Código enseguida conserva el texto escrito", async () => {
      await typeQuickly();
      fireEvent.click(screen.getByRole("button", { name: "Código" }));
      await waitFor(() => expect(codeText()).toContain("hola!!"));
    });

    it("RF-008: «Leer» enseguida guarda el texto escrito", async () => {
      const { value, note } = await typeQuickly();
      fireEvent.click(screen.getByRole("button", { name: "Leer" }));
      await screen.findByRole("button", { name: "Editar" });
      expect((await value.notes.get(note.id)).content).toContain("hola!!");
    });

    it("RF-008: Ctrl+S enseguida guarda el texto nuevo, no el anterior", async () => {
      const { value, note } = await typeQuickly();
      fireEvent.keyDown(screen.getByRole("region", { name: "Editor de nota" }), { key: "s", ctrlKey: true });
      await screen.findByText("Guardado");
      expect((await value.notes.get(note.id)).content).toContain("hola!!");
    });
  });

  // E-7 (PLAN-0008 §26): «sucio» y «texto» no pueden depender del markdown con debounce. Cada camino que
  // decide con el borrador (cambio de nota, borrado, cierre de sesión, `beforeunload`, revisión nueva)
  // se prueba con los editores reales y la acción dentro de los 200 ms siguientes a teclear en Visual.
  describe("E-7: decisiones que no pueden esperar al debounce de 200 ms", () => {
    /** `beforeTyping` corre tras abrir y ANTES de teclear (así lo que sigue cae dentro de la ventana de 200 ms). */
    async function openQuick(extra: Partial<SyncContextValue> = {}, beforeTyping?: (ctx: { value: SyncContextValue; note: { id: string } }) => Promise<void>) {
      let view: PMView | null = null;
      const real: NoteEditorViews = {
        Visual: (props) => <MilkdownView {...props} onView={(v) => (view = v)} />,
        Code: CodeView,
      };
      const db = memoryDb();
      const { value } = syncValue(extra, db);
      const note = await value.notes.create(VAULT, "Rapida");
      await value.notes.save(note.id, "hola", note.rev);
      const other = await value.notes.create(VAULT, "Otra");
      const handle = createRef<NoteEditorHandle>();
      const ui = (noteId: string, v: SyncContextValue = value) => (
        <DataMemoryRouter>
          <WithSync value={v}>
            <NoteEditor ref={handle} noteId={noteId} editOnOpen views={real} />
          </WithSync>
        </DataMemoryRouter>
      );
      const utils = render(ui(note.id));
      await screen.findByRole("heading", { name: "Rapida" });
      await waitFor(() => expect(view).not.toBeNull());
      await beforeTyping?.({ value, note });
      const pm = view as unknown as PMView;
      act(() => {
        pm.dispatch(pm.state.tr.insertText("!!", pm.state.doc.content.size - 1)); // sin esperar el debounce
      });
      return { ...utils, value, note, other, handle, ui };
    }

    it("RF-008: pedir otra nota enseguida pregunta y no pisa el texto escrito", async () => {
      const { rerender, other, ui } = await openQuick();
      rerender(ui(other.id));
      expect(await screen.findByRole("alertdialog", { name: "Esta nota tiene cambios sin guardar." })).toBeInTheDocument();
      expect(document.querySelector(".ProseMirror")).toHaveTextContent("hola!!");
    });

    it("RF-010: borrar la nota abierta enseguida pide confirmación (no resuelve true sin preguntar)", async () => {
      const { handle } = await openQuick();
      let answer: boolean | null = null;
      void handle.current!.confirmDiscard().then((ok) => (answer = ok));
      expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
      expect(answer).toBeNull();
    });

    it("RF-008: el borrador cuenta como sin guardar para el cierre de sesión desde el primer momento", async () => {
      const register = vi.fn(() => () => undefined);
      await openQuick({ unsavedDrafts: { register, any: () => false } });
      expect(register).toHaveBeenCalled();
    });

    it("RF-008: beforeunload avisa enseguida", async () => {
      await openQuick();
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it("RF-008: una revisión nueva de la nota no pisa el texto recién escrito", async () => {
      const { value, note, rerender, ui } = await openQuick({}, async ({ value: v, note: n }) => {
        const current = await v.notes.get(n.id);
        await v.notes.save(n.id, "remoto", current.rev); // otra pestaña / el pull, antes de teclear
      });
      rerender(ui(note.id, { ...value, notesVersion: 1 })); // el pull avisa dentro de los 200 ms
      // Espera por tiempo JUSTIFICADA (F-3): se afirma una ausencia (que el editor NO adopte «remoto») y la
      // relectura no emite señal; 50 ms sobran para `notes.get` en memoria y quedan dentro de la ventana.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(document.querySelector(".ProseMirror")).toHaveTextContent("hola!!");
    });

    // E-8 (PLAN-0008 §27): «Restaurar y guardar» también lee el texto por `readDraft()`.
    it("RF-014: «Restaurar y guardar» enseguida guarda el texto recién escrito", async () => {
      const { value, note, rerender, ui } = await openQuick();
      const current = await value.notes.get(note.id);
      await value.notes.softDelete(note.id, current.rev); // la mandó a la papelera otro dispositivo
      rerender(ui(note.id, { ...value, notesVersion: 1 }));
      fireEvent.click(await screen.findByRole("button", { name: "Restaurar y guardar" }));
      await screen.findByText("Guardado");
      expect((await value.notes.get(note.id)).content).toContain("hola!!");
    });
  });

  // U-6 (PLAN-0008 §28): al pasar a edición por una acción del usuario, el foco va al editor activo.
  describe("U-6: foco en el editor al pasar a edición", () => {
    async function openRealRead() {
      const db = memoryDb();
      const { value } = syncValue({}, db);
      const note = await value.notes.create(VAULT, "Foco");
      await value.notes.save(note.id, "hola", note.rev);
      render(
        <DataMemoryRouter>
          <WithSync value={value}>
            <NoteEditor noteId={note.id} />
          </WithSync>
        </DataMemoryRouter>,
      );
      await screen.findByRole("heading", { name: "Foco" });
    }

    it("RF-007: una nota nueva (se abre en edición) recibe el foco en el editor visual", async () => {
      await openReal("hola");
      await waitFor(() => expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveFocus());
    });

    it("RF-007: «Editar» lleva el foco al editor visual", async () => {
      await openRealRead();
      await userEvent.click(screen.getByRole("button", { name: "Editar" }));
      await waitFor(() => expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveFocus());
    });

    it("RF-007: abrir en lectura no mueve el foco", async () => {
      await openRealRead();
      await waitFor(() => expect(document.querySelector(".ProseMirror")).not.toBeNull());
      expect(document.body).toHaveFocus();
    });

    it("RF-007: con la vista Código activa, «Leer» y luego «Editar» devuelve el foco a CodeMirror", async () => {
      await openReal("hola");
      await userEvent.click(screen.getByRole("button", { name: "Código" }));
      await waitFor(() => expect(document.querySelector(".cm-content")).not.toBeNull());
      await userEvent.click(screen.getByRole("button", { name: "Leer" }));
      await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
      await waitFor(() => expect(document.querySelector(".cm-content")).toHaveFocus());
    });

    it("RF-008: alternar de vista no arrebata el foco (sólo el paso a edición lo mueve)", async () => {
      await openReal("hola");
      await waitFor(() => expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveFocus());
      const toggle = screen.getByRole("button", { name: "Código" });
      toggle.focus();
      await userEvent.click(toggle);
      await waitFor(() => expect(document.querySelector(".cm-content")).not.toBeNull());
      expect(toggle).toHaveFocus();
    });
  });
});

// H-011: el `Workspace` pasa las notas vivas y el editor las reenvía a la vista Visual para resolver
// wikilinks. Aquí se verifica sólo el cableado (la resolución y el pintado se prueban en MilkdownView).
describe("wikilinks · cableado de notas de la bóveda (H-011)", () => {
  it("reenvía `vaultNotes` a la vista Visual por su prop `notes`", async () => {
    let received: readonly { id: string; path: string }[] | undefined;
    function CapturingVisual({ value, onChange, label, readOnly, notes }: ViewProps) {
      received = notes;
      return <textarea aria-label={label} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} />;
    }
    const vaultNotes = [{ id: "note:v:1", path: "Nota A.md" }];
    await setup("hola", {}, { views: { Visual: CapturingVisual, Code: fake("code") }, vaultNotes });
    expect(received).toEqual(vaultNotes);
  });

  // H-014 C-8: el `Workspace` pasa el color de la bóveda y el editor lo reenvía a la vista Visual por su
  // prop `vaultColor`, para que `.milkdown-view` publique las variables de color del documento.
  it("H-014: reenvía `vaultColor` a la vista Visual", async () => {
    let received: string | undefined = "no-render";
    function CapturingVisual({ value, onChange, label, readOnly, vaultColor }: ViewProps) {
      received = vaultColor;
      return <textarea aria-label={label} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} />;
    }
    await setup("hola", {}, { views: { Visual: CapturingVisual, Code: fake("code") }, vaultColor: "purple" });
    expect(received).toBe("purple");
  });

  // H-012: en Lectura, el editor cablea el clic de wikilink de la vista Visual (`onWikilinkClick`) a su
  // propio callback `onOpenWikilink`, que el `Workspace` usa para navegar o crear.
  it("reenvía el clic de wikilink de la vista (Lectura) a `onOpenWikilink`", async () => {
    let fire: ((link: { resolvedId: string | null; target: string }) => void) | undefined;
    function CapturingVisual({ value, onChange, label, readOnly, onWikilinkClick }: ViewProps) {
      fire = onWikilinkClick;
      return <textarea aria-label={label} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} />;
    }
    const onOpenWikilink = vi.fn();
    await setup("hola", {}, { views: { Visual: CapturingVisual, Code: fake("code") }, onOpenWikilink });
    expect(fire).toBeTypeOf("function");
    act(() => fire!({ resolvedId: "note:v:1", target: "Nota A" }));
    expect(onOpenWikilink).toHaveBeenCalledWith({ resolvedId: "note:v:1", target: "Nota A" });
  });

  // H-012 C-5: la vista Código nunca recibe el callback de clic — ahí el wikilink ni existe como marca
  // (es un componente de texto plano aparte), así que jamás puede navegar.
  it("C-5: la vista Código no recibe `onWikilinkClick` (nunca navega desde Código)", async () => {
    let codeGotClick: unknown = "no-render";
    function CapturingCode({ value, onChange, label, readOnly, onWikilinkClick }: ViewProps) {
      codeGotClick = onWikilinkClick;
      return <textarea aria-label={label} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} />;
    }
    await setup("hola", {}, { views: { Visual: fake("visual"), Code: CapturingCode }, onOpenWikilink: vi.fn() });
    // Pasa a edición y a la vista Código para que `CapturingCode` se monte.
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    await screen.findByRole("textbox", { name: "Editor de código" });
    expect(codeGotClick).toBeUndefined();
  });
});

// H-021: la tarjeta de vista previa. El editor sólo la monta en Lectura y sólo si el dispositivo tiene
// puntero fino (C-5); cablea el hover de la vista de Lectura a la tarjeta y la creación de la nota rota al
// mismo `onOpenWikilink` (C-7). Se usa `matchMedia` para simular tener o no puntero.
describe("wikilinks · vista previa en Lectura (H-021)", () => {
  const RECT = { top: 10, bottom: 30, left: 20, right: 120, width: 100, height: 20, x: 20, y: 10, toJSON: () => ({}) } as DOMRect;

  /** Fuerza el resultado de `matchMedia` para la consulta de puntero fino (`hover: hover`). */
  function withPointer(fine: boolean, fn: () => Promise<void>): Promise<void> {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({ matches: /hover:\s*hover/.test(query) ? fine : false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }) as unknown as MediaQueryList);
    return fn().finally(() => {
      window.matchMedia = original;
    });
  }

  it("C-1: en Lectura con puntero fino, un hover resuelto muestra la tarjeta con el título de la nota", async () => {
    await withPointer(true, async () => {
      let fireHover: ((h: { resolvedId: string | null; target: string; rect: DOMRect } | null) => void) | undefined;
      function CapturingVisual({ value, onChange, label, readOnly, onWikilinkHover }: ViewProps) {
        if (readOnly && onWikilinkHover) fireHover = onWikilinkHover;
        return <textarea aria-label={label} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} />;
      }
      const { second } = await setup("hola", {}, { views: { Visual: CapturingVisual, Code: fake("code") } });
      expect(fireHover).toBeTypeOf("function");
      act(() => fireHover!({ resolvedId: second.id, target: "Segunda", rect: RECT }));
      // La tarjeta aparece tras el retardo (~400 ms) con el nombre de la nota destino como título.
      expect(await screen.findByText("Segunda")).toBeInTheDocument();
    });
  });

  it("C-5: en edición Visual la vista no recibe `onWikilinkHover` (ninguna tarjeta en edición)", async () => {
    await withPointer(true, async () => {
      let editGotHover: unknown = "no-render";
      function CapturingVisual({ value, onChange, label, readOnly, onWikilinkHover }: ViewProps) {
        if (!readOnly) editGotHover = onWikilinkHover;
        return <textarea aria-label={label} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} />;
      }
      await setup("hola", {}, { views: { Visual: CapturingVisual, Code: fake("code") } });
      await userEvent.click(screen.getByRole("button", { name: "Editar" }));
      await screen.findByRole("textbox", { name: "Editor visual" });
      expect(editGotHover).toBeUndefined();
    });
  });

  it("C-5: sin puntero fino, la vista de Lectura no recibe `onWikilinkHover` (ninguna tarjeta)", async () => {
    await withPointer(false, async () => {
      let readGotHover: unknown = "no-render";
      function CapturingVisual({ value, onChange, label, readOnly, onWikilinkHover }: ViewProps) {
        if (readOnly) readGotHover = onWikilinkHover;
        return <textarea aria-label={label} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} />;
      }
      await setup("hola", {}, { views: { Visual: CapturingVisual, Code: fake("code") } });
      expect(readGotHover).toBeUndefined();
    });
  });

  it("C-7: crear la nota desde la tarjeta de un wikilink roto llama a `onOpenWikilink` con el `target`", async () => {
    await withPointer(true, async () => {
      let fireHover: ((h: { resolvedId: string | null; target: string; rect: DOMRect } | null) => void) | undefined;
      function CapturingVisual({ value, onChange, label, readOnly, onWikilinkHover }: ViewProps) {
        if (readOnly && onWikilinkHover) fireHover = onWikilinkHover;
        return <textarea aria-label={label} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} />;
      }
      const onOpenWikilink = vi.fn();
      await setup("hola", {}, { views: { Visual: CapturingVisual, Code: fake("code") }, onOpenWikilink });
      act(() => fireHover!({ resolvedId: null, target: "Nota Nueva", rect: RECT }));
      const create = await screen.findByText(/esta nota no existe\. clic para crearla/i);
      act(() => create.click());
      expect(onOpenWikilink).toHaveBeenCalledWith({ resolvedId: null, target: "Nota Nueva" });
    });
  });
});
