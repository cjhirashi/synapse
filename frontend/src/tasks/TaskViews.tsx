import { useState } from "react";
import AgentBadge from "../agents/AgentBadge";
import UserBadge from "../agents/UserBadge";
import { CalendarClock, ChevronDown, ChevronRight, ExternalLink, FileText, Folder, GripVertical, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import {
  PRIORITY_LABEL, STATUSES, STATUS_LABEL, buildTree, formatDay, formatDue, isClosed, isOverdue,
  resolvePath, type PathIndex, type PathTarget, type TaskNode,
} from "./taskModel";
import { PROJECT_COLOR_CSS, PROJECT_STATUS_LABEL, type Project } from "./projectsApi";
import type { Task, TaskStatus } from "./tasksApi";

export interface ViewActions {
  pathIndex: PathIndex;
  focusId: string | null;
  onStatus: (task: Task, status: TaskStatus) => void;
  /** Cambia el inicio y/o el vencimiento (lo usa la línea de tiempo al arrastrar una barra). */
  onDates: (task: Task, span: { start_at?: string | null; due_at?: string | null }) => void;
  onEdit: (task: Task) => void;
  /** Abre el detalle completo de la tarea (solo lectura). */
  onOpen: (task: Task) => void;
  onAddSubtask: (parent: Task) => void;
  onDelete: (task: Task) => void;
  onOpenPath: (target: NonNullable<PathTarget>) => void;
  /** Ventana global (H-056): muestra la bóveda de cada tarea y, en vez de editar o borrar aquí, la abre en su bóveda. */
  global?: { vaultName: (task: Task) => string; onOpenInVault: (task: Task) => void };
  /** Título de una tarea por su id (para nombrar a sus bloqueadoras, H-057). */
  titleOf?: (id: string) => string | undefined;
  /** El proyecto de una tarea (H-058). */
  projectOf?: (task: Task) => Project | undefined;
}

/** El proyecto de la tarea con su color (H-058). */
export function ProjectChip({ task, actions }: { task: Task; actions: ViewActions }) {
  const project = actions.projectOf?.(task);
  if (!project) return null;
  return (
    <span className="tasks-chip tasks-chip--project" title={`Proyecto: ${project.title}`}>
      <i className="pj-dot pj-dot--chip" style={{ background: PROJECT_COLOR_CSS[project.color] }} aria-hidden="true" /> {project.title}
    </span>
  );
}

/** «Bloqueada por …» (H-057): la tarea espera a otras que aún no están hechas. */
export function BlockedChip({ task, actions }: { task: Task; actions: ViewActions }) {
  if (!task.blocked) return null;
  const names = task.blocked_by.map((id) => actions.titleOf?.(id)).filter((name): name is string => !!name);
  const label = names.length > 0 ? `Bloqueada por «${names[0]}»${names.length > 1 ? ` y ${names.length - 1} más` : ""}` : "Bloqueada";
  return (
    <span className="tasks-chip tasks-chip--blocked" title={names.length > 0 ? `No se puede dar por hecha hasta que estén hechas: ${names.join(", ")}` : "Espera a otras tareas"}>
      <Lock size={12} aria-hidden="true" /> {label}
    </span>
  );
}

/** «Bóveda: X», solo en la ventana global. */
export function VaultTag({ task, actions }: { task: Task; actions: ViewActions }) {
  if (!actions.global) return null;
  return <span className="tasks-chip tasks-chip--vault" title="Bóveda de la tarea">Bóveda: {actions.global.vaultName(task)}</span>;
}

/** Quién la asigna o la creó, con su foto y nombre cuando es un agente (H-053). */
function Assignee({ task, size = 28 }: { task: Task; size?: number }) {
  if (task.assignee_type !== "agent") return <UserBadge size={size} />;
  return task.assignee_agent_id ? <AgentBadge agentId={task.assignee_agent_id} size={size} /> : <>agente</>;
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
      {STATUSES.map((s) => <option key={s} value={s} disabled={s === "done" && task.blocked && task.status !== "done"}>{STATUS_LABEL[s]}</option>)}
    </select>
  );
}

