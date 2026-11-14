// H-057: bloqueo entre tareas — chip, estado «Hecha» bloqueado, selector de bloqueadoras y detalle de dependencias.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VaultTasks from "./VaultTasks";
import * as api from "./tasksApi";
import * as agentAccess from "../settings/agentAccess";
import { resetAgentProfiles } from "../agents/agentProfiles";
import * as profilesApi from "../agents/agentProfilesApi";
import { WithSync, syncValue } from "../test-utils/sync";
import type { Task } from "./tasksApi";

function task(over: Partial<Task>): Task {
  return {
    id: "t", vault_id: "v", parent_id: null, sort_order: 0, title: "T", description: null, notes: null, status: "pending", priority: "medium",
    start_at: null, due_at: null, assignee_type: "user", assignee_agent_id: null, path: null, reminders: null, created_by: "user", updated_by: "user", version: 3,
    created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z", completed_at: null, purge_at: null, blocked_by: [], blocked: false, project_id: null, ...over,
  };
}

const BASE = task({ id: "base", title: "Base de datos" });
const DEPENDS = task({ id: "dep", title: "Interfaz", blocked_by: ["base"], blocked: true });
const FREE = task({ id: "free", title: "Documentar" });
const makeNotes = () => ({ list: vi.fn().mockResolvedValue([]), get: vi.fn() }) as any;

function Page() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [{ value }] = useState(() => syncValue({ notes: makeNotes() }));
  return (
    <WithSync value={value}>
      <div ref={setSlot} />
      <VaultTasks vaultId="v" accent="red" sideSlot={slot} onOpenNote={vi.fn()} onOpenFolder={vi.fn()} onCloseSide={vi.fn()} onOpenCount={vi.fn()} />
    </WithSync>
  );
}

describe("bloqueo entre tareas", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetAgentProfiles();
    vi.spyOn(profilesApi, "listAgentProfiles").mockResolvedValue([]);
    vi.spyOn(api, "listTasks").mockResolvedValue([BASE, DEPENDS, FREE]);
    vi.spyOn(agentAccess, "getVaultAgentAccess").mockResolvedValue({ mode: "enforce", agents: [], unregistered_keys: [], unregistered_agent_ids: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it("una tarea bloqueada lo dice y nombra a su bloqueadora", async () => {
    render(<Page />);
    expect(await screen.findByText("Bloqueada por «Base de datos»")).toBeInTheDocument();
  });

  it("puede ponerse en curso, pero «Hecha» queda bloqueada mientras su bloqueadora no esté hecha", async () => {
    render(<Page />);
    await screen.findByText("Interfaz");
    const select = screen.getByLabelText("Estado de Interfaz");
    expect(within(select).getByRole("option", { name: "Hecha" })).toBeDisabled();
    expect(within(select).getByRole("option", { name: "En progreso" })).toBeEnabled();
    expect(within(screen.getByLabelText("Estado de Documentar")).getByRole("option", { name: "Hecha" })).toBeEnabled();
  });

  it("con la bloqueadora hecha la tarea ya no se muestra bloqueada", async () => {
    vi.spyOn(api, "listTasks").mockResolvedValue([{ ...BASE, status: "done" }, { ...DEPENDS, blocked: false }, FREE]);
    render(<Page />);
    await screen.findByText("Interfaz");
    expect(screen.queryByText(/Bloqueada por/)).toBeNull();
    expect(within(screen.getByLabelText("Estado de Interfaz")).getByRole("option", { name: "Hecha" })).toBeEnabled();
  });

  it("el formulario elige bloqueadoras de la bóveda y las manda en blocked_by", async () => {
    const update = vi.spyOn(api, "updateTask").mockResolvedValue(FREE);
    render(<Page />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar Documentar" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar tarea" });
    const picker = within(dialog).getByRole("combobox", { name: "Añadir una tarea bloqueadora" });
    expect(within(picker).queryByRole("option", { name: /Documentar/ })).toBeNull(); // no puede bloquearse a sí misma
    await userEvent.selectOptions(picker, within(picker).getByRole("option", { name: /Base de datos/ }));
    expect(within(dialog).getByText("Base de datos")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(update).toHaveBeenCalledWith("v", FREE, expect.objectContaining({ blocked_by: ["base"] }));
  });

  it("se puede quitar el bloqueo desde el formulario", async () => {
    const update = vi.spyOn(api, "updateTask").mockResolvedValue(DEPENDS);
    render(<Page />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar Interfaz" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar tarea" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Quitar el bloqueo de Base de datos" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(update).toHaveBeenCalledWith("v", DEPENDS, expect.objectContaining({ blocked_by: [] }));
  });

  it("el detalle lista de qué depende y a quién bloquea", async () => {
    render(<Page />);
    await userEvent.click(await screen.findByRole("button", { name: "Ver detalle de Interfaz" }));
    const dialog = await screen.findByRole("dialog", { name: "Interfaz" });
    expect(within(dialog).getByText("Bloqueada por")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Abrir Base de datos" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Abrir Base de datos" }));
    const other = await screen.findByRole("dialog", { name: "Base de datos" });
    expect(within(other).getByText("Bloquea a")).toBeInTheDocument();
    expect(within(other).getByRole("button", { name: "Abrir Interfaz" })).toBeInTheDocument();
  });
});
