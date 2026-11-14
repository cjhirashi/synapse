import { useId, useState, type CSSProperties } from "react";
import { CornerDownRight, ListChecks, Plus, X } from "lucide-react";
import AgentBadge from "../agents/AgentBadge";
import AgentSelect from "../agents/AgentSelect";
import UserBadge from "../agents/UserBadge";
import DialogFrame from "../editor/DialogFrame";
import ReminderEditor from "./ReminderEditor";
import { DEFAULT_REMINDERS, PRIORITY_LABEL, STATUS_LABEL, effectiveReminders, fromLocalInput, toLocalInput } from "./taskModel";
import type { Project } from "./projectsApi";
import type { Task, TaskInput, TaskPriority } from "./tasksApi";

interface Props {
  /** Tarea que se edita; sin ella, se crea una (raíz o, con `parent`, una subtarea). */
  task?: Task;
  parent?: Task;
  /** Subtareas ya guardadas de la tarea que se edita. */
  subtasks?: Task[];
  agents: string[];
  /** Tareas de la bóveda que pueden bloquear a esta (H-057): sin ella misma, su tarea padre ni sus subtareas. */
  blockerOptions?: Task[];
  /** Proyectos de la bóveda (H-058): la tarea raíz elige uno; una subtarea toma el de su raíz. */
  projects?: Project[];
  pathOptions: string[];
  accent: string;
  error: string | null;
  saving: boolean;
  /** En una tarea nueva, `drafts` son las subtareas (ya con su asignación resuelta) que se crean junto con ella. */
  onSave: (input: TaskInput & { title: string }, drafts: Array<TaskInput & { title: string }>) => void;
  /** Añade ya una subtarea a la tarea que se edita. */
  onAddSubtask?: (input: TaskInput & { title: string }) => Promise<void>;
  onCancel: () => void;
}

/** «Creada por …» con la foto y el nombre del agente (el servidor guarda `user` o `agent:<id>`). */
function CreatedBy({ value }: { value: string }) {
  const agent = value.startsWith("agent:") && value !== "agent:general" ? value.slice(6) : null;
  return (
    <span className="tf-created">
      Creada por {value === "user" ? <UserBadge size={16} label="ti" /> : agent ? <AgentBadge agentId={agent} size={16} /> : "un agente (clave general)"}
    </span>
  );
}

const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

/** Asignación de una subtarea: `inherit` = la misma que la tarea que la contiene. */
type SubAssignee = string;

interface Draft {
  title: string;
  description: string | null;
  assignee: SubAssignee;
}

const assignment = (assignee: string) => ({
  assignee_type: assignee === "user" ? ("user" as const) : ("agent" as const),
  assignee_agent_id: assignee === "user" ? null : assignee,
});

/**
 * Alta y edición de una tarea o subtarea. La ruta es indicativa: se sugiere, pero se acepta cualquiera con forma válida.
 * Solo una tarea raíz tiene subtareas (dos niveles): una subtarea no muestra esa sección.
 */
