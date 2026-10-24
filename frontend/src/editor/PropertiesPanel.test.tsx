// SPEC-0010 RF-009, RF-010, RF-013, RNF-003: panel de propiedades en lectura.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PropertiesPanel } from "./PropertiesPanel";

const panel = () => screen.getByRole("group", { name: "Propiedades" });

describe("PropertiesPanel", () => {
  // RF-009
  it("muestra un dt/dd por clave, en el orden de las claves", () => {
    render(<PropertiesPanel frontmatter={{ titulo: "Plan", proyecto: "Synapse", version: 3 }} />);
    const terms = within(panel()).getAllByRole("term");
    expect(terms.map((t) => t.textContent)).toEqual(["titulo", "proyecto", "version"]);
    expect(within(panel()).getAllByRole("definition").map((d) => d.textContent)).toEqual(["Plan", "Synapse", "3"]);
  });

  // RF-009
  it("el booleano se escribe «Sí»/«No» con icono decorativo (no es un input)", () => {
    render(<PropertiesPanel frontmatter={{ activo: true, borrador: false }} />);
    const values = within(panel()).getAllByRole("definition");
    expect(values.map((d) => d.textContent)).toEqual(["Sí", "No"]);
    expect(panel().querySelector("input")).toBeNull();
    expect(panel().querySelectorAll("svg[aria-hidden='true']").length).toBe(2);
  });

  // RF-009
  it("la lista de strings es un chip por elemento", () => {
    render(<PropertiesPanel frontmatter={{ etiquetas: ["diseño", "editor"] }} />);
    expect(Array.from(panel().querySelectorAll(".note-chip")).map((c) => c.textContent)).toEqual(["diseño", "editor"]);
  });

  // RF-009
  it("un string vacío se escribe «(vacío)»", () => {
    render(<PropertiesPanel frontmatter={{ vacio: "" }} />);
    expect(within(panel()).getByText("(vacío)")).toBeInTheDocument();
  });

  // RF-013
  it("un valor complejo es código de sólo lectura con aviso «edítalo en Código»", () => {
    render(<PropertiesPanel frontmatter={{ config: { nivel: 2, opciones: ["a"] } }} />);
    expect(panel().querySelector("code")?.textContent).toBe('{"nivel":2,"opciones":["a"]}');
    expect(within(panel()).getByText(/Sólo lectura: edítalo en Código/)).toBeInTheDocument();
    expect(panel().querySelector("svg[aria-hidden='true']")).not.toBeNull(); // icono `lock`
  });

  // RF-010
  it("no hay panel con frontmatter ausente, null o {}", () => {
    const { rerender } = render(<PropertiesPanel frontmatter={undefined} />);
    expect(screen.queryByRole("group", { name: "Propiedades" })).toBeNull();
    rerender(<PropertiesPanel frontmatter={{}} />);
    expect(screen.queryByRole("group", { name: "Propiedades" })).toBeNull();
    rerender(<PropertiesPanel frontmatter={null} />);
    expect(screen.queryByRole("group", { name: "Propiedades" })).toBeNull();
  });

  // RNF-003
  it("el HTML y las URLs de los valores son texto: sin nodos script ni enlaces", () => {
    render(<PropertiesPanel frontmatter={{ html: "<script>alert(1)</script><b>x</b>", enlace: "https://example.com/x" }} />);
    expect(panel().querySelector("script, b, a")).toBeNull();
    expect(within(panel()).getByText("<script>alert(1)</script><b>x</b>")).toBeInTheDocument();
    expect(within(panel()).getByText("https://example.com/x")).toBeInTheDocument();
  });

  // RF-009
  it("con 10 o más propiedades muestra 6 y «Mostrar n más» (aria-expanded) despliega el resto", async () => {
    const frontmatter = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i + 1}`, `v${i + 1}`]));
    render(<PropertiesPanel frontmatter={frontmatter} />);
    expect(within(panel()).getAllByRole("term")).toHaveLength(6);
    const more = within(panel()).getByRole("button", { name: "Mostrar 6 más" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    expect(within(panel()).getAllByRole("term")).toHaveLength(12);
    expect(within(panel()).getByRole("button", { name: "Mostrar menos" })).toHaveAttribute("aria-expanded", "true");
  });

  // RF-009
  it("con menos de 10 propiedades no hay nada enfocable", () => {
    render(<PropertiesPanel frontmatter={{ a: "1", b: "2" }} />);
    expect(panel().querySelector("button, a, input, [tabindex]")).toBeNull();
  });
});
