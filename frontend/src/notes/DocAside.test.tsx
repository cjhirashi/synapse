import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import * as tasksApi from "../tasks/tasksApi";
import type { Task } from "../tasks/tasksApi";
import DocAside from "./DocAside";

function task(over: Partial<Task>): Task {
  return {
    id: "t", vault_id: "v", parent_id: null, sort_order: 0, title: "T", description: null, notes: null, status: "pending", priority: "medium",
    start_at: null, due_at: null, assignee_type: "user", assignee_agent_id: null, path: null, reminders: null, created_by: "user", updated_by: "user", version: 1,
    created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z", completed_at: null, purge_at: null, ...over,
  };
}

const TASKS = [
  task({ id: "a", title: "Revisar el plan", path: "Proyectos/Plan.md", due_at: "2020-01-01T00:00:00Z" }),
  task({ id: "b", title: "Ya hecha", path: "/proyectos/plan.md/", status: "done" }),
  task({ id: "c", title: "De otro documento", path: "Otro.md" }),
  task({ id: "d", title: "Sin ruta" }),
  task({ id: "e", parent_id: "a", title: "Subtarea ligada", path: "Proyectos/Plan.md", status: "in_progress" }),
];

function Harness(props: { onOpenTask?: (t: Task) => void; onNavigated?: () => void; floating?: boolean; html?: string; open?: boolean }) {
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  return (
    <>
      <div ref={setContent} dangerouslySetInnerHTML={{ __html: props.html ?? '<div class="milkdown-view"><h1>Uno</h1><h2>Dos</h2><h2>Tres</h2></div>' }} />
      <DocAside id="aside" open={props.open ?? true} floating={props.floating ?? false} accent="red" content={content} vaultId="v" noteId="n1" notePath="Proyectos/Plan.md"
        onOpenTask={props.onOpenTask ?? vi.fn()} onNavigated={props.onNavigated ?? vi.fn()} />
    </>
  );
}

beforeEach(() => { vi.spyOn(tasksApi, "listTasks").mockResolvedValue(TASKS); });
afterEach(() => vi.restoreAllMocks());

test("el índice lista los encabezados del documento y un clic salta al elegido (cerrando la barra si flota)", async () => {
  const scrolled = vi.fn();
  const onNavigated = vi.fn();
  render(<Harness floating onNavigated={onNavigated} />);
  const headings = document.querySelectorAll<HTMLElement>(".milkdown-view h2");
  headings[1].scrollIntoView = scrolled;
  const nav = await screen.findByRole("navigation", { name: "Índice de encabezados" });
  expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["Uno", "Dos", "Tres"]);
  await userEvent.click(within(nav).getByRole("button", { name: "Tres" }));
  expect(scrolled).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
  expect(within(nav).getByRole("button", { name: "Tres" })).toHaveAttribute("aria-current", "location");
  expect(onNavigated).toHaveBeenCalledTimes(1);
});

test("fija (no flotante) no se cierra al saltar, y el índice se actualiza cuando cambia el documento", async () => {
  const onNavigated = vi.fn();
  render(<Harness onNavigated={onNavigated} />);
  const nav = await screen.findByRole("navigation", { name: "Índice de encabezados" });
  await userEvent.click(within(nav).getByRole("button", { name: "Dos" }));
  expect(onNavigated).not.toHaveBeenCalled();
  const h = document.createElement("h2");
  h.textContent = "Nuevo apartado";
  document.querySelector(".milkdown-view")!.appendChild(h);
  expect(await screen.findByRole("button", { name: "Nuevo apartado" })).toBeInTheDocument();
});

test("sin encabezados lo dice; con la vista de código explica dónde se ve el índice", async () => {
  const { unmount } = render(<Harness html="<div class='milkdown-view'><p>solo texto</p></div>" />);
  expect(await screen.findByText("Este documento no tiene encabezados.")).toBeInTheDocument();
  unmount();
  render(<Harness html="<div class='cm-editor'></div>" />);
  expect(await screen.findByText(/en la vista Visual/)).toBeInTheDocument();
});

test("la pestaña Tareas muestra solo las ligadas a este documento (abiertas primero, con su contador) y un clic solo expande la tarjeta", async () => {
  const onOpenTask = vi.fn();
  render(<Harness onOpenTask={onOpenTask} />);
  const tab = await screen.findByRole("tab", { name: /Tareas/ });
  await waitFor(() => expect(within(tab).getByLabelText("2 abiertas")).toBeInTheDocument()); // la hecha no cuenta
  await userEvent.click(tab);
  const panel = screen.getByRole("tabpanel");
  const heads = await within(panel).findAllByRole("button", { expanded: false });
  expect(heads.map((b) => b.querySelector(".docaside-task-title")?.textContent)).toEqual(["Revisar el plan", "Subtarea ligada", "Ya hecha"]);
  expect(within(panel).queryByText("De otro documento")).toBeNull();
  expect(within(panel).queryByText("Sin ruta")).toBeNull();
  expect(within(panel).getByText("↳ Revisar el plan")).toBeInTheDocument(); // la subtarea dice de cuál cuelga
  expect(heads[0].querySelector(".docaside-due")).toHaveClass("is-late");
  await userEvent.click(heads[1]);
  expect(onOpenTask).not.toHaveBeenCalled(); // no abre el gestor
  expect(heads[1]).toHaveAttribute("aria-expanded", "true");
});

