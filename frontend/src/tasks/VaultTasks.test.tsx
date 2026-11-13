import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import VaultTasks from "./VaultTasks";
import * as api from "./tasksApi";
import * as agentAccess from "../settings/agentAccess";
import * as profilesApi from "../agents/agentProfilesApi";
import { resetAgentProfiles } from "../agents/agentProfiles";
import { MeContext } from "../auth/RequireAuth";
import { WithSync, syncValue } from "../test-utils/sync";
import type { Task } from "./tasksApi";

function task(over: Partial<Task>): Task {
  return {
    id: "t", vault_id: "v", parent_id: null, sort_order: 0, title: "T", description: null, notes: null, status: "pending", priority: "medium",
    start_at: null, due_at: null, assignee_type: "user", assignee_agent_id: null, path: null, reminders: null, created_by: "user", updated_by: "user", version: 3,
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

  it("Kanban: arrastrar una tarjeta a otra columna cambia su estado; la raíz con subtareas no se arrastra", async () => {
    const update = vi.spyOn(api, "updateTask").mockResolvedValue(CHILD);
    render(<Page />);
    await screen.findByText("Publicar el plan");
    await userEvent.click(screen.getByRole("tab", { name: /Kanban/ }));
    const pending = screen.getByRole("region", { name: "Pendiente" });
    const card = within(pending).getByText("Escribir borrador").closest("article")!;
    expect(card).toHaveAttribute("draggable", "true");
    expect(within(pending).getByText("Publicar el plan").closest("article")).toHaveAttribute("draggable", "false");
    const data = { setData: vi.fn(), getData: () => "c", effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(card, { dataTransfer: data });
    const target = screen.getByRole("region", { name: "En progreso" });
    fireEvent.dragOver(target, { dataTransfer: data });
    expect(target).toHaveAttribute("data-over", "true");
    fireEvent.drop(target, { dataTransfer: data });
    expect(update).toHaveBeenCalledWith("v", CHILD, { status: "in_progress" });
    expect(within(screen.getByRole("region", { name: "En progreso" })).getByText("Escribir borrador")).toBeInTheDocument();
  });

  it("Línea de tiempo: una barra por tarea y subtarea con su estado; un clic abre el detalle y «sin vencimiento» va punteada", async () => {
    vi.spyOn(api, "listTasks").mockResolvedValue([
      task({ id: "r", title: "Raíz", due_at: "2026-11-20T15:00:00Z", created_at: "2026-11-12T00:00:00Z" }),
      task({ id: "c", parent_id: "r", title: "Hija", status: "done", due_at: "2026-11-18T15:00:00Z", created_at: "2026-11-12T00:00:00Z" }),
      task({ id: "s", title: "Sin fecha", status: "in_progress", created_at: "2026-11-13T00:00:00Z" }),
    ]);
    render(<Page />);
    await screen.findByText("Raíz");
    await userEvent.click(screen.getByRole("tab", { name: /Línea de tiempo/ }));
    const list = screen.getByRole("list", { name: "Línea de tiempo de tareas" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    const open = within(list).getByRole("button", { name: /^Sin fecha, En progreso, .*sin vencimiento$/ });
    expect(open).toHaveClass("tasks-gantt-item--open");
    expect(within(list).getByRole("button", { name: /^Raíz, Pendiente,/ })).toHaveClass("tasks-gantt-item--summary"); // su avance sale de la subtarea
    expect(within(list).getByText("1/1")).toBeInTheDocument();
    await userEvent.click(within(list).getByRole("button", { name: "Ver detalle de Hija" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  describe("línea de tiempo: arrastrar barras", () => {
    const MOVABLE = task({ id: "m", title: "Mover", start_at: "2026-11-16T15:00:00Z", due_at: "2026-11-18T15:00:00Z", created_at: "2026-11-12T00:00:00Z" });
    // Los eventos de ventana se envían con `fireEvent` para que React vuelva a dibujar dentro de `act`.
    const pointer = (type: string, clientX: number, target: Element | Window = window) => {
      fireEvent(target, new MouseEvent(type, { clientX, button: 0, bubbles: true }));
    };
    async function openGantt() {
      vi.spyOn(api, "listTasks").mockResolvedValue([MOVABLE]);
      render(<Page />);
      await screen.findByText("Mover");
      await userEvent.click(screen.getByRole("tab", { name: /Línea de tiempo/ }));
      return screen.getByRole("button", { name: /^Mover, Pendiente,/ });
    }

    it("arrastrar el cuerpo la mueve (2 días = 88 px en escala Día), la dibuja en el momento y guarda inicio y vencimiento", async () => {
      const update = vi.spyOn(api, "updateTask").mockResolvedValue(MOVABLE);
      const bar = await openGantt();
      const left0 = parseFloat(bar.style.left);
      pointer("pointerdown", 100, bar);
      pointer("pointermove", 188);
      expect(parseFloat(bar.style.left)).toBe(left0 + 88);
      expect(bar).toHaveClass("tasks-gantt-item--dragging");
      pointer("pointerup", 188);
      expect(update).toHaveBeenCalledWith("v", MOVABLE, { start_at: "2026-11-18T15:00:00.000Z", due_at: "2026-11-20T15:00:00.000Z" });
      fireEvent.click(bar); // el clic que sigue a soltar no abre el detalle
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("el borde derecho cambia solo el vencimiento y el izquierdo solo el inicio", async () => {
      const update = vi.spyOn(api, "updateTask").mockResolvedValue(MOVABLE);
      const bar = await openGantt();
      pointer("pointerdown", 0, bar.querySelector(".tasks-gantt-handle--end")!);
      pointer("pointermove", 44);
      pointer("pointerup", 44);
      expect(update).toHaveBeenLastCalledWith("v", MOVABLE, { due_at: "2026-11-19T15:00:00.000Z" });
      await waitFor(() => expect(vi.mocked(api.listTasks).mock.calls.length).toBeGreaterThanOrEqual(2)); // la relectura (un doble) deja la barra como estaba
      await waitFor(() => expect(bar.style.width).toBe("132px"));
      pointer("pointerdown", 0, bar.querySelector(".tasks-gantt-handle--start")!);
      pointer("pointermove", -44);
      pointer("pointerup", -44);
      expect(update).toHaveBeenLastCalledWith("v", MOVABLE, { start_at: "2026-11-15T15:00:00.000Z" });
    });

    it("un clic sin mover abre el detalle, un movimiento menor al umbral no guarda y cancelar el arrastre deja todo igual", async () => {
      const update = vi.spyOn(api, "updateTask").mockResolvedValue(MOVABLE);
      const bar = await openGantt();
      pointer("pointerdown", 100, bar);
      pointer("pointermove", 102);
      pointer("pointerup", 102);
      expect(update).not.toHaveBeenCalled();
      await userEvent.click(bar);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      const left0 = parseFloat(bar.style.left);
      pointer("pointerdown", 100, bar);
      pointer("pointermove", 232);
      pointer("pointercancel", 232);
      expect(update).not.toHaveBeenCalled();
      expect(parseFloat(bar.style.left)).toBe(left0);
    });

    it("con el teclado, Alt + flechas la mueve un día y Alt + Mayús + flecha cambia el vencimiento", async () => {
      const update = vi.spyOn(api, "updateTask").mockResolvedValue(MOVABLE);
      const bar = await openGantt();
      const left0 = parseFloat(bar.style.left);
      fireEvent.keyDown(bar, { key: "ArrowRight", altKey: true });
      expect(update).toHaveBeenLastCalledWith("v", MOVABLE, { start_at: "2026-11-17T15:00:00.000Z", due_at: "2026-11-19T15:00:00.000Z" });
      await waitFor(() => expect(vi.mocked(api.listTasks).mock.calls.length).toBeGreaterThanOrEqual(2)); // el servidor devuelve la tarea sin cambios (es un doble)
      await waitFor(() => expect(parseFloat(bar.style.left)).toBe(left0));
      fireEvent.keyDown(bar, { key: "ArrowLeft", altKey: true, shiftKey: true });
      expect(update).toHaveBeenLastCalledWith("v", MOVABLE, { due_at: "2026-11-17T15:00:00.000Z" });
      fireEvent.keyDown(bar, { key: "ArrowRight" }); // sin Alt no hace nada
      expect(update).toHaveBeenCalledTimes(2);
    });
  });

  it("Línea de tiempo: cambiar la escala ajusta el ancho del día", async () => {
    render(<Page />);
    await screen.findByText("Publicar el plan");
    await userEvent.click(screen.getByRole("tab", { name: /Línea de tiempo/ }));
    const gantt = document.querySelector(".tasks-gantt")!;
    expect(gantt).toHaveAttribute("data-scale", "day");
    await userEvent.click(screen.getByRole("button", { name: "Mes" }));
    expect(gantt).toHaveAttribute("data-scale", "month");
    expect((gantt as HTMLElement).style.getPropertyValue("--g-day")).toBe("8px");
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
    expect(screen.queryByText("Sin fecha", { selector: ".tasks-title-btn" })).not.toBeInTheDocument();
    expect(within(side).queryByRole("button", { name: /1 vencida/ })).toBeNull(); // ya filtrado: el atajo sobra
    await userEvent.click(within(group).getByRole("radio", { name: /Sin fecha/ }));
    expect(screen.getByText("Sin fecha", { selector: ".tasks-title-btn" })).toBeInTheDocument();
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

  it("H-053: sin perfil se muestra el id del agente, y una tarea creada por la persona dice «Creó: Yo»", async () => {
    resetAgentProfiles();
    vi.spyOn(profilesApi, "listAgentProfiles").mockResolvedValue([]);
    vi.spyOn(api, "listTasks").mockResolvedValue([task({ id: "b", title: "Mía", assignee_type: "agent", assignee_agent_id: "liza" })]);
    render(<Page />);
    const row = (await screen.findByText("Mía")).closest("li")!;
    expect(await within(row).findByText("liza")).toBeInTheDocument();
    expect(within(row).getByText(/Creó:/)).toHaveTextContent(/Creó:.*Yo$/);
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
    expect(within(list).getAllByRole("option").some((o) => /Yo$/.test(o.textContent ?? ""))).toBe(true);
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

  it("el panel de filtros se desplaza por sí mismo (alto y ancho) para que nada quede cortado", async () => {
    render(<Page />);
    await screen.findByText("Publicar el plan");
    const host = screen.getByTestId("side").querySelector(".tf-panel-host");
    expect(host).not.toBeNull();
    expect(host!.querySelector(".tf-panel")).not.toBeNull();
  });

  it("la barra de la ventana es fija y trae las pestañas de vista y un botón de icono para la tarea nueva", async () => {
    render(<Page />);
    await screen.findByText("Publicar el plan");
    const toolbar = document.querySelector(".tasks-toolbar")!;
    const body = document.querySelector(".tasks-body")!;
    expect(toolbar.contains(body)).toBe(false); // la barra no se desplaza con la lista
    expect(body.contains(toolbar)).toBe(false);
    expect(toolbar.nextElementSibling).toBe(body);
    const create = within(toolbar as HTMLElement).getByRole("button", { name: "Nueva tarea" });
    expect(create).toHaveTextContent(""); // solo icono; el nombre sale de aria-label y title
    expect(create).toHaveAttribute("title", "Nueva tarea");
    expect(create.querySelector("svg")).not.toBeNull();
    const tabs = within(toolbar as HTMLElement).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(["Lista", "Kanban", "Calendario", "Línea de tiempo"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(body).toHaveAttribute("role", "tabpanel");
    expect(body).toHaveAttribute("aria-labelledby", tabs[0].id);
    expect(tabs[0]).toHaveAttribute("aria-controls", body.id);
  });

  it("al cambiar de vista el cuerpo se vuelve a montar con la dirección de la pestaña elegida, para animar la entrada", async () => {
    render(<Page />);
    await screen.findByText("Publicar el plan");
    const workspace = document.querySelector(".tasks-workspace")!;
    expect(workspace).not.toHaveAttribute("data-moved"); // la carga inicial no se anima
    const first = document.querySelector(".tasks-body")!;
    expect(first).toHaveAttribute("data-direction", "next");
    await userEvent.click(screen.getByRole("tab", { name: /Calendario/ }));
    const second = document.querySelector(".tasks-body")!;
    expect(second).not.toBe(first); // nuevo montaje = nueva animación
    expect(second).toHaveAttribute("data-direction", "next"); // lista → calendario: hacia la derecha
    expect(workspace).toHaveAttribute("data-moved"); // desde el primer cambio, la pestaña elegida y su ícono se animan
    expect(workspace).toHaveAttribute("data-direction", "next");
    await userEvent.click(screen.getByRole("tab", { name: /Kanban/ }));
    expect(document.querySelector(".tasks-body")).toHaveAttribute("data-direction", "prev"); // calendario → kanban
    expect(screen.getByRole("tab", { name: /Kanban/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Calendario/ })).toHaveAttribute("aria-selected", "false");
    const sameBody = document.querySelector(".tasks-body")!;
    await userEvent.click(screen.getByRole("tab", { name: /Kanban/ })); // la misma pestaña no reanima
    expect(document.querySelector(".tasks-body")).toBe(sameBody);
  });

  describe("calendario: subvistas de año, mes, semana y día", () => {
    // «Hoy» fijo: viernes 13 de noviembre de 2026 (Ciudad de México). Solo se simula Date para no estorbar a userEvent.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-13T18:00:00Z"));
    });
    afterEach(() => vi.useRealTimers());

    const openCalendar = async () => {
      render(<Page />);
      await screen.findByText("Publicar el plan");
      await userEvent.click(screen.getByRole("tab", { name: /Calendario/ }));
      return screen.getByRole("group", { name: "Subvista del calendario" });
    };
    const mode = (group: HTMLElement, name: string) => within(group).getByRole("button", { name });

    it("ofrece año, mes, semana y día; empieza en el mes y el título sigue a la subvista", async () => {
      const group = await openCalendar();
      expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Año", "Mes", "Semana", "Día"]);
      expect(mode(group, "Mes")).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("heading", { name: "noviembre 2026" })).toBeInTheDocument();
      await userEvent.click(mode(group, "Semana"));
      expect(screen.getByRole("heading", { name: "9 – 15 nov 2026" })).toBeInTheDocument();
      expect(mode(group, "Semana")).toHaveAttribute("aria-pressed", "true");
      expect(mode(group, "Mes")).toHaveAttribute("aria-pressed", "false");
      await userEvent.click(mode(group, "Día"));
      expect(screen.getByRole("heading", { name: "viernes 13 de noviembre de 2026" })).toBeInTheDocument();
      await userEvent.click(mode(group, "Año"));
      expect(screen.getByRole("heading", { name: "2026" })).toBeInTheDocument();
    });

    it("semana: siete días, la hora de cada vencimiento y flechas de semana en semana", async () => {
      const group = await openCalendar();
      await userEvent.click(mode(group, "Semana"));
      expect(document.querySelectorAll(".tasks-week-day")).toHaveLength(7);
      expect(document.querySelector(".tasks-week-day--today")).toHaveAttribute("data-date", "2026-11-13");
      expect(screen.queryByText("Publicar el plan")).toBeNull(); // vence el 20
      await userEvent.click(screen.getByRole("button", { name: "Semana siguiente" }));
      expect(screen.getByRole("heading", { name: "16 – 22 nov 2026" })).toBeInTheDocument();
      const friday = document.querySelector("[data-date='2026-11-20']") as HTMLElement;
      expect(within(friday).getByRole("button", { name: /Publicar el plan/ })).toHaveTextContent("09:00"); // 15:00 UTC = 09:00 CDMX
      await userEvent.click(screen.getByRole("button", { name: "Semana anterior" }));
      expect(screen.getByRole("heading", { name: "9 – 15 nov 2026" })).toBeInTheDocument();
    });

    it("año: doce meses con sus días marcados; un día baja a su detalle y un mes a su cuadrícula; «Hoy» vuelve", async () => {
      const group = await openCalendar();
      await userEvent.click(mode(group, "Año"));
      expect(document.querySelectorAll(".tasks-mini")).toHaveLength(12);
      const marked = document.querySelector("button[data-date='2026-11-20']") as HTMLElement;
      expect(marked).toHaveAttribute("data-count", "1");
      expect(marked).toHaveAccessibleName("20 de noviembre: 1 tarea");
      expect(document.querySelector("button[data-date='2026-11-21']")).toHaveAttribute("data-count", "0");
      await userEvent.click(marked);
      expect(screen.getByRole("heading", { name: "viernes 20 de noviembre de 2026" })).toBeInTheDocument();
      expect(mode(group, "Día")).toHaveAttribute("aria-pressed", "true");
      const row = screen.getByText("Publicar el plan").closest("li")!;
      expect(row.parentElement!.parentElement).toHaveTextContent("09:00");
      await userEvent.click(mode(group, "Año"));
      await userEvent.click(screen.getByRole("button", { name: "Ver diciembre 2026" }));
      expect(screen.getByRole("heading", { name: "diciembre 2026" })).toBeInTheDocument();
      expect(screen.getByRole("grid")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Hoy" }));
      expect(screen.getByRole("heading", { name: "noviembre 2026" })).toBeInTheDocument();
    });

    it("día: sin tareas lo dice; con tareas muestra la fila completa y las flechas avanzan de un día", async () => {
      const group = await openCalendar();
      await userEvent.click(mode(group, "Día"));
      expect(screen.getByText("No hay tareas que venzan este día.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Día siguiente" }));
      expect(screen.getByRole("heading", { name: "sábado 14 de noviembre de 2026" })).toBeInTheDocument();
      await userEvent.click(mode(group, "Mes"));
      await userEvent.click(screen.getByRole("button", { name: "Ver el día 20 de noviembre" }));
      expect(screen.getByRole("button", { name: "Editar Publicar el plan" })).toBeInTheDocument();
    });
  });

  it("en móvil no hay Kanban: solo Lista, Calendario y Línea de tiempo", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("max-width: 640px"), media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      render(<Page />);
      await screen.findByText("Publicar el plan");
      expect(screen.getAllByRole("tab").map((t) => t.getAttribute("aria-label"))).toEqual(["Lista", "Calendario", "Línea de tiempo"]);
      expect(screen.queryByRole("tab", { name: /Kanban/ })).toBeNull();
      await userEvent.click(screen.getByRole("tab", { name: /Calendario/ }));
      expect(screen.getByRole("group", { name: "Subvista del calendario" })).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });

  describe("detalle de la tarea", () => {
    const DETAILED = task({
      id: "r", title: "Publicar el plan", description: "Texto del plan\ncon dos líneas", notes: "Avance: borrador listo", path: "Plan.md",
      due_at: "2026-11-20T15:00:00Z", priority: "high", assignee_type: "agent", assignee_agent_id: "aira", created_by: "agent:aira",
      updated_by: "user", completed_at: null,
    });

    it("pulsar el título abre el detalle completo (no la edición) con todos los datos de la tarea", async () => {
      resetAgentProfiles();
      vi.spyOn(profilesApi, "listAgentProfiles").mockResolvedValue([{ agent_id: "aira", display_name: "Aira · Arquitecta", photo_url: null }]);
      vi.spyOn(api, "listTasks").mockResolvedValue([DETAILED, CHILD]);
      render(<Page />);
      await userEvent.click(await screen.findByRole("button", { name: "Ver detalle de Publicar el plan" }));
      const dialog = await screen.findByRole("dialog", { name: "Publicar el plan" });
      expect(screen.queryByRole("dialog", { name: /Editar/ })).toBeNull();
      expect(within(dialog).getByText("Texto del plan", { exact: false })).toBeInTheDocument();
      expect(within(dialog).getByText("Avance: borrador listo")).toBeInTheDocument();
      expect(within(dialog).getByText("Alta")).toBeInTheDocument();
      expect(await within(dialog).findAllByText("Aira · Arquitecta")).toHaveLength(3); // asignada a, creada por y la subtarea de aira
      expect(within(dialog).getByRole("button", { name: /Plan\.md/ })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Abrir Escribir borrador" })).toBeInTheDocument();
      expect(within(within(dialog).getByRole("region", { name: "Fechas" })).getByText(/^Creada /)).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /Editar/ })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /Eliminar/ })).toBeInTheDocument();
    });

    it("los campos vacíos lo dicen en lugar de quedarse en blanco", async () => {
      vi.spyOn(api, "listTasks").mockResolvedValue([task({ id: "x", title: "Mínima" })]);
      render(<Page />);
      await userEvent.click(await screen.findByRole("button", { name: "Ver detalle de Mínima" }));
      const dialog = await screen.findByRole("dialog", { name: "Mínima" });
      expect(within(dialog).getAllByText("Sin fecha")).toHaveLength(2); // inicio y vencimiento
      for (const text of ["Sin ruta.", "Sin descripción.", "Sin notas de avance.", "Todavía no tiene subtareas."]) {
        expect(within(dialog).getByText(text)).toBeInTheDocument();
      }
    });

    it("el estado se cambia desde el detalle y se refleja en el momento; una raíz con subtareas lo tiene bloqueado", async () => {
      const update = vi.spyOn(api, "updateTask").mockResolvedValue(task({ id: "x" }));
      vi.spyOn(api, "listTasks").mockResolvedValue([task({ id: "x", title: "Simple" }), ROOT, CHILD]);
      render(<Page />);
      await userEvent.click(await screen.findByRole("button", { name: "Ver detalle de Simple" }));
      let dialog = await screen.findByRole("dialog", { name: "Simple" });
      expect(within(dialog).getByRole("radio", { name: "Pendiente" })).toBeChecked();
      await userEvent.click(within(dialog).getByRole("radio", { name: "Hecha" }));
      expect(update).toHaveBeenCalledWith("v", expect.objectContaining({ id: "x" }), { status: "done" });
      await userEvent.click(within(dialog).getAllByRole("button", { name: "Cerrar" }).at(-1)!); // el del pie
      await userEvent.click(screen.getByRole("button", { name: "Ver detalle de Publicar el plan" }));
      dialog = await screen.findByRole("dialog", { name: "Publicar el plan" });
      for (const radio of within(dialog).getAllByRole("radio")) expect(radio).toBeDisabled();
      expect(within(dialog).getByText(/sale de sus subtareas/)).toBeInTheDocument();
    });

    it("desde el detalle se edita, se añade una subtarea y se elimina; cada acción abre lo suyo", async () => {
      render(<Page />);
      await userEvent.click(await screen.findByRole("button", { name: "Ver detalle de Publicar el plan" }));
      await userEvent.click(within(await screen.findByRole("dialog", { name: "Publicar el plan" })).getByRole("button", { name: /Editar/ }));
      expect(await screen.findByRole("dialog", { name: "Editar tarea" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "Publicar el plan" })).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      await userEvent.click(screen.getByRole("button", { name: "Ver detalle de Publicar el plan" }));
      await userEvent.click(within(await screen.findByRole("dialog", { name: "Publicar el plan" })).getByRole("button", { name: /Añadir subtarea/ }));
      expect(await screen.findByRole("dialog", { name: "Nueva subtarea" })).toHaveTextContent("Dentro de «Publicar el plan»");
      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      await userEvent.click(screen.getByRole("button", { name: "Ver detalle de Publicar el plan" }));
      await userEvent.click(within(await screen.findByRole("dialog", { name: "Publicar el plan" })).getByRole("button", { name: /Eliminar/ }));
      expect(await screen.findByRole("alertdialog")).toHaveTextContent("Se elimina la tarea y todas sus subtareas");
    });

    it("una subtarea enlaza a su tarea y la tarea a sus subtareas; Escape y Cerrar cierran el detalle", async () => {
      render(<Page />);
      await userEvent.click(await screen.findByRole("button", { name: "Ver detalle de Escribir borrador" }));
      const sub = await screen.findByRole("dialog", { name: "Escribir borrador" });
      expect(within(sub).queryByText("Todavía no tiene subtareas.")).toBeNull(); // una subtarea no tiene subtareas
      expect(within(sub).queryByRole("button", { name: /Añadir subtarea/ })).toBeNull();
      await userEvent.click(within(sub).getByRole("button", { name: /Subtarea de «Publicar el plan»/ }));
      const parent = await screen.findByRole("dialog", { name: "Publicar el plan" });
      await userEvent.click(within(parent).getByRole("button", { name: "Abrir Escribir borrador" }));
      expect(await screen.findByRole("dialog", { name: "Escribir borrador" })).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("el calendario también abre el detalle al pulsar una tarea, y la ruta existente abre el documento", async () => {
      const onOpenNote = vi.fn();
      render(<Page onOpenNote={onOpenNote} />);
      await screen.findByText("Publicar el plan");
      await userEvent.click(screen.getByRole("tab", { name: /Calendario/ }));
      await userEvent.click(screen.getAllByRole("button", { name: /Publicar el plan/ })[0]);
      const dialog = await screen.findByRole("dialog", { name: "Publicar el plan" });
      await userEvent.click(within(dialog).getByRole("button", { name: /Plan\.md/ }));
      expect(onOpenNote).toHaveBeenCalledWith("n1");
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  describe("recordatorios de vencimiento", () => {
    const openNew = async () => {
      render(<Page />);
      await screen.findByText("Publicar el plan");
      await userEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
      return screen.findByRole("dialog", { name: "Nueva tarea" });
    };
    const group = (dialog: HTMLElement) => within(dialog).getByRole("group", { name: /Notificaciones/ });

    it("el inicio se guarda junto al vencimiento y uno posterior al vencimiento bloquea «Guardar»", async () => {
      const create = vi.spyOn(api, "createTask").mockResolvedValue(ROOT);
      const dialog = await openNew();
      await userEvent.type(within(dialog).getByLabelText("Título"), "Con inicio");
      fireEvent.change(within(dialog).getByLabelText(/Inicia/), { target: { value: "2026-11-25T09:00" } });
      fireEvent.change(within(dialog).getByLabelText(/Vence/), { target: { value: "2026-11-20T09:00" } });
      expect(within(dialog).getByRole("alert")).toHaveTextContent("El inicio no puede ser posterior al vencimiento");
      expect(within(dialog).getByRole("button", { name: "Guardar" })).toBeDisabled();
      fireEvent.change(within(dialog).getByLabelText(/Inicia/), { target: { value: "2026-11-18T09:00" } });
      expect(within(dialog).queryByRole("alert")).toBeNull();
      await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
      expect(create).toHaveBeenCalledWith("v", expect.objectContaining({ start_at: "2026-11-18T15:00:00.000Z", due_at: "2026-11-20T15:00:00.000Z" }), undefined);
    });

    it("sin fecha de vencimiento no hay recordatorios que añadir, y lo explica", async () => {
      const dialog = await openNew();
      expect(within(group(dialog)).getByText(/Elige una fecha de vencimiento/)).toBeInTheDocument();
      expect(within(group(dialog)).queryByRole("button", { name: /Añadir notificación/ })).toBeNull();
    });

    it("con fecha ofrece los de siempre (1 día y 1 hora), se pueden añadir, cambiar de unidad y quitar, hasta cinco", async () => {
      const create = vi.spyOn(api, "createTask").mockResolvedValue(ROOT);
      const dialog = await openNew();
      await userEvent.type(within(dialog).getByLabelText("Título"), "Entrega");
      fireEvent.change(within(dialog).getByLabelText(/Vence/), { target: { value: "2026-11-20T09:00" } });
      const g = group(dialog);
      expect(within(g).getByLabelText("Recordatorio 1: cantidad")).toHaveValue(1);
      expect(within(g).getByLabelText("Recordatorio 1: unidad")).toHaveValue("days");
      expect(within(g).getByLabelText("Recordatorio 2: unidad")).toHaveValue("hours");
      await userEvent.click(within(g).getByRole("button", { name: /Añadir notificación/ }));
      expect(within(g).getByLabelText("Recordatorio 3: cantidad")).toHaveValue(30); // empieza en 30 minutos
      expect(within(g).getByLabelText("Recordatorio 3: unidad")).toHaveValue("minutes");
      await userEvent.selectOptions(within(g).getByLabelText("Recordatorio 3: unidad"), "weeks");
      fireEvent.change(within(g).getByLabelText("Recordatorio 3: cantidad"), { target: { value: "2" } });
      await userEvent.click(within(g).getByRole("button", { name: "Quitar 1 hora antes" }));
      expect(within(g).queryByLabelText("Recordatorio 3: cantidad")).toBeNull();
      await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
      expect(create).toHaveBeenCalledWith("v", expect.objectContaining({ title: "Entrega", reminders: [1440, 20160] }), undefined);
    });

    it("el máximo es cinco y se puede dejar sin ninguno", async () => {
      const create = vi.spyOn(api, "createTask").mockResolvedValue(ROOT);
      const dialog = await openNew();
      await userEvent.type(within(dialog).getByLabelText("Título"), "Sin avisos");
      fireEvent.change(within(dialog).getByLabelText(/Vence/), { target: { value: "2026-11-20T09:00" } });
      const g = group(dialog);
      for (let i = 0; i < 3; i++) await userEvent.click(within(g).getByRole("button", { name: /Añadir notificación/ }));
      expect(within(g).getByRole("button", { name: /Añadir notificación/ })).toBeDisabled();
      expect(within(g).getByText(/Máximo 5 recordatorios/)).toBeInTheDocument();
      for (let i = 0; i < 5; i++) await userEvent.click(within(g).getAllByRole("button", { name: /^Quitar/ })[0]);
      expect(within(g).getByText(/Sin recordatorios: solo se avisa cuando la tarea vence/)).toBeInTheDocument();
      await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
      expect(create).toHaveBeenCalledWith("v", expect.objectContaining({ reminders: [] }), undefined);
    });

    it("sin vencimiento se envía `null` y una tarea de un agente avisa de que no generará avisos", async () => {
      resetAgentProfiles();
      vi.spyOn(profilesApi, "listAgentProfiles").mockResolvedValue([]);
      const create = vi.spyOn(api, "createTask").mockResolvedValue(ROOT);
      const dialog = await openNew();
      await userEvent.type(within(dialog).getByLabelText("Título"), "Sin fecha");
      await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
      expect(create).toHaveBeenCalledWith("v", expect.objectContaining({ reminders: null }), undefined);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await userEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
      const again = await screen.findByRole("dialog", { name: "Nueva tarea" });
      fireEvent.change(within(again).getByLabelText(/Vence/), { target: { value: "2026-11-20T09:00" } });
      await userEvent.click(within(again).getByRole("combobox", { name: "Asignada a" }));
      await userEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: /aira/ }));
      expect(within(group(again)).getByText(/esta tarea no es tuya/)).toBeInTheDocument();
    });

    it("al editar una tarea con lista propia la muestra, y el detalle la enseña con su texto", async () => {
      vi.spyOn(api, "listTasks").mockResolvedValue([task({ id: "x", title: "Con lista", due_at: "2026-11-20T15:00:00Z", reminders: [10080, 30] })]);
      render(<Page />);
      await userEvent.click(await screen.findByRole("button", { name: "Ver detalle de Con lista" }));
      const detail = await screen.findByRole("dialog", { name: "Con lista" });
      expect(within(detail).getByText("1 semana antes")).toBeInTheDocument();
      expect(within(detail).getByText("30 minutos antes")).toBeInTheDocument();
      await userEvent.click(within(detail).getByRole("button", { name: /Editar/ }));
      const form = await screen.findByRole("dialog", { name: "Editar tarea" });
      expect(within(form).getByLabelText("Recordatorio 1: cantidad")).toHaveValue(1);
      expect(within(form).getByLabelText("Recordatorio 1: unidad")).toHaveValue("weeks");
      expect(within(form).getByLabelText("Recordatorio 2: cantidad")).toHaveValue(30);
      expect(form).toHaveTextContent(/Creada por.*ti/);
    });

    it("una tarea sin lista propia muestra los de siempre en el detalle; sin fecha no hay sección", async () => {
      vi.spyOn(api, "listTasks").mockResolvedValue([task({ id: "a", title: "Clásica", due_at: "2026-11-20T15:00:00Z" }), task({ id: "b", title: "Sin fecha" })]);
      render(<Page />);
      await userEvent.click(await screen.findByRole("button", { name: "Ver detalle de Clásica" }));
      const detail = await screen.findByRole("dialog", { name: "Clásica" });
      expect(within(detail).getByText("1 día antes")).toBeInTheDocument();
      expect(within(detail).getByText("1 hora antes")).toBeInTheDocument();
      await userEvent.click(within(detail).getAllByRole("button", { name: "Cerrar" }).at(-1)!);
      await userEvent.click(screen.getByRole("button", { name: "Ver detalle de Sin fecha" }));
      expect(within(await screen.findByRole("dialog", { name: "Sin fecha" })).queryByText("Notificaciones")).toBeNull();
    });
  });

  it("donde dice «Yo» sale tu foto de perfil (asignada a, creada por, la lista desplegable y el detalle)", async () => {
    const me = { user_id: "1", email: "c@x.com", role: "admin" as const, must_change_password: false, display_name: "Carlos", photo_url: "/auth/me/photo?v=2" };
    vi.spyOn(api, "listTasks").mockResolvedValue([task({ id: "m", title: "Mía" })]);
    render(<MeContext.Provider value={me}><Page /></MeContext.Provider>);
    const row = (await screen.findByText("Mía")).closest("li")!;
    expect(row.querySelectorAll("img[src='/auth/me/photo?v=2']").length).toBe(2); // asignada a y creó
    await userEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
    const dialog = await screen.findByRole("dialog", { name: "Nueva tarea" });
    expect(within(dialog).getByRole("combobox", { name: "Asignada a" }).querySelector("img[src='/auth/me/photo?v=2']")).not.toBeNull();
  });

  it("sin foto de perfil, «Yo» sale con tus iniciales", async () => {
    const me = { user_id: "1", email: "c@x.com", role: "admin" as const, must_change_password: false, display_name: "Carlos Jiménez", photo_url: null };
    vi.spyOn(api, "listTasks").mockResolvedValue([task({ id: "m", title: "Mía" })]);
    render(<MeContext.Provider value={me}><Page /></MeContext.Provider>);
    const row = (await screen.findByText("Mía")).closest("li")!;
    expect(row.querySelector("img")).toBeNull();
    expect(row.querySelector(".user-badge .settings-avatar-placeholder")).toHaveTextContent("CJ");
  });
});
