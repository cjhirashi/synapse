import { useId, type ReactNode, type CSSProperties } from "react";
import { Bell, CalendarClock, CornerDownRight, ExternalLink, FileText, Folder, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import AgentBadge from "../agents/AgentBadge";
import UserBadge from "../agents/UserBadge";
import DialogFrame from "../editor/DialogFrame";
import { PRIORITY_LABEL, STATUSES, STATUS_LABEL, effectiveReminders, formatDue, formatReminder, isClosed, isOverdue, resolvePath, type PathIndex, type PathTarget } from "./taskModel";
import type { Task, TaskStatus } from "./tasksApi";

interface Props {
  task: Task;
  /** Tarea que la contiene, si es una subtarea. */
  parent?: Task;
  subtasks: Task[];
  pathIndex: PathIndex;
  accent: string;
  onStatus: (task: Task, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onAddSubtask: (parent: Task) => void;
  onDelete: (task: Task) => void;
  /** Abre otra tarea (una subtarea o la tarea que la contiene). */
  onOpenTask: (task: Task) => void;
  onOpenPath: (target: NonNullable<PathTarget>) => void;
  onClose: () => void;
  /** Ventana global (H-056): muestra la bóveda y, en vez de editar o borrar aquí, abre la tarea en su bóveda. */
  global?: { vaultName: string; onOpenInVault: () => void };
  /** Las tareas que esta espera y las que la esperan a ella (H-057), de la misma bóveda. */
  blockedBy?: Task[];
  blocks?: Task[];
}

function Person({ task }: { task: Task }) {
  if (task.assignee_type === "agent" && task.assignee_agent_id) return <AgentBadge agentId={task.assignee_agent_id} size={36} />;
  return <UserBadge size={22} />;
}

/** Quién la creó: la persona o un agente (el servidor guarda `user` o `agent:<id>`). */
function Creator({ value }: { value: string }) {
  if (value === "user") return <UserBadge size={36} />;
  const id = value.startsWith("agent:") ? value.slice(6) : "";
  return id && id !== "general" ? <AgentBadge agentId={id} size={36} /> : <>Un agente (clave general)</>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="td-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const when = (iso: string | null) => (iso ? formatDue(iso) : null);

/**
 * Detalle completo de una tarea o subtarea, de solo lectura (el cambio de estado es la única acción directa): título y estado,
 * a quién se asigna, quién la creó, vencimiento, ruta, descripción, notas de avance, subtareas y fechas. Editar, añadir una
 * subtarea y eliminar son acciones aparte.
 */
export default function TaskDetail({ task, parent, subtasks, pathIndex, accent, onStatus, onEdit, onAddSubtask, onDelete, onOpenTask, onOpenPath, onClose, global, blockedBy = [], blocks = [] }: Props) {
  const id = useId();
  const isRoot = task.parent_id === null;
  const locked = isRoot && subtasks.length > 0; // el estado de una raíz sale de sus subtareas
  const target = task.path ? resolvePath(task.path, pathIndex) : null;
  const PathIcon = target?.kind === "folder" ? Folder : FileText;
  const done = subtasks.filter(isClosed).length;
  const overdue = isOverdue(task);

  return (
    <DialogFrame
      role="dialog"
      titleId={`${id}-title`}
      title={task.title}
      subtitle={parent ? (
        <button type="button" className="td-parent" onClick={() => onOpenTask(parent)}>
          <CornerDownRight size={12} aria-hidden="true" /> Subtarea de «{parent.title}»
        </button>
      ) : undefined}
      glyph={ListChecks}
      tone="accent"
      accent={accent}
      size="lg"
      showClose
      onCancel={onClose}
      footerStart={global ? undefined : (
        <button type="button" className="ag-danger td-delete" onClick={() => onDelete(task)}>
          <Trash2 size={14} aria-hidden="true" /> Eliminar
        </button>
      )}
      actions={
        <>
          <button type="button" data-autofocus onClick={onClose}>Cerrar</button>
          {global ? (
            <button type="button" className="btn-primary" onClick={global.onOpenInVault}>
              <ExternalLink size={14} aria-hidden="true" /> Abrir en la bóveda
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => onEdit(task)}>
              <Pencil size={14} aria-hidden="true" /> Editar
            </button>
          )}
        </>
      }
    >
      <div className="td" style={{ "--vault-icon-color": accent } as CSSProperties}>
        <section className="td-status" aria-label="Estado">
          <div className="td-segments" role="radiogroup" aria-label="Estado">
            {STATUSES.map((status) => (
              <label key={status} className="td-segment" data-status={status} title={locked ? "Su estado sale de sus subtareas" : status === "done" && task.blocked ? "Sus tareas bloqueadoras deben estar hechas primero" : undefined}>
                <input type="radio" name={`${id}-st`} value={status} checked={task.status === status} disabled={locked || (status === "done" && task.blocked && task.status !== "done")} onChange={() => onStatus(task, status)} />
                <span>{STATUS_LABEL[status]}</span>
              </label>
            ))}
          </div>
          {locked && <p className="td-note">El estado de esta tarea sale de sus subtareas: se cierra cuando todas se cierran.</p>}
          {task.blocked && <p className="td-note">Está bloqueada: puede ponerse en curso, pero no darse por hecha hasta que estén hechas las tareas que la bloquean.</p>}
        </section>

        <dl className="td-grid">
          {global && <Field label="Bóveda"><span className="tasks-chip tasks-chip--vault">{global.vaultName}</span></Field>}
          <Field label="Asignada a"><Person task={task} /></Field>
          <Field label="Prioridad"><span className="tasks-chip" data-priority={task.priority}>{PRIORITY_LABEL[task.priority]}</span></Field>
          <Field label="Inicia">
            {task.start_at ? <span className="td-due"><CalendarClock size={14} aria-hidden="true" /> {formatDue(task.start_at)}</span> : <span className="td-none">Sin fecha</span>}
          </Field>
          <Field label="Vence">
            {task.due_at ? (
              <span className={`td-due${overdue ? " td-due--late" : ""}`}>
                <CalendarClock size={14} aria-hidden="true" /> {formatDue(task.due_at)}{overdue && <strong> · Vencida</strong>}
              </span>
            ) : <span className="td-none">Sin fecha</span>}
          </Field>
          <Field label="Creada por"><Creator value={task.created_by} /></Field>
        </dl>

        {task.due_at && (
          <section className="td-block" aria-labelledby={`${id}-rem`}>
            <h3 id={`${id}-rem`}>Notificaciones</h3>
            {effectiveReminders(task).length === 0 ? <p className="td-none">Sin recordatorios: solo se avisa cuando vence.</p> : (
              <ul className="td-reminders">
                {effectiveReminders(task).map((minutes) => (
                  <li key={minutes} className="tasks-chip"><Bell size={12} aria-hidden="true" /> {formatReminder(minutes)}</li>
                ))}
              </ul>
            )}
            {task.assignee_type !== "user" && <p className="td-note">Avisan a la persona: esta tarea es de un agente, así que no generará avisos.</p>}
          </section>
        )}

        {(blockedBy.length > 0 || blocks.length > 0) && (
          <section className="td-block" aria-labelledby={`${id}-blk`}>
            <h3 id={`${id}-blk`}>Dependencias</h3>
            {blockedBy.length > 0 && (
              <>
                <p className="td-note">Bloqueada por</p>
                <ul className="td-subs">
                  {blockedBy.map((other) => (
                    <li key={other.id}>
                      <button type="button" className="td-sub" onClick={() => onOpenTask(other)} aria-label={`Abrir ${other.title}`}>
                        <span className="td-sub-body"><span className={`td-sub-title${isClosed(other) ? " td-sub-title--closed" : ""}`}>{other.title}</span></span>
                        <span className="tasks-chip" data-status={other.status}>{STATUS_LABEL[other.status]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {blocks.length > 0 && (
              <>
                <p className="td-note">Bloquea a</p>
                <ul className="td-subs">
                  {blocks.map((other) => (
                    <li key={other.id}>
                      <button type="button" className="td-sub" onClick={() => onOpenTask(other)} aria-label={`Abrir ${other.title}`}>
                        <span className="td-sub-body"><span className={`td-sub-title${isClosed(other) ? " td-sub-title--closed" : ""}`}>{other.title}</span></span>
                        <span className="tasks-chip" data-status={other.status}>{STATUS_LABEL[other.status]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        <section className="td-block" aria-labelledby={`${id}-path`}>
          <h3 id={`${id}-path`}>Ruta</h3>
          {task.path ? (
            target ? (
              <button type="button" className="tasks-chip tasks-chip--path td-path" title="Abrir en la bóveda" onClick={() => onOpenPath(target)}>
                <PathIcon size={13} aria-hidden="true" /> {task.path}
              </button>
            ) : <span className="tasks-chip tasks-chip--missing" title="La ruta no existe en la bóveda (es solo indicativa)">{task.path}</span>
          ) : <p className="td-none">Sin ruta.</p>}
        </section>

        <section className="td-block" aria-labelledby={`${id}-desc`}>
          <h3 id={`${id}-desc`}>Descripción</h3>
          {task.description ? <p className="td-text">{task.description}</p> : <p className="td-none">Sin descripción.</p>}
        </section>

        <section className="td-block" aria-labelledby={`${id}-notes`}>
          <h3 id={`${id}-notes`}>Notas de avance</h3>
          {task.notes ? <p className="td-text">{task.notes}</p> : <p className="td-none">Sin notas de avance.</p>}
        </section>

        {isRoot && (
          <section className="td-block" aria-labelledby={`${id}-subs`}>
            <h3 id={`${id}-subs`}>
              Subtareas {subtasks.length > 0 && <span className="td-count">{done}/{subtasks.length}</span>}
            </h3>
            {subtasks.length === 0 ? <p className="td-none">Todavía no tiene subtareas.</p> : (
              <ul className="td-subs">
                {subtasks.map((sub) => (
                  <li key={sub.id}>
                    <button type="button" className="td-sub" onClick={() => onOpenTask(sub)} aria-label={`Abrir ${sub.title}`}>
                      <span className="td-sub-body">
                        <span className={`td-sub-title${isClosed(sub) ? " td-sub-title--closed" : ""}`}>{sub.title}</span>
                        {sub.description && <span className="td-sub-desc">{sub.description}</span>}
                      </span>
                      {sub.assignee_type === "agent" && sub.assignee_agent_id && <AgentBadge agentId={sub.assignee_agent_id} size={26} />}
                      <span className="tasks-chip" data-status={sub.status}>{STATUS_LABEL[sub.status]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!global && (
              <button type="button" className="td-add" onClick={() => onAddSubtask(task)}>
                <Plus size={14} aria-hidden="true" /> Añadir subtarea
              </button>
            )}
          </section>
        )}

        <section className="td-dates" aria-label="Fechas">
          <span>Creada {when(task.created_at)}</span>
          <span>Modificada {when(task.updated_at)}{task.updated_by !== task.created_by ? <> por <Creator value={task.updated_by} /></> : null}</span>
          {task.completed_at && <span>Cerrada {when(task.completed_at)}</span>}
          {task.purge_at && <span className="td-purge">Se elimina el {when(task.purge_at)}</span>}
        </section>
      </div>
    </DialogFrame>
  );
}
