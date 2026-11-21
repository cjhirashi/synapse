// H-064 F7c-2: quien solo lee una bóveda compartida ve las tareas pero no puede crearlas, editarlas ni borrarlas.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as agentAccess from "../settings/agentAccess";
import { MeContext } from "../auth/RequireAuth";
import { WithSync, syncValue } from "../test-utils/sync";
import VaultTasks from "./VaultTasks";
import * as api from "./tasksApi";
import type { Task } from "./tasksApi";

const task = (over: Partial<Task>): Task => ({
  id: "t", vault_id: "v", parent_id: null, sort_order: 0, title: "T", description: null, notes: null, status: "pending", priority: "medium",
  start_at: null, due_at: null, assignee_type: "user", assignee_agent_id: null, path: null, reminders: null, created_by: "user", updated_by: "user", version: 3,
  created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z", completed_at: null, purge_at: null, blocked_by: [], blocked: false, project_id: null, ...over,
});
const ROOT = task({ id: "r", title: "Publicar el plan" });
const SHARED = { vaultId: "v", ownerName: "Ana", readOnly: true, grants: [{ folder: "Pub", level: "lectura" as const }] };
const makeNotes = () => ({ list: vi.fn().mockResolvedValue([]), get: vi.fn() }) as never;

function Page({ shared }: { shared: boolean }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [{ value }] = useState(() => syncValue({ notes: makeNotes(), ...(shared ? { shared: SHARED } : {}) }));
  return (
    <MeContext.Provider value={{ user_id: "u1", email: "u1@example.com", role: "guest", must_change_password: false, display_name: null, photo_url: null }}>
      <WithSync value={value}>
        <div ref={setSlot} />
        <VaultTasks vaultId="v" accent="red" sideSlot={slot} onOpenNote={vi.fn()} onOpenFolder={vi.fn()} onCloseSide={vi.fn()} onOpenCount={vi.fn()} />
      </WithSync>
    </MeContext.Provider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "listTasks").mockResolvedValue([ROOT]);
  vi.spyOn(agentAccess, "getVaultAgentAccess").mockResolvedValue({ mode: "enforce", agents: [], unregistered_keys: [], unregistered_agent_ids: [] });
});

describe("tareas de la bóveda: propietario frente a invitado lector", () => {
  it("el propietario ve crear, proyectos y, en cada tarea, editar, eliminar y subtarea", async () => {
    render(<Page shared={false} />);
    await screen.findByText("Publicar el plan");
    for (const name of [/Nueva tarea/, /^Proyectos$/, "Editar Publicar el plan", "Eliminar Publicar el plan", "Añadir subtarea a Publicar el plan"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Estado de Publicar el plan")).toBeEnabled();
  });

  it("el invitado lector ve la tarea y su detalle pero ninguna acción de escritura", async () => {
    render(<Page shared />);
    await screen.findByText("Publicar el plan");
    for (const name of [/Nueva tarea/, /^Proyectos$/, "Editar Publicar el plan", "Eliminar Publicar el plan", "Añadir subtarea a Publicar el plan"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.getByLabelText("Estado de Publicar el plan")).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Ver detalle de Publicar el plan" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Publicar el plan");
    for (const name of ["Editar", "Eliminar", "Añadir subtarea"]) {
      expect(screen.queryByRole("button", { name: new RegExp(name) })).toBeNull();
    }
    expect(screen.getAllByRole("button", { name: "Cerrar" }).length).toBeGreaterThan(0);
  });
});
