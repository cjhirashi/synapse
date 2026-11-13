import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import VaultTasks from "./VaultTasks";
import * as api from "./tasksApi";
import * as agentAccess from "../settings/agentAccess";
import * as profilesApi from "../agents/agentProfilesApi";
import { resetAgentProfiles } from "../agents/agentProfiles";
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
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Asignada a" }));
    await userEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: /aira/ }));
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

  it("los filtros viven en la barra lateral y acotan la lista", async () => {
    render(<Page />);
    await screen.findByText("Publicar el plan");
    const side = screen.getByTestId("side");
    expect(within(side).queryByRole("button", { name: "Limpiar filtros" })).toBeNull(); // sin filtros activos no hay qué limpiar
    await userEvent.click(within(side).getByRole("combobox", { name: "Asignada a" }));
    await userEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: /aira/ }));
    expect(screen.queryByText("Ya terminada")).not.toBeInTheDocument();
    expect(screen.getByText("Escribir borrador")).toBeInTheDocument();
    expect(within(side).getByLabelText("1 filtro activo")).toBeInTheDocument();
    await userEvent.click(within(side).getByRole("button", { name: "Limpiar filtros" }));
    expect(await screen.findByText("Ya terminada")).toBeInTheDocument();
    expect(within(side).queryByRole("button", { name: "Limpiar filtros" })).toBeNull();
  });

  it("el estado se filtra con botones que se pueden combinar y muestran cuántas tareas hay en cada uno", async () => {
    render(<Page />);
    await screen.findByText("Publicar el plan");
    const side = screen.getByTestId("side");
    const done = within(side).getByRole("button", { name: /Hecha/ });
    const pending = within(side).getByRole("button", { name: /Pendiente/ });
    expect(done).toHaveTextContent("1"); // «Ya terminada»
    expect(pending).toHaveTextContent("2"); // la raíz y la subtarea
    expect(done).toHaveAttribute("aria-pressed", "false");
    expect(within(side).getByText(/Sin elegir ninguno se muestran todos los estados/)).toBeInTheDocument();
    await userEvent.click(done);
    expect(done).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Ya terminada")).toBeInTheDocument();
    expect(screen.queryByText("Publicar el plan")).not.toBeInTheDocument();
    await userEvent.click(pending);
    expect(screen.getByText("Publicar el plan")).toBeInTheDocument();
    expect(within(side).getByText(/cualquiera de los estados marcados/)).toBeInTheDocument();
  });

  it("el vencimiento se elige entre opciones con su contador, y el aviso de vencidas lo selecciona de un clic", async () => {
    vi.spyOn(api, "listTasks").mockResolvedValue([
      task({ id: "a", title: "Atrasada", due_at: "2020-01-01T00:00:00Z" }), task({ id: "b", title: "Sin fecha" }),
    ]);
    render(<Page />);
    await screen.findByText("Atrasada");
    const side = screen.getByTestId("side");
    const group = within(side).getByRole("radiogroup");
    expect(within(group).getByRole("radio", { name: /Todas/ })).toBeChecked();
    expect(within(group).getByRole("radio", { name: /Vencidas/ }).closest("label")).toHaveTextContent("1");
    await userEvent.click(within(side).getByRole("button", { name: /1 vencida/ }));
    expect(within(group).getByRole("radio", { name: /Vencidas/ })).toBeChecked();
    expect(screen.queryByText("Sin fecha", { selector: ".tasks-title" })).not.toBeInTheDocument();
    expect(within(side).queryByRole("button", { name: /1 vencida/ })).toBeNull(); // ya filtrado: el atajo sobra
    await userEvent.click(within(group).getByRole("radio", { name: /Sin fecha/ }));
    expect(screen.getByText("Sin fecha", { selector: ".tasks-title" })).toBeInTheDocument();
    expect(within(side).getByText(/de 2 tareas con estos filtros/)).toBeInTheDocument();
  });

  it("H-053: la tarea de un agente muestra su nombre visible y foto (asignada a, creada por) y las de la persona no gastan una consulta", async () => {
    resetAgentProfiles();
    const list = vi.spyOn(profilesApi, "listAgentProfiles").mockResolvedValue([
      { agent_id: "aira", display_name: "Aira · Arquitecta", photo_url: "/agent-profiles/aira/photo?v=1" },
    ]);
    vi.spyOn(api, "listTasks").mockResolvedValue([
      task({ id: "a", title: "Hecha por un agente", created_by: "agent:aira", assignee_type: "agent", assignee_agent_id: "aira" }),
    ]);
    render(<Page />);
    const row = (await screen.findByText("Hecha por un agente")).closest("li")!;
    expect(await within(row).findAllByText("Aira · Arquitecta")).toHaveLength(2); // creó y asignada
    expect(within(row).getByText(/Creó:/)).toBeInTheDocument();
    expect(row.querySelector("img[src='/agent-profiles/aira/photo?v=1']")).not.toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("H-053: sin perfil se muestra el id del agente, y una tarea creada por la persona no lleva «Creó»", async () => {
    resetAgentProfiles();
    vi.spyOn(profilesApi, "listAgentProfiles").mockResolvedValue([]);
    vi.spyOn(api, "listTasks").mockResolvedValue([task({ id: "b", title: "Mía", assignee_type: "agent", assignee_agent_id: "liza" })]);
    render(<Page />);
    const row = (await screen.findByText("Mía")).closest("li")!;
    expect(await within(row).findByText("liza")).toBeInTheDocument();
    expect(within(row).queryByText(/Creó:/)).toBeNull();
  });

  it("H-053: «Asignada a» es una lista desplegable con los gestores registrados, cada uno con su avatar y su nombre visible (o el id)", async () => {
    resetAgentProfiles();
    vi.spyOn(profilesApi, "listAgentProfiles").mockResolvedValue([{ agent_id: "aira", display_name: "Aira · Arquitecta", photo_url: "/agent-profiles/aira/photo?v=1" }]);
    vi.spyOn(agentAccess, "getVaultAgentAccess").mockResolvedValue({ mode: "enforce", agents: [
      { agent_id: "aira", estado: "activo", carpetas: ["*"], note_id: "x", keys: [] }, { agent_id: "liza", estado: "activo", carpetas: ["*"], note_id: "y", keys: [] },
      { agent_id: "suspendido", estado: "suspendido", carpetas: ["*"], note_id: "z", keys: [] },
    ], unregistered_keys: [], unregistered_agent_ids: [] });
    render(<Page />);
    await screen.findByText("Publicar el plan");
    await userEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
    const dialog = await screen.findByRole("dialog");
    const select = within(dialog).getByRole("combobox", { name: "Asignada a" });
    expect(select).toHaveTextContent("Yo");
    expect(select).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(select);
    expect(select).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("listbox", { name: "Asignada a" });
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(expect.arrayContaining(["Yo"]));
    expect(await within(list).findByRole("option", { name: /Aira · Arquitecta/ })).toBeInTheDocument();
    expect(within(list).getByRole("option", { name: /liza/ })).toBeInTheDocument();
    expect(within(list).queryByRole("option", { name: /suspendido/ })).toBeNull(); // solo gestores activos
    expect(list.querySelector("img[src='/agent-profiles/aira/photo?v=1']")).not.toBeNull();
    await userEvent.click(within(list).getByRole("option", { name: /Aira · Arquitecta/ }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(select).toHaveTextContent("Aira · Arquitecta");
  });

  it("H-053: la lista se maneja con teclado, y Escape la cierra sin cerrar la ventana de la tarea", async () => {
    resetAgentProfiles();
    vi.spyOn(profilesApi, "listAgentProfiles").mockResolvedValue([]);
    render(<Page />);
    await screen.findByText("Publicar el plan");
    await userEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
    const dialog = await screen.findByRole("dialog");
    const select = within(dialog).getByRole("combobox", { name: "Asignada a" });
    select.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(select).toHaveTextContent("aira");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("H-053: una tarea nueva crea con ella las subtareas preparadas en el formulario, dentro de la tarea", async () => {
    const create = vi.spyOn(api, "createTask").mockResolvedValue({ ...ROOT, id: "nueva" });
    render(<Page />);
    await screen.findByText("Publicar el plan");
    await userEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Título"), "Lanzamiento");
    const sub = within(dialog).getByLabelText("Nueva subtarea");
    await userEvent.type(sub, "Redactar{Enter}");
    await userEvent.type(sub, "Revisar");
    await userEvent.click(within(dialog).getByRole("button", { name: /Añadir subtarea/ }));
    expect(within(dialog).getAllByText("Se crea al guardar")).toHaveLength(2);
    expect(create).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(3));
    expect(create.mock.calls[0]).toEqual(["v", expect.objectContaining({ title: "Lanzamiento" }), undefined]);
    expect(create.mock.calls[1]).toEqual(["v", { title: "Redactar", description: null, assignee_type: "user", assignee_agent_id: null }, "nueva"]);
    expect(create.mock.calls[2]).toEqual(["v", { title: "Revisar", description: null, assignee_type: "user", assignee_agent_id: null }, "nueva"]);
  });

  it("H-053: al editar una tarea, añadir una subtarea la crea al momento y la lista de la tarea la muestra", async () => {
    const create = vi.spyOn(api, "createTask").mockResolvedValue(task({ id: "s", parent_id: "r", title: "Nueva sub" }));
    render(<Page />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar Publicar el plan" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar tarea" });
    expect(within(dialog).getByText("Escribir borrador")).toBeInTheDocument(); // ya existente
    await userEvent.type(within(dialog).getByLabelText("Nueva subtarea"), "Nueva sub{Enter}");
    expect(create).toHaveBeenCalledWith("v", { title: "Nueva sub", description: null, assignee_type: "user", assignee_agent_id: null }, "r");
    expect(dialog).toBeInTheDocument(); // Enter en la subtarea no guarda ni cierra la tarea
  });

  it("H-053: una subtarea no ofrece subtareas (dos niveles) y el botón visible «Subtarea» abre el formulario dentro de la tarea", async () => {
    render(<Page />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar Escribir borrador" }));
    const edit = await screen.findByRole("dialog", { name: "Editar subtarea" });
    expect(within(edit).queryByLabelText("Nueva subtarea")).toBeNull();
    await userEvent.click(within(edit).getByRole("button", { name: "Cancelar" }));
    const add = screen.getByRole("button", { name: "Añadir subtarea a Publicar el plan" });
    expect(add).toHaveTextContent("Subtarea");
    expect(screen.queryByRole("button", { name: "Añadir subtarea a Escribir borrador" })).toBeNull();
    await userEvent.click(add);
    const dialog = await screen.findByRole("dialog", { name: "Nueva subtarea" });
    expect(dialog).toHaveTextContent("Dentro de «Publicar el plan»");
    expect(within(dialog).queryByLabelText("Nueva subtarea")).toBeNull();
  });

  it("H-053: una subtarea lleva su título, su descripción y, si se quiere, su propio agente; sin agente toma el de la tarea", async () => {
    resetAgentProfiles();
    vi.spyOn(profilesApi, "listAgentProfiles").mockResolvedValue([]);
    const create = vi.spyOn(api, "createTask").mockResolvedValue({ ...ROOT, id: "nueva" });
    render(<Page />);
    await screen.findByText("Publicar el plan");
    await userEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Título"), "Informe");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Asignada a" })); // la tarea es de aira
    await userEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: /aira/ }));
    const agentSelect = within(dialog).getByRole("combobox", { name: "Agente de la subtarea" });
    expect(agentSelect).toHaveTextContent("Igual que la tarea"); // opcional: por defecto sin agente propio
    await userEvent.type(within(dialog).getByLabelText("Nueva subtarea"), "Datos{Enter}");
    await userEvent.type(within(dialog).getByLabelText("Nueva subtarea"), "Gráficas");
    await userEvent.type(within(dialog).getByLabelText("Descripción de la subtarea"), "Tres gráficas del mes");
    await userEvent.click(agentSelect);
    await userEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Yo" }));
    await userEvent.click(within(dialog).getByRole("button", { name: /Añadir subtarea/ }));
    expect(within(dialog).getByText("Tres gráficas del mes")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(3));
    expect(create.mock.calls[1]).toEqual(["v", { title: "Datos", description: null, assignee_type: "agent", assignee_agent_id: "aira" }, "nueva"]);
    expect(create.mock.calls[2]).toEqual(["v", { title: "Gráficas", description: "Tres gráficas del mes", assignee_type: "user", assignee_agent_id: null }, "nueva"]);
  });
});
