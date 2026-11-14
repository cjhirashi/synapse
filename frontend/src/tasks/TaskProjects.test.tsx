// H-058: proyectos de bóveda — lista agrupada, gestor de proyectos, proyecto de una tarea y filtro.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VaultTasks from "./VaultTasks";
import * as api from "./tasksApi";
import * as projectsApi from "./projectsApi";
import * as agentAccess from "../settings/agentAccess";
import { resetAgentProfiles } from "../agents/agentProfiles";
import * as profilesApi from "../agents/agentProfilesApi";
import { WithSync, syncValue } from "../test-utils/sync";
import type { Task } from "./tasksApi";
import type { Project } from "./projectsApi";

function task(over: Partial<Task>): Task {
  return {
    id: "t", vault_id: "v", parent_id: null, sort_order: 0, title: "T", description: null, notes: null, status: "pending", priority: "medium",
    start_at: null, due_at: null, assignee_type: "user", assignee_agent_id: null, path: null, reminders: null, created_by: "user", updated_by: "user", version: 3,
    created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z", completed_at: null, purge_at: null, blocked_by: [], blocked: false, project_id: null, ...over,
  };
}
function project(over: Partial<Project>): Project {
  return {
    id: "p", vault_id: "v", sort_order: 0, title: "P", description: null, status: "active", color: "blue", assignee_type: "user", assignee_agent_id: null,
    created_by: "user", updated_by: "user", version: 2, created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z", tasks_total: 0, tasks_done: 0, ...over,
  };
}

const LANZ = project({ id: "pa", title: "Lanzamiento", color: "green", tasks_total: 2, tasks_done: 1 });
const VACIO = project({ id: "pb", title: "Investigación", color: "purple", status: "on_hold" });
const IN_A = task({ id: "a", title: "Preparar demo", project_id: "pa" });
const LOOSE = task({ id: "l", title: "Pagar licencia" });
const makeNotes = () => ({ list: vi.fn().mockResolvedValue([]), get: vi.fn() }) as any;

function Page() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [{ value }] = useState(() => syncValue({ notes: makeNotes() }));
  return (
    <WithSync value={value}>
      <div ref={setSlot} data-testid="side" />
      <VaultTasks vaultId="v" accent="red" sideSlot={slot} onOpenNote={vi.fn()} onOpenFolder={vi.fn()} onCloseSide={vi.fn()} onOpenCount={vi.fn()} />
    </WithSync>
  );
}

describe("proyectos", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetAgentProfiles();
    vi.spyOn(profilesApi, "listAgentProfiles").mockResolvedValue([]);
    vi.spyOn(api, "listTasks").mockResolvedValue([IN_A, LOOSE]);
    vi.spyOn(projectsApi, "listProjects").mockResolvedValue([LANZ, VACIO]);
    vi.spyOn(agentAccess, "getVaultAgentAccess").mockResolvedValue({ mode: "enforce", agents: [], unregistered_keys: [], unregistered_agent_ids: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it("la lista se agrupa por proyecto, con su avance, y deja las tareas sueltas aparte", async () => {
    render(<Page />);
    const group = await screen.findByRole("region", { name: "Proyecto Lanzamiento" });
    expect(within(group).getByText("Preparar demo")).toBeInTheDocument();
    expect(within(group).getByText("1/2")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Proyecto Investigación" })).getByText("Sin tareas todavía.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Sin proyecto" })).getByText("Pagar licencia")).toBeInTheDocument();
  });

  it("el gestor crea un proyecto con título, estado, color y responsable", async () => {
    const create = vi.spyOn(projectsApi, "createProject").mockResolvedValue(LANZ);
    render(<Page />);
    await userEvent.click(await screen.findByRole("button", { name: "Proyectos" }));
    const manager = await screen.findByRole("dialog", { name: "Proyectos de la bóveda" });
    expect(within(manager).getByText("Investigación")).toBeInTheDocument();
    await userEvent.click(within(manager).getByRole("button", { name: /Nuevo proyecto/ }));
    const form = await screen.findByRole("dialog", { name: "Nuevo proyecto" });
    await userEvent.type(within(form).getByLabelText("Título"), "Migración");
    await userEvent.click(within(form).getByRole("radio", { name: "En pausa" }));
    await userEvent.click(within(form).getByRole("radio", { name: "Rojo" }));
    await userEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    expect(create).toHaveBeenCalledWith("v", expect.objectContaining({ title: "Migración", status: "on_hold", color: "red", assignee_type: "user", assignee_agent_id: null }));
  });

  it("eliminar un proyecto avisa que sus tareas quedan sin proyecto", async () => {
    const del = vi.spyOn(projectsApi, "deleteProject").mockResolvedValue();
    render(<Page />);
    await userEvent.click(await screen.findByRole("button", { name: "Proyectos" }));
    const manager = await screen.findByRole("dialog", { name: "Proyectos de la bóveda" });
    await userEvent.click(within(manager).getByRole("button", { name: "Eliminar el proyecto Lanzamiento" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("no se borran: quedan sin proyecto");
    await userEvent.click(within(confirm).getByRole("button", { name: "Eliminar" }));
    expect(del).toHaveBeenCalledWith("v", "pa");
  });

  it("una tarea elige su proyecto en el formulario", async () => {
    const update = vi.spyOn(api, "updateTask").mockResolvedValue(LOOSE);
    render(<Page />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar Pagar licencia" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar tarea" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Proyecto"), "pa");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(update).toHaveBeenCalledWith("v", LOOSE, expect.objectContaining({ project_id: "pa" }));
  });

  it("el filtro «Proyecto» deja solo las tareas de ese proyecto o las sueltas", async () => {
    render(<Page />);
    await screen.findByText("Preparar demo");
    const filter = within(screen.getByTestId("side")).getByRole("combobox", { name: "Proyecto" });
    await userEvent.selectOptions(filter, "pa");
    expect(screen.getByText("Preparar demo")).toBeInTheDocument();
    expect(screen.queryByText("Pagar licencia")).toBeNull();
    await userEvent.selectOptions(filter, "none");
    expect(screen.queryByText("Preparar demo")).toBeNull();
    expect(screen.getByText("Pagar licencia")).toBeInTheDocument();
  });

  it("el detalle muestra el proyecto de la tarea", async () => {
    render(<Page />);
    await userEvent.click(await screen.findByRole("button", { name: "Ver detalle de Preparar demo" }));
    const dialog = await screen.findByRole("dialog", { name: "Preparar demo" });
    expect(within(dialog).getByText("Lanzamiento")).toBeInTheDocument();
  });
});
