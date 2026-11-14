// H-056: ventana global de tareas — todas las bóvedas juntas, cada tarea con su bóveda.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AllTasks from "./AllTasks";
import * as api from "./tasksApi";
import { resetAgentProfiles } from "../agents/agentProfiles";
import * as profilesApi from "../agents/agentProfilesApi";
import { WithSync, syncValue } from "../test-utils/sync";
import type { Task } from "./tasksApi";

function task(over: Partial<Task>): Task {
  return {
    id: "t", vault_id: "v1", parent_id: null, sort_order: 0, title: "T", description: null, notes: null, status: "pending", priority: "medium",
    start_at: null, due_at: null, assignee_type: "user", assignee_agent_id: null, path: null, reminders: null, created_by: "user", updated_by: "user", version: 3,
    created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z", completed_at: null, purge_at: null, ...over,
  };
}

const A = task({ id: "a", vault_id: "v1", title: "Tarea de Carrera" });
const B = task({ id: "b", vault_id: "v2", title: "Tarea de Proyectos", path: "Plan.md" });
const C = task({ id: "c", vault_id: "v2", parent_id: "b", title: "Subtarea de Proyectos" });

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
}

async function renderPage() {
  const { value } = syncValue();
  await value.vaults.create({ name: "Carrera", icon: null, description: "", tags: [] });
  await value.vaults.create({ name: "Proyectos", icon: null, description: "", tags: [] });
  const list = await value.vaults.list();
  const ids = Object.fromEntries(list.map((v) => [v.name, v.id]));
  vi.spyOn(api, "listAllTasks").mockResolvedValue([
    { ...A, vault_id: ids.Carrera }, { ...B, vault_id: ids.Proyectos }, { ...C, vault_id: ids.Proyectos },
  ]);
  render(
    <WithSync value={value}>
      <MemoryRouter initialEntries={["/tareas"]}>
        <AllTasks />
        <Routes><Route path="*" element={<Where />} /></Routes>
      </MemoryRouter>
    </WithSync>,
  );
  await screen.findByText("Tarea de Carrera");
  return ids;
}

describe("AllTasks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetAgentProfiles();
    vi.spyOn(profilesApi, "listAgentProfiles").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("junta las tareas de todas las bóvedas y muestra la bóveda de cada una", async () => {
    await renderPage();
    expect(screen.getByText("Tarea de Proyectos")).toBeInTheDocument();
    expect(screen.getByText("Subtarea de Proyectos")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Bóveda: Carrera")).toHaveLength(1));
    expect(screen.getAllByText("Bóveda: Proyectos").length).toBeGreaterThanOrEqual(1);
  });

  it("filtra por bóveda", async () => {
    await renderPage();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Bóveda" }), await screen.findByRole("option", { name: /Proyectos/ }));
    expect(screen.queryByText("Tarea de Carrera")).toBeNull();
    expect(screen.getByText("Tarea de Proyectos")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Bóveda" }), "all");
    expect(screen.getByText("Tarea de Carrera")).toBeInTheDocument();
  });

  it("cambiar el estado actualiza la tarea en SU bóveda", async () => {
    const ids = await renderPage();
    const update = vi.spyOn(api, "updateTask").mockResolvedValue(A);
    await userEvent.selectOptions(screen.getByLabelText("Estado de Tarea de Carrera"), "in_progress");
    expect(update).toHaveBeenCalledWith(ids.Carrera, expect.objectContaining({ id: "a" }), { status: "in_progress" });
  });

  it("no ofrece editar ni borrar aquí: abre la tarea en su bóveda", async () => {
    const ids = await renderPage();
    expect(screen.queryByRole("button", { name: /^Editar / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Eliminar / })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Abrir Tarea de Carrera en su bóveda" }));
    expect(screen.getByTestId("where")).toHaveTextContent(`/vaults/${ids.Carrera}?tab=tareas&task=a`);
  });

  it("el detalle muestra la bóveda y se abre en ella", async () => {
    const ids = await renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Ver detalle de Tarea de Proyectos" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Proyectos", { selector: ".tasks-chip--vault" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: /Abrir en la bóveda/ }));
    expect(screen.getByTestId("where")).toHaveTextContent(`/vaults/${ids.Proyectos}?tab=tareas&task=b`);
  });
});
