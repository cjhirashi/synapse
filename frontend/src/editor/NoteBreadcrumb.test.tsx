// SPEC-0010 RF-054, RF-055, RF-063 (P-17): migas de la nota abierta en el encabezado.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteBreadcrumb } from "./NoteBreadcrumb";

const PATH = "Proyectos/Clientes/Plan de entregas.md";

describe("NoteBreadcrumb", () => {
  // RF-054
  it("es un nav «Ruta» con una lista: carpetas como botones con título, separador «/» decorativo y el nombre como h2", () => {
    render(<NoteBreadcrumb path={PATH} onRevealFolder={() => {}} />);
    const nav = screen.getByRole("navigation", { name: "Ruta" });
    expect(nav.querySelector("ol")).not.toBeNull();
    const buttons = within(nav).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Proyectos", "Clientes"]);
    expect(buttons[0]).toHaveAttribute("title", "Mostrar «Proyectos» en el árbol");
    const separators = [...nav.querySelectorAll("li > span")];
    expect(separators.map((s) => s.textContent)).toEqual(["/", "/"]);
    for (const separator of separators) expect(separator).toHaveAttribute("aria-hidden", "true");
    const heading = within(nav).getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("Plan de entregas");
    expect(heading).toHaveAttribute("aria-current", "page");
    expect(heading).toHaveAttribute("title", "Proyectos/Clientes/Plan de entregas");
  });

  // RF-054
  it("una nota en la raíz sólo muestra su nombre", () => {
    render(<NoteBreadcrumb path="Nota.md" onRevealFolder={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Nota");
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("title", "Nota");
  });

  // RF-055
  it("pulsar una carpeta pide mostrarla en el árbol con su ruta completa", async () => {
    const onRevealFolder = vi.fn();
    render(<NoteBreadcrumb path={PATH} onRevealFolder={onRevealFolder} />);
    await userEvent.click(screen.getByRole("button", { name: "Clientes" }));
    expect(onRevealFolder).toHaveBeenCalledWith("Proyectos/Clientes");
  });

  // RF-065
  it("al cambiar la ruta (renombrar o mover) se actualizan las migas", () => {
    const { rerender } = render(<NoteBreadcrumb path={PATH} onRevealFolder={() => {}} />);
    rerender(<NoteBreadcrumb path="Otra/Nota nueva.md" onRevealFolder={() => {}} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Otra"]);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Nota nueva");
  });
});

describe("NoteBreadcrumb · truncado por segmento (anchos simulados)", () => {
  let resize: (() => void) | null = null;
  const natural = new Map<string, number>();
  let navWidth = 0;

  beforeEach(() => {
    resize = null;
    natural.clear();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    // jsdom no hace *layout*: los anchos naturales de cada segmento y el del nav se simulan.
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
      return natural.get(this.textContent ?? "") ?? 0;
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "NAV" ? navWidth : 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const maxWidths = () => [...screen.getByRole("navigation").querySelectorAll<HTMLElement>("button, h2")].map((el) => el.style.maxWidth);

  // RF-063
  it("si todo cabe no se limita ningún segmento", () => {
    natural.set("Proyectos", 100).set("Clientes", 100).set("Plan de entregas", 100);
    navWidth = 500;
    render(<NoteBreadcrumb path={PATH} onRevealFolder={() => {}} />);
    expect(maxWidths()).toEqual(["100px", "100px", "100px"]);
  });

  // RF-063
  it("si no cabe, recorta cada carpeta por igual y respeta el nombre", () => {
    natural.set("Proyectos", 100).set("Clientes", 100).set("Plan de entregas", 200);
    navWidth = 300; // separadores: 2 × 16 → quedan 68 para las dos carpetas
    render(<NoteBreadcrumb path={PATH} onRevealFolder={() => {}} />);
    expect(maxWidths()).toEqual(["34px", "34px", "200px"]);
  });

  // RF-063
  it("vuelve a repartir cuando cambia el ancho del encabezado", () => {
    natural.set("Proyectos", 100).set("Clientes", 100).set("Plan de entregas", 200);
    navWidth = 300;
    render(<NoteBreadcrumb path={PATH} onRevealFolder={() => {}} />);
    navWidth = 600;
    act(() => resize?.());
    expect(maxWidths()).toEqual(["100px", "100px", "200px"]);
  });

  // RF-063
  it("sin medidas (ancho 0) no limita nada", () => {
    navWidth = 0;
    render(<NoteBreadcrumb path={PATH} onRevealFolder={() => {}} />);
    expect(maxWidths()).toEqual(["", "", ""]);
  });
});
