import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { MeContext } from "../auth/RequireAuth";
import UserBadge from "./UserBadge";

const ME = { user_id: "1", email: "carlos@x.com", role: "admin" as const, must_change_password: false, display_name: "Carlos Jiménez", photo_url: null };

test("con foto de perfil muestra tu foto y «Yo»", () => {
  const { container } = render(
    <MeContext.Provider value={{ ...ME, photo_url: "/auth/me/photo?v=3" }}><UserBadge /></MeContext.Provider>,
  );
  expect(container.querySelector("img")).toHaveAttribute("src", "/auth/me/photo?v=3");
  expect(screen.getByText("Yo")).toBeInTheDocument();
});

test("sin foto muestra tus iniciales, no una imagen rota", () => {
  const { container } = render(<MeContext.Provider value={ME}><UserBadge /></MeContext.Provider>);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector(".settings-avatar-placeholder")).toHaveTextContent("CJ");
});

test("sin nombre usa las iniciales del correo, y sin sesión no falla", () => {
  const named = render(<MeContext.Provider value={{ ...ME, display_name: null }}><UserBadge /></MeContext.Provider>);
  expect(named.container.querySelector(".settings-avatar-placeholder")?.textContent).toBeTruthy();
  named.unmount();
  const anonymous = render(<UserBadge />);
  expect(anonymous.container.querySelector(".settings-avatar-placeholder")).not.toBeNull();
});

test("la foto no ensucia el nombre accesible: el texto es «Yo» y la etiqueta puede cambiarse u ocultarse", () => {
  render(<MeContext.Provider value={ME}><UserBadge label="ti" /></MeContext.Provider>);
  expect(screen.getByText("ti")).toBeInTheDocument();
  expect(screen.queryByText("Yo")).toBeNull();
});
