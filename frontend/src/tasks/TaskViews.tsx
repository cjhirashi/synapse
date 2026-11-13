import { useState } from "react";
import AgentBadge from "../agents/AgentBadge";
import { CalendarClock, ChevronDown, ChevronRight, FileText, Folder, Pencil, Plus, Trash2 } from "lucide-react";
import {
  PRIORITY_LABEL, STATUSES, STATUS_LABEL, buildTree, formatDay, formatDue, isClosed, isOverdue,
  resolvePath, type PathIndex, type PathTarget, type TaskNode,
} from "./taskModel";
import type { Task, TaskStatus } from "./tasksApi";

export interface ViewActions {
  pathIndex: PathIndex;
  focusId: string | null;
  onStatus: (task: Task, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  /** Abre el detalle completo de la tarea (solo lectura). */
  onOpen: (task: Task) => void;
  onAddSubtask: (parent: Task) => void;
  onDelete: (task: Task) => void;
  onOpenPath: (target: NonNullable<PathTarget>) => void;
}

/** Quién la asigna o la creó, con su foto y nombre cuando es un agente (H-053). */
function Assignee({ task }: { task: Task }) {
  if (task.assignee_type !== "agent") return <>Yo</>;
  return task.assignee_agent_id ? <AgentBadge agentId={task.assignee_agent_id} size={16} /> : <>agente</>;
}

function creatorAgent(task: Task): string | null {
  return task.created_by.startsWith("agent:") && task.created_by !== "agent:general" ? task.created_by.slice(6) : null;
}

function StatusSelect({ task, locked, onStatus }: { task: Task; locked: boolean; onStatus: ViewActions["onStatus"] }) {
  return (
    <select
      className="tasks-status" data-status={task.status} value={task.status} disabled={locked}
      title={locked ? "Su estado sale de sus subtareas" : "Estado"} aria-label={`Estado de ${task.title}`}
      onChange={(e) => onStatus(task, e.target.value as TaskStatus)}
    >
      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
    </select>
  );
}

function PathChip({ task, actions }: { task: Task; actions: ViewActions }) {
  if (!task.path) return null;
  const target = resolvePath(task.path, actions.pathIndex);
  if (!target) return <span className="tasks-chip tasks-chip--missing" title="La ruta no existe en la bóveda (es solo indicativa)">{task.path}</span>;
  const Icon = target.kind === "note" ? FileText : Folder;
  return (
    <button type="button" className="tasks-chip tasks-chip--path" title="Abrir en la bóveda" onClick={() => actions.onOpenPath(target)}>
      <Icon size={12} aria-hidden="true" /> {task.path}
    </button>
  );
}

function TaskMeta({ task, actions }: { task: Task; actions: ViewActions }) {
  return (
    <span className="tasks-meta">
      <span className="tasks-chip" data-priority={task.priority}>{PRIORITY_LABEL[task.priority]}</span>
      <span className="tasks-chip" title="Asignada a"><Assignee task={task} /></span>
      {creatorAgent(task) && (
        <span className="tasks-chip" title="Creada por">
          Creó: <AgentBadge agentId={creatorAgent(task)!} size={16} />
        </span>
      )}
      {task.due_at && (
        <span className={`tasks-chip${isOverdue(task) ? " tasks-chip--overdue" : ""}`} title={formatDue(task.due_at)}>
          <CalendarClock size={12} aria-hidden="true" /> {formatDue(task.due_at)}
        </span>
      )}
      <PathChip task={task} actions={actions} />
      {task.purge_at && <span className="tasks-chip tasks-chip--purge">Se elimina el {formatDay(task.purge_at)}</span>}
    </span>
  );
}

export function Row({ task, node, actions, sub }: { task: Task; node: TaskNode; actions: ViewActions; sub: boolean }) {
  const [open, setOpen] = useState(true);
  const hasKids = !sub && node.children.length > 0;
  const done = node.children.filter(isClosed).length;
  return (
    <li className={`tasks-item${sub ? " tasks-item--sub" : ""}`}>
      <div className={`tasks-row${actions.focusId === task.id ? " tasks-row--focus" : ""}${isClosed(task) ? " tasks-row--closed" : ""}`} id={`task-${task.id}`}>
        {hasKids ? (
          <button type="button" className="tasks-icon-btn" aria-expanded={open} aria-label={open ? "Plegar subtareas" : "Mostrar subtareas"} onClick={() => setOpen(!open)}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : <span className="tasks-icon-spacer" />}
        <StatusSelect task={task} locked={hasKids} onStatus={actions.onStatus} />
        <span className="tasks-title">
          <button type="button" className="tasks-title-btn" title="Ver el detalle" aria-label={`Ver detalle de ${task.title}`} onClick={() => actions.onOpen(task)}>{task.title}</button>
          {hasKids && <span className="tasks-progress"> {done}/{node.children.length}</span>}
        </span>
        <TaskMeta task={task} actions={actions} />
        <span className="tasks-actions">
          {!sub && <button type="button" className="tasks-add-sub" title="Añadir subtarea" aria-label={`Añadir subtarea a ${task.title}`} onClick={() => actions.onAddSubtask(task)}><Plus size={13} aria-hidden="true" /> Subtarea</button>}
          <button type="button" className="tasks-icon-btn" title="Editar" aria-label={`Editar ${task.title}`} onClick={() => actions.onEdit(task)}><Pencil size={14} /></button>
          <button type="button" className="tasks-icon-btn" title="Eliminar" aria-label={`Eliminar ${task.title}`} onClick={() => actions.onDelete(task)}><Trash2 size={14} /></button>
        </span>
      </div>
      {task.description && <p className="tasks-desc">{task.description}</p>}
      {hasKids && open && (
        <ul className="tasks-sublist">
          {node.children.map((child) => <Row key={child.id} task={child} node={{ task: child, children: [] }} actions={actions} sub />)}
        </ul>
      )}
    </li>
  );
}

export function TaskList({ nodes, actions }: { nodes: TaskNode[]; actions: ViewActions }) {
  if (nodes.length === 0) return <p className="tasks-empty">No hay tareas con estos filtros.</p>;
  return <ul className="tasks-list">{nodes.map((n) => <Row key={n.task.id} task={n.task} node={n} actions={actions} sub={false} />)}</ul>;
}

export function TaskKanban({ tasks, actions }: { tasks: Task[]; actions: ViewActions }) {
  const parents = new Map(tasks.map((t) => [t.id, t]));
  const kids = buildTree(tasks);
  const progress = new Map(kids.map((n) => [n.task.id, n.children]));
  return (
    <div className="tasks-kanban">
      {STATUSES.map((status) => {
        const column = tasks.filter((t) => t.status === status);
        return (
          <section key={status} className="tasks-column" aria-label={STATUS_LABEL[status]}>
            <h3>{STATUS_LABEL[status]} <span>{column.length}</span></h3>
            {column.map((task) => {
              const children = progress.get(task.id) ?? [];
              const parent = task.parent_id ? parents.get(task.parent_id) : undefined;
              return (
                <article key={task.id} className={`tasks-card${actions.focusId === task.id ? " tasks-row--focus" : ""}`} id={`task-${task.id}`}>
                  {parent && <p className="tasks-card-parent">↳ {parent.title}</p>}
                  <p className="tasks-title"><button type="button" className="tasks-title-btn" title="Ver el detalle" aria-label={`Ver detalle de ${task.title}`} onClick={() => actions.onOpen(task)}>{task.title}</button>{children.length > 0 && <span className="tasks-progress"> {children.filter(isClosed).length}/{children.length}</span>}</p>
                  <TaskMeta task={task} actions={actions} />
                  <div className="tasks-card-foot">
                    <StatusSelect task={task} locked={children.length > 0} onStatus={actions.onStatus} />
                    {!task.parent_id && <button type="button" className="tasks-add-sub" title="Añadir subtarea" aria-label={`Añadir subtarea a ${task.title}`} onClick={() => actions.onAddSubtask(task)}><Plus size={13} aria-hidden="true" /> Subtarea</button>}
                    <button type="button" className="tasks-icon-btn" title="Editar" aria-label={`Editar ${task.title}`} onClick={() => actions.onEdit(task)}><Pencil size={14} /></button>
                  </div>
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
