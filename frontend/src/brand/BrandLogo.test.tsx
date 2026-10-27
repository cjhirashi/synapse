// RF-012 (SPEC-0011): el logo es decorativo por construcción: un `span` oculto a las tecnologías de
// asistencia, sin texto, sin rol y sin parada de tabulación. El nombre accesible del bloque de marca
// lo pone el texto «Synapse» de su contenedor, no el logo.
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import BrandLogo from "./BrandLogo";

test("RF-012: BrandLogo es un span decorativo, sin texto, sin rol y sin tabindex", () => {
  const { container } = render(<BrandLogo />);

  const logo = container.querySelector("span.brand-logo");
  expect(container.children).toHaveLength(1);
  expect(logo).not.toBeNull();
  expect(logo).toHaveAttribute("aria-hidden", "true");
  expect(logo).toHaveTextContent("");
  expect(logo).not.toHaveAttribute("role");
  expect(logo).not.toHaveAttribute("tabindex");
  expect(container.querySelector("img, a, button, svg")).toBeNull();
});