export default function TaskForm({ task, parent, subtasks = [], agents, blockerOptions = [], projects = [], pathOptions, accent, error, saving, onSave, onAddSubtask, onCancel }: Props) {
  const id = useId();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [assignee, setAssignee] = useState(task ? (task.assignee_type === "agent" ? (task.assignee_agent_id ?? "user") : "user") : "user");
  const [start, setStart] = useState(toLocalInput(task?.start_at ?? null));
  const [due, setDue] = useState(toLocalInput(task?.due_at ?? null));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [path, setPath] = useState(task?.path ?? "");
  const [reminders, setReminders] = useState<number[]>(() => (task ? effectiveReminders(task) : [...DEFAULT_REMINDERS]));
  const [blockedBy, setBlockedBy] = useState<string[]>(task?.blocked_by ?? []);
  const [projectId, setProjectId] = useState(task?.project_id ?? parent?.project_id ?? "");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [newSub, setNewSub] = useState("");
  const [newSubDescription, setNewSubDescription] = useState("");
  const [newSubAssignee, setNewSubAssignee] = useState<SubAssignee>("inherit");
  const [addingSub, setAddingSub] = useState(false);

  // Un agente asignado que ya no está registrado sigue visible para poder cambiarlo.
  const agentChoices = Array.from(new Set([...agents, ...(task?.assignee_agent_id ? [task.assignee_agent_id] : [])]));
  const badSpan = start !== "" && due !== "" && start > due; // `datetime-local` se ordena como texto
  const canSave = title.trim().length > 0 && !badSpan && !saving;
  const showSubtasks = !parent && !task?.parent_id;

  /** La subtarea lista para enviar: «igual que la tarea» toma la asignación que tiene la tarea en este formulario. */
  const subtaskInput = (draft: Draft): TaskInput & { title: string } => ({
    title: draft.title,
    description: draft.description,
    ...assignment(draft.assignee === "inherit" ? assignee : draft.assignee),
  });

  function submit() {
    if (!canSave) return;
    onSave(
      {
        title: title.trim(),
        description: description.trim() || null,
        notes: notes.trim() || null,
        priority,
        start_at: fromLocalInput(start),
        due_at: fromLocalInput(due),
        assignee_type: assignee === "user" ? "user" : "agent",
        assignee_agent_id: assignee === "user" ? null : assignee,
        path: path.trim() || null,
        // Sin vencimiento no hay recordatorios: se vuelve a los de siempre. Las repetidas se unen y el servidor las ordena.
        reminders: due ? Array.from(new Set(reminders)) : null,
        ...(blockedBy.length > 0 || (task && task.blocked_by.length > 0) ? { blocked_by: blockedBy } : {}),
        // Solo una tarea raíz elige proyecto; una subtarea toma el de su raíz (el servidor lo hereda).
        ...(showSubtasks && projectId !== (task?.project_id ?? "") ? { project_id: projectId || null } : {}),
      },
      drafts.map(subtaskInput),
    );
  }

  async function addSubtask() {
    const text = newSub.trim();
    if (!text || addingSub) return;
    const draft: Draft = { title: text, description: newSubDescription.trim() || null, assignee: newSubAssignee };
    if (task && onAddSubtask) {
      setAddingSub(true);
      try {
        await onAddSubtask(subtaskInput(draft));
      } catch {
        return; // el error ya se muestra en el formulario y lo escrito se conserva para reintentar
      } finally {
        setAddingSub(false);
      }
    } else {
      setDrafts((current) => [...current, draft]);
    }
    setNewSub("");
    setNewSubDescription("");
    setNewSubAssignee("inherit");
  }

  const heading = task ? (task.parent_id ? "Editar subtarea" : "Editar tarea") : parent ? "Nueva subtarea" : "Nueva tarea";
  return (
    <DialogFrame
      role="dialog"
      titleId={`${id}-title`}
      title={heading}
      subtitle={parent ? `Dentro de «${parent.title}»` : task ? <CreatedBy value={task.created_by} /> : undefined}
      glyph={ListChecks}
      tone="accent"
      accent={accent}
      size="lg"
      top
      backdropClosable={false}
      onCancel={onCancel}
      onEnter={submit}
      actions={
        <>
          <button type="button" onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={!canSave} onClick={submit}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <form className="tf" style={{ "--vault-icon-color": accent } as CSSProperties} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="tf-field">
          <label htmlFor={`${id}-t`}>Título</label>
          <input id={`${id}-t`} autoFocus value={title} maxLength={255} placeholder="¿Qué hay que hacer?" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="tf-field">
          <label htmlFor={`${id}-d`}>Descripción</label>
          <textarea id={`${id}-d`} rows={3} value={description} placeholder="Detalles, criterios de terminado…" onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="tf-field">
          <label htmlFor={`${id}-a`}>Asignada a</label>
          <AgentSelect id={`${id}-a`} label="Asignada a" value={assignee} onChange={setAssignee} agents={agentChoices} />
          {agentChoices.length === 0 && <p className="tf-help">Para asignarla a un agente, regístralo como gestor en esta bóveda (Ajustes → Agentes por bóveda).</p>}
        </div>

        <div className="tf-row tf-row--dates">
          <fieldset className="tf-field">
            <legend>Prioridad</legend>
            <div className="tf-segments" role="radiogroup" aria-label="Prioridad">
              {PRIORITIES.map((p) => (
                <label key={p} className="tf-segment" data-priority={p}>
                  <input type="radio" name={`${id}-pr`} value={p} checked={priority === p} onChange={() => setPriority(p)} />
                  <span>{PRIORITY_LABEL[p]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="tf-field">
            <label htmlFor={`${id}-i`}>Inicia <small>(hora de la Ciudad de México)</small></label>
            <div className="tf-inline">
              <input id={`${id}-i`} type="datetime-local" value={start} max={due || undefined} aria-invalid={badSpan || undefined} onChange={(e) => setStart(e.target.value)} />
              {start && <button type="button" className="tf-icon" aria-label="Quitar la fecha de inicio" title="Quitar la fecha" onClick={() => setStart("")}><X size={14} /></button>}
            </div>
          </div>
          <div className="tf-field">
            <label htmlFor={`${id}-v`}>Vence <small>(hora de la Ciudad de México)</small></label>
            <div className="tf-inline">
              <input id={`${id}-v`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
              {due && <button type="button" className="tf-icon" aria-label="Quitar la fecha de vencimiento" title="Quitar la fecha" onClick={() => setDue("")}><X size={14} /></button>}
            </div>
          </div>
        </div>

        {badSpan && <p className="tf-help tf-help--error" role="alert">El inicio no puede ser posterior al vencimiento.</p>}

        <ReminderEditor value={reminders} onChange={setReminders} hasDue={due !== ""} mine={assignee === "user"} />

        {projects.length > 0 && (
          <div className="tf-field">
            <label htmlFor={`${id}-pj`}>Proyecto</label>
            {showSubtasks ? (
              <select id={`${id}-pj`} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Sin proyecto</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            ) : (
              <p className="tf-help">{projects.find((p) => p.id === projectId)?.title ?? "Sin proyecto"} (el de su tarea)</p>
            )}
          </div>
        )}

        {blockerOptions.length + blockedBy.length > 0 && (
          <div className="tf-field">
            <label htmlFor={`${id}-b`}>Bloqueada por <small>(opcional: no se da por hecha hasta que esas tareas lo estén)</small></label>
            {blockedBy.length > 0 && (
              <ul className="note-chips tf-blockers">
                {blockedBy.map((blockerId) => {
                  const other = blockerOptions.find((t) => t.id === blockerId);
                  return (
                    <li key={blockerId} className="note-chip">
                      {other?.title ?? "Tarea"}
                      <button type="button" className="note-chip-remove" aria-label={`Quitar el bloqueo de ${other?.title ?? "la tarea"}`} onClick={() => setBlockedBy((current) => current.filter((x) => x !== blockerId))}>
                        <X size={12} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <select id={`${id}-b`} aria-label="Añadir una tarea bloqueadora" value="" onChange={(e) => { if (e.target.value) setBlockedBy((current) => [...current, e.target.value]); }}>
              <option value="">Elige una tarea…</option>
              {blockerOptions.filter((t) => !blockedBy.includes(t.id)).map((t) => (
                <option key={t.id} value={t.id}>{t.parent_id ? "↳ " : ""}{t.title} ({STATUS_LABEL[t.status]})</option>
              ))}
            </select>
          </div>
        )}

        <div className="tf-field">
          <label htmlFor={`${id}-r`}>Ruta <small>(documento o carpeta donde se trabaja; solo indicativa)</small></label>
          <input id={`${id}-r`} list={`${id}-paths`} value={path} maxLength={500} placeholder="Carpeta/Documento.md" onChange={(e) => setPath(e.target.value)} />
          <datalist id={`${id}-paths`}>{pathOptions.map((p) => <option key={p} value={p} />)}</datalist>
        </div>

        {task && (
          <div className="tf-field">
            <label htmlFor={`${id}-n`}>Notas de avance</label>
            <textarea id={`${id}-n`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        )}

        {showSubtasks && (
          <section className="tf-subtasks" aria-labelledby={`${id}-subs`}>
            <h3 id={`${id}-subs`}>Subtareas {subtasks.length + drafts.length > 0 && <span>{subtasks.length + drafts.length}</span>}</h3>
            {subtasks.length + drafts.length > 0 && (
              <ul className="tf-sublist">
                {subtasks.map((s) => (
                  <li key={s.id}>
                    <CornerDownRight size={14} aria-hidden="true" />
                    <span className="tf-sub-body">
                      <span className="tf-sub-title">{s.title}</span>
                      {s.description && <span className="tf-sub-desc">{s.description}</span>}
                    </span>
                    {s.assignee_type === "agent" && s.assignee_agent_id && <AgentBadge agentId={s.assignee_agent_id} size={16} />}
                    <span className="tasks-chip" data-status={s.status}>{STATUS_LABEL[s.status]}</span>
                  </li>
                ))}
                {drafts.map((d, index) => (
                  <li key={`draft-${index}`} className="tf-draft">
                    <CornerDownRight size={14} aria-hidden="true" />
                    <span className="tf-sub-body">
                      <span className="tf-sub-title">{d.title}</span>
                      {d.description && <span className="tf-sub-desc">{d.description}</span>}
                    </span>
                    {d.assignee !== "inherit" && d.assignee !== "user" && <AgentBadge agentId={d.assignee} size={16} />}
                    <span className="tasks-chip">Se crea al guardar</span>
                    <button type="button" className="tf-icon" aria-label={`Quitar la subtarea ${d.title}`} onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}><X size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="tf-subform">
              <input
                aria-label="Nueva subtarea"
                value={newSub}
                maxLength={255}
                placeholder="Título de la subtarea"
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  e.stopPropagation();
                  void addSubtask();
                }}
              />
              <textarea aria-label="Descripción de la subtarea" rows={2} value={newSubDescription} placeholder="Descripción (opcional)" onChange={(e) => setNewSubDescription(e.target.value)} />
              <div className="tf-subform-row">
                <div className="tf-field">
                  <label htmlFor={`${id}-sa`}>Agente de la subtarea <small>(opcional)</small></label>
                  <AgentSelect id={`${id}-sa`} label="Agente de la subtarea" value={newSubAssignee} onChange={setNewSubAssignee} agents={agentChoices} inherit />
                </div>
                <button type="button" disabled={!newSub.trim() || addingSub} onClick={() => void addSubtask()}>
                  <Plus size={14} aria-hidden="true" /> Añadir subtarea
                </button>
              </div>
            </div>
            <p className="tf-help">{task ? "Se añade al momento. Después se edita desde la lista." : "Se crean junto con la tarea al guardar."}</p>
          </section>
        )}

        {error && <p className="tasks-error" role="alert">{error}</p>}
      </form>
    </DialogFrame>
  );
}
