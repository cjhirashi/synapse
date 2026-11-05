import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import AgentAccessPage from "./AgentAccessPage";
import * as api from "./agentAccess";
import { parseFolders } from "./agentAccess";

const VAULTS = [
  { id: "v1", name: "Proyectos" },
  { id: "v2", name: "Personal" },
];
const ACCESS = {
  mode: "shadow",
  agents: [
    { agent_id: "aira", estado: "activo", carpetas: ["1 - Proyectos AIRA", "00- BITACORA"], note_id: "n1", keys: [{ label: "op-aira", is_admin: false }] },
  ],
  unregistered_keys: [{ label: "op-emma", is_admin: false }],
  unregistered_agent_ids: ["emma"],
};

function setup() {
  render(
    <MemoryRouter initialEntries={["/settings/agent-access"]}>
      <Routes>
        <Route path="/settings/agent-access" element={<AgentAccessPage />} />
        <Route path="/login" element={<p>Pantalla de login</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

afterEach(() => vi.restoreAllMocks());

test("muestra cada agente con el nombre de su clave y las claves aún sin registrar", async () => {
  vi.spyOn(api, "listVaultOptions").mockResolvedValue(VAULTS);
  vi.spyOn(api, "getVaultAgentAccess").mockResolvedValue(ACCESS);
  setup();

  const aira = await screen.findByRole("listitem", { name: "Agente aira" });
  expect(within(aira).getByText(/clave: op-aira/)).toBeInTheDocument();
  expect(within(aira).getByRole("textbox")).toHaveValue("1 - Proyectos AIRA\n00- BITACORA");
  const emma = screen.getByRole("listitem", { name: "Agente emma" });
  expect(within(emma).getByText(/clave: op-emma/)).toBeInTheDocument();
  expect(within(emma).getByRole("button", { name: "Registrar emma" })).toBeInTheDocument();
  expect(screen.getByText(/modo sombra/i)).toBeInTheDocument();
});

test("reasignar: guarda las carpetas nuevas del agente y recarga", async () => {
  vi.spyOn(api, "listVaultOptions").mockResolvedValue(VAULTS);
  const get = vi.spyOn(api, "getVaultAgentAccess").mockResolvedValue(ACCESS);
  const put = vi.spyOn(api, "putAgentRegistration").mockResolvedValue(ACCESS.agents[0]);
  const user = setup();

  const aira = await screen.findByRole("listitem", { name: "Agente aira" });
  const box = within(aira).getByRole("textbox");
  await user.clear(box);
  await user.type(box, "Nueva carpeta/");
  await user.selectOptions(within(aira).getByRole("combobox"), "suspendido");
  await user.click(within(aira).getByRole("button", { name: "Guardar aira" }));

  expect(put).toHaveBeenCalledWith("v1", "aira", ["Nueva carpeta"], "suspendido");
  expect(get).toHaveBeenCalledTimes(2);
});

test("quitar un agente y cambiar de bóveda", async () => {
  vi.spyOn(api, "listVaultOptions").mockResolvedValue(VAULTS);
  const get = vi.spyOn(api, "getVaultAgentAccess").mockResolvedValue(ACCESS);
  const del = vi.spyOn(api, "deleteAgentRegistration").mockResolvedValue();
  const user = setup();

  await user.click(await screen.findByRole("button", { name: "Quitar aira" }));
  expect(del).toHaveBeenCalledWith("v1", "aira");
  await user.selectOptions(screen.getByLabelText("Bóveda"), "v2");
  expect(get).toHaveBeenLastCalledWith("v2");
});

test("carpetas inválidas: muestra el error del servidor", async () => {
  vi.spyOn(api, "listVaultOptions").mockResolvedValue(VAULTS);
  vi.spyOn(api, "getVaultAgentAccess").mockResolvedValue(ACCESS);
  const { ApiError } = await import("../api/problems");
  vi.spyOn(api, "putAgentRegistration").mockRejectedValue(new ApiError(422, { title: "bad" }));
  const user = setup();

  await user.click(await screen.findByRole("button", { name: "Guardar aira" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/carpetas no son válidas/i);
});

test("parseFolders limpia líneas vacías y barras finales", () => {
  expect(parseFolders(" A/B/ \n\n*\nC//")).toEqual(["A/B", "*", "C"]);
});