function PathChip({ task, actions }: { task: Task; actions: ViewActions }) {
  if (!task.path || actions.global) return null;
  const target = resolvePath(task.path, actions.pathIndex);
  if (!target) return <span className="tasks-chip tasks-chip--missing" title="La ruta no existe en la bóveda (es solo indicativa)">{task.path}</span>;
  const Icon = target.kind === "note" ? FileText : Folder;
  return (
    <button type="button" className="tasks-chip tasks-chip--path" title="Abrir en la bóveda" onClick={() => actions.onOpenPath(target)}>
      <Icon size={12} aria-hidden="true" /> {task.path}
    </button>
  );
}

/** Lo que acompaña al título: la ruta y la fecha de eliminación. */
function TaskNotes({ task, actions }: { task: Task; actions: ViewActions }) {
  return (
    <span className="tasks-notes">
      <ProjectChip task={task} actions={actions} />
      <BlockedChip task={task} actions={actions} />
      <VaultTag task={task} actions={actions} />
      <PathChip task={task} actions={actions} />
      {task.purge_at && <span className="tasks-chip tasks-chip--purge">Se elimina el {formatDay(task.purge_at)}</span>}
    </span>
  );
}

/** Responsable, vencimiento, prioridad y estado: una columna cada uno, alineadas con la cabecera de la tabla. */
function TaskCells({ task, locked, actions }: { task: Task; locked: boolean; actions: ViewActions }) {
  const late = isOverdue(task);
  return (
    <div className="tasks-cells">
      <span className="tasks-cell tasks-cell--st"><StatusSelect task={task} locked={locked} onStatus={actions.onStatus} /></span>
      <span className="tasks-cell tasks-cell--pri" data-priority={task.priority} title="Prioridad">{PRIORITY_LABEL[task.priority]}</span>
      <span className="tasks-cell tasks-cell--who">
        <span className="tasks-who" title="Asignada a"><Assignee task={task} /></span>
        <span className="tasks-creator" title="Creada por">
          Creó: {creatorAgent(task) ? <AgentBadge agentId={creatorAgent(task)!} size={18} /> : task.created_by === "user" ? <UserBadge size={18} /> : "un agente"}
        </span>
      </span>
      {task.due_at ? (
        <span className={`tasks-cell tasks-cell--due${late ? " tasks-cell--late" : ""}`} title={late ? `Vencida: ${formatDue(task.due_at)}` : formatDue(task.due_at)}>
          <CalendarClock size={14} aria-hidden="true" /> {formatDue(task.due_at)}
        </span>
      ) : <span className="tasks-cell tasks-cell--due tasks-cell--none" aria-label="Sin vencimiento">—</span>}
    </div>
  );
}

