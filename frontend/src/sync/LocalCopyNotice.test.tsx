// Aviso en el login de la copia local que no se pudo borrar (SPEC-0005 RF-017; PLAN-0005 §12 VE-1, §13 VF-3, VF-4).
import { render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { expect, test } from "vitest";
import LocalCopyNotice from "./LocalCopyNotice";

const COPY_KEPT = "No se pudo borrar la copia local de este dispositivo.";
const DISCARD_PENDING = "Se borrará la próxima vez que se inicie sesión en este dispositivo.";

/** Muestra el estado de navegación de la entrada actual. */
function CurrentState() {
  return <p>estado {JSON.stringify(useLocation().state)}</p>;
}

function renderWith(state: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/login", search: "?x=1", state }]}>
      <LocalCopyNotice />
      <CurrentState />
    </MemoryRouter>,
  );
}

test("con la copia conservada y la marca escrita avisa que se borrará", () => {
  renderWith({ localCopyKept: true, discardPending: true });
  expect(screen.getByRole("alert")).toHaveTextContent(`${COPY_KEPT} ${DISCARD_PENDING}`);
});

test("sin la marca no promete el borrado (VF-4)", () => {
  renderWith({ localCopyKept: true, discardPending: false });
  expect(screen.getByRole("alert")).toHaveTextContent(COPY_KEPT);
  expect(screen.getByRole("alert")).not.toHaveTextContent(DISCARD_PENDING);
});

test("quita el estado de la entrada y conserva el aviso (VF-3)", async () => {
  renderWith({ localCopyKept: true, discardPending: true });
  expect(await screen.findByText("estado null")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(COPY_KEPT);
});

test("sin ese estado no muestra nada ni toca la entrada", () => {
  renderWith({ otra: true });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText('estado {"otra":true}')).toBeInTheDocument();
});