test("expandida muestra el detalle (descripción, notas, fechas, responsable y subtareas); el botón la abre en Tareas y otro clic la contrae", async () => {
  const onOpenTask = vi.fn();
  vi.spyOn(tasksApi, "listTasks").mockResolvedValue([
    task({ id: "a", title: "Revisar el plan", path: "Proyectos/Plan.md", description: "Leer todo el plan.", notes: "Falta el anexo.", priority: "high", start_at: "2026-11-10T15:00:00Z", due_at: "2026-11-20T15:00:00Z" }),
    task({ id: "s1", parent_id: "a", title: "Anexo A", status: "done" }),
    task({ id: "s2", parent_id: "a", title: "Anexo B" }),
  ]);
  render(<Harness onOpenTask={onOpenTask} />);
  await userEvent.click(await screen.findByRole("tab", { name: /Tareas/ }));
  const head = await screen.findByRole("button", { name: /Revisar el plan/, expanded: false });
  await userEvent.click(head);
  const detail = await screen.findByRole("region", { name: "Detalle de Revisar el plan" });
  expect(within(detail).getByText("Leer todo el plan.")).toBeInTheDocument();
  expect(within(detail).getByText("Falta el anexo.")).toBeInTheDocument();
  expect(within(detail).getByText("Alta")).toBeInTheDocument();
  expect(within(detail).getByText("Subtareas")).toHaveTextContent("1/2");
  expect(within(detail).getByText("Anexo A")).toBeInTheDocument();
  expect(within(detail).getByLabelText("Estado de Revisar el plan")).toBeDisabled(); // su estado sale de las subtareas
  await userEvent.click(within(detail).getByRole("button", { name: /Abrir en Tareas/ }));
  expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  await userEvent.click(head);
  expect(screen.queryByRole("region", { name: "Detalle de Revisar el plan" })).toBeNull();
});

test("el estado se cambia desde la tarjeta: se ve al instante, manda PATCH y relee; si falla, avisa", async () => {
  const mine = task({ id: "a", title: "Sola", path: "Proyectos/Plan.md" });
  const list = vi.spyOn(tasksApi, "listTasks").mockResolvedValue([mine]);
  const update = vi.spyOn(tasksApi, "updateTask").mockResolvedValue({ ...mine, status: "in_progress" });
  render(<Harness />);
  await userEvent.click(await screen.findByRole("tab", { name: /Tareas/ }));
  await userEvent.click(await screen.findByRole("button", { name: /Sola/, expanded: false }));
  list.mockResolvedValue([{ ...mine, status: "in_progress" }]);
  await userEvent.selectOptions(screen.getByLabelText("Estado de Sola"), "in_progress");
  expect(update).toHaveBeenCalledWith("v", mine, { status: "in_progress" });
  await waitFor(() => expect(screen.getByLabelText("Estado de Sola")).toHaveValue("in_progress"));
  update.mockRejectedValue(new Error("412"));
  list.mockResolvedValue([{ ...mine, status: "in_progress" }]);
  await userEvent.selectOptions(screen.getByLabelText("Estado de Sola"), "done");
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cambiar el estado");
  await waitFor(() => expect(screen.getByLabelText("Estado de Sola")).toHaveValue("in_progress")); // vuelve a lo que dice el servidor
});

test("sin tareas ligadas explica cómo ligar una; si falla la lectura lo avisa", async () => {
  vi.spyOn(tasksApi, "listTasks").mockResolvedValue([TASKS[2]]);
  const { unmount } = render(<Harness />);
  await userEvent.click(await screen.findByRole("tab", { name: /Tareas/ }));
  expect(await screen.findByText(/Ninguna tarea apunta a este documento/)).toHaveTextContent("Proyectos/Plan.md");
  unmount();
  vi.spyOn(tasksApi, "listTasks").mockRejectedValue(new Error("x"));
  render(<Harness />);
  await userEvent.click(await screen.findByRole("tab", { name: /Tareas/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron leer las tareas");
});

test("cerrada no lee tareas ni encabezados", () => {
  render(<Harness open={false} />);
  expect(tasksApi.listTasks).not.toHaveBeenCalled();
  expect(document.querySelector(".vault-workspace-aside")).not.toHaveAttribute("data-open");
});

test("las pestañas se manejan con las flechas del teclado", async () => {
  render(<Harness />);
  const index = await screen.findByRole("tab", { name: /Índice/ });
  index.focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: /Tareas/ })).toHaveAttribute("aria-selected", "true");
  await userEvent.keyboard("{ArrowLeft}");
  expect(screen.getByRole("tab", { name: /Índice/ })).toHaveAttribute("aria-selected", "true");
});
