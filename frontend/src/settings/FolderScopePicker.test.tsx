import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";
import FolderScopePicker from "./FolderScopePicker";

function setup(initial: string[], folders: string[], disabled = false) {
  const changes: string[][] = [];
  function Harness() {
    const [value, setValue] = useState(initial);
    return <FolderScopePicker value={value} onChange={(next) => { changes.push(next); setValue(next); }} folders={folders} disabled={disabled} idPrefix="t" />;
  }
  render(<Harness />);
  return { changes, user: userEvent.setup() };
}

const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
const row = (name: RegExp | string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;

test("marca el modo según el valor y cada modo emite lo que guarda el servidor", async () => {
  const { changes, user } = setup([], ["Docs"]);
  expect(radio("Ninguna").checked).toBe(true);
  await user.click(radio("Toda la bóveda"));
  expect(changes.at(-1)).toEqual(["*"]);
  expect(radio("Toda la bóveda").checked).toBe(true);
  await user.click(radio("Ninguna"));
  expect(changes.at(-1)).toEqual([]);
});

test("un valor con «*» y más carpetas se lee como toda la bóveda", () => {
  setup(["*", "Docs"], ["Docs"]);
  expect(radio("Toda la bóveda").checked).toBe(true);
});

test("«Carpetas» desde «Ninguna» muestra la lista sin cambiar el valor; desde «Toda la bóveda» lo vacía", async () => {
  const { changes, user } = setup([], ["Docs", "Docs/Sub"]);
  expect(screen.queryByRole("list")).toBeNull();
  await user.click(radio("Carpetas"));
  expect(changes).toEqual([]);
  expect(screen.getAllByRole("checkbox")).toHaveLength(2);

  await user.click(radio("Toda la bóveda"));
  await user.click(radio("Carpetas"));
  expect(changes.at(-1)).toEqual([]);
});

test("marcar y desmarcar emite las carpetas en el orden de la bóveda", async () => {
  const { changes, user } = setup(["B"], ["A", "B", "C"]);
  await user.click(row("C"));
  await user.click(row("A"));
  expect(changes.at(-1)).toEqual(["A", "B", "C"]);
  await user.click(row("B"));
  expect(changes.at(-1)).toEqual(["A", "C"]);
});

test("una carpeta que ya no existe sale marcada, se puede quitar y se conserva al marcar otra", async () => {
  const { changes, user } = setup(["Vieja"], ["Docs"]);
  expect(screen.getByText("(ya no existe)")).toBeInTheDocument();
  expect(row(/Vieja/).checked).toBe(true);

  await user.click(row("Docs"));
  expect(changes.at(-1)).toEqual(["Docs", "Vieja"]);

  await user.click(row(/Vieja/));
  expect(changes.at(-1)).toEqual(["Docs"]);
  expect(screen.queryByText("(ya no existe)")).toBeNull();
});

test("el filtro solo aparece con más de 8 carpetas y no oculta las que ya no existen", async () => {
  const many = Array.from({ length: 9 }, (_, i) => `Carpeta${i}`);
  const { user } = setup(["Vieja"], many);
  await user.type(screen.getByRole("searchbox", { name: "Filtrar carpetas" }), "carpeta3");
  expect(screen.getAllByRole("checkbox").map((c) => c.closest("label")?.textContent)).toEqual(["Vieja (ya no existe)", "Carpeta3"]);
});

test("sin más de 8 carpetas no hay filtro", async () => {
  const { user } = setup(["A"], ["A", "B"]);
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(2);
  await user.click(radio("Ninguna"));
});

test("la sangría de cada carpeta sale de su profundidad", async () => {
  setup(["A"], ["A", "A/B", "A/B/C"]);
  const pad = (n: string) => (row(n).closest("label") as HTMLElement).style.paddingLeft;
  expect([pad("A"), pad("A/B"), pad("A/B/C")]).toEqual(["12px", "26px", "40px"]);
});

test("sin carpetas en la bóveda lo dice", () => {
  setup(["x"], []);
  expect(screen.getByText("(ya no existe)")).toBeInTheDocument();
  expect(screen.queryByText("Esta bóveda aún no tiene carpetas.")).toBeNull();
});

test("con una bóveda sin carpetas y modo «Carpetas» elegido lo dice", async () => {
  const { user } = setup([], []);
  await user.click(radio("Carpetas"));
  expect(screen.getByText("Esta bóveda aún no tiene carpetas.")).toBeInTheDocument();
});

test("deshabilitado bloquea todos los controles", () => {
  setup(["A"], Array.from({ length: 9 }, (_, i) => `A${i}`), true);
  for (const control of [...screen.getAllByRole("radio"), ...screen.getAllByRole("checkbox"), screen.getByRole("searchbox")]) {
    expect(control).toBeDisabled();
  }
});
