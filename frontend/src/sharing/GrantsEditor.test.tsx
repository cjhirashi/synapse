import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import GrantsEditor from "./GrantsEditor";
import type { Grant } from "./sharingApi";

const FOLDERS = ["Docs", "Docs/Sub", "Proyectos"];
const READ_ALL: Grant = { folder: "*", level: "lectura" };

function setup(initial: Grant[], folders = FOLDERS) {
  const changes: Grant[][] = [];
  function Harness() {
    const [value, setValue] = useState(initial);
    return <GrantsEditor value={value} onChange={(next) => { changes.push(next); setValue(next); }} folders={folders} idPrefix="t" />;
  }
  render(<Harness />);
  return changes;
}

const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;

test("marca Lector, Editor o Personalizado según las concesiones", () => {
  const { unmount } = render(<GrantsEditor value={[READ_ALL]} onChange={() => {}} folders={FOLDERS} idPrefix="a" />);
  expect(radio("Lector").checked).toBe(true);
  unmount();
  const second = render(<GrantsEditor value={[{ folder: "*", level: "escritura" }]} onChange={() => {}} folders={FOLDERS} idPrefix="b" />);
  expect(radio("Editor").checked).toBe(true);
  second.unmount();
  render(<GrantsEditor value={[{ folder: "Docs", level: "lectura" }]} onChange={() => {}} folders={FOLDERS} idPrefix="c" />);
  expect(radio("Personalizado").checked).toBe(true);
});

test("Editor y Lector reemplazan las concesiones por una sola sobre toda la bóveda", async () => {
  const changes = setup([READ_ALL]);
  await userEvent.click(radio("Editor"));
  expect(changes.at(-1)).toEqual([{ folder: "*", level: "escritura" }]);
  await userEvent.click(radio("Lector"));
  expect(changes.at(-1)).toEqual([READ_ALL]);
});

test("pasar a Personalizado no cambia las concesiones y muestra la fila para editarla", async () => {
  const changes = setup([READ_ALL]);
  expect(screen.queryByLabelText("Carpeta")).toBeNull();
  await userEvent.click(radio("Personalizado"));
  expect(radio("Personalizado").checked).toBe(true);
  expect(changes).toEqual([]);
  expect(screen.getByLabelText("Carpeta")).toHaveValue("*");
  expect(screen.getByLabelText("Acceso")).toHaveValue("lectura");
});

test("«Agregar carpeta» toma la primera libre, y con toda la bóveda ya concedida la agrega con escritura", async () => {
  const changes = setup([READ_ALL, { folder: "Proyectos", level: "lectura" }]);
  await userEvent.click(screen.getByRole("button", { name: "Agregar carpeta" }));
  expect(changes.at(-1)).toEqual([READ_ALL, { folder: "Proyectos", level: "lectura" }, { folder: "Docs", level: "escritura" }]);
});

test("sin toda la bóveda concedida la carpeta nueva empieza en solo lectura", async () => {
  const changes = setup([{ folder: "Docs", level: "escritura" }]);
  await userEvent.click(screen.getByRole("button", { name: "Agregar carpeta" }));
  expect(changes.at(-1)).toEqual([{ folder: "Docs", level: "escritura" }, { folder: "*", level: "lectura" }]);
});

test("una carpeta usada en otra fila queda deshabilitada y «Agregar» se apaga sin carpetas libres", async () => {
  setup([{ folder: "Docs", level: "lectura" }, { folder: "*", level: "lectura" }], ["Docs"]);
  const second = screen.getAllByLabelText("Carpeta")[1] as HTMLSelectElement;
  expect((within(second, "Docs") as HTMLOptionElement).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Agregar carpeta" })).toBeDisabled();
});

function within(select: HTMLSelectElement, value: string): HTMLOptionElement {
  return Array.from(select.options).find((o) => o.value === value)!;
}

test("no se puede quitar la última fila; con dos se quita la elegida", async () => {
  const changes = setup([{ folder: "Docs", level: "lectura" }, { folder: "Proyectos", level: "escritura" }]);
  await userEvent.click(screen.getByRole("button", { name: "Quitar permiso de Docs" }));
  expect(changes.at(-1)).toEqual([{ folder: "Proyectos", level: "escritura" }]);
  expect(screen.getByRole("button", { name: "Quitar permiso de Proyectos" })).toBeDisabled();
});

test("cambiar el nivel de una fila", async () => {
  const changes = setup([{ folder: "Docs", level: "lectura" }]);
  await userEvent.selectOptions(screen.getByLabelText("Acceso"), "escritura");
  expect(changes.at(-1)).toEqual([{ folder: "Docs", level: "escritura" }]);
});

test("una carpeta concedida que ya no existe sigue como opción marcada", () => {
  setup([{ folder: "Vieja", level: "lectura" }, { folder: "Docs", level: "escritura" }]);
  const first = screen.getAllByLabelText("Carpeta")[0] as HTMLSelectElement;
  expect(first.value).toBe("Vieja");
  expect(within(first, "Vieja").textContent).toBe("Vieja (ya no existe)");
});

test("deshabilitado bloquea todos los controles", () => {
  const onChange = vi.fn();
  render(<GrantsEditor value={[{ folder: "Docs", level: "lectura" }, { folder: "*", level: "lectura" }]} onChange={onChange} folders={FOLDERS} disabled idPrefix="d" />);
  for (const control of [...screen.getAllByRole("radio"), ...screen.getAllByRole("combobox"), screen.getByRole("button", { name: "Agregar carpeta" })]) {
    expect(control).toBeDisabled();
  }
});