export function Row({ task, node, actions, sub }: { task: Task; node: TaskNode; actions: ViewActions; sub: boolean }) {
  const [open, setOpen] = useState(true);
  const hasKids = !sub && node.children.length > 0;
  const done = node.children.filter(isClosed).length;
  return (
    <li className={`tasks-item${sub ? " tasks-item--sub" : ""}`} data-status={task.status}>
      <div className={`tasks-row${actions.focusId === task.id ? " tasks-row--focus" : ""}${isClosed(task) ? " tasks-row--closed" : ""}`} id={`task-${task.id}`}>
        <div className="tasks-main">
          <div className="tasks-line">
            {!sub && (hasKids ? (
              <button type="button" className="tasks-icon-btn tasks-toggle" aria-expanded={open} aria-label={open ? "Plegar subtareas" : "Mostrar subtareas"} onClick={() => setOpen(!open)}>
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : <span className="tasks-toggle" />)}
            <span className="tasks-title">
              <button type="button" className="tasks-title-btn" title="Ver el detalle" aria-label={`Ver detalle de ${task.title}`} onClick={() => actions.onOpen(task)}>{task.title}</button>
              {hasKids && (
                <span className="tasks-progress" title={`${done} de ${node.children.length} subtareas cerradas`}>
                  <span className="tasks-progress-bar" aria-hidden="true"><i style={{ width: `${Math.round((done / node.children.length) * 100)}%` }} /></span>
                  {done}/{node.children.length}
                </span>
              )}
            </span>
          </div>
          {task.description && <p className="tasks-desc">{task.description}</p>}
          <TaskNotes task={task} actions={actions} />
        </div>
        <TaskCells task={task} locked={hasKids} actions={actions} />
        <span className="tasks-actions">
          {actions.global ? (
            <button type="button" className="tasks-add-sub" title="Abrir la tarea en su bóveda" aria-label={`Abrir ${task.title} en su bóveda`} onClick={() => actions.global!.onOpenInVault(task)}>
              <ExternalLink size={13} aria-hidden="true" /> En la bóveda
            </button>
          ) : (<>
          {!sub && <button type="button" className="tasks-add-sub" title="Añadir subtarea" aria-label={`Añadir subtarea a ${task.title}`} onClick={() => actions.onAddSubtask(task)}><Plus size={13} aria-hidden="true" /> Subtarea</button>}
          <button type="button" className="tasks-icon-btn" title="Editar" aria-label={`Editar ${task.title}`} onClick={() => actions.onEdit(task)}><Pencil size={15} /></button>
          <button type="button" className="tasks-icon-btn tasks-icon-btn--danger" title="Eliminar" aria-label={`Eliminar ${task.title}`} onClick={() => actions.onDelete(task)}><Trash2 size={15} /></button>
          </>)}
        </span>
      </div>
      {hasKids && open && (
        <ul className="tasks-sublist">
          {node.children.map((child) => <Row key={child.id} task={child} node={{ task: child, children: [] }} actions={actions} sub />)}
        </ul>
      )}
    </li>
  );
}

export function TaskList({ nodes, actions, projects }: { nodes: TaskNode[]; actions: ViewActions; projects?: Project[] }) {
  const header = (
    <div className="tasks-head" aria-hidden="true">
      <span>Tarea</span><span>Estado</span><span>Prioridad</span><span>Responsable</span><span>Vence</span><span />
    </div>
  );
  const rows = (list: TaskNode[]) => <ul className="tasks-list">{list.map((n) => <Row key={n.task.id} task={n.task} node={n} actions={actions} sub={false} />)}</ul>;
  if (nodes.length === 0 && !(projects && projects.length > 0)) return <p className="tasks-empty">No hay tareas con estos filtros.</p>;
  if (!projects || projects.length === 0) return <div className="tasks-table">{header}{rows(nodes)}</div>;
  // Con proyectos (H-058) la lista se agrupa: un bloque por proyecto y, al final, las tareas sin proyecto.
  const known = new Set(projects.map((p) => p.id));
  const groups = [
    ...projects.map((project) => ({ project, nodes: nodes.filter((n) => n.task.project_id === project.id) })),
    { project: null as Project | null, nodes: nodes.filter((n) => n.task.project_id === null || !known.has(n.task.project_id)) },
  ].filter((group) => group.nodes.length > 0 || group.project !== null);
  return (
    <div className="tasks-table">
      {header}
      {groups.map(({ project, nodes: list }) => (
        <section key={project?.id ?? "none"} className="tasks-group" aria-label={project ? `Proyecto ${project.title}` : "Sin proyecto"}>
          <h3 className="tasks-group-head">
            <i className="pj-dot" style={{ background: project ? PROJECT_COLOR_CSS[project.color] : "var(--text-muted)" }} aria-hidden="true" />
            <span>{project ? project.title : "Sin proyecto"}</span>
            {project && <span className="tasks-chip" data-project-status={project.status}>{PROJECT_STATUS_LABEL[project.status]}</span>}
            {project && <span className="tasks-group-count">{project.tasks_done}/{project.tasks_total}</span>}
          </h3>
          {list.length === 0 ? <p className="tasks-group-empty">Sin tareas todavía.</p> : rows(list)}
        </section>
      ))}
    </div>
  );
}

const COLUMN_HINT: Record<TaskStatus, string> = {
  pending: "Suelta aquí lo que aún no empieza",
  in_progress: "Suelta aquí lo que ya está en marcha",
  done: "Suelta aquí lo que ya terminó",
  cancelled: "Suelta aquí lo que se descartó",
};

export function TaskKanban({ tasks, actions }: { tasks: Task[]; actions: ViewActions }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const parents = new Map(tasks.map((t) => [t.id, t]));
  const progress = new Map(buildTree(tasks).map((n) => [n.task.id, n.children]));

  function endDrag() {
    setDragId(null);
    setOver(null);
  }

  function drop(event: React.DragEvent, status: TaskStatus) {
    event.preventDefault();
    const id = dragId ?? event.dataTransfer.getData("text/plain");
    const task = tasks.find((t) => t.id === id);
    endDrag();
    if (task && task.status !== status && !(status === "done" && task.blocked)) actions.onStatus(task, status);
  }

  return (
    <div className="tasks-kanban" data-dragging={dragId ? "true" : undefined}>
      {STATUSES.map((status) => {
        const column = tasks.filter((t) => t.status === status);
        const dragged = dragId ? tasks.find((t) => t.id === dragId) : undefined;
        const accepts = !!dragged && dragged.status !== status && !(status === "done" && dragged.blocked);
        return (
          <section
            key={status} className="tasks-column" data-status={status} aria-label={STATUS_LABEL[status]}
            data-over={over === status && accepts ? "true" : undefined}
            onDragOver={(e) => { if (!dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = accepts ? "move" : "none"; if (over !== status) setOver(status); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((cur) => (cur === status ? null : cur)); }}
            onDrop={(e) => drop(e, status)}
          >
            <h3 className="tasks-column-head">
              <span className="tasks-dot" aria-hidden="true" />
              <span className="tasks-column-name">{STATUS_LABEL[status]}</span>
              <span className="tasks-column-count">{column.length}</span>
            </h3>
            <div className="tasks-column-body">
              {column.map((task) => {
                const children = progress.get(task.id) ?? [];
                const locked = children.length > 0;
                const parent = task.parent_id ? parents.get(task.parent_id) : undefined;
                return (
                  <article
                    key={task.id} id={`task-${task.id}`} data-status={task.status} data-locked={locked ? "true" : undefined}
                    data-dragging={dragId === task.id ? "true" : undefined}
                    className={`tasks-card${actions.focusId === task.id ? " tasks-row--focus" : ""}${isClosed(task) ? " tasks-row--closed" : ""}`}
                    draggable={!locked}
                    title={locked ? "Su estado sale de sus subtareas: mueve las subtareas" : undefined}
                    onDragStart={(e) => { if (locked) return; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", task.id); setDragId(task.id); }}
                    onDragEnd={endDrag}
                  >
                    {parent && <p className="tasks-card-parent">↳ {parent.title}</p>}
                    <p className="tasks-card-title tasks-title">
                      {!locked && <GripVertical size={14} className="tasks-grip" aria-hidden="true" />}
                      {locked && <Lock size={12} className="tasks-lock" aria-hidden="true" />}
                      <button type="button" className="tasks-title-btn" title="Ver el detalle" aria-label={`Ver detalle de ${task.title}`} onClick={() => actions.onOpen(task)}>{task.title}</button>
                      {locked && <span className="tasks-progress"> {children.filter(isClosed).length}/{children.length}</span>}
                    </p>
                    {task.description && <p className="tasks-card-desc">{task.description}</p>}
                    <span className="tasks-meta">
                      <span className="tasks-chip" data-priority={task.priority}>{PRIORITY_LABEL[task.priority]}</span>
                      {task.due_at && (
                        <span className={`tasks-chip${isOverdue(task) ? " tasks-chip--overdue" : ""}`} title={formatDue(task.due_at)}>
                          <CalendarClock size={12} aria-hidden="true" /> {formatDue(task.due_at)}
                        </span>
                      )}
                      <ProjectChip task={task} actions={actions} />
                      <BlockedChip task={task} actions={actions} />
                      <VaultTag task={task} actions={actions} />
                      <PathChip task={task} actions={actions} />
                      {task.purge_at && <span className="tasks-chip tasks-chip--purge">Se elimina el {formatDay(task.purge_at)}</span>}
                    </span>
                    <div className="tasks-card-foot">
                      <span className="tasks-card-who" title="Asignada a"><Assignee task={task} /></span>
                      <span className="tasks-card-tools">
                        <StatusSelect task={task} locked={locked} onStatus={actions.onStatus} />
                        {actions.global ? (
                          <button type="button" className="tasks-icon-btn" title="Abrir la tarea en su bóveda" aria-label={`Abrir ${task.title} en su bóveda`} onClick={() => actions.global!.onOpenInVault(task)}><ExternalLink size={14} /></button>
                        ) : (<>
                        {!task.parent_id && <button type="button" className="tasks-icon-btn" title="Añadir subtarea" aria-label={`Añadir subtarea a ${task.title}`} onClick={() => actions.onAddSubtask(task)}><Plus size={14} aria-hidden="true" /></button>}
                        <button type="button" className="tasks-icon-btn" title="Editar" aria-label={`Editar ${task.title}`} onClick={() => actions.onEdit(task)}><Pencil size={14} /></button>
                        </>)}
                      </span>
                    </div>
                  </article>
                );
              })}
              {column.length === 0 && <p className="tasks-column-empty">{dragId ? COLUMN_HINT[status] : "Sin tareas"}</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
