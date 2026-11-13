import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, KanbanSquare, List, Plus } from "lucide-react";
import { ConfirmDialog } from "../editor/ConfirmDialog";
import { useMediaQuery } from "../layout/useMediaQuery";
import { useSync } from "../sync/useSync";
import { ApiError } from "../api/problems";
import { getVaultAgentAccess } from "../settings/agentAccess";
import TaskFilters from "./TaskFilters";
import TaskDetail from "./TaskDetail";
import TaskForm from "./TaskForm";
import { TaskCalendar } from "./TaskCalendar";
import { TaskKanban, TaskList, type ViewActions } from "./TaskViews";
import {
  NO_FILTER, buildPathIndex, buildTree, dateKey, filterTree, isClosed, type PathTarget, type TaskFilter,
} from "./taskModel";
import { createTask, deleteTask, listTasks, updateTask, type Task, type TaskInput, type TaskStatus } from "./tasksApi";
import "./tasks.css";

type View = "list" | "kanban" | "calendar";
const VIEWS = [["list", "Lista", List], ["kanban", "Kanban", KanbanSquare], ["calendar", "Calendario", CalendarDays]] as const;
type Dialog = { kind: "form"; task?: Task; parent?: Task } | { kind: "detail"; id: string } | null;

interface Props {
  vaultId: string;
  accent: string;
  /** Contenedor de la barra lateral donde se dibujan los filtros (mismo patrón que Archivos). */
  sideSlot: HTMLElement | null;
  /** Tarea a resaltar (enlace profundo `?task=`). */
  focusTaskId?: string | null;
  onOpenNote: (id: string) => void;
  onOpenFolder: (path: string) => void;
  onCloseSide: () => void;
  /** Cuántas tareas abiertas de la persona hay; alimenta el contador de la pestaña. */
  onOpenCount: (count: number) => void;
}

const REFRESH_MS = 60_000;

/** Texto en español de un fallo de la API de tareas (los `detail` del servidor están en inglés y fijos). */
function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 412) return "La tarea cambió en otro lugar; se recargó con su versión actual.";
    if (error.status === 403) return "Este agente no puede hacer ese cambio.";
    if (error.status === 404) return "La tarea ya no existe.";
    if (error.status === 422) {
      const pointer = error.errors[0]?.pointer;
      if (pointer === "/assignee_agent_id") return "El agente no está registrado y activo en esta bóveda.";
      if (pointer === "/path") return "La ruta no es válida (sin «..», «\\» ni niveles vacíos).";
      if (pointer === "/status") return "El estado de una tarea con subtareas sale de ellas.";
      return "Revisa los datos de la tarea.";
    }
  }
  return fallback;
}

