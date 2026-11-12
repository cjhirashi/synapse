import { useId, useState } from "react";
import { ListChecks } from "lucide-react";
import DialogFrame from "../editor/DialogFrame";
import { fromLocalInput, toLocalInput } from "./taskModel";
import type { Task, TaskInput, TaskPriority } from "./tasksApi";

interface Props {
  /** Tarea que se edita; sin ella, se crea una (raíz o, con `parent`, una subtarea). */
  task?: Task;
  parent?: Task;
  agents: string[];
  pathOptions: string[];
  accent: string;
  error: string | null;
  saving: boolean;
  onSave: (input: TaskInput & { title: string }) => void;
  onCancel: () => void;
}

/** Alta y edición de una tarea o subtarea. La ruta es indicativa: se sugiere, pero se acepta cualquiera con forma válida. */
export default function TaskForm({ task, parent, agents, pathOptions, accent, error, saving, onSave, onCancel }: Props) {
  const id = useId();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [assignee, setAssignee] = useState(task ? (task.assignee_type === "agent" ? (task.assignee_agent_id ?? "user") : "user") : "user");
  const [due, setDue] = useState(toLocalInput(task?.due_at ?? null));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [path, setPath] = useState(task?.path ?? "");

  // Un agente asignado que ya no está registrado sigue visible para poder cambiarlo.
  const agentChoices = Array.from(new Set([...agents, ...(task?.assignee_agent_id ? [task.assignee_agent_id] : [])]));
  const canSave = title.trim().length > 0 && !saving;

  function submit() {
    if (!canSave) return;
    onSave({
      title: title.trim(),
      description: description.trim() || null,
      notes: notes.trim() || null,
      priority,
      due_at: fromLocalInput(due),
      assignee_type: assignee === "user" ? "user" : "agent",
      assignee_agent_id: assignee === "user" ? null : assignee,
      path: path.trim() || null,
    });
  }

  const heading = task ? "Editar tarea" : parent ? "Nueva subtarea" : "Nueva tarea";
  return (
    <DialogFrame
      role="dialog"
      titleId={`${id}-title`}
      title={heading}
      subtitle={parent ? `Dentro de «${parent.title}»` : undefined}
      glyph={ListChecks}
      tone="accent"
      accent={accent}
      size="md"
      top
      backdropClosable={false}
      onCancel={onCancel}
      actions={
        <>
          <button type="button" onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={!canSave} onClick={submit}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <form className="tasks-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label htmlFor={`${id}-t`}>Título</label>
        <input id={`${id}-t`} autoFocus value={title} maxLength={255} onChange={(e) => setTitle(e.target.value)} />
        <label htmlFor={`${id}-d`}>Descripción</label>
        <textarea id={`${id}-d`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="tasks-form-row">
          <div>
            <label htmlFor={`${id}-a`}>Asignada a</label>
            <select id={`${id}-a`} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="user">Yo</option>
              {agentChoices.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-p`}>Prioridad</label>
            <select id={`${id}-p`} value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </div>
        </div>
        <label htmlFor={`${id}-v`}>Vence (hora de la Ciudad de México)</label>
        <input id={`${id}-v`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        <label htmlFor={`${id}-r`}>Ruta (documento o carpeta donde se trabaja; solo indicativa)</label>
        <input id={`${id}-r`} list={`${id}-paths`} value={path} maxLength={500} placeholder="Carpeta/Documento.md" onChange={(e) => setPath(e.target.value)} />
        <datalist id={`${id}-paths`}>{pathOptions.map((p) => <option key={p} value={p} />)}</datalist>
        {task && (
          <>
            <label htmlFor={`${id}-n`}>Notas de avance</label>
            <textarea id={`${id}-n`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </>
        )}
        {error && <p className="tasks-error" role="alert">{error}</p>}
      </form>
    </DialogFrame>
  );
}
