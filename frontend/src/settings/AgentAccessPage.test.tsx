import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
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

beforeEach(() => {
  vi.spyOn(api, "listSkills").mockResolvedValue([]);
});
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
  await user.selectOptions(screen.getByLabelText("Bóveda a asignar"), "v2");
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


// --- H-041 E4: el gestor que sale ---

const TEAM = {
  mode: "shadow",
  agents: [
    { agent_id: "aira", estado: "activo", carpetas: ["*"], note_id: "n1", keys: [] },
    { agent_id: "emma", estado: "activo", carpetas: ["*"], note_id: "n2", keys: [] },
    { agent_id: "otro", estado: "activo", carpetas: ["*"], note_id: "n3", keys: [] },
  ],
  unregistered_keys: [],
  unregistered_agent_ids: [],
};
const skill = (name: string, propietario: string | null, agentes: string[] = [], estado = "borrador") => ({
  note_id: `id-${name}`, path: `AG - SKILLS/${name}.md`, titulo: null, propietario, agentes, estado,
});

test("un gestor sin skills se quita como siempre, sin ventana", async () => {
  vi.spyOn(api, "listVaultOptions").mockResolvedValue(VAULTS);
  vi.spyOn(api, "getVaultAgentAccess").mockResolvedValue(TEAM);
  vi.spyOn(api, "listSkills").mockResolvedValue([skill("skill-de-emma", "emma")]);
  const del = vi.spyOn(api, "deleteAgentRegistration").mockResolvedValue();
  const user = setup();
  await user.click(await screen.findByRole("button", { name: "Quitar aira" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(del).toHaveBeenCalledWith("v1", "aira");
});

test("quitar a un gestor con skills abre la ventana: con invitados se asigna o se elimina, sin invitados se elimina o se archiva", async () => {
  vi.spyOn(api, "listVaultOptions").mockResolvedValue(VAULTS);
  vi.spyOn(api, "getVaultAgentAccess").mockResolvedValue(TEAM);
  vi.spyOn(api, "listSkills").mockResolvedValue([
    skill("skill-compartida", "aira", ["emma", "otro"]), skill("skill-sola", "aira"), skill("skill-de-emma", "emma", ["aira"]),
  ]);
  const del = vi.spyOn(api, "deleteAgentRegistration").mockResolvedValue();
  const leave = vi.spyOn(api, "leaveAgent").mockResolvedValue({ asignadas: 1, eliminadas: 0, archivadas: 1, invitaciones_quitadas: 1 });
  const user = setup();
  const aira = await screen.findByRole("listitem", { name: "Agente aira" });
  expect(within(aira).getByText(/posee 2 activas · invitado en 1/)).toBeInTheDocument();
  await user.click(within(aira).getByRole("button", { name: "Quitar aira" }));

  const dialog = await screen.findByRole("dialog", { name: "Quitar a aira" });
  expect(del).not.toHaveBeenCalled();
  const confirm = within(dialog).getByRole("button", { name: "Confirmar y quitar" });
  expect(confirm).toBeDisabled(); // hay que elegir qué pasa con cada skill
  const shared = within(dialog).getByRole("listitem", { name: "Skill skill-compartida" });
  expect(within(shared).queryByRole("radio", { name: /Archivar/ })).toBeNull(); // con invitados no se archiva
  const alone = within(dialog).getByRole("listitem", { name: "Skill skill-sola" });
  expect(within(alone).queryByRole("radio", { name: /Asignar a/ })).toBeNull(); // sin invitados no hay a quién asignar
  await user.selectOptions(within(shared).getByRole("combobox", { name: "Nuevo propietario de skill-compartida" }), "otro");
  await user.click(within(shared).getByRole("radio", { name: /Asignar a/ }));
  expect(confirm).toBeDisabled();
  await user.click(within(alone).getByRole("radio", { name: /Archivar/ }));
  expect(confirm).toBeEnabled();
  await user.click(confirm);

  expect(leave).toHaveBeenCalledWith("v1", "aira", "quitar", [
    { note_id: "id-skill-compartida", accion: "assign", a: "otro" },
    { note_id: "id-skill-sola", accion: "archive" },
  ]);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("cancelar la ventana no toca nada; suspender a un gestor con skills también la abre", async () => {
  vi.spyOn(api, "listVaultOptions").mockResolvedValue(VAULTS);
  vi.spyOn(api, "getVaultAgentAccess").mockResolvedValue(TEAM);
  vi.spyOn(api, "listSkills").mockResolvedValue([skill("skill-sola", "aira")]);
  const put = vi.spyOn(api, "putAgentRegistration").mockResolvedValue(TEAM.agents[0]);
  const leave = vi.spyOn(api, "leaveAgent").mockResolvedValue({ asignadas: 0, eliminadas: 1, archivadas: 0, invitaciones_quitadas: 0 });
  const user = setup();
  const aira = await screen.findByRole("listitem", { name: "Agente aira" });
  await user.selectOptions(within(aira).getByRole("combobox"), "suspendido");
  await user.click(within(aira).getByRole("button", { name: "Guardar aira" }));
  const dialog = await screen.findByRole("dialog", { name: "Suspender a aira" });
  expect(put).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(leave).not.toHaveBeenCalled();

  await user.click(within(aira).getByRole("button", { name: "Guardar aira" }));
  const again = await screen.findByRole("dialog", { name: "Suspender a aira" });
  await user.click(within(again).getByRole("radio", { name: "Eliminar" }));
  await user.click(within(again).getByRole("button", { name: "Confirmar y suspender" }));
  expect(leave).toHaveBeenCalledWith("v1", "aira", "suspender", [{ note_id: "id-skill-sola", accion: "delete" }]);
});

test("las skills archivadas se asignan a un gestor activo desde «Skills sin propietario»", async () => {
  vi.spyOn(api, "listVaultOptions").mockResolvedValue(VAULTS);
  vi.spyOn(api, "getVaultAgentAccess").mockResolvedValue(TEAM);
  vi.spyOn(api, "listSkills").mockResolvedValue([skill("skill-huerfana", null, [], "archivado"), skill("skill-viva", "aira")]);
  const assign = vi.spyOn(api, "assignSkill").mockResolvedValue({ ...skill("skill-huerfana", "otro"), estado: "en revisión" });
  const user = setup();
  const section = await screen.findByRole("region", { name: "Skills sin propietario" });
  expect(within(section).getAllByRole("listitem")).toHaveLength(1); // la viva no aparece
  await user.selectOptions(within(section).getByRole("combobox", { name: "Asignar skill-huerfana a" }), "otro");
  await user.click(within(section).getByRole("button", { name: "Asignar skill-huerfana" }));
  expect(assign).toHaveBeenCalledWith("v1", "id-skill-huerfana", "otro");
});

test("sin skills archivadas no hay sección de skills sin propietario", async () => {
  vi.spyOn(api, "listVaultOptions").mockResolvedValue(VAULTS);
  vi.spyOn(api, "getVaultAgentAccess").mockResolvedValue(TEAM);
  setup();
  await screen.findByRole("listitem", { name: "Agente aira" });
  expect(screen.queryByRole("region", { name: "Skills sin propietario" })).toBeNull();
});
