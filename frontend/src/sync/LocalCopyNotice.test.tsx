// Aviso en el login de la copia local que no se pudo borrar (SPEC-0005 RF-017; PLAN-0005 §12 VE-1).
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import LocalCopyNotice from "./LocalCopyNotice";

test("con la copia conservada lo avisa", () => {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state: { localCopyKept: true } }]}>
      <LocalCopyNotice />
    </MemoryRouter>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudo borrar la copia local de este dispositivo.");
});

test("sin ese estado no muestra nada", () => {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state: { otra: true } }]}>
      <LocalCopyNotice />
    </MemoryRouter>,
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
