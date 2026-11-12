import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import VaultTasks from "./VaultTasks";
import * as api from "./tasksApi";
import * as agentAccess from "../settings/agentAccess";
import { WithSync, syncValue } from "../test-utils/sync";
import type { Task } from "./tasksApi";

function task(over: Partial<Task>): Task {
  return {
    id: "t", vault_id: "v", parent_id: null, sort_order: 0, title: "T", description: null, notes: null, status: "pending", priority: "medium",
    due_at: null, assignee_type: "user", assignee_agent_id: null, path: null, created_by: "user", updated_by: "user", version: 3,
    created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z", completed_at: null, purge_at: null, ...over,
  };
}

const ROOT = task({ id: "r", title: "Publicar el plan", path: "Plan.md", due_at: "2026-11-20T15:00:00Z" });
const CHILD = task({ id: "c", parent_id: "r", title: "Escribir borrador", assignee_type: "agent", assignee_agent_id: "aira" });
const CLOSED = task({ id: "d", title: "Ya terminada", status: "done", completed_at: "2026-11-01T00:00:00Z", purge_at: "2026-12-01T00:00:00Z" });
const makeNotes = () => ({ list: vi.fn().mockResolvedValue([{ id: "n1", path: "Plan.md", rev: "1", updated_at: "", deleted_at: null, size: 1 }]), get: vi.fn() }) as any;

function Page(props: { onOpenNote?: (id: string) => void }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [{ value }] = useState(() => syncValue({ notes: makeNotes() }));
  return (
    <WithSync value={value}>
      <div ref={setSlot} data-testid="side" />
      <VaultTasks vaultId="v" accent="red" sideSlot={slot} onOpenNote={props.onOpenNote ?? vi.fn()} onOpenFolder={vi.fn()} onCloseSide={vi.fn()} onOpenCount={vi.fn()} />
    </WithSync>
  );
}

describe("VaultTasks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "listTasks").mockResolvedValue([ROOT, CHILD, CLOSED]);
    vi.spyOn(agentAccess, "getVaultAgentAccess").mockResolvedValue({ mode: "enforce", agents: [{ agent_id: "aira", estado: "activo", carpetas: ["*"], note_id: "x", keys: [] }], unregistered_keys: [], unregistered_agent_ids: [] });
  });

  it("lista la raíz con su subtarea, el avance y la fecha de eliminación de lo cerrado", async () => {
    render(<Page />);
    expect(await screen.findByText("Publicar el plan")).toBeInTheDocument();
    expect(screen.getByText("Escribir borrador")).toBeInTheDocument();
    expect(screen.getByText(/0\/1/)).toBeInTheDocument();
    expect(screen.getByText(/Se elimina el/)).toBeInTheDocument();
    // Una raíz con subtareas no deja cambiar su estado a mano.
    expect(screen.getByLabelText("Estado de Publicar el plan")).toBeDisabled();
  });

  it("cambiar el estado manda PATCH con la versión en If-Match y relee", async () => {
    const update = vi.spyOn(api, "updateTask").mockResolvedValue(CHILD);
    render(<Page />);
    await screen.findByText("Escribir borrador");
    await userEvent.selectOptions(screen.getByLabelText("Estado de Escribir borrador"), "in_progress");
    expect(update).toHaveBeenCalledWith("v", CHILD, { status: "in_progress" });
    await waitFor(() => expect(vi.mocked(api.listTasks).mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("la ruta existente abre el documento; la inexistente se muestra atenuada, sin bloquear", async () => {
    const onOpenNote = vi.fn();
    vi.spyOn(api, "listTasks").mockResolvedValue([ROOT, task({ id: "z", title: "Sin destino", path: "No/existe.md" })]);
    render(<Page onOpenNote={onOpenNote} />);
    await userEvent.click(await screen.findByRole("button", { name: /Plan\.md/ }));
    expect(onOpenNote).toHaveBeenCalledWith("n1");
    expect(screen.getByText("No/existe.md")).toHaveClass("tasks-chip--missing");
  });

  it("crea una tarea asignada a un agente con la ruta escrita", async () => {
    const create = vi.spyOn(api, "createTask").mockResolvedValue(ROOT);
    render(<Page />);
    await screen.findByText("Publicar el plan");
    await userEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Título"), "Revisar");
    await userEvent.selectOptions(within(dialog).getByLabelText("Asignada a"), "aira");
    await userEvent.type(within(dialog).getByLabelText(/Ruta/), "Carpeta/Doc.md");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(create).toHaveBeenCalledWith("v", expect.objectContaining({ title: "Revisar", assignee_type: "agent", assignee_agent_id: "aira", path: "Carpeta/Doc.md" }), undefined);
  });

  it("el calendario ubica la tarea en su día y el Kanban la separa por estado", async () => {
    render(<Page />);
    await screen.findByText("Publicar el plan");
    await userEvent.click(screen.getByRole("tab", { name: /Kanban/ }));
    expect(within(screen.getByRole("region", { name: "Hecha" })).getByText("Ya terminada")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Calendario/ }));
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("los filtros viven en la barra lateral", async () => {
    render(<Page />);
    await screen.findByText("Publicar el plan");
    const side = screen.getByTestId("side");
    await userEvent.selectOptions(within(side).getByLabelText("Asignada a"), "aira");
    expect(screen.queryByText("Ya terminada")).not.toBeInTheDocument();
    expect(screen.getByText("Escribir borrador")).toBeInTheDocument();
  });
});
