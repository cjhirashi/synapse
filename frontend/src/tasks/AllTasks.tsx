/**
 * Ventana global de tareas (H-056): las tareas de todas las bóvedas en un mismo lugar, cada una con su bóveda.
 * Es solo una vista: las tareas de bóvedas distintas no se relacionan. Aquí se ve, se filtra y se cambia el estado o las
 * fechas; crear, editar o borrar se hace en la bóveda de cada tarea (`En la bóveda`).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CalendarDays, GanttChartSquare, KanbanSquare, List, ListChecks } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCollapsibleSidebar } from "../layout/useCollapsibleSidebar";
import { useMediaQuery } from "../layout/useMediaQuery";
import WorkspaceShell from "../layout/WorkspaceShell";
import { useSync } from "../sync/useSync";
import { ApiError } from "../api/problems";
import type { Vault } from "../sync/vaultStore";
import TaskFilters from "./TaskFilters";
import TaskDetail from "./TaskDetail";
import { TaskCalendar } from "./TaskCalendar";
import TaskGantt from "./TaskGantt";
import { TaskKanban, TaskList, type ViewActions } from "./TaskViews";
import { NO_FILTER, buildPathIndex, buildTree, dateKey, filterTree, type TaskFilter } from "./taskModel";
import { listAllTasks, updateTask, type Task, type TaskStatus } from "./tasksApi";
import { listAllProjects, type Project } from "./projectsApi";
import "./tasks.css";

type View = "list" | "kanban" | "calendar" | "gantt";
const VIEWS = [["list", "Lista", List], ["kanban", "Kanban", KanbanSquare], ["calendar", "Calendario", CalendarDays], ["gantt", "Línea de tiempo", GanttChartSquare]] as const;
const REFRESH_MS = 60_000;
const NO_PATHS = buildPathIndex([]);

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 412) return "La tarea cambió en otro lugar; se recargó con su versión actual.";
    if (error.status === 403) return "Este agente no puede hacer ese cambio.";
    if (error.status === 404) return "La tarea ya no existe.";
    if (error.status === 422) return error.errors[0]?.detail?.includes("blocked") ? "La tarea está bloqueada: sus tareas bloqueadoras deben estar hechas primero." : "El estado de una tarea con subtareas sale de ellas.";
  }
  return "No se pudo completar el cambio.";
}

export default function AllTasks() {
  const { vaults, dataVersion } = useSync();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [vaultList, setVaultList] = useState<Vault[]>([]);
  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<TaskFilter>({ ...NO_FILTER, vault: "all" });
  const sidebar = useCollapsibleSidebar();
  const [detailId, setDetailId] = useState<string | null>(null);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const [list, projectList] = await Promise.all([listAllTasks(), listAllProjects().catch(() => [] as Project[])]);
      if (!alive.current) return;
      setTasks(list);
      setProjects(projectList);
      setFailed(false);
    } catch {
      if (alive.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void reload();
    const timer = window.setInterval(() => { if (!document.hidden) void reload(); }, REFRESH_MS);
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => { alive.current = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    void vaults.list().then((list) => { if (!cancelled) setVaultList(list); });
    return () => { cancelled = true; };
  }, [vaults, dataVersion]);

  const names = useMemo(() => new Map(vaultList.map((vault) => [vault.id, vault.name])), [vaultList]);
  const vaultName = useCallback((task: Task) => names.get(task.vault_id) ?? "Bóveda eliminada", [names]);

  async function run(action: () => Promise<unknown>) {
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setNotice(errorText(error));
    }
    await reload();
  }

  const openInVault = useCallback(
    (task: Task) => navigate(`/vaults/${encodeURIComponent(task.vault_id)}?tab=tareas&task=${encodeURIComponent(task.id)}`),
    [navigate],
  );

  const actions: ViewActions = {
    pathIndex: NO_PATHS,
    focusId: null,
    global: { vaultName, onOpenInVault: openInVault },
    titleOf: (id) => tasks?.find((t) => t.id === id)?.title,
    projectOf: (task) => projects.find((p) => p.id === task.project_id),
    onDates: (task, span) => {
      setTasks((list) => (list ? list.map((t) => (t.id === task.id ? { ...t, ...span } : t)) : list));
      void run(() => updateTask(task.vault_id, task, span));
    },
    onStatus: (task, status: TaskStatus) => {
      setTasks((list) => (list ? list.map((t) => (t.id === task.id ? { ...t, status } : t)) : list));
      void run(() => updateTask(task.vault_id, task, { status }));
    },
    onOpen: (task) => setDetailId(task.id),
    onEdit: openInVault,
    onAddSubtask: openInVault,
    onDelete: openInVault,
    onOpenPath: () => undefined,
  };

  const isMobile = useMediaQuery("(max-width: 640px)");
  const views = isMobile ? VIEWS.filter(([id]) => id !== "kanban") : VIEWS;
  const shownView: View = isMobile && view === "kanban" ? "list" : view;

  const list = tasks ?? [];
  const detail = detailId ? list.find((t) => t.id === detailId) : undefined;
  const tree = useMemo(() => filterTree(buildTree(list), filter), [list, filter]);
  const visible = useMemo(() => tree.flatMap((n) => [n.task, ...n.children]), [tree]);
  const shownCount = tree.reduce((total, node) => total + 1 + node.children.length, 0);
  const agentIds = Array.from(new Set(list.flatMap((t) => (t.assignee_agent_id ? [t.assignee_agent_id] : [])))).sort();
  const todayKey = dateKey(new Date().toISOString());
  const projectOptions = useMemo(
    () => projects.map((project) => ({ id: project.id, title: `${names.get(project.vault_id) ?? "Bóveda"} · ${project.title}` })),
    [projects, names],
  );
  const filterVaults = useMemo(
    () => vaultList.filter((vault) => vault.deleted_at === null).map((vault) => ({ id: vault.id, name: vault.name })),
    [vaultList],
  );

  return (
    <WorkspaceShell
      sidebar={sidebar}
      noun="los filtros"
      accent="var(--accent)"
      titleStart={
        <span className="vault-chip" style={{ "--chip-color": "var(--accent)" } as CSSProperties} aria-hidden="true">
          <ListChecks size={18} strokeWidth={2} />
        </span>
      }
      title="Tareas de todas las bóvedas"
      side={
        <div className="vault-tab-panel files-workspace" style={{ "--vault-icon-color": "var(--accent)" } as CSSProperties}>
          <div className="tf-panel-host" style={{ "--vault-icon-color": "var(--accent)" } as CSSProperties}>
            <TaskFilters tasks={list} filter={filter} onChange={setFilter} agentIds={agentIds} shown={shownCount} vaults={filterVaults} projects={projectOptions} onClose={() => sidebar.setOpen(false)} />
          </div>
        </div>
      }
    >
      <div className="vault-workspace-main">
        <section className="tasks-workspace" aria-label="Tareas de todas las bóvedas" style={{ "--vault-icon-color": "var(--accent)" } as CSSProperties}>
          <header className="tasks-toolbar">
            <div className="tasks-tabs" role="tablist" aria-label="Vista de tareas">
              {views.map(([id, label, Icon]) => (
                <button key={id} type="button" role="tab" id={`tasks-tab-${id}`} className="tasks-tab" aria-selected={shownView === id} aria-controls="tasks-panel" aria-label={label} title={label} onClick={() => setView(id)}>
                  <Icon size={15} aria-hidden="true" /> <span className="tasks-tab-label">{label}</span>
                </button>
              ))}
            </div>
          </header>
          <div id="tasks-panel" className="tasks-body" role="tabpanel" aria-labelledby={`tasks-tab-${shownView}`}>
            {notice && <p className="tasks-error" role="alert">{notice}</p>}
            {failed && <p className="tasks-error" role="alert">No se pudieron leer las tareas. <button type="button" onClick={() => void reload()}>Reintentar</button></p>}
            {tasks === null && !failed && <p className="tasks-empty">Cargando tareas…</p>}
            {tasks !== null && shownView === "list" && <TaskList nodes={tree} actions={actions} projects={projects} />}
            {tasks !== null && shownView === "kanban" && <TaskKanban tasks={visible} actions={actions} />}
            {tasks !== null && shownView === "gantt" && <TaskGantt nodes={tree} actions={actions} todayKey={todayKey} />}
            {tasks !== null && shownView === "calendar" && <TaskCalendar tasks={visible} actions={actions} todayKey={todayKey} />}
          </div>
          {detail && (
            <TaskDetail
              key={detail.id} task={detail} parent={detail.parent_id ? list.find((t) => t.id === detail.parent_id) : undefined}
              subtasks={list.filter((t) => t.parent_id === detail.id)} pathIndex={NO_PATHS} accent="var(--accent)"
              onStatus={actions.onStatus} onEdit={openInVault} onAddSubtask={openInVault} onDelete={openInVault}
              onOpenTask={actions.onOpen} onOpenPath={() => undefined} onClose={() => setDetailId(null)}
              global={{ vaultName: vaultName(detail), onOpenInVault: () => openInVault(detail) }}
              project={projects.find((p) => p.id === detail.project_id)}
              blockedBy={detail.blocked_by.flatMap((id) => list.find((t) => t.id === id) ?? [])} blocks={list.filter((t) => t.blocked_by.includes(detail.id))}
            />
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
