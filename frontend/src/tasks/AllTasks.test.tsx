// H-056: ventana global de tareas — todas las bóvedas juntas, cada tarea con su bóveda.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z", completed_at: null, purge_at: null, blocked_by: [], blocked: false, project_id: null, ...over,
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

// H-056: la barra de filtros es la misma barra lateral colapsable de la bóveda (`WorkspaceShell`): fija y visible en
// escritorio y tableta, flotante y oculta por defecto en móvil, con su botón en la franja superior.
describe("AllTasks: barra lateral como la de la bóveda", () => {
  const original = window.matchMedia;
  function viewport(mobile: boolean) {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("640") ? mobile : false,
      media: query, onchange: null, addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  beforeEach(() => {
    vi.restoreAllMocks();
    resetAgentProfiles();
    vi.spyOn(profilesApi, "listAgentProfiles").mockResolvedValue([]);
  });
  afterEach(() => { window.matchMedia = original; vi.restoreAllMocks(); });

  const side = () => document.querySelector(".vault-workspace-side") as HTMLElement;

  it("en escritorio está abierta y fija, y el botón de la franja superior la oculta y la muestra", async () => {
    viewport(false);
    await renderPage();
    expect(side()).toHaveAttribute("data-open");
    expect(side()).not.toHaveAttribute("data-floating");
    expect(screen.getByRole("heading", { level: 1, name: "Tareas de todas las bóvedas" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ocultar los filtros" }));
    expect(side()).not.toHaveAttribute("data-open");
    await userEvent.click(screen.getByRole("button", { name: "Mostrar los filtros" }));
    expect(side()).toHaveAttribute("data-open");
  });

  it("en móvil flota sobre el contenido, empieza oculta y se cierra con Escape o con la X de los filtros", async () => {
    viewport(true);
    await renderPage();
    expect(side()).toHaveAttribute("data-floating");
    expect(side()).not.toHaveAttribute("data-open");
    await userEvent.click(screen.getByRole("button", { name: "Mostrar los filtros" }));
    expect(side()).toHaveAttribute("data-open");
    act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(side()).not.toHaveAttribute("data-open");
    await userEvent.click(screen.getByRole("button", { name: "Mostrar los filtros" }));
    await userEvent.click(within(side()).getByRole("button", { name: "Cerrar filtros" }));
    expect(side()).not.toHaveAttribute("data-open");
  });

  it("usa el mismo marco que la bóveda: franja superior, barra y zona principal", async () => {
    viewport(false);
    await renderPage();
    expect(document.querySelector(".vault-workspace-shell > .vault-workspace-titlebar")).not.toBeNull();
    expect(document.querySelector(".vault-workspace-shell > .vault-workspace > .vault-workspace-side")).not.toBeNull();
    expect(document.querySelector(".vault-workspace > .vault-workspace-main .tasks-workspace")).not.toBeNull();
  });
});
