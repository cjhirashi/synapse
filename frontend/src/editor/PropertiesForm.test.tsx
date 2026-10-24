// SPEC-0010 RF-010, RF-011, RF-013: formulario de propiedades de la vista Visual.
import { createRef } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PropertiesForm, type PropertiesFormHandle } from "./PropertiesForm";

const FM = { titulo: "Plan", version: 3, activo: true, etiquetas: ["a", "b"] };
const form = () => screen.getByRole("group", { name: "Propiedades" });

describe("PropertiesForm", () => {
  // RF-011
  it("una fila por propiedad con sus controles nombrados y la cabecera de columnas", () => {
    render(<PropertiesForm frontmatter={FM} />);
    const rows = within(form()).getAllByRole("group", { name: /^Propiedad: / });
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["Propiedad: titulo", "Propiedad: version", "Propiedad: activo", "Propiedad: etiquetas"]);
    const first = within(rows[0]);
    expect(first.getByRole("textbox", { name: "Clave de la propiedad 1" })).toHaveValue("titulo");
    expect(first.getByRole("combobox", { name: "Tipo de «titulo»" })).toHaveValue("text");
    expect(first.getByRole("textbox", { name: "Valor de «titulo»" })).toHaveValue("Plan");
    expect(first.getByRole("button", { name: "Quitar propiedad titulo" })).toBeInTheDocument();
    for (const column of ["Clave", "Tipo", "Valor"]) expect(within(form()).getByText(column)).toBeInTheDocument();
    const options = within(first.getByRole("combobox")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Texto", "Número", "Sí/No", "Lista"]);
  });

  // RF-011
  it("cada tipo tiene su control de valor: número en texto decimal, Sí/No casilla, lista con chips", () => {
    render(<PropertiesForm frontmatter={FM} />);
    const number = screen.getByRole("textbox", { name: "Valor de «version»" });
    expect(number).toHaveAttribute("inputmode", "decimal");
    expect(number).toHaveValue("3");
    const check = screen.getByRole("checkbox", { name: /Sí/ });
    expect(check).toBeChecked();
    expect(screen.getByRole("button", { name: "Quitar a" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Añadir elemento a «etiquetas»" })).toBeInTheDocument();
  });

  // RF-010
  it("sin propiedades sólo hay un botón compacto «Añadir propiedad»; al activarlo nace una fila con el foco en la clave", async () => {
    render(<PropertiesForm frontmatter={{}} />);
    expect(screen.queryByRole("group", { name: "Propiedades" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Añadir propiedad" }));
    expect(within(form()).getAllByRole("group", { name: /^Propiedad/ })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Clave de la propiedad 1" })).toHaveFocus();
  });

  // RF-011
  it("editar clave y valor emite el objeto nuevo en el orden de las filas", async () => {
    const onChange = vi.fn();
    render(<PropertiesForm frontmatter={{ a: "x" }} onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Valor de «a»" }), "y");
    expect(onChange).toHaveBeenLastCalledWith({ a: "xy" });
    await userEvent.click(screen.getByRole("button", { name: "Añadir propiedad" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Clave de la propiedad 2" }), "b");
    expect(onChange).toHaveBeenLastCalledWith({ a: "xy", b: "" });
  });

  // RF-011
  it("quitar una propiedad la elimina, lo anuncia y manda el foco a la clave siguiente", async () => {
    const onChange = vi.fn();
    render(<PropertiesForm frontmatter={{ a: "1", b: "2" }} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Quitar propiedad a" }));
    expect(screen.queryByRole("group", { name: "Propiedad: a" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Propiedad «a» quitada");
    expect(screen.getByRole("textbox", { name: "Clave de la propiedad 1" })).toHaveValue("b");
    expect(screen.getByRole("textbox", { name: "Clave de la propiedad 1" })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith({ b: "2" });
  });

  // RF-011
  it("quitar la última fila deja el foco en «Añadir propiedad»", async () => {
    render(<PropertiesForm frontmatter={{ a: "1" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Quitar propiedad a" }));
    expect(screen.getByRole("button", { name: "Añadir propiedad" })).toHaveFocus();
  });

  // RF-011
  it("cambiar de tipo convierte el valor y anuncia cuando se vacía", async () => {
    render(<PropertiesForm frontmatter={{ a: "hola", n: "7" }} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Tipo de «n»" }), "number");
    expect(screen.getByRole("textbox", { name: "Valor de «n»" })).toHaveValue("7");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Tipo de «a»" }), "number");
    expect(screen.getByRole("textbox", { name: "Valor de «a»" })).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("El valor de «a» se vació al cambiar de tipo");
  });

  // RF-011
  it("lista: Enter y coma añaden, pegar con comas divide y Enter nunca envía el formulario", async () => {
    const onChange = vi.fn();
    const submit = vi.fn((event: Event) => event.preventDefault());
    const { container } = render(
      <form onSubmit={submit as never}>
        <PropertiesForm frontmatter={{ t: ["a"] }} onChange={onChange} />
      </form>,
    );
    const input = screen.getByRole("textbox", { name: "Añadir elemento a «t»" });
    await userEvent.type(input, "b{Enter}");
    expect(onChange).toHaveBeenLastCalledWith({ t: ["a", "b"] });
    await userEvent.type(input, "c,");
    expect(onChange).toHaveBeenLastCalledWith({ t: ["a", "b", "c"] });
    await userEvent.click(input);
    await userEvent.paste("d, e ,f");
    expect(onChange).toHaveBeenLastCalledWith({ t: ["a", "b", "c", "d", "e", "f"] });
    expect(submit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Quitar b" }));
    expect(onChange).toHaveBeenLastCalledWith({ t: ["a", "c", "d", "e", "f"] });
    expect(container.querySelectorAll(".note-chip").length).toBe(5);
  });

  // RF-013
  it("un valor complejo se ve como código de sólo lectura, sin tipo, con «Quitar» activo y se conserva al editar otras filas", async () => {
    const onChange = vi.fn();
    render(<PropertiesForm frontmatter={{ a: "x", config: { nivel: 2 } }} onChange={onChange} />);
    const row = within(screen.getByRole("group", { name: "Propiedad: config" }));
    expect(row.getByText('{"nivel":2}')).toBeInTheDocument();
    expect(row.queryByRole("combobox")).toBeNull();
    expect(row.getByText("Sólo se edita en Código")).toBeInTheDocument();
    expect(row.getByRole("button", { name: "Quitar propiedad config" })).toBeEnabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Valor de «a»" }), "y");
    expect(onChange).toHaveBeenLastCalledWith({ a: "xy", config: { nivel: 2 } });
  });

  // RF-011
  it("errores al salir del campo: clave vacía, duplicada y número no válido, con aria-invalid y aria-describedby", async () => {
    render(<PropertiesForm frontmatter={{ a: "1", b: "2", n: 3 }} />);
    const keyB = screen.getByRole("textbox", { name: "Clave de la propiedad 2" });
    await userEvent.clear(keyB);
    await userEvent.tab();
    expect(keyB).toHaveAttribute("aria-invalid", "true");
    const message = document.getElementById(keyB.getAttribute("aria-describedby")!.split(" ")[0])!;
    expect(message).toHaveTextContent("Escribe un nombre para la propiedad");
    await userEvent.type(keyB, "a");
    await userEvent.tab();
    expect(document.getElementById(keyB.getAttribute("aria-describedby")!.split(" ")[0])).toHaveTextContent("Ya hay una propiedad llamada «a»");
    const number = screen.getByRole("textbox", { name: "Valor de «n»" });
    await userEvent.clear(number);
    await userEvent.type(number, "x");
    await userEvent.tab();
    expect(number).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(number.getAttribute("aria-describedby")!.split(" ")[0])).toHaveTextContent("Escribe un número válido, como 3 o 2.5");
  });

  // RF-011
  it("validate() con errores devuelve false y lleva el foco a un resumen role=alert con un botón por error", async () => {
    const ref = createRef<PropertiesFormHandle>();
    render(<PropertiesForm ref={ref} frontmatter={{ a: "1", b: "2" }} />);
    await userEvent.clear(screen.getByRole("textbox", { name: "Clave de la propiedad 1" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Clave de la propiedad 2" }));
    let ok = true;
    act(() => {
      ok = ref.current!.validate();
    });
    expect(ok).toBe(false);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No se pudo guardar: revisa 2 propiedades");
    expect(alert).toHaveFocus();
    const buttons = within(alert).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[1]);
    expect(screen.getByRole("textbox", { name: "Clave de la propiedad 2" })).toHaveFocus();
  });

  // RF-011
  it("validate() sin errores devuelve true y no muestra resumen", () => {
    const ref = createRef<PropertiesFormHandle>();
    render(<PropertiesForm ref={ref} frontmatter={{ a: "1" }} />);
    let ok = false;
    act(() => {
      ok = ref.current!.validate();
    });
    expect(ok).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // RF-011
  it("Sí/No alterna el booleano", async () => {
    const onChange = vi.fn();
    render(<PropertiesForm frontmatter={{ activo: true }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Sí/ }));
    expect(onChange).toHaveBeenLastCalledWith({ activo: false });
    expect(screen.getByRole("checkbox", { name: /No/ })).not.toBeChecked();
  });
});