/** Pestaña «Tareas» de una bóveda (H-053): lista con subtareas, Kanban y Calendario, con filtros en la barra lateral. */
export default function VaultTasks({ vaultId, accent, sideSlot, focusTaskId = null, onOpenNote, onOpenFolder, onCloseSide, onOpenCount }: Props) {
  const { notes, notesVersion } = useSync();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>("list");
  // Hacia dónde se mueve la vista nueva: entra desde la derecha si la pestaña está más a la derecha, y al revés.
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [moved, setMoved] = useState(false); // la carga inicial no se anima; sí cada cambio de vista
  const [filter, setFilter] = useState<TaskFilter>(NO_FILTER);
  const [agents, setAgents] = useState<string[]>([]);
  const [paths, setPaths] = useState(() => buildPathIndex([]));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [confirm, setConfirm] = useState<Task | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const list = await listTasks(vaultId);
      if (!alive.current) return;
      setTasks(list);
      setFailed(false);
      onOpenCount(list.filter((t) => t.assignee_type === "user" && !isClosed(t)).length);
    } catch {
      if (alive.current) setFailed(true);
    }
  }, [vaultId, onOpenCount]);

  useEffect(() => {
    alive.current = true;
    void reload();
    // Los agentes cambian tareas por su cuenta: se relee al volver a la ventana y cada minuto.
    const timer = window.setInterval(() => { if (!document.hidden) void reload(); }, REFRESH_MS);
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => { alive.current = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    getVaultAgentAccess(vaultId)
      .then((access) => { if (!cancelled) setAgents(access.agents.filter((a) => a.estado === "activo").map((a) => a.agent_id)); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [vaultId]);

  useEffect(() => {
    let cancelled = false;
    notes.list(vaultId)
      .then((items) => { if (!cancelled) setPaths(buildPathIndex(items.map((n) => ({ id: n.id, path: n.path })))); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [notes, vaultId, notesVersion]);

  useEffect(() => {
    if (focusTaskId && tasks) document.getElementById(`task-${focusTaskId}`)?.scrollIntoView?.({ block: "center" });
  }, [focusTaskId, tasks]);

  /** Ejecuta un cambio y vuelve a leer; un 412 (la tarea cambió por otro lado) o cualquier fallo se avisa sin perder la vista. */
  async function run(action: () => Promise<unknown>) {
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setNotice(errorText(error, "No se pudo completar el cambio."));
    }
    await reload();
  }

  async function save(input: TaskInput & { title: string }, drafts: Array<TaskInput & { title: string }>) {
    if (dialog?.kind !== "form") return;
    setSaving(true);
    setFormError(null);
    try {
      if (dialog.task) await updateTask(vaultId, dialog.task, input);
      else {
        const created = await createTask(vaultId, input, dialog.parent?.id);
        // Las subtareas preparadas en el formulario se crean ya con la tarea (una a una, en orden).
        for (const draft of drafts) await createTask(vaultId, draft, created.id);
      }
      setDialog(null);
      await reload();
    } catch (error) {
      setFormError(errorText(error, "No se pudo guardar la tarea."));
    } finally {
      setSaving(false);
    }
  }

  async function addSubtask(parent: Task, input: TaskInput & { title: string }) {
    setFormError(null);
    try {
      await createTask(vaultId, input, parent.id);
      await reload();
    } catch (error) {
      setFormError(errorText(error, "No se pudo añadir la subtarea."));
      throw error;
    }
  }

  // En móvil (≤ 640 px, como la barra flotante de la bóveda) no hay Kanban: solo Lista y Calendario.
  const isMobile = useMediaQuery("(max-width: 640px)");
  const views = isMobile ? VIEWS.filter(([id]) => id !== "kanban") : VIEWS;
  const shownView: View = isMobile && view === "kanban" ? "list" : view;

  function changeView(next: View) {
    if (next === shownView) return;
    setDirection(views.findIndex(([id]) => id === next) > views.findIndex(([id]) => id === shownView) ? "next" : "prev");
    setMoved(true);
    setView(next);
  }

  const actions: ViewActions = {
    pathIndex: paths,
    focusId: focusTaskId,
    onStatus: (task, status: TaskStatus) => {
      // Mueve la tarjeta al instante; `run` relee del servidor y deja el estado real (o la devuelve si falló).
      setTasks((list) => (list ? list.map((t) => (t.id === task.id ? { ...t, status } : t)) : list));
      void run(() => updateTask(vaultId, task, { status }));
    },
    onOpen: (task) => setDialog({ kind: "detail", id: task.id }),
    onEdit: (task) => { setFormError(null); setDialog({ kind: "form", task }); },
    onAddSubtask: (parent) => { setFormError(null); setDialog({ kind: "form", parent }); },
    onDelete: setConfirm,
    onOpenPath: (target: NonNullable<PathTarget>) => (target.kind === "note" ? onOpenNote(target.id) : onOpenFolder(target.path)),
  };

  const list = tasks ?? [];
  // El detalle se lee de la lista viva: un cambio de estado o una subtarea nueva se reflejan sin cerrarlo.
  const detailTask = dialog?.kind === "detail" ? list.find((t) => t.id === dialog.id) : undefined;
  const tree = useMemo(() => filterTree(buildTree(list), filter), [list, filter]);
  const visible = useMemo(() => tree.flatMap((n) => [n.task, ...n.children]), [tree]);
  const agentIds = Array.from(new Set([...agents, ...list.flatMap((t) => (t.assignee_agent_id ? [t.assignee_agent_id] : []))])).sort();
  const todayKey = dateKey(new Date().toISOString());
  const pathOptions = useMemo(() => [...paths.folders, ...Array.from(paths.notes.keys()).filter((p) => /\.md$/i.test(p))].sort(), [paths]);

  const shownCount = tree.reduce((total, node) => total + 1 + node.children.length, 0);
  const filters = (
    <div className="tf-panel-host" style={{ "--vault-icon-color": accent } as CSSProperties}>
      <TaskFilters tasks={list} filter={filter} onChange={setFilter} agentIds={agentIds} shown={shownCount} onClose={onCloseSide} />
    </div>
  );

  return (
    <section className="tasks-workspace" aria-label="Tareas de la bóveda" data-moved={moved ? "" : undefined} data-direction={direction}>
      {sideSlot && createPortal(filters, sideSlot)}
      <header className="tasks-toolbar">
        <div className="tasks-tabs" role="tablist" aria-label="Vista de tareas">
          {views.map(([id, label, Icon]) => (
            <button
              key={id} type="button" role="tab" id={`tasks-tab-${id}`} className="tasks-tab"
              aria-selected={shownView === id} aria-controls="tasks-panel" aria-label={label} title={label} onClick={() => changeView(id)}
            >
              <Icon size={15} aria-hidden="true" /> <span className="tasks-tab-label">{label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="tasks-new" title="Nueva tarea" aria-label="Nueva tarea" onClick={() => { setFormError(null); setDialog({ kind: "form" }); }}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </header>
      {/* La barra de arriba queda fija; solo este cuerpo se desplaza. `key` lo vuelve a montar al cambiar de vista y se anima la entrada. */}
      <div key={shownView} id="tasks-panel" className="tasks-body" role="tabpanel" aria-labelledby={`tasks-tab-${shownView}`} data-direction={direction}>
        {notice && <p className="tasks-error" role="alert">{notice}</p>}
        {failed && <p className="tasks-error" role="alert">No se pudieron leer las tareas. <button type="button" onClick={() => void reload()}>Reintentar</button></p>}
        {tasks === null && !failed && <p className="tasks-empty">Cargando tareas…</p>}
        {tasks !== null && shownView === "list" && <TaskList nodes={tree} actions={actions} />}
        {tasks !== null && shownView === "kanban" && <TaskKanban tasks={visible} actions={actions} />}
        {tasks !== null && shownView === "calendar" && <TaskCalendar tasks={visible} actions={actions} todayKey={todayKey} />}
      </div>
      {detailTask && (
        <TaskDetail
          key={detailTask.id} task={detailTask} parent={detailTask.parent_id ? list.find((t) => t.id === detailTask.parent_id) : undefined}
          subtasks={list.filter((t) => t.parent_id === detailTask.id)} pathIndex={paths} accent={accent}
          onStatus={actions.onStatus} onEdit={actions.onEdit} onAddSubtask={actions.onAddSubtask} onDelete={setConfirm}
          onOpenTask={actions.onOpen}
          onOpenPath={(target) => { setDialog(null); actions.onOpenPath(target); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "form" && (
        <TaskForm
          key={dialog.task?.id ?? dialog.parent?.id ?? "new"} task={dialog.task} parent={dialog.parent} agents={agents}
          subtasks={dialog.task ? list.filter((t) => t.parent_id === dialog.task!.id) : []}
          onAddSubtask={dialog.task ? (input) => addSubtask(dialog.task!, input) : undefined}
          pathOptions={pathOptions} accent={accent} error={formError} saving={saving} onSave={(input, drafts) => void save(input, drafts)} onCancel={() => setDialog(null)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          titleId="task-delete-title" title={`Eliminar «${confirm.title}»`} tone="danger" onCancel={() => setConfirm(null)}
          body={confirm.parent_id ? "Se elimina la subtarea." : "Se elimina la tarea y todas sus subtareas. No se puede deshacer."}
        >
          <button type="button" onClick={() => setConfirm(null)}>Cancelar</button>
          <button type="button" className="btn-danger" onClick={() => { const target = confirm; setConfirm(null); setDialog((d) => (d?.kind === "detail" ? null : d)); void run(() => deleteTask(vaultId, target.id)); }}>Eliminar</button>
        </ConfirmDialog>
      )}
    </section>
  );
}
