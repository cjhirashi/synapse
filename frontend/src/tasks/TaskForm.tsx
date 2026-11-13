import { useId, useState } from "react";
import { CornerDownRight, ListChecks, Plus, User, X } from "lucide-react";
import AgentBadge from "../agents/AgentBadge";
import DialogFrame from "../editor/DialogFrame";
import { PRIORITY_LABEL, STATUS_LABEL, fromLocalInput, toLocalInput } from "./taskModel";
import type { Task, TaskInput, TaskPriority } from "./tasksApi";

interface Props {
  /** Tarea que se edita; sin ella, se crea una (raíz o, con `parent`, una subtarea). */
  task?: Task;
  parent?: Task;
  /** Subtareas ya guardadas de la tarea que se edita. */
  subtasks?: Task[];
  agents: string[];
  pathOptions: string[];
  accent: string;
  error: string | null;
  saving: boolean;
  /** En una tarea nueva, `drafts` son los títulos de las subtareas que se crean junto con ella. */
  onSave: (input: TaskInput & { title: string }, drafts: string[]) => void;
  /** Añade ya una subtarea a la tarea que se edita. */
  onAddSubtask?: (title: string) => Promise<void>;
  onCancel: () => void;
}

const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

/**
 * Alta y edición de una tarea o subtarea. La ruta es indicativa: se sugiere, pero se acepta cualquiera con forma válida.
 * Solo una tarea raíz tiene subtareas (dos niveles): una subtarea no muestra esa sección.
 */
export default function TaskForm({ task, parent, subtasks = [], agents, pathOptions, accent, error, saving, onSave, onAddSubtask, onCancel }: Props) {
  const id = useId();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [assignee, setAssignee] = useState(task ? (task.assignee_type === "agent" ? (task.assignee_agent_id ?? "user") : "user") : "user");
  const [due, setDue] = useState(toLocalInput(task?.due_at ?? null));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [path, setPath] = useState(task?.path ?? "");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [newSub, setNewSub] = useState("");
  const [addingSub, setAddingSub] = useState(false);

  // Un agente asignado que ya no está registrado sigue visible para poder cambiarlo.
  const agentChoices = Array.from(new Set([...agents, ...(task?.assignee_agent_id ? [task.assignee_agent_id] : [])]));
  const canSave = title.trim().length > 0 && !saving;
  const showSubtasks = !parent && !task?.parent_id;

  function submit() {
    if (!canSave) return;
    onSave(
      {
        title: title.trim(),
        description: description.trim() || null,
        notes: notes.trim() || null,
        priority,
        due_at: fromLocalInput(due),
        assignee_type: assignee === "user" ? "user" : "agent",
        assignee_agent_id: assignee === "user" ? null : assignee,
        path: path.trim() || null,
      },
      drafts,
    );
  }

  async function addSubtask() {
    const text = newSub.trim();
    if (!text || addingSub) return;
    if (task && onAddSubtask) {
      setAddingSub(true);
      try {
        await onAddSubtask(text);
        setNewSub("");
      } finally {
        setAddingSub(false);
      }
    } else {
      setDrafts((current) => [...current, text]);
      setNewSub("");
    }
  }

  const heading = task ? (task.parent_id ? "Editar subtarea" : "Editar tarea") : parent ? "Nueva subtarea" : "Nueva tarea";
  return (
    <DialogFrame
      role="dialog"
      titleId={`${id}-title`}
      title={heading}
      subtitle={parent ? `Dentro de «${parent.title}»` : undefined}
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
      <form className="tf" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="tf-field">
          <label htmlFor={`${id}-t`}>Título</label>
          <input id={`${id}-t`} autoFocus value={title} maxLength={255} placeholder="¿Qué hay que hacer?" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="tf-field">
          <label htmlFor={`${id}-d`}>Descripción</label>
          <textarea id={`${id}-d`} rows={3} value={description} placeholder="Detalles, criterios de terminado…" onChange={(e) => setDescription(e.target.value)} />
        </div>

        <fieldset className="tf-field">
          <legend>Asignada a</legend>
          <div className="tf-choices" role="radiogroup" aria-label="Asignada a">
            <label className="tf-choice">
              <input type="radio" name={`${id}-as`} value="user" checked={assignee === "user"} onChange={() => setAssignee("user")} />
              <span className="tf-choice-box">
                <span className="tf-me" aria-hidden="true"><User size={14} /></span>
                Yo
              </span>
            </label>
            {agentChoices.map((agent) => (
              <label key={agent} className="tf-choice">
                <input type="radio" name={`${id}-as`} value={agent} checked={assignee === agent} onChange={() => setAssignee(agent)} />
                <span className="tf-choice-box"><AgentBadge agentId={agent} size={24} /></span>
              </label>
            ))}
          </div>
          {agentChoices.length === 0 && <p className="tf-help">Para asignarla a un agente, regístralo en esta bóveda (Ajustes → Agentes por bóveda).</p>}
        </fieldset>

        <div className="tf-row">
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
            <label htmlFor={`${id}-v`}>Vence <small>(hora de la Ciudad de México)</small></label>
            <div className="tf-inline">
              <input id={`${id}-v`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
              {due && <button type="button" className="tf-icon" aria-label="Quitar la fecha de vencimiento" title="Quitar la fecha" onClick={() => setDue("")}><X size={14} /></button>}
            </div>
          </div>
        </div>

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
                    <span className="tf-sub-title">{s.title}</span>
                    {s.assignee_type === "agent" && s.assignee_agent_id && <AgentBadge agentId={s.assignee_agent_id} size={16} />}
                    <span className="tasks-chip" data-status={s.status}>{STATUS_LABEL[s.status]}</span>
                  </li>
                ))}
                {drafts.map((text, index) => (
                  <li key={`draft-${index}`} className="tf-draft">
                    <CornerDownRight size={14} aria-hidden="true" />
                    <span className="tf-sub-title">{text}</span>
                    <span className="tasks-chip">Se crea al guardar</span>
                    <button type="button" className="tf-icon" aria-label={`Quitar la subtarea ${text}`} onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}><X size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="tf-inline">
              <input
                aria-label="Nueva subtarea"
                value={newSub}
                maxLength={255}
                placeholder="Añadir una subtarea…"
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  e.stopPropagation();
                  void addSubtask();
                }}
              />
              <button type="button" disabled={!newSub.trim() || addingSub} onClick={() => void addSubtask()}>
                <Plus size={14} aria-hidden="true" /> Añadir subtarea
              </button>
            </div>
            <p className="tf-help">{task ? "Se añade al momento. Cada subtarea se asigna y se edita desde la lista." : "Se crean junto con la tarea al guardar."}</p>
          </section>
        )}

        {error && <p className="tasks-error" role="alert">{error}</p>}
      </form>
    </DialogFrame>
  );
}
